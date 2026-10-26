"""
Loading cards from the collection and turning them into what the study page
shows. This module only depends on `anki`, not `aqt`, so it can run on a
background thread and be tested without the GUI.
"""

from __future__ import annotations

import os
import re
from typing import Any

from anki.cards import Card
from anki.collection import Collection, SearchNode
from anki.consts import MODEL_CLOZE
from anki.sound import AV_REF_RE, SoundOrVideoTag

ANSWER_SPLIT_RE = re.compile(r"<hr\s+id\s*=\s*[\"']?answer[\"']?\s*/?>", re.I)
SOUND_RE = re.compile(r"\[sound:([^\]]+)\]")
TYPE_ANS_RE = re.compile(r"\[\[type:(?:(cloze|nc):)?([^\]]*)\]\]")
CLOZE_RE = re.compile(r"\{\{c\d+::(.*?)(?:::[^}]*)?\}\}", re.S)
FONT_FACE_RE = re.compile(r"@font-face\s*\{[^}]*\}", re.I)
IMPORT_RE = re.compile(r"@import\s+[^;]+;", re.I)


def build_search(col: Collection, deck_name: str, conf: dict[str, Any]) -> str:
    parts: list[str | SearchNode] = [SearchNode(deck=deck_name)]
    if not conf.get("include_suspended"):
        parts.append("-is:suspended")
    extra = (conf.get("search_filter") or "").strip()
    if extra:
        parts.append(extra)
    return col.build_search_string(*parts)


def _av_indices(text: str) -> list[int]:
    return [int(m.group(3)) for m in AV_REF_RE.finditer(text)]


def _field_audio(text: str) -> list[SoundOrVideoTag]:
    # basename only: never let a deck point the player at arbitrary paths
    return [SoundOrVideoTag(filename=os.path.basename(n)) for n in SOUND_RE.findall(text)]


def _type_answers(card: Card, text: str, answer_side: bool) -> str:
    """Replace {{type:Field}} placeholders.

    On the front they're removed (there's nothing to type into). On the back,
    Anki's reviewer shows the field through its typed-answer comparison, so
    with the placeholder simply removed a "type in the answer" card would have
    an empty back. Show the field's contents instead.
    """
    if not answer_side:
        return TYPE_ANS_RE.sub("", text)
    note = card.note()

    def repl(m: re.Match) -> str:
        kind, field = m.group(1), m.group(2)
        if kind == "cloze" or field not in note.keys():
            return ""  # cloze answers are already revealed in the text
        return f'<div class="qz-typed">{note[field]}</div>'

    return TYPE_ANS_RE.sub(repl, text)


def _clean(col: Collection, html: str) -> str:
    html = AV_REF_RE.sub("", html)
    html = SOUND_RE.sub("", html)
    return col.media.escape_media_filenames(html)


def _strip_cloze(text: str) -> str:
    return CLOZE_RE.sub(r"\1", text)


def card_payload(
    col: Collection, card: Card, conf: dict[str, Any]
) -> tuple[dict, dict, bool]:
    """Return (data for the page, audio tags kept in Python, whether the
    chosen fields were used) for one card."""
    note = card.note()
    notetype = card.note_type()
    front_field = conf.get("front_field") or ""
    back_field = conf.get("back_field") or ""
    keys = note.keys()

    used_fields = (
        conf.get("content_mode") == "fields"
        and front_field in keys
        and back_field in keys
    )
    if used_fields:
        q_raw, a_raw = note[front_field], note[back_field]
        q_audio, a_audio = _field_audio(q_raw), _field_audio(a_raw)
        q_html = _clean(col, _strip_cloze(q_raw))
        a_html = _clean(col, _strip_cloze(a_raw))
        q_label, a_label = front_field, back_field
    else:
        out = card.render_output(reload=True)
        q_text = out.question_text
        parts = ANSWER_SPLIT_RE.split(out.answer_text, maxsplit=1)
        a_text = parts[1] if len(parts) > 1 else out.answer_text
        q_audio = [out.question_av_tags[i] for i in _av_indices(q_text) if i < len(out.question_av_tags)]
        a_audio = [out.answer_av_tags[i] for i in _av_indices(a_text) if i < len(out.answer_av_tags)]
        q_html = _clean(col, _type_answers(card, q_text, False))
        a_html = _clean(col, _type_answers(card, a_text, True))
        q_label, a_label = "Front", "Back"

    data = {
        "id": card.id,
        "nid": card.nid,
        "ord": card.ord,
        "css": str(notetype["id"]),
        "q": q_html,
        "a": a_html,
        "qLabel": q_label,
        "aLabel": a_label,
        "qAudio": bool(q_audio),
        "aAudio": bool(a_audio),
    }
    return data, {"q": q_audio, "a": a_audio}, used_fields


def collect_cards(col: Collection, deck_name: str, conf: dict[str, Any]) -> dict:
    query = build_search(col, deck_name, conf)
    cards = [col.get_card(cid) for cid in col.find_cards(query)]
    cards.sort(key=lambda c: (c.nid, c.ord))

    if conf.get("one_card_per_note"):
        # Each cloze card has different content, so only collapse siblings of
        # standard note types (e.g. a "Basic (and reversed)" pair).
        seen: set[int] = set()
        unique = []
        for card in cards:
            if card.note_type()["type"] == MODEL_CLOZE:
                unique.append(card)
            elif card.nid not in seen:
                seen.add(card.nid)
                unique.append(card)
        cards = unique

    out_cards: list[dict] = []
    css_by_type: dict[str, str] = {}
    audio: dict[int, dict[str, list]] = {}
    fallbacks = 0
    use_fields = conf.get("content_mode") == "fields"

    field_nids: set[int] = set()
    for card in cards:
        if card.nid in field_nids:
            continue  # sibling of a note already shown by its fields: identical
        notetype = card.note_type()
        key = str(notetype["id"])
        if key not in css_by_type:
            css_by_type[key] = notetype.get("css", "")
        data, tags, used_fields = card_payload(col, card, conf)
        if used_fields:
            field_nids.add(card.nid)
        elif use_fields:
            fallbacks += 1
        if tags["q"] or tags["a"]:
            audio[card.id] = tags
        out_cards.append(data)

    return {
        "cards": out_cards,
        "css": {k: IMPORT_RE.sub("", v) for k, v in css_by_type.items()},
        "documentCss": document_css(css_by_type.values()),
        "audio": audio,
        "fallbacks": fallbacks,
    }


def document_css(sheets: Any) -> str:
    """Rules that must live in the main document rather than per card.

    Fonts declared inside a shadow root are ignored by the browser, and
    @import is only valid at the top of a stylesheet, so both are lifted out
    of the note types' CSS and placed in the page head.
    """
    imports: list[str] = []
    faces: list[str] = []
    for css in sheets:
        for rule in IMPORT_RE.findall(css):
            if rule not in imports:
                imports.append(rule)
        for rule in FONT_FACE_RE.findall(css):
            if rule not in faces:
                faces.append(rule)
    return "\n".join(imports + faces)
