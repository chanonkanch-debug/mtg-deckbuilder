import { useState } from 'react';
import { fetchCollection, type Card } from '../lib/scryfall';
import { checkDeck, deckStats, entriesOf, primaryType, TYPE_ORDER, type Board, type Deck, type DeckEntry } from '../lib/rules';
import { exportList, parseList } from '../lib/decklist';

interface Props {
  deck: Deck;
  onAdd: (card: Card, board: Board, n?: number) => void;
  onMove: (card: Card, from: Board, to: Board) => void;
  onReplaceCards: (cards: Record<string, DeckEntry>) => void;
  onPreview: (e: React.MouseEvent, src: string | null) => void;
  onHidePreview: () => void;
  onOpen: (card: Card) => void;
  toast: (msg: string) => void;
}

const GROUP_TITLES: Record<string, string> = { Sorcery: 'Sorceries', Other: 'Other' };
const PIP_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };

export default function DeckPanel({ deck, onAdd, onMove, onReplaceCards, onPreview, onHidePreview, onOpen, toast }: Props) {
  const all = entriesOf(deck);
  const groups: { title: string; board: Board; list: DeckEntry[] }[] = [];
  const cmd = all.filter(e => e.cmdr);
  if (cmd.length) groups.push({ title: 'Commander', board: 'cmdr', list: cmd });
  const byType: Record<string, DeckEntry[]> = {};
  all.filter(e => e.main).forEach(e => (byType[primaryType(e.card)] ||= []).push(e));
  [...TYPE_ORDER, 'Other'].forEach(t => { if (byType[t]) groups.push({ title: GROUP_TITLES[t] || t + 's', board: 'main', list: byType[t] }); });
  const side = all.filter(e => e.side);
  if (side.length) groups.push({ title: 'Sideboard', board: 'side', list: side });

  const stats = deckStats(deck);
  const maxCurve = Math.max(1, ...stats.curve);

  return (
    <section className="panel" id="deckPanel">
      <h2>Deck</h2>
      <div id="deckList" onMouseLeave={onHidePreview}>
        {groups.length === 0 && <p className="muted">Your deck is empty. Search for cards and click one to add it.</p>}
        {groups.map(g => (
          <div className="deck-group" key={g.title}>
            <h3>{g.title} ({g.list.reduce((s, e) => s + e[g.board], 0)})</h3>
            <ul>
              {[...g.list].sort((a, b) => a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name)).map(e => (
                <DeckRow key={e.card.id} entry={e} board={g.board} format={deck.format}
                  onAdd={onAdd} onMove={onMove} onPreview={onPreview} onOpen={onOpen} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h3>Checks</h3>
      <ul className="issues" id="issues">
        {checkDeck(deck).map(([lvl, msg], i) => <li key={i} className={lvl}>{msg}</li>)}
      </ul>

      <h3>Mana curve <span className="small">(main deck, nonland)</span></h3>
      <div className="curve">
        {stats.curve.map((n, i) => (
          <div className="col" key={i}>
            <span className="n">{n || ''}</span>
            <div className="bar" style={{ height: `${(n / maxCurve) * 85}%` }} />
            <span className="lbl">{i === 7 ? '7+' : i}</span>
          </div>
        ))}
      </div>

      <h3>Breakdown</h3>
      <div className="stats">
        {([
          ['Main deck', stats.main], ['Sideboard', stats.side], ['Lands', stats.lands],
          ['Avg mana value', stats.avgMv.toFixed(2)], ['Est. price (USD)', '$' + stats.price.toFixed(2)],
          ...Object.entries(stats.pips).filter(([, n]) => n).map(([c, n]) => [PIP_NAMES[c as keyof typeof PIP_NAMES] + ' pips', n]),
        ] as [string, string | number][]).map(([k, v]) => (
          <div className="stat" key={k}><span className="small muted">{k}</span><b>{v}</b></div>
        ))}
      </div>

      <ImportExport deck={deck} onReplaceCards={onReplaceCards} toast={toast} />
    </section>
  );
}

interface RowProps {
  entry: DeckEntry; board: Board; format: string;
  onAdd: Props['onAdd']; onMove: Props['onMove']; onPreview: Props['onPreview']; onOpen: Props['onOpen'];
}

function DeckRow({ entry: e, board, format, onAdd, onMove, onPreview, onOpen }: RowProps) {
  const st = e.card.legalities[format];
  const flag = st === 'banned' ? <span className="flag bad">banned</span>
    : st === 'restricted' ? <span className="flag warn">restricted</span>
    : st !== 'legal' ? <span className="flag bad">not legal</span> : null;
  const to: Board = board === 'main' ? 'side' : 'main';
  return (
    <li onContextMenu={ev => { if ((ev.target as HTMLElement).closest('button')) return; ev.preventDefault(); onOpen(e.card); }}>
      <span className="qty">{e[board]}</span>
      <span className="name" onMouseMove={ev => onPreview(ev, e.card.img_large || e.card.img || null)}>{e.card.name}</span>
      {flag}
      <span className="cost">{e.card.mana_cost}</span>
      <button title="Add one" onClick={() => onAdd(e.card, board, 1)}>+</button>
      <button title="Remove one" onClick={() => onAdd(e.card, board, -1)}>−</button>
      {board !== 'cmdr' && (
        <button title={`Move one to ${board === 'main' ? 'sideboard' : 'main deck'}`} onClick={() => onMove(e.card, board, to)}>
          {board === 'main' ? '→SB' : '→MD'}
        </button>
      )}
    </li>
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
