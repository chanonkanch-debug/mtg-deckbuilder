import { useEffect, useState } from 'react';
import { autocomplete, fetchNamed, type Card } from '../lib/scryfall';
import { entriesOf, type Deck } from '../lib/rules';
import { customHook, MAX_HOOKS, type Hook } from '../lib/buildAround';
import { readCards, type AiRead } from '../ai/readCards';
import { loadAiSettings, PROVIDERS, providerById, saveAiSettings } from '../ai/providers';

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
  const [aiStatus, setAiStatus] = useState<{ text: string; busy: boolean } | null>(null);
  const [aiSettings, setAiSettings] = useState(loadAiSettings);
  const [keyInput, setKeyInput] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const provider = providerById(aiSettings.provider);
  const apiKey = aiSettings.keys[provider.id] || '';

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
    setAiStatus({ text: `Reading the cards with ${provider.label.split(' ')[0]}…`, busy: true });
    try {
      onAiRead(await readCards(seeds, deck.format, provider, apiKey));
      setAiStatus(null);
    } catch (err) {
      setAiStatus({ text: `The AI read failed: ${err instanceof Error ? err.message : String(err)}`, busy: false });
    }
  }

  function saveKey(e: React.FormEvent) {
    e.preventDefault();
    const next = { ...aiSettings, keys: { ...aiSettings.keys, [provider.id]: keyInput.trim() } };
    if (!keyInput.trim()) delete next.keys[provider.id];
    saveAiSettings(next);
    setAiSettings(next);
    setKeyInput('');
    setEditingKey(false);
    setAiStatus(null);
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
            ) : !apiKey || editingKey ? (
              <form className="row" onSubmit={saveKey}>
                {PROVIDERS.length > 1 && (
                  <select value={provider.id} title="AI service" onChange={e => { const next = { ...aiSettings, provider: e.target.value }; saveAiSettings(next); setAiSettings(next); }}>
                    {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                )}
                <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder={`${provider.label} API key, ${provider.keyHint}`} autoComplete="off" />
                <button type="submit">{apiKey && !keyInput.trim() ? 'Remove key' : 'Save key'}</button>
                {editingKey && <button type="button" onClick={() => { setEditingKey(false); setKeyInput(''); }}>Cancel</button>}
                <p className="muted" style={{ margin: '4px 0 0', flexBasis: '100%' }}>
                  For a smarter read, add a free <a href={provider.keyUrl} target="_blank" rel="noreferrer">{provider.label.split(" ")[0]} API key</a>. It's kept only in this browser and sent only to {provider.label.replace(/.*\((.*)\)/, '$1')}. {provider.cost}
                </p>
              </form>
            ) : aiStatus?.busy ? (
              <p className="muted" style={{ margin: 0 }}>{aiStatus.text}</p>
            ) : (
              <>
                <button type="button" onClick={readWithAi}>Read with AI</button>{' '}
                <button type="button" className="linkish muted" onClick={() => setEditingKey(true)}>Change key</button>
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
