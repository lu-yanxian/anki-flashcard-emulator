"""
Anki Flashcard Emulator.

Opens any deck as Quizlet-style study modes: Flashcards (flip and sort into
"Know" / "Still learning"), Learn (adaptive multiple choice, then typed
answers), Write (typed answers) and Match (a timed matching game), with a card
picker for choosing which cards a session uses.

Nothing here touches Anki's scheduling: reviews, due dates and stats are left
exactly as they were. The only change it can make to your collection is the
optional "still learning" tag, which you turn on in Options.
"""

from __future__ import annotations

import copy
import json
import os
import time
from typing import Any

from anki.collection import OpChanges
from anki.utils import ids2str
from aqt import dialogs, gui_hooks, mw
from aqt.operations import CollectionOp, QueryOp
from aqt.qt import (
    QButtonGroup,
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QHBoxLayout,
    QKeyEvent,
    QLabel,
    QLineEdit,
    QMenu,
    QRadioButton,
    QVBoxLayout,
    QTimer,
    QWidget,
    Qt,
    qconnect,
)
from aqt.sound import av_player
from aqt.utils import restoreGeom, saveGeom, showWarning, tooltip
from aqt.webview import AnkiWebView

from .cards import build_search, card_payload, collect_cards

ADDON_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ADDON_DIR, "web")
USER_DIR = os.path.join(ADDON_DIR, "user_files")
MODULE = __name__

DEFAULTS: dict[str, Any] = {
    "last_deck": "",
    "content_mode": "templates",
    "front_field": "",
    "back_field": "",
    "search_filter": "",
    "one_card_per_note": True,
    "include_suspended": False,
    "tag_name": "quizlet::still-learning",
    "study": {
        "shuffle": False,
        "start_side": "front",
        "track_progress": True,
        "starred_only": False,
        "front_size": 180,
        "back_size": 140,
        "mode": "flashcards",
        "match_pairs": 6,
        "choose_on_open": True,
        "autoplay_audio": False,
        "theme": "classic",
        "effects": {},
        "sapporo_dark": False,
        "learn_types": "both",
        "any_line": True,
        "auto_advance": True,
        "tag_still_learning": False,
    },
}

# Keep open viewers alive (Qt would otherwise garbage-collect them).
_open_viewers: list["FlashcardViewer"] = []


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


def get_config() -> dict[str, Any]:
    conf = copy.deepcopy(DEFAULTS)
    stored = mw.addonManager.getConfig(MODULE) or {}
    for key, value in stored.items():
        if key == "study" and isinstance(value, dict):
            conf["study"].update(value)
        else:
            conf[key] = value
    return conf


def write_config(conf: dict[str, Any]) -> None:
    mw.addonManager.writeConfig(MODULE, conf)


# ---------------------------------------------------------------------------
# Saved data: stars, selections, best Match times
#
# Card and deck ids are only unique within one collection, so everything is
# kept per Anki profile (user_files/<profile>/...). Selections and best times
# are keyed by deck id so they survive renaming a deck.
# ---------------------------------------------------------------------------


def _profile_dir() -> str:
    name = (mw.pm.name if mw.pm else None) or "default"
    safe = "".join(ch if ch.isalnum() or ch in " -_." else "_" for ch in name).strip() or "default"
    return os.path.join(USER_DIR, safe)


def _read_json(name: str) -> dict:
    for path in (os.path.join(_profile_dir(), name), os.path.join(USER_DIR, name)):
        # second path: files written by the first version, before profiles
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else {}
        except FileNotFoundError:
            continue
        except (OSError, ValueError):
            return {}
    return {}


def _write_json(name: str, data: dict) -> None:
    folder = _profile_dir()
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def _deck_entry(data: dict, did: int, deck_name: str) -> Any:
    return data.get(str(did), data.get(deck_name))


def load_stars() -> set[int]:
    try:
        return {int(c) for c in _read_json("stars.json").get("cids", [])}
    except (ValueError, TypeError):
        return set()


def save_stars(stars: set[int]) -> None:
    _write_json("stars.json", {"cids": sorted(stars)})


def load_selection(did: int, deck_name: str) -> list[int]:
    ids = _deck_entry(_read_json("selections.json"), did, deck_name)
    try:
        return [int(i) for i in ids] if isinstance(ids, list) else []
    except (ValueError, TypeError):
        return []


