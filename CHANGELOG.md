# Changelog

## v1.18

- **Card picker search.** The filter box is now a search box with a dropdown for where to look: both sides, the front, the back, any of the deck's note fields (such as Pinyin or English), or tags. Searching ignores accents and capitals (`mingtian` finds míngtiān) and matches traditional characters to simplified ones. The choice is remembered.

## v1.17

- **Timer:** when time's up, the Timer button now blinks red instead of wiggling. With reduced motion turned on in your system, it stays red instead.

## v1.16

- **Timer and stopwatch:** both pause while you're choosing cards and carry on when you go back.
- When the timer ends it now shows in the top bar even if hidden, until you click it.
- The show/hide switch is now just **Hide**, and nothing shows on the Timer button while the times are hidden.

## v1.15

- **Timer and stopwatch.** A new **Timer** button in the top bar (or press **K**) opens a timer and a stopwatch that can run at the same time, in every mode. The timer has 5, 10, 25 and 30 minute buttons and takes any other length. Running times show in the top bar, or can be hidden while they keep running. When the timer ends, a chime plays, the button rings until you click it, and Anki's taskbar icon flashes if the window is behind others.

## v1.14

- **Stats** now opens from the card picker too. "Back to choosing cards" returns you to the picker with your selection as you left it.
- Removed **Tools → Flashcard Emulator Stats…** from Anki's main window. Stats are on the Stats button (or **P**) in the study window.

## v1.13

- **Card picker:** the add-from option is now a single small switch beside the Add buttons. It reads **Add after last card** when on (the default) and **Add from start of deck** when off.

## v1.12

- **Card picker:** Add 5, Add 10 and Add 20 now continue after the last card you chose, so you can work through a section in the middle of a deck. A new switch under the buttons sets them to add **after the last chosen card** (the default) or **from the start**. With nothing chosen they start at the first card, and if they reach the end of the deck they carry on from the top. The **Add cards** button at the end of a round follows the same switch.
- **Card picker:** each row has a small pencil button that opens the card in Anki's Browse window for editing.

## v1.11

- **Statistics.** A new Stats screen (press **P** or click **Stats**) shows your progress for the deck you're studying or for all decks: cards learned, day streak, days practised, time studied, accuracy, a 26-week activity calendar, cards answered over the last two weeks, a breakdown by mode with best Match times, and (for all decks) a table of every deck you've studied.
- **Tools → Flashcard Emulator Stats…** opens the same statistics from Anki's main window, with a deck picker.
- Statistics are on by default and can be turned off in Options. Card progress comes from your answer history, so it includes cards you studied before this version; days, time and streaks are recorded from v1.11 on.

## v1.10

- **Flashcards:** when you finish a set, the main button (and the one Enter presses) is now **Start over** / **Restart flashcards**, so you repeat the same cards by default. **Add cards** is still there next to it.

## v1.9

- **Match, Learn and Write:** for note types whose back shows the front field again (after Anki's divider), the front is now taken out wherever it would give the answer away: Match answer tiles, Learn's answer choices, Write's answer checking, and the question when you study back-to-front. Flipping a card in Flashcards still shows the whole back, front included.

## v1.8

- **Card picker:** checkboxes now always match the selection. Clicking the box itself, rather than the row, used to leave it showing the opposite.
- **Match:** answer tiles no longer show the front of the card. Backs are now cut cleanly from note types whose back template repeats the front without Anki's usual divider, which also fixes the back in Flashcards.
- **Card picker:** new **Add 5** button, next to Add 10 and Add 20.
- The version number now shows in Anki's Add-ons list.
