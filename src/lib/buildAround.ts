import type { Card } from './scryfall';
import { ARCHETYPES } from './archetypes';

// Build around: read what a card cares about ("hooks") from its rules text, keywords and types, then turn
// each hook into a Scryfall search for the cards that feed it or pay it off. Three layers, so niche mechanics
// are covered without a hand-written rule for each: common themes, the card's own keywords and named
// tokens/counters, and "whenever you <verb>" triggers mirrored into a search for cards that do <verb>.

export type HookKind = 'theme' | 'keyword' | 'mechanic' | 'tribe' | 'custom';
export interface Hook { id: string; label: string; kind: HookKind; query: string; seeds: string[] }

const archetype = (label: string) => ARCHETYPES.flatMap(g => g.options).find(o => o[0] === label)![1];

const THEMES: { id: string; label: string; detect: RegExp; query: string }[] = [
  { id: 'tokens', label: 'Tokens', detect: /\bcreates? [^.]*\btokens?\b|tokens? you control|whenever (a|another|one or more) (creature|token)s?[^.]* enters/, query: archetype('Tokens / go wide') },
  { id: 'aristocrats', label: 'Sacrifice and dies', detect: /sacrifice (a|another) creature|creatures? (you control )?dies|whenever [^.]* dies/, query: archetype('Aristocrats') },
  { id: 'counters', label: '+1/+1 counters', detect: /\+1\/\+1 counter|proliferate/, query: '(o:"+1/+1 counter" or o:proliferate)' },
  { id: 'lifegain', label: 'Lifegain', detect: /\bgains? (\d+|x|that much) life|whenever you gain life|\blifelink\b/, query: archetype('Lifegain') },
  { id: 'landfall', label: 'Landfall', detect: /landfall|whenever a land[^.]* enters|play an additional land/, query: archetype('Landfall') },
  { id: 'artifacts', label: 'Artifacts', detect: /(whenever|for each|number of)[^.]* artifacts?\b|artifact (creature )?tokens?|\baffinity\b|\bimprovise\b|\bmetalcraft\b/, query: archetype('Artifacts') },
  { id: 'enchantments', label: 'Enchantments', detect: /(whenever|for each|number of)[^.]* enchantments?\b|\bconstellation\b/, query: archetype('Enchantress') },
  { id: 'spells', label: 'Instants and sorceries', detect: /instant (or|and) sorcery|noncreature spell|\bmagecraft\b|\bprowess\b|\bstorm\b/, query: `(${archetype('Storm / spells')} or ${archetype('Spells matter')})` },
  { id: 'graveyard', label: 'Graveyard', detect: /from your graveyard|\bflashback\b|\bescape\b|\bdelve\b|\bunearth\b|\bmills?\b|\bsurveil\b/, query: archetype('Graveyard') },
  { id: 'blink', label: 'Blink', detect: /exile [^.]*\. return (it|that card|those cards|them) to the battlefield|exile[^.]*, then return/, query: archetype('Blink') },
  { id: 'draw', label: 'Drawing cards', detect: /whenever you draw|draw your second card/, query: '(o:/draws? (two|three|x) cards/ or o:"draw a card for each" or o:"whenever you draw")' },
  { id: 'discard', label: 'Discard', detect: /\bdiscards?\b|\bmadness\b/, query: '(o:"discard a card" or kw:madness or o:"whenever you discard")' },
  { id: 'equipment', label: 'Equipment and Auras', detect: /equipped creature|enchanted creature|\bequipment\b|\baura spell/, query: archetype('Voltron') },
];

// Keywords too common to say anything about a deck, or already covered by a theme above.
const SKIP_KEYWORDS = new Set(['flying', 'trample', 'haste', 'vigilance', 'reach', 'deathtouch', 'first strike', 'double strike',
  'menace', 'hexproof', 'indestructible', 'defender', 'flash', 'ward', 'equip', 'enchant', 'lifelink', 'protection', 'shroud',
  'fight', 'mill', 'flashback', 'escape', 'delve', 'unearth', 'surveil', 'prowess', 'storm', 'magecraft', 'affinity', 'improvise',
  'metalcraft', 'landfall', 'constellation', 'madness', 'proliferate', 'transform', 'partner', 'treasure']);

// Keyword actions a card can do or care about; the search finds both sides ("scry 2" and "whenever you scry").
const ACTIONS = ['scry', 'investigate', 'explore', 'connive', 'venture', 'discover', 'amass', 'incubate', 'forage', 'cycle',
  'foretell', 'adapt', 'populate', 'learn', 'manifest', 'cloak', 'suspect', 'collect evidence', 'blitz', 'craft', 'plot',
  'exert', 'monstrosity', 'support', 'bolster', 'seek', 'conjure', 'perpetually', 'energy', 'the ring tempts you', 'initiative',
  'monarch', 'dungeon', 'day', 'night', 'clash', 'vote', 'roll', 'coin', 'mutate', 'emerge', 'evoke', 'kicker', 'cascade'];
// Verbs after "whenever you" that are too general to search on, or handled by a theme.
const SKIP_VERBS = new Set(['cast', 'attack', 'control', 'do', 'may', 'would', 'have', 'put', 'are', 'gain', 'sacrifice', 'draw',
  'discard', 'mill', 'surveil', 'create', 'activate', 'tap', 'pay', 'lose', 'play', 'choose', 'target', 'commit', 'expend']);
const NOT_NAMES = new Set(['a', 'an', 'the', 'those', 'that', 'of', 'any', 'all', 'more', 'each', 'its', 'x', 'two', 'three', 'it',
  'them', 'these', 'other', 'additional', 'twice', 'many', 'with', 'no', 'loyalty', 'and', 'or', 'number', 'his', 'her', 'their']);
