import { describe, expect, it } from 'vitest';
import type { Card } from './scryfall';
import type { Deck, DeckEntry } from './rules';
import { addedCastOdds, applyTrial, trialReport } from './swap';
import { goldfish } from './goldfish';

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    id: name, name, mana_cost: '{R}', cmc: 1, type_line: 'Instant', oracle_text: '', colors: ['R'], color_identity: ['R'],
    legalities: {}, img: '', img_small: '', img_large: '', img_back: '', usd: null, pt: '', ...over,
  };
}
const land = (name: string, produced: string[]) => card(name, { mana_cost: '', cmc: 0, colors: [], type_line: 'Basic Land', produced_mana: produced });
function deckOf(entries: [Card, number][]): Deck {
  const cards: Record<string, DeckEntry> = {};
  entries.forEach(([c, n]) => { cards[c.id] = { card: c, main: n, side: 0, cmdr: 0 }; });
  return { id: 'd', name: 'T', format: 'modern', cards };
}

describe('swap preview', () => {
  const bolt = card('Bolt'), counter = card('Counterspell', { mana_cost: '{U}{U}', cmc: 2, colors: ['U'] });
  const mountain = land('Mountain', ['R']), island = land('Island', ['U']);
  const deck = deckOf([[bolt, 32], [counter, 4], [mountain, 20], [island, 4]]);

  it('adds and cuts one main-deck copy without touching the original', () => {
    const after = applyTrial(deck, { add: island, cut: mountain });
    expect(after.cards.Island.main).toBe(5);
    expect(after.cards.Mountain.main).toBe(19);
    expect(deck.cards.Island.main).toBe(4);
    const gone = applyTrial(deckOf([[bolt, 1]]), { cut: bolt });
    expect(gone.cards.Bolt).toBeUndefined();
  });

  it('lists the comparison rows and how the added card would cast', () => {
    const fixed = applyTrial(deck, { add: island, cut: bolt });
    const rows = trialReport(deck, fixed, goldfish(deck, 1000), goldfish(fixed, 1000));
    expect(rows.map(r => r.label)).toEqual(['Spells hard to cast', 'Counterspell on curve', 'Stall on lands', 'Flood', 'Mulligan', 'Mana used by turn 4', 'Lands']);
    expect(rows[1].verdict).toBe('better');
    const worse = applyTrial(deck, { add: counter, cut: island });
    const hard = trialReport(deck, worse, null, null)[0];
    expect(hard).toMatchObject({ label: 'Spells hard to cast', verdict: 'same' }); // still one spell, just worse odds
    expect(addedCastOdds(worse, counter)!).toBeLessThan(addedCastOdds(deck, counter) ?? 1);
  });

  it('shows land and role count changes', () => {
    const ramp = card('Llanowar Elves', { mana_cost: '{G}', cmc: 1, type_line: 'Creature — Elf Druid', colors: ['G'], produced_mana: ['G'], oracle_text: '{T}: Add {G}.' });
    const rows = trialReport(deck, applyTrial(deck, { add: ramp, cut: mountain }), null, null);
    expect(rows.find(r => r.label === 'Lands')).toMatchObject({ before: '24', after: '23' });
    expect(rows.find(r => r.label === 'Ramp')).toMatchObject({ before: '0', after: '1', verdict: 'better' });
  });
});
