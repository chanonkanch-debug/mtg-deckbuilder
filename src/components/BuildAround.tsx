import { useEffect, useState } from 'react';
import { autocomplete, fetchNamed, type Card } from '../lib/scryfall';
import { entriesOf, type Deck } from '../lib/rules';
import { customHook, MAX_HOOKS, type Hook } from '../lib/buildAround';
import { hasWebGPU, MODEL_SIZE, readCards, type AiRead } from '../ai/readCards';

interface Props {
  deck: Deck;
  seeds: Card[];
  setSeeds: (fn: (s: Card[]) => Card[]) => void;
  hooks: Hook[];
  off: Set<string>;
  onToggleHook: (id: string) => void;
  onAddHook: (hook: Hook) => void;
  /** What the search is limited to, e.g. "B and R cards". */
  colorsNote: string;
  hoverZoom: boolean;
  onPreview: (e: React.MouseEvent, src: string | null) => void;
  onHidePreview: () => void;
  /** The AI read of the current cards, if there is one; null goes back to the quick read. */
  aiRead: AiRead | null;
  onAiRead: (read: AiRead | null) => void;
}

const KIND_LABEL: Record<Hook['kind'], string> = { ai: 'AI read', fuel: 'Turns a drawback into fuel', theme: 'Theme', keyword: 'Keyword', mechanic: 'Mechanic', tribe: 'Tribe', custom: 'Your phrase' };

/** Pick cards to build around; what they care about is added to the card search below, with the other filters. */
export default function BuildAround({ deck, seeds, setSeeds, hooks, off, onToggleHook, onAddHook, colorsNote, hoverZoom, onPreview, onHidePreview, aiRead, onAiRead }: Props) {
  const [name, setName] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [phrase, setPhrase] = useState('');
  const [status, setStatus] = useState('');
  const [aiStatus, setAiStatus] = useState<{ text: string; progress: number; busy: boolean } | null>(null);

  useEffect(() => {
    const v = name.trim();
    if (v.length < 2) { setNames([]); return; }
    let live = true;
    const t = setTimeout(() => autocomplete(v).then(n => { if (live) setNames(n); }).catch(() => {}), 250);
    return () => { live = false; clearTimeout(t); };
  }, [name]);

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

  async function readWithAi() {
    setAiStatus({ text: 'Starting the AI…', progress: 0, busy: true });
    try {
      const read = await readCards(seeds, deck.format, (text, progress) => setAiStatus({ text, progress, busy: true }));
      onAiRead(read);
      setAiStatus(null);
    } catch (err) {
      setAiStatus({ text: `The AI read failed: ${err instanceof Error ? err.message : String(err)}`, progress: 0, busy: false });
    }
  }

  const cmdr = entriesOf(deck).find(e => e.cmdr)?.card;
  const on = hooks.filter(h => !off.has(h.id)).length;
  return (
    <div className="filters build">
      <p className="small muted" style={{ margin: '0 0 8px' }}>
        Pick the cards you want to play. What they care about is added to the search results below, together with your other filters.
      </p>
      <div className="fgroup">
        <div className="flabel">Build around</div>
        <div className="chips">
          {seeds.map(s => (
            <button type="button" key={s.name} title="Remove" aria-pressed="true"
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
        {status && <p className="small muted">{status}</p>}
      </div>

      {seeds.length > 0 && (
        <div className="fgroup">
          <div className="flabel">What they care about</div>
          <div className="ai-read small">
            {aiRead ? (
              <>
                <p style={{ margin: '0 0 6px' }}><strong>AI read:</strong> {aiRead.summary}</p>
                <button type="button" onClick={() => onAiRead(null)}>Use the quick read instead</button>
              </>
            ) : !hasWebGPU() ? (
              <p className="muted" style={{ margin: 0 }}>The AI read runs on your graphics card and needs a browser with WebGPU, such as Chrome or Edge on a computer.</p>
            ) : aiStatus?.busy ? (
              <>
                <p className="muted" style={{ margin: '0 0 4px' }}>{aiStatus.text}</p>
                {aiStatus.progress > 0 && aiStatus.progress < 1 && <progress value={aiStatus.progress} max={1} />}
              </>
            ) : (
              <>
                <button type="button" onClick={readWithAi}>Read with AI</button>{' '}
                <span className="muted">Runs in your browser, free. The first time downloads the model ({MODEL_SIZE}).</span>
                {aiStatus && <p className="muted" style={{ margin: '4px 0 0' }}>{aiStatus.text}</p>}
              </>
            )}
          </div>
          <div className="chips">
            {hooks.map(h => (
              <button type="button" key={h.id} aria-pressed={!off.has(h.id)}
                title={`${KIND_LABEL[h.kind]}${h.seeds.length ? ` · from ${h.seeds.join(', ')}` : ''}${h.why ? `\n${h.why}` : ''}\n${h.query}`}
                onClick={() => onToggleHook(h.id)}>
                {h.label}{h.seeds.length > 1 ? ` ×${h.seeds.length}` : ''}
              </button>
            ))}
            {hooks.length === 0 && <span className="small muted">Nothing found in the rules text. Add a phrase below.</span>}
          </div>
          <form className="row" style={{ marginTop: 6 }}
            onSubmit={e => { e.preventDefault(); if (phrase.trim()) { onAddHook(customHook(phrase)); setPhrase(''); } }}>
            <input value={phrase} onChange={e => setPhrase(e.target.value)} placeholder='Add a phrase, e.g. "the Ring tempts you"' />
            <button type="submit">Add phrase</button>
          </form>
          <p className="small muted">
            {on ? `Showing cards that match any of the ${Math.min(on, MAX_HOOKS)} selected, ${colorsNote}.` : 'Select at least one to search.'}
            {on > MAX_HOOKS && ` Only the first ${MAX_HOOKS} are used; turn some off to pick which.`}
            {' '}Sorting by EDHREC rank puts the most played first.
          </p>
        </div>
      )}
    </div>
  );
}
