import { useState } from 'react';
import ManaText from './ManaText';
import type { Deck } from '../lib/rules';
import { COLOR_NAMES, COLORS, curveByColor, manaBase, typeCounts } from '../lib/analysis';

type Tab = 'curve' | 'types' | 'mana';
const TABS: [Tab, string][] = [['curve', 'Curve'], ['types', 'Types'], ['mana', 'Mana base']];
// Stack order bottom to top. Colors come from the --mana-* tokens in styles.css.
const STACK = [...COLORS, 'M', 'C'];

export default function DeckStats({ deck }: { deck: Deck }) {
  const [tab, setTab] = useState<Tab>('curve');
  return (
    <div className="deck-stats">
      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab === 'curve' && <Curve deck={deck} />}
      {tab === 'types' && <Types deck={deck} />}
      {tab === 'mana' && <ManaBase deck={deck} />}
    </div>
  );
}

function Curve({ deck }: { deck: Deck }) {
  const curve = curveByColor(deck);
  const totals = curve.map(slot => Object.values(slot).reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const used = STACK.filter(k => curve.some(slot => slot[k]));
  if (!totals.some(Boolean)) return <p className="small muted">Add nonland cards to the main deck to see the curve.</p>;
  return (
    <>
      <div className="curve" aria-label="Mana curve of nonland main deck cards">
        {curve.map((slot, i) => (
          <div className="col" key={i}>
            <span className="n">{totals[i] || ''}</span>
            <div className="bar-stack" style={{ height: `${(totals[i] / max) * 85}%` }}>
              {STACK.filter(k => slot[k]).map(k => (
                <div key={k} className="seg" style={{ flexGrow: slot[k], background: `var(--mana-${k})` }}
                  title={`Mana value ${i === 7 ? '7+' : i}: ${slot[k]} ${COLOR_NAMES[k].toLowerCase()}`} />
              ))}
            </div>
            <span className="lbl">{i === 7 ? '7+' : i}</span>
          </div>
        ))}
      </div>
      {used.length > 1 && (
        <div className="legend small">
          {used.map(k => <span key={k}><i style={{ background: `var(--mana-${k})` }} />{COLOR_NAMES[k]}</span>)}
        </div>
      )}
    </>
  );
}

function Types({ deck }: { deck: Deck }) {
  const counts = typeCounts(deck);
  const max = Math.max(1, ...counts.map(([, n]) => n));
  if (!counts.length) return <p className="small muted">The main deck is empty.</p>;
  return (
    <div className="hbars">
      {counts.map(([type, n]) => (
        <div className="hbar" key={type}>
          <span className="hbar-label">{type}</span>
          <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className="hbar-n">{n}</span>
        </div>
      ))}
    </div>
  );
}

function ManaBase({ deck }: { deck: Deck }) {
  const { rows, lands } = manaBase(deck);
  if (!rows.length) return <p className="small muted">Add colored spells to see how your lands should be split.</p>;
  return (
    <>
      <table className="mana-table">
        <thead>
          <tr><th>Color</th><th>Mana symbols</th><th>Share</th><th>Lands making it</th><th>Suggested lands</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.color}>
              <td><ManaText text={`{${r.color}}`} /> {COLOR_NAMES[r.color]}</td>
              <td>{r.pips}</td>
              <td>{Math.round(r.share * 100)}%</td>
              <td className={r.sources < r.suggested ? 'low' : ''}>{r.sources}</td>
              <td>{r.suggested}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Suggested lands split your {lands} land{lands === 1 ? '' : 's'} by each color's share of mana symbols in your spells.
        Dual lands count toward every color they make. Highlighted counts are below the suggestion.
      </p>
    </>
  );
}
