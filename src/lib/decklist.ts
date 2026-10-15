import type { Card } from './scryfall';
import type { Board, Deck } from './rules';
import { entriesOf } from './rules';

export interface ListRow { qty: number; name: string; set?: string; board: Board }

/** Parses "4 Lightning Bolt" style lists, with Sideboard / Commander sections, "SB:" prefixes and "(SET) 123" suffixes. */
export function parseList(text: string): ListRow[] {
  const out: ListRow[] = [];
  let board: Board = 'main';
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    const header = line.toLowerCase().replace(/:$/, '');
    if (['sideboard', 'side', 'sb'].includes(header)) { board = 'side'; continue; }
    if (['commander', 'commanders'].includes(header)) { board = 'cmdr'; continue; }
    if (['deck', 'main', 'maindeck', 'mainboard', 'companion'].includes(header)) { board = 'main'; continue; }
    let b = board;
    if (/^SB:\s*/i.test(line)) { b = 'side'; line = line.replace(/^SB:\s*/i, ''); }
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    let qty = 1, name = line;
    if (m) { qty = parseInt(m[1]); name = m[2]; }
    let set: string | undefined;
    const setMatch = name.match(/\s+\(([A-Za-z0-9]{2,6})\)(\s+\S+)?\s*(\*F\*)?$/);
    if (setMatch) { set = setMatch[1].toLowerCase(); name = name.slice(0, setMatch.index); }
    out.push({ qty, name: name.trim(), set, board: b });
  }
  return out;
}

export function exportList(deck: Deck): string {
  const all = entriesOf(deck), lines: string[] = [];
  const cmd = all.filter(e => e.cmdr), side = all.filter(e => e.side);
  if (cmd.length) { lines.push('Commander'); cmd.forEach(e => lines.push(`${e.cmdr} ${e.card.name}`)); lines.push('', 'Deck'); }
  all.filter(e => e.main).forEach(e => lines.push(`${e.main} ${e.card.name}`));
  if (side.length) { lines.push('', 'Sideboard'); side.forEach(e => lines.push(`${e.side} ${e.card.name}`)); }
  return lines.join('\n');
}

// Arena's set codes that differ from Scryfall's.
const ARENA_SETS: Record<string, string> = { dom: 'DAR' };
// Layouts where Arena names the card by both halves, like "Fire // Ice".
const BOTH_HALVES = new Set(['split', 'aftermath']);

/** One line in MTG Arena's import format: front-face name for double-faced and adventure cards, and the
 *  set and collector number when this printing exists on Arena (otherwise Arena picks a printing itself). */
function arenaLine(n: number, c: Card): string {
  const name = c.layout && BOTH_HALVES.has(c.layout) ? c.name : c.name.split(' // ')[0];
  const print = c.arena && c.set && c.cn ? ` (${ARENA_SETS[c.set] || c.set.toUpperCase()}) ${c.cn}` : '';
  return `${n} ${name}${print}`;
}

/** The deck in MTG Arena's import format, with Commander, Deck and Sideboard sections. */
export function exportArena(deck: Deck): string {
  const all = entriesOf(deck), lines: string[] = [];
  const cmd = all.filter(e => e.cmdr), side = all.filter(e => e.side);
  if (cmd.length) { lines.push('Commander'); cmd.forEach(e => lines.push(arenaLine(e.cmdr, e.card))); lines.push(''); }
  lines.push('Deck');
  all.filter(e => e.main).forEach(e => lines.push(arenaLine(e.main, e.card)));
  if (side.length) { lines.push('', 'Sideboard'); side.forEach(e => lines.push(arenaLine(e.side, e.card))); }
  return lines.join('\n');
}
