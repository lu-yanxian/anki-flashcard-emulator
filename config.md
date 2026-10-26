Most of these are set from the add-on's own windows, so you rarely need to edit them here.

- `content_mode`: `"templates"` shows cards the way Anki's reviewer renders them; `"fields"` shows `front_field` on one side and `back_field` on the other.
- `search_filter`: extra Anki search text added to the deck search, e.g. `tag:lesson3` or `-is:new`.
- `one_card_per_note`: if true, sibling cards (e.g. reverse cards) are skipped so each note appears once. Cloze cards are always kept, since each one asks something different.
- `include_suspended`: include suspended cards in the session.
- `tag_name`: the tag used by "Tag cards I'm still learning" (Options). Default `quizlet::still-learning`.
- `study.theme`: `"classic"` (the default, light), `"classic-dark"`, `"pittsburgh"`, `"tokyo"`, `"edinburgh"` or `"sapporo"`. Pick one in Options, or press T to cycle.
- `study.effects`: which themes have their background effect switched on, for example `{"sapporo": true}`. All off by default.
- `study.sapporo_dark`: `true` gives Sapporo dark ink cards with cream text instead of snow and steel. Off by default.
- `study.shuffle`: start rounds in a shuffled order (the Shuffle button in the window does the same).
- `study.track_progress`: in Flashcards, sort each card into Know or Still learning.
- `study.starred_only`: study only the cards you've starred.
- `study.mode`: `"flashcards"`, `"learn"`, `"write"` or `"match"`, the mode the window opens in (it remembers the last one you used).
- `study.front_size` / `study.back_size`: the default text sizes (60–500%) for decks you haven't adjusted. Sizes changed in Options are saved for that deck only (`user_files/<profile>/deck_sizes.json`).
- `study.start_side`: `"front"` or `"back"`, whichever is shown first. In Learn and Write it's the side you're asked about; you answer with the other one.
- `study.learn_types`: `"both"` (choices first, then typing), `"mc"` (choices only) or `"written"` (typing only).
- `study.any_line`: in Learn and Write, accept any one line of the answer, or one item of a list like "a; b". Turn off to require the whole answer.
- `study.auto_advance`: move on automatically after a right answer.
- `study.tag_still_learning`: tag notes you miss with `tag_name`, and remove the tag once you know them.
- `study.match_pairs`: pairs per Match game (4, 6 or 8).
- `study.choose_on_open`: start each session on the card picker with your last selection for that deck.
- `study.autoplay_audio`: play a side's audio as soon as it's shown.

Stars, card selections, saved sessions, results history and Match times are stored per Anki profile under `user_files/<profile>/`, which survives add-on updates.

Answer checking ignores case, spacing, punctuation, Tibetan tsheg and shad, pinyin tone marks or numbers, and traditional/simplified character differences. Tibetan can be typed in Wylie. The traditional/simplified table comes from hanziconv by Bernard Yue (Apache License 2.0).
