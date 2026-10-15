import { useEffect, useRef, useState } from 'react';
import type { Card } from '../lib/scryfall';
import type { Deck } from '../lib/rules';
import type { Prefs } from '../lib/storage';
import { checkup, readiness, type Action } from '../lib/doctor';
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
}

/** Shown before "Show more"; the rest of the findings are one click away. */
const SHOWN = 4;
const pct = (p: number) => `${Math.round(p * 100)}%`;

/** The deck panel's main analysis: a few plain-language problems with a fix for each, and the detailed tabs on request. */
export default function Checkup({ deck, prefs, setPrefs, onPreview, onHidePreview, onOpen, onSearch }: Props) {
  const [sim, setSim] = useState<Goldfish | null>(null);
  const [busy, setBusy] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);

  // Simulate after a pause in edits; results are cached per deck, so the Goldfish tab's run 1 reuses them.
  useEffect(() => {
    setBusy(true);
    const timer = setTimeout(() => { setSim(goldfish(deck, 4000, 0)); setBusy(false); }, 250);
    return () => clearTimeout(timer);
  }, [deck]);

  const cards = Object.keys(deck.cards).length;
  const { ready, have, need } = readiness(deck);
  const findings = cards ? checkup(deck, busy ? null : sim) : [];
  const shown = showAll ? findings : findings.slice(0, SHOWN);

  const openDetails = (tab: string) => {
    setPrefs({ details: true, detailsTab: tab });
    setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
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

      <div ref={detailsRef} className="details-toggle">
        <button type="button" className="linkish small" aria-expanded={prefs.details} onClick={() => setPrefs({ details: !prefs.details })}>
          {prefs.details ? '▾ Hide details' : '▸ Show details'} <span className="muted">(curve, mana base, castability, roles, simulation)</span>
        </button>
      </div>
      {prefs.details && (
        <DeckStats deck={deck} tab={prefs.detailsTab as Tab} setTab={t => setPrefs({ detailsTab: t })}
          onPreview={onPreview} onHidePreview={onHidePreview} onOpen={onOpen} onFindMore={archetype => onSearch({ archetype })} />
      )}
    </section>
  );
}
