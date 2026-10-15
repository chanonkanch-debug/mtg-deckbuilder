import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../lib/scryfall';
import type { Deck } from '../lib/rules';
import { checkup, compare, readiness, type Action, type Change, type Snapshot } from '../lib/doctor';
import { goldfish, type Goldfish } from '../lib/goldfish';
import type { SearchRequest } from './SearchPanel';

interface Props {
  deck: Deck;
  onOpen: (card: Card) => void;
  onSearch: (req: SearchRequest) => void;
  sim: Goldfish | null;
  busy: boolean;
  /** Opens the Deck details window on a tab. */
  onOpenDetails: (tab: string) => void;
}

/** Simulates the deck after a pause in edits. Results are cached per deck, so the Goldfish tab's run 1 reuses them. */
export function useDeckSim(deck: Deck): { sim: Goldfish | null; busy: boolean } {
  const [sim, setSim] = useState<Goldfish | null>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    setBusy(true);
    const timer = setTimeout(() => { setSim(goldfish(deck, 4000, 0)); setBusy(false); }, 250);
    return () => clearTimeout(timer);
  }, [deck]);
  return { sim, busy };
}

/** Shown before "Show more"; the rest of the findings are one click away. */
const SHOWN = 4;
const pct = (p: number) => `${Math.round(p * 100)}%`;

/** The deck panel's main analysis: a few plain-language problems, worst first, with a fix for each. */
export default function Checkup({ deck, onOpen, onSearch, sim, busy, onOpenDetails }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [changes, setChanges] = useState<Change[]>([]);
  const last = useRef<Snapshot | null>(null);

  const cards = Object.keys(deck.cards).length;
  const { ready, have, need } = readiness(deck);
  const findings = useMemo(() => (cards && !busy ? checkup(deck, sim) : []), [deck, sim, busy, cards]);

  // After each edit settles, compare with the previous checkup of the same deck. Switching decks starts fresh.
  useEffect(() => {
    if (busy) return;
    const now: Snapshot = { deckId: deck.id, findings, sim };
    setChanges(last.current && last.current.deckId === deck.id && cards ? compare(last.current, now) : []);
    last.current = now;
  }, [findings]);
  const shown = showAll ? findings : findings.slice(0, SHOWN);

  const act = (a: Action) => {
    if (a.kind === 'search') onSearch({ query: a.query, archetype: a.archetype });
    else if (a.kind === 'details') onOpenDetails(a.tab);
    else onOpen(a.card);
  };

  return (
    <section className="checkup" aria-labelledby="checkupTitle">
      <div className="checkup-head">
        <h3 id="checkupTitle">Deck checkup</h3>
        <span className="small muted">
          {!cards ? '' : busy ? 'Checking…' : findings.length ? `${findings.length} thing${findings.length === 1 ? '' : 's'} to look at` : ''}
        </span>
      </div>

      {!cards && <p className="small muted">Add cards and the checkup will point out mana, curve and consistency problems.</p>}
      {cards > 0 && !ready && (
        <p className="small muted">Your deck has {have} of {need} cards, so these results will change as you add more.</p>
      )}

      {changes.length > 0 && !busy && (
        <p className="changes small" aria-live="polite">
          <span className="muted">Since your last change: </span>
          {changes.map((c, i) => <span key={i} className={c.good ? 'good' : 'worse'}>{c.good ? '▲' : '▼'} {c.text}</span>)}
        </p>
      )}

      {cards > 0 && !busy && findings.length === 0 && (
        <div className="finding ok">
          <span className="finding-icon" aria-hidden>✓</span>
          <div>
            <b>Looks healthy</b>
            {sim && <div className="small muted">Mulligan {pct(sim.mulligan)} · stall on lands {pct(sim.screw)} · flood {pct(sim.flood)} of games</div>}
          </div>
        </div>
      )}

      {shown.length > 0 && (
        <ul className="findings">
          {shown.map(f => (
            <li key={f.id} className={`finding ${f.level}`}>
              <span className="finding-icon" aria-label={f.level === 'bad' ? 'Problem' : 'Worth a look'}>{f.level === 'bad' ? '✕' : '!'}</span>
              <div className="finding-text">
                <b>{f.title}</b>
                <div className="small muted">{f.detail}</div>
              </div>
              {f.action && <button type="button" className="small" onClick={() => act(f.action!)}>{f.action.label}</button>}
            </li>
          ))}
        </ul>
      )}
      {findings.length > SHOWN && (
        <button type="button" className="linkish small" onClick={() => setShowAll(s => !s)}>
          {showAll ? 'Show fewer' : `Show ${findings.length - SHOWN} more`}
        </button>
      )}

    </section>
  );
}
