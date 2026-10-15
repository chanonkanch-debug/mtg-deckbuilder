import { describe, expect, it } from 'vitest';
import type { Card } from './scryfall';
import type { Deck, DeckEntry } from './rules';
import { goldfish, pay } from './goldfish';

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    id: name, name, mana_cost: '{R}', cmc: 1, type_line: 'Instant', oracle_text: '', colors: ['R'], color_identity: ['R'],
    legalities: {}, img: '', img_small: '', img_large: '', img_back: '', usd: null, pt: '', ...over,
  };
}
const land = (name: string, produced: string[], oracle = '') => card(name, { mana_cost: '', cmc: 0, colors: [], type_line: 'Basic Land', produced_mana: produced, oracle_text: oracle });
function deckOf(entries: [Card, number, number?][], format: Deck['format'] = 'modern'): Deck {
  const cards: Record<string, DeckEntry> = {};
  entries.forEach(([c, n, cmdr]) => { cards[c.id] = { card: c, main: n, side: 0, cmdr: cmdr ?? 0 }; });
  return { id: 'd', name: 'T', format, cards };
}

describe('goldfish', () => {
  it('pays colored symbols first and generic with the least flexible mana', () => {
    expect(pay([['U'], ['U']], 3, [['U', 'R'], ['U'], ['R']])).toEqual([]);
    expect(pay([['U']], 1, [['U', 'R'], ['U']])).toEqual([['U', 'R']]);
    expect(pay([['U']], 2, [['U', 'R'], ['R'], ['C']])).toEqual([['R']]);
    expect(pay([['U'], ['U']], 2, [['U', 'R'], ['R']])).toBeNull();
  });

  it('plays a simple 60-card deck sensibly', () => {
    const two = card('Bear', { mana_cost: '{1}{R}', cmc: 2, type_line: 'Creature' });
    const three = card('Ogre', { mana_cost: '{2}{R}', cmc: 3, type_line: 'Creature' });
    const r = goldfish(deckOf([[card('Bolt'), 12], [two, 12], [three, 12], [land('Mountain', ['R']), 24]]), 1000)!;
    expect(r.turns[0].available).toBeGreaterThan(0.95); // almost always a land on turn 1
    expect(r.turns[3].lands).toBeGreaterThan(3.3);
    expect(r.screw).toBeGreaterThan(0.03); expect(r.screw).toBeLessThan(0.2);
    expect(r.mulligan).toBeGreaterThan(0.05); expect(r.mulligan).toBeLessThan(0.25);
    expect(r.turns[2].spent / r.turns[2].available).toBeGreaterThan(0.8);
    expect(r.sample.log).toHaveLength(8);
  });

  it('uses mana rocks and casts the commander', () => {
    const rock = card('Sol Ring', { mana_cost: '{1}', cmc: 1, type_line: 'Artifact', colors: [], oracle_text: '{T}: Add {C}{C}.', produced_mana: ['C'] });
    const cmdr = card('Big Cmdr', { mana_cost: '{4}{G}', cmc: 5, type_line: 'Legendary Creature', colors: ['G'] });
    const filler = card('Filler', { mana_cost: '{3}{G}', cmc: 4, type_line: 'Creature', colors: ['G'] });
    const deck = deckOf([[cmdr, 0, 1], [rock, 1], [filler, 61], [land('Forest', ['G']), 37]], 'commander');
    const r = goldfish(deck, 500)!;
    expect(r.commander!.name).toBe('Big Cmdr');
    expect(r.commander!.avgTurn).toBeGreaterThan(4); expect(r.commander!.avgTurn).toBeLessThan(6.5);
  });

  it('flags cards that get stuck in hand', () => {
    const blue = card('Off-color', { mana_cost: '{U}{U}', cmc: 2, colors: ['U'] });
    const r = goldfish(deckOf([[card('Bolt'), 32], [blue, 4], [land('Mountain', ['R']), 22], [land('Island', ['U']), 2]]), 500)!;
    expect(r.stuck[0].card.name).toBe('Off-color');
  });
});
