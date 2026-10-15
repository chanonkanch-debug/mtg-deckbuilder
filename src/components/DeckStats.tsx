import { useMemo, useState } from 'react';
import ManaText from './ManaText';
import type { Deck } from '../lib/rules';
import { COLOR_NAMES, COLORS, curveByColor, manaBase, typeCounts } from '../lib/analysis';
import { castability, TARGET } from '../lib/castability';
import type { Card } from '../lib/scryfall';

type Tab = 'curve' | 'types' | 'mana' | 'cast';
const TABS: [Tab, string][] = [['curve', 'Curve'], ['types', 'Types'], ['mana', 'Mana base'], ['cast', 'Castability']];
// Stack order bottom to top. Colors come from the --mana-* tokens in styles.css.
const STACK = [...COLORS, 'M', 'C'];

interface Props {
  deck: Deck;
  onPreview: (e: React.MouseEvent, src: string | null) => void;
  onHidePreview: () => void;
  onOpen: (card: Card) => void;
}

export default function DeckStats({ deck, onPreview, onHidePreview, onOpen }: Props) {
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
      {tab === 'cast' && <Castability deck={deck} onPreview={onPreview} onHidePreview={onHidePreview} onOpen={onOpen} />}
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

const pct = (p: number) => `${Math.round(p * 100)}%`;
const level = (p: number) => (p >= TARGET ? 'ok' : p >= 0.8 ? 'warn' : 'bad');

function Castability({ deck, onPreview, onHidePreview, onOpen }: Props) {
  const { rows, landDrops, lands, deckSize } = useMemo(() => castability(deck), [deck]);
  if (deckSize < 7) return <p className="small muted">Add at least 7 cards to the main deck to check castability.</p>;
  if (!rows.length) return <p className="small muted">Add colored spells to see how reliably you can cast them.</p>;
  const below = rows.filter(r => r.odds < TARGET).length;
  return (
    <>
      <p className="small cast-summary">
        <b className={below ? 'bad' : 'ok'}>{below ? `${below} of ${rows.length} spells below ${pct(TARGET)}` : `All ${rows.length} spells at ${pct(TARGET)} or better`}</b>
        <span className="muted"> · {lands} lands in {deckSize} cards · hitting land drops: {landDrops.map(d => `turn ${d.turn} ${pct(d.odds)}`).join(', ')}</span>
      </p>
      <table className="mana-table cast-table" onMouseLeave={onHidePreview}>
        <thead>
          <tr><th>Card</th><th>Turn</th><th>On curve</th><th>To reach {pct(TARGET)}</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.card.id} onContextMenu={e => { e.preventDefault(); onOpen(r.card); }}>
              <td>
                <span className="name" onMouseMove={e => onPreview(e, r.card.img_large || r.card.img || null)}>{r.card.name}</span>{' '}
                <ManaText className="cost" text={r.card.mana_cost} />
              </td>
              <td>{r.turn}</td>
              <td><span className={`cast-odds ${level(r.odds)}`}>{pct(r.odds)}</span></td>
              <td className="small">
                {r.odds >= TARGET ? <span className="muted">OK</span>
                  : r.short.length ? r.short.map(s => (
                    <div key={s.color}>
                      {s.need === null
                        ? <>Not reachable with {lands} lands (<ManaText text={`{${s.color}}`} /> {s.have})</>
                        : <>{s.need - s.have} more <ManaText text={`{${s.color}}`} /> source{s.need - s.have === 1 ? '' : 's'} ({s.have} → {s.need})</>}
                    </div>
                  ))
                  : <span className="muted">More lands that make both colors</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        The chance you have the right colors to cast each spell on the turn equal to its mana value, on the play, assuming you hit
        every land drop. {pct(TARGET)} is Frank Karsten's guideline for a reliable mana base. Only lands count as sources;
        mana rocks, dorks and fetch lands are not counted toward colors.
      </p>
    </>
  );
}
