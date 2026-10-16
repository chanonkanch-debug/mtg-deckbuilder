import { useEffect, useState, useSyncExternalStore } from 'react';
import ManaText from './ManaText';
import { fetchArts, type Card } from '../lib/scryfall';

// The hover preview lives in its own small store, so moving the mouse re-renders only the preview, not the app.
interface PreviewState { src: string; x: number; y: number }
let current: PreviewState | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
function setPreview(next: PreviewState | null) {
  if (next === current || (next && current && next.src === current.src && next.x === current.x && next.y === current.y)) return;
  current = next;
  listeners.forEach(fn => fn());
}
export function showPreview(src: string | null, x: number, y: number) { setPreview(src ? { src, x, y } : null); }
export function hidePreview() { setPreview(null); }

const PREVIEW_W = 300, PREVIEW_H = 420;

/** Large image that follows the cursor while hovering a card. The smaller image the page already loaded shows at
 *  once, and the sharp large image replaces it when it arrives, so a new card never waits behind the old one. */
export function CardPreview() {
  const preview = useSyncExternalStore(subscribe, () => current);
  const [loaded, setLoaded] = useState<string | null>(null);
  if (!preview) return null;
  const { x, y, src } = preview;
  const left = Math.max(8, x + PREVIEW_W + 24 > innerWidth ? x - PREVIEW_W - 16 : x + 16);
  const top = Math.max(8, Math.min(y - PREVIEW_H / 2, innerHeight - PREVIEW_H - 8));
  const quick = src.replace('/large/', '/normal/');
  return (
    <div id="preview" style={{ left, top }}>
      {quick !== src && <img src={quick} alt="" />}
      <img key={src} src={src} alt="" onLoad={() => setLoaded(src)} style={{ opacity: loaded === src || quick === src ? 1 : 0 }} />
    </div>
  );
}

/** Full card view opened by right-click (or long-press on touch). */
interface ModalProps {
  card: Card;
  format: string;
  onClose: () => void;
  /** Set when the card is in the current deck: swaps the deck's copy to another printing. */
  onUseArt?: (art: Card) => void;
  /** Starts a swap preview adding this card, or cutting it when it's in the deck. */
  onTry?: (card: Card) => void;
  onTryCut?: (card: Card) => void;
  /** Adds this card to Build around and opens it. */
  onBuildAround?: (card: Card) => void;
}

export function CardModal({ card: original, format, onClose, onUseArt, onTry, onTryCut, onBuildAround }: ModalProps) {
  const [card, setCard] = useState(original); // the printing being shown
  const [arts, setArts] = useState<Card[] | null>(null);
  const [artsState, setArtsState] = useState<'idle' | 'loading' | 'error'>('idle');
  useEffect(() => { setCard(original); setArts(null); setArtsState('idle'); }, [original]);

  const loadArts = () => {
    setArtsState('loading');
    fetchArts(original).then(a => { setArts(a); setArtsState('idle'); }, () => setArtsState('error'));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const imgs = [card.img_large || card.img, card.img_back].filter(Boolean);
  const legality = (card.legalities[format] || 'unknown').replace('_', ' ');
  return (
    <div id="modal" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={card.name}>
        <button type="button" className="close" title="Close (Esc)" onClick={onClose}>✕</button>
        <div className="modal-imgs">{imgs.map(src => <img key={src} src={src} alt={card.name} />)}</div>
        <div className="modal-text">
          <h2>{card.name}</h2>
          <div><ManaText text={card.mana_cost} /></div>
          <div>{card.type_line}</div>
          <div className="oracle"><ManaText text={card.oracle_text} /></div>
          {card.pt && <div><b>{card.pt}</b></div>}
          <p className="small muted">
            {card.set_name || (card.set || '').toUpperCase()}
            {card.rarity && ` · ${card.rarity}`}
            {card.usd && ` · $${card.usd}`}
          </p>
          <p className="small">Legal in {format}: <b>{legality}</b></p>
          {card.uri && <a href={card.uri} target="_blank" rel="noopener">Open on Scryfall</a>}
          {(onTry || onTryCut || onBuildAround) && (
            <p className="row">
              {onTry && <button type="button" onClick={() => { onTry(original); onClose(); }}>Try in my deck</button>}
              {onTryCut && <button type="button" onClick={() => { onTryCut(original); onClose(); }}>Try cutting this</button>}
              {onBuildAround && <button type="button" title="Find cards that work with this one" onClick={() => { onBuildAround(original); onClose(); }}>Build around this</button>}
            </p>
          )}

          <div className="arts">
            {!arts && (
              <button type="button" onClick={loadArts} disabled={artsState === 'loading'}>
                {artsState === 'loading' ? 'Loading arts…' : artsState === 'error' ? "Couldn't load arts, try again" : 'Show alternate arts'}
              </button>
            )}
            {arts && (
              <>
                <div className="small muted">{arts.length} art version{arts.length === 1 ? '' : 's'}. Click one to view it.</div>
                <div className="art-grid">
                  {arts.map(a => (
                    <button type="button" key={a.id} className={a.id === card.id ? 'current' : ''} title={`${a.set_name} (${(a.set || '').toUpperCase()})`} onClick={() => setCard(a)}>
                      {a.img_small ? <img src={a.img_small} alt={a.set_name} loading="lazy" /> : <span>{(a.set || '').toUpperCase()}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
            {onUseArt && card.id !== original.id && (
              <button type="button" className="primary" onClick={() => { onUseArt(card); onClose(); }}>Use this art in my deck</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
