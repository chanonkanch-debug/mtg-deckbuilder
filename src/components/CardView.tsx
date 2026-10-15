import { useEffect } from 'react';
import type { Card } from '../lib/scryfall';

export interface PreviewState { src: string; x: number; y: number }

const PREVIEW_W = 300, PREVIEW_H = 420;

/** Large image that follows the cursor while hovering a card. */
export function CardPreview({ preview }: { preview: PreviewState | null }) {
  if (!preview) return null;
  const { x, y, src } = preview;
  const left = Math.max(8, x + PREVIEW_W + 24 > innerWidth ? x - PREVIEW_W - 16 : x + 16);
  const top = Math.max(8, Math.min(y - PREVIEW_H / 2, innerHeight - PREVIEW_H - 8));
  return <img id="preview" src={src} alt="" style={{ display: 'block', left, top }} />;
}

/** Full card view opened by right-click (or long-press on touch). */
export function CardModal({ card, format, onClose }: { card: Card; format: string; onClose: () => void }) {
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
          <div className="muted">{card.mana_cost}</div>
          <div>{card.type_line}</div>
          <div className="oracle">{card.oracle_text}</div>
          {card.pt && <div><b>{card.pt}</b></div>}
          <p className="small muted">
            {card.set_name || (card.set || '').toUpperCase()}
            {card.rarity && ` · ${card.rarity}`}
            {card.usd && ` · $${card.usd}`}
          </p>
          <p className="small">Legal in {format}: <b>{legality}</b></p>
          {card.uri && <a href={card.uri} target="_blank" rel="noopener">Open on Scryfall</a>}
        </div>
      </div>
    </div>
  );
}
