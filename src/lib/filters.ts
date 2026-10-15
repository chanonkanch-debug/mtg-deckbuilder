import type { Deck } from './rules';
import { commanderIdentity, entriesOf } from './rules';

// Quick filters: options within a group are OR'd, groups are AND'd together.
export interface FilterGroup { key: string; label: string; options: [label: string, query: string][] }

export const FILTERS: FilterGroup[] = [
  { key: 'mv', label: 'Mana value', options: [...[0, 1, 2, 3, 4, 5, 6].map(n => [String(n), `mv=${n}`] as [string, string]), ['7+', 'mv>=7']] },
  { key: 'type', label: 'Card type', options: ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Battle', 'Legendary'].map(t => [t, `t:${t.toLowerCase()}`]) },
  { key: 'color', label: 'Color', options: [['White', 'c:w'], ['Blue', 'c:u'], ['Black', 'c:b'], ['Red', 'c:r'], ['Green', 'c:g'], ['Colorless', 'c:c'], ['Multicolor', 'c:m']] },
  { key: 'rarity', label: 'Rarity', options: ['Common', 'Uncommon', 'Rare', 'Mythic'].map(r => [r, `r:${r.toLowerCase()}`]) },
];

const orGroup = (parts: string[]) => (parts.length > 1 ? `(${parts.join(' or ')})` : parts[0] || '');

/** active holds "groupKey:optionIndex" ids. */
export function filterQuery(active: Set<string>): string {
  return FILTERS.map(g => orGroup(g.options.filter((_, i) => active.has(`${g.key}:${i}`)).map(o => o[1]))).filter(Boolean).join(' ');
}

export function setsQuery(codes: Set<string>): string {
  return orGroup([...codes].map(c => `e:${c}`));
}

export interface QueryOptions { text: string; filters: Set<string>; sets: Set<string>; onlyLegal: boolean; onlyIdentity: boolean }

export function buildQuery(deck: Deck, o: QueryOptions): string {
  let q = [o.text.trim(), filterQuery(o.filters), setsQuery(o.sets)].filter(Boolean).join(' ');
  if (o.onlyLegal) q += ` f:${deck.format}`;
  if (deck.format === 'commander' && o.onlyIdentity && entriesOf(deck).some(e => e.cmdr)) {
    const ident = commanderIdentity(deck);
    q += ` id<=${ident.length ? ident.join('') : 'c'}`;
  }
  return q.trim();
}

export const MAIN_SET_TYPES = new Set(['core', 'expansion', 'masters', 'draft_innovation', 'commander', 'starter', 'funny']);
