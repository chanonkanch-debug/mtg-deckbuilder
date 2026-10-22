/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Free Gemini key from Google AI Studio, set in .env.local. */
  readonly VITE_GEMINI_API_KEY?: string;
}