def save_selection(did: int, deck_name: str, cids: list[int]) -> None:
    data = _read_json("selections.json")
    data.pop(deck_name, None)
    if cids:
        data[str(did)] = sorted(set(cids))
    else:
        data.pop(str(did), None)
    _write_json("selections.json", data)


def load_match_best(did: int, deck_name: str) -> dict[str, float]:
    entry = _deck_entry(_read_json("match_best.json"), did, deck_name)
    if not isinstance(entry, dict):
        return {}
    try:
        return {str(k): float(v) for k, v in entry.items()}
    except (ValueError, TypeError):
        return {}


def save_match_best(did: int, deck_name: str, pairs: str, seconds: float) -> None:
    data = _read_json("match_best.json")
    entry = load_match_best(did, deck_name)
    old = entry.get(pairs)
    if old is None or seconds < old:
        entry[pairs] = seconds
        data.pop(deck_name, None)
        data[str(did)] = entry
        _write_json("match_best.json", data)


def load_match_history(did: int) -> list:
    entry = _read_json("match_history.json").get(str(did), [])
    return [e for e in entry if isinstance(e, list) and len(e) == 3] if isinstance(entry, list) else []


def add_match_history(did: int, pairs: int, seconds: float) -> None:
    data = _read_json("match_history.json")
    entry = load_match_history(did)
    entry.append([pairs, seconds, int(time.time())])
    data[str(did)] = entry[-40:]
    _write_json("match_history.json", data)


SIZE_KEYS = ("front_size", "back_size")


def load_deck_sizes(did: int) -> dict:
    entry = _read_json("deck_sizes.json").get(str(did))
    if not isinstance(entry, dict):
        return {}
    out = {}
    for key, lo, hi in (("front_size", 60, 500), ("back_size", 60, 500)):
        try:
            out[key] = min(hi, max(lo, int(entry[key])))
        except (KeyError, ValueError, TypeError):
            pass
    return out


def save_deck_sizes(did: int, sizes: dict) -> None:
    data = _read_json("deck_sizes.json")
    data[str(did)] = {k: int(sizes[k]) for k in SIZE_KEYS if k in sizes}
    _write_json("deck_sizes.json", data)


def load_session(did: int) -> dict | None:
    entry = _read_json("sessions.json").get(str(did))
    return entry if isinstance(entry, dict) else None


def save_session(did: int, session: dict | None) -> None:
    data = _read_json("sessions.json")
    if session:
        session["ts"] = int(time.time())
        data[str(did)] = session
    else:
        data.pop(str(did), None)
    _write_json("sessions.json", data)


# Per-card results across sessions: {cid: [misses, times seen, correct streak]}
def load_history() -> dict[str, list]:
    data = _read_json("history.json").get("cards", {})
    return data if isinstance(data, dict) else {}


def save_history(cards: dict[str, list]) -> None:
    _write_json("history.json", {"cards": cards})


# ---------------------------------------------------------------------------
# Setup dialog
# ---------------------------------------------------------------------------


