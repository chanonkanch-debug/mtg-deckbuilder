import type { Card } from '../lib/scryfall';
import type { Hook } from '../lib/buildAround';

import type { AiProvider } from './providers';

// Build around's AI read: an AI model reads the picked cards and says what they want. It answers with plain
// rules-text phrases, not search syntax, so its searches are always valid.

export interface AiRead { seeds: string; summary: string; hooks: Hook[] }

const SYSTEM = `You are an expert Magic: The Gathering deck builder. The user picks cards to build a deck around.
Read their rules text closely and work out what the deck wants: the cards that enable them, the cards they pay off,
and any unusual or niche synergy a casual player would miss. Ignore anything the cards merely mention in passing.

Answer with JSON:
{"summary": "<one or two plain sentences on what this deck wants to do>",
 "hooks": [{"label": "<2 to 4 words>", "why": "<one short sentence>", "phrases": ["<rules-text phrase>", ...]}]}

Give 3 to 6 hooks, best first. Each phrase is lowercase text, 2 to 6 words, that appears word for word in the rules
text of OTHER cards that fit the hook (for example "damage to each creature" or "whenever a creature you control
dies"). Give 1 to 4 phrases per hook. Never use card names, colors, formats or search syntax.

Example. Card: Anti-Venom, Horrifying Healer {W}{W}{W}{W}{W} Legendary Creature — Symbiote Hero. "When Anti-Venom
enters, if he was cast, return target creature card from your graveyard to the battlefield. If damage would be dealt
to Anti-Venom, prevent that damage and put that many +1/+1 counters on him."
{"summary": "Anti-Venom grows from damage and reanimates when cast, so hurt him on purpose and recast him.",
 "hooks": [
  {"label": "Damage him on purpose", "why": "Sweepers and fights only make him bigger.", "phrases": ["damage to each creature", "fights target creature", "dealt to you is dealt to"]},
  {"label": "Recast him", "why": "The return only triggers when he is cast.", "phrases": ["you control to its owner's hand"]},
  {"label": "Big creatures to return", "why": "Fill the graveyard with something worth reanimating.", "phrases": ["mill", "discard a card"]},
  {"label": "Devotion to white", "why": "His cost is five white symbols.", "phrases": ["devotion to white"]}]}

Example. Card: Multiversal Incursion {5}{U}{U} Sorcery. "For each nontoken creature you control, create a token that's
a copy of that creature, except it isn't legendary."
{"summary": "Copy your whole board, so play creatures with strong enter abilities and legends.",
 "hooks": [
  {"label": "Enter triggers to copy", "why": "Each copy triggers its enter ability again.", "phrases": ["when this creature enters"]},
  {"label": "Legendary creatures", "why": "The copies aren't legendary, so legends copy safely.", "phrases": ["legendary creature"]},
  {"label": "Enter payoffs", "why": "A board of copies entering at once triggers these many times.", "phrases": ["whenever another creature you control enters"]}]}`;

const describe = (c: Card) => `${c.name} ${c.mana_cost} ${c.type_line}. "${c.oracle_text.replace(/\n/g, ' ')}"`;

export function promptFor(seeds: Card[], format: string): string {
  return `Format: ${format}.\n${seeds.length > 1 ? 'Cards' : 'Card'}:\n${seeds.map(describe).join('\n')}`;
}

const clean = (p: string) => p.toLowerCase().replace(/["\\]/g, '').replace(/\s+/g, ' ').trim();

/** Turns the model's answer into hooks; a hook's search matches any of its phrases in rules text. */
export function parseRead(text: string, seeds: Card[]): AiRead {
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const names = seeds.map(s => s.name.toLowerCase());
  const hooks: Hook[] = [];
  for (const h of Array.isArray(json.hooks) ? json.hooks : []) {
    const phrases = [...new Set<string>((Array.isArray(h.phrases) ? h.phrases : []).map((p: unknown) => clean(String(p))))]
      .filter(p => p.length >= 3 && p.length <= 60 && !names.some(n => p.includes(n)))
      .slice(0, 4);
    const label = String(h.label || '').trim().slice(0, 40);
    if (!label || !phrases.length) continue;
    const query = phrases.length > 1 ? `(${phrases.map(p => `o:"${p}"`).join(' or ')})` : `o:"${phrases[0]}"`;
    hooks.push({ id: `ai:${label.toLowerCase()}`, label, kind: 'ai', query, seeds: [], why: String(h.why || '').trim() });
  }
  if (!hooks.length) throw new Error('The AI answer had no usable searches.');
  return { seeds: seedKey(seeds), summary: String(json.summary || '').trim(), hooks: hooks.slice(0, 6) };
}

export const seedKey = (seeds: Card[]) => seeds.map(s => s.name).sort().join('|');

// The answer's shape, for providers that can enforce it.
export const READ_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    hooks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, why: { type: 'string' }, phrases: { type: 'array', items: { type: 'string' } } },
        required: ['label', 'why', 'phrases'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'hooks'],
  additionalProperties: false,
};

/** Asks the chosen AI to read the cards. */
// Reads already made this visit, so removing and re-adding a card doesn't ask again.
const reads = new Map<string, AiRead>();

export async function readCards(seeds: Card[], format: string, provider: AiProvider, apiKey: string, fresh = false): Promise<AiRead> {
  const key = `${provider.id}|${format}|${seedKey(seeds)}`;
  const hit = reads.get(key);
  if (hit && !fresh) return hit;
  const text = await provider.complete({ system: SYSTEM, prompt: promptFor(seeds, format), schema: READ_SCHEMA }, apiKey);
  const read = parseRead(text, seeds);
  reads.set(key, read);
  return read;
}
