import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// assets/decks/standard.json is the template the deck editor's "Traditional deck" flow copies into a game. Its
// card type properties are a hand-maintained copy of the table generateCardDeckWidgets() builds in
// client/js/editmode.js, so both standard decks sort the same way - and nothing else exercises either of them.
// A single typo (a diamond carrying the spades suitColor, a club whose rankFixed says "H") would ship as a
// subtly wrong SORT in someone's game, so derive every value from the card type name and compare.
const dir = path.dirname(fileURLToPath(import.meta.url));
const deck = JSON.parse(fs.readFileSync(path.join(dir, '../assets/decks/standard.json'), 'utf8')).deck;
const cardTypes = deck.cardTypes;

const suits = {
  spades:   { letter: 'S', color: '♠', alt: '3♠' },
  hearts:   { letter: 'H', color: '♥', alt: '2♥' },
  diamonds: { letter: 'D', color: '♦', alt: '4♦' },
  clubs:    { letter: 'C', color: '♣', alt: '1♣' }
};
const ranks = {
  A:  { rank: '01', rankA: '5A', image: 'A' }, // ace low in rank, ace high in rankA
  2:  { rank: '02', rankA: '02', image: '2' },
  3:  { rank: '03', rankA: '03', image: '3' },
  4:  { rank: '04', rankA: '04', image: '4' },
  5:  { rank: '05', rankA: '05', image: '5' },
  6:  { rank: '06', rankA: '06', image: '6' },
  7:  { rank: '07', rankA: '07', image: '7' },
  8:  { rank: '08', rankA: '08', image: '8' },
  9:  { rank: '09', rankA: '09', image: '9' },
  10: { rank: '10', rankA: '10', image: 'T' },
  J:  { rank: '2J', rankA: '2J', image: 'J' },
  Q:  { rank: '3Q', rankA: '3Q', image: 'Q' },
  K:  { rank: '4K', rankA: '4K', image: 'K' }
};

function expectedCardType(name) {
  const joker = name.match(/^Joker ([12])$/);
  if(joker)
    return { image: `/i/cards-default/${joker[1]}J.svg`, suit: 'T', suitColor: '🃏', suitAlt: '5J', rank: `J${joker[1]}`, rankA: `J${joker[1]}`, rankFixed: `J${joker[1]} T` };
  const [ , rankName, suitName ] = name.match(/^(\S+) of (\S+)$/);
  const suit = suits[suitName];
  const rank = ranks[rankName];
  return {
    image: `/i/cards-default/${rank.image}${suit.letter}.svg`,
    suit: suit.letter,
    suitColor: suit.color,
    suitAlt: suit.alt,
    rank: rank.rank,
    rankA: rank.rankA,
    rankFixed: `${rank.rank} ${suit.letter}`
  };
}

// SORT compares string keys with localeCompare (sortWidgets in client/js/main.js), so the card type names in
// the order a given sort key puts them in.
function sortedBy(property) {
  return Object.keys(cardTypes).sort((a, b)=>cardTypes[a][property].localeCompare(cardTypes[b][property]));
}

// The suits/ranks a sort groups the deck into, in the order they appear: "the four suits in this order" without
// caring how the cards inside a group are arranged.
function groupOrder(names, groupOf) {
  return names.map(groupOf).filter((group, i, all)=>group !== all[i-1]);
}

const suitOf = name=>name.replace(/^.* of /, '').replace(/^Joker.*/, 'jokers');
const rankOf = name=>name.replace(/ of .*$/, '').replace(/^Joker.*/, 'jokers');

describe('the standard deck template', () => {
  test('has all 54 cards with the properties of the add widget overlay deck', () => {
    expect(Object.keys(cardTypes).length).toBe(54);
    for(const [ name, cardType ] of Object.entries(cardTypes))
      expect([ name, cardType ]).toEqual([ name, expectedCardType(name) ]);
  });

  test('sorts by suit into C D H S with the jokers last', () => {
    expect(groupOrder(sortedBy('suit'), suitOf)).toEqual([ 'clubs', 'diamonds', 'hearts', 'spades', 'jokers' ]);
  });

  test('sorts by suitColor keeping the black and the red suits together', () => {
    expect(groupOrder(sortedBy('suitColor'), suitOf)).toEqual([ 'spades', 'clubs', 'hearts', 'diamonds', 'jokers' ]);
  });

  test('sorts by suitAlt alternating black and red', () => {
    expect(groupOrder(sortedBy('suitAlt'), suitOf)).toEqual([ 'clubs', 'hearts', 'spades', 'diamonds', 'jokers' ]);
  });

  test('sorts by rank ace low and by rankA ace high, jokers last', () => {
    const numbers = [ '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K' ];
    expect(groupOrder(sortedBy('rank'), rankOf)).toEqual([ 'A', ...numbers, 'jokers' ]);
    expect(groupOrder(sortedBy('rankA'), rankOf)).toEqual([ ...numbers, 'A', 'jokers' ]);
  });

  test('sorts by rankFixed by rank first, then by suit', () => {
    const byRankFixed = sortedBy('rankFixed');
    expect(groupOrder(byRankFixed, rankOf)).toEqual(groupOrder(sortedBy('rank'), rankOf));
    expect(byRankFixed.slice(0, 4)).toEqual([ 'A of clubs', 'A of diamonds', 'A of hearts', 'A of spades' ]);
  });
});
