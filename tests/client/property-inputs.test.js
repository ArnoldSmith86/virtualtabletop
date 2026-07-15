import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The editor files are plain scripts that get concatenated by server/minify.mjs,
// so evaluate the source and grab the pure helpers from its scope.
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/js/editor/propertyInputs.js'), 'utf8');
const helpers = new Function(source + `;
  return {
    cssObjectFromString,
    cssStringIsEditable,
    widgetCssObject,
    getWidgetCssValue,
    setWidgetCssValue,
    propertyInputIsMulti,
    propertyInputNumberOrText,
    replaceExclusiveProperties,
    searchIconIndex,
    propertyInputPalette,
    setIconSearchIndex: index => { iconSearchIndex = index; }
  };
`)();

function fakeWidget(state) {
  return { get: property => state[property] };
}

function recordingModule(calls) {
  return { inputValueUpdated: (widget, property, value) => calls.push([ property, value ]) };
}

describe("css property helpers", () => {
  test("parses string css into an object", () => {
    expect(helpers.cssObjectFromString('font-weight: bold; color: red')).toEqual({ 'font-weight': 'bold', color: 'red' });
    expect(helpers.widgetCssObject(fakeWidget({ css: 'border: 1px solid black;' }))).toEqual({ border: '1px solid black' });
  });

  test("uses object css directly and the default entry of nested css", () => {
    expect(helpers.widgetCssObject(fakeWidget({ css: { color: 'red' } }))).toEqual({ color: 'red' });
    expect(helpers.widgetCssObject(fakeWidget({ css: { 'default': { color: 'red' }, ' ::placeholder': { color: 'blue' } } }))).toEqual({ color: 'red' });
  });

  test("refuses to parse css strings that do not round-trip", () => {
    const dataURI = 'background-image: url("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")';
    expect(helpers.cssStringIsEditable(dataURI)).toBe(false);
    expect(helpers.cssStringIsEditable('color: red; color: blue')).toBe(false); // duplicate keys collapse
    expect(helpers.cssStringIsEditable('font-weight: bold; color: red;')).toBe(true);
    expect(helpers.widgetCssObject(fakeWidget({ css: dataURI }))).toEqual({});
  });

  test("setWidgetCssValue leaves unparseable css strings alone", () => {
    const calls = [];
    const widget = fakeWidget({ css: 'background-image: url("data:image/svg+xml;base64,abc")' });
    helpers.setWidgetCssValue(recordingModule(calls), widget, 'color', 'red');
    expect(calls).toEqual([]);
  });

  test("setWidgetCssValue merges, deletes and clears", () => {
    const calls = [];
    const module = recordingModule(calls);

    helpers.setWidgetCssValue(module, fakeWidget({ css: { color: 'red' } }), 'font-weight', 'bold');
    expect(calls.pop()).toEqual([ 'css', { color: 'red', 'font-weight': 'bold' } ]);

    helpers.setWidgetCssValue(module, fakeWidget({ css: { color: 'red', 'font-weight': 'bold' } }), 'font-weight', null);
    expect(calls.pop()).toEqual([ 'css', { color: 'red' } ]);

    helpers.setWidgetCssValue(module, fakeWidget({ css: { color: 'red' } }), 'color', null);
    expect(calls.pop()).toEqual([ 'css', null ]);

    helpers.setWidgetCssValue(module, fakeWidget({ css: 'color: red' }), 'font-weight', 'bold');
    expect(calls.pop()).toEqual([ 'css', { color: 'red', 'font-weight': 'bold' } ]);
  });

  test("setWidgetCssValue keeps other classes of nested css", () => {
    const calls = [];
    const widget = fakeWidget({ css: { 'default': { color: 'red' }, ' ::placeholder': { color: 'blue' } } });
    helpers.setWidgetCssValue(recordingModule(calls), widget, 'color', 'green');
    expect(calls.pop()).toEqual([ 'css', { 'default': { color: 'green' }, ' ::placeholder': { color: 'blue' } } ]);
  });

  test("getWidgetCssValue reads single declarations", () => {
    expect(helpers.getWidgetCssValue(fakeWidget({ css: 'color: red' }), 'color')).toBe('red');
    expect(helpers.getWidgetCssValue(fakeWidget({ css: 'color: red' }), 'font-weight')).toBe(null);
    expect(helpers.getWidgetCssValue(fakeWidget({}), 'color')).toBe(null);
  });

  test("multi-widget CSS edits preserve each widget's other declarations", () => {
    const first = fakeWidget({ css: { color: 'red', border: '1px solid' } });
    const second = fakeWidget({ css: { color: 'blue', padding: '2px' } });
    const multi = { isMulti: true, widgets: [ first, second ] };
    const calls = [];
    const module = { inputValueUpdated: (widget, property, value) => calls.push([ widget, property, value ]) };
    let batchStarts = 0;
    let batchEnds = 0;
    global.batchStart = _=>batchStarts++;
    global.batchEnd = _=>batchEnds++;

    expect(helpers.propertyInputIsMulti(helpers.getWidgetCssValue(multi, 'color'))).toBe(true);
    helpers.setWidgetCssValue(module, multi, 'background', 'black');

    expect(calls).toEqual([
      [ first, 'css', { color: 'red', border: '1px solid', background: 'black' } ],
      [ second, 'css', { color: 'blue', padding: '2px', background: 'black' } ]
    ]);
    expect(batchStarts).toBe(1);
    expect(batchEnds).toBe(1);
    delete global.batchStart;
    delete global.batchEnd;
  });
});

describe("lossless editor values", () => {
  test("keeps CSS border-radius strings distinct from numeric values", () => {
    expect(helpers.propertyInputNumberOrText('50%', true)).toBe('50%');
    expect(helpers.propertyInputNumberOrText('8px', true)).toBe('8px');
    expect(helpers.propertyInputNumberOrText('8', true)).toBe(8);
    expect(helpers.propertyInputNumberOrText('', true)).toBe(null);
  });

  test("replacing dice content preserves unrelated face overrides", () => {
    const face = { pips: 1, faceCSS: { color: 'red' }, imageScale: 0.5, svgReplaces: { a: 'b' } };
    expect(helpers.replaceExclusiveProperties(face, [ 'value', 'pips', 'text', 'icon', 'image' ], 'icon', null)).toEqual({
      icon: null,
      faceCSS: { color: 'red' },
      imageScale: 0.5,
      svgReplaces: { a: 'b' }
    });
    expect(face).toEqual({ pips: 1, faceCSS: { color: 'red' }, imageScale: 0.5, svgReplaces: { a: 'b' } });
  });
});

describe("icon search", () => {
  test("matches all terms against keywords and respects the limit", () => {
    helpers.setIconSearchIndex([
      { value: 'lorc/dragon-head', keywords: 'dragon-head,dragon,monster' },
      { value: 'lorc/dragon-wing', keywords: 'dragon-wing,dragon,wing' },
      { value: 'lorc/acorn', keywords: 'acorn,nut' }
    ]);
    expect(helpers.searchIconIndex('dragon')).toEqual([ 'lorc/dragon-head', 'lorc/dragon-wing' ]);
    expect(helpers.searchIconIndex('dragon wing')).toEqual([ 'lorc/dragon-wing' ]);
    expect(helpers.searchIconIndex('dragon', 1)).toEqual([ 'lorc/dragon-head' ]);
    expect(helpers.searchIconIndex('missing')).toEqual([]);
  });
});

describe("color picker", () => {
  test("offers transparent as an explicit palette choice", () => {
    expect(helpers.propertyInputPalette).toContain('transparent');
  });
});
