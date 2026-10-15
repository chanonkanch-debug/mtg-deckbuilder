import { useEffect, useState } from 'react';
import type { Deck, Format } from './rules';

// Storage keys match the original single-file app, so existing decks and settings carry over.
const STORE_KEY = 'mtg-deck-builder:v1';
const PREFS_KEY = 'mtg-deck-builder:prefs';

export interface Store { current: string; decks: Record<string, Deck> }

export function newDeck(name = 'Untitled deck', format: Format = 'standard'): Deck {
  return { id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, format, cards: {} };
}

export function loadStore(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (s?.decks && s.decks[s.current]) return s;
  } catch {}
  const d = newDeck();
  return { current: d.id, decks: { [d.id]: d } };
}

export function saveStore(store: Store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {}
}

export type DeckView = 'list' | 'visual';
export type GroupBy = 'type' | 'mv' | 'color';
export interface Prefs { dir: 'asc' | 'desc'; zoom: number; hoverZoom: boolean; order: string; deckView: DeckView; groupBy: GroupBy; details: boolean; detailsTab: string }
const DEFAULT_PREFS: Prefs = { dir: 'asc', zoom: 2, hoverZoom: true, order: 'name', deckView: 'list', groupBy: 'type', details: false, detailsTab: 'curve' };

/** Display preferences (sort, zoom, hover) remembered between visits. */
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return DEFAULT_PREFS; }
  });
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} }, [prefs]);
  return [prefs, (patch: Partial<Prefs>) => setPrefs(p => ({ ...p, ...patch }))] as const;
}
