import { useEffect, useMemo, useState } from 'react';
import ManaText from './ManaText';
import SampleHand from './SampleHand';
import type { Deck } from '../lib/rules';
import { COLOR_NAMES, COLORS, curveByColor, manaBase, typeCounts } from '../lib/analysis';
import { castability, TARGET } from '../lib/castability';
import { roleCounts } from '../lib/roles';
import { goldfish, sampleGame, TURNS, type Goldfish as GoldfishResult } from '../lib/goldfish';
import type { Card } from '../lib/scryfall';

export type Tab = 'curve' | 'types' | 'mana' | 'cast' | 'roles' | 'goldfish' | 'hand';
const TABS: [Tab, string][] = [['curve', 'Curve'], ['types', 'Types'], ['mana', 'Mana base'], ['cast', 'Castability'], ['roles', 'Roles'], ['goldfish', 'Simulation'], ['hand', 'Sample hand']];
// Stack order bottom to top. Colors come from the --mana-* tokens in styles.css.
const STACK = [...COLORS, 'M', 'C'];

interface Props {
  deck: Deck;
  onPreview: (e: React.MouseEvent, src: string | null) => void;
  onHidePreview: () => void;
  onOpen: (card: Card) => void;
  /** Opens the search with the Archetypes quick filter of this label. */
  onFindMore: (archetype: string) => void;
}

/** Basic stats shown on the page, and the in-depth tabs shown in the Deck details window. */
export const BASIC_TABS: Tab[] = ['curve', 'types', 'mana'];
export const DETAIL_TABS: Tab[] = ['cast', 'roles', 'goldfish', 'hand'];

