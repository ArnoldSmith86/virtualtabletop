import { rand } from './domhelpers.js';

const adjectives = [
  "Abstract", "Ameritrash", "Asymmetric", "Balanced", "Board", "Broken",
  "Cardboard", "Casual", "Classic", "Clever", "Clunky", "Cooperative",
  "Competitive", "Complex", "Crunchy", "Custom", "Damaged", "Deck-Building",
  "Deduction", "Dexterity", "Digital", "Dry", "Elegant", "Epic", "Euro",
  "Expansion", "Family", "Fast", "Fiddly", "First", "Foil", "Fun", "Game",
  "Gateway", "Geeky", "Heavy", "Hidden", "Holo", "Immersive", "Indie",
  "Legacy", "Legendary", "Light", "Long", "Losing", "Lucky", "Main",
  "Mechanic", "Medium", "Meeple", "Miniature", "Mint", "Modern",
  "Multiplayer", "Mythic", "New", "Old", "Original", "Painted", "Party",
  "Plastic", "Played", "Player", "Print-and-Play", "Prototype", "Quick",
  "Random", "Rare", "Rolled", "Rule-Abiding", "Serious", "Short",
  "Shuffled", "Simple", "Single", "Sleeved", "Social", "Solo", "Standard",
  "Strategic", "Symmetric", "Tabletop", "Tactical", "Thematic", "Tied",
  "Tile-Laying", "Turn-Based", "Unbalanced", "Uncommon", "Unpainted",
  "Unsleeved", "Vintage", "Wargame", "Winning", "Wooden", "Worker-Placement"
];

const nouns = [
  "Ability", "Action", "Area", "Attack", "Auction", "Bag", "Binder",
  "Board", "Box", "Brick", "Card", "Chair", "Chase", "Chit", "Coin",
  "Collection", "Combo", "Component", "Control", "Counter", "Cube",
  "Cylinder", "Damage", "Deck", "Deduction", "Defeat", "Defense",
  "Designer", "Dexterity", "Die", "Dice", "Discard", "Disk", "Draft",
  "Effect", "Engine", "Expansion", "Figurine", "Game", "Gamer", "Gold",
  "Hand", "Health", "Hex", "Insert", "Instruction", "Leader", "Location",
  "Loser", "Mana", "Map", "Marker", "Mat", "Match", "Meeple", "Mini",
  "Miniature", "Money", "Move", "Opponent", "Ore", "Organizer", "Overlay",
  "Pack", "Pawn", "Phase", "Piece", "Placement", "Player", "Point",
  "Prototype", "Publisher", "Pyramid", "Race", "Resource", "Round",
  "Rule", "Rulebook", "Score", "Set", "Setup", "Sheep", "Shelf", "Skill",
  "Sleeve", "Standee", "Stone", "Strategy", "Table", "Tactic", "Teammate",
  "Tile", "Timer", "Token", "Track", "Trigger", "Turn", "Variant",
  "Victory", "Wheat", "Winner", "Wood", "Worker"
];

export function generateName() {
  const adj = adjectives[Math.floor(rand() * adjectives.length)];
  const noun = nouns[Math.floor(rand() * nouns.length)];
  // Zero-width space at the beginning
  return `\u200b${adj} ${noun}`;
}