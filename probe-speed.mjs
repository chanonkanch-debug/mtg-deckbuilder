const urls = ['/decklist/standard-league-2026-10-2211129', '/decklist/modern-challenge-32-2026-10-2112856954', '/decklist/pauper-league-2026-10-2211153'];
const uas = { browser: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', bot: 'mtg-deckbuilder decklist collector (github.com/chanonkanch-debug/mtg-deckbuilder)', none: undefined };
for (const [k, ua] of Object.entries(uas)) for (const u of urls) {
  const t = Date.now();
  try { const r = await fetch('https://www.mtgo.com' + u, { headers: ua ? { 'User-Agent': ua } : {}, signal: AbortSignal.timeout(40000) }); const s = await r.text(); console.log(k, u, r.status, s.length, Date.now() - t, 'ms'); }
  catch (e) { console.log(k, u, 'ERR', e.message, Date.now() - t, 'ms'); }
}
