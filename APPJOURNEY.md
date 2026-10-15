# App Journey

A running record of how the MTG Deck Builder was built: what each phase set out to do, what shipped, what we learned, and what's still open.

Live site: https://chanonkanch-debug.github.io/mtg-deckbuilder/

---

## Phase 1: a deck builder that helps you build a better deck

**Status:** done (checkpoint on 15 October 2026)
**Shipped in:** 24 pull requests, plus this checkpoint
**Size:** about 3,600 lines of TypeScript, React and CSS, and 67 unit tests

### The goal

Build a browser deck builder on the Scryfall API that does the basics well (search, deck list, legality, import and export) and then goes further than other builders on **deck quality**. It should tell you whether your deck actually works, in plain language, with realistic numbers and not too much information.

### Where it started

The app began as a single-file deck builder. It was rebuilt as React + TypeScript + Vite, deployed to GitHub Pages on every merge, with search, a deck list, legality checks for seven formats, a basic mana curve, import and export, and decks saved in the browser.

### What we built

**1. Search that finds the right cards quickly**

| PR | Change |
|---|---|
| #1 | Archetype quick filters (ramp, removal, draw and more) and a built-in Scryfall syntax guide |
| #2 | Regular art by default, an alternate-art picker, and a compact search toolbar |
| #14 | Rarity searches look at regular printings only, so special printings don't change art or rarity |
| #20 | The Removal filter also finds -X/-X shrink effects and "becomes 0/0" effects like Multiply by Zero |
| #22, #23 | A color sort, then color and mana value as the default grouping under whichever sort you pick |

**2. A deck area that's easy to read**

| PR | Change |
|---|---|
| #3 | Summary bar, visual (card image) view, stats tabs and a sample hand |
| #4 | Mana symbols drawn as images instead of `{2}{R}` text |
| #11, #12 | A highlighted **Deck details** button opens the in-depth tools in a pop-up; curve, types and mana base stay on the page |
| #15 | Row hover highlight, land counts per color, castability green at 88% |
| #16, #17 | The deck got its own zoom with even steps from 60% to 200% |
| #24 | Export for MTG Arena |

**3. Deck quality: the part other builders don't have**

| PR | Change |
|---|---|
| #5 | **Castability:** each spell's chance of having its colors on curve (Frank Karsten's method), and how many more sources would reach 90% |
| #6 | **Roles:** ramp, draw, removal, wipes, counterspells and tutors counted from rules text, compared with the Command Zone template for Commander; fetch lands count their colors |
| #7, #8 | **Goldfish simulator:** 4,000 games for land stalls, flood, mulligans, mana used and commander turn, with run again and reset |
| #9, #10 | **Deck checkup:** the few things most worth fixing, worst first, each with a one-click fix, plus "since your last change" and hard-to-cast tags on cards |
| #13 | Lands like Great Hall of the Biblioplex and Ancient Ziggurat count only for the spells they can pay for |
| #18 | Mana rocks and dorks count as color sources, the way Karsten counts a Signet |
| #19, #21 | **Swap preview:** **Try** a card (or a cut) and see castability, simulation and roles before and after, measured on the same random draws |

### Checkpoint bug sweep

Before closing Phase 1, the whole codebase was reviewed for bugs a user could hit. These were fixed in the checkpoint PR:

| Bug | What happened | Fix |
|---|---|---|
| Decks could silently stop saving | The search cache could fill the browser's storage (about 5 MB), after which deck saves failed with no warning and edits were lost on reload | The cache is capped by size, it's cleared if a save fails, and a message shows if saving still fails |
| Two tabs overwrote each other | A deck made in one tab was lost when another tab saved | Each tab loads decks saved by the other |
| Arena imports dropped cards | Arena's `DAR` set code (Dominaria), the Companion section and the About/Name lines weren't understood, and any card whose set code didn't match was dropped | Arena codes are mapped, the companion goes to the sideboard, header lines are skipped, and an unknown set is retried by name |
| Split cards looked expensive | Fire // Ice counted as a 4-drop in castability and the simulation, because Scryfall gives split cards the total of both halves | Casting uses the front half's cost |
| "Since your last change" missed things | For one render, the checkup mixed the new deck with the old simulation, so castability, land and role fixes never showed up as changes | A simulation result is only used for the deck it was run on (also fixes the same issue in the swap preview) |
| Search pages could mix two searches | Clicking to the next page while a new search was waiting could add the old search's cards to the new results | Page clicks wait for the new search |
| Buttons on the deck's right side seemed unclickable | The large hover preview stayed on screen after the pointer moved from a card name to that row's buttons, hiding them; the toast at the bottom also blocked clicks for 3 seconds | The preview hides when the pointer leaves the card or Deck details closes; clicks pass through the toast; long costs shrink instead of pushing buttons out |

The last row is our best explanation of the "can't click the right side" report from earlier. It was never reproduced exactly, so it's worth watching.

### Decisions worth remembering

- **Deck quality over feature count.** Each tool answers one question ("can I cast this on curve?", "do I have enough removal?") in plain words, with the in-depth numbers one click away in Deck details.
- **Realistic numbers.** Castability follows Frank Karsten's method (on the play, assuming land drops, 90% target, green from 88%). The simulation plays real cards: front-face costs for split, adventure and double-faced cards, fetch lands, limited any-color lands, rocks and dorks.
- **Comparisons use the same random draws.** Before and after numbers (the swap preview and the checkup's changes) use a fixed seed, so small moves aren't marked better or worse by chance.
- **Regular art by default.** Search shows each card once with its normal art unless you ask for alternate arts.
- **No backend yet.** Everything runs in the browser, and decks live in localStorage.

### Known limits

- Card search depends on Scryfall's live API. Rarity, Removal-filter and Arena-export behavior was tested against mocked data only, so a quick live check is worthwhile.
- Decks are stored in one browser. Clearing site data deletes them, and they don't sync across devices.
- The simulation is a goldfish: no opponent, no interaction. Cost reducers and treasure aren't modeled, and a mana rock's own color cost isn't checked in castability.
- Search grouping by color and curve covers the first 700 results of a search. Pages after that are grouped in their own batches.
- Decks saved before the Arena export export by name only (no set or collector number) until their cards are re-added.

### Housekeeping

- The 24 merged feature branches are still on GitHub. They can be deleted from the repository's **Branches** page, and **Settings → General → Automatically delete head branches** removes them after future merges.

---

## Phase 2: planned, not started

1. A backend for accounts, so decks are saved per account and sync across devices
2. Decks shared by link
3. A collection tab to track the cards you own (needs its own design pass)
4. A local AI assistant for deck building

**Phase 3 and beyond:** more features other deck builders don't offer.
