import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { positionNames, expressionError, expressionNames } from '../../client/js/expression.js';
import { asArray } from '../../client/js/domhelpers.js';

// The editor files are plain scripts that get concatenated by server/minify.mjs,
// so evaluate the sources and grab the pure helpers from their scope.
const dir = path.dirname(fileURLToPath(import.meta.url));
const inputsSource = fs.readFileSync(path.join(dir, '../../client/js/editor/propertyInputs.js'), 'utf8');
// the icon search itself lives in the room bundle (client/js/symbols.js, exported to edit mode by
// main.js), so both pickers rank a query the same way - evaluate it in front of the editor source
// the way the browser has it in scope, with the import/export lines the bundler drops
const symbolsSource = fs.readFileSync(path.join(dir, '../../client/js/symbols.js'), 'utf8')
  .replace(/^import\s+[^;]+;\r?\n/gm, '')
  .replace(/^export\s+/gm, '');
const propertiesSource = fs.readFileSync(path.join(dir, '../../client/js/editor/sidebar/properties.js'), 'utf8');

const inputHelpers = new Function(symbolsSource + inputsSource + `;
  return {
    propertyInputNumberOrText,
    propertyInputValueSet,
    numericInputValue,
    searchIconIndex,
    searchImageIndex,
    iconSearchEntry,
    iconSearchScores,
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
    replaceExclusiveProperties,
    soundName
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
const cssHelpers = new Function('SidebarModule', 'widgets', 'positionNames', 'expressionError', 'expressionNames', 'asArray', inputsSource + propertiesSource + `;
  return {
    cssTextFromValue,
    cssStringRoundTrips,
    cssStringToObject,
    parsePropertyFromCSS,
    mergePropertyFromCSS,
    cssDeclarationList,
    cssDeclarationsWithDisabled,
    cssValueFromDeclarations,
    cssValueIsColor,
    cssColorHasAlpha,
    cssDeclarationIsValid,
    cssValueSuggestions,
    cssPropertySuggestions: PropertiesModule.prototype.cssPropertySuggestions,
    typeSections: PropertiesModule.prototype.typeSections,
    parseFontSize,
    formatTimerMs,
    parseTimerInput,
    inheritModeFromSelection,
    isPropertyDeclaredOnWidget: PropertiesModule.prototype.isPropertyDeclaredOnWidget,
    isSizeRatioLockEnabled: PropertiesModule.prototype.isSizeRatioLockEnabled,
    inheritSourceWouldCreateCycle: PropertiesModule.prototype.inheritSourceWouldCreateCycle,
    normalizeInheritFromObject: PropertiesModule.prototype.normalizeInheritFromObject,
    MULTI_DIFFERENT,
    isOnDemandPropertyValueSet: PropertiesModule.prototype.isOnDemandPropertyValueSet,
    normalizeSeatReference: PropertiesModule.prototype.normalizeSeatReference,
    seatReferenceToArray: PropertiesModule.prototype.seatReferenceToArray,
    associatedWidgetsSummary: PropertiesModule.prototype.associatedWidgetsSummary,
    selectionIncludesType: PropertiesModule.prototype.selectionIncludesType,
    interactionSummary: PropertiesModule.prototype.interactionSummary,
    basicPropertyExcludeList: PropertiesModule.prototype.basicPropertyExcludeList,
    svgReplaceProperties,
    svgReplaceInputDefs,
    svgReplaceInputKind,
    svgReplaceCandidates,
    svgReplacePropertyForAttributes,
    dragLimitIsSet,
    dragLimitValue,
    conditionList,
    conditionProblem,
    dragLimitDependencies,
    dependencyDeltaMatters,
    positionSummary: PropertiesModule.prototype.positionSummary,
    dicePreviewRotation,
    dicePreviewActiveFace,
    textSymbolClass,
    textValueFromSymbol,
    classesWithSymbolClass,
    gridEntryList,
    conditionsOf,
    conditionOutlinePath,
    gridDotPositions,
    gridConditionDotLimit,
    gridExtraProperties,
    gridExtraValue,
    gridExtraText,
    squareGridForSize,
    hexGridForSize,
    diceFaces: PropertiesModule.prototype.diceFaces,
    diceUsesPips: PropertiesModule.prototype.diceUsesPips,
    diceFaceType: PropertiesModule.prototype.diceFaceType,
    diceFaceValue: PropertiesModule.prototype.diceFaceValue,
    buildDiceFace: PropertiesModule.prototype.buildDiceFace,
    reorderFaces: PropertiesModule.prototype.reorderFaces,
    facePropertyKind,
    faceSummary,
    indexAfterReorder,
    activeFaceIndex,
    widgetOwnValue,
    faceNewPropertyValue: PropertiesModule.prototype.faceNewPropertyValue,
    removeFace: PropertiesModule.prototype.removeFace,
    parseRankRange,
    defaultSuitName,
    courtSuitLetter,
    deckGeneratorDesignHint
  };
`)(class {}, testWidgets, positionNames, expressionError, expressionNames, asArray);

// what fetchSVG() (main.js) answered about the image, in its own scope so the
// candidate cache starts empty
const svgReplaceLookup = fetchSVG => new Function('SidebarModule', 'widgets', 'positionNames', 'expressionError', 'expressionNames', 'asArray', 'fetchSVG', inputsSource + propertiesSource + `;
  return fetchSvgReplaceCandidates;
`)(class {}, testWidgets, positionNames, expressionError, expressionNames, asArray, fetchSVG);

describe('css declaration rows', () => {
  test('declarations are listed in order from both the string and the object form', () => {
    expect(cssHelpers.cssDeclarationList('color: red; font-size: 20px')).toEqual([
      { name: 'color', value: 'red' },
      { name: 'font-size', value: '20px' }
    ]);
    expect(cssHelpers.cssDeclarationList({ background: '#fff', 'z-index': 3 })).toEqual([
      { name: 'background', value: '#fff' },
      { name: 'z-index', value: '3' }
    ]);
    expect(cssHelpers.cssDeclarationList(null)).toEqual([]);
    expect(cssHelpers.cssDeclarationList('')).toEqual([]);
  });

  test('switched off declarations come back at the position they were switched off at', () => {
    const declarations = [ { name: 'font-size', value: '20px' }, { name: 'color', value: 'red' } ];
    expect(cssHelpers.cssDeclarationsWithDisabled(declarations, [ { name: 'background', value: '#fff', index: 0 } ])).toEqual([
      { name: 'background', value: '#fff', disabled: true },
      { name: 'font-size', value: '20px', disabled: false },
      { name: 'color', value: 'red', disabled: false }
    ]);
    // an index beyond the list (the rest was deleted meanwhile) lands at the end
    expect(cssHelpers.cssDeclarationsWithDisabled([], [ { name: 'color', value: 'red', index: 7 } ])).toEqual([
      { name: 'color', value: 'red', disabled: true }
    ]);
    expect(cssHelpers.cssDeclarationsWithDisabled(declarations, undefined).every(d => d.disabled === false)).toBe(true);
    // a declaration set again meanwhile (color picker, other player, undo) is
    // not shown a second time as a switched off ghost
    expect(cssHelpers.cssDeclarationsWithDisabled(declarations, [ { name: 'color', value: 'blue', index: 0 } ])).toEqual([
      { name: 'font-size', value: '20px', disabled: false },
      { name: 'color', value: 'red', disabled: false }
    ]);
  });

  test('a declaration that only has its name yet is a row, not a value', () => {
    const declarations = [ { name: 'color', value: 'red' } ];
    // pending rows come back at their position, like the switched off ones,
    // and are enabled - they just have nothing to write yet
    expect(cssHelpers.cssDeclarationsWithDisabled(declarations, undefined, [ { name: 'font-size', value: '', index: 1 } ])).toEqual([
      { name: 'color', value: 'red', disabled: false },
      { name: 'font-size', value: '', disabled: false }
    ]);
    // one that got a value meanwhile is not shown twice
    expect(cssHelpers.cssDeclarationsWithDisabled(declarations, undefined, [ { name: 'color', value: '', index: 0 } ])).toEqual([
      { name: 'color', value: 'red', disabled: false }
    ]);
    // and neither is one that is also in the switched off list
    expect(cssHelpers.cssDeclarationsWithDisabled([], [ { name: 'color', value: 'red', index: 0 } ], [ { name: 'color', value: '', index: 1 } ])).toEqual([
      { name: 'color', value: 'red', disabled: true }
    ]);
  });

  test('a color the color input cannot express keeps its alpha', () => {
    for(const value of [ '#ff880080', '#f008', 'rgba(0,0,0,0.5)', 'hsla(20,50%,50%,0.2)', 'rgb(0 0 0 / 50%)', 'transparent', 'currentcolor' ])
      expect(cssHelpers.cssColorHasAlpha(value)).toBe(true);
    // the modern color spaces write their alpha behind a slash, too
    for(const value of [ 'oklch(0.7 0.1 200 / 50%)', 'lab(50% 40 59.5 / .5)', 'hwb(12 50% 0% / 0.2)', 'color(display-p3 1 0 0 / 50%)' ])
      expect(cssHelpers.cssColorHasAlpha(value)).toBe(true);
    for(const value of [ '#fff', '#ff8800', 'rgb(0,0,0)', 'red', '', 'oklch(0.7 0.1 200)' ])
      expect(cssHelpers.cssColorHasAlpha(value)).toBe(false);
  });

  test('!important, custom properties and asset urls are not flagged as unsupported', () => {
    expect(cssHelpers.cssDeclarationIsValid('color', 'red !important', true)).toBe(true);
    expect(cssHelpers.cssDeclarationIsValid('--wcMain', 'whatever it wants', true)).toBe(true);
    expect(cssHelpers.cssDeclarationIsValid('background-image', 'url(/assets/-1234_567)', true)).toBe(true);
    expect(cssHelpers.cssDeclarationIsValid('color', '', true)).toBe(true);
  });

  test('interpolated widget properties only count as valid in the css property', () => {
    // css goes through cssReplaceProperties, handleCSS and friends do not
    expect(cssHelpers.cssDeclarationIsValid('color', '${PROPERTY textColor}', true)).toBe(true);
    expect(cssHelpers.cssDeclarationIsValid('color', '${PROPERTY textColor}', false)).toBe(false);
  });

  test('a css written as a string stays a string, but only while it can be split', () => {
    expect(cssHelpers.cssValueFromDeclarations([ { name: 'color', value: 'red' } ], 'color: blue;')).toBe('color: red;');
    expect(cssHelpers.cssValueFromDeclarations([ { name: 'color', value: 'red' } ], { color: 'blue' })).toEqual({ color: 'red' });
    expect(cssHelpers.cssValueFromDeclarations([ { name: 'color', value: 'red' } ], null)).toEqual({ color: 'red' });
    // "" is the default of the css properties, not a css written as a string
    expect(cssHelpers.cssValueFromDeclarations([ { name: 'color', value: 'red' } ], '')).toEqual({ color: 'red' });
    // a value with a ";" in it would not survive the string form
    expect(cssHelpers.cssValueFromDeclarations([ { name: 'background-image', value: 'url(data:image/svg+xml;base64,AAA)' } ], 'color: blue;'))
      .toEqual({ 'background-image': 'url(data:image/svg+xml;base64,AAA)' });
    // a ":" does survive it - the parser splits at the first one
    expect(cssHelpers.cssValueFromDeclarations([ { name: 'background-image', value: 'url(https://example.com/x.png)' } ], 'color: blue;'))
      .toBe('background-image: url(https://example.com/x.png);');
  });

  test('rows without a property name are dropped, an empty list clears the value', () => {
    expect(cssHelpers.cssValueFromDeclarations([ { name: '  ', value: 'red' }, { name: 'color', value: ' blue ' } ], null)).toEqual({ color: 'blue' });
    expect(cssHelpers.cssValueFromDeclarations([], { color: 'red' })).toBe(null);
    expect(cssHelpers.cssValueFromDeclarations([ { name: '', value: '' } ], 'color: red;')).toBe(null);
  });

  test('plain colors get a swatch, everything else does not', () => {
    for(const value of [ '#fff', '#ff8800', '#ff880080', 'rgba(0,0,0,0.5)', 'hsl(20 50% 50%)', 'red', 'TRANSPARENT', ' white ' ])
      expect(cssHelpers.cssValueIsColor(value)).toBe(true);
    for(const value of [ '', null, '20px', '1px solid red', 'url(/assets/x)', 'var(--wcMain)', '${PROPERTY color}' ])
      expect(cssHelpers.cssValueIsColor(value)).toBe(false);
  });

  test('value completion knows the keyword properties and offers nothing else', () => {
    expect(cssHelpers.cssValueSuggestions('display')).toEqual(expect.arrayContaining([ 'flex', 'none' ]));
    // inherit/initial/unset are valid everywhere but useless as a suggestion
    expect(cssHelpers.cssValueSuggestions('display')).not.toEqual(expect.arrayContaining([ 'inherit' ]));
    expect(cssHelpers.cssValueSuggestions('some-unknown-property')).toEqual([]);
  });

  test('property completion adds the css variables of the widget type', () => {
    const suggestions = cssHelpers.cssPropertySuggestions.call(
      { typeSections: cssHelpers.typeSections },
      { get: _=>'button' }
    );
    expect(suggestions).toEqual(expect.arrayContaining([ '--wcMain', '--wcFontOH', 'font-size' ]));
    expect(new Set(suggestions).size).toBe(suggestions.length);
  });
});

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

  test('svg replacements list every property they point at, once', () => {
    expect(cssHelpers.svgReplaceProperties({
      '#primary': 'color',
      '#gradient': [ 'colorA', 'colorB' ],
      '#again': 'color',
      '#border': 'borderColor',
      '#other': 'title',
      '#ignored': 42
    })).toEqual([ 'color', 'colorA', 'colorB', 'borderColor', 'title' ]);
    expect(cssHelpers.svgReplaceProperties(null)).toEqual([]);
  });

  test('svg replacement inputs follow the attribute the value was found in', () => {
    const defs = cssHelpers.svgReplaceInputDefs({
      '#f00': 'color',
      '2': 'borderWidth',
      '0.5': 'ghostOpacity',
      'PLACEHOLDER': 'label'
    }, {
      '#f00': [ 'fill' ],
      '2': [ 'stroke-width' ],
      '0.5': [ 'fill-opacity' ]
    });
    // map order, in which "2" comes first: an integer-like key is one
    expect(defs.map(def => [ def.property, def.kind ])).toEqual([
      [ 'borderWidth', 'number' ],
      [ 'color', 'color' ],
      [ 'ghostOpacity', 'number' ],
      [ 'label', 'text' ]
    ]);
    expect(defs[2].max).toBe(1);
    expect(defs[1].label).toBe('Color');
    expect(defs[0].label).toBe('Border Width');
  });

  test('svg replacement inputs fall back to the property name without a scanned file', () => {
    expect(cssHelpers.svgReplaceInputKind('borderColor')).toBe('color');
    expect(cssHelpers.svgReplaceInputKind('fillOpacity')).toBe('opacity');
    expect(cssHelpers.svgReplaceInputKind('borderWidth')).toBe('number');
    expect(cssHelpers.svgReplaceInputKind('title')).toBe('text');
    // the scanned attribute wins over the name
    expect(cssHelpers.svgReplaceInputKind('title', [ 'stroke' ])).toBe('color');
  });

  test('svg candidates are read from the attributes the engine can replace', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <style>.frame { stroke: #00ff00; stroke-width: 4 }</style>
      <rect fill="#ff0000" stroke="#00ff00" stroke-width="4" opacity="0.5"/>
      <path d="M 4 4 L 8 8" style="fill:#ff0000;fill-opacity:0.25" stroke="none"/>
      <circle fill="url(#gradient)"/>
    </svg>`;
    expect(cssHelpers.svgReplaceCandidates(svg).map(candidate => [ candidate.value, candidate.attributes ])).toEqual([
      [ '#00ff00', [ 'stroke' ] ],
      [ '#ff0000', [ 'fill' ] ],
      [ '4', [ 'stroke-width' ] ],
      [ '0.5', [ 'opacity' ] ],
      [ '0.25', [ 'fill-opacity' ] ]
    ]);
    // "4" is also in the path data, so replacing it would hit that too
    expect(cssHelpers.svgReplaceCandidates(svg).find(candidate => candidate.value == '4').ambiguous).toBe(true);
    expect(cssHelpers.svgReplaceCandidates(svg).find(candidate => candidate.value == '#ff0000').ambiguous).toBe(false);
  });

  test('the three ways of having no values to offer are told apart', async () => {
    const svg = svgReplaceLookup(async _ => '<svg><rect fill="#ff0000"/></svg>');
    expect(await svg('/i/thing.svg')).toMatchObject({ isSvg: true, status: 'svg' });
    expect((await svg('/i/thing.svg')).candidates.map(c => c.value)).toEqual([ '#ff0000' ]);

    // a bitmap: nothing can ever be listed and no replacement can ever apply
    const bitmap = svgReplaceLookup(async _ => null);
    expect(await bitmap('/assets/1_2')).toMatchObject({ isSvg: false, candidates: [], status: 'notSvg' });

    // unreadable says nothing about what the file is, so the name still decides
    // whether the editor is shown - but not silently, hence its own status
    const broken = svgReplaceLookup(async _ => { throw new Error('404'); });
    expect(await broken('/i/gone.svg')).toEqual({ isSvg: true, candidates: [], status: 'unreadable' });
    expect(await broken('/i/gone.png')).toEqual({ isSvg: false, candidates: [], status: 'unreadable' });

    expect(await svg('')).toEqual({ isSvg: false, candidates: [], status: 'none' });
  });

  test('svg candidates propose the property their attribute is conventionally read from', () => {
    expect(cssHelpers.svgReplacePropertyForAttributes([ 'fill' ])).toBe('color');
    expect(cssHelpers.svgReplacePropertyForAttributes([ 'stroke' ])).toBe('borderColor');
    expect(cssHelpers.svgReplacePropertyForAttributes([ 'stroke-width' ])).toBe('borderWidth');
    expect(cssHelpers.svgReplacePropertyForAttributes([ 'fill-opacity' ])).toBe('fillOpacity');
    expect(cssHelpers.svgReplacePropertyForAttributes([])).toBe('color');
  });

  test('drag limits count as set as soon as one side is given', () => {
    expect(cssHelpers.dragLimitIsSet(null)).toBe(false);
    expect(cssHelpers.dragLimitIsSet({})).toBe(false);
    expect(cssHelpers.dragLimitIsSet({ maxY: 900 })).toBe(true);
    expect(cssHelpers.dragLimitValue({ minX: 0 }, 'minX')).toBe(0);
    expect(cssHelpers.dragLimitValue({ minX: 0 }, 'maxX')).toBe(null);
  });

  test('the condition field is one condition per line, and says which line does not parse', () => {
    expect(cssHelpers.conditionList('y > x\n\n  2x^2 + y > 4  \n')).toEqual([ 'y > x', '2x^2 + y > 4' ]);
    expect(cssHelpers.conditionList(null)).toEqual([]);
    expect(cssHelpers.conditionProblem('y > x\n2x^2 + y > 4')).toBe(null);
    expect(cssHelpers.conditionProblem('')).toBe(null);
    // the message names the line it is about - the other lines are fine
    expect(cssHelpers.conditionProblem('y > x\n0 < x < 500')).toMatch(/^"0 < x < 500": /);
    // a property has to be written as one, so a bare word is reported as it is
    // typed rather than read as nothing while dragging
    expect(cssHelpers.conditionProblem('x + width < 500')).toMatch(/\$\{PROPERTY width\}/);
    expect(cssHelpers.conditionProblem('x + ${PROPERTY width} < 500')).toBe(null);
    // and so is a line that is a sum rather than an inequality: it reads as
    // true wherever it is not 0, i.e. it limits nothing
    expect(cssHelpers.conditionProblem('y > x\nx - 100')).toMatch(/^"x - 100": .*comparison/);
  });

  test('the drawing follows every property its expressions read', () => {
    const widget = { id: 'piece', get: property=>({
      dragLimit: { maxX: '${PROPERTY edge OF board} - ${PROPERTY limitWidth}', condition: 'y > ${PROPERTY top OF rail}' },
      parent: 'holder'
    })[property] };
    const dependencies = cssHelpers.dragLimitDependencies(widget);
    expect([ ...dependencies.board ]).toEqual([ 'edge' ]);
    expect([ ...dependencies.rail ]).toEqual([ 'top' ]);
    expect([ ...dependencies.piece ]).toEqual([ 'limitWidth' ]);
    // the drawing is a canvas inside the parent, which empties itself when it
    // renders its own content - so every property of the parent counts
    expect(dependencies.holder).toBe(true);

    // a button that moves the area redraws it, an unrelated change does not
    expect(cssHelpers.dependencyDeltaMatters(dependencies, { board: { edge: 900 } })).toBe(true);
    expect(cssHelpers.dependencyDeltaMatters(dependencies, { piece: { limitWidth: 20 } })).toBe(true);
    expect(cssHelpers.dependencyDeltaMatters(dependencies, { holder: { text: 'hi' } })).toBe(true);
    expect(cssHelpers.dependencyDeltaMatters(dependencies, { board: { z: 5 } })).toBe(false);
    expect(cssHelpers.dependencyDeltaMatters(dependencies, { other: { x: 5 } })).toBe(false);
    // x and y are the position being tested, not a property any delta carries
    expect(cssHelpers.dependencyDeltaMatters(dependencies, { piece: { x: 5 } })).toBe(false);
    // a widget the limit reads being deleted changes the area as well
    expect(cssHelpers.dependencyDeltaMatters(dependencies, { rail: null })).toBe(true);
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

  test('the collapsed links header names the links that are set', () => {
    const summaryOf = state => cssHelpers.associatedWidgetsSummary.call(cssHelpers, { get: property => state[property] });
    expect(summaryOf({})).toBe('none');
    expect(summaryOf({ parent: 'holder1' })).toBe('parent (holder1)');
    // whether the parent is locked is an editing detail, not one of the links
    expect(summaryOf({ parent: 'holder1', fixedParent: true })).toBe('parent (holder1)');
    expect(summaryOf({ linkedToSeat: 'seat1' })).toBe('seat (seat1)');
    expect(summaryOf({ linkedToSeat: [ 'seat1', 'seat2' ] })).toBe('seat (seat1, seat2)');
    // more than two seats would make the header too long to read at a glance
    expect(summaryOf({ onlyVisibleForSeat: [ 'a', 'b', 'c' ] })).toBe('visible for 3 seats');
    expect(summaryOf({ inheritFrom: 'source' })).toBe('inherits from (source)');
    expect(summaryOf({ inheritFrom: { a: '*', b: '*' } })).toBe('inherits from 2 widgets');
    expect(summaryOf({ parent: 'holder1', linkedToSeat: 'seat1', inheritFrom: { a: '*' } }))
      .toBe('parent (holder1) · seat (seat1) · inherits from (a)');
    // a multi-selection that disagrees says so instead of showing one widget's value
    expect(summaryOf({ parent: cssHelpers.MULTI_DIFFERENT, linkedToSeat: cssHelpers.MULTI_DIFFERENT, inheritFrom: cssHelpers.MULTI_DIFFERENT }))
      .toBe('parent — · seat — · inherits —');
  });

  test('the collapsed interaction header only names what deviates from the default', () => {
    const summaryOf = state => cssHelpers.interactionSummary.call(cssHelpers, { get: property => state[property] });
    expect(summaryOf({ clickable: true, enlarge: 0, ignoreZoom: false })).toBe('');
    expect(summaryOf({ clickable: false })).toBe('not clickable');
    expect(summaryOf({ clickable: true, enlarge: 2, ignoreZoom: true })).toBe('enlarge ×2 · ignores zoom');
    expect(summaryOf({ clickable: cssHelpers.MULTI_DIFFERENT, enlarge: cssHelpers.MULTI_DIFFERENT })).toBe('clickable — · enlarge —');
    expect(summaryOf({ type: 'seat', clickable: true, display: false })).toBe('');
    // a click sound is named by its file, not by the /i/audio/… path it is stored as
    expect(summaryOf({ clickable: true, clickSound: '/i/audio/casino/dice-throw-1.mp3' })).toBe('sound dice-throw-1');
    expect(summaryOf({ clickable: true, clickSound: null })).toBe('');
  });

  test('a sound is named by its file, whatever it was uploaded or picked as', () => {
    expect(inputHelpers.soundName('/i/audio/casino/dice-throw-1.mp3')).toBe('dice-throw-1');
    expect(inputHelpers.soundName('/assets/-2035762169_5722')).toBe('-2035762169_5722');
    expect(inputHelpers.soundName('https://example.com/sounds/My Sound.ogg')).toBe('My Sound');
  });

  test('the size-ratio lock stays local while honoring a legacy false value', () => {
    const module = { sizeRatioLocks: new WeakMap() };
    expect(cssHelpers.isSizeRatioLockEnabled.call(module, { state: {} })).toBe(true);
    expect(cssHelpers.isSizeRatioLockEnabled.call(module, { state: { lockSizeRatio: false } })).toBe(false);
  });
});

