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
    setIconSearchIndex: index => { iconSearchIndex = index; },
    iconObjectValue,
    iconName,
    iconOption,
    iconWithOption,
    iconSupportsBasicOptions,
    iconValueForChip,
    MULTI_DIFFERENT,
    propertyInputIsMulti,
    MultiWidget,
    replaceExclusiveProperties
  };
`)();

// renderIconChip needs a few globals from the room bundle; inject minimal stubs
// (a tiny fake DOM) so it can be exercised without jsdom
const renderIconChip = new Function('div', 'html', 'mapAssetURLs', 'toNotoMonochrome', inputsSource + `;
  return renderIconChip;
`)(
  (parent, className, innerHTML) => {
    const el = { className: className || '', title: '', innerHTML: innerHTML || '', children: [], style: {} };
    if(parent && parent.children) parent.children.push(el);
    return el;
  },
  value => String(value),
  value => value,
  value => value
);

const testWidgets = new Map();
// buildDiceFace (properties.js) calls replaceExclusiveProperties (propertyInputs.js) -
// both files are concatenated into one bundle in the browser, so evaluate them
// together here too instead of propertiesSource alone
const cssHelpers = new Function('SidebarModule', 'widgets', inputsSource + propertiesSource + `;
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
    textValueFromSymbol,
    classesWithSymbolClass,
    diceFaces: PropertiesModule.prototype.diceFaces,
    diceUsesPips: PropertiesModule.prototype.diceUsesPips,
    diceFaceType: PropertiesModule.prototype.diceFaceType,
    diceFaceValue: PropertiesModule.prototype.diceFaceValue,
    buildDiceFace: PropertiesModule.prototype.buildDiceFace,
    reorderFaces: PropertiesModule.prototype.reorderFaces
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

