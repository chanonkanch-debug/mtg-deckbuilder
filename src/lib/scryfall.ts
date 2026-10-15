// Scryfall API client: rate limiting, response caching and the slim card shape the app stores.
// API docs: https://scryfall.com/docs/api

const API = 'https://api.scryfall.com';
// Scryfall asks for 50-100 ms between requests.
const MIN_GAP_MS = 100;

export type Legality = 'legal' | 'not_legal' | 'banned' | 'restricted';

export interface Card {
  id: string;
  name: string;
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  colors: string[];
  color_identity: string[];
  legalities: Record<string, Legality>;
  img: string;
  img_small: string;
  img_large: string;
  img_back: string;
  usd: string | null;
  uri?: string;
  set?: string;
  set_name?: string;
  rarity?: string;
  pt: string;
}

export interface SearchPage {
  total_cards: number;
  has_more: boolean;
  next_page?: string;
  warnings?: string[];
  data: Card[];
}

export interface SetInfo {
  code: string;
  name: string;
  set_type: string;
  released_at?: string;
  card_count: number;
  digital: boolean;
  icon_svg_uri?: string;
}

export class ScryfallError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let lastRequest = 0;
let queue: Promise<unknown> = Promise.resolve();

/** Calls Scryfall one request at a time, spaced MIN_GAP_MS apart. */
export function api<T = any>(pathOrUrl: string, options: RequestInit = {}): Promise<T> {
  const run = async () => {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : API + pathOrUrl;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, { ...options, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ScryfallError(json.details || `Scryfall error ${res.status}`, res.status);
    return json as T;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

// ---------- Response cache ----------
// Scryfall updates card data about once a day, so cached GET results are reused for 24 hours.
// Recent results live in memory; up to CACHE_MAX entries also persist in localStorage across visits.
const CACHE_PREFIX = 'mtg-deck-builder:cache:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 60;
interface CacheEntry { t: number; v: unknown }
const memCache = new Map<string, CacheEntry>();

function cacheKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
    }
  } catch {}
  return keys;
}
function evictOldest(): boolean {
  const entries = cacheKeys().map(k => {
    let t = 0;
    try { t = JSON.parse(localStorage.getItem(k) || '{}').t || 0; } catch {}
    return [k, t] as const;
  });
  if (!entries.length) return false;
  entries.sort((a, b) => a[1] - b[1]);
  try { localStorage.removeItem(entries[0][0]); } catch { return false; }
  return true;
}
function cacheRead(key: string): CacheEntry | null {
  let hit = memCache.get(key);
  if (!hit) {
    try { hit = JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || 'null') ?? undefined; } catch {}
  }
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) { memCache.set(key, hit); return hit; }
  return null;
}
export function cacheWrite(key: string, value: unknown, persist: boolean) {
  const entry = { t: Date.now(), v: value };
  memCache.set(key, entry);
  if (!persist) return;
  for (let tries = 0; tries < 10; tries++) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
      let n = cacheKeys().length;
      while (n-- > CACHE_MAX && evictOldest());
      return;
    } catch {
      if (!evictOldest()) return; // storage full: drop the oldest entry and retry
    }
  }
}
export function clearCache() {
  memCache.clear();
  cacheKeys().forEach(k => { try { localStorage.removeItem(k); } catch {} });
}

/** GET through the cache. transform() shrinks the response before it is stored. */
export async function cachedGet<T>(pathOrUrl: string, transform: (raw: any) => T, persist = true): Promise<{ value: T; cached: boolean }> {
  const hit = cacheRead(pathOrUrl);
  if (hit) return { value: hit.v as T, cached: true };
  const value = transform(await api(pathOrUrl));
  cacheWrite(pathOrUrl, value, persist);
  return { value, cached: false };
}

// ---------- Shapes ----------
/** Keeps only the fields the app uses so saved decks and cached pages stay small. */
export function slimCard(c: any): Card {
  const faces: any[] = c.card_faces || [];
  const face = faces[0] || {};
  const imgs = c.image_uris || face.image_uris || {};
  const colors: string[] = c.colors || faces.flatMap(f => f.colors || []);
  const back = !c.image_uris && faces[1]?.image_uris;
  return {
    id: c.id,
    name: c.name,
    mana_cost: c.mana_cost ?? faces.map(f => f.mana_cost).filter(Boolean).join(' // '),
    cmc: c.cmc || 0,
    type_line: c.type_line || face.type_line || '',
    oracle_text: c.oracle_text ?? faces.map(f => f.oracle_text || '').join('\n'),
    colors: [...new Set(colors)],
    color_identity: c.color_identity || [],
    legalities: c.legalities || {},
    img: imgs.normal || imgs.large || imgs.small || '',
    img_small: imgs.small || imgs.normal || '',
    img_large: imgs.large || imgs.normal || '',
    img_back: (back && (back.large || back.normal)) || '',
    usd: c.prices?.usd || c.prices?.usd_foil || null,
    uri: c.scryfall_uri,
    set: c.set,
    set_name: c.set_name,
    rarity: c.rarity,
    pt: c.power != null ? `${c.power}/${c.toughness}` : c.loyalty ? `Loyalty ${c.loyalty}` : '',
  };
}

export const slimPage = (res: any): SearchPage => ({
  total_cards: res.total_cards,
  has_more: res.has_more,
  next_page: res.next_page,
  warnings: res.warnings,
  data: res.data.map(slimCard),
});

// ---------- Endpoints ----------
export interface SearchParams { q: string; order: string; dir: 'asc' | 'desc' }

export function searchUrl({ q, order, dir }: SearchParams) {
  return `/cards/search?${new URLSearchParams({ q, order, dir, unique: 'cards' })}`;
}

/** Fetches one Scryfall result page. A search with no matches (HTTP 404) returns an empty page. */
export async function searchCards(url: string): Promise<{ page: SearchPage; cached: boolean }> {
  try {
    const { value, cached } = await cachedGet(url, slimPage);
    return { page: value, cached };
  } catch (err) {
    if (!(err instanceof ScryfallError) || err.status !== 404) throw err;
    const empty: SearchPage = { total_cards: 0, has_more: false, data: [] };
    cacheWrite(url, empty, true); // remember empty searches too
    return { page: empty, cached: false };
  }
}

export async function autocomplete(text: string): Promise<string[]> {
  const { value } = await cachedGet(`/cards/autocomplete?q=${encodeURIComponent(text.toLowerCase())}`, r => r.data as string[], false);
  return value;
}

export async function fetchSets(): Promise<SetInfo[]> {
  const { value } = await cachedGet('/sets', res =>
    (res.data as any[]).map(s => ({
      code: s.code, name: s.name, set_type: s.set_type, released_at: s.released_at,
      card_count: s.card_count, digital: s.digital, icon_svg_uri: s.icon_svg_uri,
    })));
  return value.filter(s => s.card_count > 0 && !['token', 'memorabilia', 'minigame'].includes(s.set_type));
}

export interface CollectionId { name: string; set?: string }

/** Looks up cards by name in batches of 75 (Scryfall's limit for /cards/collection). */
export async function fetchCollection(ids: CollectionId[]): Promise<{ found: Card[]; notFound: string[] }> {
  const found: Card[] = [];
  const notFound: string[] = [];
  for (let i = 0; i < ids.length; i += 75) {
    const res = await api('/cards/collection', { method: 'POST', body: JSON.stringify({ identifiers: ids.slice(i, i + 75) }) });
    (res.not_found || []).forEach((nf: CollectionId) => notFound.push(nf.name));
    res.data.forEach((c: any) => found.push(slimCard(c)));
  }
  return { found, notFound };
}