class SetupDialog(QDialog):
    def __init__(self, preselect_deck_id: int | None = None) -> None:
        super().__init__(mw)
        self.setWindowTitle("Flashcard Emulator")
        self.setMinimumWidth(460)
        self.conf = get_config()

        layout = QVBoxLayout(self)
        form = QFormLayout()
        layout.addLayout(form)

        self.deck_combo = QComboBox()
        decks = mw.col.decks.all_names_and_ids(skip_empty_default=True, include_filtered=True)
        self.deck_names = [d.name for d in decks]
        self.deck_combo.addItems(self.deck_names)
        target = None
        if preselect_deck_id:
            target = mw.col.decks.name_if_exists(preselect_deck_id)
        target = target or self.conf.get("last_deck") or mw.col.decks.current()["name"]
        if target in self.deck_names:
            self.deck_combo.setCurrentIndex(self.deck_names.index(target))
        form.addRow("Deck", self.deck_combo)

        self.search_edit = QLineEdit(self.conf.get("search_filter", ""))
        self.search_edit.setPlaceholderText("Optional, e.g. tag:lesson3 or -is:new")
        form.addRow("Extra search", self.search_edit)

        self.one_per_note = QCheckBox("One card per note (skip reverse / sibling cards)")
        self.one_per_note.setChecked(bool(self.conf["one_card_per_note"]))
        self.include_susp = QCheckBox("Include suspended cards")
        self.include_susp.setChecked(bool(self.conf["include_suspended"]))
        form.addRow("", self.one_per_note)
        form.addRow("", self.include_susp)

        self.mode_templates = QRadioButton("Show cards as Anki renders them (templates)")
        self.mode_fields = QRadioButton("Pick one field for each side")
        group = QButtonGroup(self)
        group.addButton(self.mode_templates)
        group.addButton(self.mode_fields)
        if self.conf["content_mode"] == "fields":
            self.mode_fields.setChecked(True)
        else:
            self.mode_templates.setChecked(True)
        mode_box = QVBoxLayout()
        mode_box.addWidget(self.mode_templates)
        mode_box.addWidget(self.mode_fields)
        mode_widget = QWidget()
        mode_widget.setLayout(mode_box)
        mode_box.setContentsMargins(0, 0, 0, 0)
        form.addRow("Card content", mode_widget)

        self.front_combo = QComboBox()
        self.back_combo = QComboBox()
        fields_row = QHBoxLayout()
        fields_row.addWidget(QLabel("Front"))
        fields_row.addWidget(self.front_combo, 1)
        fields_row.addWidget(QLabel("Back"))
        fields_row.addWidget(self.back_combo, 1)
        self.fields_widget = QWidget()
        self.fields_widget.setLayout(fields_row)
        fields_row.setContentsMargins(0, 0, 0, 0)
        form.addRow("", self.fields_widget)

        self.note_label = QLabel(
            "Study sessions here don't affect Anki's scheduling or review history."
        )
        self.note_label.setWordWrap(True)
        self.note_label.setStyleSheet("color: gray;")
        layout.addWidget(self.note_label)

        buttons = QDialogButtonBox()
        self.start_btn = buttons.addButton("Start", QDialogButtonBox.ButtonRole.AcceptRole)
        buttons.addButton(QDialogButtonBox.StandardButton.Cancel)
        qconnect(buttons.accepted, self.accept)
        qconnect(buttons.rejected, self.reject)
        layout.addWidget(buttons)

        qconnect(self.deck_combo.currentIndexChanged, lambda _: self.refresh_fields())
        qconnect(self.mode_fields.toggled, lambda _: self.update_enabled())
        self.refresh_fields()
        self.update_enabled()

    def refresh_fields(self) -> None:
        col = mw.col
        did = col.decks.id_for_name(self.deck_combo.currentText())
        names: list[str] = []
        if did:
            dids = col.decks.deck_and_child_ids(did)
            mids = col.db.list(
                "select distinct n.mid from cards c join notes n on c.nid = n.id "
                f"where c.did in {ids2str(dids)} or c.odid in {ids2str(dids)}"
            )
            for mid in mids:
                notetype = col.models.get(mid)
                if not notetype:
                    continue
                for fld in notetype["flds"]:
                    if fld["name"] not in names:
                        names.append(fld["name"])
        for combo, saved, default_idx in (
            (self.front_combo, self.conf.get("front_field"), 0),
            (self.back_combo, self.conf.get("back_field"), 1),
        ):
            current = combo.currentText() or saved
            combo.blockSignals(True)
            combo.clear()
            combo.addItems(names)
            if current in names:
                combo.setCurrentIndex(names.index(current))
            elif len(names) > default_idx:
                combo.setCurrentIndex(default_idx)
            combo.blockSignals(False)

    def update_enabled(self) -> None:
        self.fields_widget.setEnabled(self.mode_fields.isChecked())

    def accept(self) -> None:
        deck_name = self.deck_combo.currentText()
        if not deck_name:
            return
        conf = self.conf
        conf["last_deck"] = deck_name
        conf["search_filter"] = self.search_edit.text().strip()
        conf["one_card_per_note"] = self.one_per_note.isChecked()
        conf["include_suspended"] = self.include_susp.isChecked()
        conf["content_mode"] = "fields" if self.mode_fields.isChecked() else "templates"
        conf["front_field"] = self.front_combo.currentText()
        conf["back_field"] = self.back_combo.currentText()
        if conf["content_mode"] == "fields" and conf["front_field"] == conf["back_field"]:
            showWarning("Pick two different fields for the front and back.", parent=self)
            return
        try:
            build_search(mw.col, deck_name, conf)
        except Exception as err:  # invalid search syntax
            showWarning(f"The extra search couldn't be read:\n{err}", parent=self)
            return
        write_config(conf)
        super().accept()
        start_session(deck_name, conf)