describe('snap grid helpers', () => {
  test('only object entries of an array count as grids', () => {
    expect(cssHelpers.gridEntryList([ { x: 10, y: 10 }, null, 5 ])).toEqual([ { x: 10, y: 10 } ]);
    expect(cssHelpers.gridEntryList(null)).toEqual([]);
    expect(cssHelpers.gridEntryList({ x: 10 })).toEqual([]);
  });

  test('everything that is not grid geometry is a property applied on snapping', () => {
    expect(cssHelpers.gridExtraProperties({ x: 1, y: 2, offsetX: 3, alignY: 1, minX: 0, maxY: 9, condition: 'x > 0', rotation: 90, image: 'a.svg' }))
      .toEqual([ 'rotation', 'image' ]);
    expect(cssHelpers.gridExtraProperties(undefined)).toEqual([]);
  });

  test('a dragLimit or a grid entry takes one condition or a list of them', () => {
    expect(cssHelpers.conditionsOf({ x: 10, y: 10 })).toEqual([]);
    expect(cssHelpers.conditionsOf({ condition: null })).toEqual([]);
    expect(cssHelpers.conditionsOf({ condition: 'y > x' })).toEqual([ 'y > x' ]);
    expect(cssHelpers.conditionsOf({ condition: [ 'y > x', 'x > 100' ] })).toEqual([ 'y > x', 'x > 100' ]);
  });

  test('typed snap-point values become numbers/booleans when they look like JSON', () => {
    expect(cssHelpers.gridExtraValue('90')).toBe(90);
    expect(cssHelpers.gridExtraValue(' true ')).toBe(true);
    expect(cssHelpers.gridExtraValue('cards/back.svg')).toBe('cards/back.svg');
    expect(cssHelpers.gridExtraValue('')).toBe('');
    expect(cssHelpers.gridExtraText('a.svg')).toBe('a.svg');
    expect(cssHelpers.gridExtraText(90)).toBe('90');
  });

  test('a square grid is the widget box', () => {
    expect(cssHelpers.squareGridForSize(103, 60)).toEqual([ { x: 103, y: 60 } ]);
  });

  test('the hex grid matches the JSON editor calculation for both hex types', () => {
    // the second grid is staggered by half a step on both axes, and the two
    // orientations are mirror images of each other
    expect(cssHelpers.hexGridForSize(60, 60, 'point')).toEqual([
      { x: 51.96, y: 90, offsetX: 25.98, offsetY: 45 },
      { x: 51.96, y: 90, offsetX: 0, offsetY: 0 }
    ]);
    expect(cssHelpers.hexGridForSize(60, 60, 'flat')).toEqual([
      { x: 90, y: 51.96, offsetX: 45, offsetY: 25.98 },
      { x: 90, y: 51.96, offsetX: 0, offsetY: 0 }
    ]);
  });

  test('the hex grid sizes the hexagon by the shorter side of a non-square box', () => {
    // background-size: contain, so a 60x100 box draws the same hexagon as 60x60
    expect(cssHelpers.hexGridForSize(60, 100, 'flat')).toEqual(cssHelpers.hexGridForSize(60, 60, 'flat'));
    expect(cssHelpers.hexGridForSize(100, 60, 'point')).toEqual(cssHelpers.hexGridForSize(60, 60, 'point'));
  });
});

