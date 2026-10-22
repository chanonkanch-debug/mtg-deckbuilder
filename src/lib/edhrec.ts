import { cacheRead, cacheWrite } from './scryfall';
import type { Hook } from './buildAround';

// Build around's "played with": the cards EDHREC sees in Commander decks alongside a card. EDHREC publishes one
// JSON page per card; its card lists count, among the decks with that card, how many also play each other card
// (num_decks of potential_decks) and how much more often than usual (lift).

const BASE = import.meta.env.DEV ? '/edhrec' : 'https://json.edhrec.com'; // in dev, vite.config.ts proxies /edhrec
/** At most this many cards go into one "played with" search, to keep the query a sensible length. */
export const PLAYED_MAX = 40;
// A card counts as played with the seed when enough of the seed's decks play it and it shows up there clearly more
// often than in decks in general, which leaves out staples every deck plays.
const MIN_DECKS = 10;
const MIN_LIFT = 1.5;

export interface PlayedWith { name: string; decks: number; potential: number; lift: number }
export interface PlayedRead { seed: string; cards: PlayedWith[] }

/** EDHREC's page name for a card: the front face, lowercase, accents and punctuation dropped, spaces as hyphens. */
export function edhrecSlug(name: string): string {
  return name.split(' // ')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['",.!?:()]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** The cards played with the seed, most played first, from an EDHREC card page. */
export function parsePlayed(seed: string, raw: any): PlayedRead {
  const lists: any[] = raw?.container?.json_dict?.cardlists ?? [];
  const best = new Map<string, PlayedWith>();
  for (const list of lists) {
    if (/commander/i.test(list.header ?? '')) continue; // the commanders that play it, not cards to add
    for (const v of list.cardviews ?? []) {
      if (!v?.name || v.name === seed) continue;
      const card = { name: v.name, decks: v.num_decks ?? 0, potential: v.potential_decks ?? 0, lift: v.lift ?? 0 };
      if (card.decks >= MIN_DECKS && card.lift >= MIN_LIFT && !best.has(card.name)) best.set(card.name, card);
    }
  }
  const cards = [...best.values()].sort((a, b) => b.decks - a.decks);
  return { seed, cards };
}

export class EdhrecError extends Error {}

export async function fetchPlayedWith(seed: string): Promise<PlayedRead> {
  const url = `${BASE}/pages/cards/${edhrecSlug(seed)}.json`;
  const hit = cacheRead('edhrec:' + url);
  if (hit) return hit.v as PlayedRead;
  let res: Response;
  try { res = await fetch(url, { headers: { Accept: 'application/json' } }); }
  catch { throw new EdhrecError("Couldn't reach EDHREC."); }
  if (res.status === 404) throw new EdhrecError(`EDHREC has no Commander decks with ${seed}.`);
  if (!res.ok) throw new EdhrecError(`EDHREC error ${res.status}.`);
  const read = parsePlayed(seed, await res.json());
  cacheWrite('edhrec:' + url, read, true);
  return read;
}

/** The search hook for a "played with" read: any of its most played cards. */
export function playedHook(read: PlayedRead): Hook | null {
  const top = read.cards.slice(0, PLAYED_MAX);
  if (!top.length) return null;
  const names = top.map(c => `!"${c.name.split(' // ')[0].replace(/"/g, '')}"`);
  return {
    id: `played:${read.seed}`, label: `Played with ${read.seed}`, kind: 'played', seeds: [read.seed],
    query: names.length > 1 ? `(${names.join(' or ')})` : names[0],
    why: `The ${top.length} cards Commander decks on EDHREC play most often with ${read.seed}, leaving out staples.`,
  };
}
