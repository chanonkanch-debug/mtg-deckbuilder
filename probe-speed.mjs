const urls = ['/decklist/modern-league-2026-10-2011161', '/decklist/modern-challenge-32-2026-10-1812856599', '/decklist/pauper-league-2026-10-1911153'];
for (const u of urls) for (let i = 0; i < 2; i++) {
  const t = Date.now();
  const r = await fetch('https://www.mtgo.com' + u, { headers: { 'User-Agent': 'mtg-deckbuilder decklist collector', Cookie: 'locale=en_US' }, redirect: 'manual', signal: AbortSignal.timeout(60000) });
  const s = await r.text();
  const i1 = s.indexOf('window.MTGO.decklists.data');
  console.log(u, r.status, r.headers.get('location'), s.length, Date.now() - t, 'ms', 'idx', i1, JSON.stringify(s.slice(i1, i1 + 150)));
  if (i1 > 0) { const rest = s.slice(i1); const j = rest.indexOf('window.MTGO.decklists.roundNames'); console.log('  between:', JSON.stringify(rest.slice(Math.max(0, j - 80), j))); }
  else console.log('  title:', s.match(/<title>[^<]*/)?.[0], JSON.stringify(s.slice(0, 300)));
}
