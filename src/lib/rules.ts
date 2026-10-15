import type { Card } from './scryfall';

export const FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper', 'commander'] as const;
export type Format = (typeof FORMATS)[number];

interface FormatRules { min?: number; exact?: number; side: number; copies: number; commander?: boolean }
export const FORMAT_RULES: Record<Format, FormatRules> = {
  standard: { min: 60, side: 15, copies: 4 },
  pioneer: { min: 60, side: 15, copies: 4 },
  modern: { min: 60, side: 15, copies: 4 },
  legacy: { min: 60, side: 15, copies: 4 },
  vintage: { min: 60, side: 15, copies: 4 },
  pauper: { min: 60, side: 15, copies: 4 },
  commander: { exact: 100, side: 0, copies: 1, commander: true },
};

export type Board = 'main' | 'side' | 'cmdr';
export interface DeckEntry { card: Card; main: number; side: number; cmdr: number }
export interface Deck { id: string; name: string; format: Format; cards: Record<string, DeckEntry> }

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

export function copyLimit(card: Card, fmt: Format): number {
  if (/\bBasic\b.*\bLand\b/.test(card.type_line)) return Infinity;
  if (/A deck can have any number of cards named/i.test(card.oracle_text)) return Infinity;
  const m = card.oracle_text.match(/A deck can have up to (\w+) cards named/i);
  if (m) return NUMBER_WORDS[m[1].toLowerCase()] || parseInt(m[1]) || 1;
  if (card.legalities[fmt] === 'restricted') return 1;
  return FORMAT_RULES[fmt].copies;
}

export function canBeCommander(card: Card): boolean {
  return (/Legendary/.test(card.type_line) && /Creature/.test(card.type_line)) || /can be your commander/i.test(card.oracle_text);
}

export const entriesOf = (deck: Deck) => Object.values(deck.cards);
export const countBoard = (deck: Deck, board: Board) => entriesOf(deck).reduce((n, e) => n + (e[board] || 0), 0);
export const commanderIdentity = (deck: Deck) => [...new Set(entriesOf(deck).filter(e => e.cmdr).flatMap(e => e.card.color_identity))];

export type IssueLevel = 'ok' | 'warn' | 'bad';
export type Issue = [IssueLevel, string];

export function checkDeck(deck: Deck): Issue[] {
  const fmt = deck.format, rules = FORMAT_RULES[fmt], issues: Issue[] = [];
  const all = entriesOf(deck);
  const main = countBoard(deck, 'main'), side = countBoard(deck, 'side'), cmdr = countBoard(deck, 'cmdr');
  if (rules.commander) {
    const total = main + cmdr;
    if (cmdr === 0) issues.push(['bad', 'Choose a commander (use the "Cmdr" button on a legendary creature).']);
    if (cmdr > 2) issues.push(['bad', 'At most two commanders (partners) are allowed.']);
    if (total !== rules.exact) issues.push([total < rules.exact! ? 'warn' : 'bad', `Deck has ${total} cards including commander; Commander needs exactly ${rules.exact}.`]);
    if (side) issues.push(['warn', `Commander has no sideboard; ${side} sideboard card(s) are ignored.`]);
    const commanders = all.filter(e => e.cmdr);
    commanders.forEach(e => { if (!canBeCommander(e.card)) issues.push(['bad', `${e.card.name} can't be a commander.`]); });
    if (commanders.length) {
      const ident = new Set(commanderIdentity(deck));
      all.filter(e => e.main).forEach(e => {
        const off = e.card.color_identity.filter(c => !ident.has(c));
        if (off.length) issues.push(['bad', `${e.card.name} is outside your commander's color identity (${off.join('')}).`]);
      });
    }
  } else {
    if (main < rules.min!) issues.push(['warn', `Main deck has ${main} cards; ${rules.min} minimum.`]);
    if (side > rules.side) issues.push(['bad', `Sideboard has ${side} cards; ${rules.side} maximum.`]);
  }
  all.forEach(e => {
    const status = e.card.legalities[fmt];
    if (status === 'banned') issues.push(['bad', `${e.card.name} is banned in ${fmt}.`]);
    else if (status !== 'legal' && status !== 'restricted') issues.push(['bad', `${e.card.name} is not legal in ${fmt}.`]);
    const n = e.main + e.side + e.cmdr, lim = copyLimit(e.card, fmt);
    if (n > lim) issues.push(['bad', `${e.card.name}: ${n} copies, limit is ${lim}${status === 'restricted' ? ' (restricted)' : ''}.`]);
  });
  if (!issues.length) issues.push(['ok', `Deck is legal for ${fmt}.`]);
  return issues;
}

export const TYPE_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land'] as const;
export function primaryType(card: Card): string {
  const front = card.type_line.split('//')[0];
  return TYPE_ORDER.find(t => front.includes(t)) || 'Other';
}

export interface DeckStats {
  curve: number[]; // index 0..6, 7 = 7+
  main: number; side: number; lands: number; avgMv: number; price: number;
  pips: Record<'W' | 'U' | 'B' | 'R' | 'G' | 'C', number>;
}
export function deckStats(deck: Deck): DeckStats {
  const all = entriesOf(deck);
  const mainEntries = all.filter(e => e.main);
  const curve = Array(8).fill(0);
  const spells = mainEntries.filter(e => primaryType(e.card) !== 'Land');
  spells.forEach(e => { curve[Math.min(7, Math.floor(e.card.cmc))] += e.main; });
  const nSpells = spells.reduce((s, e) => s + e.main, 0);
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  mainEntries.forEach(e => (e.card.mana_cost.match(/\{[^}]+\}/g) || []).forEach(sym => {
    for (const c of 'WUBRGC' as unknown as (keyof typeof pips)[]) if (sym.includes(c)) pips[c] += e.main;
  }));
  return {
    curve,
    main: countBoard(deck, 'main'),
    side: countBoard(deck, 'side'),
    lands: mainEntries.filter(e => primaryType(e.card) === 'Land').reduce((s, e) => s + e.main, 0),
    avgMv: nSpells ? spells.reduce((s, e) => s + e.card.cmc * e.main, 0) / nSpells : 0,
    price: all.reduce((s, e) => s + (parseFloat(e.card.usd || '') || 0) * (e.main + e.side + e.cmdr), 0),
    pips,
  };
}
