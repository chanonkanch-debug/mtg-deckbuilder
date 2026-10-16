import { describe, expect, it } from 'vitest';
import type { Card } from './scryfall';
import { customHook, hooksFor, hooksForSeeds, identityFor, rankSuggestions } from './buildAround';

const card = (name: string, type_line: string, oracle_text: string, keywords: string[] = [], color_identity: string[] = []) =>
  ({ id: name, name, type_line, oracle_text, keywords, color_identity, mana_cost: '', cmc: 1, colors: [] }) as unknown as Card;
const ids = (c: Card) => hooksFor(c).map(h => h.id).sort();

describe('hooksFor', () => {
  it('finds themes and the tribe a card counts', () => {
    const krenko = card('Krenko, Mob Boss', 'Legendary Creature — Goblin Warrior', '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.');
    expect(ids(krenko)).toEqual(['theme:tokens', 'tribe:goblin']);
  });
  it('reads death and lifegain triggers', () => {
    const artist = card('Blood Artist', 'Creature — Vampire', 'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.');
    expect(ids(artist)).toEqual(['theme:aristocrats', 'theme:lifegain']);
  });
  it('uses keywords and mirrors "whenever you" triggers without duplicates', () => {
    const stinger = card('Drannith Stinger', 'Creature — Human Wizard', 'Whenever you cycle another card, Drannith Stinger deals 1 damage to each opponent.\nCycling {1}', ['Cycling']);
    expect(ids(stinger)).toEqual(['kw:cycling']);
  });
  it('picks up named counters, tokens and rare actions', () => {
    const c = card('Test', 'Artifact', 'Whenever you cast a noncreature spell, put an oil counter on Test. Create a Food token. The Ring tempts you.');
    expect(ids(c)).toEqual(['act:the ring tempts you', 'counter:oil', 'theme:spells', 'theme:tokens', 'token:food']);
  });
  it('mirrors an unfamiliar "whenever you" verb', () => {
    expect(ids(card('Odd', 'Enchantment', 'Whenever you transmute a card, draw a card.'))).toContain('act:transmute');
  });
});

describe('suggestions', () => {
  it('merges hooks shared by several seeds first', () => {
    const a = card('A', 'Creature — Elf', 'Whenever another creature dies, you gain 1 life.');
    const b = card('B', 'Creature — Elf', 'Sacrifice a creature: Scry 1.');
    const hooks = hooksForSeeds([a, b]);
    expect(hooks[0]).toMatchObject({ id: 'theme:aristocrats', seeds: ['A', 'B'] });
  });
  it('ranks cards that fit more hooks first, then by popularity, leaving out excluded cards', () => {
    const h1 = { ...customHook('one'), seeds: ['A', 'B'] }, h2 = customHook('two');
    const x = card('X', 'Creature', ''), y = card('Y', 'Creature', ''), z = card('Z', 'Creature', '');
    const ranked = rankSuggestions([{ hook: h1, cards: [y, x, z] }, { hook: h2, cards: [x, y] }], new Set(['Z']));
    expect(ranked.map(s => `${s.card.name}:${s.score}`)).toEqual(['Y:3', 'X:3']);
  });
  it('limits colors to the commander, or to the seeds together', () => {
    expect(identityFor([card('A', '', '', [], ['R']), card('B', '', '', [], ['W'])], null)).toBe('WR');
    expect(identityFor([], ['G', 'U'])).toBe('UG');
  });
});
