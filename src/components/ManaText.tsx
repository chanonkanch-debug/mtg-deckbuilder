import { useEffect, useState } from 'react';
import { fetchSymbology } from '../lib/scryfall';

// Loaded once per page; components re-render when it arrives.
let symbols: Record<string, string> | null = null;
let loading: Promise<void> | null = null;
function useSymbols() {
  const [map, setMap] = useState(symbols);
  useEffect(() => {
    if (symbols) return;
    loading ||= fetchSymbology().then(m => { symbols = m; }, () => { loading = null; });
    let live = true;
    loading.then(() => { if (live) setMap(symbols); });
    return () => { live = false; };
  }, []);
  return map;
}

/** Renders text with {R}, {2}, {T} and similar symbols as Scryfall's symbol images (plain text until they load). */
export default function ManaText({ text, className }: { text: string; className?: string }) {
  const map = useSymbols();
  if (!text) return null;
  const parts = text.split(/(\{[^}]+\})/g);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        const src = map?.[p];
        return src ? <img key={i} className="mana" src={src} alt={p} title={p} /> : p;
      })}
    </span>
  );
}
