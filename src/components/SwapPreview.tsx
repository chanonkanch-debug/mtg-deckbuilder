import { useEffect, useMemo, useRef, useState } from 'react';
import { entriesOf, type Deck } from '../lib/rules';
import { goldfish, type Goldfish } from '../lib/goldfish';
import { addedCastOdds, applyTrial, trialReport, type Trial } from '../lib/swap';
import { reliable } from '../lib/castability';
import ManaText from './ManaText';

interface Props {
  deck: Deck;
  trial: Trial;
  setTrial: (t: Trial | null) => void;
  /** The current deck's simulation, shared with the checkup. */
  sim: Goldfish | null;
  onCommit: (t: Trial) => void;
}

const MARK = { better: '▲', worse: '▼', same: '' };

/** Shows what adding one card and/or cutting another would change, before you make the swap. */
export default function SwapPreview({ deck, trial, setTrial, sim, onCommit }: Props) {
  const ref = useRef<HTMLElement>(null);
  const after = useMemo(() => applyTrial(deck, trial), [deck, trial]);
  const [simAfter, setSimAfter] = useState<Goldfish | null>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    setBusy(true);
    const t = setTimeout(() => { setSimAfter(goldfish(after, 4000, 0)); setBusy(false); }, 150);
    return () => clearTimeout(t);
  }, [after]);
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [trial.add?.id, trial.cut?.id]);

  const changed = !!(trial.add || trial.cut);
  const rows = useMemo(() => (changed && !busy ? trialReport(deck, after, sim, simAfter) : []), [changed, busy, deck, after, sim, simAfter]);
  const odds = useMemo(() => addedCastOdds(after, trial.add), [after, trial.add]);
  const mainCards = entriesOf(deck).filter(e => e.main).map(e => e.card).sort((a, b) => a.name.localeCompare(b.name));
  const better = rows.filter(r => r.verdict === 'better').length, worse = rows.filter(r => r.verdict === 'worse').length;

  return (
    <section className="swap" ref={ref} aria-labelledby="swapTitle">
      <div className="swap-head">
        <h3 id="swapTitle">Try a swap</h3>
        <button type="button" className="linkish small" onClick={() => setTrial(null)}>Close</button>
      </div>
      <div className="swap-picks">
        <div className="swap-pick">
          <span className="swap-sign add" aria-hidden>+</span>
          {trial.add
            ? <><b>{trial.add.name}</b> <ManaText className="cost" text={trial.add.mana_cost} />
              <button type="button" className="linkish small" onClick={() => setTrial({ ...trial, add: undefined })}>Remove</button></>
            : <span className="muted small">Add nothing, or press Try on a search result.</span>}
        </div>
        <div className="swap-pick">
          <span className="swap-sign cut" aria-hidden>−</span>
          <select aria-label="Card to cut" value={trial.cut?.id ?? ''}
            onChange={e => setTrial({ ...trial, cut: mainCards.find(c => c.id === e.target.value) })}>
            <option value="">Cut nothing</option>
            {mainCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {!changed && <p className="small muted">Pick a card to add or cut to see what changes.</p>}
      {changed && busy && <p className="small muted">Comparing…</p>}
      {changed && !busy && (
        <>
          <p className={`small swap-verdict ${worse > better ? 'worse' : better > worse ? 'better' : ''}`}>
            {better === 0 && worse === 0 ? 'About the same as now.'
              : `${better} thing${better === 1 ? '' : 's'} better, ${worse} worse.`}
            {trial.add && odds !== null && (
              <span className={reliable(odds) ? '' : 'worse'}> {trial.add.name} would be castable on curve in {Math.round(odds * 100)}% of games.</span>
            )}
          </p>
          <table className="swap-table">
            <thead><tr><th></th><th>Now</th><th>After</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.label} className={r.verdict}>
                  <td>{r.label}</td><td>{r.before}</td>
                  <td>{r.after} {MARK[r.verdict] && <span aria-label={r.verdict}>{MARK[r.verdict]}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button type="button" className="primary" onClick={() => onCommit(trial)}>Make this swap</button>
            <span className="small muted">Simulated, so rates can move a point or so between runs.</span>
          </div>
        </>
      )}
    </section>
  );
}
