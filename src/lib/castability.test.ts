import { describe, expect, it } from 'vitest';
import type { Card } from './scryfall';
import type { Deck, DeckEntry } from './rules';
import { canPay, castability, colorRequirements, sourceOdds, sourcesNeeded } from './castability';

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    id: name, name, mana_cost: '{R}', cmc: 1, type_line: 'Instant', oracle_text: '', colors: ['R'], color_identity: ['R'],
    legalities: {}, img: '', img_small: '', img_large: '', img_back: '', usd: null, pt: '', ...over,
  };
}
const land = (name: string, produced: string[]) => card(name, { mana_cost: '', cmc: 0, colors: [], type_line: 'Land', produced_mana: produced });
function deckOf(entries: [Card, number][]): Deck {
  const cards: Record<string, DeckEntry> = {};
  entries.forEach(([c, n]) => { cards[c.id] = { card: c, main: n, side: 0, cmdr: 0 }; });
  return { id: 'd', name: 'T', format: 'modern', cards };
}

describe('castability', () => {
  it('parses colored requirements', () => {
    expect(colorRequirements('{1}{U}{U}')).toEqual([['U'], ['U']]);
    expect(colorRequirements('{R/W}{G/P}{2/B}{X}{C}')).toEqual([['R', 'W'], ['C']]);
  });
  it('matches lands to symbols one land each', () => {
    expect(canPay([['R'], ['W']], [['R', 'W'], ['R']])).toBe(true);
    expect(canPay([['R'], ['W']], [['R', 'W']])).toBe(false);
    expect(canPay([['W'], ['W']], [['R', 'W'], ['R']])).toBe(false);
  });
  it("lands near Karsten's source counts for 60 cards with 24 lands", () => {
    expect(sourcesNeeded(60, 24, 1, 1)).toBe(15);
    expect(sourcesNeeded(60, 24, 2, 2)).toBe(20);
    expect(sourcesNeeded(60, 24, 2, 4)).toBe(15);
    expect(sourceOdds(60, 24, 24, 1, 1)).toBe(1);
  });
  it('ranks spells and says which colors are short', () => {
    const counter = card('Counterspell', { mana_cost: '{U}{U}', cmc: 2, colors: ['U'] });
    const bolt = card('Bolt');
    const ugin = card('Ugin', { mana_cost: '{8}', cmc: 8, colors: [] });
    const r = castability(deckOf([[counter, 4], [bolt, 4], [ugin, 1], [card('Filler', { mana_cost: '{2}', cmc: 2, colors: [] }), 27],
      [land('Island', ['U']), 6], [land('Mountain', ['R']), 18]]));
    expect(r.rows.map(x => x.card.name)).toEqual(['Counterspell', 'Bolt']);
    expect(r.rows[0].odds).toBeLessThan(0.5);
    expect(r.rows[0].short).toEqual([{ color: 'U', have: 6, need: 20 }]);
    expect(r.rows[1].odds).toBeGreaterThan(0.9);
    expect(r.rows[1].short).toEqual([]);
  });

  it('counts any-color lands, but only for the spells their mana can cast', () => {
    const hall = card('Great Hall of the Biblioplex', { mana_cost: '', cmc: 0, colors: [], type_line: 'Land', produced_mana: ['C', 'W', 'U', 'B', 'R', 'G'],
      oracle_text: '{T}: Add {C}.\n{T}, Pay 1 life: Add one mana of any color. Spend this mana only to cast an instant or sorcery spell.' });
    const confluence = land('Mana Confluence', ['W', 'U', 'B', 'R', 'G']);
    const elk = card('Elk', { mana_cost: '{U}', cmc: 1, type_line: 'Creature', colors: ['U'] });
    const think = card('Think', { mana_cost: '{U}', cmc: 1, type_line: 'Sorcery', colors: ['U'] });
    const filler = card('Filler', { mana_cost: '{2}', cmc: 2, colors: [] });
    const odds = (deck: Deck, name: string) => castability(deck).rows.find(r => r.card.name === name)?.odds ?? 1;
    const halls = deckOf([[elk, 4], [think, 4], [filler, 28], [hall, 24]]);
    expect(odds(halls, 'Think')).toBe(1);
    expect(odds(halls, 'Elk')).toBe(0);
    expect(odds(deckOf([[elk, 4], [filler, 32], [confluence, 24]]), 'Elk')).toBe(1);
  });

  it('counts mana rocks and dorks as sources for spells cast a turn later', () => {
    const signet = card('Azorius Signet', { mana_cost: '{2}', cmc: 2, type_line: 'Artifact', colors: [], produced_mana: ['W', 'U'],
      oracle_text: '{1}, {T}: Add {W}{U}.' });
    const birds = card('Birds of Paradise', { mana_cost: '{G}', cmc: 1, type_line: 'Creature — Bird', colors: ['G'], produced_mana: ['W', 'U', 'B', 'R', 'G'],
      oracle_text: 'Flying\n{T}: Add one mana of any color.' });
    const wrath = card('Wrath', { mana_cost: '{2}{W}{W}', cmc: 4, type_line: 'Sorcery', colors: ['W'] });
    const filler = card('Filler', { mana_cost: '{2}', cmc: 2, colors: [] });
    const base: [Card, number][] = [[wrath, 4], [land('Plains', ['W']), 8], [land('Forest', ['G']), 16]];
    const odds = (d: Deck) => castability(d).rows.find(r => r.card.name === 'Wrath')!.odds;
    const without = castability(deckOf([...base, [filler, 32]]));
    const withRocks = castability(deckOf([...base, [signet, 8], [birds, 8], [filler, 16]]));
    expect(withRocks.rocks).toBe(16);
    expect(without.rocks).toBe(0);
    expect(odds(deckOf([...base, [signet, 8], [birds, 8], [filler, 16]]))).toBeGreaterThan(odds(deckOf([...base, [filler, 32]])) + 0.1);
    // Birds itself costs {G}, cast on turn 1, so no rock helps it.
    expect(withRocks.rows.find(r => r.card.name === 'Birds of Paradise')!.odds).toBeLessThan(1);
  });
});
