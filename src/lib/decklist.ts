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
