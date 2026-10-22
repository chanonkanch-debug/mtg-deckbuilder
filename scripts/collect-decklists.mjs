// Collects recent MTGO tournament decklists from mtgo.com into public/decks/<format>.json, for Build around's
// "played with" in 60-card formats (src/lib/decklists.ts). Runs in the deploy workflow; no dependencies.
//
//   node scripts/collect-decklists.mjs [days=60]
//
// Each event page is reduced to its main decks and kept in .decklist-cache/, so later runs only fetch new events.

import { mkdir, readFile, writeFile } from 'node:fs/promises';

const FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper'];
const SITE = 'https://www.mtgo.com';
const CACHE = '.decklist-cache';
const OUT = 'public/decks';
const DAYS = Number(process.argv[2]) || 60;
const GAP_MS = 500; // between requests to mtgo.com
const UA = 'mtg-deckbuilder decklist collector (github.com/chanonkanch-debug/mtg-deckbuilder)';

const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0;
async function get(path) {
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const res = await fetch(SITE + path, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

/** Event links on a month's decklist index, like /decklist/modern-challenge-32-2026-10-2112856954. */
export function eventLinks(html) {
  return [...new Set([...html.matchAll(/href="(\/decklist\/[^"]+)"/g)].map(m => m[1]))];
}

/** The format and date in an event link, or null for formats this app doesn't cover. */
export function eventInfo(link) {
  const m = link.match(/^\/decklist\/([a-z]+)-.*?-(\d{4})-(\d{2})-(\d{2})\d*$/);
  if (!m || !FORMATS.includes(m[1])) return null;
  return { format: m[1], date: `${m[2]}-${m[3]}-${m[4]}` };
}

/** Front face names, written the way Scryfall writes them. */
const cardName = n => n.trim().replace(/\s*\/\/?\s*/g, ' // ');

/** Each deck's main deck card names, from an event page. */
export function parseEvent(html) {
  const m = html.match(/window\.MTGO\.decklists\.data\s*=\s*(\{.*?\});\s*\n/s);
  if (!m) throw new Error('no decklist data on the page');
  const data = JSON.parse(m[1]);
  return (data.decklists ?? []).map(d => [...new Set((d.main_deck ?? []).map(c => cardName(c.card_attributes?.card_name ?? '')).filter(Boolean))]);
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  await mkdir(OUT, { recursive: true });
  const since = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
  const months = [];
  for (let d = new Date(); d.toISOString().slice(0, 7) >= since.slice(0, 7); d.setUTCDate(0)) months.push(d.toISOString().slice(0, 7));

  const events = [];
  for (const month of months) {
    const links = eventLinks(await get(`/decklists/${month.replace('-', '/')}`));
    for (const link of links) {
      const info = eventInfo(link);
      if (info && info.date >= since) events.push({ link, ...info });
    }
  }
  console.log(`${events.length} events since ${since}`);

  const byFormat = Object.fromEntries(FORMATS.map(f => [f, { events: 0, decks: [] }]));
  let fetched = 0, failed = 0;
  for (const ev of events) {
    const file = `${CACHE}/${ev.link.split('/').pop()}.json`;
    let decks;
    try { decks = JSON.parse(await readFile(file, 'utf8')); }
    catch {
      try {
        decks = parseEvent(await get(ev.link));
        await writeFile(file, JSON.stringify(decks));
        if (++fetched % 25 === 0) console.log(`fetched ${fetched} events…`);
      } catch (err) { failed++; console.warn(`skipped ${ev.link}: ${err.message}`); continue; }
    }
    byFormat[ev.format].events++;
    byFormat[ev.format].decks.push(...decks);
  }
  console.log(`fetched ${fetched} new events, ${failed} failed`);

  for (const [format, { events: n, decks }] of Object.entries(byFormat)) {
    const index = new Map();
    const id = name => { if (!index.has(name)) index.set(name, index.size); return index.get(name); };
    const packed = decks.map(cards => cards.map(id));
    const out = { format, updated: new Date().toISOString().slice(0, 10), since, events: n, names: [...index.keys()], decks: packed };
    await writeFile(`${OUT}/${format}.json`, JSON.stringify(out));
    console.log(`${format}: ${decks.length} decks from ${n} events, ${index.size} cards`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(err => { console.error(err); process.exit(1); });
