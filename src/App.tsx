import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card } from './lib/scryfall';
import { clearCache } from './lib/scryfall';
import type { Board, Deck } from './lib/rules';
import { loadStore, newDeck, saveStore, usePrefs, type Store } from './lib/storage';
import DeckBar from './components/DeckBar';
import SearchPanel from './components/SearchPanel';
import DeckPanel from './components/DeckPanel';
import { CardModal, CardPreview, type PreviewState } from './components/CardView';

export default function App() {
  const [store, setStore] = useState<Store>(loadStore);
  const [prefs, setPrefs] = usePrefs();
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [modalCard, setModalCard] = useState<Card | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<number>(undefined);

  useEffect(() => saveStore(store), [store]);
  const deck = store.decks[store.current];

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 3000);
  }, []);

  const updateDeck = useCallback((fn: (d: Deck) => Deck) => {
    setStore(s => ({ ...s, decks: { ...s.decks, [s.current]: fn(s.decks[s.current]) } }));
  }, []);

  const addCard = useCallback((card: Card, board: Board, n = 1) => {
    updateDeck(d => {
      const cards = { ...d.cards };
      const e = { ...(cards[card.id] || { card, main: 0, side: 0, cmdr: 0 }) };
      e[board] = Math.max(0, e[board] + n);
      if (!e.main && !e.side && !e.cmdr) delete cards[card.id];
      else cards[card.id] = e;
      return { ...d, cards };
    });
  }, [updateDeck]);

  const moveCard = useCallback((card: Card, from: Board, to: Board) => {
    updateDeck(d => {
      const e = d.cards[card.id];
      if (!e || !e[from]) return d;
      return { ...d, cards: { ...d.cards, [card.id]: { ...e, [from]: e[from] - 1, [to]: e[to] + 1 } } };
    });
  }, [updateDeck]);

  const showPreview = useCallback((e: React.MouseEvent, src: string | null) => {
    setPreview(src ? { src, x: e.clientX, y: e.clientY } : null);
  }, []);
  const hidePreview = useCallback(() => setPreview(null), []);
  const openCard = useCallback((card: Card) => { setPreview(null); setModalCard(card); }, []);

  return (
    <>
      <DeckBar
        store={store}
        onSelect={id => setStore(s => ({ ...s, current: id }))}
        onRename={name => updateDeck(d => ({ ...d, name: name || 'Untitled deck' }))}
        onFormat={format => updateDeck(d => ({ ...d, format }))}
        onNew={() => setStore(s => { const d = newDeck('Untitled deck', s.decks[s.current].format); return { current: d.id, decks: { ...s.decks, [d.id]: d } }; })}
        onDelete={() => {
          setStore(s => {
            const ids = Object.keys(s.decks);
            if (ids.length === 1) return { ...s, decks: { [s.current]: { ...s.decks[s.current], cards: {} } } };
            const { [s.current]: _removed, ...rest } = s.decks;
            return { current: Object.keys(rest)[0], decks: rest };
          });
          toast('Deck deleted.');
        }}
      />
      <main>
        <SearchPanel
          deck={deck}
          prefs={prefs}
          setPrefs={setPrefs}
          onAdd={(card, board) => {
            addCard(card, board);
            toast(`Added ${card.name}${board === 'side' ? ' to sideboard' : board === 'cmdr' ? ' as commander' : ''}.`);
          }}
          onPreview={showPreview}
          onHidePreview={hidePreview}
          onOpen={openCard}
        />
        <DeckPanel
          deck={deck}
          onAdd={addCard}
          onMove={moveCard}
          onReplaceCards={cards => updateDeck(d => ({ ...d, cards }))}
          onPreview={showPreview}
          onHidePreview={hidePreview}
          onOpen={openCard}
          toast={toast}
        />
      </main>
      <footer className="small muted">
        Card data and images from <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>. Not affiliated with Wizards of the
        Coast. Decks are saved in this browser. Search results are cached for 24 hours.{' '}
        <button type="button" className="small" onClick={() => { clearCache(); toast('Cache cleared.'); }}>Clear cache</button>
      </footer>
      <CardPreview preview={preview} />
      {modalCard && <CardModal card={modalCard} format={deck.format} onClose={() => setModalCard(null)} />}
      <div id="toast" style={{ display: toastMsg ? 'block' : 'none' }}>{toastMsg}</div>
    </>
  );
}
