import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// deckeditor.js is a plain script that gets concatenated by server/minify.mjs, and its editor instance at
// "const deckEditor = new DeckEditor()" would need the whole editor around it - so evaluate only the part
// after that line, which is where the deck creation flows keep their helpers.
const dir = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(dir, '../../client/js/editor/deckeditor.js'), 'utf8');
const instance = 'const deckEditor = new DeckEditor();';
const helpers = source.slice(source.indexOf(instance) + instance.length);
const { cardDefaultsWithTransition, cardDefaultsHaveTransition } = new Function(`${helpers}\nreturn { cardDefaultsWithTransition, cardDefaultsHaveTransition };`)();

describe('the transition class the deck creation flows put into cardDefaults', () => {
  test('adds the class to a deck that does not glide yet, keeping the classes it brings', () => {
    expect(cardDefaultsWithTransition()).toEqual({ classes: 'transition' });
    expect(cardDefaultsWithTransition({ width: 103 })).toEqual({ width: 103, classes: 'transition' });
    expect(cardDefaultsWithTransition({ classes: 'fancy' })).toEqual({ classes: 'fancy transition' });
  });

  test('hands back a class list that already glides exactly as it was written', () => {
    // dropTargets compare classes as one whole string, so reordering "transition fancy" into "fancy transition"
    // would take the deck's cards out of every holder accepting them
    for(const classes of [ 'transition', 'transition fancy', 'fancy transition', 'a transition b' ])
      expect(cardDefaultsWithTransition({ classes })).toEqual({ classes });
  });

  test('removes only the transition class, and the key with the last class', () => {
    expect(cardDefaultsWithTransition({ classes: 'fancy transition' }, false)).toEqual({ classes: 'fancy' });
    expect(cardDefaultsWithTransition({ classes: 'transition fancy' }, false)).toEqual({ classes: 'fancy' });
    expect(cardDefaultsWithTransition({ width: 103, classes: 'transition' }, false)).toEqual({ width: 103 });
    expect(cardDefaultsWithTransition({ classes: 'fancy' }, false)).toEqual({ classes: 'fancy' });
  });

  test('does not mistake a class that merely contains the word for the class itself', () => {
    expect(cardDefaultsHaveTransition({ classes: 'transitional' })).toBe(false);
    expect(cardDefaultsWithTransition({ classes: 'transitional' })).toEqual({ classes: 'transitional transition' });
  });
});
