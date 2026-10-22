import type { Hook } from './buildAround';
import type { Format } from './rules';

// Build around's "played with" for 60-card formats: recent MTGO tournament decks, collected daily by
// scripts/collect-decklists.mjs into public/decks/<format>.json (main decks only, card names as indexes).

export interface DeckData { format: string; updated: string; since: string; events: number; names: string[]; decks: number[][] }
export interface PlayedInDecks { seed: string; format: string; seedDecks: number; totalDecks: number; cards: { name: string; decks: number; lift: number }[] }

export const MTGO_FORMATS: Format[] = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper'];
/** At most this many cards go into one "played with" search, to keep the query a sensible length. */
const PLAYED_MAX = 40;
// A card counts as played with the seed when at least MIN_SHARE of the seed's decks (and MIN_DECKS decks) play it,
// and it shows up there at least MIN_LIFT times as often as in all decks, which leaves out format staples.
const MIN_DECKS = 3, MIN_SHARE = 0.05, MIN_LIFT = 1.2;
const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']);

const front = (n: string) => n.split(' // ')[0].toLowerCase();

const loaded = new Map<string, Promise<DeckData>>();
export function loadDecks(format: string): Promise<DeckData> {
  if (!loaded.has(format)) {
    const p = fetch(`./decks/${format}.json`).then(r => {
      if (!r.ok) throw new Error(`No ${format} tournament decks have been collected yet.`);
      return r.json() as Promise<DeckData>;
    });
    p.catch(() => loaded.delete(format));
    loaded.set(format, p);
  }
  return loaded.get(format)!;
}

/** The cards most played in decks with the seed, most played first. */
export function playedInDecks(data: DeckData, seed: string): PlayedInDecks {
  const want = front(seed);
  const seedId = data.names.findIndex(n => front(n) === want);
  const result: PlayedInDecks = { seed, format: data.format, seedDecks: 0, totalDecks: data.decks.length, cards: [] };
  if (seedId < 0) return result;
  const all = new Map<number, number>(), withSeed = new Map<number, number>();
  for (const deck of data.decks) {
    const has = deck.includes(seedId);
    if (has) result.seedDecks++;
    for (const c of deck) {
      all.set(c, (all.get(c) ?? 0) + 1);
      if (has) withSeed.set(c, (withSeed.get(c) ?? 0) + 1);
    }
  }
  const n = result.seedDecks, total = data.decks.length;
  for (const [c, k] of withSeed) {
    const name = data.names[c];
    if (c === seedId || BASICS.has(name)) continue;
    const lift = (k / n) / (all.get(c)! / total);
    if (k >= MIN_DECKS && k / n >= MIN_SHARE && lift >= MIN_LIFT) result.cards.push({ name, decks: k, lift });
  }
  result.cards.sort((a, b) => b.decks - a.decks || b.lift - a.lift);
  return result;
}

const FORMAT_NAME: Record<string, string> = { standard: 'Standard', pioneer: 'Pioneer', modern: 'Modern', legacy: 'Legacy', vintage: 'Vintage', pauper: 'Pauper' };

/** The search hook for a "played with" read: any of its most played cards. */
export function deckHook(read: PlayedInDecks): Hook | null {
  const top = read.cards.slice(0, PLAYED_MAX);
  if (!top.length) return null;
  const names = top.map(c => `!"${c.name.split(' // ')[0].replace(/"/g, '')}"`);
  const fmt = FORMAT_NAME[read.format] ?? read.format;
  return {
    id: `played:${read.seed}`, label: `Played with ${read.seed}`, kind: 'played', seeds: [read.seed],
    query: names.length > 1 ? `(${names.join(' or ')})` : names[0],
    why: `${read.seed} is in ${read.seedDecks} of ${read.totalDecks} recent ${fmt} decks from MTGO tournaments. These are the ${top.length} cards those decks play most, leaving out the format's staples.`,
  };
}
