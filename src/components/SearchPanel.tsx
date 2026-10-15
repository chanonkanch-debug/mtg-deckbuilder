import { useEffect, useMemo, useRef, useState } from 'react';
import ManaText from './ManaText';
import { autocomplete, searchCards, searchUrl, type Card } from '../lib/scryfall';
import { canBeCommander, type Board, type Deck } from '../lib/rules';
import { buildQuery } from '../lib/filters';
import type { Prefs } from '../lib/storage';
import FilterChips from './FilterChips';
import SyntaxGuide from './SyntaxGuide';
import { FILTERS } from '../lib/filters';
import { ARCHETYPES } from '../lib/archetypes';
import SetPicker from './SetPicker';

// Results show PAGE_SIZE cards at a time. Scryfall returns up to 175 per request,
// so the next Scryfall page is only fetched when paging past what is already loaded.
const PAGE_SIZE = 20;
const ZOOM_LEVELS = [90, 110, 140, 170, 200, 240, 300];
// Filter clicks wait briefly so several quick clicks send one search.
const FILTER_DELAY_MS = 450;

const SORTS: [string, string][] = [
  ['name', 'name'], ['cmc', 'mana value'], ['edhrec', 'EDHREC rank'], ['usd', 'price'],
  ['released', 'release date'], ['rarity', 'rarity'], ['power', 'power'], ['toughness', 'toughness'],
];

type PanelKey = 'filters' | 'archetypes' | 'sets' | 'guide';
const TOOLBAR: [PanelKey, string][] = [['filters', 'Filters'], ['archetypes', 'Archetypes'], ['sets', 'Sets'], ['guide', 'Syntax help']];

export interface SearchRequest { archetype?: string; query?: string }

interface Props {
  deck: Deck;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  onAdd: (card: Card, board: Board) => void;
  onPreview: (e: React.MouseEvent, src: string | null) => void;
  onHidePreview: () => void;
  onOpen: (card: Card) => void;
  /** A search started elsewhere (the deck checkup): one Archetypes quick filter or a query. n changes on every request. */
  request?: SearchRequest & { n: number };
}

