// Goldfish simulator: plays the deck alone many times (no opponent) to measure how it develops:
// mulligans, mana screw and flood, mana used per turn, and which cards get stuck in hand.
import type { Card } from './scryfall';
import type { Deck } from './rules';
import { entriesOf, playsAsLand } from './rules';
import { colorsFor, fetchTargets, landColors, spendLimit, type FetchTargets } from './analysis';
import { colorRequirements } from './castability';
import { manaMade, rolesOf } from './roles';

export const TURNS = 8;
const HAND = 7;

/** One mana: the colors it can be spent as ('C' for colorless), and which spells its colored mana can cast if limited. */
type Mana = string[] & { limit?: (spell: Card) => boolean };

interface SimCard {
  card: Card;
  land: boolean;
  tapped: boolean;
  cmc: number;
  reqs: string[][];
  /** Mana this permanent adds each turn from the turn after it's cast. */
  makes: Mana[];
  /** Lands a ramp spell puts onto the battlefield (tapped). */
  rampLands: number;
  /** Cards an instant or sorcery draws when it resolves. */
  draws: number;
  colors: Mana;
}

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const ALL = ['W', 'U', 'B', 'R', 'G'];

function prepare(card: Card, fetch: FetchTargets): SimCard {
  const text = card.oracle_text.toLowerCase().replace(/\([^)]*\)/g, '');
  const land = playsAsLand(card);
  const spell = /\b(Instant|Sorcery)\b/.test(card.type_line);
  const roles = land ? [] : rolesOf(card);
  const makes: Mana[] = manaMade(card);
  let rampLands = 0, draws = 0;
  if (roles.includes('ramp') && /search your library for [^.]*lands?/.test(text)) {
    rampLands = /put (them|those cards|both) onto the battlefield/.test(text) ? 2 : 1;
  }
  if (spell) {
    const d = text.match(/draws? (a|an|one|two|three|four|five|six|seven) cards?/);
    if (d && !/target (player|opponent) draws/.test(text)) draws = WORDS[d[1]];
  }
  return {
    card, land, cmc: Math.ceil(card.cmc), reqs: colorRequirements(card.mana_cost), makes, rampLands, draws,
    tapped: land && /enters( the battlefield)? tapped(?! unless)/.test(text) && !/unless|you may pay/.test(text),
    colors: land ? (lc => Object.assign(lc.length ? [...lc] : ['C'], { limit: spendLimit(card) ?? undefined }))(landColors(card, fetch)) : [],
  };
}

/**
 * Pays a cost from a pool of mana, returning the pool that's left or null if it can't be paid.
 * Colored symbols are matched to mana first; generic is paid with the least flexible mana.
 */
export function pay(reqs: string[][], cmc: number, pool: Mana[], spell?: Card): Mana[] | null {
  // Mana limited to other kinds of spells (Great Hall's colors for a creature) can't be used at all here.
  const usable = (m: Mana) => (spell ? colorsFor(m, m.limit ?? null, spell) : m);
  const unusable = pool.filter(m => !usable(m).length);
  const open = pool.filter(m => usable(m).length);
  if (open.length < cmc) return null;
  // Narrowest mana first, so flexible mana is saved for later spells. Colorless counts as narrowest.
  const width = (m: Mana) => (usable(m).length === 1 && usable(m)[0] === 'C' ? 0 : usable(m).length);
  const sorted = [...open].sort((a, b) => width(a) - width(b));
  const owner: number[] = Array(sorted.length).fill(-1);
  const assign = (r: number, seen: boolean[]): boolean => {
    for (let m = 0; m < sorted.length; m++) {
      if (seen[m] || !usable(sorted[m]).some(c => reqs[r].includes(c))) continue;
      seen[m] = true;
      if (owner[m] < 0 || assign(owner[m], seen)) { owner[m] = r; return true; }
    }
    return false;
  };
  if (!reqs.every((_, r) => assign(r, Array(sorted.length).fill(false)))) return null;
  const left = sorted.filter((_, m) => owner[m] < 0);
  return [...unusable, ...left.slice(Math.max(0, cmc - reqs.length))];
}

export interface TurnStats { turn: number; lands: number; available: number; spent: number; idle: number }
export interface StuckCard { card: Card; rate: number }
export interface GameLog { turn: number; land?: string; cast: string[]; mana: number }

