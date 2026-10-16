# MTG Deck Builder

A Magic: The Gathering deck builder that runs entirely in the browser, using the [Scryfall API](https://scryfall.com/docs/api) for card data.

## Features

**Search**

- Card search with Scryfall syntax, name autocomplete, and a built-in syntax guide
- Quick filters for mana value, card type, color and rarity, archetype filters (ramp, removal, draw and more), and a set picker
- Results grouped by color and mana value by default, then by the sort you pick (name, price, EDHREC rank and more)
- Regular art by default, with an option to show alternate arts and a printing picker per card
- 20 results per page, adjustable card size, hover-to-enlarge, and a card view on right-click
- **Try** on any result to preview a swap before making it
- **Build around:** pick the cards you want to play and the search shows cards that work with them. A quick read
  matches patterns in their rules text; **Read with AI** runs a small model (Qwen3 4B, via WebLLM) in your browser
  to work out subtler synergies. It's free and private, needs WebGPU (Chrome or Edge on a computer), and downloads
  about 2 GB the first time

**Deck**

- Main deck, sideboard and commander, in a list or visual view grouped by type, mana value or color, with its own zoom
- Legality checks for Standard, Pioneer, Modern, Legacy, Vintage, Pauper and Commander
  (banned or restricted cards, copy limits, deck size, commander color identity)
- Curve, types and mana base on the page, with land counts per color
- Deck checkup: the few things most worth fixing, each with a one-click action, and what changed since your last edit
- Decklist import and export (`4 Lightning Bolt`, with `Sideboard` / `Commander` sections), plus an MTG Arena export
- Decks are saved in the browser's localStorage

**Deck details**

- Castability: each spell's chance of having its colors on curve (Frank Karsten's method), counting lands, fetches,
  limited any-color lands, mana rocks and dorks, and how many more sources would reach 90%
- Roles: ramp, draw, removal, wipes, counterspells and tutors, compared with the Command Zone template for Commander
- Simulation: 4,000 goldfish games for land stalls, flood, mulligans, mana used and the turn your commander comes down
- Sample hands
- Swap preview: the same numbers before and after adding or cutting a card

Requests to Scryfall are spaced 100 ms apart as Scryfall asks, and GET responses are cached for 24 hours.

## Roadmap

**Phase 1** is done; see [APPJOURNEY.md](APPJOURNEY.md) for what was built and what's left.

**Phase 2** (planned, not started)

1. Backend for accounts, so decks are saved per account and sync across devices
2. Decks shared by link
3. A collection tab to track the cards you own (needs its own design pass)
4. A local AI assistant for deck building (started: the AI read in Build around)

**Phase 3 and beyond:** features other deck builders such as Moxfield don't offer.

## Development

```sh
npm install
npm run dev       # local dev server
npm test          # unit tests (Vitest)
npm run build     # type-check and build to dist/
```

## Deployment

Every push to `main` runs the tests, builds the site and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`). In the repository settings, set **Pages → Source** to **GitHub Actions** once.

Card data and images © Scryfall and Wizards of the Coast. This project is not affiliated with Wizards of the Coast.
