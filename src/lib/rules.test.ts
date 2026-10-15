import { describe, expect, it } from 'vitest';
import { searchUrl, type Card } from './scryfall';
import { checkDeck, copyLimit, deckStats, type Deck, type DeckEntry } from './rules';
import { exportArena, exportList, parseList } from './decklist';
import { buildQuery, filterQuery, REGULAR_PRINTS } from './filters';
import { ARCHETYPES } from './archetypes';

const legal = { standard: 'legal', pioneer: 'legal', modern: 'legal', legacy: 'legal', vintage: 'legal', pauper: 'legal', commander: 'legal' } as const;
function card(name: string, over: Partial<Card> = {}): Card {
  return {
    id: name, name, mana_cost: '{R}', cmc: 1, type_line: 'Instant', oracle_text: '', colors: ['R'], color_identity: ['R'],
    legalities: { ...legal }, img: '', img_small: '', img_large: '', img_back: '', usd: '1.00', pt: '', ...over,
  };
}
function deckOf(format: Deck['format'], entries: [Card, Partial<DeckEntry>][]): Deck {
  const cards: Record<string, DeckEntry> = {};
  entries.forEach(([c, e]) => { cards[c.id] = { card: c, main: 0, side: 0, cmdr: 0, ...e }; });
  return { id: 'd', name: 'Test', format, cards };
}
const mountain = card('Mountain', { type_line: 'Basic Land — Mountain', mana_cost: '', cmc: 0 });

describe('copyLimit', () => {
  it('handles basics, any-number cards, restricted and normal cards', () => {
    expect(copyLimit(mountain, 'modern')).toBe(Infinity);
    expect(copyLimit(card('Relentless Rats', { oracle_text: 'A deck can have any number of cards named Relentless Rats.' }), 'modern')).toBe(Infinity);
    expect(copyLimit(card('Seven Dwarves', { oracle_text: 'A deck can have up to seven cards named Seven Dwarves.' }), 'modern')).toBe(7);
    expect(copyLimit(card('Sol Ring', { legalities: { ...legal, vintage: 'restricted' } }), 'vintage')).toBe(1);
    expect(copyLimit(card('Shock'), 'modern')).toBe(4);
    expect(copyLimit(card('Shock'), 'commander')).toBe(1);
  });
});

describe('checkDeck', () => {
  it('passes a legal 60-card deck', () => {
    const d = deckOf('modern', [[card('Bolt'), { main: 4 }], [mountain, { main: 56 }]]);
    expect(checkDeck(d)).toEqual([['ok', 'Deck is legal for modern.']]);
  });
  it('flags size, legality and copy limits', () => {
    const d = deckOf('standard', [[card('Bolt', { legalities: { ...legal, standard: 'not_legal' } }), { main: 5 }]]);
    const msgs = checkDeck(d).map(i => i[1]);
    expect(msgs).toContain('Main deck has 5 cards; 60 minimum.');
    expect(msgs).toContain('Bolt is not legal in standard.');
    expect(msgs).toContain('Bolt: 5 copies, limit is 4.');
  });
  it('checks commander color identity', () => {
    const krenko = card('Krenko', { type_line: 'Legendary Creature — Goblin' });
    const counter = card('Counterspell', { color_identity: ['U'] });
    const msgs = checkDeck(deckOf('commander', [[krenko, { cmdr: 1 }], [counter, { main: 1 }]])).map(i => i[1]);
    expect(msgs).toContain("Counterspell is outside your commander's color identity (U).");
  });
});

describe('deckStats', () => {
  it('builds the curve from nonland main deck cards', () => {
    const s = deckStats(deckOf('modern', [[card('Bolt'), { main: 4 }], [card('Big', { cmc: 9, mana_cost: '{7}{G}{G}' }), { main: 1 }], [mountain, { main: 20 }]]));
    expect(s.curve).toEqual([0, 4, 0, 0, 0, 0, 0, 1]);
    expect(s.lands).toBe(20);
    expect(s.pips.R).toBe(4);
    expect(s.pips.G).toBe(2); // two {G} symbols on one card
  });
});

