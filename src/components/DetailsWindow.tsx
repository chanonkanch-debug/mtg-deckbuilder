import { useEffect, useRef } from 'react';
import type { Card } from '../lib/scryfall';
import type { Deck } from '../lib/rules';
import DeckStats, { DETAIL_TABS, type Tab } from './DeckStats';

interface Props {
  deck: Deck;
  tab: Tab;
  setTab: (t: Tab) => void;
  onClose: () => void;
  onFindMore: (archetype: string) => void;
  onPreview: (e: React.MouseEvent, src: string | null) => void;
  onHidePreview: () => void;
  onOpen: (card: Card) => void;
}

/** In-depth analysis (castability, roles, simulation, sample hands) in a fixed-size window over the page. */
export default function DetailsWindow({ deck, tab, setTab, onClose, onPreview, onHidePreview, onOpen, onFindMore }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.getElementById('modal')) onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="details-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="details-window" role="dialog" aria-modal="true" aria-label="Deck details">
        <div className="details-head">
          <div><b>Deck details</b> <span className="small muted">{deck.name}</span></div>
          <button type="button" ref={closeRef} className="close" title="Close (Esc)" onClick={onClose}>✕</button>
        </div>
        <DeckStats deck={deck} tabs={DETAIL_TABS} tab={tab} setTab={setTab} onPreview={onPreview} onHidePreview={onHidePreview} onOpen={onOpen} onFindMore={onFindMore} />
      </div>
    </div>
  );
}
