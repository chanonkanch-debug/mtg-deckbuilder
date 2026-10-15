import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../lib/scryfall';
import type { Deck } from '../lib/rules';
import type { Prefs } from '../lib/storage';
import { checkup, compare, readiness, type Action, type Change, type Snapshot } from '../lib/doctor';
import { goldfish, type Goldfish } from '../lib/goldfish';
import DeckStats, { type Tab } from './DeckStats';
import type { SearchRequest } from './SearchPanel';

interface Props {
  deck: Deck;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  onPreview: (e: React.MouseEvent, src: string | null) => void;
  onHidePreview: () => void;
  onOpen: (card: Card) => void;
  onSearch: (req: SearchRequest) => void;
  sim: Goldfish | null;
  busy: boolean;
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

/** The deck panel's main analysis: a few plain-language problems with a fix for each, and the detailed tabs on request. */
export default function Checkup({ deck, prefs, setPrefs, onPreview, onHidePreview, onOpen, onSearch, sim, busy }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [changes, setChanges] = useState<Change[]>([]);
  const last = useRef<Snapshot | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  const openDetails = (tab: string) => {
    setPrefs({ detailsTab: tab });
    setDetailsOpen(true);
  };
  const act = (a: Action) => {
    if (a.kind === 'search') onSearch({ query: a.query, archetype: a.archetype });
    else if (a.kind === 'details') openDetails(a.tab);
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

      <div className="details-toggle">
        <button type="button" className="small" onClick={() => setDetailsOpen(true)}>Deck details</button>
        <span className="small muted"> Curve, mana base, castability, roles, simulation and sample hands</span>
      </div>
      {detailsOpen && (
        <DetailsWindow deck={deck} tab={prefs.detailsTab as Tab} setTab={t => setPrefs({ detailsTab: t })} onClose={() => setDetailsOpen(false)}
          onPreview={onPreview} onHidePreview={onHidePreview} onOpen={onOpen}
          onFindMore={archetype => { setDetailsOpen(false); onSearch({ archetype }); }} />
      )}
    </section>
  );
}

/** The detailed analysis tabs in a fixed-size window over the page, so nothing below the deck needs scrolling to. */
function DetailsWindow({ deck, tab, setTab, onClose, onPreview, onHidePreview, onOpen, onFindMore }: {
  deck: Deck; tab: Tab; setTab: (t: Tab) => void; onClose: () => void; onFindMore: (archetype: string) => void;
} & Pick<Props, 'onPreview' | 'onHidePreview' | 'onOpen'>) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.getElementById('modal')) onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="details-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="details-window" role="dialog" aria-modal="true" aria-label="Deck details">
        <div className="details-head">
          <b>{deck.name || 'Deck'} details</b>
          <button type="button" ref={closeRef} className="close" title="Close (Esc)" onClick={onClose}>✕</button>
        </div>
        <DeckStats deck={deck} tab={tab} setTab={setTab} onPreview={onPreview} onHidePreview={onHidePreview} onOpen={onOpen} onFindMore={onFindMore} />
      </div>
    </div>
  );
}
