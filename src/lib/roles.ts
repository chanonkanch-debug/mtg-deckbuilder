// Role counts: tags each card by what it does (ramp, draw, removal...) from its rules text, so you can see
// whether the deck has enough of each. Text patterns, not a curated list, so they work for new sets but
// can miss unusual wordings.
import type { Card } from './scryfall';
import type { Deck, Format } from './rules';
import { entriesOf, primaryType } from './rules';

export type Role = 'ramp' | 'draw' | 'removal' | 'wipe' | 'counter' | 'tutor';

export interface RoleDef {
  key: Role;
  label: string;
  hint: string;
  /** Label of the Archetypes quick filter that finds more cards of this role. */
  archetype?: string;
  test: (text: string, card: Card) => boolean;
}

const NUM = '(?:a|an|one|two|three|four|five|six|seven|x|that many|\\d+)';
const isLand = (c: Card) => primaryType(c) === 'Land';
const isSpell = (c: Card) => /\b(Instant|Sorcery)\b/.test(c.type_line);

export const ROLES: RoleDef[] = [
  {
    key: 'ramp', label: 'Ramp', archetype: 'Ramp',
    hint: 'Permanents that make mana, and spells that put extra lands onto the battlefield.',
    test: (t, c) => !isLand(c) && (
      (!isSpell(c) && /(^|\n|: |, )add (\{|one mana|two mana|three mana|x mana|an amount of)/.test(t))
      || /search your library for [^.]*lands?\b[^.]*onto the battlefield/.test(t)
      || /put (a|up to \w+) lands? cards? from your hand onto the battlefield/.test(t)
      || /play (an|two) additional lands?/.test(t)
      || /create (a|an|one|two|three|x|\w+) treasure tokens?/.test(t)),
  },
  {
    key: 'draw', label: 'Card draw', archetype: 'Card draw',
    hint: 'Cards that draw two or more, or keep drawing every turn. One-for-one cantrips are not counted.',
    test: t => new RegExp(`draws? (?!a card\\b)${NUM} cards`).test(t)
      || /draw a card for each/.test(t)
      || /(whenever|at the beginning of)[^.]*, (you )?(may )?draw a card/.test(t)
      || /\{t\}[^:]*: draw a card/.test(t),
  },
  {
    key: 'removal', label: 'Removal', archetype: 'Removal',
    hint: 'Answers to a single threat: destroy, exile, damage, -X/-X, bounce, fight or edict effects.',
    test: t => /(destroy|exile) target (?!card)/.test(t)
      || /deals? (\d+|x|damage equal to [^.]*) damage to (any target|target (creature|planeswalker|permanent|attacking|blocking))/.test(t)
      || /deals? damage equal to [^.]* to (any target|target creature)/.test(t)
      || /target creature (an opponent controls )?gets -(\d+|x)\/-(\d+|x)/.test(t)
      || /return target (nonland permanent|creature|permanent)[^.]* to (its|their) owner'?s?'? hand/.test(t)
      || /fights? (target|another target|up to one target)/.test(t)
      || /(target|each) opponent sacrifices an? (creature|nonland permanent|permanent)/.test(t),
  },
  {
    key: 'wipe', label: 'Board wipes', archetype: 'Board wipes',
    hint: 'Answers to many threats at once.',
    test: t => /(destroy|exile) (all|each) (other )?(nonland permanents|permanents|creatures|artifacts|enchantments|planeswalkers|nontoken|creatures? (you don't control|your opponents control)|other creatures)/.test(t)
      || /all (other )?creatures( your opponents control)? get -(\d+|x)\/-(\d+|x)/.test(t)
      || /deals? (\d+|x) damage to each (creature|other creature|creature and each planeswalker)/.test(t)
      || /return all (nonland permanents|creatures|other creatures)[^.]* to (its|their) owners'? hands?/.test(t)
      || /each player sacrifices (all|that many|\w+) (creatures|permanents|nonland permanents)/.test(t),
  },
  {
    key: 'counter', label: 'Counterspells', archetype: 'Counterspells',
    hint: 'Spells and abilities that counter a spell.',
    test: t => /counter target (\w+ )*spell/.test(t),
  },
  {
    key: 'tutor', label: 'Tutors',
    hint: 'Cards that search your library for a nonland card.',
    test: t => /search your library for (?![^.]*\b(land|plains|island|swamp|mountain|forest)\b)[^.]*\bcards?\b/.test(t),
  },
];

/** Roles a card fills, from its rules text (all faces). Reminder text in parentheses is ignored. */
export function rolesOf(card: Card): Role[] {
  const text = card.oracle_text.toLowerCase().replace(/\([^)]*\)/g, '');
  return ROLES.filter(r => r.test(text, card)).map(r => r.key);
}

/**
 * Targets per role. Commander uses the widely used Command Zone deck template; 60-card decks vary too much
 * by archetype for one set of numbers, so they get counts only.
 */
export const TARGETS: Partial<Record<Format, Partial<Record<Role | 'lands', number>>>> = {
  commander: { lands: 37, ramp: 10, draw: 10, removal: 10, wipe: 3 },
};

export interface RoleCount { role: RoleDef; count: number; target?: number; cards: { card: Card; n: number }[] }

export function roleCounts(deck: Deck): { rows: RoleCount[]; lands: number; landTarget?: number } {
  const entries = entriesOf(deck).filter(e => e.main || e.cmdr);
  const targets = TARGETS[deck.format] ?? {};
  const tagged = entries.map(e => ({ card: e.card, n: e.main + e.cmdr, roles: rolesOf(e.card) }));
  const rows = ROLES.map(role => {
    const cards = tagged.filter(t => t.roles.includes(role.key)).map(({ card, n }) => ({ card, n }))
      .sort((a, b) => a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name));
    return { role, count: cards.reduce((s, c) => s + c.n, 0), target: targets[role.key], cards };
  });
  const lands = entries.filter(e => isLand(e.card)).reduce((s, e) => s + e.main, 0);
  return { rows, lands, landTarget: targets.lands };
}
