import { rand } from './domhelpers.js';

const adjectives = [
  "Wobbly", "Tiny", "Sparkly", "Squishy", "Chunky", "Bendy",
  "Shiny", "Silly", "Goofy", "Clumsy", "Zany", "Quirky",
  "Wonky", "Bouncy", "Puffy", "Jiggly", "Fluffy", "Funky",
  "Cheery", "Dizzy", "Wiggly", "Noodly", "Plump", "Snappy",
  "Dorky", "Peppy", "Perky", "Loopy", "Zippy", "Bubbly"
];

const nouns = [
  "Board", "Box", "Bag", "Card", "Coin", "Cube",
  "Die", "Disk", "Hex", "Map", "Mat", "Pawn",
  "Piece", "Tile", "Token"
];

export function generateName() {
  const adj = adjectives[Math.floor(rand() * adjectives.length)];
  const noun = nouns[Math.floor(rand() * nouns.length)];
  // Zero-width space at the beginning
  return `\u200b${adj} ${noun}`;
}