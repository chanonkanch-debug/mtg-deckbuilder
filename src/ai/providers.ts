// The AI services Build around can use. Each one turns a system prompt, a user prompt and a JSON schema into
// JSON text; everything else (the prompt, parsing, searches) is shared. To add GPT or Gemini, write a file like
// gemini.ts with the same shape and add it to PROVIDERS.
import { gemini } from './gemini';

export interface AiRequest { system: string; prompt: string; schema: Record<string, unknown> }

export interface AiProvider {
  id: string;
  label: string;
  /** Where to create an API key. */
  keyUrl: string;
  /** What a key looks like, for the input placeholder. */
  keyHint: string;
  /** One sentence on what a read costs. */
  cost: string;
  /** A key set in .env.local (for example VITE_GEMINI_API_KEY), which is used instead of one pasted in the page. */
  envKey?: string;
  /** Returns the model's JSON answer as text; throws an Error with a plain message on failure. */
  complete(req: AiRequest, apiKey: string): Promise<string>;
}

export const PROVIDERS: AiProvider[] = [gemini];

// The chosen provider and its key stay in this browser only, apart from the saved decks.
const KEY = 'mtg-ai';
interface Settings { provider: string; keys: Record<string, string> }

export function loadAiSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s.provider === 'string' && s.keys) return s;
  } catch {}
  return { provider: PROVIDERS[0].id, keys: {} };
}

export function saveAiSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export const providerById = (id: string) => PROVIDERS.find(p => p.id === id) ?? PROVIDERS[0];

/** The key to use: the project's .env.local key if there is one, otherwise the one pasted in this browser. */
export const keyFor = (p: AiProvider, s: Settings) => p.envKey || s.keys[p.id] || '';
