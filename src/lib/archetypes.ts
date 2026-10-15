import type { FilterGroup } from './filters';

// Archetype quick filters. Each one is a plain Scryfall query, mostly matching rules text (o:) and
// keywords (kw:), so it works for new sets without a curated card list. Options in one group are
// OR'd together; the strategy/theme group and the tribe group are AND'd (e.g. Aggro + Goblins).
// Archetype list based on common constructed archetypes and EDHREC's most-played Commander themes.
export const ARCHETYPES: FilterGroup[] = [
  {
    key: 'strategy',
    label: 'Strategy',
    options: [
      ['Aggro', 't:creature mv<=2 pow>=2', 'Cheap creatures that hit hard early'],
      ['Burn', '(t:instant or t:sorcery) o:/deals? \\d+ damage to (any target|each opponent|target player)/', 'Direct damage spells that can go face'],
      ['Removal', '(t:instant or t:sorcery) (o:"destroy target" or o:"exile target" or o:/deals? \\d+ damage to target creature/)', 'Spot removal for control and midrange'],
      ['Counterspells', 'o:"counter target"', 'Spells that counter other spells or abilities'],
      ['Board wipes', 'o:/(destroy|exile) all (other )?(creatures|nonland permanents)/ or o:/all creatures get -\\d+\\/-\\d+/', 'Mass removal for control decks'],
      ['Card draw', 'o:/draws? (two|three|four|x) cards/ or o:"draw a card for each"', 'Card advantage engines'],
      ['Ramp', '-t:land (o:/search your library for (a|up to \\w+) basic land/ or (t:artifact o:"{T}: Add") or (t:creature o:"{T}: Add"))', 'Mana rocks, mana dorks and land search'],
      ['Mill', 'kw:mill or o:/mills? (\\w+) cards/', 'Win by emptying the opponent\'s library'],
      ['Storm / spells', 'kw:storm or kw:prowess or o:/whenever you cast (an|your first) instant or sorcery/ or o:/copy target (instant|sorcery)/', 'Spellslinger payoffs'],
    ],
  },
  {
    key: 'theme',
    label: 'Theme',
    options: [
      ['Tokens / go wide', 'o:/create (a|an|two|three|x|\\w+) .*tokens?/ or o:/creatures you control get \\+\\d+\\/\\+\\d+/', 'Token makers and anthems'],
      ['Aristocrats', 'o:"sacrifice a creature" or o:"sacrifice another creature" or o:/whenever (a|another) creature( you control)? dies/', 'Sacrifice outlets and death triggers'],
      ['Reanimator', 'o:/return target creature card from (your|a) graveyard to the battlefield/ or o:/put target creature card from (a|your) graveyard onto the battlefield/', 'Bring big creatures back from the graveyard'],
      ['Graveyard', 'kw:flashback or kw:escape or kw:delve or kw:unearth or kw:disturb or o:/mill (two|three|four) cards/', 'Self-mill and cards played from the graveyard'],
      ['+1/+1 counters', 'o:"+1/+1 counter"', 'Counters, proliferate and their payoffs'],
      ['Lifegain', 'kw:lifelink or o:/whenever you gain life/ or o:/you gain \\d+ life/', 'Life gain and its payoffs'],
      ['Landfall', 'kw:landfall or o:/whenever a land( you control)? enters/', 'Payoffs for playing lands'],
      ['Blink', 'o:exile o:/return (it|that card|those cards|them) to the battlefield/', 'Flicker creatures to reuse enter effects'],
      ['Artifacts', 'o:/whenever (an|another) artifact/ or o:/for each artifact you control/ or kw:affinity or kw:improvise', 'Artifact synergies'],
      ['Enchantress', 'kw:constellation or o:/whenever you cast an enchantment spell/ or o:/for each enchantment you control/', 'Enchantment synergies'],
      ['Voltron', 't:equipment or (t:aura o:"enchanted creature gets")', 'Suit up one big threat'],
      ['Spells matter', 'o:/whenever you cast a noncreature spell/ or kw:magecraft', 'Payoffs for casting non-creature spells'],
    ],
  },
  {
    key: 'tribe',
    label: 'Tribal',
    options: ['Goblin', 'Elf', 'Zombie', 'Vampire', 'Dragon', 'Merfolk', 'Human', 'Angel', 'Wizard', 'Sliver', 'Dinosaur', 'Spirit']
      .map(t => [t, `(t:${t.toLowerCase()} or o:${t.toLowerCase()})`, `${t} creatures and cards that care about them`] as [string, string, string]),
  },
];
