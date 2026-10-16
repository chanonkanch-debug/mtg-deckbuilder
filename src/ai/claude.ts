import type { AiProvider } from './providers';

// Claude through the Anthropic SDK, called straight from the browser with the user's own key. The SDK is loaded
// only when a read starts, so it doesn't add to the page's first load.
const MODEL = 'claude-opus-5-5';

export const claude: AiProvider = {
  id: 'claude',
  label: 'Claude (Anthropic)',
  keyUrl: 'https://console.anthropic.com/settings/keys',
  keyHint: 'sk-ant-…',
  async complete({ system, prompt, schema }, apiKey) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    try {
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        // If Claude declines for policy reasons, the API retries on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
        system,
        messages: [{ role: 'user', content: prompt }],
      });
      if (res.stop_reason === 'refusal') throw new Error('Claude declined to read these cards.');
      if (res.stop_reason === 'max_tokens') throw new Error('the answer was cut off. Try again.');
      return res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error('the API key was rejected. Check it and save it again.');
      if (err instanceof Anthropic.PermissionDeniedError) throw new Error("this API key can't use Claude. Check your Anthropic account.");
      if (err instanceof Anthropic.RateLimitError) throw new Error('too many requests or no credit left on the Anthropic account. Try again shortly.');
      if (err instanceof Anthropic.APIConnectionError) throw new Error("couldn't reach Anthropic. Check your connection.");
      if (err instanceof Anthropic.APIError) throw new Error(`Anthropic returned an error (${err.status}).`);
      throw err;
    }
  },
};
