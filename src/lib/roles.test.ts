import { describe, expect, it } from 'vitest';
import type { Card } from './scryfall';
import { rolesOf } from './roles';

const c = (oracle_text: string, type_line = 'Instant'): Card => ({
  id: oracle_text, name: 'X', mana_cost: '', cmc: 1, type_line, oracle_text, colors: [], color_identity: [],
  legalities: {}, img: '', img_small: '', img_large: '', img_back: '', usd: null, pt: '',
});

describe('roles', () => {
  it.each([
    ['{T}: Add {C}{C}.', 'Artifact', ['ramp']],
    ['{T}: Add {G}.', 'Creature — Elf Druid', ['ramp']],
    ['Add {B}{B}{B}.', 'Instant', []],
    ['{T}: Add {R}.', 'Basic Land — Mountain', []],
    ['Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.', 'Sorcery', ['ramp']],
    ['Draw two cards.', 'Sorcery', ['draw']],
    ['Look at the top two cards of your library. Put one of them into your hand. Draw a card.', 'Instant', []],
    ['Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.', 'Enchantment', ['draw']],
    ['Lightning Bolt deals 3 damage to any target.', 'Instant', ['removal']],
    ['Exile target creature. Its controller gains life equal to its power.', 'Instant', ['removal']],
    ['Target creature gets -4/-4 until end of turn.', 'Instant', ['removal']],
    ['Until end of turn, target creature has base power and toughness 0/0.', 'Instant', ['removal']],
    ['Exile target card from a graveyard.', 'Instant', []],
    ['Destroy all creatures. They can\'t be regenerated.', 'Sorcery', ['wipe']],
    ['As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.', 'Sorcery', ['wipe']],
    ['Counter target noncreature spell.', 'Instant', ['counter']],
    ['Search your library for a card, put that card into your hand, then shuffle. You lose 2 life.', 'Sorcery', ['tutor']],
    ['{T}, Pay 1 life, Sacrifice Wooded Foothills: Search your library for a Mountain or Forest card, put it onto the battlefield, then shuffle.', 'Land', []],
    ['When this enters, create a Treasure token. (It\'s an artifact with "{T}, Sacrifice this artifact: Add one mana of any color.")', 'Creature — Goblin', ['ramp']],
  ])('%s', (text, type, roles) => {
    expect(rolesOf(c(text, type))).toEqual(roles);
  });
});