describe('dice face editor helpers', () => {
  function diceModule(pipSymbols = null) {
    return { diceUsesPips: cssHelpers.diceUsesPips };
  }
  function diceWidget(pipSymbols = null) {
    return { get: property => property == 'pipSymbols' ? pipSymbols : undefined };
  }

  test('diceFaces normalizes a pip-string face list and deep-clones array faces', () => {
    const stringWidget = { get: () => 'HT' };
    expect(cssHelpers.diceFaces.call(null, stringWidget)).toEqual([ 'H', 'T' ]);

    const face = { pips: 3 };
    const arrayWidget = { get: () => [ face ] };
    const faces = cssHelpers.diceFaces.call(null, arrayWidget);
    expect(faces).toEqual([ { pips: 3 } ]);
    expect(faces[0]).not.toBe(face); // deep clone, editing it must not mutate widget state
  });

  test('diceFaceType infers the editor type from a face value', () => {
    const module = diceModule();
    const widget = diceWidget();
    expect(cssHelpers.diceFaceType.call(module, widget, 3)).toBe('pips');
    expect(cssHelpers.diceFaceType.call(module, widget, 'A')).toBe('text');
    expect(cssHelpers.diceFaceType.call(module, widget, { icon: 'skull' })).toBe('icon');
    expect(cssHelpers.diceFaceType.call(module, widget, { image: '/i/x.svg' })).toBe('image');
    expect(cssHelpers.diceFaceType.call(module, widget, '/assets/x.svg')).toBe('image');
    expect(cssHelpers.diceFaceType.call(module, widget, { text: 'Ace' })).toBe('text');
  });

  test('diceFaceType respects pipSymbols:false by treating numeric faces as text', () => {
    const module = diceModule(false);
    const widget = diceWidget(false);
    expect(cssHelpers.diceFaceType.call(module, widget, 3)).toBe('text');
  });

  test('diceFaceType follows the engine when pipSymbols is unset (3D d4 shows numbers)', () => {
    const module = diceModule();
    // the engine's Dice.pipSymbols() decides this for an unset pipSymbols -
    // e.g. a 3D d4 renders numbers, so its faces must not be edited as pips
    const d4 = { get: property => property == 'pipSymbols' ? null : undefined, pipSymbols: () => false };
    const d6 = { get: property => property == 'pipSymbols' ? null : undefined, pipSymbols: () => true };
    expect(cssHelpers.diceUsesPips.call(module, d4)).toBe(false);
    expect(cssHelpers.diceFaceType.call(module, d4, 3)).toBe('text');
    expect(cssHelpers.diceFaceType.call(module, d6, 3)).toBe('pips');
  });

  test('diceFaceValue reads the value matching the given type, falling back sensibly', () => {
    expect(cssHelpers.diceFaceValue(null, 3, 'pips')).toBe(3);
    expect(cssHelpers.diceFaceValue(null, 'A', 'text')).toBe('A');
    expect(cssHelpers.diceFaceValue(null, { value: 5 }, 'pips')).toBe(5);
    expect(cssHelpers.diceFaceValue(null, {}, 'pips')).toBe(1);
  });

  test('buildDiceFace replaces the exclusive content key and keeps other keys like color', () => {
    expect(cssHelpers.buildDiceFace.call(null, 'text', 'Ace', { pips: 3, color: '#fff' })).toEqual({ color: '#fff', text: 'Ace' });
    expect(cssHelpers.buildDiceFace.call(null, 'pips', '', null)).toEqual({ pips: 0 });
    expect(cssHelpers.buildDiceFace.call(null, 'icon', '', { icon: 'skull' })).toEqual({ icon: null });
  });

  test('reorderFaces keeps activeFace pointing at the same face after a move', () => {
    const widget = { get: () => 1 }; // activeFace = 1 (face "b")
    let result = null;
    const faces = [ 'a', 'b', 'c' ];
    cssHelpers.reorderFaces.call(null, widget, faces, 0, 2, (newFaces, activeFace) => { result = { newFaces, activeFace }; });
    expect(result.newFaces).toEqual([ 'b', 'c', 'a' ]);
    expect(result.activeFace).toBe(0); // "b" moved from index 1 to index 0
  });

  test('reorderFaces ignores out-of-range or no-op moves', () => {
    const widget = { get: () => 0 };
    const faces = [ 'a', 'b' ];
    let called = false;
    const setFaces = () => { called = true; };
    cssHelpers.reorderFaces.call(null, widget, faces, 0, 0, setFaces);
    cssHelpers.reorderFaces.call(null, widget, faces, -1, 1, setFaces);
    cssHelpers.reorderFaces.call(null, widget, faces, 0, 5, setFaces);
    expect(called).toBe(false);
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

  test('renderIconChip previews the icon object\'s color and scale', () => {
    const target = { children: [] };
    const coloredChip = renderIconChip({ name: 'skip_next', color: '#ff0000', scale: 2 }, target);
    expect(coloredChip.children[0].style.color).toBe('#ff0000');
    expect(coloredChip.children[0].style.transform).toBe('scale(2)');
    // unset color/scale leave the glyph unstyled
    const plainChip = renderIconChip({ name: 'skip_next' }, target);
    expect(plainChip.children[0].style.color).toBeUndefined();
    // an array combo has no single glyph to color/scale, even if entries have one
    const arrayChip = renderIconChip([ { name: 'skip_next', color: '#ff0000' } ], target);
    expect(arrayChip.children[0].style.color).toBeUndefined();
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

  test('icon basic-options scale field clamps to its advertised 0.1-5 range', () => {
    expect(inputHelpers.numericInputValue('100', 0.1, 5)).toBe(5);
    expect(inputHelpers.numericInputValue('-1', 0.1, 5)).toBe(0.1);
    expect(inputHelpers.numericInputValue('0', 0.1, 5)).toBe(0.1);
    expect(inputHelpers.numericInputValue('2.5', 0.1, 5)).toBe(2.5);
    expect(inputHelpers.numericInputValue('', 0.1, 5)).toBe(null);
    expect(inputHelpers.numericInputValue('abc', 0.1, 5)).toBe(null);
  });
});

describe('icon value helpers', () => {
  test('iconName reads the name from both plain strings and the object form', () => {
    expect(inputHelpers.iconName('skull')).toBe('skull');
    expect(inputHelpers.iconName({ name: 'skull', color: '#f00' })).toBe('skull');
  });

  test('iconWithOption sets and clears an option, collapsing back to a plain string once empty', () => {
    const withColor = inputHelpers.iconWithOption('skull', 'color', '#f00');
    expect(withColor).toEqual({ name: 'skull', color: '#f00' });
    expect(inputHelpers.iconWithOption(withColor, 'color', null)).toBe('skull');
  });

  test('iconWithOption swaps the icon name while preserving other options (chip click keeps color/scale)', () => {
    const withColor = { name: 'a', color: '#f00' };
    expect(inputHelpers.iconWithOption(withColor, 'name', 'b')).toEqual({ name: 'b', color: '#f00' });
  });

  test('iconWithOption on a plain string with no options set stays a plain string', () => {
    expect(inputHelpers.iconWithOption('skull', 'name', 'heart')).toBe('heart');
  });

  test('iconWithOption on a null value creates a plain string once a name is set', () => {
    expect(inputHelpers.iconWithOption(null, 'name', 'skull')).toBe('skull');
  });

  test('iconSupportsBasicOptions requires a chosen single icon, not a combo or unset value', () => {
    expect(inputHelpers.iconSupportsBasicOptions('skull')).toBe(true);
    expect(inputHelpers.iconSupportsBasicOptions({ name: 'skull', color: '#f00' })).toBe(true);
    expect(inputHelpers.iconSupportsBasicOptions(null)).toBe(false);
    expect(inputHelpers.iconSupportsBasicOptions('')).toBe(false);
    expect(inputHelpers.iconSupportsBasicOptions({ name: null })).toBe(false);
    expect(inputHelpers.iconSupportsBasicOptions([ 'a', 'b' ])).toBe(false);
  });

  test('iconValueForChip merges into the current value like iconWithOption', () => {
    expect(inputHelpers.iconValueForChip(null, 'star')).toBe('star');
    expect(inputHelpers.iconValueForChip({ name: 'old', color: '#f00' }, 'star')).toEqual({ name: 'star', color: '#f00' });
  });

  test('iconValueForChip treats the multi-selection sentinel as unset, not as a real icon value', () => {
    const result = inputHelpers.iconValueForChip(inputHelpers.MULTI_DIFFERENT, 'star');
    expect(result).toBe('star');
    expect(JSON.stringify(result)).not.toMatch(/multiDiffers/);
  });
});

describe('classesWithSymbolClass', () => {
  test('adds a symbol class while keeping unrelated classes', () => {
    expect(cssHelpers.classesWithSymbolClass('foo symbols', 'material-symbols')).toBe('foo material-symbols');
  });

  test('removes the symbol class when switching back to text mode', () => {
    expect(cssHelpers.classesWithSymbolClass('foo symbols', null)).toBe('foo');
  });

  test('handles a null/empty starting value', () => {
    expect(cssHelpers.classesWithSymbolClass(null, 'symbols')).toBe('symbols');
    expect(cssHelpers.classesWithSymbolClass('symbols', null)).toBe(null);
  });
});

describe('multi-selection helpers', () => {
  function makeWidget(id, state) {
    return {
      id,
      state,
      defaults: { width: 1 },
      domElement: null,
      get(property) { return this.state[property]; },
      set(property, value) { this.state[property] = value; }
    };
  }

  test('MultiWidget.get returns the common value or the MULTI_DIFFERENT sentinel', () => {
    const a = makeWidget('a', { color: 'red', text: 'hi' });
    const b = makeWidget('b', { color: 'red', text: 'bye' });
    const multi = new inputHelpers.MultiWidget([ a, b ]);
    expect(multi.get('color')).toBe('red');
    expect(inputHelpers.propertyInputIsMulti(multi.get('text'))).toBe(true);
    expect(multi.get('text')).toBe(inputHelpers.MULTI_DIFFERENT);
  });

  test('MultiWidget.set writes the value to every selected widget', () => {
    const a = makeWidget('a', { color: 'red' });
    const b = makeWidget('b', { color: 'blue' });
    const multi = new inputHelpers.MultiWidget([ a, b ]);
    multi.set('color', 'green');
    expect(a.state.color).toBe('green');
    expect(b.state.color).toBe('green');
  });

  test('MultiWidget.state merges the union of every widget\'s properties, with a sentinel for disagreements', () => {
    const a = makeWidget('a', { color: 'red', width: 10, onlyOnA: 1 });
    const b = makeWidget('b', { color: 'red', width: 20 });
    const multi = new inputHelpers.MultiWidget([ a, b ]);
    const state = multi.state;
    expect(state.color).toBe('red');
    expect(inputHelpers.propertyInputIsMulti(state.width)).toBe(true);
    // a property set on only some of the selection (e.g. an icon picked on
    // only one widget) must still resolve to the sentinel instead of
    // disappearing - an absent value differs from the value present on the
    // other widget, so pickers show "multiple values" rather than "not set"
    expect(inputHelpers.propertyInputIsMulti(state.onlyOnA)).toBe(true);
  });

  test('MultiWidget.state treats a property unset on every widget as absent, not multi', () => {
    const a = makeWidget('a', { color: 'red' });
    const b = makeWidget('b', { color: 'red' });
    const multi = new inputHelpers.MultiWidget([ a, b ]);
    expect(multi.state).not.toHaveProperty('icon');
  });

  test('MultiWidget.id joins the selected widget ids', () => {
    const multi = new inputHelpers.MultiWidget([ makeWidget('a', {}), makeWidget('b', {}) ]);
    expect(multi.id).toBe('a,b');
    expect(multi.isMulti).toBe(true);
  });

  test('replaceExclusiveProperties drops the old exclusive keys and sets the new one', () => {
    expect(inputHelpers.replaceExclusiveProperties({ pips: 3, color: '#fff' }, [ 'pips', 'text', 'icon', 'image' ], 'text', 'hi'))
      .toEqual({ color: '#fff', text: 'hi' });
    expect(inputHelpers.replaceExclusiveProperties(null, [ 'pips' ], 'pips', 2)).toEqual({ pips: 2 });
  });
});