export default function DeckStats({ deck, onPreview, onHidePreview, onOpen, onFindMore, tabs, tab, setTab }: Props & { tabs: Tab[]; tab: Tab; setTab: (t: Tab) => void }) {
  if (!tabs.includes(tab)) tab = tabs[0];
  return (
    <div className="deck-stats">
      <div className="tabs" role="tablist">
        {TABS.filter(([key]) => tabs.includes(key)).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      <div className="tab-body" role="tabpanel">
        {tab === 'curve' && <Curve deck={deck} />}
        {tab === 'types' && <Types deck={deck} />}
        {tab === 'mana' && <ManaBase deck={deck} />}
        {tab === 'goldfish' && <Goldfish deck={deck} />}
        {tab === 'hand' && <SampleHand deck={deck} onPreview={onPreview} onHidePreview={onHidePreview} onOpen={onOpen} />}
        {tab === 'roles' && <Roles deck={deck} onPreview={onPreview} onHidePreview={onHidePreview} onOpen={onOpen} onFindMore={onFindMore} />}
        {tab === 'cast' && <Castability deck={deck} onPreview={onPreview} onHidePreview={onHidePreview} onOpen={onOpen} />}
      </div>
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

function Castability({ deck, onPreview, onHidePreview, onOpen }: Omit<Props, 'onFindMore'>) {
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
        every land drop. {pct(TARGET)} is Frank Karsten's guideline for a reliable mana base. Only lands count as sources (fetch lands
        count as the colors they can find); mana rocks and dorks are not counted.
      </p>
    </>
  );
}

function Roles({ deck, onPreview, onHidePreview, onOpen, onFindMore }: Props) {
  const { rows, lands, landTarget } = useMemo(() => roleCounts(deck), [deck]);
  const [open, setOpen] = useState<string | null>(null);
  const hasTargets = landTarget !== undefined;
  const status = (count: number, target?: number) => target === undefined ? '' : count >= target ? 'ok' : count >= target * 0.7 ? 'warn' : 'bad';
  const max = Math.max(1, ...rows.map(r => Math.max(r.count, r.target ?? 0)));
  return (
    <>
      <div className="roles" onMouseLeave={onHidePreview}>
        {hasTargets && (
          <div className="role-row">
            <span className="role-label">Lands</span>
            <span />
            <span className={`role-n ${status(lands, landTarget)}`}>{lands}<span className="muted">/{landTarget}</span></span>
            <span />
          </div>
        )}
        {rows.map(r => (
          <div key={r.role.key}>
            <div className="role-row">
              <button type="button" className="role-label linkish" aria-expanded={open === r.role.key} title={r.role.hint}
                onClick={() => setOpen(o => (o === r.role.key ? null : r.role.key))}>
                {open === r.role.key ? '▾' : '▸'} {r.role.label}
              </button>
              <span className="hbar-track role-track">
                <span className="hbar-fill" style={{ width: `${(r.count / max) * 100}%` }} />
                {r.target !== undefined && <span className="role-target" style={{ left: `${(r.target / max) * 100}%` }} title={`Target ${r.target}`} />}
              </span>
              <span className={`role-n ${status(r.count, r.target)}`}>{r.count}{r.target !== undefined && <span className="muted">/{r.target}</span>}</span>
              {r.role.archetype
                ? <button type="button" className="small" title={`Search for ${r.role.label.toLowerCase()} that fit this deck`} onClick={() => onFindMore(r.role.archetype!)}>Find more</button>
                : <span />}
            </div>
            {open === r.role.key && (
              <div className="role-cards small">
                <p className="muted" style={{ margin: '0 0 4px' }}>{r.role.hint}</p>
                {r.cards.length
                  ? r.cards.map(({ card, n }) => (
                    <span key={card.id} className="role-card" onMouseMove={e => onPreview(e, card.img_large || card.img || null)}
                      onContextMenu={e => { e.preventDefault(); onOpen(card); }}>
                      {n > 1 && `${n}× `}{card.name}
                    </span>
                  ))
                  : <span className="muted">None yet.</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="small muted">
        Cards are tagged from their rules text, so unusual wordings can be missed; a card can fill more than one role.
        {hasTargets
          ? ' Targets follow the Command Zone deck template (37 lands, 10 ramp, 10 draw, 10 removal, 3 board wipes); the line on each bar marks the target.'
          : ' Good numbers depend on the archetype, so there are no targets for 60-card formats.'}
        {' '}Find more searches cards of that role that are legal in this deck.
      </p>
    </>
  );
}

const GAMES = 4000;

function Goldfish({ deck }: { deck: Deck }) {
  const [run, setRun] = useState(1);
  const [result, setResult] = useState<GoldfishResult | null | undefined>(undefined);
  const [busy, setBusy] = useState(true);
  const [sample, setSample] = useState<GoldfishResult['sample'] | null>(null);

  // A changed deck starts over at run 1 with a fresh sample game.
  useEffect(() => { setRun(1); setSample(null); }, [deck]);
  // Wait for a pause in edits (clicking + several times) before simulating, so the panel stays responsive.
  useEffect(() => {
    setBusy(true);
    const timer = setTimeout(() => { setResult(goldfish(deck, GAMES, run - 1)); setBusy(false); }, 250);
    return () => clearTimeout(timer);
  }, [deck, run]);

  if (result === undefined) return <p className="small muted">Simulating {GAMES.toLocaleString()} games…</p>;
  if (!result) return <p className="small muted">Add at least {7 + TURNS} cards to the main deck to simulate games.</p>;
  const { turns, stuck, commander } = result;
  const shown = sample ?? result.sample;
  return (
    <div className={busy ? 'stale' : ''}>
      <div className="row small goldfish-bar">
        <span className="muted">{busy ? 'Simulating…' : `Run ${run} · ${GAMES.toLocaleString()} games`}</span>
        <button type="button" disabled={busy} onClick={() => { setRun(r => r + 1); setSample(null); }}
          title="Play a new set of random games. Differences of a couple of percent between runs are just chance.">Run again</button>
        <button type="button" disabled={busy || run === 1} onClick={() => { setRun(1); setSample(null); }}
          title="Go back to run 1, which always gives the same numbers for this deck">Reset</button>
      </div>
      <div className="tiles">
        <div className="tile"><b>{pct(result.mulligan)}</b><span>mulligan</span></div>
        <div className="tile"><b>{pct(result.screw)}</b><span>mana screw<br /><small>2 or fewer lands on turn 4</small></span></div>
        <div className="tile"><b>{pct(result.flood)}</b><span>flood<br /><small>8+ lands in the first 12 cards</small></span></div>
        {commander && (
          <div className="tile"><b>{commander.avgTurn ? `T${commander.avgTurn.toFixed(1)}` : '—'}</b>
            <span>average turn you cast {commander.name}<br /><small>{pct(commander.onCurve)} on curve</small></span></div>
        )}
      </div>
      <table className="mana-table goldfish-table">
        <thead>
          <tr><th>Turn</th><th>Lands</th><th>Mana available</th><th>Mana used</th><th>Cast nothing</th></tr>
        </thead>
        <tbody>
          {turns.map(t => (
            <tr key={t.turn}>
              <td>{t.turn}</td>
              <td>{t.lands.toFixed(1)}</td>
              <td>{t.available.toFixed(1)}</td>
              <td>
                <span className="use-bar" title={`${t.spent.toFixed(1)} of ${t.available.toFixed(1)} mana used on average`}>
                  <span style={{ width: `${t.available ? (t.spent / t.available) * 100 : 0}%` }} />
                </span>
                {t.spent.toFixed(1)} <span className="muted">({t.available ? pct(t.spent / t.available) : '—'})</span>
              </td>
              <td>{pct(t.idle)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {stuck.length > 0 && (
        <div className="small" style={{ marginTop: 8 }}>
          <b>Often stuck in hand</b> <span className="muted">(still uncast on turn {TURNS} with spare mana, in games where it was drawn)</span>
          <ul className="stuck">
            {stuck.map(s => <li key={s.card.id}>{s.card.name} <ManaText text={s.card.mana_cost} /> <span className="bad-text">{pct(s.rate)}</span></li>)}
          </ul>
        </div>
      )}
      <details className="sample-game">
        <summary>Sample game</summary>
        <div className="row small" style={{ margin: '6px 0' }}>
          <button type="button" onClick={() => setSample(sampleGame(deck))}>Play another</button>
          <span className="muted">Opening hand{shown.mulligans ? ` after ${shown.mulligans} mulligan${shown.mulligans > 1 ? 's' : ''}` : ''}: {shown.hand.join(', ')}</span>
        </div>
        <ol className="game-log small">
          {shown.log.map(t => (
            <li key={t.turn}>
              <b>Turn {t.turn}</b> <span className="muted">({t.mana} mana)</span>{' '}
              {t.land ? `Land: ${t.land}.` : <span className="bad-text">No land.</span>}{' '}
              {t.cast.length ? `Cast ${t.cast.join(', ')}.` : <span className="muted">Nothing cast.</span>}
            </li>
          ))}
        </ol>
      </details>
      <p className="small muted">
        {GAMES.toLocaleString()} games played alone, on the play, with no opponent. Each turn it plays the land that best fixes
        your colors, then casts mana makers first and the most expensive spell it can afford. It keeps 7-card hands with 2–5
        lands and mulligans otherwise. Mana rocks, mana creatures, land-search ramp and draw spells are modeled; other card
        effects are not.
      </p>
    </div>
  );
}
