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
    numericInputValue,
    searchIconIndex,
    searchImageIndex,
    iconValueType,
    usedGameIconValue,
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

const testWidgets = new Map();
const cssHelpers = new Function('SidebarModule', 'widgets', propertiesSource + `;
  return {
    cssTextFromValue,
    cssStringRoundTrips,
    cssStringToObject,
    parsePropertyFromCSS,
    mergePropertyFromCSS,
    parseFontSize,
    formatTimerMs,
    parseTimerInput,
    inheritModeFromSelection,
    isPropertyDeclaredOnWidget: PropertiesModule.prototype.isPropertyDeclaredOnWidget,
    isSizeRatioLockEnabled: PropertiesModule.prototype.isSizeRatioLockEnabled,
    inheritSourceWouldCreateCycle: PropertiesModule.prototype.inheritSourceWouldCreateCycle,
    normalizeInheritFromObject: PropertiesModule.prototype.normalizeInheritFromObject,
    basicPropertyExcludeList: PropertiesModule.prototype.basicPropertyExcludeList,
    svgReplaceColorProperties,
    dicePreviewRotation,
    dicePreviewActiveFace,
    textSymbolClass,
    textValueFromSymbol
  };
`)(class {}, testWidgets);

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

  test('picked text symbols select the matching font class and stored value', () => {
    expect(cssHelpers.textSymbolClass({ type: 'symbols', symbol: '[die_face_6]' })).toBe('symbols');
    expect(cssHelpers.textSymbolClass({ type: 'material-symbols', symbol: 'casino' })).toBe('material-symbols');
    expect(cssHelpers.textSymbolClass({ type: 'material-symbols-nofill', symbol: 'casino_NOFILL' })).toBe('material-symbols-nofill');
    expect(cssHelpers.textSymbolClass({ type: 'emoji-monochrome', symbol: '(🎲)' })).toBe('emoji-monochrome');
    expect(cssHelpers.textValueFromSymbol({ type: 'symbols', symbol: '[die_face_6]' })).toBe('[die_face_6]');
    expect(cssHelpers.textValueFromSymbol({ type: 'material-symbols-nofill', symbol: 'casino_NOFILL' })).toBe('casino');
    expect(cssHelpers.textValueFromSymbol({ type: 'emoji-monochrome', symbol: '(🎲)' })).toBe('🎲');
  });

  test('svg replacement colors use only declared conventional color properties', () => {
    expect(cssHelpers.svgReplaceColorProperties({
      '#primary': 'color',
      '#accent': 'accentColor1',
      '#outline': 'outlineColor2',
      '#border': 'borderColor',
      '#empty': 'emptyColor',
      '#secondary': 'secondaryColor',
      '#alsoIgnored': 'title'
    })).toEqual([ 'color', 'accentColor1', 'outlineColor2', 'borderColor', 'emptyColor', 'secondaryColor' ]);
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

  test('parseFontSize safely handles incomplete CSS declarations', () => {
    expect(cssHelpers.parseFontSize('30px')).toEqual({ value: 30, unit: 'px' });
    expect(cssHelpers.parseFontSize('')).toEqual({ value: null, unit: null });
    expect(cssHelpers.parseFontSize(null)).toEqual({ value: null, unit: null });
  });

  test('inherit declarations respect explicit default-valued state', () => {
    const widget = { state: { width: 100 }, defaults: { width: 100 } };
    expect(cssHelpers.isPropertyDeclaredOnWidget(widget, 'width')).toBe(true);
    expect(cssHelpers.isPropertyDeclaredOnWidget(widget, 'height')).toBe(false);
  });

  test('an empty exclusion selection preserves copy-all inheritance', () => {
    expect(cssHelpers.inheritModeFromSelection('all')).toBe('*');
    expect(cssHelpers.inheritModeFromSelection('selected')).toEqual([]);
    expect(cssHelpers.inheritModeFromSelection('excluded')).toBe('*');
    expect(cssHelpers.inheritModeFromSelection('excluded', [ 'width', 'height' ])).toEqual([ '!width', '!height' ]);
  });

  test('inherit-source selection rejects direct and transitive cycles', () => {
    const target = { id: 'target', get: () => ({}) };
    const source = { id: 'source', get: property => property == 'inheritFrom' ? { target: '*' } : null };
    const indirect = { id: 'indirect', get: property => property == 'inheritFrom' ? { source: '*' } : null };
    testWidgets.clear();
    testWidgets.set('target', target);
    testWidgets.set('source', source);
    testWidgets.set('indirect', indirect);
    const module = { normalizeInheritFromObject: cssHelpers.normalizeInheritFromObject };
    expect(cssHelpers.inheritSourceWouldCreateCycle.call(module, target, 'source')).toBe(true);
    expect(cssHelpers.inheritSourceWouldCreateCycle.call(module, target, 'indirect')).toBe(true);
    expect(cssHelpers.inheritSourceWouldCreateCycle.call(module, target, 'missing')).toBe(false);
  });

  test('the size-ratio lock stays local while honoring a legacy false value', () => {
    const module = { sizeRatioLocks: new WeakMap() };
    expect(cssHelpers.isSizeRatioLockEnabled.call(module, { state: {} })).toBe(true);
    expect(cssHelpers.isSizeRatioLockEnabled.call(module, { state: { lockSizeRatio: false } })).toBe(false);
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

  test('numericInputValue ignores incomplete fields and enforces bounds', () => {
    expect(inputHelpers.numericInputValue('')).toBe(null);
    expect(inputHelpers.numericInputValue('abc')).toBe(null);
    expect(inputHelpers.numericInputValue('8', 1, 16)).toBe(8);
    expect(inputHelpers.numericInputValue('0', 1, 16)).toBe(1);
    expect(inputHelpers.numericInputValue('99', 1, 16)).toBe(16);
  });

  test('used icon suggestions ignore generic name and value fields', () => {
    expect(inputHelpers.usedGameIconValue('icon', 'lorc/star', [ 'icon' ], {})).toBe('lorc/star');
    expect(inputHelpers.usedGameIconValue('name', 'lorc/star', [ 'icon', 'name' ], {})).toBe('lorc/star');
    expect(inputHelpers.usedGameIconValue('value', 'lorc/star', [ 'faceTemplates', '0', 'value' ], { type: 'icon' })).toBe('lorc/star');
    expect(inputHelpers.usedGameIconValue('name', 'lorc/star', [ 'routine', 'name' ], {})).toBe(null);
    expect(inputHelpers.usedGameIconValue('value', 'lorc/star', [ 'routine', 'value' ], {})).toBe(null);
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

  test('searchIconIndex preserves symbols.json order', () => {
    inputHelpers.setIconSearchIndex([
      { value: 'star',           keywords: 'star,favorite', image: false },
      { value: 'grade',          keywords: 'star,grade',    image: false },
      { value: 'lorc/star',      keywords: 'star,shiny',    image: true },
      { value: 'delapouite/sun', keywords: 'sun,light',     image: true }
    ]);
    expect(inputHelpers.searchIconIndex('star')).toEqual([ 'star', 'grade', 'lorc/star' ]);
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

  test('icon search classifies and filters every icon family', () => {
    expect(inputHelpers.iconValueType('lorc/star')).toBe('game-icons');
    expect(inputHelpers.iconValueType('star_NOFILL')).toBe('material-symbols');
    expect(inputHelpers.iconValueType('🎲')).toBe('emoji-color');
    expect(inputHelpers.iconValueType('(🎲)')).toBe('emoji-monochrome');
    expect(inputHelpers.iconValueType('[die_face_6]')).toBe('vtt-symbols');
    expect(inputHelpers.iconValueType('https://example.com/icon.svg')).toBe(null);

    inputHelpers.setIconSearchIndex([
      { value: 'lorc/star', type: 'game-icons', keywords: 'star', image: true },
      { value: 'star', type: 'material-symbols', keywords: 'star', image: false }
    ]);
    expect(inputHelpers.searchIconIndex('star', 100, new Set([ 'material-symbols' ]))).toEqual([ 'star' ]);
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
