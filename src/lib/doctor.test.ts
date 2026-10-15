import { describe, expect, it } from 'vitest';
import type { Card } from './scryfall';
import type { Deck, DeckEntry } from './rules';
import { checkup } from './doctor';
import { goldfish } from './goldfish';

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    id: name, name, mana_cost: '{R}', cmc: 1, type_line: 'Instant', oracle_text: '', colors: ['R'], color_identity: ['R'],
    legalities: {}, img: '', img_small: '', img_large: '', img_back: '', usd: null, pt: '', ...over,
  };
}
const land = (name: string, produced: string[]) => card(name, { mana_cost: '', cmc: 0, colors: [], type_line: 'Basic Land', produced_mana: produced });
function deckOf(entries: [Card, number][], format: Deck['format'] = 'modern'): Deck {
  const cards: Record<string, DeckEntry> = {};
  entries.forEach(([c, n]) => { cards[c.id] = { card: c, main: n, side: 0, cmdr: 0 }; });
  return { id: 'd', name: 'T', format, cards };
}

describe('checkup', () => {
  it('says nothing for a clean mono-color deck', () => {
    const d = deckOf([[card('Bolt'), 18], [card('Bear', { mana_cost: '{1}{R}', cmc: 2, type_line: 'Creature' }), 18], [land('Mountain', ['R']), 24]]);
    expect(checkup(d, goldfish(d, 1000))).toEqual([]);
  });
  it('puts the off-color splash first with a land search to fix it', () => {
    const d = deckOf([[card('Bolt'), 32], [card('Counterspell', { mana_cost: '{U}{U}', cmc: 2, colors: ['U'] }), 4],
      [land('Mountain', ['R']), 20], [land('Island', ['U']), 4]]);
    const f = checkup(d, goldfish(d, 1000));
    expect(f[0].id).toBe('color:U');
    expect(f[0].level).toBe('bad');
    expect(f[0].action).toEqual({ kind: 'search', label: 'Find blue lands', query: 't:land produces:u' });
    // The stuck Counterspells are already explained by the color finding.
    expect(f.some(x => x.id === 'stuck:Counterspell')).toBe(false);
  });
  it('flags too few lands from the simulation', () => {
    const d = deckOf([[card('Bear', { mana_cost: '{1}{R}', cmc: 2, type_line: 'Creature' }), 44], [land('Mountain', ['R']), 16]]);
    expect(checkup(d, goldfish(d, 1000)).map(x => x.id)).toContain('screw');
  });
  it('compares Commander role counts with targets', () => {
    const d = deckOf([[card('Bear', { mana_cost: '{1}{G}', cmc: 2, type_line: 'Creature', colors: ['G'] }), 63], [land('Forest', ['G']), 36]], 'commander');
    const ids = checkup(d, null).map(x => x.id);
    expect(ids).toEqual(expect.arrayContaining(['role:ramp', 'role:draw', 'role:removal', 'role:wipe']));
  });
});
