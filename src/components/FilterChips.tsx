import { FILTERS } from '../lib/filters';

interface Props { active: Set<string>; onToggle: (id: string) => void; onClear: () => void }

export default function FilterChips({ active, onToggle, onClear }: Props) {
  return (
    <details className="filters">
      <summary>Filters {active.size > 0 && <span className="count">({active.size})</span>}</summary>
      {FILTERS.map(g => (
        <div className="fgroup" key={g.key}>
          <div className="flabel">{g.label}</div>
          <div className="chips">
            {g.options.map(([label], i) => {
              const id = `${g.key}:${i}`;
              return <button type="button" key={id} data-f={id} aria-pressed={active.has(id)} onClick={() => onToggle(id)}>{label}</button>;
            })}
          </div>
        </div>
      ))}
      <div className="row"><button type="button" className="small" onClick={onClear}>Clear filters</button></div>
    </details>
  );
}
