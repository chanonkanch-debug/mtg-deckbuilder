import { useState } from 'react';
import { fetchSets, type SetInfo } from '../lib/scryfall';
import { MAIN_SET_TYPES } from '../lib/filters';

interface Props { selected: Set<string>; onToggle: (code: string) => void; onClear: () => void }

/** Set filter. The set list loads from Scryfall the first time the dropdown opens. */
export default function SetPicker({ selected, onToggle, onClear }: Props) {
  const [sets, setSets] = useState<SetInfo[] | null>(null);
  const [error, setError] = useState('');
  const [term, setTerm] = useState('');
  const [mainOnly, setMainOnly] = useState(true);

  const load = () => {
    if (sets) return;
    fetchSets().then(setSets, err => setError(err.message));
  };

  const t = term.trim().toLowerCase();
  const shown = (sets || [])
    .filter(s => selected.has(s.code) || (
      (!mainOnly || (MAIN_SET_TYPES.has(s.set_type) && !s.digital)) &&
      (!t || s.name.toLowerCase().includes(t) || s.code.toLowerCase() === t)))
    // Ticked sets first, then newest first (Scryfall's order).
    .sort((a, b) => Number(selected.has(b.code)) - Number(selected.has(a.code)))
    .slice(0, 300);

  return (
    <details className="filters" onToggle={e => { if ((e.target as HTMLDetailsElement).open) load(); }}>
      <summary>Sets {selected.size > 0 && <span className="count">({selected.size})</span>}</summary>
      <div className="row" style={{ marginBottom: 6 }}>
        <input type="search" placeholder="Find a set by name or code" style={{ flex: '1 1 200px', minWidth: 0 }} value={term} onChange={e => setTerm(e.target.value)} />
        <select title="Set type" value={mainOnly ? 'main' : 'all'} onChange={e => setMainOnly(e.target.value === 'main')}>
          <option value="main">Main sets</option>
          <option value="all">All set types</option>
        </select>
        <button type="button" className="small" onClick={onClear}>Clear sets</button>
      </div>
      <div className="setlist">
        {error ? <span className="muted small">Couldn't load sets: {error}</span>
          : !sets ? <span className="muted small">Loading sets…</span>
          : shown.length === 0 ? <span className="muted small">No sets match.</span>
          : shown.map(s => (
            <label key={s.code}>
              <input type="checkbox" value={s.code} checked={selected.has(s.code)} onChange={() => onToggle(s.code)} />
              {s.icon_svg_uri && <img src={s.icon_svg_uri} alt="" loading="lazy" />}
              <span>{s.name}</span>
              <span className="code">{s.code} · {(s.released_at || '').slice(0, 4)}</span>
            </label>
          ))}
      </div>
    </details>
  );
}
