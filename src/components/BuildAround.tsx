import { useEffect, useMemo, useRef, useState } from 'react';
import { autocomplete, fetchNamed, searchCards, searchUrl, type Card } from '../lib/scryfall';
import { commanderIdentity, entriesOf, type Board, type Deck } from '../lib/rules';
import { customHook, hooksForSeeds, identityFor, rankSuggestions, type Hook, type Suggestion } from '../lib/buildAround';

interface Props {
  deck: Deck;
  seeds: Card[];
  setSeeds: (fn: (s: Card[]) => Card[]) => void;
  hoverZoom: boolean;
  onAdd: (card: Card, board: Board) => void;
  onTry: (card: Card) => void;
  onPreview: (e: React.MouseEvent, src: string | null) => void;
  onHidePreview: () => void;
  onOpen: (card: Card) => void;
}

/** Searches run one per hook, so only this many of the most shared hooks are searched at once. */
const MAX_HOOKS = 10;
const SHOW_STEP = 30;
const KIND_LABEL: Record<Hook['kind'], string> = { theme: 'Theme', keyword: 'Keyword', mechanic: 'Mechanic', tribe: 'Tribe', custom: 'Your phrase' };

/** Pick one or more cards to build around; it reads what they care about and finds cards that fit them together. */
export default function BuildAround({ deck, seeds, setSeeds, hoverZoom, onAdd, onTry, onPreview, onHidePreview, onOpen }: Props) {
  const [name, setName] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<Hook[]>([]);
  const [phrase, setPhrase] = useState('');
  const [found, setFound] = useState<Suggestion[] | null>(null);
  const [shown, setShown] = useState(SHOW_STEP);
  const [status, setStatus] = useState('');
  const run = useRef(0);

  const hooks = useMemo(() => [...hooksForSeeds(seeds), ...custom], [seeds, custom]);
  const active = hooks.filter(h => !off.has(h.id)).slice(0, MAX_HOOKS);
  const commander = deck.format === 'commander' && entriesOf(deck).some(e => e.cmdr) ? commanderIdentity(deck) : null;
  const identity = identityFor(seeds, commander);

  useEffect(() => {
    const v = name.trim();
    if (v.length < 2) { setNames([]); return; }
    let live = true;
    const t = setTimeout(() => autocomplete(v).then(n => { if (live) setNames(n); }).catch(() => {}), 250);
    return () => { live = false; clearTimeout(t); };
  }, [name]);

  // New seeds or hooks make the old suggestions stale.
  useEffect(() => { setFound(null); setStatus(''); }, [seeds, custom, off]);

  async function addSeed(e: React.FormEvent) {
    e.preventDefault();
    const v = name.trim();
    if (!v) return;
    setStatus(`Looking up ${v}…`);
    try {
      const card = await fetchNamed(v);
      setSeeds(s => (s.some(c => c.name === card.name) ? s : [...s, card]));
      setName('');
      setStatus('');
    } catch {
      setStatus(`Couldn't find a card named "${v}".`);
    }
  }

  async function find() {
    const mine = ++run.current;
    const exclude = new Set([...seeds.map(s => s.name), ...entriesOf(deck).map(e => e.card.name)]);
    const results: { hook: Hook; cards: Card[] }[] = [];
    try {
      for (const [i, hook] of active.entries()) {
        setStatus(`Searching ${i + 1} of ${active.length}: ${hook.label}…`);
        const q = `(${hook.query}) f:${deck.format} id<=${identity}`;
        const { page } = await searchCards(searchUrl({ q, order: 'edhrec', dir: 'asc' }));
        if (mine !== run.current) return;
        results.push({ hook, cards: page.data });
      }
      const ranked = rankSuggestions(results, exclude);
      setFound(ranked);
      setShown(SHOW_STEP);
      setStatus(ranked.length ? '' : 'No cards found. Try turning on other hooks or adding a phrase.');
    } catch (err) {
      if (mine === run.current) setStatus(`Search failed: ${(err as Error).message}`);
    }
  }

  const cmdr = entriesOf(deck).find(e => e.cmdr)?.card;
  // Cards added since the search drop out of the list.
  const inDeck = new Set(entriesOf(deck).map(e => e.card.name));
  const list = found?.filter(s => !inDeck.has(s.card.name)) ?? null;
  return (
    <div className="filters build">
      <p className="small muted" style={{ margin: '0 0 8px' }}>
        Pick the cards you want to play. It reads what they care about and finds cards that fit, best fits for several of your cards first.
      </p>
      <div className="fgroup">
        <div className="flabel">Build around</div>
        <div className="chips">
          {seeds.map(s => (
            <button type="button" key={s.name} className="seed" title="Remove" aria-pressed="true"
              onMouseMove={e => onPreview(e, hoverZoom ? s.img_large || s.img : null)} onMouseLeave={onHidePreview}
              onClick={() => { onHidePreview(); setSeeds(list => list.filter(c => c.name !== s.name)); }}>
              {s.name} ×
            </button>
          ))}
          {cmdr && !seeds.some(s => s.name === cmdr.name) && (
            <button type="button" onClick={() => setSeeds(s => [...s, cmdr])}>+ My commander</button>
          )}
        </div>
        <form className="row" style={{ marginTop: 6 }} onSubmit={addSeed}>
          <input type="search" list="build-ac" value={name} onChange={e => setName(e.target.value)} placeholder="Add a card by name" autoComplete="off" />
          <datalist id="build-ac">{names.map(n => <option key={n} value={n} />)}</datalist>
          <button type="submit">Add</button>
        </form>
      </div>

      {seeds.length > 0 && (
        <div className="fgroup">
          <div className="flabel">What they care about</div>
          <div className="chips">
            {hooks.map(h => (
              <button type="button" key={h.id} aria-pressed={!off.has(h.id)}
                title={`${KIND_LABEL[h.kind]}${h.seeds.length ? ` · from ${h.seeds.join(', ')}` : ''}\n${h.query}`}
                onClick={() => setOff(o => { const n = new Set(o); n.has(h.id) ? n.delete(h.id) : n.add(h.id); return n; })}>
                {h.label}{h.seeds.length > 1 ? ` ×${h.seeds.length}` : ''}
              </button>
            ))}
            {hooks.length === 0 && <span className="small muted">Nothing found in the rules text. Add a phrase below.</span>}
          </div>
          <form className="row" style={{ marginTop: 6 }}
            onSubmit={e => { e.preventDefault(); if (phrase.trim()) { setCustom(c => [...c, customHook(phrase)]); setPhrase(''); } }}>
            <input value={phrase} onChange={e => setPhrase(e.target.value)} placeholder='Add a phrase, e.g. "the Ring tempts you"' />
            <button type="submit">Add phrase</button>
          </form>
          {hooks.filter(h => !off.has(h.id)).length > MAX_HOOKS && (
            <p className="small muted">Only the first {MAX_HOOKS} turned-on hooks are searched. Turn some off to pick which.</p>
          )}
        </div>
      )}

      {seeds.length > 0 && (
        <div className="row">
          <button type="button" className="primary" disabled={!active.length} onClick={find}>Find cards</button>
          <span className="small muted">
            {status || `${deck.format[0].toUpperCase() + deck.format.slice(1)}-legal, ${identity === 'c' ? 'colorless' : identity} cards${commander ? " (your commander's colors)" : ''}`}
          </span>
        </div>
      )}

      {list && list.length > 0 && (
        <>
          <div className="results build-results" onMouseLeave={onHidePreview}>
            {list.slice(0, shown).map(s => (
              <div className="result" key={s.card.id} onContextMenu={e => { if ((e.target as HTMLElement).closest('button')) return; e.preventDefault(); onOpen(s.card); }}>
                <img loading="lazy" src={s.card.img} alt={s.card.name} title="Click to add to main deck · right-click to enlarge"
                  onClick={() => onAdd(s.card, 'main')}
                  onMouseMove={e => onPreview(e, hoverZoom ? s.card.img_large || s.card.img : null)} onMouseLeave={onHidePreview} />
                <div className="fits small" title={s.hooks.join(', ')}>{s.hooks.join(' · ')}</div>
                <div className="btns">
                  <button onClick={() => onAdd(s.card, 'main')}>+Main</button>
                  <button title="See what this card would change before adding it" onClick={() => onTry(s.card)}>Try</button>
                </div>
              </div>
            ))}
          </div>
          {shown < list.length && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
              <button type="button" onClick={() => setShown(n => n + SHOW_STEP)}>Show more ({list.length - shown} left)</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