describe('decklists', () => {
  it('parses sections, prefixes and set codes', () => {
    expect(parseList('Commander\n1 Krenko\n\nDeck\n4x Lightning Bolt (M10) 146\nSB: 2 Shock\nSideboard\n3 Mountain')).toEqual([
      { qty: 1, name: 'Krenko', set: undefined, board: 'cmdr' },
      { qty: 4, name: 'Lightning Bolt', set: 'm10', board: 'main' },
      { qty: 2, name: 'Shock', set: undefined, board: 'side' },
      { qty: 3, name: 'Mountain', set: undefined, board: 'side' },
    ]);
  });
  it('exports what it imports', () => {
    const d = deckOf('modern', [[card('Bolt'), { main: 4, side: 1 }]]);
    expect(exportList(d)).toBe('4 Bolt\n\nSideboard\n1 Bolt');
  });
  it('reads MTG Arena lists', () => {
    expect(parseList('About\nName Mono Red\n\nCompanion\n1 Lurrus of the Dream-Den (IKO) 226\n\nDeck\n4 Llanowar Elves (DAR) 168\n1 Name Sticker Goblin')).toEqual([
      { qty: 1, name: 'Lurrus of the Dream-Den', set: 'iko', board: 'side' },
      { qty: 4, name: 'Llanowar Elves', set: 'dom', board: 'main' },
      { qty: 1, name: 'Name Sticker Goblin', set: undefined, board: 'main' },
    ]);
  });
  it('exports in MTG Arena format', () => {
    const d = deckOf('pioneer', [
      [card('Lightning Bolt', { set: 'sta', cn: '42', arena: true }), { main: 4, side: 0 }],
      [card('Delver of Secrets // Insectile Aberration', { set: 'mid', cn: '47', layout: 'transform', arena: true }), { main: 2, side: 0 }],
      [card('Fire // Ice', { set: 'mh2', cn: '290', layout: 'split', arena: false }), { main: 1, side: 0 }],
      [card('Shock', { set: 'dom', cn: '144', arena: true }), { main: 0, side: 3 }],
    ]);
    expect(exportArena(d)).toBe('Deck\n4 Lightning Bolt (STA) 42\n2 Delver of Secrets (MID) 47\n1 Fire // Ice\n\nSideboard\n3 Shock (DAR) 144');
  });
});

describe('search queries', () => {
  it('ORs within a filter group and ANDs across groups', () => {
    expect(filterQuery(new Set(['mv:1', 'mv:7', 'type:0']))).toBe('(mv=1 or mv>=7) t:creature');
  });
  it('adds format, sets and commander identity', () => {
    const krenko = card('Krenko', { type_line: 'Legendary Creature — Goblin' });
    const d = deckOf('commander', [[krenko, { cmdr: 1 }]]);
    expect(buildQuery(d, { text: 'goblin', filters: new Set(), sets: new Set(['blb', 'dsk']), onlyLegal: true, onlyIdentity: true }))
      .toBe('goblin (e:blb or e:dsk) f:commander id<=R');
  });
});

describe('archetype queries', () => {
  const balanced = (q: string) => {
    let depth = 0, inRegex = false, inQuote = false;
    for (let i = 0; i < q.length; i++) {
      const ch = q[i];
      if (ch === '"' && !inRegex) inQuote = !inQuote;
      else if (ch === '/' && !inQuote && q[i - 1] !== '\\' && (inRegex || q[i - 1] === ':')) inRegex = !inRegex;
      else if (!inRegex && !inQuote && ch === '(') depth++;
      else if (!inRegex && !inQuote && ch === ')') depth--;
      if (depth < 0) return false;
    }
    return depth === 0 && !inRegex && !inQuote;
  };
  it('every archetype query has balanced quotes, regexes and parentheses', () => {
    ARCHETYPES.forEach(g => g.options.forEach(([label, q]) => expect(balanced(q), label).toBe(true)));
  });
  it('wraps OR queries so they combine safely with other terms', () => {
    expect(filterQuery(new Set(['strategy:0', 'tribe:0']))).toBe('t:creature mv<=2 pow>=2 (t:goblin or o:goblin)');
    expect(filterQuery(new Set(['theme:4', 'theme:5']))).toBe('(o:"+1/+1 counter" or (kw:lifelink or o:/whenever you gain life/ or o:/you gain \\d+ life/))');
  });
  it('limits rarity searches to regular printings unless showing all arts', () => {
    const d = deckOf('modern', []);
    const base = { text: '', sets: new Set<string>(), onlyLegal: false, onlyIdentity: false };
    expect(buildQuery(d, { ...base, filters: new Set(['rarity:2']) })).toBe(`r:rare ${REGULAR_PRINTS}`);
    expect(buildQuery(d, { ...base, text: 'goblin r>=rare', filters: new Set() })).toBe(`goblin r>=rare ${REGULAR_PRINTS}`);
    expect(buildQuery(d, { ...base, filters: new Set(['rarity:2']), allArts: true })).toBe('r:rare');
    expect(buildQuery(d, { ...base, text: 'o:"draw a card"', filters: new Set(['mv:1']) })).toBe('o:"draw a card" mv=1');
  });
  it('wraps typed text that uses or', () => {
    const d = deckOf('modern', []);
    expect(buildQuery(d, { text: 't:elf or t:goblin', filters: new Set(['mv:1']), sets: new Set(), onlyLegal: true, onlyIdentity: false }))
      .toBe('(t:elf or t:goblin) mv=1 f:modern');
  });
});

describe('searchUrl', () => {
  it('shows the regular art by default and every art on request', () => {
    const def = new URL('https://x' + searchUrl({ q: 't:dragon', order: 'name', dir: 'asc' }));
    expect(def.searchParams.get('q')).toBe('t:dragon prefer:default');
    expect(def.searchParams.get('unique')).toBe('cards');
    const all = new URL('https://x' + searchUrl({ q: 't:dragon', order: 'name', dir: 'asc', allArts: true }));
    expect(all.searchParams.get('q')).toBe('t:dragon');
    expect(all.searchParams.get('unique')).toBe('art');
  });
});
