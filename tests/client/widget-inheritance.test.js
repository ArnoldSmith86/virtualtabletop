import { addWidget, widgets } from '../../client/js/serverstate.js';
import { asArray, mapAssetURLs } from '../../client/js/domhelpers.js';
import { Widget } from '../../client/js/widgets/widget.js';

import { createWidget, removeWidget } from './client-util.js';

// Inheritance and spinner.js read these names from the concatenated global scope
// of the shipped bundle, so expose them before importing the spinner class.
let Spinner;
beforeAll(async () => {
  globalThis.widgets = widgets;
  globalThis.Widget = Widget;
  globalThis.asArray = asArray;
  globalThis.mapAssetURLs = mapAssetURLs;
  ({ Spinner } = await import('../../client/js/widgets/spinner.js'));
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

  test('a spinner renders the angle it falls back to', () => {
    createWidget({ id: 'angleSource', type: 'basic', angle: 720 });
    const spinner = new Spinner('inheritsAngle');
    addWidget({ id: spinner.id, type: 'spinner', inheritFrom: { angleSource: [ 'angle' ] } }, spinner);
    expect(spinner.get('angle')).toBe(720);
    expect(spinner.spinner.style.transform).toBe('rotate(720deg)');

    removeWidget('angleSource');

    expect(spinner.get('angle')).toBe(0);
    expect(spinner.spinner.style.transform).toBe('rotate(0deg)');
  });
});
