import { describe, expect, it } from 'vitest';
import { edhrecSlug, parsePlayed, playedHook } from './edhrec';

describe('edhrecSlug', () => {
  it('matches EDHREC page names', () => {
    expect(edhrecSlug('Slickshot Show-Off')).toBe('slickshot-show-off');
    expect(edhrecSlug("Lim-Dûl's Vault")).toBe('lim-duls-vault');
    expect(edhrecSlug('Anti-Venom, Horrifying Healer')).toBe('anti-venom-horrifying-healer');
    expect(edhrecSlug('Fable of the Mirror-Breaker // Reflection of Kiki-Jiki')).toBe('fable-of-the-mirror-breaker');
  });
});

const page = {
  container: { json_dict: { cardlists: [
    { header: 'Top Commanders', cardviews: [{ name: 'Kuja, Genome Sorcerer', num_decks: 2092, potential_decks: 23142 }] },
    { header: 'High Lift Cards', cardviews: [
      { name: 'Cunning Coyote', num_decks: 357, potential_decks: 13816, lift: 52 },
      { name: 'Rare Thing', num_decks: 4, potential_decks: 100, lift: 40 },
    ] },
    { header: 'Top Cards', cardviews: [
      { name: 'Black Waltz No. 3', num_decks: 2065, potential_decks: 3547, lift: 22 },
      { name: 'Sol Ring', num_decks: 3000, potential_decks: 3500, lift: 1.1 },
      { name: 'Cunning Coyote', num_decks: 357, potential_decks: 13816, lift: 52 },
    ] },
  ] } },
};

describe('parsePlayed', () => {
  it('keeps cards these decks clearly favor, most played first, without commanders, staples or rare picks', () => {
    const read = parsePlayed('Slickshot Show-Off', page);
    expect(read.cards.map(c => c.name)).toEqual(['Black Waltz No. 3', 'Cunning Coyote']);
  });
  it('turns the read into one search for any of the cards', () => {
    const hook = playedHook(parsePlayed('Slickshot Show-Off', page))!;
    expect(hook.kind).toBe('played');
    expect(hook.query).toBe('(!"Black Waltz No. 3" or !"Cunning Coyote")');
    expect(playedHook({ seed: 'X', cards: [] })).toBeNull();
  });
});
