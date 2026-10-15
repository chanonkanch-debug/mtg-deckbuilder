import { useEffect, useState } from 'react';
import type { Deck, Format } from './rules';
import { clearCache } from './scryfall';

// Storage keys match the original single-file app, so existing decks and settings carry over.
export const STORE_KEY = 'mtg-deck-builder:v1';
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

/** Saves the decks. If storage is full, the search cache is cleared to make room. Returns false if saving still failed. */
export function saveStore(store: Store): boolean {
  const json = JSON.stringify(store);
  try { localStorage.setItem(STORE_KEY, json); return true; } catch {}
  clearCache();
  try { localStorage.setItem(STORE_KEY, json); return true; } catch { return false; }
}

/** Card widths in px for each zoom step; the search grid and the deck area each have their own zoom step. 140 is 100%. */
export const ZOOM_LEVELS = [90, 110, 140, 170, 200, 240, 300];
/** Deck area zoom steps, as a scale of the normal size. Even steps both ways from 100%. */
export const DECK_SCALES = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2];
/** The saved deck scale, snapped to the nearest step. */
export function deckScaleIndex(scale: number): number {
  return DECK_SCALES.reduce((best, s, i) => (Math.abs(s - scale) < Math.abs(DECK_SCALES[best] - scale) ? i : best), 0);
}
/** CSS variables that size the deck area: card width in Visual view, text size in List view. */
export function deckZoomStyle(scale: number): Record<string, string> {
  return { '--deck-card-w': `${Math.round(132 * scale)}px`, '--deck-font': `${Math.round(14 * scale)}px` };
}

export type DeckView = 'list' | 'visual';
export type GroupBy = 'type' | 'mv' | 'color';
export interface Prefs { dir: 'asc' | 'desc'; zoom: number; deckScale: number; hoverZoom: boolean; order: string; colorCurve: boolean; deckView: DeckView; groupBy: GroupBy; detailsTab: string }
const DEFAULT_PREFS: Prefs = { dir: 'asc', zoom: 2, deckScale: 1, hoverZoom: true, order: 'name', colorCurve: true, deckView: 'list', groupBy: 'type', detailsTab: 'curve' };

/** Display preferences (sort, zoom, hover) remembered between visits. */
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return DEFAULT_PREFS; }
  });
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} }, [prefs]);
  return [prefs, (patch: Partial<Prefs>) => setPrefs(p => ({ ...p, ...patch }))] as const;
}
