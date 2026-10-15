// Deck analysis used by the deck panel: grouping, color breakdowns, mana base and opening-hand odds.
import type { Card } from './scryfall';
import type { Board, Deck, DeckEntry } from './rules';
import { entriesOf, primaryType, TYPE_ORDER } from './rules';

export const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
export type Color = (typeof COLORS)[number];
export const COLOR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', M: 'Multicolor', C: 'Colorless' };

const isLand = (c: Card) => primaryType(c) === 'Land';

/** W/U/B/R/G for mono-colored cards, M for multicolor, C for colorless. */
export function colorKey(card: Card): string {
  const colors = card.colors.filter(c => (COLORS as readonly string[]).includes(c));
  return colors.length === 0 ? 'C' : colors.length > 1 ? 'M' : colors[0];
}

export interface Group { key: string; title: string; board: Board; entries: DeckEntry[]; count: number }

const PLURAL: Record<string, string> = { Sorcery: 'Sorceries', Other: 'Other' };
const byCmcThenName = (a: DeckEntry, b: DeckEntry) => a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name);

/** Groups the deck for display: commander first, main deck by the chosen key, sideboard last. */
export function groupDeck(deck: Deck, by: 'type' | 'mv' | 'color'): Group[] {
  const all = entriesOf(deck);
  const groups: Group[] = [];
  const push = (key: string, title: string, board: Board, entries: DeckEntry[]) => {
    if (entries.length) groups.push({ key, title, board, entries: [...entries].sort(byCmcThenName), count: entries.reduce((n, e) => n + e[board], 0) });
  };
  push('cmdr', 'Commander', 'cmdr', all.filter(e => e.cmdr));
  const main = all.filter(e => e.main);
  if (by === 'type') {
    for (const t of [...TYPE_ORDER, 'Other']) push(`t:${t}`, PLURAL[t] || t + 's', 'main', main.filter(e => primaryType(e.card) === t));
  } else if (by === 'mv') {
    const spells = main.filter(e => !isLand(e.card));
    for (let mv = 0; mv <= 7; mv++) {
      push(`mv:${mv}`, mv === 7 ? 'Mana value 7+' : `Mana value ${mv}`, 'main',
        spells.filter(e => (mv === 7 ? e.card.cmc >= 7 : Math.floor(e.card.cmc) === mv)));
    }
    push('lands', 'Lands', 'main', main.filter(e => isLand(e.card)));
  } else {
    const spells = main.filter(e => !isLand(e.card));
    for (const k of [...COLORS, 'M', 'C']) push(`c:${k}`, COLOR_NAMES[k], 'main', spells.filter(e => colorKey(e.card) === k));
    push('lands', 'Lands', 'main', main.filter(e => isLand(e.card)));
  }
  push('side', 'Sideboard', 'side', all.filter(e => e.side));
  return groups;
}

/** Nonland main-deck cards per mana value (0..6, 7+), split by color key. */
export function curveByColor(deck: Deck): Record<string, number>[] {
  const curve = Array.from({ length: 8 }, () => ({} as Record<string, number>));
  entriesOf(deck).filter(e => e.main && !isLand(e.card)).forEach(e => {
    const slot = curve[Math.min(7, Math.floor(e.card.cmc))];
    const k = colorKey(e.card);
    slot[k] = (slot[k] || 0) + e.main;
  });
  return curve;
}

/** Main-deck card counts per primary type, in display order, skipping empty types. */
export function typeCounts(deck: Deck): [string, number][] {
  const counts: Record<string, number> = {};
  entriesOf(deck).filter(e => e.main).forEach(e => { const t = primaryType(e.card); counts[t] = (counts[t] || 0) + e.main; });
  return [...TYPE_ORDER, 'Other'].filter(t => counts[t]).map(t => [t, counts[t]]);
}

export interface ManaBaseRow { color: Color; pips: number; share: number; sources: number; suggested: number }

const BASIC_TYPES: [string, Color][] = [['Plains', 'W'], ['Island', 'U'], ['Swamp', 'B'], ['Mountain', 'R'], ['Forest', 'G']];

/** What fetch lands in this deck can find: colors of its basic lands, and colors of every basic land type among its lands. */
export interface FetchTargets { basic: string[]; typed: string[] }
export function fetchTargets(deck: Deck): FetchTargets {
  const lands = entriesOf(deck).filter(e => e.main && isLand(e.card)).map(e => e.card);
  const colorsOfTypes = (cards: Card[]) => BASIC_TYPES.filter(([t]) => cards.some(c => new RegExp(`—.*\\b${t}\\b`).test(c.type_line))).map(([, c]) => c);
  return { basic: colorsOfTypes(lands.filter(c => /\bBasic\b/.test(c.type_line))), typed: colorsOfTypes(lands) };
}