export interface Goldfish {
  games: number;
  mulligan: number;
  screw: number;
  flood: number;
  turns: TurnStats[];
  stuck: StuckCard[];
  commander?: { name: string; onCurve: number; avgTurn: number | null };
  sample: { hand: string[]; mulligans: number; log: GameLog[] };
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Keeps 7 with 2-5 lands, 6 with 2-4, otherwise mulligans; London mulligan puts the worst cards on the bottom. */
function drawOpening(library: SimCard[], random: () => number): { hand: SimCard[]; lib: SimCard[]; mulligans: number } {
  for (let mulligans = 0; ; mulligans++) {
    const lib = shuffled(library, random);
    const hand = lib.splice(0, HAND);
    const lands = hand.filter(c => c.land).length;
    const keep = mulligans >= 2 || (mulligans === 0 ? lands >= 2 && lands <= 5 : lands >= 2 && lands <= 4);
    if (!keep) continue;
    for (let i = 0; i < mulligans; i++) {
      const nLands = hand.filter(c => c.land).length;
      // Bottom a land when flooded, else the most expensive spell.
      const idx = nLands > 3 ? hand.findIndex(c => c.land)
        : hand.reduce((best, c, j) => (!c.land && (best < 0 || c.cmc > hand[best].cmc) ? j : best), -1);
      lib.push(...hand.splice(idx < 0 ? 0 : idx, 1));
    }
    return { hand, lib, mulligans };
  }
}

interface GameResult { mulligans: number; turns: TurnStats[]; stuck: Set<SimCard>; drawn: Set<SimCard>; cmdrTurn: number | null; log: GameLog[]; hand: string[]; seenLands6: number }

function playGame(library: SimCard[], commanders: SimCard[], random: () => number, fetchColors: Mana): GameResult {
  const { hand, lib, mulligans } = drawOpening(library, random);
  const opening = hand.map(c => c.card.name);
  const drawn = new Set(hand);
  const battlefield: { mana: Mana[]; from: number }[] = [];
  const command = [...commanders];
  const turns: TurnStats[] = [], log: GameLog[] = [];
  let cmdrTurn: number | null = null, landCount = 0, seenLands6 = hand.filter(c => c.land).length;
  const draw = (n: number, turn: number) => {
    for (let i = 0; i < n && lib.length; i++) {
      const c = lib.shift()!;
      hand.push(c); drawn.add(c);
      if (c.land && turn <= 6) seenLands6++;
    }
  };

  for (let turn = 1; turn <= TURNS; turn++) {
    if (turn > 1) draw(1, turn); // on the play
    const entry: GameLog = { turn, cast: [], mana: 0 };
    // Land drop: prefer an untapped land that makes a color the hand needs and the battlefield lacks.
    const lands = hand.filter(c => c.land);
    if (lands.length) {
      const have = new Set(battlefield.flatMap(p => p.mana.flat()));
      const want = new Set(hand.filter(c => !c.land).flatMap(c => c.reqs.flat()));
      const score = (l: SimCard) => l.colors.filter(c => want.has(c) && !have.has(c)).length * 2 + l.colors.filter(c => want.has(c)).length
        + (l.tapped ? (turn === 1 || hand.every(c => c.land || c.cmc > landCount + 1) ? 0.5 : -3) : 0);
      const land = lands.reduce((a, b) => (score(b) > score(a) ? b : a));
      hand.splice(hand.indexOf(land), 1);
      battlefield.push({ mana: [land.colors], from: land.tapped ? turn + 1 : turn });
      landCount++;
      entry.land = land.card.name + (land.tapped ? ' (tapped)' : '');
    }
    let pool: Mana[] = battlefield.filter(p => p.from <= turn).flatMap(p => p.mana);
    const available = pool.length;

    // Cast spells: mana makers first, then the most expensive castable spell, until nothing fits.
    const castables = () => [...hand.filter(c => !c.land), ...command]
      .sort((a, b) => (b.makes.length || b.rampLands ? 1 : 0) - (a.makes.length || a.rampLands ? 1 : 0) || b.cmc - a.cmc);
    for (let progress = true; progress;) {
      progress = false;
      for (const c of castables()) {
        const left = pay(c.reqs, c.cmc, pool, c.card);
        if (!left) continue;
        pool = left;
        if (command.includes(c)) { command.splice(command.indexOf(c), 1); cmdrTurn ??= turn; }
        else hand.splice(hand.indexOf(c), 1);
        if (c.makes.length) battlefield.push({ mana: c.makes, from: turn + 1 });
        for (let i = 0; i < c.rampLands; i++) { battlefield.push({ mana: [fetchColors], from: turn + 1 }); landCount++; }
        if (c.draws) draw(c.draws, turn);
        entry.cast.push(c.card.name);
        progress = true;
        break;
      }
    }
    entry.mana = available;
    log.push(entry);
    turns.push({ turn, lands: landCount, available, spent: available - pool.length, idle: entry.cast.length ? 0 : 1 });
  }
  // Stuck: still in hand at the end with a mana value at least two below the final turn's mana.
  const finalMana = turns[TURNS - 1].available;
  const stuck = new Set(hand.filter(c => !c.land && c.cmc <= finalMana - 2));
  return { mulligans, turns, stuck, drawn, cmdrTurn, log, hand: opening, seenLands6 };
}

const cache = new WeakMap<Deck, Map<string, Goldfish | null>>();

/** Simulates `games` games. The same deck and seed always give the same numbers; a new seed plays different games. */
export function goldfish(deck: Deck, games = 2000, seed = 0): Goldfish | null {
  const key = `${games}:${seed}`;
  const byDeck = cache.get(deck) ?? new Map<string, Goldfish | null>();
  cache.set(deck, byDeck);
  if (!byDeck.has(key)) byDeck.set(key, simulate(deck, games, seed));
  return byDeck.get(key)!;
}

function simulate(deck: Deck, games: number, seed: number): Goldfish | null {
  const fetch = fetchTargets(deck);
  const fetchColors = fetch.basic.length ? fetch.basic : ALL;
  const entries = entriesOf(deck);
  const prepared = new Map(entries.map(e => [e.card.id, prepare(e.card, fetch)]));
  const library = entries.flatMap(e => Array.from({ length: e.main }, () => prepared.get(e.card.id)!));
  if (library.length < HAND + TURNS) return null;
  const cmdrs = entries.filter(e => e.cmdr && !prepared.get(e.card.id)!.land).map(e => prepared.get(e.card.id)!);
  const random = mulberry32(library.length * 31 + library.filter(c => c.land).length + seed * 7919);

  let mulligan = 0, screw = 0, flood = 0, cmdrCast = 0, cmdrOnCurve = 0, cmdrTurns = 0;
  const totals = Array.from({ length: TURNS }, (_, i) => ({ turn: i + 1, lands: 0, available: 0, spent: 0, idle: 0 }));
  const stuckBy = new Map<string, { card: Card; stuck: number; drawn: number }>();
  let sample: Goldfish['sample'] | null = null;
  // Copies of one card share a SimCard, so count per name.
  for (let g = 0; g < games; g++) {
    const r = playGame(library, cmdrs, random, fetchColors);
    if (!sample) sample = { hand: r.hand, mulligans: r.mulligans, log: r.log };
    if (r.mulligans) mulligan++;
    if (r.turns[3].lands <= 2) screw++;
    if (r.seenLands6 >= 8) flood++;
    r.turns.forEach((t, i) => { totals[i].lands += t.lands; totals[i].available += t.available; totals[i].spent += t.spent; totals[i].idle += t.idle; });
    r.drawn.forEach(c => {
      if (c.land) return;
      const s = stuckBy.get(c.card.name) ?? { card: c.card, stuck: 0, drawn: 0 };
      s.drawn++; if (r.stuck.has(c)) s.stuck++;
      stuckBy.set(c.card.name, s);
    });
    if (r.cmdrTurn !== null) { cmdrCast++; cmdrTurns += r.cmdrTurn; if (cmdrs.length && r.cmdrTurn <= Math.max(...cmdrs.map(c => c.cmc))) cmdrOnCurve++; }
  }
  const avg = (n: number) => n / games;
  return {
    games,
    mulligan: avg(mulligan), screw: avg(screw), flood: avg(flood),
    turns: totals.map(t => ({ turn: t.turn, lands: avg(t.lands), available: avg(t.available), spent: avg(t.spent), idle: avg(t.idle) })),
    stuck: [...stuckBy.values()].filter(s => s.drawn >= games * 0.05).map(s => ({ card: s.card, rate: s.stuck / s.drawn }))
      .filter(s => s.rate >= 0.15).sort((a, b) => b.rate - a.rate).slice(0, 5),
    commander: cmdrs.length ? { name: cmdrs.map(c => c.card.name).join(' & '), onCurve: avg(cmdrOnCurve), avgTurn: cmdrCast ? cmdrTurns / cmdrCast : null } : undefined,
    sample: sample!,
  };
}

/** Plays one game with a fresh random seed, for the "Play a sample game" button. */
export function sampleGame(deck: Deck): Goldfish['sample'] | null {
  const fetch = fetchTargets(deck);
  const entries = entriesOf(deck);
  const library = entries.flatMap(e => { const p = prepare(e.card, fetch); return Array.from({ length: e.main }, () => p); });
  if (library.length < HAND + TURNS) return null;
  const cmdrs = entries.filter(e => e.cmdr).map(e => prepare(e.card, fetch)).filter(c => !c.land);
  const r = playGame(library, cmdrs, Math.random, fetch.basic.length ? fetch.basic : ALL);
  return { hand: r.hand, mulligans: r.mulligans, log: r.log };
}
