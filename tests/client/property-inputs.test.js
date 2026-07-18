import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The editor files are plain scripts that get concatenated by server/minify.mjs,
// so evaluate the sources and grab the pure helpers from their scope.
const dir = path.dirname(fileURLToPath(import.meta.url));
const inputsSource = fs.readFileSync(path.join(dir, '../../client/js/editor/propertyInputs.js'), 'utf8');
const propertiesSource = fs.readFileSync(path.join(dir, '../../client/js/editor/sidebar/properties.js'), 'utf8');

const inputHelpers = new Function(inputsSource + `;
  return {
    propertyInputNumberOrText,
    propertyInputValueSet,
    searchIconIndex,
    setIconSearchIndex: index => { iconSearchIndex = index; }
  };
`)();

const cssHelpers = new Function('SidebarModule', propertiesSource + `;
  return {
    cssTextFromValue,
    cssStringRoundTrips,
    cssStringToObject,
    parsePropertyFromCSS,
    mergePropertyFromCSS,
    formatTimerMs,
    parseTimerInput
  };
`)(class {});

describe('css helpers', () => {
  test('cssTextFromValue renders all value shapes', () => {
    expect(cssHelpers.cssTextFromValue(null)).toBe('');
    expect(cssHelpers.cssTextFromValue('color: red')).toBe('color: red');
    expect(cssHelpers.cssTextFromValue({ color: 'red', 'font-weight': 'bold' })).toBe('color: red;\nfont-weight: bold;');
  });

  test('cssStringRoundTrips detects values that the parser would destroy', () => {
    expect(cssHelpers.cssStringRoundTrips('color: red; font-weight: bold')).toBe(true);
    expect(cssHelpers.cssStringRoundTrips('background-image: url("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")')).toBe(false);
    expect(cssHelpers.cssStringRoundTrips('color: red; color: blue')).toBe(false); // duplicate keys collapse
  });

  test('mergePropertyFromCSS leaves unparseable css strings alone', () => {
    const dataURI = 'background-image: url("data:image/svg+xml;base64,abc")';
    expect(cssHelpers.mergePropertyFromCSS(dataURI, 'color', 'red')).toBe(dataURI);
  });

  test('mergePropertyFromCSS merges and deletes declarations', () => {
    expect(cssHelpers.mergePropertyFromCSS('color: red', 'font-weight', 'bold')).toEqual({ color: 'red', 'font-weight': 'bold' });
    expect(cssHelpers.mergePropertyFromCSS({ color: 'red', 'font-weight': 'bold' }, 'font-weight', null)).toEqual({ color: 'red' });
    expect(cssHelpers.mergePropertyFromCSS({ default: { color: 'red' } }, 'color', 'blue', ' ::placeholder'))
      .toEqual({ default: { color: 'red' }, ' ::placeholder': { color: 'blue' } });
  });

  test('parsePropertyFromCSS reads strings, objects and nested classes', () => {
    expect(cssHelpers.parsePropertyFromCSS('color: red; font-weight: bold', 'color', null)).toBe('red');
    expect(cssHelpers.parsePropertyFromCSS({ color: 'red' }, 'color', null)).toBe('red');
    expect(cssHelpers.parsePropertyFromCSS({ default: { color: 'red' } }, 'color', null)).toBe('red');
    expect(cssHelpers.parsePropertyFromCSS({}, 'color', null)).toBe(null);
  });
});

describe('timer time helpers', () => {
  test('formatTimerMs renders milliseconds as mm:ss', () => {
    expect(cssHelpers.formatTimerMs(0)).toBe('0:00');
    expect(cssHelpers.formatTimerMs(61000)).toBe('1:01');
    expect(cssHelpers.formatTimerMs(-90000)).toBe('-1:30');
    expect(cssHelpers.formatTimerMs(5500)).toBe('0:05.5');
    expect(cssHelpers.formatTimerMs(null)).toBe('');
  });

  test('parseTimerInput accepts mm:ss and plain seconds', () => {
    expect(cssHelpers.parseTimerInput('1:01')).toBe(61000);
    expect(cssHelpers.parseTimerInput('90')).toBe(90000);
    expect(cssHelpers.parseTimerInput('-1:30')).toBe(-90000);
    expect(cssHelpers.parseTimerInput('0:05.5')).toBe(5500);
    expect(cssHelpers.parseTimerInput('')).toBe(null);
    expect(cssHelpers.parseTimerInput('abc')).toBe(undefined);
  });

  test('formatTimerMs and parseTimerInput round-trip', () => {
    for(const ms of [ 0, 1000, 61000, 5500, 3600000, -90000 ])
      expect(cssHelpers.parseTimerInput(cssHelpers.formatTimerMs(ms))).toBe(ms);
  });
});

describe('property input helpers', () => {
  test('propertyInputNumberOrText returns numbers for numeric strings', () => {
    expect(inputHelpers.propertyInputNumberOrText('8')).toBe(8);
    expect(inputHelpers.propertyInputNumberOrText('-2.5')).toBe(-2.5);
    expect(inputHelpers.propertyInputNumberOrText('50%')).toBe('50%');
    expect(inputHelpers.propertyInputNumberOrText('', true)).toBe(null);
  });

  test('propertyInputValueSet treats null, undefined and empty strings as unset', () => {
    expect(inputHelpers.propertyInputValueSet(undefined)).toBe(false);
    expect(inputHelpers.propertyInputValueSet(null)).toBe(false);
    expect(inputHelpers.propertyInputValueSet('')).toBe(false);
    expect(inputHelpers.propertyInputValueSet(0)).toBe(true);
    expect(inputHelpers.propertyInputValueSet('transparent')).toBe(true);
  });

  test('searchIconIndex interleaves font and image matches', () => {
    inputHelpers.setIconSearchIndex([
      { value: 'star',           keywords: 'star,favorite', image: false },
      { value: 'grade',          keywords: 'star,grade',    image: false },
      { value: 'lorc/star',      keywords: 'star,shiny',    image: true },
      { value: 'delapouite/sun', keywords: 'sun,light',     image: true }
    ]);
    expect(inputHelpers.searchIconIndex('star')).toEqual([ 'star', 'lorc/star', 'grade' ]);
    expect(inputHelpers.searchIconIndex('sun')).toEqual([ 'delapouite/sun' ]);
    expect(inputHelpers.searchIconIndex('nothing')).toEqual([]);
  });
});
