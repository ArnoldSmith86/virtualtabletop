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
    searchImageIndex,
    setIconSearchIndex: index => { iconSearchIndex = index; }
  };
`)();

// renderIconChip needs a few globals from the room bundle; inject minimal stubs
// (a tiny fake DOM) so it can be exercised without jsdom
const renderIconChip = new Function('div', 'html', 'mapAssetURLs', 'toNotoMonochrome', inputsSource + `;
  return renderIconChip;
`)(
  (parent, className, innerHTML) => {
    const el = { className: className || '', title: '', innerHTML: innerHTML || '', children: [] };
    if(parent && parent.children) parent.children.push(el);
    return el;
  },
  value => String(value),
  value => value,
  value => value
);

const cssHelpers = new Function('SidebarModule', propertiesSource + `;
  return {
    cssTextFromValue,
    cssStringRoundTrips,
    cssStringToObject,
    parsePropertyFromCSS,
    mergePropertyFromCSS,
    formatTimerMs,
    parseTimerInput,
    basicPropertyExcludeList: PropertiesModule.prototype.basicPropertyExcludeList,
    svgReplaceColorProperties,
    dicePreviewRotation,
    dicePreviewActiveFace
  };
`)(class {});

describe('css helpers', () => {
  test('basic properties exclude the generic inputs from other property sections', () => {
    expect(cssHelpers.basicPropertyExcludeList()).toEqual(expect.arrayContaining([ 'clickable', 'enlarge', 'ignoreZoom' ]));
  });

  test('only D4 and D6 previews use the requested extra rotations', () => {
    expect(cssHelpers.dicePreviewRotation(4)).toBe('rotateZ(105deg) rotateX(110deg) rotateY(0deg)');
    expect(cssHelpers.dicePreviewRotation(6)).toBe('rotateX(15deg) rotateY(20deg)');
    expect(cssHelpers.dicePreviewRotation(8)).toBe('');
  });

  test('larger dice previews show their highest numeric face', () => {
    expect(cssHelpers.dicePreviewActiveFace([ 1, 2, 3, 4 ])).toBe(0);
    expect(cssHelpers.dicePreviewActiveFace([ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 ])).toBe(9);
    expect(cssHelpers.dicePreviewActiveFace([ 2, 12, 4, 8, 6, 10, 1, 3 ])).toBe(1);
    expect(cssHelpers.dicePreviewActiveFace([ { value: 4 }, { value: 20 }, { value: 8 }, { value: 12 }, { value: 16 }, { value: 6 }, { value: 10 } ])).toBe(1);
  });

  test('svg replacement colors use only declared conventional color properties', () => {
    expect(cssHelpers.svgReplaceColorProperties({
      '#primary': 'color',
      '#accent': 'accentColor1',
      '#outline': 'outlineColor2',
      '#border': 'borderColor',
      '#empty': 'colorEmpty',
      '#secondary': 'secondaryColor',
      '#alsoIgnored': 'title'
    })).toEqual([ 'color', 'accentColor1', 'outlineColor2', 'borderColor', 'colorEmpty', 'secondaryColor' ]);
  });

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

  test('mergePropertyFromCSS does not mutate the input (would drop the delta)', () => {
    const css = { default: { 'font-size': '50px' }, ':hover': { color: 'grey' } };
    const before = JSON.stringify(css);
    const result = cssHelpers.mergePropertyFromCSS(css, '--wcMainOH', '#3cb44b', 'default');
    expect(JSON.stringify(css)).toBe(before); // input untouched
    expect(result).toEqual({ default: { 'font-size': '50px', '--wcMainOH': '#3cb44b' }, ':hover': { color: 'grey' } });
    expect(result.default).not.toBe(css.default);
  });

  test('parsePropertyFromCSS reads strings, objects and nested classes', () => {
    expect(cssHelpers.parsePropertyFromCSS('color: red; font-weight: bold', 'color', null)).toBe('red');
    expect(cssHelpers.parsePropertyFromCSS({ color: 'red' }, 'color', null)).toBe('red');
    expect(cssHelpers.parsePropertyFromCSS({ default: { color: 'red' } }, 'color', null)).toBe('red');
    expect(cssHelpers.parsePropertyFromCSS({}, 'color', null)).toBe(null);
  });

  test('parsePropertyFromCSS does not suffix-match prefixed properties', () => {
    expect(cssHelpers.parsePropertyFromCSS('background-color: red; color: blue', 'color', null)).toBe('blue');
    expect(cssHelpers.parsePropertyFromCSS('border-color: red', 'color', null)).toBe(null);
    expect(cssHelpers.parsePropertyFromCSS('background-color: red', 'background-color', null)).toBe('red');
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

  test('renderIconChip renders object and array icons without crashing', () => {
    const target = { children: [] };
    // a symbol object icon (e.g. Turtle Tower's turnButton) previews its name
    const objectChip = renderIconChip({ name: 'skip_next', scale: 1.5 }, target);
    expect(objectChip.children[0].className).toBe('material-symbols');
    expect(objectChip.children[0].innerHTML).toBe('skip_next');
    // an array of symbol objects previews the first one (a game-icons path)
    const arrayChip = renderIconChip([ { name: 'lorc/drop' }, { name: 'star' } ], target);
    expect(arrayChip.innerHTML).toContain('game-icons.net/lorc/drop.svg');
    // a malformed icon object just yields an empty chip
    expect(() => renderIconChip({ scale: 2 }, target)).not.toThrow();
    // plain string icons still work
    const stringChip = renderIconChip('star', target);
    expect(stringChip.children[0].className).toBe('material-symbols');
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

  test('searchImageIndex returns image URLs for matching glyphs', () => {
    inputHelpers.setIconSearchIndex([
      { value: 'lorc/dice-six-faces-six', keywords: 'dice six', image: true },
      { value: '🎲', keywords: 'dice game', image: true },
      { value: 'casino', keywords: 'dice casino', image: false }
    ]);

    expect(inputHelpers.searchImageIndex('dice')).toEqual([
      '/i/game-icons.net/lorc/dice-six-faces-six.svg',
      '/i/noto-emoji/emoji_u1f3b2.svg'
    ]);
  });

  test('picker searches show up to 100 results', () => {
    inputHelpers.setIconSearchIndex(Array.from({ length: 101 }, (_, index) => ({
      value: `icons/icon-${index}`,
      keywords: 'icon',
      image: true
    })));

    expect(inputHelpers.searchIconIndex('icon')).toHaveLength(100);
    expect(inputHelpers.searchImageIndex('icon')).toHaveLength(100);
  });
});
