/**
 * @jest-environment jsdom
 */
import fs from 'fs';
import { validateGameFile } from '../../validator/validate_gamefile.js';

// The routine editor files are plain scripts that the server concatenates into
// the editor bundle, so load them the same way here and provide the handful of
// globals they use from other bundle files.
beforeAll(() => {
  window.$ = (selector, parent) => (parent || document).querySelector(selector);
  window.$a = (selector, parent) => (parent || document).querySelectorAll(selector);
  window.div = (parent, className, html) => {
    const d = document.createElement('div');
    if (className) d.className = className;
    if (html) d.innerHTML = html;
    if (parent) parent.append(d);
    return d;
  };
  window.html = string => String(string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  window.widgets = new Map();
  window.roomID = 'testroom'; // the tutorial links of info popups use it
  window.setSelection = () => {};
  window.closePropertyInfoPopup = () => {}; // the sidebar's own info tips (propertyInputs.js)
  window.editorTypeNames = { basic: 'Widget', button: 'Button', canvas: 'Canvas', card: 'Card', holder: 'Holder', label: 'Label', seat: 'Seat', timer: 'Timer' };
  // the validator tables are part of the editor bundle; the property proposals read them
  window.WIDGET_PROPERTIES = {
    BasicWidget: { id: 1, type: 1, parent: 1, text: 1, clickRoutine: 1 },
    Holder: { id: 1, type: 1, parent: 1, dropTarget: 1, alignChildren: 1 }
  };

  const editorDiv = document.createElement('div');
  editorDiv.id = 'editor';
  document.body.append(editorDiv);

  const files = [
    'client/js/editor/controls/widgetselection.js',
    'client/js/editor/controls/popup.js',
    'client/js/editor/controls/routine.js',
    'client/js/editor/controls/aiRoutine.js',
    'client/js/editor/controls/events.js'
  ];
  const code = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const exposed = [
    'RoutineEditor', 'RoutineOperationEditor', 'IfRoutineOperationEditor', 'ForeachRoutineOperationEditor',
    'VarStringRoutineOperationEditor', 'CommentRoutineOperationEditor', 'UnknownRoutineOperationEditor',
    'editorForOperation', 'routineOperationExamples', 'routineOperationMetadata', 'RoutineVariantMenu',
    'routineOperationVariantChoices', 'operationVariantValues', 'RoutineOperationPopup', 'RoutineClausePopup', 'routineOperationGroups',
    'RoutineHoldersOrCollectionSourcePopup', 'RoutineForeachSourcePopup', 'newRoutineValues', 'escapeHTML',
    'RoutineInputFieldEditor', 'RoutineInputFieldsEditor', 'InputRoutineOperationEditor', 'routineInputFieldMetadata',
    'routineInputFieldChoices', 'RoutineStringListPopup', 'inputFieldVariableName',
    'routineComputeOperations', 'routineComputeGroups', 'routineComputeChoices', 'RoutineComputeOperationPopup',
    'parseVarStatement', 'writeVarStatement', 'encodeVarOperand', 'decodeVarOperand',
    'EventsEditor', 'propertyAutomations', 'AddEventPopup', 'cardDefaultRoutines', 'InfoPopup', 'RoutineStringPopup', 'RoutineNumberPopup', 'RoutinePropertyNamePopup',
    'RoutineColorPopup', 'RoutineIconPopup', 'RoutineSoundPopup', 'RoutineJSONPopup', 'RoutineFullOperationJSONPopup', 'RoutineKeyValuePopup', 'RoutineWidgetIDPopup', 'RoutineEnumMenu',
    'renderWidgetSelectPopout', 'startWidgetPicker', 'stopWidgetPicker', 'isWidgetPickerActive',
    'handleWidgetPickerSelection', 'handleWidgetPickerClick', 'selectWidgetsInRoom', 'widgetPickerTarget', 'endWidgetPickerWithoutTarget',
    'isWidgetPickerChangingSelection', 'closeEditorPopups', 'commonInfoTopic', 'parameterInfoLine', 'templateLead', 'leadLabel', 'infoButton',
    'structureInfoHTML', 'openPopups', 'aiRoutineButton', 'AiRoutinePopup', 'aiValidateRoutine', 'aiChangedOperations',
    'aiRecordResult', 'aiForgetResult'
  ];
  // eval in test scope so the plain-script class declarations see the jsdom globals
  eval(code + '\n' + exposed.map(x => `globalThis['${x}'] = ${x};`).join('\n'));
});

describe('routine operation metadata', () => {
  test('every operation renders an example without leaking template syntax', () => {
    for (const { example } of routineOperationExamples()) {
      expect(example).not.toMatch(/\{[a-zA-Z,]+\}|\[ having|\[,/); // unresolved placeholders or leaked brackets
      expect(example).not.toContain('undefined');
    }
  });

  test('every operation is offered when one is added, each with its name', () => {
    const offered = routineOperationExamples();
    for (const func in routineOperationMetadata)
      expect(offered.map(e => e.func)).toContain(func);
    expect(offered.map(e => e.func)).toEqual(expect.arrayContaining([ 'var', '//' ]));
    for (const { func, example } of offered) {
      expect(typeof func).toBe('string');
      expect(typeof example).toBe('string');
    }
  });

  test('the phrase a sentence starts with tells the ways an operation can work apart', () => {
    for (const func in routineOperationMetadata) {
      const leads = routineOperationVariantChoices({ func }).map(choice => choice.lead);
      expect(new Set(leads).size).toBe(leads.length); // a drop-down with two identical entries picks nothing
      for (const lead of leads) {
        expect(lead.length).toBeGreaterThan(1); // a single character is not a phrase
        expect(lead[0]).toBe(lead[0].toUpperCase());
      }
    }
  });

  test('the lead is the words before the first parameter, without the joining punctuation', () => {
    expect(templateLead('Select widgets: {max} {type}')).toBe('Select widgets: ');
    expect(leadLabel('Select widgets: ')).toBe('Select widgets');
    expect(templateLead('{json}')).toBe('');
  });

  test('every declared parameter is reachable as a chip or by picking another variant', () => {
    for (const func in routineOperationMetadata) {
      const editor = editorForOperation({ func });
      editor.setOperationDetails({ state: {} }, { func }, [], []);
      const referenced = (editor.getTemplate().match(/\{([a-zA-Z0-9,]+)\}/g) || []).flatMap(m => m.slice(1, -1).split(','));
      const offered = editor.clauses().filter(clause => clause.offer !== false)
        .flatMap(clause => editor.templateParameters(clause.template));
      const ignored = editor.ignoredParameters();
      const fixed = editor.currentVariant().fixed || [];
      for (const name in routineOperationMetadata[func].parameters) {
        const spec = routineOperationMetadata[func].parameters[name];
        if (name in ignored)
          expect(referenced).not.toContain(name); // an ignored parameter is neither worded nor offered as an option
        else if (fixed.includes(name))
          expect(routineOperationVariantChoices({ func }).length).toBeGreaterThan(1); // changed by picking another way to work
        else if (spec.deprecated || spec.offer === false)
          // a deprecated parameter (CANVAS canvas) and one the editor writes
          // itself (TIMER seconds) are part of the sentence while a game has
          // them, and are never offered to add to one that has not
          expect(offered).not.toContain(name);
        else
          expect(referenced).toContain(name);
      }
    }
  });

  test('every variant of every operation matches the operation picking it produces', () => {
    for (const func in routineOperationMetadata) {
      for (const variant of routineOperationMetadata[func].variants) {
        const values = operationVariantValues({ func }, variant);
        const operation = { func };
        for (const key in values)
          if (values[key] === undefined)
            delete operation[key];
          else
            operation[key] = values[key];
        const editor = editorForOperation(operation);
        editor.setOperationDetails({ state: {} }, operation, [], []);
        expect(`${func}.${editor.currentVariant().id}`).toBe(`${func}.${variant.id}`);
      }
    }
  });

  test('every operation and every variant is worded, and clauses never repeat a parameter', () => {
    for (const func in routineOperationMetadata) {
      const metadata = routineOperationMetadata[func];
      expect(metadata.variants.length).toBeGreaterThan(0);
      for (const variant of metadata.variants) {
        expect(typeof variant.label).toBe('string');
        expect(variant.template).toBeDefined();
      }
      const editor = editorForOperation({ func });
      editor.setOperationDetails({ state: {} }, { func }, [], []);
      const inVariant = editor.templateParameters(editor.currentVariant().template);
      for (const clause of editor.clauses()) {
        expect(typeof clause.label).toBe('string');
        for (const name of editor.templateParameters(clause.template))
          expect(inVariant).not.toContain(name); // an option never edits what the sentence already shows
      }
    }
  });

  test('properties the engine reads are declared instead of flagged as typos', () => {
    // these were missing from the metadata, so the editor marked them with a red
    // "!" ("the engine ignores it") and offered to delete working game logic
    const engineSupported = { CALL: [ 'collection' ], CANVAS: [ 'count' ], INPUT: [ 'css', 'randomRotation' ], MOVEXY: [ 'z' ] };
    for (const func in engineSupported) {
      for (const name of engineSupported[func]) {
        const operation = { func, [name]: 1 };
        const editor = editorForOperation(operation);
        editor.setOperationDetails({ state: {} }, operation, [], []);
        expect(routineOperationMetadata[func].parameters[name]).toBeDefined();
        expect(editor.unsupportedProperties()).not.toContain(name);
      }
    }
  });

  test('skip is worded on every operation and never offered as an option', () => {
    // the engine honours skip on every operation (220 uses in the library), so
    // the editor may not read it as a typo and offer to delete a working guard
    for (const func of [ 'MOVE', 'SET', 'IF', 'FOREACH', 'INPUT' ]) {
      const operation = { func, skip: '${gameOver}' };
      const editor = editorForOperation(operation);
      editor.setOperationDetails({ state: {} }, operation, [], []);
      expect(editor.unsupportedProperties()).not.toContain('skip');
      expect(editor.clauses().map(c => c.id)).toContain('skip');
      // never in the list of options to add, and never on an operation without one
      expect(editor.clauses().find(c => c.id == 'skip').offer).toBe(false);
      const without = editorForOperation({ func });
      without.setOperationDetails({ state: {} }, { func }, [], []);
      expect(without.clauses().map(c => c.id)).not.toContain('skip');
    }
  });

  test('operations resolve to the right editor', () => {
    expect(editorForOperation({ func: 'MOVE' })).toBeInstanceOf(RoutineOperationEditor);
    expect(editorForOperation({ func: 'IF' })).toBeInstanceOf(IfRoutineOperationEditor);
    expect(editorForOperation({ func: 'FOREACH' })).toBeInstanceOf(ForeachRoutineOperationEditor);
    expect(editorForOperation('var x = 1')).toBeInstanceOf(VarStringRoutineOperationEditor);
    expect(editorForOperation('// hello')).toBeInstanceOf(CommentRoutineOperationEditor);
    expect(editorForOperation({ func: 'BOGUS' })).toBeInstanceOf(UnknownRoutineOperationEditor);
  });
});

describe('operation rendering', () => {
  function renderOperation(operation, variables = [], collections = []) {
    const editor = editorForOperation(operation);
    editor.setOperationDetails({ state: {} }, operation, variables, collections);
    return { editor, dom: editor.render() };
  }

  test('escapes html in parameter values from room state', () => {
    const { dom } = renderOperation({ func: 'MOVE', collection: '<img src=x onerror=alert(1)>' });
    expect(dom.querySelector('img')).toBeNull();
    expect(dom.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  test('the sentence hides default-valued segments and nothing expands into a parameter list', () => {
    const { dom } = renderOperation({ func: 'MOVE', from: 'h1', to: 'h2' });
    expect(dom.querySelector('[data-parameter="face"]')).toBeNull(); // face at its default stays hidden
    expect(dom.querySelector('.routine-editor-view-toggle')).toBeNull();
    expect(dom.querySelector('.routine-editor-parameter-row')).toBeNull();
  });

  test('the operation name is a line of its own above the sentence and changes the operation', () => {
    const { dom } = renderOperation({ func: 'MOVE', from: 'h1', to: 'h2' });
    const body = dom.querySelector('.routine-editor-operation-body');
    expect(body.firstChild.className).toBe('routine-editor-operation-func');
    expect(body.firstChild.textContent).toContain('MOVE');
    expect(body.querySelector('.routine-editor-func-name').dataset.parameter).toBe('func');
    expect(body.children[1].className).toBe('routine-editor-sentence');
    expect(body.children[1].textContent).not.toContain('MOVE'); // the sentence itself speaks English
  });

  test('the sentence of a comment is the note, the // above it says what it is', () => {
    const { dom } = renderOperation('// hello');
    expect(dom.querySelector('.routine-editor-operation-func').textContent).toContain('//');
    expect(dom.querySelector('.routine-editor-sentence').textContent).toBe('hello');
    expect(dom.querySelector('.routine-editor-func-name').dataset.parameter).toBeUndefined();
  });

  test('shows optional segments when their parameter is explicitly set', () => {
    const { dom } = renderOperation({ func: 'MOVE', from: 'h1', to: 'h2', face: 0 });
    expect(dom.querySelector('[data-parameter="face"]')).not.toBeNull();
  });

  test('an ignored parameter is neither in the sentence nor offered as an option', () => {
    const move = editorForOperation({ func: 'MOVE', fillTo: 3, count: 2 });
    move.setOperationDetails({ state: {} }, { func: 'MOVE', fillTo: 3, count: 2 }, [], []);
    expect(move.ignoredParameters().count).toMatch(/top up to/);
    expect(move.clauses().map(clause => clause.id)).not.toContain('count');
    expect(move.render().querySelector('[data-parameter="count"]')).toBeNull();
  });

  test('the sentence leaves out parameters the engine ignores', () => {
    // FLIP flips to the given face, so the cycle direction has no effect
    const flip = renderOperation({ func: 'FLIP', holder: 'h1', face: 1, faceCycle: 'backward' }).dom;
    expect(flip.textContent).toContain('face up');
    expect(flip.querySelector('[data-parameter="faceCycle"]')).toBeNull();

    // the deprecated canvas parameter replaces collection
    const canvas = renderOperation({ func: 'CANVAS', canvas: 'c1', collection: 'stuff' }).dom;
    expect(canvas.querySelector('[data-parameter="canvas"]').textContent).toBe('c1');
    expect(canvas.querySelector('[data-parameter="collection"]')).toBeNull();

    // an explicitly set count is ignored while MOVE fills up to a number
    const move = renderOperation({ func: 'MOVE', from: 'h1', to: 'h2', fillTo: 3, count: 2 }).dom;
    expect(move.querySelector('[data-parameter="count"]')).toBeNull();
  });

  test('a deprecated parameter is editable in the sentence and warns about itself', () => {
    const dom = renderOperation({ func: 'CANVAS', canvas: 'c1' }).dom;
    expect(dom.querySelector('[data-parameter="canvas"]')).not.toBeNull();
    const warning = dom.querySelector('.routine-editor-parameter-warning.deprecated');
    expect(warning).not.toBeNull();
    expect(warning.previousSibling.dataset.parameter).toBe('canvas');
    warning.dispatchEvent(new Event('click'));
    const popup = document.querySelector('.inline-popup');
    expect(popup.textContent).toMatch(/deprecated/);
    expect(popup.textContent).toMatch(/collection/);
    popup.querySelector('.popup-close').dispatchEvent(new Event('click'));
  });

  test('a skip reads as the condition it is and warns that IF replaces it', () => {
    const dom = renderOperation({ func: 'MOVE', from: 'deck', to: 'discard', skip: '${gameOver}' }).dom;
    expect(dom.textContent).toMatch(/1 widget from deck to discard, skipped when gameOver/);
    const warning = dom.querySelector('.routine-editor-parameter-warning.deprecated');
    expect(warning).not.toBeNull();
    expect(warning.previousSibling.dataset.parameter).toBe('skip');
    warning.dispatchEvent(new Event('click'));
    const popup = document.querySelector('.inline-popup');
    expect(popup.textContent).toMatch(/deprecated/);
    expect(popup.textContent).toMatch(/IF/);
    popup.querySelector('.popup-close').dispatchEvent(new Event('click'));
  });

  test('what a SELECT compares to keeps the type the engine compares with', () => {
    // the engine uses ===, so "0" matches nothing where 0 was meant - and "is one
    // of" needs a list, which text could not hold at all
    expect(routineOperationMetadata.SELECT.parameters.value.type).toBe('json');
    const editor = editorForOperation({ func: 'SELECT', property: 'activeFace', value: 0 });
    expect(editor.createPopup([ 'value' ])).toBeInstanceOf(RoutineJSONPopup);
  });

  test('how many MOVE moves is what the engine reads it as', () => {
    // the engine dispatches on the value of from, not on whether it is there:
    // with from empty it moves all the picked widgets, whatever the sentence says
    const words = operation => {
      const editor = editorForOperation(operation);
      editor.setOperationDetails({ state: {} }, operation, [], []);
      return editor.render().querySelector('.routine-editor-sentence').textContent;
    };
    expect(words({ func: 'MOVE', from: null, to: 'h1' })).toMatch(/all widgets from holder to h1/);
    expect(words({ func: 'MOVE', from: 'deck', to: 'h1' })).toMatch(/1 widget from deck to h1/);
    // switching back to "from a holder" writes the 1 down instead of leaving the
    // sentence and the engine to disagree about it
    const switched = routineOperationVariantChoices({ func: 'MOVE', collection: 'DEFAULT', to: 'h1' }).find(c => c.id == 'from');
    expect(switched.values.count).toBe(1);
    expect(switched.example).toMatch(/Move 1 widget/);
  });

  test('a custom property whose name is not a bare word is still a chip', () => {
    const operation = { func: 'SET', property: 'x', value: 1, 'my-flag': 3 };
    const { editor, dom } = renderOperation(operation);
    expect(editor.unsupportedProperties()).toContain('my-flag');
    expect(dom.querySelector('[data-parameter="my-flag"]')).not.toBeNull();
    expect(dom.querySelector('.routine-editor-parameter-warning.unsupported')).not.toBeNull();
  });

  test('CANVAS marks collection as ignored while canvas is set', () => {
    const canvas = editorForOperation({ func: 'CANVAS', canvas: 'c1' });
    canvas.setOperationDetails({ state: {} }, { func: 'CANVAS', canvas: 'c1' }, [], []);
    expect(canvas.ignoredParameters().collection).toMatch(/deprecated canvas/);
    expect(editorForOperation({ func: 'CANVAS' }).ignoredParameters().collection).toBeUndefined();
  });

  test('a widget parameter marks the collection it replaces as ignored', () => {
    // the engine checks holder/label/timer/from first and never looks at collection then
    const replaced = { COUNT: 'holder', FLIP: 'holder', LABEL: 'label', MOVE: 'from', ROTATE: 'holder', SHUFFLE: 'holder', SORT: 'holder', TIMER: 'timer' };
    for(const func in replaced) {
      const operation = { func, [replaced[func]]: 'w1', collection: 'stuff' };
      const editor = editorForOperation(operation);
      editor.setOperationDetails({ state: {} }, operation, [], []);
      expect(editor.ignoredParameters().collection).toMatch(new RegExp(replaced[func]));
      expect(editorForOperation({ func }).ignoredParameters().collection).toBeUndefined();
    }
  });

  test('FLIP marks face as ignored while the cycle picks a random one', () => {
    const ignoredFor = operation => {
      const editor = editorForOperation(operation);
      editor.setOperationDetails({ state: {} }, operation, [], []);
      return editor.ignoredParameters();
    };
    expect(ignoredFor({ func: 'FLIP', faceCycle: 'random' }).face).toMatch(/random/);
    expect(ignoredFor({ func: 'FLIP', faceCycle: 'forward' }).face).toBeUndefined();
    // an explicit face wins over the cycle, so then the cycle is the ignored one
    const bothSet = ignoredFor({ func: 'FLIP', face: 1, faceCycle: 'random' });
    expect(bothSet.faceCycle).toMatch(/target face/);
    expect(bothSet.face).toBeUndefined();
  });

  test('parameters the mode of the operation does not read are marked as ignored', () => {
    const ignoredFor = operation => {
      const editor = editorForOperation(operation);
      editor.setOperationDetails({ state: {} }, operation, [], []);
      return editor.ignoredParameters();
    };
    // { operation: [ names that have no effect, names that do ] }
    const cases = [
      [ { func: 'AUDIO', silence: true }, [ 'source', 'maxVolume', 'length', 'count' ], [ 'player' ] ],
      [ { func: 'CANVAS', mode: 'reset' }, [ 'x', 'y', 'color', 'value' ], [] ],
      [ { func: 'CANVAS', mode: 'setPixel' }, [ 'color' ], [ 'x', 'y', 'value' ] ],
      [ { func: 'CANVAS', mode: 'change' }, [ 'x', 'y' ], [ 'color', 'value' ] ],
      [ { func: 'CANVAS', mode: 'inc' }, [ 'x', 'y', 'color' ], [ 'value' ] ],
      [ { func: 'FOREACH', in: { a: 1 }, range: 3, collection: 'stuff' }, [ 'range', 'collection' ], [ 'in' ] ],
      [ { func: 'FOREACH', range: 3, collection: 'stuff' }, [ 'collection' ], [ 'range' ] ],
      [ { func: 'GET', aggregation: 'sum' }, [ 'skipMissing' ], [ 'property' ] ],
      [ { func: 'GET', aggregation: 'array' }, [], [ 'skipMissing' ] ],
      [ { func: 'SET', relation: '!' }, [ 'value' ], [ 'property' ] ],
      [ { func: 'SHUFFLE', mode: 'reverse' }, [ 'modeValue' ], [] ],
      [ { func: 'SHUFFLE', mode: 'seeded' }, [], [ 'modeValue' ] ],
      [ { func: 'SORT', holder: 'h1' }, [ 'rearrange' ], [ 'key' ] ],
      [ { func: 'SORT', collection: 'stuff' }, [], [ 'rearrange' ] ],
      [ { func: 'TURN', turnCycle: 'random' }, [ 'turn' ], [ 'source' ] ]
    ];
    for(const [ operation, ignored, used ] of cases) {
      const result = ignoredFor(operation);
      for(const name of ignored)
        expect([ operation.func, name, result[name] ]).toEqual([ operation.func, name, expect.stringContaining('ignored because') ]);
      for(const name of used)
        expect([ operation.func, name, result[name] ]).toEqual([ operation.func, name, undefined ]);
    }
  });

  test('a 0 that means "unset" is marked as ignored, an unset parameter is not', () => {
    const ignoredFor = operation => {
      const editor = editorForOperation(operation);
      editor.setOperationDetails({ state: {} }, operation, [], []);
      return editor.ignoredParameters();
    };
    // the engine reads these with `a.x || fallback`, so 0 does exactly nothing
    const zeroMeansUnset = { CANVAS: 'count', MOVE: 'fillTo', MOVEXY: 'z', TIMER: 'seconds' };
    for(const func in zeroMeansUnset) {
      const name = zeroMeansUnset[func];
      const operation = func == 'TIMER' ? { func, mode: 'set' } : { func };
      expect(ignoredFor(Object.assign({}, operation, { [name]: 0 }))[name]).toMatch(/0/);
      expect(ignoredFor(Object.assign({}, operation, { [name]: 2 }))[name]).toBeUndefined();
      expect(ignoredFor(operation)[name]).toBeUndefined(); // not set at all is not a mistake
    }
  });

  test('the sentence shows custom properties the operation does not support', () => {
    const { dom } = renderOperation({ func: 'FLIP', typo: 3, holder: 'h1' });
    expect(dom.querySelector('[data-parameter="typo"]').textContent).toBe('3');
    const warning = dom.querySelector('.routine-editor-parameter-warning.unsupported');
    expect(warning).not.toBeNull();
    warning.dispatchEvent(new Event('click'));
    const popup = document.querySelector('.inline-popup');
    expect(popup.textContent).toContain('FLIP does not support the property typo');
    popup.querySelector('.popup-close').dispatchEvent(new Event('click'));
    // and it has the x every other option has, so a typo can be removed
    expect([...dom.querySelectorAll('.routine-editor-clause-remove')].map(r => r.dataset.clause)).toContain('typo');
  });

  test('nested routines are not reported as unsupported properties', () => {
    const properties = operation => {
      const editor = editorForOperation(operation);
      editor.setOperationDetails({ state: {} }, operation, [], []);
      return editor.unsupportedProperties();
    };
    expect(properties({ func: 'IF', thenRoutine: [], elseRoutine: [] })).toEqual([]);
    expect(properties({ func: 'FOREACH', loopRoutine: [] })).toEqual([]);
    expect(properties({ func: 'FOREACH', loopRoutine: [], typo: 1 })).toEqual([ 'typo' ]);
    expect(properties('// a comment')).toEqual([]);
    expect(properties({ func: 'NOSUCHOPERATION', whatever: 1 })).toEqual([]);
  });

  test('a custom property opens as JSON so its shape survives editing', () => {
    const editor = editorForOperation({ func: 'FLIP', typo: { a: 1 } });
    editor.setOperationDetails({ state: {} }, { func: 'FLIP', typo: { a: 1 } }, [], []);
    expect(editor.createPopup([ 'typo' ]) instanceof RoutineJSONPopup).toBe(true);
  });

  test('IF ignores the operands when a custom condition is set', () => {
    const ifOp = editorForOperation({ func: 'IF', condition: '${x}', operand1: 1 });
    ifOp.setOperationDetails({ state: {} }, { func: 'IF', condition: '${x}', operand1: 1 }, [], []);
    expect(Object.keys(ifOp.ignoredParameters())).toEqual([ 'operand1', 'relation', 'operand2' ]);
  });

  test('every operation offers a raw-JSON button', () => {
    expect(renderOperation({ func: 'MOVE', from: 'h1' }).dom.querySelector('.routine-editor-operation-json')).not.toBeNull();
    expect(renderOperation('// a note').dom.querySelector('.routine-editor-operation-json')).toBeNull(); // a string has no JSON of its own
  });

  test('the sentence follows the way the operation works', () => {
    const template = operation => {
      const editor = editorForOperation(operation);
      editor.setOperationDetails({ state: {} }, operation, [], []);
      return editor.getTemplate();
    };
    expect(template({ func: 'FLIP', faceCycle: 'random' })).toContain('Cycle the face of');
    expect(template({ func: 'FLIP', face: 0 })).toContain('Turn[ {count} of] {holder,collection} {face}');
    expect(template({ func: 'FLIP', face: 3 })).toContain('to face {face}');
    // the deprecated canvas is the option that swaps the collection for it, so
    // the template holds both: the words it adds and the ones it replaces
    expect(template({ func: 'CANVAS', canvas: 'c1' })).toContain('Clear[ {canvas}] {collection}');
    expect(template({ func: 'CANVAS' })).toContain('Clear[ {canvas}] {collection}');
    expect(template({ func: 'CANVAS', mode: 'setPixel' })).toContain('({x}, {y})');
    expect(template({ func: 'CANVAS', mode: 'change' })).toContain('to {color}');
    expect(template({ func: 'AUDIO', silence: true })).toContain('Stop all sounds');
    expect(template({ func: 'SET', relation: '!' })).toContain('Toggle {property}');
    expect(template({ func: 'MOVE', fillTo: 3 })).toContain('until it holds {fillTo}');
    expect(template({ func: 'SELECT', mode: 'add' })).toContain('Add to the pick');
    expect(template({ func: 'SELECT' })).toContain('Pick');
    expect(template({ func: 'TIMER', mode: 'inc', seconds: 5 })).toContain('{seconds} seconds');
    expect(template({ func: 'TIMER' })).toContain('Toggle on/off');
    expect(template({ func: 'SHUFFLE', mode: 'reverse' })).toContain('Shuffle {holder,collection}[ {mode}]');
    expect(template({ func: 'SHUFFLE', mode: 'riffle' })).toContain('[ {mode}, {modeValue} time]');
    expect(template({ func: 'TURN', turnCycle: 'random' })).toContain('a random seat');
    expect(template({ func: 'LABEL', label: 'l1' })).toContain('{label,collection}');
    expect(template({ func: 'LABEL', mode: 'append' })).toContain('Append {value}');
  });

  test('classifies parameter chips for color coding', () => {
    const { dom } = renderOperation({ func: 'SELECT', value: '${myVar}', collection: 'stuff', property: 'owner' });
    expect(dom.querySelector('.routine-editor-parameter-variable')).not.toBeNull();
    expect(dom.querySelector('.routine-editor-parameter-collection')).not.toBeNull();
    expect(dom.querySelector('.routine-editor-parameter-property')).not.toBeNull();
    const { dom: move } = renderOperation({ func: 'MOVE', from: 'h1', to: '${PROPERTY parent}', count: 2 });
    expect(move.querySelector('.routine-editor-parameter-widget')).not.toBeNull();
    expect(move.querySelector('.routine-editor-parameter-number')).not.toBeNull();
    // a value read from a widget is a property, not a variable that happens to look like one
    expect(move.querySelector('[data-parameter="to"]').classList.contains('routine-editor-parameter-property')).toBe(true);
  });

  test('shows verbose labels for predefined variables', () => {
    const { editor } = renderOperation({ func: 'AUDIO', player: '${playerName}' });
    expect(editor.getDisplayedValue('player')).toBe('player clicking the widget');
  });

  test('IF switches between condition and operand templates', () => {
    const { editor: operandIf } = renderOperation({ func: 'IF', operand1: 1 });
    expect(operandIf.getTemplate()).toContain('{operand1} {relation} {operand2}');
    const { editor: conditionIf } = renderOperation({ func: 'IF', condition: '${x}' });
    expect(conditionIf.getTemplate()).toContain('{condition}');
  });

  test('IF renders THEN editor and an add-ELSE button', () => {
    const { dom } = renderOperation({ func: 'IF', operand1: 1, thenRoutine: [ { func: 'FLIP' } ] });
    expect(dom.querySelector('.routine-editor')).not.toBeNull();
    expect(dom.querySelector('.routine-editor-add-else')).not.toBeNull();
  });

  test('rendering IF does not add routine arrays to the operation', () => {
    const operation = { func: 'IF', operand1: 1 };
    renderOperation(operation);
    expect(operation.thenRoutine).toBeUndefined();
  });

  test('var statements render and rebuild correctly', () => {
    const { editor } = renderOperation('var x = 1');
    expect(editor.getDisplayedValue('variable')).toBe('x');
    expect(editor.getDisplayedValue('x')).toBe('1');
    let result = null;
    editor.registerChangeListener(v => result = v);
    editor.onNewValue({ variable: 'y' });
    expect(result).toBe('var y = 1');
  });

  test('complex var statements fall back to raw editing', () => {
    // the arithmetic the engine falls back to eval for: rewriting it would
    // change which code path it takes, so it keeps its text
    const { editor } = renderOperation('var $dynamic.${key} = 1 + 2');
    expect(editor.getTemplate()).toBe('{statement}');
    const { editor: raw } = renderOperation('var x'); // no " = ", unrepresentable
    expect(raw.getTemplate()).toBe('{statement}');
  });

  // the wording of the whole catalog in one place: operations taken from the
  // games in library/games, each with the sentence it has to read as. Defaults
  // that mean "not in use" stay out of it, enums and yes/no values are words,
  // and the name of the operation never turns up in its own sentence.
  test.each([
    [ { func: 'SET', collection: [ 'playHolder1' ], property: 'pause', value: true }, 'Set pause of playHolder1 to true' ],
    [ { func: 'SET', property: 'lastOwner', value: null }, 'Set lastOwner of the picked widgets to null' ],
    // the six ways a SET can work, each as the catalog words it
    [ { func: 'SET', property: 'rotation', value: 90 }, 'Set rotation of the picked widgets to 90' ],
    [ { func: 'SET', property: 'score', collection: 'myPick', value: 0 }, 'Set score of the widgets called myPick to 0' ],
    [ { func: 'SET', property: 'value', relation: '+', value: 1 }, 'Increase value of the picked widgets by 1' ],
    [ { func: 'SET', property: 'value', relation: '-', value: 1 }, 'Decrease value of the picked widgets by 1' ],
    [ { func: 'SET', property: 'x', relation: '*', value: 2 }, 'Multiply x of the picked widgets by 2' ],
    [ { func: 'SET', property: 'clickable', relation: '!' }, 'Toggle clickable of the picked widgets' ],
    [ { func: 'SET', property: 'text', relation: '+', value: ' (used)' }, 'Append " (used)" to text of the picked widgets' ],
    [ { func: 'SELECT', property: 'cardType', value: 'ace' }, 'Pick widgets where cardType is ace' ],
    // the condition is always part of a SELECT: the engine filters by it either
    // way, and its defaults mean "the widgets lying on the table"
    [ { func: 'SELECT', type: 'card', max: 5, random: true, source: 'hand', sortBy: 'value', collection: 'aces' },
      'Pick at most 5 random cards from the pick called hand where parent is nothing, sorted by value — call them aces' ],
    [ { func: 'SELECT', mode: 'add', property: 'letter', value: '${value}', collection: 'letters' },
      'Add to the pick called letters: widgets where letter is value' ],
    [ { func: 'IF', operand1: '${cardType}', operand2: 'boba' }, 'If cardType is boba' ],
    [ { func: 'IF', condition: '${showLog}' }, 'If this is true: showLog' ],
    [ { func: 'GET', property: 'cardType' }, 'Read the first cardType of the picked widgets' ],
    [ { func: 'GET', property: 'score', aggregation: 'sum', variable: 'total' }, 'Add up score of the picked widgets and remember it as total' ],
    [ { func: 'CALL', routine: 'startRandomRoutine' }, 'Run the routine startRandomRoutine' ],
    [ { func: 'CALL', routine: 'dealRoutine', widget: 'deck1', arguments: { count: 5 } }, 'Run the routine dealRoutine of deck1, passing count: 5' ],
    [ { func: 'MOVE', from: 'deck1', to: 'hand1' }, 'Move 1 widget from deck1 to hand1' ],
    [ { func: 'MOVE', to: 'discard' }, 'Move the picked widgets to discard' ],
    [ { func: 'MOVE', to: 'discard', count: 3 }, 'Move 3 of the picked widgets to discard' ],
    [ { func: 'MOVE', to: 'discard', collection: 'aces' }, 'Move the widgets called aces to discard' ],
    [ { func: 'MOVE', from: 'deck1', to: 'hand1', fillTo: 7 }, 'Move widgets from deck1 to hand1 until it holds 7' ],
    [ { func: 'MOVE', from: 'deck1', to: 'hand1', count: -2, face: 2 }, 'Move all but 2 widgets from deck1 to hand1 and turn them to face 2' ],
    [ { func: 'COUNT' }, 'Count the picked widgets' ],
    [ { func: 'COUNT', holder: 'hand1', variable: 'cards' }, 'Count what is in hand1 and remember it as cards' ],
    [ { func: 'FLIP', holder: 'deck1', face: 0 }, 'Turn all widgets in deck1 face down' ],
    [ { func: 'FLIP', holder: 'deck1', face: 1, count: 3 }, 'Turn 3 widgets in deck1 face up' ],
    [ { func: 'FLIP', collection: 'aces', face: 2 }, 'Turn aces to face 2' ],
    [ { func: 'FLIP', faceCycle: 'backward' }, 'Cycle the face of the picked widgets backward' ],
    [ { func: 'FLIP', faceCycle: 'random', count: 2 }, 'Cycle the face of 2 of the picked widgets to a random face' ],
    [ { func: 'CLICK', collection: 'myPick', count: 2, mode: 'ignoreClickRoutine' }, 'Click the widgets called myPick, 2 times, but do not run their click routines' ],
    [ { func: 'RECALL', holder: 'deck1' }, 'Gather all the cards back into deck1' ],
    [ { func: 'RECALL', holder: 'deck1', owned: false }, 'Gather all the cards back into deck1, except the cards players hold' ],
    [ { func: 'SHUFFLE', holder: 'deck1' }, 'Shuffle deck1' ],
    // the technique is an option of the one sentence, and it brings what it needs
    [ { func: 'SHUFFLE', holder: 'deck1', mode: 'overhand', modeValue: 3 }, 'Shuffle deck1 overhand, 3 times' ],
    [ { func: 'SHUFFLE', holder: 'deck1', mode: 'reverse' }, 'Shuffle deck1 by reversing the order' ],
    [ { func: 'SHUFFLE', holder: 'deck1', mode: 'seeded', modeValue: 7 }, 'Shuffle deck1 the same way every time with the seed 7' ],
    [ { func: 'SORT', holder: 'deck1' }, 'Sort deck1' ],
    [ { func: 'SORT', holder: 'deck1', key: 'value', reverse: true }, 'Sort deck1 by value, biggest first' ],
    [ { func: 'TURN' }, 'Pass the turn on' ],
    [ { func: 'TURN', turnCycle: 'random' }, 'Give the turn to a random seat' ],
    [ { func: 'DELETE' }, 'Delete the picked widgets' ],
    [ { func: 'CLONE', count: 3, properties: { owner: 'red' }, collection: 'newCards' },
      'Make 3 copies of the picked widgets, and set owner: red on them — call the copies newCards' ],
    [ { func: 'RESET' }, 'Reset every widget to its saved starting state' ],
    [ { func: 'TIMER', timer: 'clock1', mode: 'inc', seconds: 10 }, 'Add 10 seconds to the timer clock1' ],
    [ { func: 'SCORE', seats: 'seat1', mode: 'inc', round: 2, value: 1 }, 'Add 1 to score of seat1 in round 2' ],
    [ { func: 'AUDIO', source: 'click.mp3' }, 'Play the sound click.mp3' ],
    [ { func: 'AUDIO', source: 'click.mp3', maxVolume: 0.5 }, 'Play the sound click.mp3 at 50% volume' ],
    [ { func: 'SWAPHANDS' }, 'Pass every hand on to the next seat' ],
    [ { func: 'INPUT', fields: [ {}, {}, {} ], header: 'Choose a card' }, 'Ask the player "Choose a card" to fill in 3 fields' ],
    // a dialog with nothing to fill in is a question, and the sentence says so
    [ { func: 'INPUT', header: 'Are you sure?', cancelButtonText: 'No' }, 'Ask the player "Are you sure?", canceling with "No"' ],
    [ { func: 'INPUT', player: [ 'red', 'blue' ], fields: [ {} ], block: true }, 'Ask the players red and blue at once to fill in 1 field, holding everybody else up until it is answered' ],
    [ { func: 'UPLOAD' }, 'Ask the player for a file' ],
    [ { func: 'FOREACH', range: [ 1, 10 ] }, 'For each number in the range 1 to 10, do the operations below' ],
    [ { func: 'FOREACH' }, 'For each of the picked widgets, do the operations below' ],
    [ { func: 'FOREACH', 'in': [ 'a', 'b' ] }, 'For each entry in a and b, do the operations below' ],
    [ { func: 'LABEL', label: 'score1', mode: 'inc', value: 5 }, 'Increase the text of score1 by 5' ]
  ])('%j reads as its sentence', (operation, sentence) => {
    const { dom } = renderOperation(operation);
    const rendered = dom.querySelector('.routine-editor-sentence').cloneNode(true);
    for (const icon of rendered.querySelectorAll('.material-symbols, .routine-editor-add-clause'))
      icon.remove();
    expect(rendered.textContent.replace(/\s+/g, ' ').trim()).toBe(sentence);
    expect(rendered.textContent).not.toContain(operation.func);
  });

  test('unknown operations are edited as whole JSON', () => {
    const { editor } = renderOperation({ func: 'BOGUS', foo: 1 });
    let result = null;
    editor.registerChangeListener(v => result = v);
    editor.onNewValue({ func: 'CLICK' });
    expect(result).toEqual({ func: 'CLICK' });
    expect(result.json).toBeUndefined();
  });
});

describe('picking how an operation works and which options it uses', () => {
  function renderOperation(operation) {
    const editor = editorForOperation(operation);
    editor.setOperationDetails({ state: {} }, operation, [], []);
    const dom = editor.render();
    document.getElementById('editor').append(dom);
    return { editor, dom };
  }

  test('a blank says what kind of value belongs there, in red', () => {
    const { dom } = renderOperation({ func: 'SET', property: '', value: '' });
    const blanks = [...dom.querySelectorAll('.routine-editor-parameter-missing')];
    expect(blanks.map(b => b.textContent)).toEqual([ 'property', 'number or text' ]);
    // what the operation does can word it better than the type of the parameter
    expect(renderOperation({ func: 'SET', relation: '+', property: '' }).dom.textContent).toContain('property of the picked widgets by number');
    expect(renderOperation({ func: 'SET', relation: '+', property: '', value: '' }).dom.textContent).toContain('"text" to property of the picked widgets');
    // a list with nothing in it is a blank as well: an UPLOAD that accepts no
    // file type at all has nothing to say, and "0 types" is not what it reads
    expect(renderOperation({ func: 'CALL', arguments: {} }).dom.textContent).toContain('nothing');
    // an INPUT with nothing to fill in yet says so in the list of its lines
    // rather than as a blank in the sentence
    expect(renderOperation({ func: 'INPUT', fields: [] }).dom.querySelector('.routine-editor-parameter-missing')).toBeNull();
    expect(renderOperation({ func: 'INPUT', fields: [] }).dom.textContent).toContain('Nothing to fill in yet');
    // a widget parameter says which kind of widget it wants
    expect(renderOperation({ func: 'MOVE', from: 'deck1' }).dom.textContent).toContain('from deck1 to holder');
    // and a value that has a wording of its own is not a blank
    expect(renderOperation({ func: 'SELECT', property: 'parent' }).dom.querySelector('.routine-editor-parameter-missing')).toBeNull();
  });

  test('the widgets a SET changes are words until the option names a group', () => {
    const withoutCollection = renderOperation({ func: 'SET', property: 'x', value: 1 }).dom;
    expect(withoutCollection.textContent).toContain('of the picked widgets');
    expect(withoutCollection.querySelector('[data-parameter="collection"]')).toBeNull();
    const { editor, dom } = renderOperation({ func: 'SET', property: 'x', value: 1, collection: 'myPick' });
    expect(dom.textContent).toContain('of the widgets called myPick');
    // and the x behind it goes back to the picked widgets
    let result = null;
    editor.registerChangeListener(v => result = v);
    dom.querySelector('.routine-editor-clause-remove').dispatchEvent(new Event('click'));
    expect(result.collection).toBeUndefined();
    // an explicit DEFAULT means the picked widgets as well, so it reads as them
    expect(renderOperation({ func: 'SET', property: 'x', value: 1, collection: 'DEFAULT' }).dom.textContent).toContain('of the picked widgets');
  });

  test('the sentence reads as the variant the operation matches', () => {
    expect(renderOperation({ func: 'SET', relation: '+', property: 'x' }).dom.textContent).toContain('x of the picked widgets by');
    expect(renderOperation({ func: 'SET', property: 'x' }).dom.textContent).toContain('x of the picked widgets to');
    expect(renderOperation({ func: 'FLIP', faceCycle: 'backward' }).dom.textContent).toContain('Cycle the face of');
  });

  // the order of https://agent.virtualtabletop.io/reports/routine-grammar/ - the
  // phrasing games write most often is the first entry, not the last one
  test('the drop-down offers the ways to work in the order of the grammar catalog', () => {
    const leads = func => routineOperationVariantChoices({ func }).map(c => c.lead);
    expect(leads('SET')).toEqual([ 'Set', 'Increase', 'Decrease', 'Multiply', 'Divide', 'Toggle', 'Append' ]);
    expect(leads('SELECT')[0]).toBe('Pick');
    expect(leads('SCORE')[0]).toBe('Set');
    expect(leads('TURN')).toEqual([ 'Pass the turn on', 'Pass the turn back', 'Give the turn to a random seat', 'Give the turn to the seat at position', 'Give the turn to the seat' ]);
    expect(leads('GET')[0]).toBe('Read the first');
    // and an operation that does one thing however it goes about it (SHUFFLE
    // shuffles, the technique is an option) has no drop-down at all
    expect(leads('SHUFFLE')).toEqual([]);
    // and the one an operation without a discriminating parameter reads as is
    // still the one without a match(), wherever the list puts it
    for (const func in routineOperationMetadata) {
      const editor = editorForOperation({ func });
      editor.setOperationDetails({ state: {} }, { func }, [], []);
      const variants = routineOperationMetadata[func].variants;
      const fallback = variants.find(variant => !variant.match);
      if (fallback)
        expect(`${func}.${editor.currentVariant().id}`).toBe(`${func}.${fallback.id}`);
    }
  });

  test('the phrase the sentence starts with offers the other ways it can work', () => {
    const operation = { func: 'FLIP', holder: 'deck1' };
    const choices = routineOperationVariantChoices(operation);
    expect(choices.map(c => c.lead)).toEqual([ 'Turn', 'Cycle the face of' ]);
    expect(choices[0].example).toContain('deck1');
    expect(choices[0].example).toContain('Turn all widgets in deck1 face down');
    // where two ways of working start with the same word, what they are called
    // tells them apart instead
    expect(routineOperationVariantChoices({ func: 'MOVE', from: 'deck1' }).map(c => c.lead))
      .toEqual([ 'Move widgets from a holder', 'Move the picked widgets' ]);
    // operations with only one way to work offer nothing to pick
    expect(routineOperationVariantChoices({ func: 'DELAY' })).toEqual([]);
  });

  test('the sentence starts with a drop-down of the ways to work, plain text when there is one', () => {
    const flip = renderOperation({ func: 'FLIP', holder: 'deck1', face: 0 }).dom;
    const lead = flip.querySelector('.routine-editor-variant');
    expect(lead.childNodes[0].textContent).toBe('Turn');
    expect(lead.classList.contains('routine-editor-variant-menu')).toBe(true);
    const delay = renderOperation({ func: 'DELAY' }).dom;
    expect(delay.querySelector('.routine-editor-variant').textContent).toBe('Wait for');
    expect(delay.querySelector('.routine-editor-variant-menu')).toBeNull();
  });

  test('the drop-down picks another way to work without a popup around it', async () => {
    const { editor, dom } = renderOperation({ func: 'FLIP', holder: 'deck1', face: 0 });
    let result = null;
    editor.registerChangeListener(v => result = v);
    dom.querySelector('.routine-editor-variant-menu').dispatchEvent(new Event('click'));
    const menu = document.querySelector('.inline-popup.popup-menu');
    expect(menu).not.toBeNull();
    expect(menu.querySelector('h1').textContent).toContain('What FLIP does'); // a menu, but one that says what it is for
    expect(menu.querySelector('.popup-close')).not.toBeNull(); // but it can be closed like every other popup
    const entryLabels = [...menu.querySelectorAll('.popup-menu-entry-label')].map(e => e.textContent);
    expect(entryLabels).toEqual([ 'Turn', 'Cycle the face of' ]);
    // nothing but the phrases: it is the expander of the field the sentence
    // starts with, and the sentence each phrase produces is a hover away
    expect(menu.querySelector('.popup-menu-entry-preview')).toBeNull();
    expect(menu.querySelector('.popup-menu-entry').title).toContain('deck1');
    expect(menu.querySelector('button.selected .popup-menu-entry-label').textContent).toBe('Turn');
    [...menu.querySelectorAll('.popup-menu-entry')].find(b => b.textContent.startsWith('Cycle')).dispatchEvent(new Event('click'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(result.face).toBeUndefined();
  });

  test('picking another way to work rewrites exactly the parameters that tell them apart', () => {
    const operation = { func: 'FLIP', holder: 'deck1', faceCycle: 'backward' };
    const turn = routineOperationVariantChoices(operation).find(c => c.id == 'turn');
    expect(turn.values).toEqual({ func: 'FLIP', holder: 'deck1', faceCycle: undefined, face: 0 });
  });

  // a ${...} may sit in any property of an operation, the ones that decide what
  // it does included - the engine resolves them all before the operation runs
  test('a way of working the routine only works out is not stated as a fact', () => {
    const { editor, dom } = renderOperation({ func: 'TURN', turnCycle: '${PROPERTY faceCycle}' });
    expect(editor.undeterminedBy()).toEqual([ 'turnCycle' ]);
    // the sentence still reads as one of the ways, and says that it is a guess
    expect(dom.querySelector('.routine-editor-variant').classList.contains('routine-editor-variant-undetermined')).toBe(true);
    expect(dom.querySelector('.routine-editor-parameter-warning.undetermined')).not.toBeNull();
    // and what it guessed from is in the sentence instead of nowhere at all
    expect(dom.querySelector('[data-parameter="turnCycle"]').textContent).toBe('${PROPERTY faceCycle}');
  });

  test('a value worked out while the routine runs never hides another one', () => {
    // silence stops the audio instead of playing it - but only when it comes out
    // as yes, so the sound is still what this operation may play
    const { editor, dom } = renderOperation({ func: 'AUDIO', source: 'ding.mp3', silence: '${stop}' });
    expect(editor.ignoredParameters()).toEqual({});
    expect(dom.textContent).toContain('ding.mp3');
    expect(editor.undeterminedBy()).toEqual([ 'silence' ]);
    // with a value the editor can read, the parameters the engine skips stay out
    expect(renderOperation({ func: 'AUDIO', source: 'ding.mp3', silence: true }).dom.textContent).not.toContain('ding.mp3');
  });

  test('what a value is compared to decides whether it can be told apart', () => {
    const undetermined = operation => renderOperation(operation).editor.undeterminedBy();
    // the truthiness trap: every ${...} is a truthy string, so testing it as one
    // answers about the syntax rather than about the value
    expect(undetermined({ func: 'AUDIO', source: 'ding.mp3', silence: '${stop}' })).toEqual([ 'silence' ]);
    expect(undetermined({ func: 'SET', property: 'x', relation: '${op}', value: 5 })).toEqual([ 'relation' ]);
    // Increase and Append are the same operation in two sets of words (relation
    // "+" either way), so a value only the routine knows leaves the card right -
    // it reads as the arithmetic one, which is what a "+" nearly always is
    expect(undetermined({ func: 'SET', property: 'rotation', relation: '+', value: '${RANDOM}' })).toEqual([]);
    // a way of working the value does not decide is still an answer: a SET with
    // no relation sets, whatever the value comes out as
    expect(undetermined({ func: 'SET', property: 'x', value: '${v}' })).toEqual([]);
    // and so is a question a reference answers by being written down at all - a
    // FLIP with a face turns the widgets to it, whichever face it works out to
    expect(undetermined({ func: 'COUNT', holder: '${h}' })).toEqual([]);
    expect(undetermined({ func: 'FOREACH', range: '${r}' })).toEqual([]);
    expect(undetermined({ func: 'FLIP', face: '${targetFace}' })).toEqual([]);
  });


  test('picking a way of working says which worked-out value it would replace', () => {
    const operation = { func: 'TURN', turnCycle: '${PROPERTY faceCycle}' };
    const choices = routineOperationVariantChoices(operation);
    // every entry rewrites it, the one the sentence already reads as included
    expect(choices.every(choice => choice.replaces.join() == 'turnCycle ${PROPERTY faceCycle}')).toBe(true);
    // and nothing is replaced where the operation holds no such value
    expect(routineOperationVariantChoices({ func: 'TURN', turnCycle: 'backward' }).every(choice => !choice.replaces.length)).toBe(true);

    const { dom } = renderOperation(operation);
    dom.querySelector('.routine-editor-variant-menu').dispatchEvent(new Event('click'));
    const menu = document.querySelector('.inline-popup.popup-menu');
    const note = menu.querySelector('.popup-menu-entry-replaces');
    expect(note.textContent).toBe('replaces turnCycle ${PROPERTY faceCycle}');
    // the phrase stays one line: the warning is part of it, not a second one
    expect(menu.querySelector('.popup-menu-entry-preview')).toBeNull();
    expect(note.parentNode.className).toBe('popup-menu-entry-label');
    menu.querySelector('.popup-close').dispatchEvent(new Event('click')); // leave no popup open behind this test
  });

  test('adding an operation offers every one of them right away, searchable', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineOperationPopup();
    popup.setSource(source);
    popup.setOperationDetails({}, [ 'func' ], { state: {} }, [], []);
    popup.show();
    // no "common actions" shortlist hiding the rest behind a second click
    expect(popup.domElement.querySelector('.accordion-section')).toBeNull();
    const names = () => [...popup.domElement.querySelectorAll('.popup-operation-func')].map(e => e.textContent);
    expect(names().length).toBe(Object.keys(routineOperationMetadata).length + 2); // + var and //
    expect(names()).toContain('AUDIO');
    // the search box has the focus, so the list is narrowed down by typing
    expect(document.activeElement).toBe(popup.domElement.querySelector('.popup-property-search'));
    popup.domElement.querySelector('.popup-property-search').value = 'shuffle';
    popup.domElement.querySelector('.popup-property-search').dispatchEvent(new Event('input'));
    expect(names()).toEqual([ 'SHUFFLE' ]);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.domElement.querySelector('.popup-operation').dispatchEvent(new Event('click'));
    expect(value.func).toBe('SHUFFLE');
    popup.hide();
  });

  // how the list is read is a matter of taste, so it is two settings above the
  // search box - and they are what they were the last time somebody looked
  test('the list of operations is shown the way it was left', () => {
    const open = () => {
      const source = document.createElement('span');
      document.getElementById('editor').append(source);
      const popup = new RoutineOperationPopup();
      popup.setSource(source);
      popup.setOperationDetails({}, [ 'func' ], { state: {} }, [], []);
      popup.show();
      return popup;
    };
    localStorage.clear();
    let popup = open();
    const settings = [...popup.domElement.querySelectorAll('.popup-setting input')];
    expect(settings.map(s => s.checked)).toEqual([ true, true ]); // saying what they are for, grouped by what they do
    expect(popup.domElement.querySelector('.popup-operation-example')).not.toBeNull();
    const groups = [...popup.domElement.querySelectorAll('.popup-operation-group')].map(e => e.textContent);
    expect(groups).toEqual(routineOperationGroups.map(group => group.title));

    settings[0].checked = false;
    settings[0].dispatchEvent(new Event('change'));
    expect(popup.domElement.querySelector('.popup-operation-example')).toBeNull();
    settings[1].checked = false;
    settings[1].dispatchEvent(new Event('change'));
    expect(popup.domElement.querySelector('.popup-operation-group')).toBeNull();
    popup.hide();

    popup = open();
    expect([...popup.domElement.querySelectorAll('.popup-setting input')].map(s => s.checked)).toEqual([ false, false ]);
    expect(popup.domElement.querySelector('.popup-operation-example')).toBeNull();
    expect(popup.domElement.querySelector('.popup-operation-group')).toBeNull();
    // and searching keeps the groups it has entries for, in the order they are in
    const grouping = [...popup.domElement.querySelectorAll('.popup-setting input')][1];
    grouping.checked = true;
    grouping.dispatchEvent(new Event('change'));
    popup.domElement.querySelector('.popup-property-search').value = 'sound';
    popup.domElement.querySelector('.popup-property-search').dispatchEvent(new Event('input'));
    expect([...popup.domElement.querySelectorAll('.popup-operation-group')].map(e => e.textContent)).toEqual([ 'Talk to the players' ]);
    popup.hide();
    localStorage.clear();
  });

  test('every operation is offered under exactly one group', () => {
    const sorted = routineOperationGroups.flatMap(group => group.funcs);
    expect([...new Set(sorted)].length).toBe(sorted.length);
    for (const example of routineOperationExamples()) {
      expect(sorted).toContain(example.func);
      expect(example.group).not.toBe('Other operations');
    }
  });

  test('switching back to moving out of a holder starts at one widget again', () => {
    const picked = { func: 'MOVE', to: 'discard' }; // Move the picked widgets to discard
    const choice = routineOperationVariantChoices(picked).find(c => c.id == 'from');
    expect(choice.example).toContain('Move 1 widget from');
    const operation = Object.assign({}, picked, choice.values);
    for (const key in operation)
      if (operation[key] === undefined)
        delete operation[key];
    const sentence = renderOperation(operation).dom.querySelector('.routine-editor-sentence').cloneNode(true);
    for (const icon of sentence.querySelectorAll('.material-symbols, .routine-editor-add-clause'))
      icon.remove();
    expect(sentence.textContent.replace(/\s+/g, ' ').trim()).toBe('Move 1 widget from holder to discard');
  });

  test('the way a SHUFFLE goes about it is an option that brings what it needs', () => {
    const editor = editorForOperation({ func: 'SHUFFLE', holder: 'deck1' });
    editor.setOperationDetails({ state: {} }, { func: 'SHUFFLE', holder: 'deck1' }, [], []);
    const offered = editor.clauses().filter(clause => !editor.clauseIsActive(clause));
    expect(offered.map(clause => clause.label)).toEqual([ 'using a specific technique' ]);
    expect(editor.clauseAddValues(offered[0])).toEqual({ mode: 'overhand' });
    // and taking it out again takes the value that came with it
    const shuffling = editorForOperation({ func: 'SHUFFLE', holder: 'deck1', mode: 'riffle', modeValue: 2 });
    shuffling.setOperationDetails({ state: {} }, { func: 'SHUFFLE', holder: 'deck1', mode: 'riffle', modeValue: 2 }, [], []);
    expect(shuffling.clauseRemoveValues(shuffling.clauses()[0])).toEqual({ mode: undefined, modeValue: undefined });
  });

  test('the list of operations says what each one is for, not what an empty one would say', () => {
    const offered = routineOperationExamples();
    const of = func => offered.find(e => e.func == func).description;
    expect(of('AUDIO')).toBe('Play a sound');
    expect(of('CALL')).toBe('Run another routine');
    expect(of('CLONE')).toBe('Make copies of widgets');
    expect(of('DELAY')).toBe('Insert a pause before continuing');
    for(const { func, description } of offered) {
      expect(description).toMatch(/^[A-Z]/);
      expect(description).not.toContain(func); // words, not the name of the operation
      expect(description).not.toContain('the picked widgets'); // that is the example, not the purpose
    }
  });

  test('a new operation starts as the shape it is normally written in', () => {
    const newOperation = func => routineOperationExamples().find(e => e.func == func).newOperation;
    // the engine always filters a SELECT, so a new one asks what to filter by
    expect(newOperation('SELECT')).toEqual({ func: 'SELECT', property: '', value: '' });
    expect(newOperation('SET')).toEqual({ func: 'SET', property: '', value: '' });
    const sentenceOf = operation => {
      const sentence = renderOperation(operation).dom.querySelector('.routine-editor-sentence').cloneNode(true);
      for (const icon of sentence.querySelectorAll('.material-symbols, .routine-editor-add-clause'))
        icon.remove();
      return sentence.textContent.replace(/\s+/g, ' ').trim();
    };
    // a blank says what kind of value belongs there instead of asking with a "?"
    expect(sentenceOf(newOperation('SELECT'))).toBe('Pick widgets where property is value');
    expect(sentenceOf(newOperation('SET'))).toBe('Set property of the picked widgets to number or text');
    // a dialog is written with what it says; what it asks is the list of lines
    // below the sentence, which says for itself that it is still empty
    expect(sentenceOf(newOperation('INPUT'))).toBe('Ask the player title');
    // a MOVE almost always empties a holder, and how many it moves is the number
    // the engine uses there - the sentence says it from the start instead of
    // changing from "all" to "1" the moment a holder is picked
    expect(newOperation('MOVE')).toEqual({ func: 'MOVE', from: null, count: 1 });
    expect(sentenceOf(newOperation('MOVE'))).toBe('Move 1 widget from holder to holder');
    // everything else is nothing but its func
    expect(newOperation('SHUFFLE')).toEqual({ func: 'SHUFFLE' });
  });

  // how many widgets an operation works on is a limit, and a negative one is the
  // engine leaving that many alone rather than a minus sign in the sentence
  test('a count says what it limits, in both directions', () => {
    const move = editorForOperation({ func: 'MOVE', from: 'deck1', to: 'hand1', count: -2 });
    move.setOperationDetails({ state: {} }, { func: 'MOVE', from: 'deck1', to: 'hand1', count: -2 }, [], []);
    expect(move.getDisplayedValue('count')).toBe('all but 2');
    expect(sentenceWords(renderOperation({ func: 'ROTATE', holder: 'deck1', count: -1 }).dom))
      .toBe('Rotate all but 1 widget in deck1 by 90 degrees');
    // and "all" is not a limit at all, so the option that limits it is off
    const flip = editorForOperation({ func: 'FLIP', face: 0 });
    flip.setOperationDetails({ state: {} }, { func: 'FLIP', face: 0 }, [], []);
    expect(flip.clauses().filter(clause => !flip.clauseIsActive(clause)).map(clause => clause.label)).toEqual([ 'at most a certain number of them' ]);
  });

  // which face is one thing a FLIP says, not four ways of working: the two faces
  // a game turns cards to are a drop-down, every other one a number away
  test('FLIP picks its face in the sentence', () => {
    const editor = editorForOperation({ func: 'FLIP', face: 1 });
    editor.setOperationDetails({ state: {} }, { func: 'FLIP', face: 1 }, [], []);
    expect(editor.parameterIsDropDown([ 'face' ])).toBe(true);
    const menu = editor.createPopup([ 'face' ]);
    expect(menu).toBeInstanceOf(RoutineEnumMenu);
    menu.setSource(document.getElementById('editor'));
    menu.setOperationDetails({ func: 'FLIP', face: 1 }, [ 'face' ], { state: {} }, [], []);
    menu.show();
    expect([...menu.domElement.querySelectorAll('.popup-menu-entry-label')].map(e => e.textContent))
      .toEqual([ 'face down', 'face up', 'a specific face…' ]);
    menu.hide();
    // a face the list does not offer is a number, and the sentence says so
    const third = editorForOperation({ func: 'FLIP', face: 2 });
    third.setOperationDetails({ state: {} }, { func: 'FLIP', face: 2 }, [], []);
    expect(third.parameterIsDropDown([ 'face' ])).toBe(false);
  });

  // the engine never looks at the collection once a holder is named, so counting
  // a holder does not offer to name a group of widgets as well
  test('COUNT offers the options of the way it is working', () => {
    const holder = editorForOperation({ func: 'COUNT', holder: 'hand1' });
    holder.setOperationDetails({ state: {} }, { func: 'COUNT', holder: 'hand1' }, [], []);
    expect(holder.clauses().map(clause => clause.label)).toEqual([ 'owned by a player', 'name the result' ]);
    const collection = editorForOperation({ func: 'COUNT' });
    collection.setOperationDetails({ state: {} }, { func: 'COUNT' }, [], []);
    expect(collection.clauses().map(clause => clause.label)).toContain('a named group of widgets');
  });

  test('the field a sentence starts with is as wide as the phrases it holds', () => {
    const lead = renderOperation({ func: 'FLIP', holder: 'deck1', face: 0 }).dom.querySelector('.routine-editor-variant-menu');
    // "Cycle the face of" is the longer of the two ways a FLIP can work
    expect(lead.style.minWidth).toBe('17ch');
    // one way to work is no field at all
    expect(renderOperation({ func: 'DELAY' }).dom.querySelector('.routine-editor-variant').style.minWidth).toBe('');
  });

  test('an option only shows up in the sentence while it is in use', () => {
    const withoutFace = renderOperation({ func: 'MOVE', from: 'a', to: 'b' }).dom;
    expect(withoutFace.querySelector('[data-parameter="face"]')).toBeNull();
    expect(withoutFace.querySelector('.routine-editor-add-clause')).not.toBeNull();
    const withFace = renderOperation({ func: 'MOVE', from: 'a', to: 'b', face: 0 }).dom;
    expect(withFace.textContent).toContain('and turn them face down');
    expect(withFace.querySelector('.routine-editor-clause-remove')).not.toBeNull();
  });

  test('the x behind an option switches all of its parameters off again', () => {
    const { editor, dom } = renderOperation({ func: 'CLONE', source: 'DEFAULT', xOffset: 10, yOffset: 20 });
    let result = null;
    editor.registerChangeListener(v => result = v);
    const remove = [...dom.querySelectorAll('.routine-editor-clause-remove')].find(r => r.dataset.clause == 'offset');
    remove.dispatchEvent(new Event('click'));
    expect(result.xOffset).toBeUndefined();
    expect(result.yOffset).toBeUndefined();
    expect(result.source).toBe('DEFAULT');
  });

  test('the options button offers what is left, with a value that shows what it does', () => {
    const editor = editorForOperation({ func: 'RECALL', holder: 'deck1' });
    editor.setOperationDetails({ state: {} }, { func: 'RECALL', holder: 'deck1' }, [], []);
    const offered = editor.clauses().filter(clause => !editor.clauseIsActive(clause));
    // every option of a RECALL turns a default around, so it is named after what
    // switching it on does rather than after the parameter it sets
    expect(offered.map(clause => clause.label)).toEqual([
      'except the cards players hold', 'only the cards on the table', 'nearest cards first', 'leave some out'
    ]);
    const byDistance = offered.find(clause => clause.id == 'byDistance');
    expect(editor.clauseAddValues(byDistance)).toEqual({ byDistance: true }); // switching it on has to change something
  });

  // every option is one phrase naming what it adds, never the two lines the
  // phrase and the sentence it produces used to be
  test('the options are a plain menu of one phrase each', async () => {
    const { dom } = renderOperation({ func: 'RECALL', holder: 'deck1' });
    dom.querySelector('.routine-editor-add-clause').dispatchEvent(new Event('click'));
    await new Promise(resolve => setTimeout(resolve, 0));
    const menu = document.querySelector('.inline-popup.popup-menu');
    expect(menu).not.toBeNull();
    expect(menu.querySelector('h1').textContent).toContain('Add an option to RECALL'); // a title, but no section around the one list
    expect(menu.querySelector('.accordion-section')).toBeNull();
    expect([...menu.querySelectorAll('.popup-menu-entry-label')].map(e => e.textContent)).toContain('nearest cards first');
    expect(menu.querySelector('.popup-menu-entry-preview')).toBeNull();
    expect(menu.querySelector('.popup-close')).not.toBeNull();
    menu.remove();
  });

  // the CLICK example of the review: two options, each naming what it is about,
  // and what exactly is ignored is the drop-down the option leaves behind
  test('an option names what it is about, without listing what it can say', () => {
    const editor = editorForOperation({ func: 'CLICK' });
    editor.setOperationDetails({ state: {} }, { func: 'CLICK' }, [], []);
    const offered = editor.clauses().filter(clause => !editor.clauseIsActive(clause));
    expect(offered.map(clause => clause.label)).toEqual([ 'a named group of widgets', 'n times', 'ignore something' ]);
    // and switching it on starts at something that actually ignores
    expect(editor.clauseAddValues(offered.find(clause => clause.id == 'mode'))).toEqual({ mode: 'ignoreClickRoutine' });
    for (const func in routineOperationMetadata) {
      const forFunc = editorForOperation({ func });
      forFunc.setOperationDetails({ state: {} }, { func }, [], []);
      const labels = [];
      for (const clause of forFunc.clauses()) {
        if (clause.generated)
          continue;
        // a phrase, not a sentence - the longest one has to say which of the
        // numbers a widget stacks by the option is about
        expect(clause.label.length).toBeLessThanOrEqual(40);
        // two options of the same operation cannot read the same either
        expect(labels).not.toContain(clause.label);
        labels.push(clause.label);
      }
    }
  });

  test('a setting is a drop-down in the sentence, listing what it can say', async () => {
    const { editor, dom } = renderOperation({ func: 'CLICK', mode: 'ignoreClickRoutine' });
    const chip = dom.querySelector('[data-parameter="mode"]');
    expect(chip.classList.contains('routine-editor-parameter-menu')).toBe(true);
    expect(chip.querySelector('.material-symbols').textContent).toBe('arrow_drop_down');
    let result = null;
    editor.registerChangeListener(v => result = v);
    chip.dispatchEvent(new Event('click'));
    await new Promise(resolve => setTimeout(resolve, 0));
    const menu = document.querySelector('.inline-popup.popup-menu');
    expect(menu.querySelector('h1')).toBeNull(); // a menu, not the popup with its sections
    const labels = [...menu.querySelectorAll('.popup-menu-entry-label')].map(e => e.textContent);
    expect(labels).toContain('even the ones that are not clickable');
    expect(labels).not.toContain('ignoreClickable'); // the words, never the engine's value
    expect(menu.querySelector('button.selected .popup-menu-entry-label').textContent).toBe('but do not run their click routines');
    [...menu.querySelectorAll('.popup-menu-entry')].find(b => b.textContent == 'even the ones that are not clickable').dispatchEvent(new Event('click'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(result.mode).toBe('ignoreClickable');
  });

  test('a setting holding a value the routine works out keeps the full popup', async () => {
    const { dom } = renderOperation({ func: 'CLICK', mode: '${chosenMode}' });
    const chip = dom.querySelector('[data-parameter="mode"]');
    expect(chip.classList.contains('routine-editor-parameter-menu')).toBe(false);
    chip.dispatchEvent(new Event('click'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.querySelector('.inline-popup h1')).not.toBeNull();
    for (const popup of document.querySelectorAll('.inline-popup'))
      popup.remove();
  });

  // the drop-down of a setting is not a dead end: the last entry hands over to
  // the popup that can also hold a value the routine works out
  test('a drop-down hands over to the full popup for anything it cannot say', async () => {
    const { dom } = renderOperation({ func: 'CLICK', mode: 'ignoreClickRoutine' });
    dom.querySelector('[data-parameter="mode"]').dispatchEvent(new Event('click'));
    await new Promise(resolve => setTimeout(resolve, 0));
    const menu = document.querySelector('.inline-popup.popup-menu');
    const other = [...menu.querySelectorAll('.popup-menu-entry')].pop();
    expect(other.textContent).toBe('something else…');
    other.dispatchEvent(new Event('click'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.querySelector('.inline-popup h1').textContent).toContain('CLICK');
    for (const popup of document.querySelectorAll('.inline-popup'))
      popup.remove();
  });

  // the same wording SET got: the widgets an operation works on are words in the
  // sentence until an option names a group instead
  test('the widgets an operation works on are words until an option names a group', () => {
    for (const func of [ 'CLICK', 'DELETE', 'GET', 'COUNT' ]) {
      const plain = renderOperation({ func }).dom;
      expect(plain.textContent).toContain('the picked widgets');
      expect(plain.querySelector('[data-parameter="collection"]')).toBeNull();
      const named = renderOperation({ func, collection: 'myPick' }).dom;
      expect(named.textContent).toContain('the widgets called myPick');
      expect(named.querySelector('[data-parameter="collection"]')).not.toBeNull();
    }
    // a list of ids written into the operation is not a name to call anybody by
    expect(renderOperation({ func: 'DELETE', collection: [ 'card1', 'card2' ] }).dom.textContent).toContain('Delete card1 and card2');
  });

  // the blank of a collection takes either of the two things the popup offers
  test('a blank collection asks for widgets or a collection', () => {
    for (const func of [ 'SET', 'GET', 'CLICK', 'DELETE', 'COUNT' ]) {
      const { dom } = renderOperation({ func, collection: '' });
      expect([...dom.querySelectorAll('.routine-editor-parameter-missing')].map(b => b.textContent)).toContain('widget(s)/collection');
    }
  });

  // the sentence without the icons the chips of a drop-down and of a removable
  // option carry, so an expectation reads as the sentence a card shows
  const sentenceWords = dom => {
    const sentence = dom.querySelector('.routine-editor-sentence').cloneNode(true);
    for (const icon of sentence.querySelectorAll('.material-symbols, .routine-editor-add-clause'))
      icon.remove();
    return sentence.textContent.replace(/\s+/g, ' ').trim();
  };

  // a SELECT that names no type picks whatever matches, so the type is an option
  // like every other part whose absence means something
  test('SELECT says widgets in plain words until an option names one type', () => {
    const plain = renderOperation({ func: 'SELECT', property: 'cardType', value: 'ace' }).dom;
    expect(sentenceWords(plain)).toContain('Pick widgets where');
    expect(plain.querySelector('[data-parameter="type"]')).toBeNull();
    const typed = renderOperation({ func: 'SELECT', type: 'card', property: 'cardType', value: 'ace' }).dom;
    expect(sentenceWords(typed)).toContain('Pick cards where');
    expect(typed.querySelector('[data-parameter="type"]')).not.toBeNull();
    // an explicit "any type" is the same sentence as no type at all
    expect(sentenceWords(renderOperation({ func: 'SELECT', type: 'all', property: 'cardType', value: 'ace' }).dom)).toContain('Pick widgets where');
    const editor = editorForOperation({ func: 'SELECT' });
    editor.setOperationDetails({ state: {} }, { func: 'SELECT' }, [], []);
    const offered = editor.clauses().filter(clause => !editor.clauseIsActive(clause));
    expect(offered.map(clause => clause.label)).toEqual([
      'only one type', 'from an earlier pick', 'at most a certain number of them', 'in random order', 'sorted by a property', 'give this group a name'
    ]);
    // and switching the type on has to narrow the sentence down to something
    expect(editor.clauseAddValues(offered.find(clause => clause.id == 'type'))).toEqual({ type: 'card' });
  });

  // where a SELECT takes its widgets from is a group an earlier operation made,
  // and the sentence says which kind of thing the name refers to
  test('the source of a SELECT is the pick it is called by', () => {
    expect(renderOperation({ func: 'SELECT', source: 'hand', property: 'x', value: 1 }).dom.textContent).toContain('from the pick called hand');
  });

  // the name an operation stores its widgets under is what the operations after
  // it have to type, so the sentence shows the name and not a phrase for it
  test('naming what an operation hands on shows the name it stores', () => {
    expect(renderOperation({ func: 'SELECT', property: 'x', value: 1, collection: 'DEFAULT' }).dom.textContent).toContain('call them DEFAULT');
    expect(renderOperation({ func: 'CLONE', collection: 'DEFAULT' }).dom.textContent).toContain('call the copies DEFAULT');
    // while the widgets an operation reads are still the words for them
    expect(renderOperation({ func: 'FLIP', collection: 'DEFAULT', face: 0 }).dom.textContent).toContain('the picked widgets');
  });

  // GET reads one value out of a group of widgets, and every option says which
  // part of that it changes
  test('GET reads the first value, and words its options as what they do', () => {
    const editor = editorForOperation({ func: 'GET' });
    editor.setOperationDetails({ state: {} }, { func: 'GET' }, [], []);
    expect(editor.variantLead(editor.currentVariant())).toBe('Read the first ');
    expect(editor.clauses().map(clause => clause.label)).toEqual([ 'from a named pick', 'name the result', 'ignoring widgets without it' ]);
    // and the name it is remembered under is the last thing the sentence says
    expect(sentenceWords(renderOperation({ func: 'GET', property: 'score', variable: 'total', skipMissing: true }).dom))
      .toBe('Read the first score of the picked widgets, ignoring the widgets that do not have it and remember it as total');
  });

  // return does not decide whether the caller waits - it always waits. It decides
  // whether anything after the CALL still runs.
  test('CALL says what return does, and does not offer to rename what it hands back', () => {
    const editor = editorForOperation({ func: 'CALL' });
    editor.setOperationDetails({ state: {} }, { func: 'CALL' }, [], []);
    const offered = editor.clauses().filter(clause => !editor.clauseIsActive(clause) && clause.offer !== false);
    expect(offered.map(clause => clause.label)).toEqual([ 'of another widget', 'pass values in', 'name the result', 'and do not finish this routine' ]);
    expect(renderOperation({ func: 'CALL', routine: 'dealRoutine', 'return': false }).dom.textContent).toContain('and do not finish this routine');
    expect(renderOperation({ func: 'CALL', routine: 'dealRoutine' }).dom.textContent).not.toContain('waiting');
    // a game that did rename them still reads what it does
    expect(renderOperation({ func: 'CALL', routine: 'dealRoutine', collection: 'dealt' }).dom.textContent).toContain('call its widgets dealt');
  });

  // an x at the end of a word reads as the letter x rather than as a control
  test('the marker that takes an option out is not the letter x', () => {
    const { dom } = renderOperation({ func: 'MOVE', from: 'a', to: 'b', face: 0 });
    const remove = dom.querySelector('.routine-editor-clause-remove');
    expect(remove.textContent).toBe('do_not_disturb_on');
    expect(remove.title.toLowerCase()).toContain('option');
    // and it stays with the value it belongs to while the sentence wraps: on its
    // own it ends up alone at the start of a line, reading as a bullet point
    expect(remove.parentElement.className).toBe('routine-editor-clause-end');
    expect(remove.previousElementSibling.dataset.parameter).toBe('face');
  });

  test('the sentence says "add option" like every other add button in the panel', () => {
    const { dom } = renderOperation({ func: 'RECALL', holder: 'deck1' });
    expect(dom.querySelector('.routine-editor-add-clause').textContent).toBe('add option');
    const ifEditor = editorForOperation({ func: 'IF', operand1: 1 });
    ifEditor.setOperationDetails({ state: {} }, { func: 'IF', operand1: 1 }, [], []);
    const rendered = ifEditor.render();
    expect([...rendered.querySelectorAll('button')].map(b => b.textContent)).toEqual([ 'add operation', 'add else' ]);
  });

  test('parameters no variant and no option words become an option of their own', () => {
    const editor = editorForOperation({ func: 'INPUT' });
    editor.setOperationDetails({ state: {} }, { func: 'INPUT' }, [], []);
    const named = editor.clauses().map(clause => clause.id);
    const fixed = editor.currentVariant().fixed || [];
    for (const name in routineOperationMetadata.INPUT.parameters)
      if (fixed.indexOf(name) == -1) // who is asked is a way of working, not an option
        expect(named).toContain(name);
  });
});

describe('routine editor state handling', () => {
  test('collects defined variables, collections and in-place collections', () => {
    const editor = new RoutineEditor({ state: {} }, [
      { func: 'COUNT', variable: 'cards' },
      { func: 'SELECT', collection: 'mine' },
      { func: 'SET', collection: [ 'w1', 'w2' ] },
      { func: 'MOVE', to: 'h1' }
    ]);
    const move = editor.operations[3];
    expect(move.variables).toContain('cards');
    expect(move.collections).toContainEqual('mine');
    expect(move.collections).toContainEqual([ 'w1', 'w2' ]);
  });

  test('the fields of an INPUT are variables and collections of their own', () => {
    // what the player fills in is what the operations after it work with, so the
    // popups offer those names instead of the editor pretending an INPUT stores
    // nothing (the same fields validate_gamefile.js reads)
    const editor = new RoutineEditor({ state: {} }, [
      { func: 'INPUT', fields: [ { type: 'string', variable: 'playerAnswer' }, { type: 'choose', variable: 'picked', collection: 'chosenCards' }, { type: 'title' } ] },
      { func: 'SET', property: 'text' }
    ]);
    expect(editor.operations[1].variables).toEqual([ 'playerAnswer', 'picked' ]);
    expect(editor.operations[1].collections).toContain('chosenCards');
  });

  test('removing an operation splices the routine', () => {
    const routine = [ { func: 'FLIP' }, { func: 'SHUFFLE' } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    let notified = null;
    editor.registerChangeListener(v => notified = v);
    const remove = [...editor.domElement.querySelectorAll('.routine-editor-operation-controls .material-symbols')].find(b => b.textContent == 'delete');
    // the one control of a card that takes something away, so it says so in red
    // like every other removal in the panel rather than in the editor blue
    expect(remove.classList.contains('routine-editor-operation-delete')).toBe(true);
    remove.dispatchEvent(new Event('click'));
    expect(notified).toHaveLength(1);
    expect(notified[0].func).toBe('SHUFFLE');
  });

  test('an operation is added after the card that was worked on last', async () => {
    const routine = [ { func: 'FLIP' }, { func: 'SHUFFLE' }, { func: 'DELETE' } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    document.getElementById('editor').append(editor.domElement);
    const addOperation = async _=>{
      editor.domElement.querySelector('.routine-editor-add-operation').dispatchEvent(new Event('click'));
      await new Promise(resolve => setTimeout(resolve, 0));
      const popup = document.querySelector('.inline-popup');
      [...popup.querySelectorAll('.popup-operation')].find(e => e.textContent.startsWith('COUNT')).dispatchEvent(new Event('click'));
      await new Promise(resolve => setTimeout(resolve, 0));
    };

    // nothing clicked yet: the operation goes to the end
    await addOperation();
    expect(routine.map(o => o.func)).toEqual([ 'FLIP', 'SHUFFLE', 'DELETE', 'COUNT' ]);

    // clicking a card makes it the active one - and the next operation follows it
    const cards = _=>[...editor.domElement.querySelectorAll(':scope > .routine-editor-operation')];
    cards()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cards()[0].classList).toContain('routine-editor-operation-active');
    await addOperation();
    expect(routine.map(o => o.func)).toEqual([ 'FLIP', 'COUNT', 'SHUFFLE', 'DELETE', 'COUNT' ]);
    // the one just added is where the next one goes, so several in a row stay in order
    expect(cards()[1].classList).toContain('routine-editor-operation-active');
    await addOperation();
    expect(routine.map(o => o.func)).toEqual([ 'FLIP', 'COUNT', 'COUNT', 'SHUFFLE', 'DELETE', 'COUNT' ]);
    editor.domElement.remove();
  });

  test('the card worked on last is selected again when the widget comes back', () => {
    const widget = { state: { id: 'w1' } };
    const cardsOf = editor => [...editor.domElement.querySelectorAll(':scope > .routine-editor-operation')];

    const editor = new RoutineEditor(widget, [ { func: 'FLIP' }, { func: 'SHUFFLE' }, { func: 'DELETE' } ], [], [], { routineKey: 'clickRoutine' });
    document.getElementById('editor').append(editor.domElement);
    cardsOf(editor)[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    editor.domElement.remove();

    // selecting the widget again builds a new editor from a new routine array
    const reopened = new RoutineEditor(widget, [ { func: 'FLIP' }, { func: 'SHUFFLE' }, { func: 'DELETE' } ], [], [], { routineKey: 'clickRoutine' });
    expect(cardsOf(reopened)[1].classList).toContain('routine-editor-operation-active');
    expect(cardsOf(reopened)[0].classList).not.toContain('routine-editor-operation-active');

    // another routine of the same widget has its own cards, none of them active
    const otherRoutine = new RoutineEditor(widget, [ { func: 'FLIP' } ], [], [], { routineKey: 'changeRoutine' });
    expect(cardsOf(otherRoutine)[0].classList).not.toContain('routine-editor-operation-active');

    // and a card that is gone meanwhile is not looked for any longer
    const shortened = new RoutineEditor(widget, [ { func: 'FLIP' } ], [], [], { routineKey: 'clickRoutine' });
    expect(cardsOf(shortened)[0].classList).not.toContain('routine-editor-operation-active');
  });

  test('moves an operation into an adjacent IF block', () => {
    const routine = [ { func: 'IF', operand1: 1 }, { func: 'FLIP' } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    let notified = null;
    editor.registerChangeListener(v => notified = v);
    // the FLIP row shows an arrow to nest into the IF above
    const upInto = [...editor.domElement.querySelectorAll('.material-symbols')].find(b => b.textContent == 'north_east');
    expect(upInto).not.toBeNull();
    upInto.dispatchEvent(new Event('click'));
    expect(notified).toHaveLength(1);
    expect(notified[0].func).toBe('IF');
    expect(notified[0].thenRoutine).toEqual([ { func: 'FLIP' } ]);
  });

  test('moves an operation out of a nested block into the parent', () => {
    const routine = [ { func: 'IF', operand1: 1, thenRoutine: [ { func: 'FLIP' }, { func: 'SHUFFLE' } ] } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    let notified = null;
    editor.registerChangeListener(v => notified = v);
    // the outdent arrow inside the IF block hoists the first nested op out after the IF
    const out = [...editor.domElement.querySelectorAll('.routine-editor .material-symbols')].find(b => b.textContent == 'format_indent_decrease');
    expect(out).not.toBeNull();
    out.dispatchEvent(new Event('click'));
    expect(notified).toHaveLength(2);
    expect(notified[0].thenRoutine).toEqual([ { func: 'SHUFFLE' } ]);
    expect(notified[1].func).toBe('FLIP');
  });

  test('every control of a card is there all the time, in two rows', () => {
    const editor = new RoutineEditor({ state: {} }, [ { func: 'FLIP' }, { func: 'SHUFFLE' } ]);
    const card = editor.domElement.querySelector('.routine-editor-operation');
    // what changes the operation itself on top, what only moves it around below
    expect([...card.querySelectorAll('.routine-editor-operation-controls-top > *')].map(b => b.textContent)).toEqual([ 'data_object', 'delete' ]);
    expect([...card.querySelectorAll('.routine-editor-operation-buttons > *')].map(b => b.textContent)).toEqual([ 'drag_indicator', 'arrow_downward' ]);
    // nothing waits for the pointer to come near the card
    expect(card.querySelectorAll('.routine-editor-on-demand')).toHaveLength(0);
  });

  test('every control of an operation is reachable and usable with the keyboard', () => {
    const editor = new RoutineEditor({ state: {} }, [ { func: 'FLIP', holder: 'h1' } ]);
    document.getElementById('editor').append(editor.domElement);
    const card = editor.domElement.querySelector('.routine-editor-operation');
    // everything except the drag grip, which has nothing to do without a pointer
    // (the up/down buttons next to it are how a keyboard reorders)
    for (const control of card.querySelectorAll('.routine-editor-operation-parameter, .routine-editor-operation-controls .material-symbols:not(.routine-editor-drag-handle), .info-button'))
      expect(control.tabIndex).toBe(0);
    let routine = null;
    editor.registerChangeListener(v => routine = v);
    const remove = [...card.querySelectorAll('.routine-editor-operation-controls .material-symbols')].find(b => b.textContent == 'delete');
    remove.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(routine).toEqual([]);
    editor.domElement.remove();
  });

  test('every operation gets a drag handle for reordering', () => {
    const editor = new RoutineEditor({ state: {} }, [ { func: 'FLIP' }, { func: 'SHUFFLE' } ]);
    const handles = editor.domElement.querySelectorAll('.routine-editor-drag-handle');
    expect(handles).toHaveLength(2);
    expect(handles[0].draggable).toBe(true);
  });

  test('dragging an operation reorders the routine in place', () => {
    const routine = [ { func: 'FLIP' }, { func: 'SHUFFLE' }, { func: 'DELETE' } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    let notified = null;
    editor.registerChangeListener(v => notified = v);
    editor.performDrag(2, true, { editor, indices: [ 0 ] }); // grab FLIP, drop after DELETE
    expect(notified.map(o => o.func)).toEqual([ 'SHUFFLE', 'DELETE', 'FLIP' ]);
    expect(editor.routine).toBe(routine); // the array reference is preserved
  });

  test('a multi-selection drags several operations together and keeps their order', () => {
    const routine = [ { func: 'FLIP' }, { func: 'SHUFFLE' }, { func: 'DELETE' }, { func: 'ROTATE' } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    let notified = null;
    editor.registerChangeListener(v => notified = v);
    editor.performDrag(3, true, { editor, indices: [ 0, 2 ] }); // FLIP and DELETE, dropped after ROTATE
    expect(notified.map(o => o.func)).toEqual([ 'SHUFFLE', 'ROTATE', 'FLIP', 'DELETE' ]);
  });

  test('dropping onto one of the dragged operations changes nothing', () => {
    const routine = [ { func: 'FLIP' }, { func: 'SHUFFLE' } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    let notified = null;
    editor.registerChangeListener(v => notified = v);
    editor.performDrag(0, false, { editor, indices: [ 0 ] });
    expect(notified).toBeNull();
  });

  test('reordering distinguishes duplicate primitive operations by index', () => {
    const routine = [ '// one', '// one', { func: 'FLIP' } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    let notified = null;
    editor.registerChangeListener(v => notified = v);
    editor.performDrag(0, false, { editor, indices: [ 2 ] }); // FLIP before the first comment
    expect(notified).toEqual([ { func: 'FLIP' }, '// one', '// one' ]);
  });

  test('dragging an operation into an IF block moves it inside the block', () => {
    const routine = [ { func: 'FLIP' }, { func: 'IF', operand1: 1, thenRoutine: [] } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    let notified = null;
    editor.registerChangeListener(v => notified = v);
    const block = editor.operations[1].subroutineEditors.thenRoutine;
    block.performDrag(-1, true, { editor, indices: [ 0 ] }); // drop into the empty block
    expect(notified).toEqual([ { func: 'IF', operand1: 1, thenRoutine: [ { func: 'FLIP' } ] } ]);
    expect(editor.routine).toBe(routine); // the array reference is preserved
  });

  test('dragging into a block the operation does not have yet attaches the block', () => {
    // a freshly added IF/FOREACH has no thenRoutine/loopRoutine key at all
    for (const [ operation, property ] of [ [ { func: 'IF', operand1: 1 }, 'thenRoutine' ], [ { func: 'FOREACH' }, 'loopRoutine' ] ]) {
      const editor = new RoutineEditor({ state: {} }, [ { func: 'FLIP' }, operation ]);
      let notified = null;
      editor.registerChangeListener(v => notified = v);
      const block = editor.operations[1].subroutineEditors[property];
      block.performDrag(-1, true, { editor, indices: [ 0 ] });
      expect(notified).toHaveLength(1);
      expect(notified[0][property]).toEqual([ { func: 'FLIP' } ]);
    }
  });

  test('dragging into an ELSE block moves the operation there', () => {
    const routine = [ { func: 'FLIP' }, { func: 'IF', operand1: 1, thenRoutine: [], elseRoutine: [] } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    let notified = null;
    editor.registerChangeListener(v => notified = v);
    const block = editor.operations[1].subroutineEditors.elseRoutine;
    block.performDrag(-1, true, { editor, indices: [ 0 ] });
    expect(notified).toEqual([ { func: 'IF', operand1: 1, thenRoutine: [], elseRoutine: [ { func: 'FLIP' } ] } ]);
  });

  test('dragging an operation out of a FOREACH block moves it into the parent routine', () => {
    const routine = [ { func: 'FOREACH', loopRoutine: [ { func: 'FLIP' } ] }, { func: 'SHUFFLE' } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    let notified = null;
    editor.registerChangeListener(v => notified = v);
    const block = editor.operations[0].subroutineEditors.loopRoutine;
    editor.performDrag(1, true, { editor: block, indices: [ 0 ] }); // drop after SHUFFLE
    expect(notified).toEqual([ { func: 'FOREACH', loopRoutine: [] }, { func: 'SHUFFLE' }, { func: 'FLIP' } ]);
  });

  test('a block nested inside the dragged operation refuses the drop', () => {
    const routine = [ { func: 'IF', operand1: 1, thenRoutine: [] }, { func: 'FLIP' } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    const block = editor.operations[0].subroutineEditors.thenRoutine;
    editor.beginDrag(editor.directChildCards()[0].querySelector('.routine-editor-drag-handle'));
    expect(block.acceptsActiveDrag()).toBe(false); // the IF cannot go into its own block
    expect(editor.acceptsActiveDrag()).toBe(true);
  });

  test('Ctrl-clicking a card toggles it in and out of the selection', () => {
    const editor = new RoutineEditor({ state: {} }, [ { func: 'FLIP' }, { func: 'SHUFFLE' } ]);
    const card = editor.directChildCards()[1];
    card.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
    expect(editor.selectedIndices.has(1)).toBe(true);
    expect(card.classList.contains('routine-editor-operation-selected')).toBe(true);
    card.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
    expect(editor.selectedIndices.has(1)).toBe(false);
  });

  test('a routine change clears the transient Ctrl-selection', () => {
    const editor = new RoutineEditor({ state: {} }, [ { func: 'FLIP' }, { func: 'SHUFFLE' } ]);
    editor.selectedIndices.add(1);
    editor.routineChanged();
    expect(editor.selectedIndices.size).toBe(0);
  });

  test('IF and FOREACH blocks show tailored empty hints', () => {
    const ifEditor = new RoutineEditor({ state: {} }, [ { func: 'IF', operand1: 1, thenRoutine: [] } ]);
    expect(ifEditor.domElement.textContent).toContain('Add operations to run when the condition is true');
    const foreachEditor = new RoutineEditor({ state: {} }, [ { func: 'FOREACH', loopRoutine: [] } ]);
    expect(foreachEditor.domElement.textContent).toContain('Add operations to run for each iteration');
  });

  test('a nested block is rendered once per level, not once per level per level above it', () => {
    // a block that renders itself again after its editor built it costs 2^depth
    // renders, which is what made a deeply nested routine take seconds to open
    let routine = [ { func: 'FLIP' } ];
    for(let level = 0; level < 12; level++)
      routine = [ { func: 'IF', operand1: 1, thenRoutine: routine } ];
    // counting on RoutineEditor rather than on the operation editors: it is the
    // one class that renders a block, so no subclass can render without being
    // counted here
    const original = RoutineEditor.prototype.render;
    let renders = 0;
    RoutineEditor.prototype.render = function(...args) {
      renders++;
      return original.apply(this, args);
    };
    try {
      new RoutineEditor({ state: {} }, routine);
    } finally {
      RoutineEditor.prototype.render = original;
    }
    expect(renders).toBe(13); // the routine itself plus one per nested block
  });

  test('ignores echoes of its own edits but applies remote changes', () => {
    const routine = [ { func: 'FLIP' } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    const domBefore = editor.domElement.innerHTML;
    editor.onPropertyChange([ { func: 'FLIP' } ]); // echo
    expect(editor.routine).toBe(routine); // not replaced
    editor.onPropertyChange([ { func: 'SHUFFLE' } ]); // remote change
    expect(editor.routine[0].func).toBe('SHUFFLE');
  });
});

describe('events editor', () => {
  test('never hands its working arrays to the widget (aliasing would suppress later updates)', () => {
    const widget = { state: { clickRoutine: [ { func: 'FLIP' } ] } };
    let received = null;
    const eventsEditor = new EventsEditor(widget, (property, value) => received = value);
    eventsEditor.expandedEvents.clickRoutine = true;
    eventsEditor.render();
    const routineEditor = eventsEditor.routineEditors.clickRoutine;
    expect(routineEditor.routine).not.toBe(widget.state.clickRoutine);
    routineEditor.routineChanged();
    expect(received).toEqual(routineEditor.routine);
    expect(received).not.toBe(routineEditor.routine);
    expect(received[0]).not.toBe(routineEditor.routine[0]);
  });
});

describe('the routines of a deck', () => {
  let deckCounter = 0;
  function makeDeck(state, onChange = () => {}) {
    const widget = { state: { id: `deck${deckCounter++}`, type: 'deck', ...state }, get(p) { return this.state[p]; } };
    const editor = new EventsEditor(widget, (property, value) => {
      if (value === undefined)
        delete widget.state[property];
      else
        widget.state[property] = value;
      onChange(property, value);
    });
    return { widget, editor };
  }

  test('the routines of the cards and those of the deck itself are both listed, each saying which it is', () => {
    const { editor } = makeDeck({ clickRoutine: [], cardDefaults: { width: 50, clickRoutine: [ { func: 'FLIP' } ] } });
    const names = [...editor.domElement.querySelectorAll('.events-editor-property')].map(e => e.textContent);
    expect(names.slice(0, 2)).toEqual([ 'cardDefaults ↦ clickRoutine', 'clickRoutine' ]); // resetProperties follows
    const where = [...editor.domElement.querySelectorAll('.events-editor-where')].map(e => e.textContent);
    expect(where).toEqual([ 'every card', 'the deck itself' ]);
  });

  test('a widget with only one place for a routine says nothing about where it runs', () => {
    const { editor } = makeDeck({ type: 'button', clickRoutine: [] });
    expect(editor.domElement.querySelector('.events-editor-where')).toBeNull();
    expect(editor.domElement.querySelector('.events-editor-property').textContent).toBe('clickRoutine');
  });

  test('the same routine in both places is two cards, each pointing at the other', () => {
    const { editor } = makeDeck({ clickRoutine: [], cardDefaults: { clickRoutine: [] } });
    editor.expandedEvents['cardDefaults.clickRoutine'] = true;
    editor.expandedEvents.clickRoutine = true;
    editor.render();
    expect(Object.keys(editor.routineEditors)).toEqual([ 'cardDefaults.clickRoutine', 'clickRoutine' ]);
    const subtitles = [...editor.domElement.querySelectorAll('.events-editor-subtitle')].map(e => e.textContent);
    expect(subtitles[0]).toContain('Every card of this deck runs this routine');
    expect(subtitles[0]).toContain('also has a clickRoutine on the deck itself');
    expect(subtitles[1]).toContain('Only the deck widget runs this routine');
    expect(subtitles[1]).toContain('also has a clickRoutine in cardDefaults');
  });

  test('editing a card routine writes it back into cardDefaults and leaves the other defaults alone', () => {
    let received = null;
    const { editor } = makeDeck({ cardDefaults: { width: 50, clickRoutine: [ { func: 'FLIP' } ] } }, (property, value) => received = { property, value });
    editor.expandedEvents['cardDefaults.clickRoutine'] = true;
    editor.render();
    const routineEditor = editor.routineEditors['cardDefaults.clickRoutine'];
    expect(routineEditor.routine).toEqual([ { func: 'FLIP' } ]);
    routineEditor.routine.push({ func: 'SHUFFLE' });
    routineEditor.routineChanged();
    expect(received).toEqual({ property: 'cardDefaults', value: { width: 50, clickRoutine: [ { func: 'FLIP' }, { func: 'SHUFFLE' } ] } });
  });

  test('removing a card routine keeps the other card defaults, and the last one takes cardDefaults with it', () => {
    const confirmed = window.confirm;
    window.confirm = () => true;
    try {
      let received = null;
      const { widget, editor } = makeDeck({ cardDefaults: { width: 50, clickRoutine: [] } }, (property, value) => received = { property, value });
      editor.domElement.querySelector('.events-editor-remove').dispatchEvent(new Event('click'));
      expect(received).toEqual({ property: 'cardDefaults', value: { width: 50 } });
      expect(widget.state.cardDefaults).toEqual({ width: 50 });

      const { widget: bare, editor: bareEditor } = makeDeck({ cardDefaults: { clickRoutine: [] } });
      bareEditor.domElement.querySelector('.events-editor-remove').dispatchEvent(new Event('click'));
      expect(bare.state.cardDefaults).toBeUndefined();
    } finally {
      window.confirm = confirmed;
    }
  });

  test('a new routine goes to the cards unless the deck itself is picked', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    let added = null;
    const popup = new AddEventPopup(source, { cardDefaults: [], widget: [ 'clickRoutine' ] }, (property, target) => added = { property, target }, 'deck');
    popup.show();

    const options = [...popup.domElement.querySelectorAll('.add-event-target-option label')].map(l => l.textContent);
    expect(options).toEqual([ 'on every card of this deck', 'on the deck widget itself' ]);
    const [ cards, deck ] = popup.domElement.querySelectorAll('.add-event-target input');
    expect(cards.checked).toBe(true); // the cards are what a routine on a deck is nearly always for
    expect(popup.domElement.querySelector('.add-event-description').textContent).toContain('cardDefaults');

    // the deck already has a clickRoutine of its own, which does not stop its cards from getting one
    expect([...popup.domElement.querySelectorAll('.add-event-entry button')].map(b => b.textContent)).toContain('click');
    deck.checked = true;
    deck.dispatchEvent(new Event('change'));
    expect([...popup.domElement.querySelectorAll('.add-event-entry button')].map(b => b.textContent)).not.toContain('click');
    cards.checked = true;
    cards.dispatchEvent(new Event('change'));

    popup.domElement.querySelector('.add-event-entry button').dispatchEvent(new Event('click'));
    expect(added).toEqual({ property: 'clickRoutine', target: 'cardDefaults' });
  });

  test('adding a routine for the cards puts an empty one into cardDefaults', () => {
    let received = null;
    const { editor } = makeDeck({ cardDefaults: { width: 50 } }, (property, value) => received = { property, value });
    editor.setRoutine({ property: 'clickRoutine', target: 'cardDefaults', key: 'cardDefaults.clickRoutine' }, []);
    expect(received).toEqual({ property: 'cardDefaults', value: { width: 50, clickRoutine: [] } });
  });

  test('the routines a deck gives its cards are told apart from its other card defaults', () => {
    const deck = { state: { type: 'deck', cardDefaults: { width: 50, clickRoutine: [], onPileCreation: {} } }, get(p) { return this.state[p]; } };
    expect(cardDefaultRoutines(deck)).toEqual([ 'clickRoutine' ]);
    expect(cardDefaultRoutines({ state: { type: 'holder', clickRoutine: [] }, get(p) { return this.state[p]; } })).toEqual([]);
  });
});

describe('property automations', () => {
  let editorCounter = 0;
  function makeEditor(state, onChange = () => {}) {
    // a unique id per editor so the persisted expandedEvents map does not leak between tests
    const widget = { state: { id: `w${editorCounter++}`, ...state }, get(p) { return this.state[p]; } };
    return { widget, editor: new EventsEditor(widget, onChange) };
  }

  test('holders and lines get onEnter/onLeave cards, other widgets only resetProperties', () => {
    for(const type of [ 'holder', 'line' ]) {
      const { editor } = makeEditor({ type });
      const props = [...editor.domElement.querySelectorAll('.events-editor-property')].map(e => e.textContent);
      expect(props).toEqual(expect.arrayContaining([ 'onEnter', 'onLeave', 'resetProperties' ]));
    }
    const { editor: buttonEditor } = makeEditor({ type: 'button' });
    const buttonProps = [...buttonEditor.domElement.querySelectorAll('.events-editor-property')].map(e => e.textContent);
    expect(buttonProps).toContain('resetProperties');
    expect(buttonProps).not.toContain('onEnter');
  });

  test('onEnter/onLeave are described with the stops of a line and the content of a holder', () => {
    const onEnter = propertyAutomations.find(a => a.property == 'onEnter');
    const onLeave = propertyAutomations.find(a => a.property == 'onLeave');
    expect(onEnter.description('line')).toContain('stops');
    expect(onEnter.description('holder')).toContain('holder');
    expect(onLeave.description('line')).toContain('stops');
    expect(onLeave.description('holder')).toContain('holder');
  });

  test('a property set says what it applies to and is not filed under "Properties"', () => {
    const { editor } = makeEditor({ type: 'holder', onEnter: { activeFace: 1 } });
    expect([...editor.domElement.querySelectorAll('.events-editor-group')].map(g => g.textContent)).toEqual([ 'Routines', 'Property sets' ]);
    editor.expandedEvents.onEnter = true;
    editor.render();
    expect(editor.domElement.querySelector('.events-editor-subtitle').textContent).toBe('Applied to any widget dropped into this holder.');
    const { editor: lineEditor } = makeEditor({ type: 'line', onEnter: { activeFace: 1 } });
    lineEditor.expandedEvents.onEnter = true;
    lineEditor.render();
    expect(lineEditor.domElement.querySelector('.events-editor-subtitle').textContent).toContain('dropped onto this line');
  });

  test('the add button of a property set is disabled while it would do nothing', () => {
    const { editor } = makeEditor({ type: 'holder', onEnter: { activeFace: 1 } });
    editor.expandedEvents.onEnter = true;
    editor.render();
    const nameInput = editor.domElement.querySelector('.events-editor-property-name');
    const addButton = editor.domElement.querySelector('.events-editor-property-add-button');
    expect(addButton.disabled).toBe(true);
    nameInput.value = 'activeFace'; // already in the set
    nameInput.dispatchEvent(new Event('input'));
    expect(addButton.disabled).toBe(true);
    nameInput.value = 'rotation';
    nameInput.dispatchEvent(new Event('input'));
    expect(addButton.disabled).toBe(false);
  });

  test('automation cards are collapsed by default and expand to one row per entry', () => {
    const { editor } = makeEditor({ type: 'line', onEnter: { activeFace: 1, cardType: 'stop' } });
    expect(editor.domElement.querySelector('.events-editor-property-set')).toBeNull();
    editor.expandedEvents.onEnter = true;
    editor.render();
    const keys = [...editor.domElement.querySelectorAll('.events-editor-property-key')].map(e => e.textContent);
    expect(keys).toEqual([ 'activeFace', 'cardType' ]);
    const values = [...editor.domElement.querySelectorAll('.events-editor-property-value')].map(e => e.value);
    expect(values).toEqual([ '1', 'stop', '' ]); // the two entries, and the empty one of the add row
  });

  test('editing a value reports the whole set with that entry parsed', () => {
    let received = null;
    const { editor } = makeEditor({ type: 'holder', onLeave: { activeFace: 1, cardType: 'x' } }, (property, value) => received = { property, value });
    editor.expandedEvents.onLeave = true;
    editor.render();
    const input = editor.domElement.querySelector('.events-editor-property-value');
    input.value = '0';
    input.dispatchEvent(new Event('change'));
    expect(received).toEqual({ property: 'onLeave', value: { activeFace: 0, cardType: 'x' } });
    // a value that is not JSON stays the text that was typed
    const cardTypeInput = [...editor.domElement.querySelectorAll('.events-editor-property-value')][1];
    cardTypeInput.value = 'stop';
    cardTypeInput.dispatchEvent(new Event('change'));
    expect(received.value.cardType).toBe('stop');
  });

  test('a value that is text keeps being text when its row is edited', () => {
    // "0" the text and 0 the number are two different values, and a row that
    // showed both as 0 rewrote the first one as the second on the next edit
    let received = null;
    const { editor } = makeEditor({ type: 'holder', onEnter: { n: '0', flag: 'true' } }, (property, value) => received = value);
    editor.expandedEvents.onEnter = true;
    editor.render();
    const values = [...editor.domElement.querySelectorAll('.events-editor-property-value')].map(e => e.value);
    expect(values).toEqual([ '"0"', '"true"', '' ]); // in quotes, which is what they are
    const input = editor.domElement.querySelector('.events-editor-property-value');
    input.value = '"1"';
    input.dispatchEvent(new Event('change'));
    expect(received.n).toBe('1');
    expect(received.flag).toBe('true');
    // and without the quotes it is the number it looks like
    input.value = '1';
    input.dispatchEvent(new Event('change'));
    expect(received.n).toBe(1);
  });

  test('adding an entry names it, removing the last one removes the property', () => {
    let received = null;
    const { widget, editor } = makeEditor({ type: 'line' }, (property, value) => {
      received = { property, value };
      if(value === undefined)
        delete widget.state[property];
      else
        widget.state[property] = value;
    });
    editor.expandedEvents.onEnter = true;
    editor.render();
    const nameInput = editor.domElement.querySelector('.events-editor-property-name');
    nameInput.value = 'rotation';
    [...editor.domElement.querySelectorAll('.events-editor-property-add-button')][0].dispatchEvent(new Event('click'));
    expect(received).toEqual({ property: 'onEnter', value: { rotation: '' } });

    editor.domElement.querySelector('.events-editor-property-row .events-editor-remove').dispatchEvent(new Event('click'));
    expect(received).toEqual({ property: 'onEnter', value: undefined });
  });

  test('the add row proposes property names the room uses', () => {
    widgets.set('otherWidget', { id: 'otherWidget', state: { id: 'otherWidget', cardType: 'a' } });
    try {
      const { editor } = makeEditor({ type: 'line' });
      editor.expandedEvents.onEnter = true;
      editor.render();
      const options = [...editor.domElement.querySelectorAll('datalist option')].map(o => o.value);
      expect(options).toContain('cardType');
      expect(options).toContain('dropTarget'); // from the validator's property tables
    } finally {
      widgets.delete('otherWidget');
    }
  });

  test('Record snapshots current state including positional defaults', () => {
    const defaults = { x: 100, y: 50, z: 2, rotation: 0, parent: null, owner: null, activeFace: 1 };
    const widget = { state: { type: 'card', clickRoutine: [ { func: 'FLIP' } ], customProp: 'v' }, getDefaultValue(p) { return defaults[p]; }, get(p) { return p in defaults ? defaults[p] : this.state[p]; } };
    const editor = new EventsEditor(widget, () => {});
    expect(editor.recordResetProperties()).toEqual({ x: 100, y: 50, z: 2, rotation: 0, parent: null, owner: null, activeFace: 1, customProp: 'v' });
  });

  test('Record leaves out a property the widget does not have at all', () => {
    // get() answers null for a property the widget has never heard of, the same
    // way it does for an empty one - RESET would go on to set that null
    const defaults = { x: 10, y: 20, z: 0, rotation: 0, parent: null, owner: null };
    const widget = { state: { type: 'holder' }, getDefaultValue(p) { return defaults[p]; }, get(p) { return p in defaults ? defaults[p] : (this.state[p] !== undefined ? this.state[p] : null); } };
    const editor = new EventsEditor(widget, () => {});
    const snapshot = editor.recordResetProperties();
    expect(snapshot).not.toHaveProperty('activeFace');
    expect(snapshot.parent).toBe(null);
  });

  test('Play applies each resetProperties entry to the widget', () => {
    const calls = [];
    const { editor } = makeEditor({ type: 'button', resetProperties: { x: 5, parent: null } }, (property, value) => calls.push([ property, value ]));
    editor.expandedEvents.resetProperties = true;
    editor.render();
    const play = [...editor.domElement.querySelectorAll('.events-editor-property-buttons button')].find(b => b.textContent.includes('Apply values now'));
    play.dispatchEvent(new Event('click'));
    expect(calls).toContainEqual([ 'x', 5 ]);
    expect(calls).toContainEqual([ 'parent', null ]);
  });
});

describe('resetting parameters to their default', () => {
  function showPopup(operation, parameterNames) {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineStringPopup();
    popup.setSource(source);
    popup.setOperationDetails(operation, parameterNames, { state: {} }, [], []);
    popup.show();
    return popup;
  }

  test('explicitly set parameters offer a use-default button that unsets them', () => {
    const popup = showPopup({ func: 'AUDIO', player: 'p1' }, [ 'player' ]);
    let value = null;
    popup.registerChangeListener(v => value = v);
    const clear = popup.domElement.querySelector('.popup-use-default');
    expect(clear).not.toBeNull();
    clear.dispatchEvent(new Event('click'));
    expect('player' in value && value.player === undefined).toBe(true);
    popup.hide();
  });

  test('no use-default button when the parameter is not explicitly set', () => {
    const popup = showPopup({ func: 'AUDIO' }, [ 'player' ]);
    expect(popup.domElement.querySelector('.popup-use-default')).toBeNull();
    popup.hide();
  });

  test('the use-default button sits next to the value input, above the sections', () => {
    const popup = showPopup({ func: 'AUDIO', player: 'p1' }, [ 'player' ]);
    const row = popup.domElement.querySelector('.popup-value-row');
    expect(row.querySelector('.popup-value-input')).not.toBeNull();
    expect(row.querySelector('.popup-use-default')).not.toBeNull();
    // right after the title, before the first accordion section
    expect(row.previousElementSibling.tagName).toBe('H1');
    popup.hide();
  });

  test('unsetting condition on IF restores the operand template', () => {
    const editor = editorForOperation({ func: 'IF', condition: '${x}', thenRoutine: [ { func: 'FLIP' } ] });
    const operation = { func: 'IF', condition: '${x}', thenRoutine: [ { func: 'FLIP' } ] };
    editor.setOperationDetails({ state: {} }, operation, [], []);
    expect(editor.getTemplate()).toContain('{condition}');
    let result = null;
    editor.registerChangeListener(v => result = v);
    editor.onNewValue({ condition: undefined });
    expect(result.condition).toBeUndefined();
    expect(result.thenRoutine).toEqual([ { func: 'FLIP' } ]);
    expect(editor.getTemplate()).toContain('{operand1} {relation} {operand2}');
  });

  test('default-null parameters display as the blank they are, explicit null keeps its display', () => {
    const editor = editorForOperation({ func: 'SELECT' });
    editor.setOperationDetails({ state: {} }, { func: 'SELECT' }, [], []);
    expect(editor.getDisplayedValue('sortBy')).toBe('number or text');
    const setEditor = editorForOperation({ func: 'SET', value: null });
    setEditor.setOperationDetails({ state: {} }, { func: 'SET', value: null }, [], []);
    expect(String(setEditor.getDisplayedValue('value'))).toBe('null'); // explicit null is a real value, rendered as-is
  });
});

describe('the values a parameter popup offers', () => {
  function showPopup(PopupClass, operation, parameterNames, variables = [], collections = []) {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new PopupClass();
    popup.setSource(source);
    popup.setOperationDetails(operation, parameterNames, { state: {} }, variables, collections);
    popup.show();
    return popup;
  }

  const sectionTitles = popup => [...popup.domElement.querySelectorAll('.accordion-section h3')].map(h => h.firstChild.textContent);

  test('one section for what the routine offers instead of four named after the engine', () => {
    const popup = showPopup(RoutineStringPopup, { func: 'LABEL' }, [ 'value' ], [ 'cards' ]);
    expect(sectionTitles(popup)).toEqual([ 'Values the routine has', 'A property of a widget in the room' ]);
    popup.hide();
  });

  // a value and a group of widgets are two different answers, so they are two
  // sections - and only one of them is open, so only one color is on screen
  test('one section per kind of value, the origin a plain line inside it', () => {
    const popup = showPopup(RoutineHoldersOrCollectionSourcePopup, { func: 'FLIP' }, [ 'holder', 'collection' ], [ 'cards' ], [ 'aces' ]);
    // a property of a widget follows the widgets themselves: both are about
    // something in the room, the routine's own values are another thought
    expect(sectionTitles(popup)).toEqual([
      'Widgets in the room', 'A property of a widget in the room', 'Values the routine has', 'Groups of widgets the routine has'
    ]);
    const groups = [...popup.domElement.querySelectorAll('.popup-value-group')];
    expect(groups.map(g => g.textContent)).toEqual([
      'From earlier operations', 'In every routine', 'From earlier operations', 'In every routine'
    ]);
    // the color is the section's, so the lines inside it carry none of their own
    expect(groups.every(g => !g.dataset.kind)).toBe(true);
    popup.hide();
  });

  test('the sections are colored by what they produce and only one is open', () => {
    const popup = showPopup(RoutineHoldersOrCollectionSourcePopup, { func: 'FLIP' }, [ 'holder', 'collection' ], [ 'cards' ], [ 'aces' ]);
    const sections = [...popup.domElement.querySelectorAll('.accordion-section')];
    expect(sections.map(s => s.dataset.kind)).toEqual([ 'widget', 'property', 'variable', 'collection' ]);
    expect(sections.filter(s => s.classList.contains('open'))).toHaveLength(1);
    expect(sections[0].classList.contains('open')).toBe(true);
    sections[1].querySelector('h3').dispatchEvent(new Event('click'));
    expect(sections.filter(s => s.classList.contains('open'))).toHaveLength(1);
    expect(sections[1].classList.contains('open')).toBe(true);
    popup.hide();
  });

  test('what an entry is stays a hover tip instead of a line of its own', () => {
    const popup = showPopup(RoutineStringPopup, { func: 'LABEL' }, [ 'value' ], [ 'cards' ]);
    expect(popup.domElement.querySelector('.popup-entry-description')).toBeNull();
    const playerName = [...popup.domElement.querySelectorAll('.popup-entry button')].find(b => b.textContent == 'playerName');
    expect(playerName.title).toBe('name of the player who started the routine');
    popup.hide();
  });

  test('a value of the routine is used as a variable, a collection as a collection', () => {
    const popup = showPopup(RoutineHoldersOrCollectionSourcePopup, { func: 'FLIP' }, [ 'holder', 'collection' ], [ 'cards' ], [ 'aces' ]);
    let value = null;
    popup.registerChangeListener(v => value = v);
    const clickButton = label => [...popup.domElement.querySelectorAll('.popup-entry button')].find(b => b.textContent == label).dispatchEvent(new Event('click'));
    clickButton('cards');
    expect(value).toEqual({ holder: '${cards}', collection: undefined });
    clickButton('aces');
    expect(value).toEqual({ holder: undefined, collection: 'aces' });
    clickButton('playerSeats'); // a predefined collection is a collection like any other
    expect(value).toEqual({ holder: undefined, collection: 'playerSeats' });
    popup.hide();
  });

  // selecting the text of the value field by dragging across it ends outside the
  // popup as often as not, and the click that follows is reported on the page
  test('dragging a text selection out of an input does not close the popup', async () => {
    const popup = showPopup(RoutineStringPopup, { func: 'LABEL', value: 'hello' }, [ 'value' ], [ 'cards' ]);
    await new Promise(resolve => setTimeout(resolve, 0)); // the outside-click listener is added deferred
    const input = popup.domElement.querySelector('.popup-value-input');
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(document.contains(popup.domElement)).toBe(true);
    // a click that really started outside still closes it
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(document.contains(popup.domElement)).toBe(false);
  });

  test('a popup for a value that cannot hold widgets leaves the collections out', () => {
    const popup = showPopup(RoutineStringPopup, { func: 'LABEL' }, [ 'value' ], [ 'cards' ], [ 'aces' ]);
    const labels = [...popup.domElement.querySelectorAll('.popup-entry button')].map(b => b.textContent);
    expect(labels).toContain('cards');
    expect(labels).toContain('playerName');
    expect(labels).not.toContain('aces');
    popup.hide();
  });
});

describe('information about an operation and its parameters', () => {
  // clicks an info button and returns the text of the tip it opened
  function infoTextOf(button) {
    button.dispatchEvent(new Event('click'));
    const popups = [...document.querySelectorAll('.inline-popup')];
    const popup = popups[popups.length-1];
    const text = popup.textContent;
    popup.remove();
    return text;
  }

  // the info tip of the popup a parameter chip opens
  function parameterInfo(operation, parameterNames) {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineStringPopup();
    popup.setSource(source);
    popup.setOperationDetails(operation, parameterNames, { state: {} }, [], []);
    popup.show();
    const text = infoTextOf(popup.domElement.querySelector('h1 .info-button'));
    popup.hide();
    return text;
  }

  test('an info tip is clicked open and clicked shut again', () => {
    for(const stale of document.querySelectorAll('.inline-popup'))
      stale.remove();
    const dom = document.createElement('div');
    document.getElementById('editor').append(dom);
    const info = infoButton(dom, 'a short explanation');
    // a pointer traveling past the button leaves it alone
    info.dispatchEvent(new Event('mouseenter'));
    expect(document.querySelectorAll('.inline-popup')).toHaveLength(0);
    info.dispatchEvent(new Event('click'));
    expect([...document.querySelectorAll('.inline-popup')].pop().textContent).toContain('a short explanation');
    info.dispatchEvent(new Event('click')); // the same button closes it again
    expect(document.querySelectorAll('.inline-popup')).toHaveLength(0);
    for(const popup of document.querySelectorAll('.inline-popup'))
      popup.remove();
    dom.remove();
  });

  test('the operation name carries the text of the whole operation', () => {
    const editor = editorForOperation({ func: 'MOVE', from: 'h1' });
    editor.setOperationDetails({ state: {} }, { func: 'MOVE', from: 'h1' }, [], []);
    const dom = editor.render();
    document.getElementById('editor').append(dom);
    expect(infoTextOf(dom.querySelector('.routine-editor-func-info'))).toContain('This function moves widgets into a target');
    dom.remove();
  });

  test('a parameter popup shows the line its operation describes the parameter with', () => {
    const text = parameterInfo({ func: 'MOVE', from: 'h1' }, [ 'count' ]);
    expect(text).toContain('limits the amount of moved widgets');
    expect(text).not.toContain('This function moves widgets into a target'); // just the parameter, not everything
    expect(text).toContain('for the whole operation'); // ...which is one hover away, as a topic link
    expect(text).toContain('See MOVE');
  });

  test('a parameter with a topic of its own uses that text', () => {
    expect(parameterInfo({ func: 'MOVE', from: 'h1' }, [ 'from' ]))
      .toContain('The from parameter specifies the widget(s) that contains the widgets to move');
  });

  test('a custom property the operation does not support falls back to the operation text', () => {
    expect(parameterInfo({ func: 'MOVE', from: 'h1', typo: 1 }, [ 'typo' ]))
      .toContain('This function moves widgets into a target');
  });

  test('every declared parameter of every operation is described somewhere', () => {
    for(const func in routineOperationMetadata) {
      const topic = commonInfoTopic(func);
      expect(topic).toBeDefined();
      for(const name in routineOperationMetadata[func].parameters) {
        // a chip standing for a part of another parameter is described by that one
        const described = routineOperationMetadata[func].parameters[name].describedBy || name;
        expect(commonInfoTopic(`${func}.${described}`) || parameterInfoLine(topic.info, described)).toBeTruthy();
      }
    }
  });

  test('parameters listed together are found by each of their names', () => {
    const line = parameterInfoLine('x / y: number - the target position.\nnope: something else.', 'y');
    expect(line).toBe('x / y: number - the target position.');
    expect(parameterInfoLine('x and y: number - the pixel coordinates.', 'x')).toContain('pixel coordinates');
    expect(parameterInfoLine('count: number - how often.', 'unrelated')).toBeNull();
  });

  test('an info popup is titled, its prose is paragraphs and its parameters a list', () => {
    for(const stale of document.querySelectorAll('.inline-popup'))
      stale.remove();
    const dom = document.createElement('div');
    document.getElementById('editor').append(dom);
    const topic = commonInfoTopic('MOVE');
    infoButton(dom, topic.info, topic.tutorial, null, 'MOVE').dispatchEvent(new Event('click'));
    const popup = [...document.querySelectorAll('.inline-popup')].pop();
    expect(popup.querySelector('h1 .popup-title-text').textContent).toBe('MOVE');
    expect(popup.querySelector('h1 .popup-close')).not.toBeNull(); // the close belongs to the title bar
    expect(popup.querySelector('pre')).toBeNull(); // no wall of monospace
    expect([...popup.querySelectorAll('.accordion-section h3')].map(h => h.textContent)).toEqual([ 'Tutorial' ]); // the text is not a section
    expect([...popup.querySelectorAll('.popup-info-parameters dt')].map(d => d.textContent.trim())).toContain('count');
    expect(popup.querySelector('.popup-info-parameters dd').textContent).toContain('specifies the widget(s)');
    popup.remove();
    dom.remove();
  });

  test('the tutorial link carries the room id as text, never as markup', () => {
    // roomID is the query parameter plus whatever the player typed on the
    // welcome screen, so it never reaches the DOM as HTML
    const previousRoomID = window.roomID;
    window.roomID = '"><img src=x onerror=alert(1)>';
    try {
      const source = document.createElement('span');
      document.getElementById('editor').append(source);
      const popup = new InfoPopup(source, 'text', 'functions-move');
      popup.show();
      expect(popup.domElement.querySelector('img')).toBeNull();
      const link = popup.domElement.querySelector('.accordion-content a');
      expect(link.getAttribute('href')).toBe(`tutorial/functions-move/ROOM:${encodeURIComponent(window.roomID)}-tutorials`);
      popup.hide();
    } finally {
      window.roomID = previousRoomID;
    }
  });

  test('only the lines naming a parameter become list entries, prose stays prose', () => {
    const html = structureInfoHTML('<pre>\nThis does something: really.\n\nParameters:\n\ncount: number - how often.\nnope, no colon here\n</pre>');
    expect(html).toContain('<dt>count</dt>');
    expect(html).toContain('<div class=popup-info-heading>Parameters</div>');
    expect(html).toContain('<p>This does something: really.</p>'); // a sentence, not a parameter
    expect(html).toContain('<p>nope, no colon here</p>');
  });
});

describe('the current value as editable text', () => {
  function showPopup(PopupClass, operation, parameterNames, widget = { state: {} }) {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new PopupClass({});
    popup.setSource(source);
    popup.setOperationDetails(operation, parameterNames, widget, [], []);
    popup.show();
    return popup;
  }

  const valueInput = popup => popup.domElement.querySelector('.popup-value-input');

  test('the text input starts with the value the parameter has', () => {
    const popup = showPopup(RoutineStringPopup, { func: 'LABEL', value: 'hello' }, [ 'value' ]);
    expect(valueInput(popup).value).toBe('hello');
    popup.hide();

    const widgetPopup = showPopup(RoutineWidgetIDPopup, { func: 'MOVE', from: [ 'h1', 'h2' ] }, [ 'from' ]);
    expect(valueInput(widgetPopup).value).toBe('["h1","h2"]'); // non-strings as JSON
    widgetPopup.hide();
  });

  test('a text parameter keeps what was typed, other parameters read it as JSON', () => {
    const string = showPopup(RoutineStringPopup, { func: 'LABEL' }, [ 'value' ]);
    let value = null;
    string.registerChangeListener(v => value = v);
    valueInput(string).value = '42';
    valueInput(string).dispatchEvent(new Event('change'));
    expect(value).toEqual({ value: '42' });
    string.hide();

    const widgetPopup = showPopup(RoutineWidgetIDPopup, { func: 'MOVE' }, [ 'to' ]);
    widgetPopup.registerChangeListener(v => value = v);
    valueInput(widgetPopup).value = '[ "h1" ]';
    valueInput(widgetPopup).dispatchEvent(new Event('change'));
    expect(value).toEqual({ to: [ 'h1' ] });
    // a bare word is a widget id, not broken JSON
    valueInput(widgetPopup).value = '${PROPERTY parent}';
    valueInput(widgetPopup).dispatchEvent(new Event('change'));
    expect(value).toEqual({ to: '${PROPERTY parent}' });
    widgetPopup.hide();
  });

  test('a var statement shows the part its chip stands for', () => {
    const popup = showPopup(RoutineStringPopup, 'var score = 5 + 3', [ 'expression' ]);
    expect(valueInput(popup).value).toBe('5 + 3');
    popup.hide();

    const unparsable = showPopup(RoutineStringPopup, '// a comment', [ 'expression' ]);
    expect(valueInput(unparsable).value).toBe(''); // not "null"
    unparsable.hide();
  });

  test('the JSON popup keeps its textarea instead of a second value input', () => {
    const popup = showPopup(RoutineJSONPopup, { func: 'SELECT', sortBy: [ 'a' ] }, [ 'sortBy' ]);
    expect(valueInput(popup)).toBeNull();
    expect(popup.domElement.querySelector('textarea')).not.toBeNull();
    expect(popup.domElement.querySelector('.popup-use-default')).not.toBeNull();
    popup.hide();
  });
});

describe('the widget property builder', () => {
  function showPopup(operation, parameterNames, widget) {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineStringPopup();
    popup.setSource(source);
    popup.setOperationDetails(operation, parameterNames, widget, [], []);
    popup.show();
    return popup;
  }

  const parts = popup => ({
    name: popup.domElement.querySelector('.popup-property-name'),
    widget: popup.domElement.querySelector('.popup-property-widget'),
    suggestions: [...popup.domElement.querySelectorAll('.popup-property-row option')].map(o => o.value),
    use: [...popup.domElement.querySelectorAll('button')].find(b => b.textContent == 'use property')
  });

  const button1 = { id: 'button1', state: { id: 'button1', parent: 'holder1', score: 0 }, get: p => button1.state[p] };

  beforeEach(() => {
    widgets.clear();
    widgets.set('button1', button1);
    widgets.set('card1', { id: 'card1', state: { id: 'card1', owner: 'me' }, get: p => 'card1' });
  });

  afterEach(() => widgets.clear());

  test('an empty widget field means the widget the routine belongs to', () => {
    const popup = showPopup({ func: 'LABEL' }, [ 'value' ], button1);
    let value = null;
    popup.registerChangeListener(v => value = v);
    const { name, widget, use } = parts(popup);
    expect(widget.placeholder).toBe('this widget');
    expect(widget.value).toBe('');
    name.value = 'score';
    use.dispatchEvent(new Event('click'));
    expect(value).toEqual({ value: '${PROPERTY score}' });
    popup.hide();
  });

  test('a target widget becomes the OF part', () => {
    const popup = showPopup({ func: 'LABEL' }, [ 'value' ], button1);
    let value = null;
    popup.registerChangeListener(v => value = v);
    const { name, widget, use } = parts(popup);
    name.value = 'owner';
    widget.value = 'card1';
    use.dispatchEvent(new Event('click'));
    expect(value).toEqual({ value: '${PROPERTY owner OF card1}' });
    popup.hide();
  });

  test('the suggestions are the properties of the widget the value is read from', () => {
    const popup = showPopup({ func: 'LABEL' }, [ 'value' ], button1);
    expect(parts(popup).suggestions).toEqual([ 'id', 'parent', 'score' ]);
    const widget = parts(popup).widget;
    widget.value = 'card1';
    widget.dispatchEvent(new Event('input'));
    expect(parts(popup).suggestions).toEqual([ 'id', 'owner' ]);
    popup.hide();
  });

  test('an existing property reference fills both fields', () => {
    const popup = showPopup({ func: 'LABEL', value: '${PROPERTY owner OF card1}' }, [ 'value' ], button1);
    expect(parts(popup).name.value).toBe('owner');
    expect(parts(popup).widget.value).toBe('card1');
    expect(parts(popup).suggestions).toEqual([ 'id', 'owner' ]); // for that widget
    popup.hide();

    const plain = showPopup({ func: 'LABEL', value: 'just text' }, [ 'value' ], button1);
    expect(parts(plain).name.value).toBe('');
    expect(parts(plain).widget.value).toBe('');
    plain.hide();
  });

  test('names the engine syntax cannot hold verbatim are escaped', () => {
    const popup = showPopup({ func: 'LABEL' }, [ 'value' ], button1);
    let value = null;
    popup.registerChangeListener(v => value = v);
    const { name, use } = parts(popup);
    name.value = 'my.property';
    use.dispatchEvent(new Event('click'));
    expect(value).toEqual({ value: '${PROPERTY my\\u002eproperty}' });
    popup.hide();

    // ...and read back into the field again
    const reopened = showPopup({ func: 'LABEL', value: '${PROPERTY my\\u002eproperty}' }, [ 'value' ], button1);
    expect(parts(reopened).name.value).toBe('my.property');
    reopened.hide();
  });

  test('a name containing " OF " does not become the separator', () => {
    const popup = showPopup({ func: 'LABEL' }, [ 'value' ], button1);
    let value = null;
    popup.registerChangeListener(v => value = v);
    const { name, widget, use } = parts(popup);
    name.value = 'points OF round';
    widget.value = 'card1';
    use.dispatchEvent(new Event('click'));
    expect(value).toEqual({ value: '${PROPERTY points\\u0020OF round OF card1}' });
    popup.hide();

    const reopened = showPopup({ func: 'LABEL', value: value.value }, [ 'value' ], button1);
    expect(parts(reopened).name.value).toBe('points OF round');
    expect(parts(reopened).widget.value).toBe('card1');
    reopened.hide();
  });

  test('an empty property name applies nothing', () => {
    const popup = showPopup({ func: 'LABEL' }, [ 'value' ], button1);
    let notified = false;
    popup.registerChangeListener(() => notified = true);
    const { name, use } = parts(popup);
    name.value = '  ';
    use.dispatchEvent(new Event('click'));
    expect(notified).toBe(false);
    expect(name.classList.contains('inputError')).toBe(true);
    popup.hide();
  });

  test('picking the widget in the room fills the value in instead of dismissing the popup', async () => {
    const roomArea = div(document.body, '');
    roomArea.id = 'roomArea';
    const clickedWidget = div(roomArea, '');
    const popup = showPopup({ func: 'LABEL' }, [ 'value' ], button1);
    let value = null;
    popup.registerChangeListener(v => value = v);
    parts(popup).name.value = 'owner';
    popup.domElement.querySelector('.propertyExpandButton').onclick(new Event('click'));
    [...popup.domElement.querySelectorAll('.widgetSelectPopout button')].find(b => b.textContent == 'Pick in the room').onclick();
    await new Promise(resolve => setTimeout(resolve, 0)); // outside clicks are listened for a tick after showing

    expect(handleWidgetPickerClick(widgets.get('card1'))).toBe(true);
    clickedWidget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // the pick is the last thing the value was missing, and the click that made
    // it must not count as a click outside the popup
    expect(value).toEqual({ value: '${PROPERTY owner OF card1}' });
    expect(parts(popup).widget.value).toBe('card1');
    expect(document.getElementById('editor').contains(popup.domElement)).toBe(true);
    popup.hide();
    roomArea.remove();
  });
});

describe('color, icon and sound parameters use the picker popups', () => {
  function editorFor(operation) {
    const editor = editorForOperation(operation);
    editor.setOperationDetails({ state: {} }, operation, [], []);
    return editor;
  }

  test('CANVAS color and INPUT icons open the picker popups', () => {
    expect(editorFor({ func: 'CANVAS' }).createPopup([ 'color' ])).toBeInstanceOf(RoutineColorPopup);
    expect(editorFor({ func: 'INPUT' }).createPopup([ 'confirmButtonIcon' ])).toBeInstanceOf(RoutineIconPopup);
    expect(editorFor({ func: 'INPUT' }).createPopup([ 'cancelButtonIcon' ])).toBeInstanceOf(RoutineIconPopup);
  });

  test('the sound of an AUDIO opens the sound picker popup', () => {
    expect(editorFor({ func: 'AUDIO' }).createPopup([ 'source' ])).toBeInstanceOf(RoutineSoundPopup);
  });

  test('the sound popup applies the path it was given when it closes', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineSoundPopup();
    popup.setSource(source);
    popup.setOperationDetails({ func: 'AUDIO' }, [ 'source' ], { state: {} }, [], []);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.show(); // SoundInput is absent in jest, so the text fallback is used
    const input = popup.domElement.querySelector('input[type=text]');
    input.value = '/i/audio/casino/card-shuffle.mp3';
    input.dispatchEvent(new Event('change'));
    expect(value).toBeNull(); // nothing applied until the popup closes
    popup.hide();
    expect(value).toEqual({ source: '/i/audio/casino/card-shuffle.mp3' });
  });

  test('a click on a widget in the room closes the sound popup', () => {
    // it keeps out of the play area so the library it opens is not covered, but
    // the room is none of its inputs: a click in there selects another widget,
    // and the popup would go on writing the sound to the widget that was shown
    // before it
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const clickedWidget = div(document.getElementById('roomArea'), '');
    const popup = new RoutineSoundPopup();
    popup.setSource(source);
    popup.setOperationDetails({ func: 'AUDIO' }, [ 'source' ], { state: {} }, [], []);
    popup.show();
    expect(popup.usesRoomAsInput()).toBe(false);
    popup.onOutsideClick({ target: clickedWidget });
    expect(document.getElementById('editor').contains(popup.domElement)).toBe(false);
    clickedWidget.remove();
  });

  test('a click in the sound library does not close the popup that opened it', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const overlay = div(document.body, '');
    overlay.id = 'audioPickerOverlay';
    const popup = new RoutineSoundPopup();
    popup.setSource(source);
    popup.setOperationDetails({ func: 'AUDIO' }, [ 'source' ], { state: {} }, [], []);
    popup.show();
    popup.onOutsideClick({ target: overlay });
    expect(document.getElementById('editor').contains(popup.domElement)).toBe(true);
    popup.hide();
    overlay.remove();
  });

  test('the picker applies its working value when the popup closes', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineColorPopup();
    popup.setSource(source);
    popup.setOperationDetails({ func: 'CANVAS' }, [ 'color' ], { state: {} }, [], []);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.show(); // ColorInput is absent in jest, so the text fallback is used
    const input = popup.domElement.querySelector('input[type=text]');
    expect(input).not.toBeNull();
    input.value = '#ff0000';
    input.dispatchEvent(new Event('change'));
    expect(value).toBeNull(); // nothing applied until the popup closes
    popup.hide();
    expect(value).toEqual({ color: '#ff0000' });
  });

  test('closing without a change applies nothing', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineColorPopup();
    popup.setSource(source);
    popup.setOperationDetails({ func: 'CANVAS' }, [ 'color' ], { state: {} }, [], []);
    let notified = false;
    popup.registerChangeListener(() => notified = true);
    popup.show();
    popup.hide();
    expect(notified).toBe(false);
  });
});

describe('number popups with text values', () => {
  test('offer the suggested values and accept free text', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineNumberPopup({ specialValues: [ 'start', 'end' ], textHint: 'name of a timer property to read the time from' });
    popup.setSource(source);
    popup.setOperationDetails({ func: 'TIMER' }, [ 'value' ], { state: {} }, [], []);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.show();
    const buttons = [...popup.domElement.querySelectorAll('button')].map(b => b.textContent);
    expect(buttons).toEqual(expect.arrayContaining([ 'start', 'end' ]));
    const text = popup.domElement.querySelector('input[type=text]');
    expect(text).not.toBeNull();
    text.value = 'myTime';
    text.dispatchEvent(new Event('change'));
    expect(value).toEqual({ value: 'myTime' });
    popup.hide();
  });

  test('the text hint becomes the placeholder of the value input', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const withHint = new RoutineNumberPopup({ textHint: 'name of a timer property to read the time from' });
    withHint.setSource(source);
    withHint.setOperationDetails({ func: 'TIMER' }, [ 'value' ], { state: {} }, [], []);
    withHint.show();
    expect(withHint.domElement.querySelector('.popup-value-input').placeholder).toContain('timer property');
    withHint.hide();

    const plain = new RoutineNumberPopup({});
    plain.setSource(source);
    plain.setOperationDetails({ func: 'CLICK' }, [ 'count' ], { state: {} }, [], []);
    plain.show();
    expect(plain.domElement.querySelector('.popup-value-input').placeholder).toBe('value');
    plain.hide();
  });

  test('a number typed into the value input stays a number', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineNumberPopup({});
    popup.setSource(source);
    popup.setOperationDetails({ func: 'CLICK' }, [ 'count' ], { state: {} }, [], []);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.show();
    const input = popup.domElement.querySelector('.popup-value-input');
    input.value = '42';
    input.dispatchEvent(new Event('change'));
    expect(value).toEqual({ count: 42 });
    popup.hide();
  });

  test('offer 0 as a value - "use default" is what clears the parameter', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineNumberPopup({});
    popup.setSource(source);
    popup.setOperationDetails({ func: 'MOVEXY', x: 5 }, [ 'x' ], { state: {} }, [], []);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.show();
    const zero = [...popup.domElement.querySelectorAll('button')].find(b => b.textContent == '0');
    expect(zero).not.toBeUndefined();
    zero.dispatchEvent(new Event('click'));
    expect(value).toEqual({ x: 0 });
    popup.hide();
  });

  test('a parameter offers null only where leaving it out is one of the things it says', () => {
    for(const func in routineOperationMetadata)
      for(const name in routineOperationMetadata[func].parameters) {
        const spec = routineOperationMetadata[func].parameters[name];
        if((spec.special || []).indexOf(null) == -1)
          continue;
        // a SCORE without a round adds a new one, which is a choice like naming
        // a round rather than an empty value - so it is one entry of the
        // drop-down, in the words the sentence uses, instead of "use default"
        expect(spec.menu).toBe(true);
        expect(typeof spec.display == 'function' ? spec.display(null) : (spec.display || {})['null']).toBeTruthy();
      }
  });
});

describe('the shared widget picker', () => {
  function room(...definitions) {
    widgets.clear();
    for(const [ id, type, parent ] of definitions) {
      const state = { id, type, parent: parent || null };
      widgets.set(id, { id, state, get: p => state[p] });
    }
    return id => widgets.get(id);
  }

  // a band drawn in the room reaches the picker as a selection change, and that
  // is the only selection it takes: one made anywhere else is the editor moving
  // on to another widget, waiting picker or not
  function selectInRoom(selection) {
    return selectWidgetsInRoom(_=>handleWidgetPickerSelection(selection));
  }

  // renders the popout the properties sidebar and the routine editor share and
  // starts its in-room pick mode
  function pickInRoom(options) {
    const wrap = document.createElement('div');
    document.getElementById('editor').append(wrap);
    const controls = renderWidgetSelectPopout(wrap, widgets.get('target'), Object.assign({ inline: true }, options));
    controls.popout.querySelector('button[icon=colorize]').onclick();
    return controls;
  }

  afterEach(() => {
    stopWidgetPicker();
    widgets.clear();
  });

  test('the type filter also applies to picking in the room', () => {
    const get = room([ 'target', 'button' ], [ 'h1', 'holder' ], [ 'c1', 'card', 'h1' ]);
    let picked = null;
    pickInRoom({ typeFilter: 'holder', apply: id => picked = id });
    // the card covers the holder, so a click on it means the holder underneath
    selectInRoom([ get('c1') ]);
    expect(picked).toBe('h1');
  });

  test('a click that resolves to nothing matching is ignored', () => {
    const get = room([ 'target', 'button' ], [ 'l1', 'label' ]);
    let picked = null;
    pickInRoom({ typeFilter: 'holder', apply: id => picked = id });
    selectInRoom([ get('l1') ]);
    expect(picked).toBeNull();
    expect(isWidgetPickerActive()).toBe(true); // still waiting for a matching click
  });

  test('a selection made anywhere but in the room is not a pick', () => {
    const get = room([ 'target', 'button' ], [ 'h1', 'holder' ]);
    let picked = null;
    pickInRoom({ typeFilter: 'holder', apply: id => picked = id });
    // the editor selecting another widget on its own (the JSON editor's tree, a
    // link in the sidebar) is it moving on: taking that as a pick would both
    // write it into the parameter and put the editor back on the widget the
    // picker belongs to, so the sidebar could not move on at all while one runs
    expect(handleWidgetPickerSelection([ get('h1') ])).toBe(false);
    expect(picked).toBeNull();
  });

  test('without a type filter only resolveCovering pickers look past cards and piles', () => {
    const get = room([ 'target', 'button' ], [ 'h1', 'holder' ], [ 'p1', 'pile', 'h1' ], [ 'c1', 'card', 'p1' ], [ 'c2', 'card' ]);
    let picked = null;
    pickInRoom({ apply: id => picked = id });
    selectInRoom([ get('c1') ]); // the plain picker takes what was clicked
    expect(picked).toBe('c1');

    stopWidgetPicker();
    pickInRoom({ resolveCovering: true, apply: id => picked = id });
    selectInRoom([ get('c1') ]);
    expect(picked).toBe('h1');

    stopWidgetPicker();
    pickInRoom({ resolveCovering: true, apply: id => picked = id });
    selectInRoom([ get('c2') ]); // a card on the table stays itself
    expect(picked).toBe('c2');
  });

  test('a broken parent chain does not send the resolver in circles', () => {
    const get = room([ 'target', 'button' ], [ 'c1', 'card', 'c2' ], [ 'c2', 'card', 'c1' ]);
    let picked = null;
    pickInRoom({ typeFilter: 'holder', apply: id => picked = id });
    selectInRoom([ get('c1') ]);
    expect(picked).toBeNull();
  });

  test('picking several widgets keeps the pick mode running and collects them', () => {
    const get = room([ 'target', 'button' ], [ 'h1', 'holder' ], [ 'h2', 'holder' ], [ 'c1', 'card', 'h2' ]);
    let picked = [];
    pickInRoom({ multiple: true, resolveCovering: true, getSelectedIDs: () => picked, apply: ids => picked = ids });
    selectInRoom([ get('h1') ]);
    expect(isWidgetPickerActive()).toBe(true);
    selectInRoom([ get('c1') ]);
    expect(picked).toEqual([ 'h1', 'h2' ]);
  });

  test('the widget the picker belongs to is listed first when allowed and pickable in the room', () => {
    room([ 'target', 'holder' ], [ 'h1', 'holder' ]);
    let picked = null;
    const ids = controls => [...controls.popout.querySelectorAll('.widgetPickerEntry')].map(e => e.textContent.replace(/holder|this widget/g, ''));

    expect(ids(pickInRoom({ apply: id => picked = id }))).toEqual([ 'h1' ]);
    stopWidgetPicker();
    const controls = pickInRoom({ allowSelf: true, apply: id => picked = id });
    expect(ids(controls)).toEqual([ 'target', 'h1' ]);
    expect(controls.popout.querySelector('.widgetPickerSelf').textContent).toBe('this widget');

    // it stays selected while the picker runs, so a click on it never arrives as
    // a selection change - only as a click
    selectInRoom([ widgets.get('target') ]);
    expect(picked).toBeNull();
    expect(handleWidgetPickerClick(widgets.get('target'))).toBe(true);
    expect(picked).toBe('target');
  });

  test('a click in the room belongs to the picker instead of the widget', () => {
    const get = room([ 'target', 'button' ], [ 'h1', 'holder' ], [ 'l1', 'label' ]);
    let picked = null;
    pickInRoom({ typeFilter: 'holder', apply: id => picked = id });

    // a widget the filter rejects is not picked, but the click is still the
    // picker's: falling through would click the widget in the room
    expect(handleWidgetPickerClick(get('l1'))).toBe(true);
    expect(picked).toBeNull();
    expect(isWidgetPickerActive()).toBe(true);

    expect(handleWidgetPickerClick(get('h1'))).toBe(true);
    expect(picked).toBe('h1');
    expect(isWidgetPickerActive()).toBe(false); // a single pick ends the mode

    // without a picker the click is none of its business
    expect(handleWidgetPickerClick(get('h1'))).toBe(false);
  });

  test('a collection name is not mistaken for a widget id', () => {
    room([ 'target', 'holder' ], [ 'h1', 'holder' ]);
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineHoldersOrCollectionSourcePopup();
    popup.setSource(source);
    popup.setOperationDetails({ func: 'SELECT', collection: 'myCards' }, [ 'collection' ], widgets.get('target'), [], []);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.show();
    expect([...popup.domElement.querySelectorAll('.widgetPickerEntry.selected')]).toHaveLength(0);
    popup.hide();
  });

  test('the routine popup uses the shared picker and applies the selection', () => {
    room([ 'target', 'holder' ], [ 'h1', 'holder' ], [ 'h2', 'holder' ]);
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineWidgetIDPopup();
    popup.setSource(source);
    popup.setOperationDetails({ func: 'MOVE', from: [ 'h1' ] }, [ 'from' ], widgets.get('target'), [], []);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.show();

    const entries = [...popup.domElement.querySelectorAll('.widgetPickerEntry')];
    expect(entries.map(e => e.textContent.replace(/holder|this widget/g, ''))).toEqual([ 'target', 'h1', 'h2' ]);
    expect(entries[1].classList.contains('selected')).toBe(true); // seeded with the current value
    entries[2].onclick();
    const apply = [...popup.domElement.querySelectorAll('button')].find(b => b.textContent == 'Use these widgets');
    // the button the section is for is the filled one among the outlined ones
    expect(apply.classList.contains('primary')).toBe(true);
    expect([...popup.domElement.querySelectorAll('button.primary')]).toHaveLength(1);
    apply.dispatchEvent(new Event('click'));
    expect(value).toEqual({ from: [ 'h1', 'h2' ] });
    popup.hide();
  });

  // the facade the properties sidebar renders a multi-selection through
  // (MultiWidget): its id is the ids of all of them, so no widget in the room
  // has it - the widgets behind it are what says whether it is still there
  function multiSelection(...ids) {
    return { id: ids.join(','), isMulti: true, widgets: ids.map(id => widgets.get(id)) };
  }

  test('the parent picker of a multi-selection picks in the room', () => {
    const get = room([ 'h1', 'holder' ], [ 'h2', 'holder' ], [ 'h3', 'holder' ]);
    let picked = null;
    startWidgetPicker(multiSelection('h1', 'h2'), (target, pickedWidgets) => picked = pickedWidgets.map(w => w.id));
    expect(handleWidgetPickerClick(get('h3'))).toBe(true);
    expect(picked).toEqual([ 'h3' ]);
  });

  test('a picker of a multi-selection ends when one of its widgets is gone', () => {
    room([ 'h1', 'holder' ], [ 'h2', 'holder' ]);
    const facade = multiSelection('h1', 'h2');
    startWidgetPicker(facade, () => {});
    expect(widgetPickerTarget()).toBe(facade);
    // it does not end while they are there - the note used to say "h1,h2 is
    // gone" about widgets that are both in the room
    endWidgetPickerWithoutTarget();
    expect(isWidgetPickerActive()).toBe(true);

    widgets.delete('h1');
    expect(widgetPickerTarget()).toBeNull();
    endWidgetPickerWithoutTarget();
    expect(isWidgetPickerActive()).toBe(false);
    expect(document.querySelector('#editorNotes').lastChild.textContent).toBe('picking in the room ended: h1 is gone');
  });
});

describe('what the editor says about a write it made off screen', () => {
  // a color is picked by dragging, so the parameter is only written when the
  // popup closes - which is also what the editor moving on to another widget
  // does to it
  function colorPopupWithAPick(widget) {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineColorPopup();
    popup.setSource(source);
    popup.setOperationDetails({ func: 'CANVAS', color: '#1f5ca6' }, [ 'color' ], widget, [], []);
    popup.show();
    popup.applyValueInput('#3cb44b');
    return popup;
  }

  const lastNote = () => document.querySelector('#editorNotes').lastChild.textContent;

  beforeEach(() => {
    widgets.clear();
    const state = { id: 'button', type: 'button' };
    widgets.set('button', { id: 'button', state, get: p => state[p], set() {} });
  });

  test('the write is named with the widget it went to', () => {
    colorPopupWithAPick(widgets.get('button'));
    closeEditorPopups();
    expect(lastNote()).toBe('CANVAS color set to #3cb44b on button');
  });

  test('a widget that is on its way out of the room does not get credit for the write', () => {
    // a pile sets isBeingRemoved and then awaits three property changes before
    // it removes itself, so it is still in widgets under its own id - and the
    // sidebar drops writes to it for exactly that window (widgetStillExists)
    widgets.get('button').isBeingRemoved = true;
    colorPopupWithAPick(widgets.get('button'));
    closeEditorPopups();
    expect(lastNote()).toBe('CANVAS color was not set to #3cb44b: button is gone');
  });
});

describe('widget type presets', () => {
  function room(...definitions) {
    widgets.clear();
    for(const [ id, type ] of definitions) {
      const state = { id, type, parent: 'theTable' };
      widgets.set(id, { id, state, get: p => state[p] });
    }
  }

  // opens the popup a chip opens, the way the routine editor does
  function showPopup(operation, parameterNames) {
    const editor = editorForOperation(operation);
    editor.setOperationDetails(widgets.get('target'), operation, [], []);
    const popup = editor.createPopup(parameterNames);
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    popup.setSource(source);
    popup.setOperationDetails(operation, parameterNames, widgets.get('target'), [], []);
    popup.show();
    return popup;
  }

  const pickedTypes = popup => [...popup.domElement.querySelectorAll('.widgetPickerEntry')].map(e => e.querySelector('.widgetPickerType').textContent);

  afterEach(() => {
    stopWidgetPicker();
    widgets.clear();
  });

  test('parameters that name one kind of widget preset that type', () => {
    const presets = {};
    for(const func in routineOperationMetadata)
      for(const parameter in routineOperationMetadata[func].parameters)
        if(routineOperationMetadata[func].parameters[parameter].widgetType)
          presets[`${func}.${parameter}`] = routineOperationMetadata[func].parameters[parameter].widgetType;
    expect(presets).toEqual({
      'CANVAS.collection': 'canvas', 'CANVAS.canvas': 'canvas',
      'COUNT.holder': 'holder',
      'FLIP.holder': 'holder',
      'MOVE.from': 'holder', 'MOVE.to': 'holder',
      'MOVEXY.from': 'holder',
      'RECALL.holder': 'holder',
      'ROTATE.holder': 'holder',
      'SCORE.seats': 'seat',
      'SHUFFLE.holder': 'holder',
      'SORT.holder': 'holder',
      'SWAPHANDS.source': 'seat',
      'TIMER.timer': 'timer', 'TIMER.collection': 'timer',
      'TURN.turn': 'seat', 'TURN.source': 'seat'
    });
  });

  test('the preset filters the picker list and can be changed to any type', () => {
    room([ 'target', 'button' ], [ 'h1', 'holder' ], [ 'l1', 'label' ]);
    const popup = showPopup({ func: 'SHUFFLE' }, [ 'holder', 'collection' ]); // the {holder,collection} chip
    expect(pickedTypes(popup)).toEqual([ 'holder' ]);
    const typeSelect = popup.domElement.querySelector('select');
    expect(typeSelect.value).toBe('holder');
    typeSelect.value = '';
    typeSelect.onchange();
    expect(pickedTypes(popup).sort()).toEqual([ 'button', 'holder', 'label' ]);
    popup.hide();
  });

  test('collection-only and widget-only parameters get their preset as well', () => {
    room([ 'target', 'button' ], [ 'l1', 'label' ], [ 't1', 'timer' ]);
    const timer = showPopup({ func: 'TIMER' }, [ 'collection' ]); // no timer set: the chip is the collection
    expect(pickedTypes(timer)).toEqual([ 'timer' ]);
    timer.hide();
    // a LABEL works on any widget with a text property, so its picker starts on all of them
    const label = showPopup({ func: 'LABEL' }, [ 'label' ]);
    expect(pickedTypes(label).sort()).toEqual([ 'button', 'label', 'timer' ]);
    label.hide();
  });

  test('TURN offers the seats for its turn parameter', () => {
    room([ 'target', 'button' ], [ 's1', 'seat' ], [ 'h1', 'holder' ]);
    const popup = showPopup({ func: 'TURN', turnCycle: 'seat' }, [ 'turn' ]);
    expect(popup).toBeInstanceOf(RoutineNumberPopup);
    expect(pickedTypes(popup)).toEqual([ 'seat' ]);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.domElement.querySelector('.widgetPickerEntry').onclick();
    expect(value).toEqual({ turn: 's1' });
    popup.hide();
  });
});

describe('variables in widget parameters', () => {
  function showWidgetPopup(operation, parameterNames) {
    widgets.clear();
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const editor = editorForOperation(operation);
    const widget = { id: 'button1', state: { id: 'button1', parent: 'holder1' }, get: p => widget.state[p] };
    editor.setOperationDetails(widget, operation, [ 'myHolder' ], []);
    const popup = editor.createPopup(parameterNames);
    popup.setSource(source);
    popup.setOperationDetails(operation, parameterNames, widget, [ 'myHolder' ], []);
    popup.show();
    return popup;
  }

  const buttonNamed = (popup, text) => [...popup.domElement.querySelectorAll('button')].find(b => b.textContent == text);

  // fills in the "Property <name> of <widget>" row and applies it
  const useProperty = (popup, property, widgetID = '') => {
    popup.domElement.querySelector('.popup-property-name').value = property;
    popup.domElement.querySelector('.popup-property-widget').value = widgetID;
    buttonNamed(popup, 'use property').dispatchEvent(new Event('click'));
  };

  test('a widget parameter offers variables and widget properties', () => {
    const popup = showWidgetPopup({ func: 'MOVE', from: [ 'h1' ] }, [ 'to' ]);
    let value = null;
    popup.registerChangeListener(v => value = v);
    expect(buttonNamed(popup, 'myHolder')).toBeDefined();
    useProperty(popup, 'parent');
    expect(value).toEqual({ to: '${PROPERTY parent}' });
    popup.hide();
  });

  test('a variable used for a holder goes to the holder parameter, not the collection', () => {
    const popup = showWidgetPopup({ func: 'SHUFFLE' }, [ 'holder', 'collection' ]);
    let value = null;
    popup.registerChangeListener(v => value = v);
    useProperty(popup, 'parent');
    expect(value.holder).toBe('${PROPERTY parent}');
    expect('collection' in value).toBe(true);
    expect(value.collection).toBeUndefined();
    popup.hide();
  });

  test('a collection name still goes to the collection parameter', () => {
    const popup = showWidgetPopup({ func: 'SHUFFLE' }, [ 'holder', 'collection' ]);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.setNewCollectionValue('DEFAULT');
    expect(value).toEqual({ holder: undefined, collection: 'DEFAULT' });
    popup.hide();
  });
});

describe('popups stay out of the play area', () => {
  const withRoom = (room, callback) => {
    const roomArea = document.getElementById('roomArea'); // jsdom has no layout, so fake the play area
    const original = roomArea.getBoundingClientRect;
    roomArea.getBoundingClientRect = () => room;
    try {
      callback();
    } finally {
      roomArea.getBoundingClientRect = original;
    }
  };

  test('a widget picker is placed in the strip the play area leaves over', () => {
    // portrait phone: the modules sit above the play area
    withRoom({ left: 0, top: window.innerHeight/2, right: window.innerWidth, bottom: window.innerHeight }, () => {
      expect(new RoutineWidgetIDPopup({}).placementLimits().bottom).toBe(window.innerHeight/2);
    });
    // wide screen: the modules sit right of the play area
    withRoom({ left: 0, top: 0, right: 500, bottom: window.innerHeight }, () => {
      expect(new RoutineWidgetIDPopup({}).placementLimits().left).toBe(500);
    });
  });

  test('popups without a room picker use the whole editor', () => {
    withRoom({ left: 0, top: window.innerHeight/2, right: window.innerWidth, bottom: window.innerHeight }, () => {
      expect(new RoutineStringPopup().placementLimits().bottom).toBe(window.innerHeight);
      expect(new RoutineNumberPopup({}).placementLimits().bottom).toBe(window.innerHeight);
      // a number parameter that names a widget does offer the room picker
      expect(new RoutineNumberPopup({ widgetType: 'seat' }).placementLimits().bottom).toBe(window.innerHeight/2);
    });
  });

  // the sound library is an overlay over the board, so the popup that opens it
  // must not be there itself - the two would cover each other
  test('the sound popup keeps out of the play area the library opens in', () => {
    withRoom({ left: 0, top: window.innerHeight/2, right: window.innerWidth, bottom: window.innerHeight }, () => {
      expect(new RoutineSoundPopup().placementLimits().bottom).toBe(window.innerHeight/2);
    });
    withRoom({ left: 0, top: 0, right: 500, bottom: window.innerHeight }, () => {
      expect(new RoutineSoundPopup().placementLimits().left).toBe(500);
    });
  });

  test('a play area without a usable strip beside it does not squeeze the popup away', () => {
    withRoom({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }, () => {
      expect(new RoutineWidgetIDPopup({}).placementLimits().bottom).toBe(window.innerHeight);
    });
  });
});

describe('popup closing', () => {
  function showInfoPopup(html) {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new InfoPopup(source, html);
    popup.show();
    return popup;
  }

  test('popups get a close button that closes them', () => {
    const popup = showInfoPopup('hello');
    const close = popup.domElement.querySelector('.popup-close');
    expect(close).not.toBeNull();
    close.dispatchEvent(new Event('click'));
    expect(document.body.contains(popup.domElement)).toBe(false);
  });

  test('clicking inside an info popup does not close it', () => {
    const popup = showInfoPopup('hello');
    popup.domElement.dispatchEvent(new Event('click'));
    expect(document.body.contains(popup.domElement)).toBe(true);
    popup.hide();
  });

  test('Escape closes only the top-most popup', () => {
    const outer = showInfoPopup('outer');
    const inner = showInfoPopup('inner');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.body.contains(inner.domElement)).toBe(false);
    expect(document.body.contains(outer.domElement)).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.body.contains(outer.domElement)).toBe(false);
  });

  test('an info popup opened from inside another one closes with it', () => {
    // every popup is appended to #editor rather than to the one it came from, so
    // without this the info tip of a section title outlives the section
    const parent = showInfoPopup('parent');
    const insideParent = document.createElement('span');
    parent.domElement.append(insideParent);
    const child = new InfoPopup(insideParent, 'child');
    child.show();
    parent.hide();
    expect(document.body.contains(child.domElement)).toBe(false);
  });
});

describe('JSON parameter popup', () => {
  function showJson(operation, parameterNames) {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineJSONPopup();
    popup.setSource(source);
    popup.setOperationDetails(operation, parameterNames, { state: {} }, [], []);
    popup.show();
    return popup;
  }

  test('auto-quotes a bare word as a string (e.g. SELECT sortBy)', () => {
    const popup = showJson({ func: 'SELECT' }, [ 'sortBy' ]);
    let value = null;
    popup.registerChangeListener(v => value = v);
    const textarea = popup.domElement.querySelector('textarea');
    textarea.value = 'vp';
    textarea.dispatchEvent(new Event('change'));
    expect(value).toEqual({ sortBy: 'vp' });
    expect(textarea.classList.contains('inputError')).toBe(false);
    popup.hide();
  });

  test('still parses real JSON and rejects malformed input', () => {
    const popup = showJson({ func: 'SELECT' }, [ 'sortBy' ]);
    let value = null;
    popup.registerChangeListener(v => value = v);
    const textarea = popup.domElement.querySelector('textarea');
    textarea.value = '[ "a", "b" ]';
    textarea.dispatchEvent(new Event('change'));
    expect(value).toEqual({ sortBy: [ 'a', 'b' ] });
    textarea.value = '{ broken';
    textarea.dispatchEvent(new Event('change'));
    expect(textarea.classList.contains('inputError')).toBe(true);
    popup.hide();
  });

  test('the whole-operation editor clears what the JSON no longer has', () => {
    const operation = { func: 'MOVE', from: 'deck', to: 'discard', count: 3 };
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineFullOperationJSONPopup();
    popup.setSource(source);
    popup.setOperationDetails(operation, [ 'json' ], { state: {} }, [], []);
    popup.show();
    let value = null;
    popup.registerChangeListener(v => value = v);
    const textarea = popup.domElement.querySelector('textarea');
    textarea.value = '{ "func": "MOVE", "from": "deck", "to": "discard" }';
    textarea.dispatchEvent(new Event('change'));
    expect('count' in value).toBe(true);
    expect(value.count).toBeUndefined();

    // a bare word is a value, never an operation - quoting it here would replace
    // the operation with that word
    textarea.value = 'MOVE';
    textarea.dispatchEvent(new Event('change'));
    expect(textarea.classList.contains('inputError')).toBe(true);
    // the two lines a routine may hold as a string are still accepted
    textarea.value = '"var x = 1"';
    textarea.dispatchEvent(new Event('change'));
    expect(value).toBe('var x = 1');
    popup.hide();
  });
});

describe('popup parameter routing', () => {
  test('collection values clear the holder-style alternative', () => {
    const popup = new RoutineHoldersOrCollectionSourcePopup();
    popup.setOperationDetails({ func: 'MOVE' }, [ 'from', 'collection' ], { state: {} }, [], []);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.setNewCollectionValue([ 'w1', 'w2' ]);
    expect('from' in value).toBe(true);
    expect(value.from).toBeUndefined();
    expect(value.collection).toEqual([ 'w1', 'w2' ]);
  });

  test('widget picker arrays go to the holder-style parameter', () => {
    const popup = new RoutineHoldersOrCollectionSourcePopup();
    popup.setOperationDetails({ func: 'MOVE' }, [ 'from', 'collection' ], { state: {} }, [], []);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.setNewValue([ 'h1' ]);
    expect(value.from).toEqual([ 'h1' ]);
    // picking a holder also clears the sibling collection so it can't re-surface
    expect('collection' in value).toBe(true);
    expect(value.collection).toBeUndefined();
  });

  test('typing over the holder keeps it a holder', () => {
    // the string is the id of another holder, not the name of a collection: the
    // engine prefers from over collection, so swapping the two silently made the
    // operation act on nothing
    const popup = new RoutineHoldersOrCollectionSourcePopup();
    popup.setOperationDetails({ func: 'FLIP', holder: 'deck1' }, [ 'holder', 'collection' ], { state: {} }, [], []);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.setNewValue('deck2');
    expect(value.holder).toBe('deck2');
    expect(value.collection).toBeUndefined();

    // without one, a typed name is a collection as before
    const withoutHolder = new RoutineHoldersOrCollectionSourcePopup();
    withoutHolder.setOperationDetails({ func: 'FLIP' }, [ 'holder', 'collection' ], { state: {} }, [], []);
    withoutHolder.registerChangeListener(v => value = v);
    withoutHolder.setNewValue('myGroup');
    expect(value.collection).toBe('myGroup');
    expect(value.holder).toBeUndefined();
  });

  test('a widget parameter picks the card that was clicked, not what it lies on', () => {
    // only a parameter that means holders climbs past a card - a generic widget
    // parameter (FLIP widget, MOVE to) takes cards and piles as they are
    expect(new RoutineWidgetIDPopup().resolvesCovering()).toBe(false);
    expect(new RoutineHoldersOrCollectionSourcePopup().resolvesCovering()).toBe(true);
  });

  test('a parameter that names a widget property proposes the names it could have', () => {
    const editor = editorForOperation({ func: 'GET' });
    expect(editor.createPopup([ 'property' ])).toBeInstanceOf(RoutinePropertyNamePopup);
    expect(editor.createPopup([ 'variable' ])).not.toBeInstanceOf(RoutinePropertyNamePopup);

    widgets.clear();
    const target = { id: 'target', state: { id: 'target', type: 'button', myScore: 0 } };
    const card = { id: 'c1', state: { id: 'c1', type: 'card', cardType: 'ace' } };
    widgets.set('target', target);
    widgets.set('c1', card);

    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutinePropertyNamePopup();
    popup.setSource(source);
    popup.setOperationDetails({ func: 'GET', property: 'myScore' }, [ 'property' ], target, [], []);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.show();

    const names = _=>[...popup.domElement.querySelectorAll('.popup-property-list button')].map(b => b.textContent);
    expect([...popup.domElement.querySelectorAll('.popup-property-group')].map(g => g.textContent))
      .toEqual([ 'This widget', 'Commonly set', 'Other widgets in this room', 'Other standard properties' ]);
    expect(names().slice(0, 3)).toEqual([ 'id', 'myScore', 'type' ]); // this widget first
    expect(names()).toContain('cardType'); // then the room
    expect(names()).toContain('dropTarget'); // a standard property no widget in the room uses
    expect(names().filter(n => n == 'id')).toHaveLength(1); // every name appears in its first group only
    expect([...popup.domElement.querySelectorAll('.popup-property-list button.selected')].map(b => b.textContent)).toEqual([ 'myScore' ]);

    const search = popup.domElement.querySelector('.popup-property-search');
    search.value = 'card';
    search.dispatchEvent(new Event('input'));
    expect(names()).toEqual([ 'cardType' ]);

    popup.domElement.querySelector('.popup-property-list button').dispatchEvent(new Event('click'));
    expect(value).toEqual({ property: 'cardType' });
    popup.hide();
    widgets.clear();
  });

  // each way of repeating asks for its own kind of value, so neither of the two
  // offers what the other one is about
  test('the FOREACH source popup asks for the one thing its chip stands for', () => {
    const editor = editorForOperation({ func: 'FOREACH', range: [ 1, 10 ] });
    editor.setOperationDetails({ state: {} }, { func: 'FOREACH', range: [ 1, 10 ] }, [], []);
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const range = editor.createPopup([ 'range' ]);
    expect(range).toBeInstanceOf(RoutineForeachSourcePopup);
    range.setSource(source);
    range.setOperationDetails({ func: 'FOREACH', range: [ 1, 10 ] }, [ 'range' ], { state: {} }, [], []);
    range.show();
    expect([...range.domElement.querySelectorAll('.accordion-section')].map(s => s.textContent)).not.toContain('Object / Array');
    let value = null;
    range.registerChangeListener(v => value = v);
    [...range.domElement.querySelectorAll('button')].find(b => b.textContent == 'use range').dispatchEvent(new Event('click'));
    expect(value).toEqual({ range: [ 1, 10, 1 ] });
    range.hide();

    const list = editor.createPopup([ 'in' ]);
    list.setSource(source);
    list.setOperationDetails({ func: 'FOREACH', 'in': [ 1 ] }, [ 'in' ], { state: {} }, [], []);
    list.show();
    expect(list.domElement.querySelector('input[type=number]')).toBeNull(); // no range to fill in
    let entries = null;
    list.registerChangeListener(v => entries = v);
    const textarea = list.domElement.querySelector('textarea');
    textarea.value = '[ "a" ]';
    textarea.dispatchEvent(new Event('change'));
    expect(entries).toEqual({ 'in': [ 'a' ] });
    list.hide();
  });

  test('the range inputs start from the range the operation already has', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineForeachSourcePopup({ range: true });
    popup.setSource(source);
    popup.setOperationDetails({ func: 'FOREACH', range: [ 5, 50, 5 ] }, [ 'range' ], { state: {} }, [], []);
    popup.show();
    const inputs = [...popup.domElement.querySelectorAll('input[type=number]')].map(i => i.value);
    expect(inputs).toEqual([ '5', '50', '5' ]);
    // changing only the step keeps the start and the end
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.domElement.querySelectorAll('input[type=number]')[2].value = '10';
    [...popup.domElement.querySelectorAll('button')].find(b => b.textContent == 'use range').dispatchEvent(new Event('click'));
    expect(value).toEqual({ range: [ 5, 50, 10 ] });
    popup.hide();
  });
});

// The round of review that went through the operations one by one: what an
// option is called, which unit a time is said in, and what the picker behind a
// value offers.
describe('the words and the units of an operation', () => {
  const editorFor = operation => {
    const editor = editorForOperation(operation);
    editor.setOperationDetails({ state: {} }, operation, [], []);
    return editor;
  };
  const sentenceWords = operation => {
    const sentence = editorFor(operation).render().querySelector('.routine-editor-sentence').cloneNode(true);
    for (const icon of sentence.querySelectorAll('.material-symbols, .routine-editor-add-clause'))
      icon.remove();
    return sentence.textContent.replace(/\s+/g, ' ').trim();
  };
  const offeredOptions = operation => {
    const editor = editorFor(operation);
    return editor.clauses().filter(clause => !editor.clauseIsActive(clause) && clause.offer !== false).map(clause => clause.label);
  };
  const popupFor = (operation, parameter) => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = editorFor(operation).createFullPopup([ parameter ]);
    popup.setSource(source);
    popup.setOperationDetails(operation, [ parameter ], { state: {} }, [], []);
    return popup;
  };

  // every yes/no option turns a default around, so it is named after what it
  // does rather than after the parameter it sets - "the grid" said nothing
  // about what switching it on would do to it
  test('a yes/no option is named after the setting it switches to', () => {
    const labels = {};
    for (const func in routineOperationMetadata) {
      for (const clause of routineOperationMetadata[func].clauses || []) {
        const parameters = (String(clause.template).match(/\{([a-zA-Z0-9]+)\}/g) || []).map(m => m.slice(1, -1));
        const spec = parameters.length == 1 && routineOperationMetadata[func].parameters[parameters[0]];
        if (spec && spec.type == 'enum' && JSON.stringify(spec.values) == JSON.stringify([ true, false ]))
          labels[`${func} ${parameters[0]}`] = clause.label;
      }
    }
    expect(labels).toEqual({
      'CALL return': 'and do not finish this routine',
      'CLONE recursive': 'including the widgets on them',
      'GET skipMissing': 'ignoring widgets without it',
      'INPUT block': 'holding everybody else up',
      'MOVEXY snapToGrid': 'ignoring the grid',
      'MOVEXY resetOwner': 'keeping their current owner',
      'RECALL owned': 'except the cards players hold',
      'RECALL inHolder': 'only the cards on the table',
      'RECALL byDistance': 'nearest cards first',
      'SELECT random': 'in random order',
      'SORT reverse': 'biggest first',
      'SORT rearrange': 'without moving them',
      'SWAPHANDS keepOrder': 'keeping the order of each hand'
    });
  });

  // z is a position and not the layer property a widget also has, so the option
  // says which of the two it is instead of leaving that to the letter
  test('MOVEXY words a face like MOVE and offers the stacked position', () => {
    expect(sentenceWords({ func: 'MOVEXY', from: 'h1', face: 0 })).toContain('and turn them face down');
    expect(sentenceWords({ func: 'MOVEXY', from: 'h1', face: 2 })).toContain('and turn them to face 2');
    expect(offeredOptions({ func: 'MOVEXY', from: 'h1' })).toEqual([ 'at the specified stacked (z) position', 'to a face', 'ignoring the grid', 'keeping their current owner' ]);
    expect(sentenceWords({ func: 'MOVEXY', from: 'h1', z: 3 })).toContain('at the z position 3');
  });

  // a deprecated parameter is not a suggestion: it is part of the sentence
  // while a game has it and nothing the editor invites anybody to add - but a
  // game that arrived with one is a minus away from what replaced it
  test('the deprecated CANVAS canvas is shown with a way out but never offered', () => {
    expect(offeredOptions({ func: 'CANVAS' })).toEqual([ 'at most a certain number of them' ]);
    expect(sentenceWords({ func: 'CANVAS', canvas: 'c1' })).toContain('Clear c1');
    expect(sentenceWords({ func: 'CANVAS' })).toContain('Clear the picked canvases');

    const operation = { func: 'CANVAS', canvas: 'c1' };
    const editor = editorFor(operation);
    let result = null;
    editor.registerChangeListener(v => result = v);
    const remove = editor.render().querySelector('.routine-editor-clause-remove[data-clause="canvas"]');
    expect(remove).not.toBeNull();
    remove.dispatchEvent(new Event('click'));
    expect(result).toEqual({ func: 'CANVAS' });
  });

  // CANVAS talks about canvases everywhere else, so its count does too - and the
  // engine cuts the list at it (slice(0, a.count || 999999)), so a negative one
  // leaves that many alone rather than working on that many
  test('CANVAS counts canvases, and words a count that does the opposite of what it looks like', () => {
    expect(sentenceWords({ func: 'CANVAS', count: 3 })).toBe('Clear the picked canvases, for 3 canvases');
    expect(sentenceWords({ func: 'CANVAS', count: 1 })).toBe('Clear the picked canvases, for 1 canvas');
    expect(sentenceWords({ func: 'CANVAS', count: -2 })).toBe('Clear the picked canvases, for all but 2 canvases');
    // and 0 is the count that means all: it is left out of the sentence and the
    // list view says why, so nobody reads it as "no canvases"
    expect(sentenceWords({ func: 'CANVAS', count: 0 })).toBe('Clear the picked canvases');
    expect(editorFor({ func: 'CANVAS', count: 0 }).ignoredParameters().count).toContain('0 means all widgets');
  });

  // capping how many widgets an operation works on is one idea that had four
  // names: an option that means the same thing on two operations is worded the
  // same way on both, so the "+ option" menu reads as one vocabulary
  test('every option that caps how many widgets are worked on is worded the same', () => {
    const labels = {};
    for (const func in routineOperationMetadata)
      for (const clause of routineOperationMetadata[func].clauses || []) {
        const spec = routineOperationMetadata[func].parameters[clause.id];
        if (spec && spec.type == 'number' && (clause.id == 'count' || clause.id == 'max'))
          labels[`${func} ${clause.id}`] = clause.label;
      }
    expect(labels).toEqual({
      // how often the operation runs is a different idea and keeps its own words
      'AUDIO count': 'n times',
      'CLICK count': 'n times',
      'CANVAS count': 'at most a certain number of them',
      'FLIP count': 'at most a certain number of them',
      'MOVE count': 'at most a certain number of them',
      'SELECT max': 'at most a certain number of them'
    });
  });

  // the value a field opens with read six different ways across the nine fields
  // that collect one: a field that is in a state says which state it is already
  // in, and every field holding a value the player can overwrite says it alike
  test('every INPUT field words the value it starts with the same way', () => {
    const labels = {};
    for (const type in routineInputFieldMetadata)
      for (const clause of routineInputFieldMetadata[type].clauses || [])
        if (clause.id == 'value')
          labels[type] = clause.label;
    expect(labels).toEqual({
      checkbox: 'already ticked',
      switch: 'already on',
      choose: 'already picked',
      string: 'what it starts with',
      number: 'what it starts with',
      slider: 'what it starts with',
      select: 'what it starts with',
      palette: 'what it starts with',
      color: 'what it starts with'
    });
  });

  // which round a score goes into is part of every SCORE: leaving it out adds
  // one to the end of the list (widget.js), which is a choice like naming one
  test('SCORE says which round in the sentence and has no options left', () => {
    expect(sentenceWords({ func: 'SCORE', value: 1 })).toBe('Set score of every seat in a new round to 1');
    expect(sentenceWords({ func: 'SCORE', mode: 'inc', round: 2, value: 1 })).toBe('Add 1 to score of every seat in round 2');
    expect(offeredOptions({ func: 'SCORE' })).toEqual([]);
    const { dom } = { dom: editorFor({ func: 'SCORE', value: 1 }).render() };
    expect(dom.querySelector('[data-parameter="round"]').classList.contains('routine-editor-parameter-menu')).toBe(true);
  });

  // a SCORE without a value does not do nothing: widget.js fills in 0 for a Set
  // and 1 for an Add or a Subtract, so the sentence says the number that is
  // going to be used instead of a blank where the point of a score belongs
  test('SCORE says the value it falls back to for the way it works', () => {
    expect(sentenceWords({ func: 'SCORE' })).toBe('Set score of every seat in a new round to 0');
    expect(sentenceWords({ func: 'SCORE', mode: 'inc' })).toBe('Add 1 to score of every seat in a new round');
    expect(sentenceWords({ func: 'SCORE', mode: 'dec' })).toBe('Subtract 1 from score of every seat in a new round');
    expect(editorFor({ func: 'SCORE' }).render().querySelector('[data-parameter="value"]').classList.contains('routine-editor-parameter-missing')).toBe(false);
  });

  // face 0 is the back of a card and face 1 its front (the wiki says so for
  // FLIP), so 0 is face DOWN - the words were the other way round
  test('the first two faces are said the way a deck numbers them', () => {
    expect(sentenceWords({ func: 'FLIP', holder: 'h1', face: 0 })).toBe('Turn all widgets in h1 face down');
    expect(sentenceWords({ func: 'FLIP', holder: 'h1', face: 1 })).toBe('Turn all widgets in h1 face up');
    expect(sentenceWords({ func: 'FLIP', holder: 'h1', face: 2 })).toBe('Turn all widgets in h1 to face 2');
    expect(sentenceWords({ func: 'MOVE', from: 'a', to: 'b', face: 0 })).toContain('and turn them face down');
    expect(sentenceWords({ func: 'MOVEXY', from: 'a', face: 1 })).toContain('and turn them face up');
  });

  // "${x}" is a string to JavaScript, which is the one thing it never means
  test('a value the routine works out reads as the kind of value it stands in for', () => {
    // a SET that adds one is arithmetic - the wording that made it text turned
    // "add up what x comes out to" into "write x behind the property"
    // (a value the routine remembers is worded as the name it goes by)
    expect(sentenceWords({ func: 'SET', property: 'rotation', relation: '+', value: '${x}' }))
      .toBe('Increase rotation of the picked widgets by x');
    expect(sentenceWords({ func: 'SET', property: 'text', relation: '+', value: ' (used)' }))
      .toBe('Append " (used)" to text of the picked widgets');
    // and a FLIP that names a face names one, whichever face it works out to
    expect(sentenceWords({ func: 'FLIP', holder: 'h1', face: '${f}' })).toBe('Turn all widgets in h1 to face f');
    expect(sentenceWords({ func: 'MOVE', from: 'a', to: 'b', face: '${f}' })).toContain('and turn them to face f');
    // picking the way it already reads as leaves the value alone instead of
    // writing the number a fresh operation of that kind starts with over it
    const increase = routineOperationVariantChoices({ func: 'SET', property: 'rotation', relation: '+', value: '${x}' })
      .find(choice => choice.id == 'add');
    expect(increase.replaces).toEqual([]);
    expect(increase.values.value).toBe('${x}');
  });

  // a holder is a place widgets are in, a group of widgets is the widgets - and
  // saying "in the pick" made a group a place and taught a word nothing defines
  test('a group of widgets reads the same way in every sentence, and never as a place', () => {
    expect(sentenceWords({ func: 'FLIP', holder: 'h1', face: 0 })).toBe('Turn all widgets in h1 face down');
    expect(sentenceWords({ func: 'FLIP', face: 0 })).toBe('Turn the picked widgets face down');
    expect(sentenceWords({ func: 'FLIP', face: 0, count: 2 })).toBe('Turn 2 of the picked widgets face down');
    expect(sentenceWords({ func: 'ROTATE', holder: 'h1', angle: 90 })).toBe('Rotate 1 widget in h1 by 90 degrees');
    expect(sentenceWords({ func: 'ROTATE', angle: 90 })).toBe('Rotate 1 of the picked widgets by 90 degrees');
    expect(sentenceWords({ func: 'FOREACH' })).toContain('For each of the picked widgets');
    for(const operation of [ { func: 'FLIP', face: 0 }, { func: 'ROTATE' }, { func: 'FOREACH' }, { func: 'MOVE' }, { func: 'SET' }, { func: 'CLICK' } ])
      expect(sentenceWords(operation)).not.toContain('the pick ');
  });

  // one pair is what three out of four VARs hold, and one pair is a sentence
  test('VAR reads as a sentence, with the name and the value as their own chips', () => {
    expect(sentenceWords({ func: 'VAR', variables: { total: 3 } })).toBe('Set the variable total to the value 3');
    expect(sentenceWords({ func: 'VAR', variables: {} })).toBe('Set the variable name to the value value');
    expect(sentenceWords({ func: 'VAR', variables: { a: 1, b: 2 } })).toBe('Set the variables a to 1 and b to 2');
    const dom = editorFor({ func: 'VAR', variables: { total: 3 } }).render();
    expect(dom.querySelector('[data-parameter="variableName"]').textContent).toBe('total');
    expect(dom.querySelector('[data-parameter="variableValue"]').textContent).toBe('3');
  });

  test('editing either half of a VAR pair writes the pair back', async () => {
    const editor = editorFor({ func: 'VAR', variables: { total: 3 } });
    let result = null;
    editor.registerChangeListener(v => result = v);
    editor.onNewValue({ variableName: 'score' });
    expect(result).toEqual({ func: 'VAR', variables: { score: 3 } });
    editor.onNewValue({ variableValue: 7 });
    expect(result).toEqual({ func: 'VAR', variables: { score: 7 } });
    // and the option that adds one leaves the sentence for the list of rows
    editor.onNewValue({ anotherVariable: true });
    expect(Object.keys(result.variables)).toEqual([ 'score', 'variable' ]);
  });

  // taking the fields out of an INPUT empties the whole form, and nothing offers
  // them back - so that option has no ⊖ while every other one does
  test('the lines of an INPUT dialog carry no remove marker', () => {
    const dom = editorFor({ func: 'INPUT', fields: [ { type: 'string', label: 'a' } ] }).render();
    expect(dom.querySelector('[data-parameter="fields"]')).not.toBeNull();
    expect([...dom.querySelectorAll('.routine-editor-clause-remove')].map(m => m.dataset.clause)).not.toContain('fields');
    expect([...editorFor({ func: 'INPUT', header: 'hi' }).render().querySelectorAll('.routine-editor-clause-remove')].map(m => m.dataset.clause)).toContain('header');
  });

  // both blocks of an IF are named: the one under the condition read as "the rest
  // of the routine" while only the other one carried a band
  test('an IF names its then block as well as its else block', () => {
    const dom = editorFor({ func: 'IF', elseRoutine: [] }).render();
    expect([...dom.querySelectorAll('.routine-editor-else')].map(e => e.textContent)).toEqual([ 'THEN', 'ELSE' ]);
    expect([...editorFor({ func: 'IF' }).render().querySelectorAll('.routine-editor-else')].map(e => e.textContent)).toEqual([ 'THEN' ]);
  });

  // the punctuation behind a chip belongs to the chip: the chip's own padding put
  // a space in front of every comma ("to the position 300 , 200")
  test('punctuation is pulled back onto the chip in front of it', () => {
    const dom = editorFor({ func: 'MOVEXY', from: 'h1', x: 300, y: 200 }).render();
    const punctuation = [...dom.querySelectorAll('.routine-editor-punctuation')].map(e => e.textContent);
    expect(punctuation).toContain(',');
    expect(dom.querySelector('.routine-editor-sentence').textContent).toContain('300, 200');
  });

  test('ROTATE sets the rotation, and its angle picker offers angles instead of digits', () => {
    expect(sentenceWords({ func: 'ROTATE', mode: 'set', holder: 'h1', angle: 60 })).toBe('Set the rotation of 1 widget in h1 to 60 degrees');
    const popup = popupFor({ func: 'ROTATE', angle: 90 }, 'angle');
    popup.show();
    const offered = [...popup.domElement.querySelectorAll('.accordion-content button')].map(b => b.textContent);
    expect(offered).toContain('60'); // the sixths a hex board is built on
    expect(offered).toContain('360');
    expect(offered).not.toContain('7'); // and not the keypad of 0 to 10
    popup.hide();
  });

  // a time is a number of seconds wherever a game talks about one; the
  // milliseconds the engine stores are what the editor converts
  test('TIMER and AUDIO say seconds and store milliseconds', () => {
    expect(sentenceWords({ func: 'TIMER', timer: 't1' })).toBe('Toggle on/off the timer t1');
    expect(sentenceWords({ func: 'TIMER', mode: 'set', timer: 't1', value: 5000 })).toBe('Set the timer t1 to 5 seconds');
    expect(sentenceWords({ func: 'TIMER', mode: 'set', timer: 't1', value: 1000 })).toBe('Set the timer t1 to 1 second');
    expect(sentenceWords({ func: 'TIMER', mode: 'dec', timer: 't1', value: 30000 })).toBe('Remove 30 seconds from the timer t1');
    // a game that says it in the seconds parameter still reads as what it is
    expect(sentenceWords({ func: 'TIMER', mode: 'inc', timer: 't1', seconds: 5 })).toBe('Add 5 seconds to the timer t1');
    expect(offeredOptions({ func: 'TIMER', mode: 'set', timer: 't1' })).toEqual([]);
    expect(sentenceWords({ func: 'AUDIO', source: 'a.mp3', length: 2000 })).toBe('Play the sound a.mp3, stopping after 2 seconds');

    const popup = popupFor({ func: 'TIMER', mode: 'set', timer: 't1', value: 5000 }, 'value');
    popup.show();
    expect(popup.domElement.querySelector('.popup-value-input').value).toBe('5');
    let value = null;
    popup.registerChangeListener(v => value = v);
    [...popup.domElement.querySelectorAll('button')].find(b => b.textContent == '3').dispatchEvent(new Event('click'));
    expect(value).toEqual({ value: 3000 });
    popup.hide();
  });

  test('a var statement sets a variable to a value', () => {
    expect(sentenceWords('var x = 1')).toBe('Set the variable x to the value 1');
    expect(routineOperationExamples().find(e => e.func == 'var').example).toBe('Set the variable x to the value 1');
  });

  // "//" alone is punctuation rather than a name
  test('the list of operations calls a comment what it is', () => {
    const comment = routineOperationExamples().find(e => e.func == '//');
    expect(comment.label).toBe('// Comment');
  });

  // what a VAR holds is a list of pairs, so it is edited as one instead of as
  // the JSON object that list is stored as
  test('VAR edits its variables as name/value rows', () => {
    const operation = { func: 'VAR', variables: { score: 3 } };
    const popup = popupFor(operation, 'variables');
    expect(popup).toBeInstanceOf(RoutineKeyValuePopup);
    popup.show();
    expect([...popup.domElement.querySelectorAll('.popup-key-value-key')].map(k => k.textContent)).toEqual([ 'score' ]);
    expect(popup.domElement.querySelector('.popup-key-value-value').value).toBe('3');

    // a row is added with both halves of the pair at once, and the parameter is
    // written once when the popup closes
    let value = null;
    popup.registerChangeListener(v => value = v);
    const addRow = popup.domElement.querySelector('.popup-key-value-add');
    addRow.querySelector('.popup-key-value-name').value = 'round';
    addRow.querySelector('.popup-key-value-name').dispatchEvent(new Event('input'));
    addRow.querySelector('.popup-key-value-value').value = '2';
    [...popup.domElement.querySelectorAll('button')].find(b => b.textContent == 'add').dispatchEvent(new Event('click'));
    expect(value).toBeNull(); // nothing written yet
    expect(popup.currentPairs()).toEqual({ score: 3, round: 2 });
    popup.hide();
    expect(value).toEqual({ variables: { score: 3, round: 2 } });
  });

  // the button that adds a pair is inside the popup, but re-rendering the list
  // takes it out of the document while the click is still being dispatched - so
  // the popup never sees the click that would have stopped it, and the one the
  // document sees points at a button that is nowhere. That used to read as a
  // click outside and closed the popup after every single entry.
  test('adding a pair leaves the popup open for the next one', () => {
    const popup = popupFor({ func: 'VAR', variables: {} }, 'variables');
    popup.show();
    let hidden = false;
    popup.registerCancelListener(() => hidden = true);

    const addRow = popup.domElement.querySelector('.popup-key-value-add');
    addRow.querySelector('.popup-key-value-name').value = 'score';
    addRow.querySelector('.popup-key-value-value').value = '1';
    const addButton = [...popup.domElement.querySelectorAll('button')].find(b => b.textContent == 'add');
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    addButton.dispatchEvent(new Event('click'));

    expect(popup.currentPairs()).toEqual({ score: 1 });
    expect(popup.domElement.querySelector('.popup-key-value-add .popup-key-value-name').value).toBe('');
    expect(addButton.isConnected).toBe(false);
    popup.onOutsideClick({ target: addButton, detail: 1 });
    expect(hidden).toBe(false);
    popup.hide();
  });
});

// An INPUT is the one operation whose interesting part is not its parameters:
// what it asks is a form, and a form is a list of lines. Each of them is
// described by the same tables an operation is, so it is edited the same way.
describe('the lines of an INPUT dialog', () => {
  const fieldEditorFor = field => {
    const editor = new RoutineInputFieldEditor(field.type);
    editor.setOperationDetails({ state: {} }, field, [], []);
    return editor;
  };
  const fieldWords = field => {
    const sentence = fieldEditorFor(field).render().querySelector('.routine-editor-sentence').cloneNode(true);
    for (const icon of sentence.querySelectorAll('.material-symbols, .routine-editor-add-clause'))
      icon.remove();
    return sentence.textContent.replace(/\s+/g, ' ').trim();
  };
  const inputEditorFor = operation => {
    const editor = editorForOperation(operation);
    editor.setOperationDetails({ state: {} }, operation, [], []);
    return editor;
  };

  test('every kind of line the engine renders has a sentence', () => {
    // the list formField() in domhelpers.js handles, plus the three that only
    // show something - a new one in the engine has to get a card here too
    expect(Object.keys(routineInputFieldMetadata).sort()).toEqual([
      'checkbox', 'choose', 'color', 'number', 'palette', 'select', 'slider', 'string', 'subtitle', 'switch', 'text', 'title'
    ].sort());
  });

  test('a line reads as what it shows or asks', () => {
    expect(fieldWords({ type: 'title', text: 'Choose your color' })).toBe('Show a heading: "Choose your color"');
    expect(fieldWords({ type: 'text', text: 'Pick a card.' })).toBe('Show a paragraph: "Pick a card."');
    expect(fieldWords({ type: 'checkbox', label: 'Include jokers', value: true, variable: 'jokers' }))
      .toBe('Tick box "Include jokers", starting ticked, remembering the answer as jokers');
    expect(fieldWords({ type: 'switch', label: 'Hard mode', variable: 'hard' }))
      .toBe('Toggle "Hard mode", remembering the answer as hard');
    expect(fieldWords({ type: 'number', label: 'Rounds', value: 3, min: 1, max: 10, variable: 'rounds' }))
      .toBe('Ask for a number "Rounds", starting 3, between 1 and 10, remembering the answer as rounds');
    expect(fieldWords({ type: 'number', label: 'Rounds', min: 1, variable: 'rounds' })).toContain('at least 1');
    expect(fieldWords({ type: 'number', label: 'Rounds', max: 9, variable: 'rounds' })).toContain('up to 9');
    expect(fieldWords({ type: 'slider', label: 'Volume', min: 0, max: 100, step: 5, unit: '%', variable: 'v' }))
      .toBe('Slide "Volume" from 0 to 100 in steps of 5, showing "%", remembering the answer as v');
    expect(fieldWords({ type: 'slider', label: 'Difficulty', values: [ 'Easy', 'Hard' ], variable: 'd' }))
      .toBe('Slide "Difficulty" through Easy and Hard, remembering the answer as d');
    expect(fieldWords({ type: 'select', options: [ 'Red', 'Blue' ], variable: 'color' }))
      .toBe('Ask them to pick one of Red and Blue, remembering the answer as color');
    // an entry that stores something other than what it shows reads as what it shows
    expect(fieldWords({ type: 'select', options: [ { value: 'r', text: 'Red' } ], variable: 'c' })).toContain('pick one of Red');
    expect(fieldWords({ type: 'palette', colors: [ '#ff0000', '#00ff00' ], variable: 'c' })).toContain('pick a color from #ff0000 and #00ff00');
    expect(fieldWords({ type: 'color', variable: 'c' })).toBe('Ask them to pick any color, remembering the answer as c');
    expect(fieldWords({ type: 'string', label: 'Your name', value: 'Player 1', variable: 'name' }))
      .toBe('Ask for text "Your name", starting "Player 1", remembering the answer as name');
  });

  // how many widgets a choose takes is also what the answer is: one widget
  // while it takes one, a list of them as soon as it takes more
  test('a choose says where the widgets come from and how many they may take', () => {
    expect(fieldWords({ type: 'choose', holder: 'hand1', variable: 'picked' }))
      .toBe('Ask them to pick one of the widgets in hand1, remembering the answer as picked');
    expect(fieldWords({ type: 'choose', source: 'aces', min: 1, max: 3, collection: 'chosen', variable: 'picked' }))
      .toBe('Ask them to pick 1 to 3 of the widgets called aces, remembering the answer as picked, and calling them chosen');
    expect(fieldWords({ type: 'choose', holder: 'hand1', max: 3, variable: 'p' })).toContain('pick up to 3 of');
    // the option that limits it is one option, and taking it out takes both numbers
    const editor = fieldEditorFor({ type: 'choose', holder: 'hand1', min: 1, max: 3, variable: 'p' });
    const howMany = editor.clauses().find(clause => clause.id == 'howMany');
    expect(editor.clauseIsActive(howMany)).toBe(true);
    expect(editor.clauseRemoveValues(howMany)).toEqual({ min: undefined, max: undefined });
  });

  test('a line that only shows something collects no answer', () => {
    for (const type of [ 'title', 'subtitle', 'text' ]) {
      expect(routineInputFieldMetadata[type].collects).toBe(false);
      expect(Object.keys(routineInputFieldMetadata[type].parameters)).not.toContain('variable');
    }
    // and every line that asks something says what the answer will be
    for (const type in routineInputFieldMetadata)
      if (routineInputFieldMetadata[type].collects !== false)
        expect(typeof routineInputFieldMetadata[type].answer).toBe('string');
  });

  // a line without a name collects an answer and throws it away, so naming
  // what the player is asked names what is remembered
  test('naming the question proposes a name for the answer', () => {
    expect(inputFieldVariableName('How many rounds?')).toBe('howManyRounds');
    const field = { type: 'string' };
    const editor = fieldEditorFor(field);
    editor.onNewValue({ label: 'Your name' });
    expect(field).toEqual({ type: 'string', label: 'Your name', variable: 'yourName' });
    // and it never overwrites one that is already there
    editor.onNewValue({ label: 'Your nickname' });
    expect(field.variable).toBe('yourName');
  });

  test('another kind of line starts over instead of keeping keys that mean nothing', () => {
    const field = { type: 'checkbox', label: 'Jokers', value: true, variable: 'jokers' };
    const editor = fieldEditorFor(field);
    editor.onNewValue({ func: 'title' });
    expect(field).toEqual({ type: 'title' });
  });

  test('the lines are a list below the sentence, with a card each', () => {
    const operation = { func: 'INPUT', fields: [ { type: 'title', text: 'Hi' }, { type: 'checkbox', variable: 'a' } ] };
    const editor = inputEditorFor(operation);
    expect(editor).toBeInstanceOf(InputRoutineOperationEditor);
    const dom = editor.render();
    const cards = dom.querySelectorAll('.routine-editor-fields > .routine-editor-field');
    expect(cards.length).toBe(2);
    expect([...cards].map(c => c.querySelector('.routine-editor-func-name').textContent)).toEqual([ 'title', 'checkbox' ]);

    // and they are moved and removed the way operations are
    let written = null;
    editor.registerChangeListener(v => written = v);
    cards[1].querySelector('[title="Move this line up"]').dispatchEvent(new Event('click'));
    expect(operation.fields.map(f => f.type)).toEqual([ 'checkbox', 'title' ]);
    expect(written).toBe(operation);
    dom.querySelectorAll('.routine-editor-field')[0].querySelector('[title="Remove this line"]').dispatchEvent(new Event('click'));
    expect(operation.fields.map(f => f.type)).toEqual([ 'title' ]);
  });

  test('fields the routine works out are shown, not overwritten with an empty form', () => {
    // the engine resolves the whole operation before it reads the fields, so a
    // ${...} there is a legal INPUT - rendering it may not replace it with []
    const operation = { func: 'INPUT', header: 'Pick', fields: '${dialogFields}' };
    const editor = inputEditorFor(operation);
    const dom = editor.render();
    expect(operation.fields).toBe('${dialogFields}');
    expect(dom.querySelector('.routine-editor-fields')).toBeNull();
    expect(dom.textContent).toMatch(/to fill in dialogFields/);

    // and an INPUT without any fields does not get one written either, until a
    // line is actually added
    const empty = { func: 'INPUT', header: 'Sure?' };
    const emptyEditor = inputEditorFor(empty);
    emptyEditor.render();
    expect('fields' in empty).toBe(false);
  });

  test('the list offers every kind of line with the sentence it would read as', () => {
    const choices = routineInputFieldChoices();
    expect(choices.map(c => c.values.func)).toEqual(Object.keys(routineInputFieldMetadata));
    expect(choices.find(c => c.values.func == 'checkbox').sentence).toContain('Tick box');
    expect(choices.find(c => c.values.func == 'title').label).toBe('Show a heading');
  });

  // hiding the cancel button is a real feature behind two nulls, so it is one
  // option that says so instead of two parameters set to nothing
  test('a dialog they cannot cancel is one option', () => {
    const operation = { func: 'INPUT' };
    const editor = inputEditorFor(operation);
    const noCancel = editor.clauses().find(clause => clause.id == 'noCancel');
    expect(editor.clauseIsActive(noCancel)).toBe(false);
    expect(editor.clauseAddValues(noCancel)).toEqual({ cancelButtonText: null, cancelButtonIcon: null });

    const forced = inputEditorFor({ func: 'INPUT', cancelButtonText: null, cancelButtonIcon: null });
    expect(forced.clauseIsActive(forced.clauses().find(clause => clause.id == 'noCancel'))).toBe(true);
    // and the two options that word the button step aside while it is on
    expect(forced.clauseIsActive(forced.clauses().find(clause => clause.id == 'cancelButtonText'))).toBe(false);
    expect(forced.render().textContent).toContain('they cannot cancel');
  });

  // a list of players changes what an answer is, not only who is asked
  test('who is asked is a way of working, and the list of players says what it does', () => {
    expect(routineOperationVariantChoices({ func: 'INPUT' }).map(c => c.id)).toEqual([ 'player', 'named', 'several' ]);
    expect(routineOperationMetadata.INPUT.variants[2].label).toContain('every answer becomes a list');
    const operation = { func: 'INPUT', player: [ 'red' ] };
    expect(inputEditorFor(operation).currentVariant().id).toBe('several');
    expect(inputEditorFor({ func: 'INPUT', player: 'red' }).currentVariant().id).toBe('named');
    expect(inputEditorFor({ func: 'INPUT' }).currentVariant().id).toBe('player');
  });

  // the engine rotates by it and no game in the library ever asked it to
  test('a rotated dialog is shown but never offered', () => {
    const offered = clauses => clauses.filter(c => c.offer !== false).map(c => c.id);
    expect(offered(inputEditorFor({ func: 'INPUT' }).clauses())).not.toContain('randomRotation');
    expect(inputEditorFor({ func: 'INPUT', randomRotation: 5 }).render().textContent).toContain('rotated by up to');
  });

  // a list of single values is a list of rows, not JSON with the brackets typed
  // around it by hand
  test('a list of values is edited as one row per entry', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const field = { type: 'select', options: [ 'Red', 'Blue' ], variable: 'c' };
    const popup = fieldEditorFor(field).createFullPopup([ 'options' ]);
    expect(popup).toBeInstanceOf(RoutineStringListPopup);
    popup.setSource(source);
    popup.setOperationDetails(field, [ 'options' ], { state: {} }, [], []);
    popup.show();
    expect([...popup.domElement.querySelectorAll('.popup-key-value-row:not(.popup-key-value-add) input')].map(i => i.value)).toEqual([ 'Red', 'Blue' ]);

    let value = null;
    popup.registerChangeListener(v => value = v);
    const addInput = popup.domElement.querySelector('.popup-key-value-add input');
    addInput.value = 'Green';
    addInput.dispatchEvent(new Event('input'));
    [...popup.domElement.querySelectorAll('button')].find(b => b.textContent == 'add').dispatchEvent(new Event('click'));
    expect(value).toBeNull(); // written once, when the popup closes
    popup.hide();
    expect(value).toEqual({ options: [ 'Red', 'Blue', 'Green' ] });
  });
});

// The 110 operations compute.js knows, in the words a var statement is said
// with. The engine's own table is the list this one is measured against: an
// operation added there without a word here fails this suite instead of
// quietly landing on a raw card.
describe('working out a value with var', () => {
  const computeOps = (() => {
    const source = fs.readFileSync('client/js/compute.js', 'utf8').replace(/^export .*$/m, '');
    return new Function(`${source}\nreturn compute_ops;`)();
  })();
  const editorFor = statement => {
    const editor = editorForOperation(statement);
    editor.setOperationDetails({ state: {} }, statement, [], []);
    return editor;
  };
  const words = statement => {
    const sentence = editorFor(statement).render().querySelector('.routine-editor-sentence').cloneNode(true);
    for (const icon of sentence.querySelectorAll('.material-symbols, .routine-editor-add-clause'))
      icon.remove();
    return sentence.textContent.replace(/\s+/g, ' ').trim();
  };

  test('every operation the engine has, has a word', () => {
    const named = Object.keys(routineComputeOperations);
    expect(named.length).toBe(computeOps.length);
    for (const op of computeOps) {
      expect(named).toContain(op.name);
      const spec = routineComputeOperations[op.name];
      expect(typeof spec.word).toBe('string');
      expect(spec.word.length).toBeGreaterThan(0);
      expect(routineComputeGroups).toContain(spec.group);
      // an operand slot the sentence never names is one that cannot be filled in
      expect(spec.template).toMatch(/\{operator\}/);
    }
  });

  // which of the two written shapes an operation uses is fixed by compute.js -
  // the sample it documents itself with is where it says so
  test('the written shape of every operation matches the engine', () => {
    for (const op of computeOps) {
      if (op.name == '=') // its sample is a plain assignment, it never spells the operator
        continue;
      const escaped = op.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const infix = String(op.sample).split('\n').some(line => new RegExp(`^var a(?:\\.\\$?\\w+)? = \\$\\{[^}]*\\} +${escaped}(?: |$)`).test(line));
      expect([ op.name, routineComputeOperations[op.name].written || 'infix' ]).toEqual([ op.name, infix ? 'infix' : 'prefix' ]);
    }
  });

  test('a statement reads as what it works out', () => {
    expect(words('var x = 1')).toBe('Set the variable x to the value 1');
    expect(words('var total = ${a} + ${b}')).toBe('Set the variable total to a plus b');
    expect(words('var n = ${deck} length')).toBe('Set the variable n to the length of deck');
    expect(words('var d = randInt 1 6')).toBe('Set the variable d to a whole number between 1 and 6');
    expect(words('var c = colorContrast ${bg}')).toBe('Set the variable c to a color that reads well on bg');
    // the optional operand is only in the sentence while it is in use
    expect(words("var c = colorContrast ${bg} -1")).toContain('-1 as strongly');
    expect(words("var s = ${name} substr 0 3")).toBe('Set the variable s to of name, the part starting at 0 for 3 characters');
  });

  // the four operations that work ON the variable are not equations: writing
  // them as one is what makes lists confusing
  test('a list operation reads as the thing it does', () => {
    expect(words('var hand = push ${card}')).toBe('Add card to the end of the list hand');
    expect(words('var hand = unshift ${card}')).toContain('to the start of the list hand');
    expect(words('var card = ${deck} pop')).toBe('Take the last entry off deck and remember it as card');
    expect(words('var a = setIndex 2 ${x}')).toBe('Set entry number 2 of a to x');
  });

  // a 🧮 operator, a trailing comment and the arithmetic the engine falls back
  // to eval for all stop being what they are as soon as they are rewritten
  test('what the sentence cannot say keeps its text', () => {
    for (const statement of [ 'var a = ${x} 🧮${op} ${y}', 'var a = (1+2)*3', 'var a = ${x} frobnicate ${y}' ]) {
      expect(editorFor(statement).getTemplate()).toBe('{statement}');
      expect(editorFor(statement).getDisplayedValue('statement')).toBe(statement);
    }
  });

  test('the statement is written back the way it arrived', () => {
    // both spellings put the operands in the same slots, so the one the file
    // used is the one it keeps
    for (const statement of [ 'var a = ${x} + ${y}', 'var a = min ${x} ${y}', 'var a = ${x} min ${y}', 'var a = 1', 'var a.b = ${x} concat 5' ]) {
      const editor = editorFor(statement);
      let result = null;
      editor.registerChangeListener(v => result = v);
      editor.onNewValue({});
      expect(result).toBe(statement);
    }
  });

  test('what is typed into an operand becomes an operand', () => {
    // a bare word would be read as the operator, so it is quoted
    expect(encodeVarOperand('hello')).toBe("'hello'");
    expect(encodeVarOperand('5')).toBe('5');
    expect(encodeVarOperand('${score}')).toBe('${score}');
    expect(encodeVarOperand('true')).toBe('true');
    expect(encodeVarOperand('')).toBe(undefined);
    // and the characters an engine string cannot hold are escaped the way it escapes them
    expect(encodeVarOperand("it's")).toBe("'it\\u0027s'");
    expect(decodeVarOperand("'it\\u0027s'")).toBe("it's");

    const editor = editorFor('var a = ${x} concat 5');
    let result = null;
    editor.registerChangeListener(v => result = v);
    editor.onNewValue({ y: 'and more' });
    expect(result).toBe("var a = ${x} concat 'and more'");
  });

  test('picking another operation keeps the operands it can', () => {
    const editor = editorFor('var a = ${x} + ${y}');
    let result = null;
    editor.registerChangeListener(v => result = v);
    editor.onNewValue({ operator: 'min' });
    expect(result).toBe('var a = min ${x} ${y}');
    // and a plain assignment is one of the ways rather than a special case
    const back = editorFor(result);
    back.registerChangeListener(v => result = v);
    back.onNewValue({ operator: '' });
    expect(result).toBe('var a = ${x}');
  });

  test('the list of operations is grouped and leaves out the one nobody should use', () => {
    const choices = routineComputeChoices();
    expect(choices[0].operator).toBe(''); // the plain assignment 42% of the library writes
    expect(choices.map(c => c.operator)).not.toContain('=');
    expect(choices.filter(c => c.group == 'Random').map(c => c.operator)).toEqual([ 'randInt', 'randRange', 'random' ]);
    // and the chip that opens it is a drop-down like every other setting
    const chip = editorFor('var a = ${x} + ${y}').render().querySelector('[data-parameter="operator"]');
    expect(chip.classList.contains('routine-editor-parameter-menu')).toBe(true);
    expect(chip.textContent).toContain('plus');
  });

  // the same two lines the operation picker uses, the same way round: what the
  // statement stores in the operation color, what it means underneath it
  test('an entry of the list names the operation first and says what it means below', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineComputeOperationPopup(routineComputeChoices(), '+');
    popup.setSource(source);
    popup.setOperationDetails({ func: 'var' }, [ 'operator' ], { state: {} }, [], []);
    popup.show();
    popup.domElement.querySelector('.popup-property-search').value = 'divided by';
    popup.domElement.querySelector('.popup-property-search').dispatchEvent(new Event('input'));
    const entry = popup.domElement.querySelector('.popup-operation');
    expect(entry.querySelector('.popup-operation-func').textContent).toBe('/');
    expect(entry.querySelector('.popup-operation-example').textContent).toBe('divided by');
    // the plain assignment stores no operation, so it has only the meaning
    popup.domElement.querySelector('.popup-property-search').value = 'the value';
    popup.domElement.querySelector('.popup-property-search').dispatchEvent(new Event('input'));
    const plain = popup.domElement.querySelector('.popup-operation');
    expect(plain.querySelector('.popup-operation-func')).toBeNull();
    expect(plain.querySelector('.popup-operation-example').textContent).toBe('the value');
    popup.hide();
  });
});

describe('AI routine assistant', () => {
  let counter = 0;
  function makeEditor(state, onChange = () => {}) {
    const widget = { state: { id: `ai${counter++}`, ...state }, get(p) { return this.state[p]; } };
    return { widget, editor: new EventsEditor(widget, onChange) };
  }

  test('every routine card offers the AI button', () => {
    const { editor } = makeEditor({ type: 'button', clickRoutine: [ { func: 'FLIP' } ] });
    const buttons = [...editor.domElement.querySelectorAll('.events-editor-ai')];
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toBe('auto_awesome');
  });

  test('applying a generated routine writes it and opens the card on the result', () => {
    const written = [];
    const { editor } = makeEditor({ type: 'button', clickRoutine: [] }, (property, value) => written.push([ property, value ]));
    // the popup hands the routine to the callback the button was built with
    const routine = [ { func: 'SHUFFLE', holder: 'deck' } ];
    editor.domElement.querySelector('.events-editor-ai').dispatchEvent(new Event('click'));
    const popup = openPopups.find(p => p instanceof AiRoutinePopup);
    expect(popup).toBeDefined();
    popup.apply(routine);
    expect(written).toContainEqual([ 'clickRoutine', routine ]);
    expect(editor.expandedEvents.clickRoutine).toBe(true);
    popup.hide();
  });

  test('the popup says what is sent and where', () => {
    const { editor } = makeEditor({ type: 'button', clickRoutine: [] });
    editor.domElement.querySelector('.events-editor-ai').dispatchEvent(new Event('click'));
    const popup = openPopups.find(p => p instanceof AiRoutinePopup);
    const said = popup.domElement.querySelector('.ai-routine-privacy').textContent;
    expect(said).toContain('the widgets in this room are sent to');
    expect(said).toContain('agent.virtualtabletop.io');
    popup.hide();
  });

  // a job the service never finishes, so the popup is still waiting on it
  function runningService() {
    const previous = globalThis.fetch;
    globalThis.fetch = async (url, options) => ({
      ok: true,
      json: async () => options ? { jobId: 'job1' } : { status: 'running', step: 'Reading widgets…' }
    });
    return () => { globalThis.fetch = previous; };
  }

  test('closing the popup gives up on the answer instead of writing it later', async () => {
    const restore = runningService();
    const written = [];
    const { editor } = makeEditor({ type: 'button', clickRoutine: [] }, (property, value) => written.push([ property, value ]));
    editor.domElement.querySelector('.events-editor-ai').dispatchEvent(new Event('click'));
    const popup = openPopups.find(p => p instanceof AiRoutinePopup);
    popup.input.value = 'shuffle the deck';
    const running = popup.generate();
    popup.hide(); // Escape, a click outside, the x - all of them end up here
    await running;
    expect(popup.cancelled).toBe(true);
    expect(written).toEqual([]); // nothing lands on the widget afterwards
    restore();
  });

  test('reopening the popup starts from what was asked for last time', async () => {
    const restore = runningService();
    const { editor } = makeEditor({ type: 'button', clickRoutine: [] });
    const openPopup = () => {
      editor.domElement.querySelector('.events-editor-ai').dispatchEvent(new Event('click'));
      return openPopups.find(p => p instanceof AiRoutinePopup);
    };
    const first = openPopup();
    first.input.value = 'deal five cards to everyone';
    const running = first.generate();
    first.hide();
    await running;
    // saying it differently is the usual second try, and retyping it is not
    expect(openPopup().input.value).toBe('deal five cards to everyone');
    openPopups.find(p => p instanceof AiRoutinePopup).hide();
    restore();
  });

  test('only the operations that really changed count as changed', () => {
    const op = f => ({ func: f });
    // an operation inserted in the middle does not make everything after it new
    expect([ ...aiChangedOperations([ op('A'), op('B') ], [ op('A'), op('C'), op('B') ]) ]).toEqual([ 1 ]);
    // a changed parameter is a change, an untouched neighbour is not
    expect([ ...aiChangedOperations([ { func: 'MOVE', count: 1 } ], [ { func: 'MOVE', count: 2 } ]) ]).toEqual([ 0 ]);
    // writing a routine from scratch marks all of it
    expect([ ...aiChangedOperations(undefined, [ op('A'), op('B') ]) ]).toEqual([ 0, 1 ]);
    // an unchanged routine marks nothing
    expect([ ...aiChangedOperations([ op('A'), op('B') ], [ op('A'), op('B') ]) ]).toEqual([]);
  });

  // an editor showing what the assistant just wrote into clickRoutine
  function withResult(result = { explanation: 'It shuffles the deck too.' }) {
    const before = [ { func: 'FLIP' } ];
    const after = [ { func: 'FLIP' }, { func: 'SHUFFLE', holder: 'deck' } ];
    // the widget already holds what the assistant wrote; the marks say which parts are new
    const { widget, editor } = makeEditor({ type: 'button', clickRoutine: after });
    editor.expandedEvents.clickRoutine = true;
    aiRecordResult(widget.get('id'), 'clickRoutine', before, after, result);
    editor.render();
    return { widget, editor, before, after };
  }

  const marksOf = editor => editor.routineEditors.clickRoutine.directChildCards()
    .map(c => c.classList.contains('routine-editor-operation-ai-changed'));

  test('applying marks the changed operations in the editor and says what happened', () => {
    const { editor } = withResult();
    expect(marksOf(editor)).toEqual([ false, true ]); // the operation that was already there is left alone
    const note = editor.domElement.querySelector('.ai-routine-note');
    expect(note.textContent).toContain('Undo');
    expect(note.textContent).toContain('It shuffles the deck too.');
    expect(note.textContent).toContain("If you like this feature, please consider donating. AI isn't free.");
    expect(note.querySelector('a').href).toContain('patreon.com');
  });

  test('the marks and the note outlive the re-renders an edit causes', () => {
    const { editor } = withResult();
    // editing anything rebuilds the whole section and every operation card
    editor.routineEditors.clickRoutine.routineChanged();
    editor.render();
    expect(marksOf(editor)).toEqual([ false, true ]);
    expect(editor.domElement.querySelector('.ai-routine-note')).not.toBe(null);
    // ...but the flash belongs to the moment the answer landed, not to every edit
    const flashing = editor.routineEditors.clickRoutine.directChildCards()
      .filter(c => c.classList.contains('routine-editor-operation-ai-flash'));
    expect(flashing).toEqual([]);
  });

  test('dismissing the note takes the marks with it, for good', () => {
    const { editor } = withResult();
    editor.domElement.querySelector('.ai-routine-note-close').dispatchEvent(new Event('click'));
    expect(editor.domElement.querySelector('.ai-routine-note')).toBe(null);
    expect(marksOf(editor)).toEqual([ false, false ]);
    editor.render(); // and it does not come back on the next one
    expect(editor.domElement.querySelector('.ai-routine-note')).toBe(null);
    expect(marksOf(editor)).toEqual([ false, false ]);
  });

  test('the note stops promising undo once the routine was edited by hand', () => {
    const { widget, editor } = withResult();
    expect(editor.domElement.querySelector('.ai-routine-note').textContent).toContain('Undo');
    editor.routineEditors.clickRoutine.routine.push({ func: 'FLIP' });
    editor.routineEditors.clickRoutine.routineChanged();
    editor.render();
    const note = editor.domElement.querySelector('.ai-routine-note');
    expect(note.textContent).not.toContain('Undo');
    expect(note.textContent).toContain('2 of 3 operations are new or changed, 1 kept');
    aiForgetResult(widget.get('id'), 'clickRoutine');
  });

  test('validation reports only what the routine adds, not what the room already had', () => {
    const before = globalThis.widgets;
    const state = {
      board: { id: 'board', type: 'holder', clickRoutine: [ { func: 'NOPE' } ] },
      b1: { id: 'b1', type: 'button' }
    };
    globalThis.validateGameFile = validateGameFile;
    globalThis.widgets = new Map(Object.entries(state).map(([ id, s ]) => [ id, { unalteredState: s } ]));
    try {
      const clean = aiValidateRoutine('b1', 'clickRoutine', [ { func: 'SHUFFLE', holder: 'board' } ]);
      expect(clean).toEqual([]); // the room's own broken routine is not this one's fault
      const broken = aiValidateRoutine('b1', 'clickRoutine', [ { func: 'SHUFFLE', holder: 'ghost' } ]);
      expect(broken.length).toBeGreaterThan(0);
      expect(JSON.stringify(broken)).toContain('ghost');
    } finally {
      globalThis.widgets = before;
    }
  });
});
