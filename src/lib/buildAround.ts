import type { Card } from './scryfall';
import { ARCHETYPES } from './archetypes';

// Build around: read what a card cares about ("hooks") from its rules text, keywords and types, then turn
// each hook into a Scryfall search for the cards that feed it or pay it off. Three layers, so niche mechanics
// are covered without a hand-written rule for each: common themes, the card's own keywords and named
// tokens/counters, and "whenever you <verb>" triggers mirrored into a search for cards that do <verb>.
// A fourth layer turns a drawback into fuel: a card that profits from something normally bad for it (damage,
// a wipe, dying, being recast) gets a search for the cards that cause it.

export type HookKind = 'fuel' | 'theme' | 'keyword' | 'mechanic' | 'tribe' | 'custom';
export interface Hook { id: string; label: string; kind: HookKind; query: string; seeds: string[] }

const archetype = (label: string) => ARCHETYPES.flatMap(g => g.options).find(o => o[0] === label)![1];

const THEMES: { id: string; label: string; detect: RegExp; query: string }[] = [
  { id: 'tokens', label: 'Tokens', detect: /\bcreates? [^.]*\bcreature tokens?\b|tokens? you control|whenever (a|another|one or more) (creature|token)s?[^.]* enters/, query: archetype('Tokens / go wide') },
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

// What the card profits from, and the cards that cause it. `detect` runs on the rules text with the card's
// own name replaced by "this".
const FUEL: { id: string; label: string; detect: RegExp; query: string }[] = [
  { id: 'damage', label: 'Damage it on purpose',
    detect: /damage would be dealt to (this|him|her|it)\b[^.]*(prevent|instead|counters?)|whenever (this|equipped creature|enchanted creature) is dealt damage|prevent all damage that would be dealt to (this|him|her|it)\b/,
    query: '(o:"damage to each creature" or o:"damage to each other creature" or o:/deals \\d+ damage to target creature you control/ or o:fight or o:/dealt to you[^.]* is dealt to/)' },
  { id: 'wipes', label: 'Wipes it survives',
    detect: /\bindestructible\b/,
    query: '(o:"destroy all creatures" or o:"destroy all other creatures" or o:"destroy all nonland permanents" or o:"destroy all permanents")' },
  { id: 'recast', label: 'Recast it',
    detect: /if (this|it|he|she|they) (was|were) cast|when you cast this/,
    query: '(o:"you control to its owner\'s hand" or o:"you control to their owner\'s hand" or o:"return target creature you control to")' },
  { id: 'blink', label: 'Blink it',
    detect: /when (this|it) enters(?![^.]*if (this|it|he|she|they) (was|were) cast)/,
    query: archetype('Blink') },
  { id: 'dies', label: 'Sacrifice it',
    detect: /when (this|it) dies|when (this|it) is put into a graveyard from the battlefield/,
    query: '(o:"sacrifice a creature:" or o:"sacrifice another creature:" or o:"sacrifice a creature," or o:"sacrifice a permanent:")' },
];
// Copy effects want creatures worth copying, not a go-wide token deck.
FUEL.push(
  { id: 'copy', label: 'Creatures worth copying',
    detect: /tokens? that's a copy of|tokens that are copies of|becomes? a copy of|copy of (target|each|another|a|that) [^.]*creature/,
    query: '(t:creature (o:"when ~ enters" or o:"whenever ~ enters" or o:"when this creature enters" or o:"whenever this creature enters"))' },
  { id: 'legends', label: 'Legendary creatures',
    detect: /(isn't|aren't) legendary|legend rule doesn't apply/,
    query: '(t:legendary t:creature)' },
);
const COLOR_WORD: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };

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
  // A legendary card often calls itself by its short name ("Anti-Venom" for "Anti-Venom, Horrifying Healer").
  const front = card.name.split(' // ')[0];
  const esc = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase();
  const text = raw.toLowerCase().replace(new RegExp(`${esc(front)}|${esc(front.split(',')[0])}`, 'g'), 'this');
  const hooks = new Map<string, Hook>();
  const add = (id: string, label: string, kind: HookKind, query: string) => {
    if (!hooks.has(id)) hooks.set(id, { id, label, kind, query, seeds: [card.name] });
  };

  for (const f of FUEL) if (f.detect.test(text)) add(`fuel:${f.id}`, f.label, 'fuel', f.query);
  // A heavy single-color cost ({W}{W}{W}{W}{W}) is a devotion payoff waiting to happen.
  for (const [c, word] of Object.entries(COLOR_WORD)) {
    if ((card.mana_cost?.match(new RegExp(`\\{${c}\\}`, 'g')) || []).length >= 3) add(`fuel:devotion-${word}`, `Devotion to ${word}`, 'fuel', `o:"devotion to ${word}"`);
  }
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
