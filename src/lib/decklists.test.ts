import { describe, expect, it } from 'vitest';
import { deckHook, playedInDecks, type DeckData } from './decklists';
// @ts-expect-error plain JS script, no types
import { eventInfo, parseEvent } from '../../scripts/collect-decklists.mjs';

const names = ['Slickshot Show-Off', 'Lightning Bolt', 'Mountain', 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', 'Thoughtseize', 'Ragavan, Nimble Pilferer'];
// Slickshot (0) decks all play Bolt (1); Thoughtseize (4) is in every deck; Ragavan (5) in one Slickshot deck only.
const data: DeckData = { format: 'modern', updated: '', since: '', events: 3, names, decks: [
  [0, 1, 2, 4, 5], [0, 1, 2, 4], [0, 1, 3, 4], [1, 3, 4], [3, 4], [4, 2], [4], [4],
] };

describe('playedInDecks', () => {
  it('counts what decks with the card play, leaving out basics, staples and rare picks', () => {
    const read = playedInDecks(data, 'Slickshot Show-Off');
    expect(read.seedDecks).toBe(3);
    expect(read.cards.map(c => c.name)).toEqual(['Lightning Bolt']);
  });
  it('finds double-faced cards by their front face', () => {
    expect(playedInDecks(data, 'Fable of the Mirror-Breaker').seedDecks).toBe(3);
  });
  it('makes one search for any of the cards, or none', () => {
    expect(deckHook(playedInDecks(data, 'Slickshot Show-Off'))!.query).toBe('!"Lightning Bolt"');
    expect(deckHook(playedInDecks(data, 'Black Lotus'))).toBeNull();
  });
});

describe('collect-decklists', () => {
  it('reads the format and date from event links', () => {
    expect(eventInfo('/decklist/modern-challenge-32-2026-10-2112856954')).toEqual({ format: 'modern', date: '2026-10-21' });
    expect(eventInfo('/decklist/standard-league-2026-10-2211129')).toEqual({ format: 'standard', date: '2026-10-22' });
    expect(eventInfo('/decklist/duel-commander-league-2026-10-0111217')).toBeNull();
  });
  it('keeps each main deck as card names', () => {
    const html = `<script>window.MTGO.decklists.data = {"decklists":[{"main_deck":[{"card_attributes":{"card_name":"Fire/Ice"}},{"card_attributes":{"card_name":"Lightning Bolt"}}],"sideboard_deck":[{"card_attributes":{"card_name":"Thoughtseize"}}]}]};\nwindow.MTGO.decklists.roundNames = {};</script>`;
    expect(parseEvent(html)).toEqual([['Fire // Ice', 'Lightning Bolt']]);
  });
});
