import { useState } from 'react';
import type { Card } from '../lib/scryfall';
import { primaryType, type Deck } from '../lib/rules';
import { hypergeometric, libraryOf, shuffle } from '../lib/analysis';

interface Props {
  deck: Deck;
  onPreview: (e: React.MouseEvent, src: string | null) => void;
  onHidePreview: () => void;
  onOpen: (card: Card) => void;
}

const HAND = 7;

/** Draws sample opening hands from the main deck, with the odds of opening on 2-4 lands. */
export default function SampleHand({ deck, onPreview, onHidePreview, onOpen }: Props) {
  const [library, setLibrary] = useState<Card[]>([]);
  const [drawn, setDrawn] = useState(0);
  const [mulligans, setMulligans] = useState(0);

  const all = libraryOf(deck);
  const lands = all.filter(c => primaryType(c) === 'Land').length;
  const odds = (lo: number, hi: number) => {
    let p = 0;
    for (let k = lo; k <= hi; k++) p += hypergeometric(all.length, lands, HAND, k);
    return Math.round(p * 100);
  };

  const newHand = (mull: number) => { setLibrary(shuffle(all)); setDrawn(HAND); setMulligans(mull); };
  const hand = library.slice(0, drawn);

  if (all.length < HAND) {
    return (
      <div className="sample">
        <p className="small muted">Add at least {HAND} cards to the main deck to draw a sample hand.</p>
      </div>
    );
  }

  return (
    <div className="sample">
      <p className="small muted" style={{ marginTop: 0 }}>
        Opening 7 with {lands} land{lands === 1 ? '' : 's'} in {all.length} cards: 2–4 lands {odds(2, 4)}% · 0–1 lands {odds(0, 1)}% · 5+ lands {odds(5, HAND)}%
      </p>
      <div className="row small">
        <button type="button" className="primary" onClick={() => newHand(0)}>{hand.length ? 'New hand' : 'Draw 7'}</button>
        <button type="button" disabled={!hand.length} onClick={() => newHand(mulligans + 1)}>Mulligan</button>
        <button type="button" disabled={!hand.length || drawn >= library.length} onClick={() => setDrawn(d => d + 1)}>Draw a card</button>
        {hand.length > 0 && (
          <span className="muted">
            {hand.filter(c => primaryType(c) === 'Land').length} lands in {hand.length} cards
            {mulligans > 0 && ` · mulligan ${mulligans}: put ${mulligans} on the bottom`}
          </span>
        )}
      </div>
      {hand.length > 0 && (
        <div className="hand" onMouseLeave={onHidePreview}>
          {hand.map((c, i) => (
            <div key={i} className="hand-card" onContextMenu={e => { e.preventDefault(); onOpen(c); }}>
              {c.img
                ? <img src={c.img} alt={c.name} onMouseMove={e => onPreview(e, c.img_large || c.img)} />
                : <div className="noimg"><b>{c.name}</b></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
