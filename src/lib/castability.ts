// Castability: the chance of having the right colored mana to cast each spell on curve.
// Follows Frank Karsten's approach: on the play, assuming you hit every land drop, and aiming for 90%.
import type { Card } from './scryfall';
import type { Deck } from './rules';
import { entriesOf, primaryType } from './rules';
import { COLORS, fetchTargets, landColors } from './analysis';

export const TARGET = 0.9;
const HAND = 7;
const SAMPLES = 10000;

const isLand = (c: Card) => primaryType(c) === 'Land';

/**
 * The colored requirements of a mana cost, one set of acceptable colors per symbol.
 * Generic, X, snow and Phyrexian symbols (payable with life) add no requirement;
 * {2/W} can be paid with generic mana, so it adds none either.
 */
export function colorRequirements(cost: string): string[][] {
  const reqs: string[][] = [];
  for (const [, sym] of cost.matchAll(/\{([^}]+)\}/g)) {
    const parts = sym.split('/');
    if (parts.includes('P') || parts.some(p => /^\d+$/.test(p))) continue;
    const colors = parts.filter(p => (COLORS as readonly string[]).includes(p) || p === 'C');
    if (colors.length) reqs.push(colors);
  }
  return reqs;
}

/** Whether the lands (each a list of colors it makes) can pay every requirement, one land per symbol. */
export function canPay(reqs: string[][], lands: string[][]): boolean {
  const owner: number[] = Array(lands.length).fill(-1);
  const assign = (r: number, seen: boolean[]): boolean => {
    for (let l = 0; l < lands.length; l++) {
      if (seen[l] || !lands[l].some(c => reqs[r].includes(c))) continue;
      seen[l] = true;
      if (owner[l] < 0 || assign(owner[l], seen)) { owner[l] = r; return true; }
    }
    return false;
  };
  return reqs.every((_, r) => assign(r, Array(lands.length).fill(false)));
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Exact chance of seeing at least `need` sources of a color by `turn`, given at least `turn` lands,
 * when `sources` of the deck's `lands` make that color.
 */
export function sourceOdds(deckSize: number, lands: number, sources: number, need: number, turn: number): number {
  const seen = Math.min(deckSize, HAND + turn - 1);
  let hitLands = 0, hitBoth = 0;
  for (let s = 0; s <= Math.min(sources, seen); s++) {
    for (let o = 0; o <= Math.min(lands - sources, seen - s); o++) {
      if (s + o < turn) continue;
      const p = choose(sources, s) * choose(lands - sources, o) * choose(deckSize - lands, seen - s - o);
      hitLands += p;
      if (s >= need) hitBoth += p;
    }
  }
  return hitLands ? hitBoth / hitLands : 0;
}

/** Fewest sources of a color that reach the target, or null if no split of the current lands does. */
export function sourcesNeeded(deckSize: number, lands: number, need: number, turn: number): number | null {
  for (let s = need; s <= lands; s++) if (sourceOdds(deckSize, lands, s, need, turn) >= TARGET) return s;
  return null;
}

export interface CastRow {
  card: Card;
  turn: number;
  /** Chance of having the colors on that turn, given you hit your land drops. */
  odds: number;
  /** Per color the spell is short on: sources the deck has and sources it should have (null = not reachable). */
  short: { color: string; have: number; need: number | null }[];
}

export interface Castability { rows: CastRow[]; landDrops: { turn: number; odds: number }[]; lands: number; deckSize: number }

/** Small seeded generator so the numbers don't jump around between renders. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function castability(deck: Deck): Castability {
  const entries = entriesOf(deck);
  const fetch = fetchTargets(deck);
  // The library is the main deck; commanders are cast from the command zone with lands drawn from it.
  const library: (string[] | null)[] = entries.flatMap(e => Array.from({ length: e.main }, () => (isLand(e.card) ? landColors(e.card, fetch) : null)));
  const deckSize = library.length;
  const lands = library.filter(Boolean).length;
  const spells = entries.filter(e => (e.main || e.cmdr) && !isLand(e.card) && e.card.cmc > 0)
    .map(e => ({ card: e.card, turn: Math.ceil(e.card.cmc), reqs: colorRequirements(e.card.mana_cost) }))
    .filter(s => s.reqs.length);
  const maxTurn = Math.max(4, ...spells.map(s => s.turn));

  // Simulate opening hands plus draws, and for each spell count the games where you hit your land drops
  // and whether those lands could pay its colors.
  const random = mulberry32(deckSize * 7919 + lands);
  const hits = spells.map(() => 0), tries = spells.map(() => 0);
  const dropHits = Array(maxTurn + 1).fill(0);
  if (deckSize >= HAND) {
    const lib = [...library];
    for (let n = 0; n < SAMPLES; n++) {
      const seenCount = Math.min(deckSize, HAND + maxTurn - 1);
      for (let i = 0; i < seenCount; i++) {
        const j = i + Math.floor(random() * (deckSize - i));
        [lib[i], lib[j]] = [lib[j], lib[i]];
      }
      const landsBy: string[][][] = [];
      for (let t = 1; t <= maxTurn; t++) {
        landsBy[t] = lib.slice(0, Math.min(deckSize, HAND + t - 1)).filter((x): x is string[] => !!x);
        if (landsBy[t].length >= t) dropHits[t]++;
      }
      spells.forEach((s, i) => {
        const seen = landsBy[s.turn];
        if (seen.length < s.turn) return;
        tries[i]++;
        if (canPay(s.reqs, seen)) hits[i]++;
      });
    }
  }

  const rows = spells.map((s, i) => {
    const short = [...new Set(s.reqs.filter(r => r.length === 1).map(r => r[0]))].flatMap(color => {
      const need = s.reqs.filter(r => r.length === 1 && r[0] === color).length;
      const have = library.filter(l => l?.includes(color)).length;
      const needed = sourcesNeeded(deckSize, lands, need, s.turn);
      return needed === null || needed > have ? [{ color, have, need: needed }] : [];
    });
    return { card: s.card, turn: s.turn, odds: tries[i] ? hits[i] / tries[i] : 0, short };
  }).sort((a, b) => a.odds - b.odds || a.turn - b.turn || a.card.name.localeCompare(b.card.name));

  const landDrops = [2, 3, 4].map(t => ({ turn: t, odds: deckSize >= HAND ? dropHits[t] / SAMPLES : 0 }));
  return { rows, landDrops, lands, deckSize };
}
