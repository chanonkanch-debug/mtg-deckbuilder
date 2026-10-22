import type { Hook } from './buildAround';
import type { Format } from './rules';
import { fetchPlayedWith, playedHook } from './edhrec';
import { deckHook, loadDecks, MTGO_FORMATS, playedInDecks } from './decklists';

// Build around's "played with": the cards real decks play alongside a picked card. 60-card formats use recent MTGO
// tournament decks (decklists.ts), Commander uses EDHREC (edhrec.ts).

/** The read of one card: its hook, or a note on why there isn't one. */
export type PlayedState = 'loading' | { hook: Hook | null; note: string } | { error: string };

export const playedSource = (format: Format) => MTGO_FORMATS.includes(format) ? 'MTGO tournament decks' : 'EDHREC';

export async function readPlayedWith(seed: string, format: Format): Promise<{ hook: Hook | null; note: string }> {
  if (MTGO_FORMATS.includes(format)) {
    const data = await loadDecks(format);
    const read = playedInDecks(data, seed);
    const hook = deckHook(read);
    const note = hook ? ''
      : !read.seedDecks ? `${seed} isn't in any of the ${data.decks.length} recent MTGO tournament decks for this format.`
      : `${seed} is in too few recent MTGO tournament decks to say what's played with it.`;
    return { hook, note };
  }
  const hook = playedHook(await fetchPlayedWith(seed));
  return { hook, note: hook ? '' : `EDHREC has too few Commander decks with ${seed} to say what's played with it.` };
}
