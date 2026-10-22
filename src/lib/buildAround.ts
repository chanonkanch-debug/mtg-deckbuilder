import type { Card } from './scryfall';

// Build around: EDHREC's "played with" lists (edhrec.ts) and the AI read (src/ai) turn the picked cards into "hooks", each a Scryfall search for cards that
// feed or pay them off. This file holds what the hooks share: their shape, the user's own phrases, and the one
// search clause they add to the card search.

export type HookKind = 'played' | 'ai' | 'custom';
export interface Hook { id: string; label: string; kind: HookKind; query: string; seeds: string[]; why?: string }

/** A hook for a phrase the user types, like "the Ring tempts you". */
export function customHook(phrase: string): Hook {
  const p = phrase.trim().replace(/"/g, '');
  return { id: `custom:${p.toLowerCase()}`, label: p, kind: 'custom', query: `o:"${p}"`, seeds: [] };
}

/** Hooks beyond this many aren't added to the search, to keep the query a sensible length. */
export const MAX_HOOKS = 10;

/**
 * The search clause Build around adds to the card search: cards matching any turned-on hook, minus the seed
 * cards themselves. Hooks other than "played with" are limited to the seeds' colors (pass null when the
 * commander's colors already limit the search); the cards decks play with a seed can be in other colors.
 */
export function buildAroundQuery(seeds: Card[], hooks: Hook[], identity: string | null): string {
  if (!hooks.length) return '';
  const used = hooks.slice(0, MAX_HOOKS);
  const or = (qs: string[]) => (qs.length > 1 ? `(${qs.join(' or ')})` : qs[0]);
  const played = used.filter(h => h.kind === 'played').map(h => h.query);
  const rest = used.filter(h => h.kind !== 'played').map(h => h.query);
  const restClause = rest.length && identity ? `(${or(rest)} id<=${identity})` : rest.length ? or(rest) : '';
  const any = [...played, ...(restClause ? [restClause] : [])];
  return [or(any), ...seeds.map(s => `-!"${s.name.replace(/"/g, '')}"`)].join(' ');
}

/** The seeds' colors together, as a Scryfall color identity. */
export function identityFor(seeds: Card[]): string {
  const colors = [...new Set(seeds.flatMap(s => s.color_identity))];
  return ['W', 'U', 'B', 'R', 'G'].filter(c => colors.includes(c)).join('') || 'c';
}
