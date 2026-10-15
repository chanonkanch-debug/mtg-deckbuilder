import { useState } from 'react';
import { fetchCollection, type Card } from '../lib/scryfall';
import { checkDeck, deckStats, FORMAT_RULES, type Board, type Deck, type DeckEntry } from '../lib/rules';
import { groupDeck, type Group } from '../lib/analysis';
import { exportList, parseList } from '../lib/decklist';
import type { Prefs } from '../lib/storage';
import DeckStats from './DeckStats';
import SampleHand from './SampleHand';

interface Props {
  deck: Deck;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  onAdd: (card: Card, board: Board, n?: number) => void;
  onMove: (card: Card, from: Board, to: Board) => void;
  onReplaceCards: (cards: Record<string, DeckEntry>) => void;
  onPreview: (e: React.MouseEvent, src: string | null) => void;
  onHidePreview: () => void;
  onOpen: (card: Card) => void;
  toast: (msg: string) => void;
}

export default function DeckPanel({ deck, prefs, setPrefs, onAdd, onMove, onReplaceCards, onPreview, onHidePreview, onOpen, toast }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showChecks, setShowChecks] = useState(false);
  const groups = groupDeck(deck, prefs.groupBy);
  const toggleGroup = (key: string) => setCollapsed(c => { const n = new Set(c); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const rowProps = { format: deck.format, onAdd, onMove, onPreview, onOpen };

  return (
    <section className="panel" id="deckPanel">
      <SummaryBar deck={deck} showChecks={showChecks} onToggleChecks={() => setShowChecks(s => !s)} />
      {showChecks && (
        <ul className="issues" id="issues">
          {checkDeck(deck).map(([lvl, msg], i) => <li key={i} className={lvl}>{msg}</li>)}
        </ul>
      )}

      <div className="deck-toolbar row small">
        <span className="seg" role="group" aria-label="View">
          {(['list', 'visual'] as const).map(v => (
            <button key={v} type="button" aria-pressed={prefs.deckView === v} onClick={() => setPrefs({ deckView: v })}>
              {v === 'list' ? 'List' : 'Visual'}
            </button>
          ))}
        </span>
        <label>Group by{' '}
          <select value={prefs.groupBy} onChange={e => setPrefs({ groupBy: e.target.value as Prefs['groupBy'] })}>
            <option value="type">Card type</option>
            <option value="mv">Mana value</option>
            <option value="color">Color</option>
          </select>
        </label>
        {groups.length > 0 && (
          <button type="button" onClick={() => setCollapsed(c => (c.size ? new Set() : new Set(groups.map(g => g.key))))}>
            {collapsed.size ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </div>

      <div id="deckList" className={prefs.deckView === 'visual' ? 'visual' : ''} onMouseLeave={onHidePreview}>
        {groups.length === 0 && <p className="muted">Your deck is empty. Search for cards and click one to add it.</p>}
        {groups.map(g => (
          <div className="deck-group" key={g.key}>
            <h3>
              <button type="button" className="group-toggle" aria-expanded={!collapsed.has(g.key)} onClick={() => toggleGroup(g.key)}>
                <span className="caret">{collapsed.has(g.key) ? '▸' : '▾'}</span> {g.title} <span className="muted">({g.count})</span>
              </button>
            </h3>
            {!collapsed.has(g.key) && (prefs.deckView === 'visual'
              ? <VisualGroup group={g} {...rowProps} />
              : <ul>{g.entries.map(e => <DeckRow key={e.card.id} entry={e} board={g.board} {...rowProps} />)}</ul>)}
          </div>
        ))}
      </div>

      <DeckStats deck={deck} />
      <SampleHand deck={deck} onPreview={onPreview} onHidePreview={onHidePreview} onOpen={onOpen} />
      <ImportExport deck={deck} onReplaceCards={onReplaceCards} toast={toast} />
    </section>
  );
}

function SummaryBar({ deck, showChecks, onToggleChecks }: { deck: Deck; showChecks: boolean; onToggleChecks: () => void }) {
  const s = deckStats(deck);
  const rules = FORMAT_RULES[deck.format];
  const issues = checkDeck(deck).filter(([lvl]) => lvl !== 'ok');
  const bad = issues.some(([lvl]) => lvl === 'bad');
  const cmdr = deck.format === 'commander';
  const mainTarget = cmdr ? rules.exact! : rules.min!;
  const mainCount = cmdr ? s.main + s.cmdr : s.main;
  return (
    <div className="summary">
      <div className="summary-stats">
        <span><b>{mainCount}</b>/{mainTarget} {cmdr ? 'cards' : 'main'}</span>
        {!cmdr && <span><b>{s.side}</b>/{rules.side} side</span>}
        <span><b>{s.lands}</b> lands</span>
        <span><b>{s.avgMv.toFixed(2)}</b> avg MV</span>
        <span><b>${s.price.toFixed(2)}</b></span>
      </div>
      <button type="button" className={`badge ${issues.length === 0 ? 'ok' : bad ? 'bad' : 'warn'}`} aria-expanded={showChecks} onClick={onToggleChecks}
        title="Show or hide the deck checks">
        {issues.length === 0 ? '✓ Legal' : `${bad ? '✕' : '!'} ${issues.length} issue${issues.length === 1 ? '' : 's'}`} {showChecks ? '▴' : '▾'}
      </button>
    </div>
  );
}

interface RowProps {
  format: string;
  onAdd: Props['onAdd']; onMove: Props['onMove']; onPreview: Props['onPreview']; onOpen: Props['onOpen'];
}

function legalityFlag(card: Card, format: string) {
  const st = card.legalities[format];
  return st === 'banned' ? <span className="flag bad">banned</span>
    : st === 'restricted' ? <span className="flag warn">restricted</span>
    : st !== 'legal' ? <span className="flag bad">not legal</span> : null;
}

function RowButtons({ entry: e, board, onAdd, onMove }: { entry: DeckEntry; board: Board } & Pick<RowProps, 'onAdd' | 'onMove'>) {
  const to: Board = board === 'main' ? 'side' : 'main';
  return (
    <>
      <button type="button" title="Add one" onClick={() => onAdd(e.card, board, 1)}>+</button>
      <button type="button" title="Remove one" onClick={() => onAdd(e.card, board, -1)}>−</button>
      {board !== 'cmdr' && (
        <button type="button" title={`Move one to ${board === 'main' ? 'sideboard' : 'main deck'}`} onClick={() => onMove(e.card, board, to)}>
          {board === 'main' ? '→SB' : '→MD'}
        </button>
      )}
    </>
  );
}

const openOnRightClick = (card: Card, onOpen: (c: Card) => void) => (ev: React.MouseEvent) => {
  if ((ev.target as HTMLElement).closest('button')) return;
  ev.preventDefault();
  onOpen(card);
};

function DeckRow({ entry: e, board, format, onAdd, onMove, onPreview, onOpen }: RowProps & { entry: DeckEntry; board: Board }) {
  return (
    <li onContextMenu={openOnRightClick(e.card, onOpen)}>
      <span className="qty">{e[board]}</span>
      <span className="name" onMouseMove={ev => onPreview(ev, e.card.img_large || e.card.img || null)}>{e.card.name}</span>
      {legalityFlag(e.card, format)}
      <span className="cost">{e.card.mana_cost}</span>
      <RowButtons entry={e} board={board} onAdd={onAdd} onMove={onMove} />
    </li>
  );
}

/** Card images stacked so each card's title bar shows; hovering a card lifts it and shows its controls. */
function VisualGroup({ group, format, onAdd, onMove, onPreview, onOpen }: RowProps & { group: Group }) {
  return (
    <div className="stack">
      {group.entries.map(e => (
        <div className="stack-card" key={e.card.id} onContextMenu={openOnRightClick(e.card, onOpen)}>
          {e.card.img
            ? <img src={e.card.img} alt={e.card.name} loading="lazy" onMouseMove={ev => onPreview(ev, e.card.img_large || e.card.img)} />
            : <div className="noimg"><b>{e.card.name}</b><br />{e.card.mana_cost}</div>}
          <span className="stack-qty">{e[group.board]}×</span>
          {legalityFlag(e.card, format) && <span className="stack-flag">{legalityFlag(e.card, format)}</span>}
          <span className="stack-btns"><RowButtons entry={e} board={group.board} onAdd={onAdd} onMove={onMove} /></span>
        </div>
      ))}
    </div>
  );
}

function ImportExport({ deck, onReplaceCards, toast }: Pick<Props, 'deck' | 'onReplaceCards' | 'toast'>) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function importList() {
    const rows = parseList(text);
    if (!rows.length) return toast('Nothing to import.');
    setBusy(true);
    try {
      const { found, notFound } = await fetchCollection(rows.map(r => (r.set ? { name: r.name, set: r.set } : { name: r.name })));
      const byName = new Map(found.map(c => [c.name.toLowerCase(), c]));
      // Lists often name only the front face of split / double-faced cards.
      const lookup = (name: string) => {
        const n = name.toLowerCase();
        return byName.get(n) || found.find(c => c.name.toLowerCase().split(' // ')[0] === n.split(' // ')[0]) || null;
      };
      const cards: Record<string, DeckEntry> = {};
      rows.forEach(r => {
        const c = lookup(r.name);
        if (!c) return;
        const e = cards[c.id] || (cards[c.id] = { card: c, main: 0, side: 0, cmdr: 0 });
        e[r.board] += r.qty;
      });
      onReplaceCards(cards);
      toast(notFound.length ? `Imported. Not found: ${notFound.join(', ')}` : 'Deck imported.');
    } catch (err) {
      toast(`Import failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const t = exportList(deck);
    setText(t);
    try { await navigator.clipboard.writeText(t); toast('Decklist copied.'); } catch { toast('Copy failed; select the text instead.'); }
  }

  return (
    <details>
      <summary>Import / export decklist</summary>
      <p className="small muted">
        One card per line, like <code>4 Lightning Bolt</code>. Lines after <code>Sideboard</code> go to the sideboard and lines
        after <code>Commander</code> go to the command zone. Importing replaces the current deck.
      </p>
      <textarea id="listText" spellCheck={false} value={text} onChange={e => setText(e.target.value)} />
      <div className="row" style={{ marginTop: 6 }}>
        <button className="primary" disabled={busy} onClick={importList}>{busy ? 'Importing…' : 'Import'}</button>
        <button onClick={() => setText(exportList(deck))}>Export to text</button>
        <button onClick={copy}>Copy</button>
      </div>
    </details>
  );
}