// the dashed line the editor draws around the area a condition describes -
// sampled and traced, because the shape itself is never computed
describe('the outline of a condition', () => {
  const box = { left: 0, top: 0, width: 400, height: 400 };
  const points = path=>path.split(/M |L /).slice(1).map(pair=>pair.trim().split(' ').map(Number));

  test('is empty where the whole box is on one side of it', () => {
    expect(cssHelpers.conditionOutlinePath(box, 10, _=>true)).toBe('');
    expect(cssHelpers.conditionOutlinePath(box, 10, _=>false)).toBe('');
  });

  test('follows a straight boundary between the two sides', () => {
    const path = cssHelpers.conditionOutlinePath(box, 10, coord=>coord.x < 250);
    // one line, every point of it on the boundary rather than on the lattice
    expect(path.match(/M /g).length).toBe(1);
    for(const [ x, y ] of points(path)) {
      expect(x).toBeCloseTo(250, 0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(400);
    }
  });

  test('traces a circle as a closed line rather than a staircase of the sampling step', () => {
    const path = cssHelpers.conditionOutlinePath(box, 10, coord=>(coord.x - 200) ** 2 + (coord.y - 200) ** 2 < 150 ** 2);
    const line = points(path);
    // joined end to end, so a dash pattern runs along the circle instead of
    // starting over at every sample
    expect(path.match(/M /g).length).toBe(1);
    expect(line.length).toBeGreaterThan(50);
    expect(line[0]).toEqual(line[line.length - 1]);
    for(const [ x, y ] of line)
      expect(Math.hypot(x - 200, y - 200)).toBeCloseTo(150, 0);
  });

  test('traces every part of an area that is in several pieces', () => {
    const path = cssHelpers.conditionOutlinePath(box, 10, coord=>coord.x < 100 || coord.x > 300);
    expect(path.match(/M /g).length).toBe(2);
  });

  test('is traced in the coordinates it is asked in, so it can be drawn where it holds', () => {
    const path = cssHelpers.conditionOutlinePath({ left: 1000, top: 500, width: 400, height: 400 }, 10, coord=>coord.x < 1250);
    for(const [ x, y ] of points(path)) {
      expect(x).toBeCloseTo(1250, 0);
      expect(y).toBeGreaterThanOrEqual(500);
    }
  });
});

// the dots of a grid a condition limits are drawn one by one, so that only the
// positions the widget can be put on are marked
describe('the dots of a limited grid', () => {
  const box = { left: 0, top: 0, width: 400, height: 400 };
  const noAlign = { x: 0, y: 0 };
  const positions = (entry, applies, area = box, align = noAlign) =>
    cssHelpers.gridDotPositions(entry, area, align, cssHelpers.gridConditionDotLimit, applies);

  test('marks the lattice points the grid applies at and no others', () => {
    const dots = positions({ x: 100, y: 100 }, coord=>coord.x < 250);
    expect(dots).toEqual([
      { x: 0, y: 0 }, { x: 0, y: 100 }, { x: 0, y: 200 }, { x: 0, y: 300 }, { x: 0, y: 400 },
      { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 200 }, { x: 100, y: 300 }, { x: 100, y: 400 },
      { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 200, y: 300 }, { x: 200, y: 400 }
    ]);
  });

  test('stays on the lattice the widget lands on, offset and all', () => {
    // a step of 150 from an offset of 20, and nothing past the box - which is
    // the rectangle the grid is limited to
    expect(positions({ x: 150, y: 500, offsetX: 20 }, _=>true).map(dot=>dot.x)).toEqual([ 20, 170, 320 ]);
    // an offset outside the box is still the same lattice inside it
    expect(positions({ x: 150, y: 500, offsetX: -280 }, _=>true).map(dot=>dot.x)).toEqual([ 20, 170, 320 ]);
  });

  test('asks about the corner rather than the point that lands on the lattice', () => {
    const asked = [];
    positions({ x: 200, y: 200 }, coord=>{ asked.push(coord.x); return true; }, box, { x: 25, y: 50 });
    expect(asked).toEqual([ -25, -25, -25, 175, 175, 175, 375, 375, 375 ]);
  });

  test('is traced in the coordinates it is asked in, so it can be drawn where it holds', () => {
    const dots = positions({ x: 200, y: 200 }, coord=>coord.x > 1100, { left: 1000, top: 500, width: 400, height: 400 });
    expect(dots).toEqual([
      { x: 1200, y: 600 }, { x: 1200, y: 800 }, { x: 1400, y: 600 }, { x: 1400, y: 800 }
    ]);
  });

  test('leaves a lattice with more points than the limit to the background layer', () => {
    expect(positions({ x: 1, y: 1 }, _=>true)).toBe(null);
    expect(positions({ x: 0, y: 100 }, _=>true)).toBe(null);
    // an area nothing satisfies is a list of no dots, not "draw them all"
    expect(positions({ x: 100, y: 100 }, _=>false)).toEqual([]);
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

  test('indexAfterReorder follows an index through a move', () => {
    expect(cssHelpers.indexAfterReorder(1, 1, 0)).toBe(0); // the moved one
    expect(cssHelpers.indexAfterReorder(0, 0, 2)).toBe(2);
    expect(cssHelpers.indexAfterReorder(1, 0, 2)).toBe(0); // shifted down
    expect(cssHelpers.indexAfterReorder(1, 2, 0)).toBe(2); // shifted up
    expect(cssHelpers.indexAfterReorder(3, 0, 2)).toBe(3); // untouched
  });
});

// enough of a StateManaged widget for the pure helpers: own state, defaults
// and the get() that resolves between them
function fakeWidget(state, defaults = {}) {
  const widget = {
    state,
    defaults,
    getDefaultValue: property => defaults[property],
    get: property => widget.state[property] !== undefined ? widget.state[property] : defaults[property]
  };
  return widget;
}

describe('basic widget faces', () => {
  test('face properties pick their input from their name and value shape', () => {
    expect(cssHelpers.facePropertyKind('icon', null)).toBe('icon');
    expect(cssHelpers.facePropertyKind('image', '/assets/1')).toBe('image');
    expect(cssHelpers.facePropertyKind('color', '#fff')).toBe('color');
    expect(cssHelpers.facePropertyKind('borderColor', '#fff')).toBe('color');
    expect(cssHelpers.facePropertyKind('text', 'a')).toBe('text');
    expect(cssHelpers.facePropertyKind('movable', false)).toBe('checkbox');
    expect(cssHelpers.facePropertyKind('rotation', 90)).toBe('number');
    expect(cssHelpers.facePropertyKind('css', 'color: red')).toBe('css');
    expect(cssHelpers.facePropertyKind('css', { color: 'red' })).toBe('css');
    expect(cssHelpers.facePropertyKind('faceCSS', { color: 'red' })).toBe('css');
    // nested class objects are not declarations, so they stay JSON
    expect(cssHelpers.facePropertyKind('css', { ':hover': { color: 'red' } })).toBe('json');
    expect(cssHelpers.facePropertyKind('clickRoutine', [])).toBe('json');
    expect(cssHelpers.facePropertyKind('clickRoutine', null)).toBe('json');
    expect(cssHelpers.facePropertyKind('grid', [ { x: 10 } ])).toBe('json');
  });

  test('the face summary lists properties and only short values', () => {
    expect(cssHelpers.faceSummary({})).toBe('no overrides yet - click to add one');
    expect(cssHelpers.faceSummary(5)).toBe('no overrides yet - click to add one');
    expect(cssHelpers.faceSummary({ text: 'back', color: '#cc4422' })).toBe('text: back · color: #cc4422');
    expect(cssHelpers.faceSummary({ image: '/assets/1675039910_1323' })).toBe('image');
    expect(cssHelpers.faceSummary({ css: { color: 'red' }, clickRoutine: [] })).toBe('css · clickRoutine');
  });

  test('a new face property starts from the value the widget itself shows', () => {
    const widget = fakeWidget({ text: 'hello', rotation: 45 }, { color: 'black', image: '' });
    const value = property => cssHelpers.faceNewPropertyValue.call(null, widget, property);
    expect(value('text')).toBe('hello');
    expect(value('rotation')).toBe(45);
    expect(value('color')).toBe('black');
    expect(value('image')).toBe('');
    expect(value('clickRoutine')).toEqual([]); // neither set: falls back to the table
    expect(value('somethingCustom')).toBe('');
  });

  test('the curated inputs read the widget\'s own value, not the shown face\'s', () => {
    // BasicWidget.get() resolves through the active face - a widget of its own
    // "hello" showing a face that overrides text with "back"
    const widget = fakeWidget({ text: 'hello' }, { color: 'black' });
    widget.get = property => property == 'text' ? 'back' : widget.state[property];
    expect(widget.get('text')).toBe('back');
    expect(cssHelpers.widgetOwnValue(widget, 'text')).toBe('hello');
    expect(cssHelpers.widgetOwnValue(widget, 'color')).toBe('black'); // from the defaults
    expect(cssHelpers.widgetOwnValue(widget, 'unset')).toBe(null);
    // a multi-selection has no single widget state to read
    expect(cssHelpers.widgetOwnValue({ isMulti: true, get: _=>'multi' }, 'text')).toBe('multi');
  });

  test('activeFace is normalized before it is compared with a face index', () => {
    expect(cssHelpers.activeFaceIndex({ get: _=>2 })).toBe(2);
    expect(cssHelpers.activeFaceIndex({ get: _=>'1' })).toBe(1);
    expect(cssHelpers.activeFaceIndex({ get: _=>null })).toBe(0);
    expect(cssHelpers.activeFaceIndex({ get: _=>'nonsense' })).toBe(0);
    expect(cssHelpers.activeFaceIndex({ get: _=>-1 })).toBe(0);
  });

  test('removing a face keeps the widget showing the same face', () => {
    const removeFace = (faces, activeFace, index) => {
      let result = null;
      cssHelpers.removeFace.call(null, { get: _=>activeFace }, faces.slice(), index, (newFaces, newActive) => {
        result = { faces: newFaces, activeFace: newActive };
      });
      return result;
    };
    // removing a face before the shown one shifts it down
    expect(removeFace([ 'a', 'b', 'c' ], 1, 0)).toEqual({ faces: [ 'b', 'c' ], activeFace: 0 });
    // removing one after it leaves it alone
    expect(removeFace([ 'a', 'b', 'c' ], 1, 2)).toEqual({ faces: [ 'a', 'b' ], activeFace: 1 });
    // removing the shown one falls back to a face that exists
    expect(removeFace([ 'a', 'b' ], 1, 1)).toEqual({ faces: [ 'a' ], activeFace: 0 });
    expect(removeFace([ 'a', 'b' ], 0, 5)).toBe(null); // out of range: no change
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

describe('deck generator helpers', () => {
  test('parseRankRange expands ranges and ignores list whitespace', () => {
    expect(cssHelpers.parseRankRange('2-10,J,Q,K,A')).toEqual([ 2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A' ]);
    expect(cssHelpers.parseRankRange('2-10, J, Q')).toEqual([ 2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q' ]);
    expect(cssHelpers.parseRankRange('-3--1')).toEqual([ -3, -2, -1 ]);
    expect(cssHelpers.parseRankRange('Sun,Moon')).toEqual([ 'Sun', 'Moon' ]);
  });

  test('parseRankRange drops the empty entries of a half-typed list', () => {
    // a trailing comma would otherwise produce a card type called " of hearts"
    expect(cssHelpers.parseRankRange('2-4,J,')).toEqual([ 2, 3, 4, 'J' ]);
    expect(cssHelpers.parseRankRange('A, ,K')).toEqual([ 'A', 'K' ]);
    expect(cssHelpers.parseRankRange('')).toEqual([]);
    expect(cssHelpers.parseRankRange(',')).toEqual([]);
  });

  test('parseRankRange stops expanding a range that would freeze the editor', () => {
    // a mistyped "2-100000" would otherwise build 100000 ranks per suit on every keystroke
    const huge = cssHelpers.parseRankRange('2-100000');
    expect(huge.length).toBe(200);
    expect(huge[0]).toBe(2);
    expect(huge[199]).toBe(201);
    // the cap is on the whole list, not on the single range
    expect(cssHelpers.parseRankRange('2-201,J').length).toBe(200);
    expect(cssHelpers.parseRankRange('2-201,J')).not.toContain('J');
  });

  test('defaultSuitName uses the readable part of an icon value', () => {
    expect(cssHelpers.defaultSuitName('skoll/hearts')).toBe('hearts');
    expect(cssHelpers.defaultSuitName('casino')).toBe('casino');
    expect(cssHelpers.defaultSuitName('[die_face_6]')).toBe('die_face_6');
    expect(cssHelpers.defaultSuitName('(🎲)')).toBe('🎲');
    expect(cssHelpers.defaultSuitName('/i/game-icons.net/lorc/star.svg')).toBe('star');
    // uploads and links have no readable name, so those suits fall back to a generic one
    expect(cssHelpers.defaultSuitName('/assets/-1234567890')).toBe('');
    expect(cssHelpers.defaultSuitName('https://example.com/hearts.svg')).toBe('');
    expect(cssHelpers.defaultSuitName(null)).toBe('');
  });

  test('court card pictures fall back by suit position, ignoring inherited names', () => {
    expect(cssHelpers.courtSuitLetter('skoll/hearts', 3)).toBe('H');
    expect(cssHelpers.courtSuitLetter('lorc/biohazard', 0)).toBe('D');
    expect(cssHelpers.courtSuitLetter('lorc/biohazard', 5)).toBe('H');
    expect(cssHelpers.courtSuitLetter('constructor', 2)).toBe('C');
  });

  test('the design gallery names what is missing instead of previewing zero cards', () => {
    // a design tile renders a real card, which needs a card type: with no suit or no rank there is none
    expect(cssHelpers.deckGeneratorDesignHint(0, 0)).toBe('Add at least one suit above to see the card designs.');
    expect(cssHelpers.deckGeneratorDesignHint(4, 0)).toBe('Add at least one rank above to see the card designs.');
    expect(cssHelpers.deckGeneratorDesignHint(4, 52)).toBe('52 cards from 4 suits. Pick how they look:');
    expect(cssHelpers.deckGeneratorDesignHint(1, 1)).toBe('1 card from 1 suit. Pick how they look:');
    // and it says so when a rank list hit the cap, so the missing ranks are not a surprise
    expect(cssHelpers.deckGeneratorDesignHint(1, 200, true)).toBe('200 cards from 1 suit. Only the first 200 ranks of a suit are used. Pick how they look:');
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

  test('searchIconIndex lists name matches first and keeps symbols.json order', () => {
    inputHelpers.setIconSearchIndex([
      { value: 'grade',          ...inputHelpers.iconSearchEntry('grade', [ 'star' ]),  image: false },
      { value: 'star',           ...inputHelpers.iconSearchEntry('star', [ 'favorite' ]), image: false },
      { value: 'lorc/star',      ...inputHelpers.iconSearchEntry('star', [ 'shiny' ]),  image: true },
      { value: 'delapouite/sun', ...inputHelpers.iconSearchEntry('sun', [ 'light' ]),   image: true }
    ]);
    // the two icons called "star" come before the one that is only tagged with it, both groups
    // in the order of the index
    expect(inputHelpers.searchIconIndex('star').values).toEqual([ 'star', 'lorc/star', 'grade' ]);
    expect(inputHelpers.searchIconIndex('sun').values).toEqual([ 'delapouite/sun' ]);
    expect(inputHelpers.searchIconIndex('nothing').values).toEqual([]);
  });

  test('searchIconIndex matches names by word but tags only as whole words', () => {
    inputHelpers.setIconSearchIndex([
      { value: 'delapouite/bear-head',  ...inputHelpers.iconSearchEntry('bear-head', [ 'grizzly', 'brown bear' ]),  image: true },
      { value: 'lorc/mantrap',          ...inputHelpers.iconSearchEntry('mantrap', [ 'bear trap', 'snare' ]),       image: true },
      { value: 'delapouite/razor',      ...inputHelpers.iconSearchEntry('razor', [ 'beard', 'shaving' ]),           image: true },
      { value: 'lorc/compass',          ...inputHelpers.iconSearchEntry('compass', [ 'bearing', 'navigation' ]),    image: true },
      { value: 'delapouite/carabiner',  ...inputHelpers.iconSearchEntry('carabiner', [ 'load bearing', 'climbing' ]), image: true },
      { value: 'lorc/tentacles-skull',  ...inputHelpers.iconSearchEntry('tentacles-skull', [ 'cthulhu', 'horror' ]), image: true }
    ]);

    // "beard", "bearing" and "load bearing" describe something else entirely
    expect(inputHelpers.searchIconIndex('bear').values).toEqual([ 'delapouite/bear-head', 'lorc/mantrap' ]);
    // a word of the name still matches from its first letter, so the picker fills in while typing
    expect(inputHelpers.searchIconIndex('bea').values).toEqual([ 'delapouite/bear-head' ]);
    // every term has to match, hyphens in the query separate them like spaces do
    expect(inputHelpers.searchIconIndex('bear trap').values).toEqual([ 'lorc/mantrap' ]);
    expect(inputHelpers.searchIconIndex('bear-trap').values).toEqual([ 'lorc/mantrap' ]);
    // a plural is not a different tag, and not a different name either
    expect(inputHelpers.searchIconIndex('bears').values).toEqual([ 'delapouite/bear-head', 'lorc/mantrap' ]);
    // nothing matches by word: fall back to matching anywhere so a half typed tag finds icons
    expect(inputHelpers.searchIconIndex('cthulh').values).toEqual([ 'lorc/tentacles-skull' ]);
    expect(inputHelpers.searchIconIndex('nonsense').values).toEqual([]);
  });

  test('searchIconIndex matches a name and a tag in either number', () => {
    inputHelpers.setIconSearchIndex([
      { value: 'delapouite/horse-head',   ...inputHelpers.iconSearchEntry('horse-head', [ 'stallion' ]),   image: true },
      { value: 'delapouite/horseshoe',    ...inputHelpers.iconSearchEntry('horseshoe', [ 'luck' ]),        image: true },
      { value: 'lorc/kitchen-knives',     ...inputHelpers.iconSearchEntry('kitchen-knives', [ 'blade' ]),  image: true },
      { value: 'delapouite/hell-crosses', ...inputHelpers.iconSearchEntry('hell-crosses', [ 'grave' ]),    image: true },
      { value: 'lorc/new-shoot',          ...inputHelpers.iconSearchEntry('new-shoot', [ 'sprout' ]),      image: true },
      { value: 'delapouite/newspaper',    ...inputHelpers.iconSearchEntry('newspaper', [ 'news', 'press' ]), image: true }
    ]);

    // the file name is written in one number only, and a tag may not repeat a word of it, so the
    // singular of "horses" has to be matched against the name - stripping the whole "es" made it
    // "hors", which matched nothing, and left only the horseshoe that begins with "horses"
    expect(inputHelpers.searchIconIndex('horses').values).toEqual([ 'delapouite/horse-head', 'delapouite/horseshoe' ]);
    expect(inputHelpers.searchIconIndex('horse').values).toEqual([ 'delapouite/horse-head', 'delapouite/horseshoe' ]);
    // "es" is stripped both ways, because "crosses" is a cross and "horses" a horse
    expect(inputHelpers.searchIconIndex('crosses').values).toEqual([ 'delapouite/hell-crosses' ]);
    expect(inputHelpers.searchIconIndex('cross').values).toEqual([ 'delapouite/hell-crosses' ]);
    // an "s" cannot make every plural
    expect(inputHelpers.searchIconIndex('knife').values).toEqual([ 'lorc/kitchen-knives' ]);
    // "news" is not the plural of "new", so it does not answer with sprouts
    expect(inputHelpers.searchIconIndex('news').values).toEqual([ 'delapouite/newspaper' ]);
    expect(inputHelpers.searchIconIndex('new').values).toEqual([ 'lorc/new-shoot', 'delapouite/newspaper' ]);
  });

  test('searchImageIndex returns image URLs for matching glyphs', () => {
    inputHelpers.setIconSearchIndex([
      { value: 'lorc/dice-six-faces-six', ...inputHelpers.iconSearchEntry('dice-six-faces-six', [ 'six' ]), image: true },
      { value: '🎲', ...inputHelpers.iconSearchEntry('🎲', [ 'dice', 'game' ]), image: true },
      { value: 'casino', ...inputHelpers.iconSearchEntry('casino', [ 'dice' ]), image: false }
    ]);

    expect(inputHelpers.searchImageIndex('dice').values).toEqual([
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
      { value: 'lorc/star', type: 'game-icons', ...inputHelpers.iconSearchEntry('star', []), image: true },
      { value: 'star', type: 'material-symbols', ...inputHelpers.iconSearchEntry('star', []), image: false }
    ]);
    expect(inputHelpers.searchIconIndex('star', 100, new Set([ 'material-symbols' ])).values).toEqual([ 'star' ]);
  });

  test('picker searches show up to 100 results', () => {
    inputHelpers.setIconSearchIndex(Array.from({ length: 101 }, (_, index) => ({
      value: `icons/icon-${index}`,
      ...inputHelpers.iconSearchEntry(`icon-${index}`, []),
      image: true
    })));

    expect(inputHelpers.searchIconIndex('icon').values).toHaveLength(100);
    expect(inputHelpers.searchImageIndex('icon').values).toHaveLength(100);
    // ... and say how many were left out instead of truncating the list silently
    expect(inputHelpers.searchIconIndex('icon').total).toBe(101);
    expect(inputHelpers.searchImageIndex('icon').total).toBe(101);
  });

  test('icon search ranks whole words of the name above the words it only starts', () => {
    inputHelpers.setIconSearchIndex([
      { value: 'lorc/dragonfly',    ...inputHelpers.iconSearchEntry('dragonfly', [ 'insect' ]), image: true },
      { value: 'delapouite/scales', ...inputHelpers.iconSearchEntry('fish-scales', [ 'dragon' ]), image: true },
      { value: 'lorc/dragon-head',  ...inputHelpers.iconSearchEntry('dragon-head', [ 'beast' ]),  image: true }
    ]);
    expect(inputHelpers.searchIconIndex('dragon').values).toEqual([ 'lorc/dragon-head', 'lorc/dragonfly', 'delapouite/scales' ]);
  });

  test('icon search understands accents and both English spellings', () => {
    inputHelpers.setIconSearchIndex([
      { value: 'delapouite/fencer',    ...inputHelpers.iconSearchEntry('fencer', [ 'epee', 'fencing' ]), image: true },
      { value: 'lorc/crossed-sabres',  ...inputHelpers.iconSearchEntry('crossed-sabres', [ 'cavalry' ]), image: true },
      { value: 'lorc/shield',          ...inputHelpers.iconSearchEntry('shield', [ 'defense' ]),         image: true }
    ]);
    // an accented query used to split into the two prefixes "p" and "e" and match at random
    expect(inputHelpers.searchIconIndex('épée').values).toEqual([ 'delapouite/fencer' ]);
    // the tags are US English, a few of the file names are not - both spellings find both
    expect(inputHelpers.searchIconIndex('defence').values).toEqual([ 'lorc/shield' ]);
    expect(inputHelpers.searchIconIndex('saber').values).toEqual([ 'lorc/crossed-sabres' ]);
  });

  test('a query without a single searchable word matches nothing instead of everything', () => {
    const entries = [
      inputHelpers.iconSearchEntry('dragon-head', [ 'beast' ]),
      inputHelpers.iconSearchEntry('shield', [ 'defense' ])
    ];
    // every entry matching every one of zero terms used to unhide the whole picker
    expect(inputHelpers.iconSearchScores(entries, 'меч')).toEqual([ 0, 0 ]);
    expect(inputHelpers.iconSearchScores(entries, '???')).toEqual([ 0, 0 ]);
    // an empty search box is not a search: it shows everything, as it did before
    expect(inputHelpers.iconSearchScores(entries, '   ')).toEqual([ 1, 1 ]);
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

// pickSymbolKeepingOverlay moves the symbol picker next to the dialog it was opened from and reaches for a few
// room globals doing so: build it with a tiny fake DOM, so both outcomes - a picked symbol and a picker that
// fails to load - can be exercised.
function symbolPickerFixture(pickSymbolBehavior) {
  const editor = { children: [] };
  const pickerParent = { children: [] };
  for(const parent of [ editor, pickerParent ])
    parent.appendChild = child => { child.parentNode = parent; parent.children.push(child); };

  const picker = { id: 'symbolPickerOverlay', style: { display: 'none' }, classes: new Set() };
  picker.classList = { add: c => picker.classes.add(c), remove: c => picker.classes.delete(c) };
  pickerParent.appendChild(picker);

  const hostOverlay = { id: 'hostOverlay', style: { display: 'flex' }, parentNode: editor };
  const overlays = { symbolPickerOverlay: picker, hostOverlay };
  // the real one (client/js/main.js) toggles: showing an overlay that is already visible hides it
  const showOverlay = id => {
    for(const [ key, overlay ] of Object.entries(overlays))
      if(key != id)
        overlay.style.display = 'none';
    overlays[id].style.display = overlays[id].style.display !== 'none' ? 'none' : 'flex';
  };

  const alerts = [];
  const pickSymbolKeepingOverlay = new Function('$', 'showOverlay', 'pickSymbol', 'alert', 'console', inputsSource + `;
    return pickSymbolKeepingOverlay;
  `)(_ => picker, showOverlay, _ => pickSymbolBehavior(showOverlay), message => alerts.push(message), { error: _ => null });

  return { picker, pickerParent, hostOverlay, alerts, call: _ => pickSymbolKeepingOverlay({ closest: _ => hostOverlay }) };
}

describe('the symbol picker opened from a dialog', () => {
  test('is parked next to the dialog and gives the dialog back afterwards', async () => {
    const fixture = symbolPickerFixture(showOverlay => {
      expect(fixture.picker.parentNode).not.toBe(fixture.pickerParent);
      expect(fixture.picker.classes.has('symbolPickerAboveEditor')).toBe(true);
      showOverlay('symbolPickerOverlay'); // what pickSymbol does once the picker is loaded - hides the dialog
      return Promise.resolve({ symbol: 'casino' });
    });

    await expect(fixture.call()).resolves.toEqual({ symbol: 'casino' });
    expect(fixture.hostOverlay.style.display).toBe('flex');
    expect(fixture.picker.parentNode).toBe(fixture.pickerParent);
    expect(fixture.picker.classes.size).toBe(0);
  });

  test('leaves the dialog open and says so when it fails to load', async () => {
    // loadSymbolPicker fetches, so pickSymbol can reject before it ever hides the dialog: reopening it then
    // would toggle the still visible dialog off and leave an empty editor behind
    const fixture = symbolPickerFixture(_ => Promise.reject(new Error('fetch failed')));

    await expect(fixture.call()).resolves.toBe(null); // nothing picked, and no error to the global handler
    expect(fixture.alerts).toEqual([ 'The symbol picker could not be loaded. Please try again.' ]);
    expect(fixture.hostOverlay.style.display).toBe('flex');
    expect(fixture.picker.parentNode).toBe(fixture.pickerParent);
    expect(fixture.picker.classes.size).toBe(0);
  });
});
