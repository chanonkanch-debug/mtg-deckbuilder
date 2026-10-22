import { describe, expect, it } from 'vitest';
import type { Card } from './scryfall';
import { buildAroundQuery, customHook, identityFor } from './buildAround';

const card = (name: string, type_line: string, oracle_text: string, keywords: string[] = [], color_identity: string[] = []) =>
  ({ id: name, name, type_line, oracle_text, keywords, color_identity, mana_cost: '', cmc: 1, colors: [] }) as unknown as Card;

describe('build around search', () => {
  it('adds a search clause: any hook, not the seeds, in their colors', () => {
    const a = card('Krenko, Mob Boss', '', '', [], ['R']), b = card('Blood Artist', '', '', [], ['B']);
    expect(identityFor([a, b])).toBe('BR');
    expect(buildAroundQuery([a, b], [customHook('one'), customHook('two')], 'BR')).toBe('((o:"one" or o:"two") id<=BR) -!"Krenko, Mob Boss" -!"Blood Artist"');
    expect(buildAroundQuery([a], [customHook('one')], null)).toBe('o:"one" -!"Krenko, Mob Boss"');
    expect(buildAroundQuery([a], [], 'R')).toBe('');
  });
  it("doesn't limit the cards played with a seed to its colors", () => {
    const a = card('Slickshot Show-Off', '', '', [], ['R']);
    const played = { id: 'played:x', label: 'Played with', kind: 'played' as const, query: '(!"Preordain" or !"Lightning Bolt")', seeds: [] };
    expect(buildAroundQuery([a], [played], 'R')).toBe('(!"Preordain" or !"Lightning Bolt") -!"Slickshot Show-Off"');
    expect(buildAroundQuery([a], [played, customHook('prowess')], 'R'))
      .toBe('((!"Preordain" or !"Lightning Bolt") or (o:"prowess" id<=R)) -!"Slickshot Show-Off"');
  });
});
