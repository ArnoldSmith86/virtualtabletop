import { widgets, addWidget, batchStart, batchEnd, widgetFilter, flushDelta } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';
import { exceedsDropLimit } from '../../client/js/main.js';

import { createWidget, removeWidget } from './client-util.js';

// pile.js relies on the concatenated global scope of the shipped bundle rather
// than on imports, so expose the identifiers it references before importing it.
let Pile;
beforeAll(async () => {
  globalThis.Widget = Widget;
  globalThis.widgets = widgets;
  globalThis.widgetFilter = widgetFilter;
  globalThis.batchStart = batchStart;
  globalThis.batchEnd = batchEnd;
  globalThis.flushDelta = flushDelta;
  globalThis.setDeltaCause = () => {};
  globalThis.getMaxZ = () => 0;
  globalThis.updateMaxZ = () => {};
  globalThis.mapAssetURLs = url => url;
  globalThis.playerName = 'jestPlayer';
  ({ Pile } = await import('../../client/js/widgets/pile.js'));
});

afterEach(() => {
  for(const id of [ ...widgets.keys() ])
    removeWidget(id);
});

describe('a limit given as a dynamic expression', () => {
  test('reads a property of the widget itself', () => {
    const holder = createWidget({ id: 'holder', type: 'holder', maxCards: 4, dropLimit: '${PROPERTY maxCards}' });
    expect(holder.currentDropLimit()).toBe(4);
  });

  test('reads a property of another widget', () => {
    createWidget({ id: 'board', type: 'basic', seats: 3 });
    const holder = createWidget({ id: 'holder', type: 'holder', dropLimit: '${PROPERTY seats OF board}' });
    expect(holder.currentDropLimit()).toBe(3);
  });

  test('applies an operation to its operands, written before or between them', () => {
    createWidget({ id: 'board', type: 'basic', seats: 3 });
    const holder = createWidget({ id: 'holder', type: 'holder', extra: 2 });
    expect(holder.evaluateDynamicNumber('${PROPERTY seats OF board} * 2')).toBe(6);
    expect(holder.evaluateDynamicNumber('${PROPERTY seats OF board} + ${PROPERTY extra}')).toBe(5);
    expect(holder.evaluateDynamicNumber('min ${PROPERTY seats OF board} ${PROPERTY extra}')).toBe(2);
  });

  test('turns a numeric string into a number, since a property can hold one', () => {
    const holder = createWidget({ id: 'holder', type: 'holder', maxCards: '4' });
    expect(holder.evaluateDynamicNumber('${PROPERTY maxCards}')).toBe(4);
    expect(holder.evaluateDynamicNumber('7')).toBe(7);
  });

  test('falls back to no limit rather than to a wrong number', () => {
    const holder = createWidget({ id: 'holder', type: 'holder', dropLimit: '${PROPERTY seats OF gone}' });
    expect(holder.currentDropLimit()).toBe(-1);

    // a property that holds no number, an unknown operation, and a typo
    createWidget({ id: 'board', type: 'basic', seats: 'three' });
    expect(holder.evaluateDynamicNumber('${PROPERTY seats OF board}', -1)).toBe(-1);
    expect(holder.evaluateDynamicNumber('${PROPERTY seats OF board} bogus 2', -1)).toBe(-1);
    expect(holder.evaluateDynamicNumber('${PROPERTY', -1)).toBe(-1);
  });

  test('leaves a plain number and the -1 default alone', () => {
    const holder = createWidget({ id: 'holder', type: 'holder', dropLimit: 2 });
    expect(holder.currentDropLimit()).toBe(2);
    expect(createWidget({ id: 'plain', type: 'holder' }).currentDropLimit()).toBe(-1);
  });
});

describe('enforcing a dynamic limit', () => {
  test('is decided by what the expression currently evaluates to', async () => {
    const board = createWidget({ id: 'board', type: 'basic', seats: 2 });
    const holder = createWidget({ id: 'holder', type: 'holder', dropLimit: '${PROPERTY seats OF board}' });
    createWidget({ id: 'child-1', type: 'basic', parent: 'holder' });

    expect(exceedsDropLimit(holder)).toBe(false);
    createWidget({ id: 'child-2', type: 'basic', parent: 'holder' });
    expect(exceedsDropLimit(holder)).toBe(true);

    // no routine writes the limit anywhere - the holder takes one more as soon
    // as the property the expression reads says so
    await board.set('seats', 3);
    expect(exceedsDropLimit(holder)).toBe(false);
  });
});

describe('the pile handle showing a dynamic limit', () => {
  function createPile(def) {
    const pile = new Pile(def.id);
    addWidget({ ...def, type: 'pile' }, pile);
    return pile;
  }

  test('shows what the expression amounts to', () => {
    createWidget({ id: 'board', type: 'basic', seats: 3 });
    const pile = createPile({ id: 'pile', showLimit: true, dropLimit: '${PROPERTY seats OF board}' });
    expect(pile.handle.textContent).toBe('0/3');
  });

  test('follows the property it reads on another widget', async () => {
    const board = createWidget({ id: 'board', type: 'basic', seats: 3 });
    const pile = createPile({ id: 'pile', showLimit: true, dropLimit: '${PROPERTY seats OF board}' });

    await board.set('seats', 5);
    expect(pile.handle.textContent).toBe('0/5');

    // and stops following it once the expression no longer reads it
    await pile.set('dropLimit', 2);
    await board.set('seats', 9);
    expect(pile.handle.textContent).toBe('0/2');
  });

  test('reads as no limit while the expression is broken', () => {
    const pile = createPile({ id: 'pile', showLimit: true, dropLimit: '${PROPERTY seats OF gone}' });
    expect(pile.handle.textContent).toBe('0');
  });
});
