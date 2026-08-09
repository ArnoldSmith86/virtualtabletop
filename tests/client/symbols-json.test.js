import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// symbols.json is regenerated from Google's icon metadata every now and then. Its two consumers -
// the icon picker (client/js/symbols.js) and the icon search of the property editor
// (client/js/editor/propertyInputs.js) - both decide how to render an entry from the shape of its
// name alone, so an entry in the wrong shape does not fail loudly, it just renders as garbage in
// the picker. Guard the assumptions they make about the file.
const dir = path.dirname(fileURLToPath(import.meta.url));
const symbolData = JSON.parse(fs.readFileSync(path.join(dir, '../../assets/fonts/symbols.json'), 'utf8'));

// the prefix of a category decides which branch an entry has to end up in
const nameShapes = {
  'VTT Icons - ':      /^\[[^\]]+\]$/,
  'Game-icons.net - ': /^[a-z0-9-]+\/[a-z0-9-]+$/,
  'Material Symbols - ': /^[a-z0-9_]+( \(FILL\+NOFILL\))?$/
};

function forEachSymbol(callback) {
  for(const [ category, symbols ] of Object.entries(symbolData))
    for(const [ symbol, keywords ] of Object.entries(symbols))
      callback(category, symbol, keywords);
}

describe('symbols.json', () => {
  test('every icon name has the shape its category implies', () => {
    const invalid = [];
    forEachSymbol((category, symbol) => {
      const prefix = Object.keys(nameShapes).find(p=>category.startsWith(p));
      if(prefix ? !symbol.match(nameShapes[prefix]) : Object.values(nameShapes).some(shape=>symbol.match(shape)))
        invalid.push(`${category}: ${symbol}`);
    });
    expect(invalid).toEqual([]);
  });

  test('keywords are arrays of strings, with the spritesheet index first for game-icons', () => {
    const invalid = [];
    forEachSymbol((category, symbol, keywords) => {
      if(!Array.isArray(keywords))
        return invalid.push(`${category}: ${symbol}`);
      const words = symbol.includes('/') ? keywords.slice(1) : keywords;
      if(symbol.includes('/') && typeof keywords[0] != 'number' || words.some(word=>typeof word != 'string'))
        invalid.push(`${category}: ${symbol}`);
    });
    expect(invalid).toEqual([]);
  });

  test('no icon name appears in two categories', () => {
    const categoryOfName = new Map();
    const duplicates = [];
    forEachSymbol((category, symbol) => {
      if(categoryOfName.has(symbol))
        duplicates.push(`${symbol}: ${categoryOfName.get(symbol)} + ${category}`);
      categoryOfName.set(symbol, category);
    });
    expect(duplicates).toEqual([]);
  });
});
