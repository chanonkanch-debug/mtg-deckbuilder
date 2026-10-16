import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card } from './lib/scryfall';
import { clearCache } from './lib/scryfall';
import type { Board, Deck } from './lib/rules';
import { loadStore, newDeck, saveStore, STORE_KEY, usePrefs, type Store } from './lib/storage';
import DeckBar from './components/DeckBar';
import SearchPanel, { type SearchRequest } from './components/SearchPanel';
import DeckPanel from './components/DeckPanel';
import { CardModal, CardPreview, hidePreview as hidePreviewNow, showPreview as showPreviewAt } from './components/CardView';
import type { Trial } from './lib/swap';

export default function App() {
  const [store, setStore] = useState<Store>(loadStore);
  const [prefs, setPrefs] = usePrefs();
  const [modalCard, setModalCard] = useState<Card | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [trial, setTrial] = useState<Trial | null>(null);
  const [searchRequest, setSearchRequest] = useState<SearchRequest & { n: number }>();
  const toastTimer = useRef<number>(undefined);

  const deck = store.decks[store.current];

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 3000);
  }, []);

  const fromOtherTab = useRef(false);
  useEffect(() => {
    if (fromOtherTab.current) { fromOtherTab.current = false; return; }
    if (!saveStore(store)) toast("Couldn't save: the browser's storage is full.");
  }, [store, toast]);
  // Another tab saved its decks: load them, keeping this tab's open deck, so this tab doesn't overwrite them.
  // The loaded copy isn't saved back, or two tabs would keep re-saving each other's open deck.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORE_KEY || !e.newValue) return;
      fromOtherTab.current = true;
      setStore(s => { const n = loadStore(); return n.decks[s.current] ? { ...n, current: s.current } : n; });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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

  // Swap a deck card for another printing of it (a different art), keeping its counts.
  const swapArt = useCallback((oldId: string, art: Card) => {
    updateDeck(d => {
      const old = d.cards[oldId];
      if (!old) return d;
      const { [oldId]: _old, ...cards } = d.cards;
      const existing = cards[art.id];
      cards[art.id] = existing
        ? { card: art, main: existing.main + old.main, side: existing.side + old.side, cmdr: existing.cmdr + old.cmdr }
        : { ...old, card: art };
      return { ...d, cards };
    });
  }, [updateDeck]);

  const showPreview = useCallback((e: React.MouseEvent, src: string | null) => showPreviewAt(src, e.clientX, e.clientY), []);
  const hidePreview = useCallback(() => hidePreviewNow(), []);
  const openCard = useCallback((card: Card) => { hidePreviewNow(); setModalCard(card); }, []);
  const tryAdd = useCallback((card: Card) => setTrial(t => ({ ...t, add: card })), []);
  const tryCut = useCallback((card: Card) => setTrial(t => ({ ...t, cut: card })), []);
  // A swap being tried belongs to the deck it was started on.
  useEffect(() => setTrial(null), [store.current]);

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
          onTry={tryAdd}
          request={searchRequest}
        />
        <DeckPanel
          deck={deck}
          prefs={prefs}
          setPrefs={setPrefs}
          onAdd={addCard}
          onMove={moveCard}
          onReplaceCards={cards => updateDeck(d => ({ ...d, cards }))}
          onPreview={showPreview}
          onHidePreview={hidePreview}
          onOpen={openCard}
          toast={toast}
          trial={trial}
          setTrial={setTrial}
          onSearch={req => setSearchRequest(r => ({ ...req, n: (r?.n ?? 0) + 1 }))}
        />
      </main>
      <footer className="small muted">
        Card data and images from <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>. Not affiliated with Wizards of the
        Coast. Decks are saved in this browser. Search results are cached for 24 hours.{' '}
        <button type="button" className="small" onClick={() => { clearCache(); toast('Cache cleared.'); }}>Clear cache</button>
      </footer>
      <CardPreview />
      {modalCard && (
        <CardModal
          card={modalCard} format={deck.format} onClose={() => setModalCard(null)}
          onTry={deck.cards[modalCard.id]?.main ? undefined : tryAdd}
          onTryCut={deck.cards[modalCard.id]?.main ? tryCut : undefined}
          onUseArt={deck.cards[modalCard.id] ? art => { swapArt(modalCard.id, art); toast(`Now using the ${art.set_name || 'selected'} art.`); } : undefined}
        />
      )}
      <div id="toast" style={{ display: toastMsg ? 'block' : 'none' }}>{toastMsg}</div>
    </>
  );
}