# ---------------------------------------------------------------------------
# Viewer window
# ---------------------------------------------------------------------------


def _read_web(name: str) -> str:
    with open(os.path.join(WEB_DIR, name), encoding="utf-8") as f:
        return f.read()


def _json_for_script(data: Any) -> str:
    # Safe to embed inside <script>: no "</script>" or HTML comment openers.
    return (
        json.dumps(data, ensure_ascii=False)
        .replace("</", "<\\/")
        .replace("<!--", "<\\u0021--")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


class FlashcardViewer(QDialog):
    GEOM_KEY = "quizlet_emulator_viewer"

    def __init__(self, deck_name: str, payload: dict, conf: dict[str, Any]) -> None:
        super().__init__(None, Qt.WindowType.Window)
        self.silentlyClose = True  # let Anki close it when the profile unloads
        self.setWindowTitle(f"Flashcard Emulator: {deck_name}")
        self.conf = conf
        self.deck_name = deck_name
        self.deck_id = int(mw.col.decks.id_for_name(deck_name) or 0)
        self.audio: dict[int, dict[str, list]] = payload.pop("audio")
        self.loaded_ids = {c["id"] for c in payload["cards"]}
        self.cards_by_id = {c["id"]: c for c in payload["cards"]}
        self.edited: set[int] = set()  # cards opened in Browse from here
        self._closed = False

        # results history, saved in the background
        self.history = load_history()
        self._hist_undo: dict[int, Any] = {}
        self._hist_timer = QTimer(self)
        self._hist_timer.setSingleShot(True)
        qconnect(self._hist_timer.timeout, self._save_history)

        # optional "still learning" tag: desired state per note, applied in batches
        self._tag_want: dict[int, bool] = {}
        self._tag_undo: dict[int, Any] = {}
        self._tag_timer = QTimer(self)
        self._tag_timer.setSingleShot(True)
        qconnect(self._tag_timer.timeout, self._flush_tags)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        self.web = AnkiWebView(parent=self, title="quizlet_emulator")
        self.web.set_bridge_command(self.on_bridge, self)
        layout.addWidget(self.web)

        self.resize(1000, 760)
        restoreGeom(self, self.GEOM_KEY)

        data = {
            "deckName": deck_name,
            "cards": payload["cards"],
            "css": payload["css"],
            "night": False,  # set by the chosen theme (viewer.js applyTheme)
            "settings": conf["study"],
            "stars": sorted(load_stars() & self.loaded_ids),
            "matchBest": load_match_best(self.deck_id, deck_name),
            "selection": [
                cid for cid in load_selection(self.deck_id, deck_name) if cid in self.loaded_ids
            ],
            "history": {
                str(cid): self.history[str(cid)] for cid in self.loaded_ids if str(cid) in self.history
            },
            "session": load_session(self.deck_id),
            "deckSizes": load_deck_sizes(self.deck_id),
            "matchHistory": load_match_history(self.deck_id),
            "tagName": conf.get("tag_name") or DEFAULTS["tag_name"],
            "baseUrl": mw.serverURL(),
            "mathjax": True,
            "documentCss": payload["documentCss"],
        }
        font_base = f"/_addons/{mw.addonManager.addonFromModule(MODULE)}/web/fonts/"
        head = (
            f"<style>{payload['documentCss']}</style>"
            f"<style>{_read_web('fonts/fonts.css').replace('__FONTBASE__', font_base)}</style>"
            f"<style>{_read_web('viewer.css')}</style>"
            f"<style>{_read_web('themes.css')}</style>"
        )
        body = (
            _read_web("viewer.html")
            + f"<script>window.QZ_DATA = {_json_for_script(data)};</script>"
            + "".join(
                f"<script>{_read_web(name)}</script>"
                for name in ("hanzi_fold.js", "answers.js", "study.js", "effects.js", "viewer.js")
            )
        )
        self.web.stdHtml(body, css=[], js=[], head=head, context=self, default_css=False)
        _open_viewers.append(self)
        self.show()
        self.activateWindow()

    # Messages from the page: "qz:<action>:<args>"
    def on_bridge(self, cmd: str) -> Any:
        if not cmd.startswith("qz:") or self._closed or not mw.col:
            return None
        _, action, arg = (cmd.split(":", 2) + [""])[:3]
        try:
            self._handle(action, arg)
        except (ValueError, TypeError, KeyError):
            pass  # malformed message from the page; ignore it
        return None

    def _handle(self, action: str, arg: str) -> None:
        if action == "settings":
            # text sizes are kept per deck (decksize), not in the shared settings
            new = {k: v for k, v in json.loads(arg).items() if k not in SIZE_KEYS}
            self.conf["study"].update(new)
            conf = get_config()
            conf["study"].update(new)
            write_config(conf)
        elif action == "star":
            cid_str, _, state = arg.partition(":")
            cid = int(cid_str)
            stars = load_stars()  # re-read in case another window changed it
            if state == "1":
                stars.add(cid)
            else:
                stars.discard(cid)
            save_stars(stars)
        elif action == "play":
            cid_str, _, side = arg.partition(":")
            tags = self.audio.get(int(cid_str), {}).get(side, [])
            if tags:
                av_player.play_tags(tags)
        elif action == "stopaudio":
            av_player.stop_and_clear_queue()
        elif action == "matchbest":
            pairs, _, secs = arg.partition(":")
            save_match_best(self.deck_id, self.deck_name, str(int(pairs)), round(float(secs), 1))
        elif action == "selection":
            cids = [int(c) for c in json.loads(arg)]
            # keep chosen cards that this session's search didn't load
            kept = [
                c for c in load_selection(self.deck_id, self.deck_name) if c not in self.loaded_ids
            ]
            save_selection(self.deck_id, self.deck_name, kept + cids)
        elif action == "matchtime":
            pairs, _, secs = arg.partition(":")
            add_match_history(self.deck_id, int(pairs), round(float(secs), 1))
        elif action == "decksize":
            save_deck_sizes(self.deck_id, json.loads(arg))
        elif action == "session":
            save_session(self.deck_id, json.loads(arg) if arg and arg != "null" else None)
        elif action == "result":
            # result:<cid>:<1 known | 0 missed>:<1 if the tag may come off>
            cid_s, ok_s, untag_s = (arg.split(":") + ["0", "0"])[:3]
            self._record(int(cid_s), ok_s == "1", untag_s == "1")
        elif action == "unresult":
            self._unrecord(int(arg))
        elif action == "edit":
            cid = int(arg)
            self.edited.add(cid)
            dialogs.open("Browser", mw, search=(f"cid:{cid}",))

    # ---- results history and the optional tag

    def _record(self, cid: int, ok: bool, untag: bool) -> None:
        key = str(cid)
        prev = self.history.get(key)
        miss, seen, streak = (prev or [0, 0, 0])[:3]
        seen += 1
        if ok:
            streak += 1
        else:
            miss += 1
            streak = 0
        self.history[key] = [miss, seen, streak]
        self._hist_undo[cid] = prev
        self._hist_timer.start(1500)

        if self.conf["study"].get("tag_still_learning") and cid in self.cards_by_id:
            nid = self.cards_by_id[cid]["nid"]
            self._tag_undo[cid] = (nid, self._tag_want.get(nid))
            if not ok:
                self._tag_want[nid] = True
            elif untag:
                self._tag_want[nid] = False
            self._tag_timer.start(1200)

    def _unrecord(self, cid: int) -> None:
        key = str(cid)
        if cid in self._hist_undo:
            prev = self._hist_undo.pop(cid)
            if prev is None:
                self.history.pop(key, None)
            else:
                self.history[key] = prev
            self._hist_timer.start(1500)
        if cid in self._tag_undo:
            nid, want = self._tag_undo.pop(cid)
            if want is None:
                self._tag_want.pop(nid, None)
            else:
                self._tag_want[nid] = want
            self._tag_timer.start(1200)

    def _save_history(self) -> None:
        try:
            on_disk = load_history()
            on_disk.update(self.history)  # keep other decks' entries from other windows
            save_history(on_disk)
        except OSError:
            pass

    def _flush_tags(self, now: bool = False) -> None:
        """Apply pending tag changes. `now` runs them straight away on this
        thread: used when the window closes, since Anki may be closing the
        collection right after."""
        if not self._tag_want or not mw.col:
            return
        tag = self.conf.get("tag_name") or DEFAULTS["tag_name"]
        want = dict(self._tag_want)
        self._tag_want.clear()
        self._tag_undo.clear()

        def op(col):
            add, remove = [], []
            for nid, on in want.items():
                try:
                    has = col.get_note(nid).has_tag(tag)
                except Exception:
                    continue
                if on and not has:
                    add.append(nid)
                elif not on and has:
                    remove.append(nid)
            if not add and not remove:
                return OpChanges()
            pos = col.add_custom_undo_entry("Flashcard Emulator: still-learning tag")
            if add:
                col.tags.bulk_add(add, tag)
            if remove:
                col.tags.bulk_remove(remove, tag)
            return col.merge_undo_entries(pos)

        if now:
            try:
                op(mw.col)
            except Exception:
                pass
            return
        CollectionOp(parent=mw, op=op).run_in_background(initiator=self)

    # Edits made in Browse show up here without reopening the window.
    def refresh_edited(self) -> None:
        if self._closed or not self.edited or not mw.col:
            return
        conf = get_config()
        conf["study"] = self.conf["study"]
        for key in ("content_mode", "front_field", "back_field"):
            conf[key] = self.conf[key]
        updates = []
        for cid in list(self.edited):
            try:
                card = mw.col.get_card(cid)
            except Exception:  # deleted since
                self.edited.discard(cid)
                continue
            data, tags, _ = card_payload(mw.col, card, conf)
            self.audio[cid] = tags
            updates.append(data)
        if updates:
            self.web.eval(f"window.qzUpdateCards && window.qzUpdateCards({_json_for_script(updates)});")

    # Esc belongs to the page (closing panels); never let it close the window.
    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802
        if event.key() == Qt.Key.Key_Escape:
            event.accept()
            return
        super().keyPressEvent(event)

    def reject(self) -> None:
        # Qt calls this for Esc and for the close button alike. Esc is already
        # kept from getting here (keyPressEvent and the page), so whatever
        # arrives is a real request to close.
        self.close()

    def closeEvent(self, event: Any) -> None:  # noqa: N802 (Qt naming)
        if not self._closed:
            if self._hist_timer.isActive():
                self._hist_timer.stop()
                self._save_history()
            if self._tag_timer.isActive():
                self._tag_timer.stop()
                self._flush_tags(now=True)
            self._closed = True
            av_player.stop_and_clear_queue()
            saveGeom(self, self.GEOM_KEY)
            self.web.cleanup()
            if self in _open_viewers:
                _open_viewers.remove(self)
        # Accept directly: QDialog's own closeEvent routes through reject(),
        # which used to leave the window open and blank.
        event.accept()
        self.deleteLater()


# ---------------------------------------------------------------------------
# Entry points and hooks
# ---------------------------------------------------------------------------


def start_session(deck_name: str, conf: dict[str, Any]) -> None:
    def on_done(payload: dict) -> None:
        if not payload["cards"]:
            tooltip("No cards matched that deck and search.", parent=mw)
            return
        if payload["fallbacks"]:
            tooltip(
                f"{payload['fallbacks']} card(s) didn't have both chosen fields, "
                "so they're shown with their templates instead.",
                period=5000,
                parent=mw,
            )
        FlashcardViewer(deck_name, payload, conf)

    def on_fail(err: Exception) -> None:
        showWarning(f"Couldn't load the deck:\n{err}")

    QueryOp(
        parent=mw,
        op=lambda col: collect_cards(col, deck_name, conf),
        success=on_done,
    ).failure(on_fail).with_progress("Preparing flashcards…").run_in_background()


def open_setup(deck_id: int | None = None) -> None:
    if not mw.col:
        return
    SetupDialog(deck_id).exec()


def on_deck_options_menu(menu: QMenu, deck_id: int) -> None:
    action = menu.addAction("Flashcard Emulator…")
    qconnect(action.triggered, lambda: open_setup(deck_id))


def on_operation(changes: Any, handler: Any) -> None:
    if getattr(changes, "note_text", False):
        for viewer in list(_open_viewers):
            viewer.refresh_edited()


def on_profile_close() -> None:
    # The collection is about to close; viewers can't work without it.
    for viewer in list(_open_viewers):
        viewer.close()


def setup() -> None:
    # lets the study window load the bundled theme fonts from Anki's web server
    mw.addonManager.setWebExports(MODULE, r"web/fonts/.*\.woff2")
    action = mw.form.menuTools.addAction("Flashcard Emulator…")
    qconnect(action.triggered, lambda: open_setup())
    gui_hooks.deck_browser_will_show_options_menu.append(on_deck_options_menu)
    gui_hooks.operation_did_execute.append(on_operation)
    gui_hooks.profile_will_close.append(on_profile_close)


setup()
