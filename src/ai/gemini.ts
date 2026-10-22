import type { AiProvider } from './providers';

// Google Gemini on the free tier, called straight from the browser with the user's own key. The SDK is loaded
// only when a read starts, so it doesn't add to the page's first load.
const MODEL = 'gemini-3.8-flash';

export const gemini: AiProvider = {
  id: 'gemini',
  label: 'Gemini (Google)',
  keyUrl: 'https://aistudio.google.com/apikey',
  keyHint: 'AIza…',
  cost: 'The free tier costs nothing; Google may use free-tier requests to improve its models.',
  async complete({ system, prompt, schema }, apiKey) {
    const { GoogleGenAI, ApiError, ThinkingLevel, FinishReason } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    try {
      const res = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        },
      });
      const reason = res.candidates?.[0]?.finishReason;
      if (res.promptFeedback?.blockReason || reason === FinishReason.SAFETY) throw new Error('Gemini declined to read these cards.');
      if (reason === FinishReason.MAX_TOKENS) throw new Error('the answer was cut off. Try again.');
      return res.text ?? '';
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400 && /api key/i.test(err.message)) throw new Error('the API key was rejected. Check it and save it again.');
        if (err.status === 401 || err.status === 403) throw new Error('the API key was rejected. Check it and save it again.');
        if (err.status === 429) throw new Error("you've hit the free tier's limit. Wait a minute and try again.");
        throw new Error(`Google returned an error (${err.status}).`);
      }
      if (err instanceof TypeError) throw new Error("couldn't reach Google. Check your connection.");
      throw err;
    }
  },
};
