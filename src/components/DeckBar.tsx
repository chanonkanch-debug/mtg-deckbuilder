import { FORMATS, type Format } from '../lib/rules';
import type { Store } from '../lib/storage';

interface Props {
  store: Store;
  onSelect: (id: string) => void;
  onRename: (name: string) => void;
  onFormat: (f: Format) => void;
  onNew: () => void;
  onDelete: () => void;
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function DeckBar({ store, onSelect, onRename, onFormat, onNew, onDelete }: Props) {
  const deck = store.decks[store.current];
  return (
    <header>
      <h1>MTG Deck Builder</h1>
      <select title="Saved decks" value={store.current} onChange={e => onSelect(e.target.value)}>
        {Object.values(store.decks).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <input
        key={deck.id}
        placeholder="Deck name"
        style={{ width: 180 }}
        defaultValue={deck.name}
        onChange={e => onRename(e.target.value)}
      />
      <select title="Format" value={deck.format} onChange={e => onFormat(e.target.value as Format)}>
        {FORMATS.map(f => <option key={f} value={f}>{capitalize(f)}</option>)}
      </select>
      <button onClick={onNew}>New deck</button>
      <button onClick={onDelete}>Delete</button>
    </header>
  );
}
