// A short guide to Scryfall's search syntax. Clicking an example runs it.
// Full reference: https://scryfall.com/docs/syntax

const ROWS: [syntax: string, meaning: string, example: string][] = [
  ['words', 'Card name contains the words', 'lightning'],
  ['"quotes"', 'Exact phrase in the name', '"lightning bolt"'],
  ['t:', 'Type line (type, subtype, supertype)', 't:legendary t:dragon'],
  ['o:', 'Rules text contains', 'o:"draw a card"'],
  ['o:/regex/', 'Rules text matches a pattern', 'o:/deals \\d+ damage/'],
  ['kw:', 'Has a keyword ability', 'kw:flying kw:haste'],
  ['otag:', 'Card function from Scryfall Tagger', 'otag:removal'],
  ['c: / id:', 'Colors / color identity (w u b r g c m)', 'c:rg id<=rg'],
  ['mv / m:', 'Mana value / exact mana cost', 'mv<=2 m:{R}{R}'],
  ['pow / tou', 'Power and toughness', 't:creature pow>=4 tou<=3'],
  ['r:', 'Rarity', 'r:mythic'],
  ['e: / year', 'Set code / release year', 'e:dsk year>=2024'],
  ['f: / banned:', 'Legal or banned in a format', 'f:pioneer -banned:pioneer'],
  ['is:', 'Special properties', 'is:commander c:b'],
  ['usd', 'Price in US dollars', 't:land usd<1'],
  ['-', 'Exclude a term', 't:creature -t:human'],
  ['or ( )', 'Either term; group with parentheses', '(t:elf or t:goblin) mv=1'],
];

export default function SyntaxGuide({ onTry }: { onTry: (query: string) => void }) {
  return (
    <details className="filters">
      <summary>Search syntax guide</summary>
      <p className="small muted" style={{ margin: '0 0 8px' }}>
        Combine any of these in the search box. Terms are joined with AND unless you write <code>or</code>. Click an example to try it.
      </p>
      <table className="syntax">
        <tbody>
          {ROWS.map(([syntax, meaning, example]) => (
            <tr key={syntax}>
              <td><code>{syntax}</code></td>
              <td>{meaning}</td>
              <td><button type="button" className="example" onClick={() => onTry(example)}>{example}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small" style={{ margin: '8px 0 0' }}>
        <a href="https://scryfall.com/docs/syntax" target="_blank" rel="noopener">Full Scryfall syntax reference</a>
      </p>
    </details>
  );
}
