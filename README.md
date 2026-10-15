# MTG Deck Builder

A Magic: The Gathering deck builder that runs entirely in the browser, using the [Scryfall API](https://scryfall.com/docs/api) for card data.

## Features

- Mana and card symbols drawn with Scryfall's symbol images
- Card search with Scryfall syntax, name autocomplete, and sorting in either direction
- Quick filters for mana value, card type, color and rarity, plus a set picker
- 20 results per page, adjustable card size, hover-to-enlarge, and a right-click card view
- Deck list with main deck, sideboard and commander, grouped by card type
- Legality checks for Standard, Pioneer, Modern, Legacy, Vintage, Pauper and Commander
  (banned or restricted cards, copy limits, deck size, commander color identity)
- Mana curve, colored pips, land count, average mana value and estimated price
- Decklist import and export (`4 Lightning Bolt`, with `Sideboard` / `Commander` sections)
- Decks are saved in the browser's localStorage

Requests to Scryfall are spaced 100 ms apart as Scryfall asks, and GET responses are cached for 24 hours.

## Roadmap

**Phase 2** (planned, not started)

1. Backend for accounts, so decks are saved per account and sync across devices
2. Decks shared by link
3. A collection tab to track the cards you own (needs its own design pass)
4. A local AI assistant for deck building

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
