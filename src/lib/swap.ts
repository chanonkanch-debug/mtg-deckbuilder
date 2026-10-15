// Swap preview: what changes if you add one card and/or cut another, before you commit to it.
import type { Card } from './scryfall';
import type { Deck } from './rules';
import { castability, reliable } from './castability';
import { roleCounts } from './roles';
import type { Goldfish } from './goldfish';

export interface Trial { add?: Card; cut?: Card }

/** A copy of the deck with one more main-deck copy of `add` and one fewer of `cut`. */
export function applyTrial(deck: Deck, t: Trial): Deck {
  const cards = { ...deck.cards };
  if (t.add) {
    const e = cards[t.add.id] ?? { card: t.add, main: 0, side: 0, cmdr: 0 };
    cards[t.add.id] = { ...e, main: e.main + 1 };
  }
  if (t.cut && cards[t.cut.id]?.main) {
    const e = cards[t.cut.id];
    if (e.main === 1 && !e.side && !e.cmdr) delete cards[t.cut.id];
    else cards[t.cut.id] = { ...e, main: e.main - 1 };
  }
  return { ...deck, cards };
}

export type Verdict = 'better' | 'worse' | 'same';
export interface TrialRow { label: string; before: string; after: string; verdict: Verdict }

const pct = (p: number) => `${Math.round(p * 100)}%`;
/** Compares two numbers where lower (or higher) is better, ignoring differences under `noise`. */
function judge(before: number, after: number, lowerIsBetter: boolean, noise = 0): Verdict {
  if (Math.abs(after - before) <= noise) return 'same';
  return (after < before) === lowerIsBetter ? 'better' : 'worse';
}

/**
 * The before/after rows for a swap. Simulated rates move by about a point between runs, so changes under
 * 2 points count as the same.
 */
export function trialReport(before: Deck, after: Deck, simBefore: Goldfish | null, simAfter: Goldfish | null): TrialRow[] {
  const rows: TrialRow[] = [];
  const below = (d: Deck) => castability(d).rows.filter(r => !reliable(r.odds)).length;
  const b = below(before), a = below(after);
  rows.push({ label: 'Spells hard to cast', before: String(b), after: String(a), verdict: judge(b, a, true) });
  // The spell that was hardest to cast before, if it's still in the deck: shows a fix even when it's not quite enough.
  const worst = castability(before).rows.find(r => !reliable(r.odds));
  const worstAfter = worst && castability(after).rows.find(r => r.card.id === worst.card.id);
  if (worst && worstAfter) {
    rows.push({ label: `${worst.card.name} on curve`, before: pct(worst.odds), after: pct(worstAfter.odds), verdict: judge(worst.odds, worstAfter.odds, false, 0.02) });
  }

  if (simBefore && simAfter) {
    const rate = (label: string, k: 'screw' | 'flood' | 'mulligan') =>
      rows.push({ label, before: pct(simBefore[k]), after: pct(simAfter[k]), verdict: judge(simBefore[k], simAfter[k], true, 0.02) });
    rate('Stall on lands', 'screw');
    rate('Flood', 'flood');
    rate('Mulligan', 'mulligan');
    const spent = (s: Goldfish) => s.turns.slice(0, 4).reduce((n, t) => n + t.spent, 0);
    rows.push({ label: 'Mana used by turn 4', before: spent(simBefore).toFixed(1), after: spent(simAfter).toFixed(1),
      verdict: judge(spent(simBefore), spent(simAfter), false, 0.25) });
    const cb = simBefore.commander?.avgTurn, ca = simAfter.commander?.avgTurn;
    if (cb != null && ca != null) {
      rows.push({ label: 'Commander cast on turn', before: cb.toFixed(1), after: ca.toFixed(1), verdict: judge(cb, ca, true, 0.1) });
    }
  }

  const rb = roleCounts(before), ra = roleCounts(after);
  if (rb.lands !== ra.lands) rows.push({ label: 'Lands', before: String(rb.lands), after: String(ra.lands), verdict: 'same' });
  rb.rows.forEach((r, i) => {
    const n = ra.rows[i].count;
    if (n === r.count) return;
    // More of a role helps while you're under the target (or there is none); past it, it's just a different deck.
    const verdict: Verdict = r.target !== undefined && Math.min(r.count, n) >= r.target ? 'same' : n > r.count ? 'better' : 'worse';
    rows.push({ label: r.role.label, before: String(r.count), after: String(n), verdict });
  });
  return rows;
}

/** How reliably the added card can be cast on curve in the new deck, or null if it has no colored cost. */
export function addedCastOdds(after: Deck, add?: Card): number | null {
  if (!add) return null;
  return castability(after).rows.find(r => r.card.id === add.id)?.odds ?? null;
}