export default function SearchPanel({ deck, prefs, setPrefs, onAdd, onPreview, onHidePreview, onOpen, request }: Props) {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [filters, setFilters] = useState<Set<string>>(new Set());
  const [sets, setSets] = useState<Set<string>>(new Set());
  const [onlyLegal, setOnlyLegal] = useState(true);
  const [onlyIdentity, setOnlyIdentity] = useState(true);
  const [allArts, setAllArts] = useState(false);
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);

  const [results, setResults] = useState<Card[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [pageIdx, setPageIdx] = useState(0);
  const [info, setInfo] = useState('');
  const [paging, setPaging] = useState(false);

  const delay = useRef(0);
  const seq = useRef(0);
  const panelRef = useRef<HTMLElement>(null);

  // The search is empty until the user types something or picks a filter or set.
  const hasQuery = !!submitted.trim() || filters.size > 0 || sets.size > 0;
  const query = useMemo(() => hasQuery ? buildQuery(deck, { text: submitted, filters, sets, onlyLegal, onlyIdentity }) : '',
    [hasQuery, deck, submitted, filters, sets, onlyLegal, onlyIdentity]);
  const url = query ? searchUrl({ q: query, order: prefs.order, dir: prefs.dir, allArts }) : null;
  const countIn = (groups: typeof FILTERS) => groups.reduce((n, g) => n + g.options.filter((_, i) => filters.has(`${g.key}:${i}`)).length, 0);

  useEffect(() => {
    const mySeq = ++seq.current;
    if (!url) { setResults([]); setTotal(0); setNextPage(null); setPageIdx(0); setInfo(''); return; }
    const timer = setTimeout(async () => {
      setInfo('Searching…');
      try {
        const { page, cached } = await searchCards(url);
        if (mySeq !== seq.current) return; // a newer search started while this one was loading
        setResults(page.data);
        setNextPage(page.has_more ? page.next_page ?? null : null);
        setTotal(page.total_cards);
        setPageIdx(0);
        setInfo(page.total_cards
          ? `${page.total_cards} card${page.total_cards === 1 ? '' : 's'} found${cached ? ' (cached)' : ''}${page.warnings ? ` · ${page.warnings.join(' ')}` : ''}`
          : 'No cards found.');
      } catch (err) {
        if (mySeq !== seq.current) return;
        setResults([]); setTotal(0); setNextPage(null);
        setInfo(`Search failed: ${(err as Error).message}`);
      }
    }, delay.current);
    delay.current = 0;
    return () => clearTimeout(timer);
  }, [url]);

  useEffect(() => {
    if (!request) return;
    const group = ARCHETYPES.find(g => g.options.some(o => o[0] === request.archetype));
    if (!group && !request.query) return;
    setText(request.query ?? ''); setSubmitted(request.query ?? ''); setSets(new Set()); setOpenPanel(null);
    setFilters(group ? new Set([`${group.key}:${group.options.findIndex(o => o[0] === request.archetype)}`]) : new Set());
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [request]);

  // Autocomplete suggestions for plain card names.
  useEffect(() => {
    const v = text.trim();
    if (v.length < 2 || /[:<>=]/.test(v)) { setSuggestions([]); return; }
    let live = true;
    const timer = setTimeout(() => {
      autocomplete(v).then(names => { if (live) setSuggestions(names); }).catch(() => {});
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [text]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  async function goToPage(i: number) {
    if (paging || i < 0 || i >= pageCount) return;
    // Fetch the next Scryfall page when this page isn't fully loaded yet (175 isn't a multiple of 20).
    if ((i + 1) * PAGE_SIZE > results.length && nextPage) {
      setPaging(true);
      const mySeq = seq.current;
      try {
        const { page } = await searchCards(nextPage);
        if (mySeq !== seq.current) return;
        setResults(r => r.concat(page.data));
        setNextPage(page.has_more ? page.next_page ?? null : null);
      } catch (err) {
        setInfo(`Search failed: ${(err as Error).message}`);
        return;
      } finally {
        setPaging(false);
      }
    }
    setPageIdx(i);
    document.getElementById('results')?.scrollIntoView({ block: 'nearest' });
  }

  const toggleFilter = (id: string) => {
    delay.current = FILTER_DELAY_MS;
    setFilters(f => { const n = new Set(f); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const clearGroups = (keys: string[]) => {
    delay.current = FILTER_DELAY_MS;
    setFilters(f => new Set([...f].filter(id => !keys.includes(id.split(':')[0]))));
  };
  const toggleSet = (code: string) => {
    delay.current = FILTER_DELAY_MS;
    setSets(s => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  };

  const pager = (style: React.CSSProperties) => total > PAGE_SIZE && (
    <div className="pager row" style={style}>
      <button type="button" className="prev" title="Previous page" disabled={pageIdx === 0} onClick={() => goToPage(pageIdx - 1)}>‹</button>
      <span className="pageno small muted">Page {pageIdx + 1} of {pageCount}</span>
      <button type="button" className="next" title="Next page" disabled={pageIdx >= pageCount - 1 || paging} onClick={() => goToPage(pageIdx + 1)}>›</button>
    </div>
  );

  const pageCards = results.slice(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE);
  const zoom = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, prefs.zoom));

  return (
    <section className="panel" ref={panelRef}>
      <h2>Card search</h2>
      <form className="row" onSubmit={e => { e.preventDefault(); setSubmitted(text); }}>
        <input
          type="search" id="q" list="ac" autoComplete="off" value={text}
          placeholder="Name or Scryfall syntax, e.g.  t:dragon c:r mv<=4"
          onChange={e => setText(e.target.value)}
        />
        <datalist id="ac">{suggestions.map(n => <option key={n} value={n} />)}</datalist>
        <button className="primary" type="submit">Search</button>
      </form>

      {/* One toolbar; at most one panel open at a time keeps the search area compact. */}
      <div className="toolbar" role="tablist">
        {TOOLBAR.map(([key, label]) => {
          const n = key === 'filters' ? countIn(FILTERS) : key === 'archetypes' ? countIn(ARCHETYPES) : key === 'sets' ? sets.size : 0;
          return (
            <button type="button" key={key} role="tab" aria-selected={openPanel === key} className={openPanel === key ? 'open' : ''}
              onClick={() => setOpenPanel(p => (p === key ? null : key))}>
              {label}{n > 0 && <span className="count"> {n}</span>} <span className="caret">{openPanel === key ? '▴' : '▾'}</span>
            </button>
          );
        })}
      </div>
      {openPanel === 'guide' && <SyntaxGuide onTry={q => { setText(q); setSubmitted(q); }} />}
      {openPanel === 'filters' && <FilterChips title="Filters" groups={FILTERS} active={filters} onToggle={toggleFilter} onClear={clearGroups} />}
      {openPanel === 'archetypes' && (
        <FilterChips
          title="Archetypes" groups={ARCHETYPES} active={filters} onToggle={toggleFilter} onClear={clearGroups}
          note="Pick a strategy or theme, optionally with a tribe. Hover a button to see the search it runs. These match rules text, so expect some loose results."
        />
      )}
      {openPanel === 'sets' && <SetPicker selected={sets} onToggle={toggleSet} onClear={() => setSets(new Set())} />}

      {(filters.size > 0 || sets.size > 0) && (
        <div className="pills">
          {[...FILTERS, ...ARCHETYPES].flatMap(g => g.options.map(([label], i) => [`${g.key}:${i}`, g.key === 'mv' ? `Mana value ${label}` : label] as const))
            .filter(([id]) => filters.has(id))
            .map(([id, label]) => <button type="button" key={id} className="pill" title="Remove" onClick={() => toggleFilter(id)}>{label} ✕</button>)}
          {[...sets].map(code => <button type="button" key={code} className="pill" title="Remove" onClick={() => toggleSet(code)}>Set: {code.toUpperCase()} ✕</button>)}
          <button type="button" className="pill clear" onClick={() => { delay.current = FILTER_DELAY_MS; setFilters(new Set()); setSets(new Set()); }}>Clear all</button>
        </div>
      )}

      <div className="row small" style={{ marginTop: 6 }}>
        <label><input type="checkbox" checked={onlyLegal} onChange={e => setOnlyLegal(e.target.checked)} /> Only cards legal in this format</label>
        {deck.format === 'commander' && (
          <label><input type="checkbox" checked={onlyIdentity} onChange={e => setOnlyIdentity(e.target.checked)} /> Commander color identity</label>
        )}
        <select title="Sort" value={prefs.order} onChange={e => setPrefs({ order: e.target.value })}>
          {SORTS.map(([v, label]) => <option key={v} value={v}>Sort: {label}</option>)}
        </select>
        <button type="button" title="Toggle sort direction" onClick={() => setPrefs({ dir: prefs.dir === 'asc' ? 'desc' : 'asc' })}>
          {prefs.dir === 'asc' ? '↑ Ascending' : '↓ Descending'}
        </button>
        <label title="Off: each card once, with its regular art. On: every printing with a different artwork.">
          <input type="checkbox" checked={allArts} onChange={e => setAllArts(e.target.checked)} /> Show alternate arts
        </label>
      </div>

      <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
        <span className="small muted">{info}</span>
        <span className="row small">
          <label><input type="checkbox" checked={prefs.hoverZoom} onChange={e => setPrefs({ hoverZoom: e.target.checked })} /> Enlarge on hover</label>
          <span className="zoom">
            <button type="button" title="Smaller cards" disabled={zoom === 0} onClick={() => setPrefs({ zoom: zoom - 1 })}>−</button>
            <span className="muted">Zoom {Math.round(ZOOM_LEVELS[zoom] / 140 * 100)}%</span>
            <button type="button" title="Bigger cards" disabled={zoom === ZOOM_LEVELS.length - 1} onClick={() => setPrefs({ zoom: zoom + 1 })}>+</button>
          </span>
        </span>
      </div>

      {query && <div className="small muted query">Searching Scryfall for: <code>{query}</code></div>}
      {pager({ marginTop: 8 })}
      <div
        id="results" className="results"
        style={{ '--card-w': `${ZOOM_LEVELS[zoom]}px` } as React.CSSProperties}
        onMouseLeave={onHidePreview}
      >
        {pageCards.map(c => (
          <div className="result" key={c.id} onContextMenu={e => { if ((e.target as HTMLElement).closest('button')) return; e.preventDefault(); onOpen(c); }}>
            {c.img_small ? (
              <img
                loading="lazy" src={c.img} alt={c.name} title="Click to add to main deck · right-click to enlarge"
                onClick={() => onAdd(c, 'main')}
                onMouseMove={e => onPreview(e, prefs.hoverZoom ? c.img_large || c.img : null)}
                onMouseLeave={onHidePreview}
              />
            ) : (
              <div className="noimg" onClick={() => onAdd(c, 'main')}>
                <b>{c.name}</b><br /><ManaText text={c.mana_cost} /><br />{c.type_line}
              </div>
            )}
            <div className="btns">
              <button onClick={() => onAdd(c, 'main')}>+Main</button>
              <button onClick={() => onAdd(c, 'side')}>+Side</button>
              {deck.format === 'commander' && canBeCommander(c) && <button onClick={() => onAdd(c, 'cmdr')}>Cmdr</button>}
            </div>
          </div>
        ))}
      </div>
      {pager({ marginTop: 10 })}
    </section>
  );
}
