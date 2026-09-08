import { widgets } from '../../client/js/serverstate.js';

import { createWidget, removeWidget } from './client-util.js';

// getDefaultValue() resolves inheritance through the concatenated global scope of the
// shipped bundle rather than through an import, so expose the widget map it reads.
beforeAll(() => {
  globalThis.widgets = widgets;
});

// A widget with inheritFrom takes every property it does not set itself from another widget.
// Once that widget is gone it falls back to its remaining sources or to its own defaults,
// which is what get() reports from then on - so what it is drawn with has to follow, or a
// line places a stop by one size and draws it at another.
describe('Removing a widget that other widgets inherit from', () => {
  afterEach(() => {
    for(const id of [ ...widgets.keys() ])
      removeWidget(id);
  });

  test('the inheritor falls back to its own default and is drawn with it', () => {
    createWidget({ id: 'sizeSource', type: 'basic', width: 40, height: 40 });
    const inheritor = createWidget({ id: 'inheritsSize', type: 'basic', inheritFrom: 'sizeSource' });
    expect(inheritor.get('height')).toBe(40);
    expect(inheritor.domElement.style.height).toBe('40px');

    removeWidget('sizeSource');

    expect(inheritor.get('height')).toBe(inheritor.defaults.height);
    expect(inheritor.domElement.style.height).toBe(`${inheritor.defaults.height}px`);
  });

  test('a property the inheritor sets itself keeps its value', () => {
    createWidget({ id: 'sizeSource', type: 'basic', width: 40, height: 40 });
    const inheritor = createWidget({ id: 'inheritsWidth', type: 'basic', inheritFrom: 'sizeSource', height: 70 });

    removeWidget('sizeSource');

    expect(inheritor.get('height')).toBe(70);
    expect(inheritor.get('width')).toBe(inheritor.defaults.width);
  });

  test('the inheritor can be moved again once an inherited lock is gone', () => {
    createWidget({ id: 'lockedSource', type: 'basic', movable: false });
    const inheritor = createWidget({ id: 'inheritsMovable', type: 'basic', inheritFrom: 'lockedSource' });
    expect(inheritor.get('movable')).toBe(false);
    expect(inheritor.domElement.className).not.toContain('movable');

    removeWidget('lockedSource');

    expect(inheritor.get('movable')).toBe(true);
    expect(inheritor.domElement.className).toContain('movable');
  });

  test('a second source takes over the properties the removed one provided', () => {
    createWidget({ id: 'firstSource', type: 'basic', height: 40 });
    createWidget({ id: 'secondSource', type: 'basic', height: 55 });
    const inheritor = createWidget({ id: 'inheritsFromTwo', type: 'basic', inheritFrom: { firstSource: '*', secondSource: '*' } });
    expect(inheritor.get('height')).toBe(40);

    removeWidget('firstSource');

    expect(inheritor.get('height')).toBe(55);
    expect(inheritor.domElement.style.height).toBe('55px');
  });
});
