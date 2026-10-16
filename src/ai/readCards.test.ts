import { describe, expect, it } from 'vitest';
import type { Card } from '../lib/scryfall';
import { parseRead, promptFor, seedKey } from './readCards';

const card = (name: string, oracle_text: string) =>
  ({ id: name, name, oracle_text, type_line: 'Sorcery', mana_cost: '{5}{U}{U}', color_identity: ['U'] }) as unknown as Card;
const mi = card('Multiversal Incursion', "For each nontoken creature you control, create a token that's a copy of that creature,\nexcept it isn't legendary.");

describe('AI read', () => {
  it('describes the cards on one line each, with thinking off', () => {
    const p = promptFor([mi], 'commander');
    expect(p).toContain('Format: commander.');
    expect(p).toContain("Multiversal Incursion {5}{U}{U} Sorcery. \"For each nontoken creature you control, create a token that's a copy of that creature, except it isn't legendary.\"");
    expect(p.endsWith('/no_think')).toBe(true);
  });
  it('turns phrases into safe rules-text searches and drops bad ones', () => {
    const answer = 'Sure! {"summary": "Copy your board.", "hooks": [' +
      '{"label": "Enter triggers", "why": "Copies trigger again.", "phrases": ["When this creature enters", "when this creature enters", "x"]},' +
      '{"label": "Quote \\"trick\\"", "why": "", "phrases": ["legendary \\"creature\\""]},' +
      '{"label": "Itself", "phrases": ["multiversal incursion"]},' +
      '{"label": "", "phrases": ["anything"]}]} done';
    const read = parseRead(answer, [mi]);
    expect(read.summary).toBe('Copy your board.');
    expect(read.seeds).toBe(seedKey([mi]));
    expect(read.hooks.map(h => [h.label, h.query])).toEqual([
      ['Enter triggers', 'o:"when this creature enters"'],
      ['Quote "trick"', 'o:"legendary creature"'],
    ]);
    expect(read.hooks[0]).toMatchObject({ kind: 'ai', why: 'Copies trigger again.' });
  });
  it('fails clearly when nothing is usable', () => {
    expect(() => parseRead('{"summary": "x", "hooks": []}', [mi])).toThrow('no usable searches');
  });
});
