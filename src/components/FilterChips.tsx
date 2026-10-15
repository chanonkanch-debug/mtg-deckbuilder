import type { FilterGroup } from '../lib/filters';

interface Props {
  title: string;
  groups: FilterGroup[];
  active: Set<string>;
  onToggle: (id: string) => void;
  onClear: (groupKeys: string[]) => void;
  note?: string;
}

/** A dropdown of toggle buttons. Each button adds its Scryfall query; hover shows what it searches for. */
export default function FilterChips({ title, groups, active, onToggle, onClear, note }: Props) {
  const count = groups.reduce((n, g) => n + g.options.filter((_, i) => active.has(`${g.key}:${i}`)).length, 0);
  return (
    <details className="filters">
      <summary>{title} {count > 0 && <span className="count">({count})</span>}</summary>
      {note && <p className="small muted" style={{ margin: '0 0 8px' }}>{note}</p>}
      {groups.map(g => (
        <div className="fgroup" key={g.key}>
          <div className="flabel">{g.label}</div>
          <div className="chips">
            {g.options.map(([label, query, hint], i) => {
              const id = `${g.key}:${i}`;
              return (
                <button type="button" key={id} data-f={id} aria-pressed={active.has(id)} title={hint ? `${hint}\n${query}` : query} onClick={() => onToggle(id)}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="row">
        <button type="button" className="small" onClick={() => onClear(groups.map(g => g.key))}>
          Clear {title.toLowerCase()}
        </button>
      </div>
    </details>
  );
}
