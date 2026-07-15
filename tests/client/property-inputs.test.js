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