/**
 * Colors a land can make. Uses Scryfall's produced_mana, or the land's color identity for older saved cards.
 * Fetch lands make no mana themselves, so they count as the colors they can find in this deck: the land
 * types they name, or every basic land for "search for a basic land card".
 */
export function landColors(card: Card, fetch: FetchTargets = { basic: [], typed: [] }): string[] {
  const made = card.produced_mana ?? card.color_identity;
  if (made.some(c => c !== 'C')) return made;
  const search = card.oracle_text.match(/search your library for ([^.]*?)cards?/i)?.[1];
  if (!search || !/land|plains|island|swamp|mountain|forest/i.test(search)) return made;
  const named = BASIC_TYPES.filter(([t]) => search.includes(t)).map(([, c]) => c);
  return named.length ? named.filter(c => fetch.typed.includes(c)) : fetch.basic;
}

/**
 * Some lands make colored mana that can only be spent on certain spells, like Great Hall of the Biblioplex
 * (instants and sorceries) or Ancient Ziggurat (creatures). Returns which spells that mana can cast,
 * or null when the land's mana can be spent on anything. Restrictions we don't recognize count as no restriction.
 */
export function spendLimit(card: Card): ((spell: Card) => boolean) | null {
  const on = card.oracle_text.toLowerCase().match(/spend this mana only to cast (?:an? )?([^.]*?)spells?\b/)?.[1];
  if (!on) return null;
  if (/instant or sorcery/.test(on)) return s => /\b(Instant|Sorcery)\b/.test(s.type_line);
  if (/multicolored/.test(on)) return s => s.colors.length > 1;
  if (/creature/.test(on)) return s => /\bCreature\b/.test(s.type_line); // "of the chosen type" is assumed to fit
  if (/artifact/.test(on)) return s => /\bArtifact\b/.test(s.type_line);
  return null;
}

/** Colors a land can spend on this spell: its restricted colored mana drops out when the spell doesn't qualify. */
export function colorsFor(colors: string[], limit: ((spell: Card) => boolean) | null, spell: Card): string[] {
  return !limit || limit(spell) ? colors : colors.filter(c => c === 'C');
}

export interface LandColorCount { lands: number; byColor: { color: string; count: number }[]; colorless: number }

/** How many of the deck's lands make each color (a dual counts for both), and how many make no colored mana. */
export function landColorCounts(deck: Deck): LandColorCount {
  const fetch = fetchTargets(deck);
  const main = entriesOf(deck).filter(e => e.main && isLand(e.card));
  const colorsOf = main.map(e => ({ n: e.main, colors: landColors(e.card, fetch) }));
  return {
    lands: main.reduce((n, e) => n + e.main, 0),
    byColor: COLORS.map(color => ({ color, count: colorsOf.filter(l => l.colors.includes(color)).reduce((n, l) => n + l.n, 0) })).filter(c => c.count),
    colorless: colorsOf.filter(l => !l.colors.some(c => c !== 'C')).reduce((n, l) => n + l.n, 0),
  };
}

/**
 * Compares colored mana symbols in nonland cards with lands that produce each color, and suggests
 * splitting the deck's current land count in proportion to the symbols.
 */
export function manaBase(deck: Deck): { rows: ManaBaseRow[]; lands: number } {
  const main = entriesOf(deck).filter(e => e.main);
  const lands = main.filter(e => isLand(e.card)).reduce((n, e) => n + e.main, 0);
  const pips: Record<string, number> = {};
  main.filter(e => !isLand(e.card)).forEach(e => {
    (e.card.mana_cost.match(/\{[^}]+\}/g) || []).forEach(sym => {
      for (const c of COLORS) if (sym.includes(c)) pips[c] = (pips[c] || 0) + e.main;
    });
  });
  const totalPips = COLORS.reduce((n, c) => n + (pips[c] || 0), 0);
  const fetch = fetchTargets(deck);
  const rows = COLORS.filter(c => pips[c]).map(c => {
    const share = pips[c] / totalPips;
    const sources = main.filter(e => isLand(e.card) && landColors(e.card, fetch).includes(c)).reduce((n, e) => n + e.main, 0);
    return { color: c, pips: pips[c], share, sources, suggested: Math.round(share * lands) };
  });
  return { rows, lands };
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Probability of exactly k successes when drawing `draws` cards from `deck` cards containing `hits` successes. */
export function hypergeometric(deck: number, hits: number, draws: number, k: number): number {
  if (deck <= 0 || draws > deck) return 0;
  return (choose(hits, k) * choose(deck - hits, draws - k)) / choose(deck, draws);
}

/** The main deck as a flat list of cards, one element per copy, for drawing sample hands. */
export function libraryOf(deck: Deck): Card[] {
  return entriesOf(deck).flatMap(e => Array.from({ length: e.main }, () => e.card));
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
