import { removeFromDOM } from '../../client/js/domhelpers.js';

// Tearing a room down removes every widget's element, including ones that
// something else already detached along the way (a deck rewriting its count
// used to detach the elements of widgets nested inside it). Removal has to
// shrug those off instead of crashing the state load halfway through.
describe('removeFromDOM', () => {
  test('removes an attached node', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);
    removeFromDOM(child);
    expect(child.parentNode).toBe(null);
    expect(parent.childNodes.length).toBe(0);
  });

  test('tolerates a node that already left the DOM', () => {
    const orphan = document.createElement('span');
    expect(() => removeFromDOM(orphan)).not.toThrow();
  });
});
