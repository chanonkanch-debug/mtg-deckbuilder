// Deck checkup: turns castability, role counts and the goldfish simulation into a short list of
// plain-language problems, worst first, each with one suggested action.
import type { Card } from './scryfall';
import type { Deck } from './rules';
import { countBoard, FORMAT_RULES } from './rules';
import { COLOR_NAMES } from './analysis';
import { castability, TARGET } from './castability';
import { roleCounts } from './roles';
import type { Goldfish } from './goldfish';

export type Level = 'bad' | 'warn';

export type Action =
  | { kind: 'search'; label: string; query?: string; archetype?: string }
  | { kind: 'details'; label: string; tab: string }
  | { kind: 'card'; label: string; card: Card };

export interface Finding { id: string; level: Level; title: string; detail: string; action?: Action }

const pct = (p: number) => `${Math.round(p * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** All findings for the deck, worst first. `sim` is the goldfish result, or null while it's still running. */
export function checkup(deck: Deck, sim: Goldfish | null): Finding[] {
  const out: (Finding & { rank: number })[] = [];
  const push = (f: Finding, rank: number) => out.push({ ...f, rank });

  // Colors: one finding per color the deck is short on.
  const cast = castability(deck);
  const byColor = new Map<string, { cards: typeof cast.rows; have: number; need: number | null }>();
  cast.rows.filter(r => r.odds < TARGET).forEach(r => r.short.forEach(s => {
    const e = byColor.get(s.color) ?? { cards: [], have: s.have, need: s.need };
    e.cards.push(r);
    e.need = e.need === null || s.need === null ? null : Math.max(e.need, s.need);
    byColor.set(s.color, e);
  }));
  byColor.forEach((e, color) => {
    const name = COLOR_NAMES[color]?.toLowerCase() ?? 'colorless';
    const worst = e.cards[0];
    const who = e.cards.length === 1 ? worst.card.name : `${plural(e.cards.length, `${name} card`)}`;
    push({
      id: `color:${color}`,
      level: worst.odds < 0.8 ? 'bad' : 'warn',
      title: `${who} ${e.cards.length === 1 ? 'is' : 'are'} hard to cast on time`,
      detail: e.need === null
        ? `${worst.card.name} is castable on turn ${worst.turn} in only ${pct(worst.odds)} of games, and no split of your ${cast.lands} lands fixes it. Consider cutting it.`
        : `${e.cards.length > 1 ? 'Worst is ' : ''}${worst.card.name}: castable on turn ${worst.turn} in ${pct(worst.odds)} of games. You have ${e.have} ${name} sources; aim for ${e.need}.`,
      action: e.need === null ? { kind: 'card', label: 'View card', card: worst.card }
        : { kind: 'search', label: `Find ${name} lands`, query: `t:land produces:${color.toLowerCase()}` },
    }, worst.odds);
  });

  // Roles and lands, where the format has targets (Commander).
  const roles = roleCounts(deck);
  if (roles.landTarget !== undefined && roles.lands < roles.landTarget - 1) {
    push({
      id: 'lands', level: roles.lands < roles.landTarget - 4 ? 'bad' : 'warn',
      title: `Only ${roles.lands} lands`,
      detail: `Most Commander decks run about ${roles.landTarget}, or a few fewer with plenty of ramp.`,
      action: { kind: 'search', label: 'Find lands', query: 't:land' },
    }, roles.lands / roles.landTarget);
  }
  roles.rows.forEach(r => {
    if (r.target === undefined || r.count >= r.target) return;
    push({
      id: `role:${r.role.key}`, level: r.count < r.target * 0.7 ? 'bad' : 'warn',
      title: `Low on ${r.role.label.toLowerCase()} (${r.count} of ${r.target})`,
      detail: r.role.hint,
      action: r.role.archetype ? { kind: 'search', label: `Find ${r.role.label.toLowerCase()}`, archetype: r.role.archetype } : undefined,
    }, 0.5 + r.count / r.target / 2);
  });

  // How the deck plays, from the simulation.
  if (sim) {
    if (sim.screw >= 0.15) {
      push({
        id: 'screw', level: sim.screw >= 0.25 ? 'bad' : 'warn', title: 'You often stall on lands',
        detail: `In ${pct(sim.screw)} of games you have 2 or fewer lands on turn 4. Add a land or two, or cheap ramp.`,
        action: { kind: 'details', label: 'See simulation', tab: 'goldfish' },
      }, 1 - sim.screw);
    }
    if (sim.flood >= 0.2) {
      push({
        id: 'flood', level: sim.flood >= 0.3 ? 'bad' : 'warn', title: 'You often draw too many lands',
        detail: `In ${pct(sim.flood)} of games, 8 or more of your first 12 cards are lands. Cut a land, or add card draw to use them.`,
        action: { kind: 'details', label: 'See simulation', tab: 'goldfish' },
      }, 1 - sim.flood);
    }
    const flagged = new Set(out.flatMap(f => (f.id.startsWith('color:') ? byColor.get(f.id.slice(6))!.cards.map(c => c.card.name) : [])));
    sim.stuck.filter(s => s.rate >= 0.3 && !flagged.has(s.card.name)).slice(0, 2).forEach(s => {
      push({
        id: `stuck:${s.card.name}`, level: s.rate >= 0.5 ? 'bad' : 'warn', title: `${s.card.name} often gets stuck in hand`,
        detail: `In ${pct(s.rate)} of games where you draw it, it's still uncast on turn 8 even with spare mana.`,
        action: { kind: 'card', label: 'View card', card: s.card },
      }, 1 - s.rate);
    });
    if (sim.commander && sim.commander.avgTurn !== null && sim.commander.onCurve < 0.5) {
      push({
        id: 'commander', level: 'warn', title: `${sim.commander.name} comes down late`,
        detail: `You cast it on turn ${sim.commander.avgTurn.toFixed(1)} on average, and on curve in only ${pct(sim.commander.onCurve)} of games.`,
        action: { kind: 'details', label: 'See castability', tab: 'cast' },
      }, sim.commander.onCurve);
    }
  }

  return out.sort((a, b) => (a.level === b.level ? a.rank - b.rank : a.level === 'bad' ? -1 : 1)).map(({ rank: _r, ...f }) => f);
}

/** Whether the deck is complete enough for the checkup to mean much, and how many cards it still needs. */
export function readiness(deck: Deck): { ready: boolean; have: number; need: number } {
  const rules = FORMAT_RULES[deck.format];
  const need = rules.exact ?? rules.min ?? 60;
  const have = countBoard(deck, 'main') + countBoard(deck, 'cmdr');
  return { ready: have >= need * 0.75, have, need };
}
