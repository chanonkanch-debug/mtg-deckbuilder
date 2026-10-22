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
 * cards themselves, in the seeds' colors (pass null when the commander's colors already limit the search).
 */
export function buildAroundQuery(seeds: Card[], hooks: Hook[], identity: string | null): string {
  if (!hooks.length) return '';
  const any = hooks.slice(0, MAX_HOOKS).map(h => h.query);
  const parts = [any.length > 1 ? `(${any.join(' or ')})` : any[0]];
  parts.push(...seeds.map(s => `-!"${s.name.replace(/"/g, '')}"`));
  if (identity) parts.push(`id<=${identity}`);
  return parts.join(' ');
}

/** The seeds' colors together, as a Scryfall color identity. */
export function identityFor(seeds: Card[]): string {
  const colors = [...new Set(seeds.flatMap(s => s.color_identity))];
  return ['W', 'U', 'B', 'R', 'G'].filter(c => colors.includes(c)).join('') || 'c';
}