const STEMS: Record<string, string> = { cycle: 'cycling' };

const title = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());

/** The hooks one card offers: what it cares about, as searches for cards that work with it. */
export function hooksFor(card: Card): Hook[] {
  const raw = card.oracle_text.replace(/\([^)]*\)/g, ''); // reminder text explains, it doesn't define the card
  const text = raw.toLowerCase().replace(new RegExp(card.name.split(' // ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase(), 'g'), 'this');
  const hooks = new Map<string, Hook>();
  const add = (id: string, label: string, kind: HookKind, query: string) => {
    if (!hooks.has(id)) hooks.set(id, { id, label, kind, query, seeds: [card.name] });
  };

  for (const t of THEMES) if (t.detect.test(text)) add(`theme:${t.id}`, t.label, 'theme', t.query);

  for (const k of card.keywords || []) {
    const key = k.toLowerCase();
    if (SKIP_KEYWORDS.has(key)) continue;
    add(`kw:${key}`, k, 'keyword', `(kw:"${key}" or o:"${key}")`);
  }

  // Named counters and noncreature tokens: oil counters, Food, Clues, Maps...
  for (const [, name] of text.matchAll(/\b([a-z]+) counters?\b/g)) {
    if (NOT_NAMES.has(name)) continue;
    add(`counter:${name}`, `${title(name)} counters`, 'mechanic', `o:"${name} counter"`);
  }
  for (const [, name] of raw.matchAll(/\b([A-Z][a-z]+) tokens?\b/g)) {
    if (NOT_NAMES.has(name.toLowerCase()) || /^(Creature|Token|Copy)$/.test(name)) continue;
    add(`token:${name.toLowerCase()}`, `${name} tokens`, 'mechanic', `o:"${name}"`);
  }

  // Keyword actions the card does or cares about, and any other "whenever you <verb>" trigger.
  for (const a of ACTIONS) {
    if (!new RegExp(`\\b${a}`).test(text)) continue;
    const stem = STEMS[a];
    if (stem && hooks.has(`kw:${stem}`)) continue;
    add(`act:${a}`, title(a), 'mechanic', stem ? `(kw:${stem} or o:"${a}")` : `o:"${a}"`);
  }
  for (const [, verb] of text.matchAll(/whenever you ([a-z]+)/g)) {
    if (SKIP_VERBS.has(verb) || ACTIONS.some(a => a.startsWith(verb)) || hooks.has(`kw:${verb}`)) continue;
    add(`act:${verb}`, title(verb), 'mechanic', `o:"${verb}"`);
  }

  // Creature types the card mentions in its rules text (Krenko counts Goblins); its own type alone isn't a theme.
  const subtypes = (card.type_line.split('//')[0].split('—')[1] || '').trim().split(/\s+/).filter(Boolean);
  const creatureTokens = [...raw.matchAll(/\b([A-Z][a-z]+)(?: [A-Z][a-z]+)? creature tokens?/g)].map(m => m[1]);
  for (const type of new Set([...subtypes.filter(t => new RegExp(`\\b${t}s?\\b`).test(raw)), ...creatureTokens])) {
    if (/^(Creature|Legendary)$/.test(type)) continue;
    hooks.delete(`token:${type.toLowerCase()}`);
    add(`tribe:${type.toLowerCase()}`, `${type}s`, 'tribe', `(t:${type.toLowerCase()} or o:"${type}")`);
  }
  return [...hooks.values()];
}

/** Hooks for several seed cards, merged: a hook shared by more seeds lists all of them and sorts first. */
export function hooksForSeeds(seeds: Card[]): Hook[] {
  const merged = new Map<string, Hook>();
  for (const s of seeds) for (const h of hooksFor(s)) {
    const m = merged.get(h.id);
    if (m) { if (!m.seeds.includes(s.name)) m.seeds.push(s.name); } else merged.set(h.id, { ...h, seeds: [...h.seeds] });
  }
  return [...merged.values()].sort((a, b) => b.seeds.length - a.seeds.length);
}

/** A hook for a phrase the user types, like "the Ring tempts you". */
export function customHook(phrase: string): Hook {
  const p = phrase.trim().replace(/"/g, '');
  return { id: `custom:${p.toLowerCase()}`, label: p, kind: 'custom', query: `o:"${p}"`, seeds: [] };
}

export interface Suggestion { card: Card; hooks: string[]; score: number; rank: number }

/**
 * Ranks the cards each hook's search found. A card scores one point per hook it matches, counted once per seed
 * that shares the hook, so cards that tie several seeds together come first; ties go to the more popular card
 * (its best position in the EDHREC-ordered results). Seeds and cards already in the deck are left out.
 */
export function rankSuggestions(results: { hook: Hook; cards: Card[] }[], exclude: Set<string>): Suggestion[] {
  const byName = new Map<string, Suggestion>();
  for (const { hook, cards } of results) {
    cards.forEach((card, i) => {
      if (exclude.has(card.name)) return;
      const s = byName.get(card.name) || { card, hooks: [], score: 0, rank: Infinity };
      if (!s.hooks.includes(hook.label)) { s.hooks.push(hook.label); s.score += Math.max(1, hook.seeds.length); }
      s.rank = Math.min(s.rank, i);
      byName.set(card.name, s);
    });
  }
  return [...byName.values()].sort((a, b) => b.score - a.score || a.rank - b.rank);
}

/** Color identity the suggestions must fit: the commander's in Commander, otherwise all the seeds' colors together. */
export function identityFor(seeds: Card[], commander: string[] | null): string {
  const colors = commander ?? [...new Set(seeds.flatMap(s => s.color_identity))];
  return ['W', 'U', 'B', 'R', 'G'].filter(c => colors.includes(c)).join('') || 'c';
}
