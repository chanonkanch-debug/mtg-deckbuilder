import { describe, expect, it } from 'vitest';
import type { Card } from './scryfall';
import type { Deck, DeckEntry } from './rules';
import { colorKey, curveByColor, fetchTargets, groupDeck, hypergeometric, landColorCounts, landColors, manaBase, shuffle, typeCounts } from './analysis';

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    id: name, name, mana_cost: '{R}', cmc: 1, type_line: 'Instant', oracle_text: '', colors: ['R'], color_identity: ['R'],
    legalities: {}, img: '', img_small: '', img_large: '', img_back: '', usd: null, pt: '', ...over,
  };
}
function deckOf(entries: [Card, Partial<DeckEntry>][]): Deck {
  const cards: Record<string, DeckEntry> = {};
  entries.forEach(([c, e]) => { cards[c.id] = { card: c, main: 0, side: 0, cmdr: 0, ...e }; });
  return { id: 'd', name: 'T', format: 'modern', cards };
}
const bolt = card('Bolt');
const helix = card('Helix', { mana_cost: '{R}{W}', cmc: 2, colors: ['R', 'W'], color_identity: ['R', 'W'] });
const ugin = card('Ugin', { mana_cost: '{8}', cmc: 8, colors: [], color_identity: [], type_line: 'Legendary Planeswalker — Ugin' });
const mountain = card('Mountain', { mana_cost: '', cmc: 0, colors: [], type_line: 'Basic Land — Mountain', produced_mana: ['R'] });
const sacred = card('Sacred Foundry', { mana_cost: '', cmc: 0, colors: [], type_line: 'Land — Mountain Plains', color_identity: ['R', 'W'], produced_mana: ['R', 'W'] });
const deck = deckOf([[bolt, { main: 4, side: 1 }], [helix, { main: 2 }], [ugin, { main: 1 }], [mountain, { main: 10 }], [sacred, { main: 2 }]]);

describe('analysis', () => {
  it('classifies colors', () => {
    expect([bolt, helix, ugin].map(colorKey)).toEqual(['R', 'M', 'C']);
  });
  it('groups by type, mana value and color', () => {
    expect(groupDeck(deck, 'type').map(g => `${g.title} ${g.count}`)).toEqual(['Planeswalkers 1', 'Instants 6', 'Lands 12', 'Sideboard 1']);
    expect(groupDeck(deck, 'mv').map(g => `${g.title} ${g.count}`)).toEqual(['Mana value 1 4', 'Mana value 2 2', 'Mana value 7+ 1', 'Lands 12', 'Sideboard 1']);
    expect(groupDeck(deck, 'color').map(g => `${g.title} ${g.count}`)).toEqual(['Red 4', 'Multicolor 2', 'Colorless 1', 'Lands 12', 'Sideboard 1']);
  });
  it('splits the curve by color and counts types', () => {
    const c = curveByColor(deck);
    expect(c[1]).toEqual({ R: 4 });
    expect(c[2]).toEqual({ M: 2 });
    expect(c[7]).toEqual({ C: 1 });
    expect(typeCounts(deck)).toEqual([['Planeswalker', 1], ['Instant', 6], ['Land', 12]]);
  });
  it('suggests a land split from mana symbols', () => {
    const { rows, lands } = manaBase(deck);
    expect(lands).toBe(12);
    // Red: 4 (Bolt) + 2 (Helix) = 6 symbols, White: 2 symbols.
    expect(rows).toEqual([
      { color: 'W', pips: 2, share: 0.25, sources: 2, suggested: 3 },
      { color: 'R', pips: 6, share: 0.75, sources: 12, suggested: 9 },
    ]);
  });
  it('computes hypergeometric odds', () => {
    const total = [0, 1, 2, 3, 4, 5, 6, 7].reduce((s, k) => s + hypergeometric(60, 24, 7, k), 0);
    expect(total).toBeCloseTo(1, 10);
    expect(hypergeometric(60, 24, 7, 3)).toBeCloseTo(0.3087, 4); // C(24,3)·C(36,4)/C(60,7)
  });
  it('shuffles without losing cards', () => {
    const items = [1, 2, 3, 4, 5];
    expect(shuffle(items).sort()).toEqual(items);
  });
});

describe('fetch lands', () => {
  const fetchland = card('Wooded Foothills', { mana_cost: '', cmc: 0, colors: [], color_identity: [], type_line: 'Land',
    oracle_text: '{T}, Pay 1 life, Sacrifice Wooded Foothills: Search your library for a Mountain or Forest card, put it onto the battlefield, then shuffle.' });
  const wilds = card('Evolving Wilds', { mana_cost: '', cmc: 0, colors: [], color_identity: [], type_line: 'Land',
    oracle_text: '{T}, Sacrifice Evolving Wilds: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.' });
  const island = card('Island', { mana_cost: '', cmc: 0, colors: [], type_line: 'Basic Land — Island', produced_mana: ['U'] });
  it('count as the colors they can find in this deck', () => {
    const d = deckOf([[fetchland, { main: 4 }], [wilds, { main: 2 }], [mountain, { main: 8 }], [island, { main: 4 }], [bolt, { main: 4 }]]);
    const f = fetchTargets(d);
    expect(landColors(fetchland, f)).toEqual(['R']);
    expect(landColors(wilds, f).sort()).toEqual(['R', 'U']);
    expect(manaBase(d).rows.find(r => r.color === 'R')!.sources).toBe(14);
  });
});

describe('landColorCounts', () => {
  it('counts lands per color they make, duals in both, and colorless lands', () => {
    const land = (name: string, produced: string[]) => card(name, { mana_cost: '', cmc: 0, colors: [], type_line: 'Land', produced_mana: produced });
    const d = deckOf([[land('Plains', ['W']), { main: 10 }], [land('Hallowed Fountain', ['W', 'U']), { main: 4 }],
      [land('Wastes', ['C']), { main: 2 }], [card('Bolt'), { main: 4 }]]);
    expect(landColorCounts(d)).toEqual({ lands: 16, byColor: [{ color: 'W', count: 14 }, { color: 'U', count: 4 }], colorless: 2 });
  });
});
