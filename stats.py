"""
Statistics: what the Stats screen shows, worked out from two records.

- The answer history (user_files/<profile>/history.json), kept for every card
  whether statistics are on or not: [misses, times seen, correct streak].
  A card counts as learned once its streak reaches LEARNED_STREAK, the same
  rule Learn uses; a miss sets the streak back to 0.
- The daily log (stats.json), kept only while statistics are on:
  {"days": {"2026-11-11": {"<deck id>": {...counters...}}}}

Counters for one deck on one day:
  a  cards answered        c  answered right       s  seconds studied
  n  study sessions        l  cards newly learned  g  Match games played
  m  answers per mode: {"flashcards": n, "learn": n, "write": n}

This module only depends on `anki`, not `aqt`.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from anki.collection import Collection, SearchNode

LEARNED_STREAK = 2
COUNTERS = ("a", "c", "s", "n", "l", "g")
MODES = ("flashcards", "learn", "write")
HEATMAP_DAYS = 26 * 7


def today() -> str:
    return dt.date.today().isoformat()


def merge_delta(days: dict, delta: dict) -> dict:
    """Add a {date: {did: counters}} delta into the stored days, in place."""
    for date, decks in delta.items():
        day = days.setdefault(date, {})
        for did, counters in decks.items():
            rec = day.setdefault(did, {})
            for key, value in counters.items():
                if key == "m":
                    modes = rec.setdefault("m", {})
                    for mode, n in value.items():
                        modes[mode] = max(0, modes.get(mode, 0) + n)
                else:
                    rec[key] = max(0, round(rec.get(key, 0) + value, 1))
    return days


def _sum(records: list[dict]) -> dict:
    out: dict[str, Any] = {k: 0 for k in COUNTERS}
    out["m"] = {m: 0 for m in MODES}
    for rec in records:
        for k in COUNTERS:
            out[k] += rec.get(k, 0)
        for m, n in (rec.get("m") or {}).items():
            if m in out["m"]:
                out["m"][m] += n
    return out


def _classify(entry: list | None) -> str:
    if not entry or len(entry) < 3 or not entry[1]:
        return "new"
    return "learned" if entry[2] >= LEARNED_STREAK else "learning"


def _is_trouble(entry: list | None) -> bool:
    return bool(entry) and len(entry) >= 3 and entry[0] >= 2 and entry[2] < 3


def _deck_cards(col: Collection, deck_name: str, include_suspended: bool) -> list[int]:
    parts: list[Any] = [SearchNode(deck=deck_name)]
    if not include_suspended:
        parts.append("-is:suspended")
    return list(col.find_cards(col.build_search_string(*parts)))


def _card_counts(cids: list[int], hist: dict) -> dict:
    counts = {"total": len(cids), "learned": 0, "learning": 0, "new": 0, "trouble": 0}
    for cid in cids:
        entry = hist.get(str(cid))
        counts[_classify(entry)] += 1
        if _is_trouble(entry):
            counts["trouble"] += 1
    return counts


def _streaks(active: set[str], now: dt.date) -> tuple[int, int]:
    """(current, longest) runs of consecutive study days. The current run
    still counts if today hasn't been studied yet but yesterday was."""
    if not active:
        return 0, 0
    current = 0
    day = now if now.isoformat() in active else now - dt.timedelta(days=1)
    while day.isoformat() in active:
        current += 1
        day -= dt.timedelta(days=1)
    longest = run = 0
    prev = None
    for d in sorted(dt.date.fromisoformat(x) for x in active):
        run = run + 1 if prev and (d - prev).days == 1 else 1
        longest = max(longest, run)
        prev = d
    return current, longest


def build_stats(
    col: Collection,
    days: dict,
    hist: dict,
    deck_id: int | None,
    include_suspended: bool = False,
    match_best: dict | None = None,
    tracking: bool = True,
) -> dict:
    """Everything the Stats screen needs, for one deck (with its subdecks) or,
    when deck_id is None, for all decks together."""
    now = dt.date.today()
    if deck_id:
        deck_name = col.decks.name_if_exists(deck_id) or ""
        scope_dids = {str(d) for d in col.decks.deck_and_child_ids(deck_id)}
    else:
        deck_name = ""
        scope_dids = None

    def day_total(date: str) -> dict:
        recs = days.get(date) or {}
        chosen = [r for did, r in recs.items() if scope_dids is None or did in scope_dids]
        return _sum(chosen)

    all_dates = sorted(days)
    per_day = {d: day_total(d) for d in all_dates}
    active = {d for d, t in per_day.items() if t["a"] or t["s"] >= 30 or t["g"]}
    total = _sum(list(per_day.values()))

    def window(n: int) -> dict:
        start = (now - dt.timedelta(days=n - 1)).isoformat()
        return _sum([t for d, t in per_day.items() if d >= start])

    last30, last7 = window(30), window(7)
    current, longest = _streaks(active, now)

    series = []
    for i in range(HEATMAP_DAYS - 1, -1, -1):
        d = (now - dt.timedelta(days=i)).isoformat()
        t = per_day.get(d) or _sum([])
        series.append([d, t["a"], t["c"], round(t["s"]), t["g"]])

    # cards: this deck's cards, or every card that still exists for all decks
    if deck_id:
        cards = _card_counts(_deck_cards(col, deck_name, include_suspended), hist)
    else:
        existing = set(col.db.list("select id from cards"))
        studied = [int(cid) for cid in hist if cid.isdigit() and int(cid) in existing]
        cards = _card_counts(studied, hist)
        cards["new"] = max(0, len(existing) - len(studied))
        cards["total"] = len(existing)

    decks = []
    if not deck_id:
        by_deck: dict[str, list[tuple[str, dict]]] = {}
        for date, recs in days.items():
            for did, rec in recs.items():
                by_deck.setdefault(did, []).append((date, rec))
        for did, entries in by_deck.items():
            name = col.decks.name_if_exists(int(did)) if did.isdigit() else None
            if not name:
                continue
            t = _sum([r for _, r in entries])
            counts = _card_counts(_deck_cards(col, name, include_suspended), hist)
            last = max(d for d, r in entries if r.get("a") or r.get("s") or r.get("g")) if any(
                r.get("a") or r.get("s") or r.get("g") for _, r in entries) else None
            decks.append({
                "id": int(did), "name": name, "answers": t["a"], "seconds": round(t["s"]),
                "learned": counts["learned"], "total": counts["total"], "last": last,
            })
        decks.sort(key=lambda x: x["last"] or "", reverse=True)

    return {
        "scope": "deck" if deck_id else "all",
        "deckId": deck_id or 0,
        "deckName": deck_name,
        "today": now.isoformat(),
        "tracking": tracking,
        "hasLog": bool(active),
        "cards": cards,
        "learnedRule": LEARNED_STREAK,
        "totals": {
            "answers": total["a"], "correct": total["c"], "seconds": round(total["s"]),
            "sessions": total["n"], "learned": total["l"], "games": total["g"], "modes": total["m"],
            "daysStudied": len(active),
        },
        "last30": {"answers": last30["a"], "correct": last30["c"], "seconds": round(last30["s"]),
                   "days": len([d for d in active if d >= (now - dt.timedelta(days=29)).isoformat()])},
        "last7": {"answers": last7["a"], "seconds": round(last7["s"]), "learned": last7["l"]},
        "streak": {"current": current, "longest": longest},
        "series": series,
        "decks": decks,
        "matchBest": match_best or {},
    }
