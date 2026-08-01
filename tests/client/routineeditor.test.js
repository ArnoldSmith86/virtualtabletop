/**
 * @jest-environment jsdom
 */
import fs from 'fs';

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
  window.customSelectionCallback = null;
  window.startCustomSelection = () => {};
  window.endCustomSelection = () => {};
  window.widgets = new Map();
  window.roomID = 'testroom'; // the tutorial links of info popups use it
  window.setSelection = () => {};
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
    'client/js/editor/controls/events.js'
  ];
  const code = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const exposed = [
    'RoutineEditor', 'RoutineOperationEditor', 'IfRoutineOperationEditor', 'ForeachRoutineOperationEditor',
    'VarStringRoutineOperationEditor', 'CommentRoutineOperationEditor', 'UnknownRoutineOperationEditor',
    'editorForOperation', 'routineOperationExamples', 'routineOperationMetadata', 'RoutineVariantMenu',
    'routineOperationVariantChoices', 'operationVariantValues', 'RoutineOperationPopup', 'RoutineClausePopup',
    'RoutineHoldersOrCollectionSourcePopup', 'RoutineForeachSourcePopup', 'newRoutineValues', 'escapeHTML',
    'EventsEditor', 'propertyAutomations', 'InfoPopup', 'RoutineStringPopup', 'RoutineNumberPopup', 'RoutinePropertyNamePopup',
    'RoutineColorPopup', 'RoutineIconPopup', 'RoutineJSONPopup', 'RoutineWidgetIDPopup',
    'renderWidgetSelectPopout', 'startWidgetPicker', 'stopWidgetPicker', 'isWidgetPickerActive',
    'handleWidgetPickerSelection', 'handleWidgetPickerClick', 'commonInfoTopic', 'parameterInfoLine', 'templateLead', 'leadLabel', 'infoButton',
    'structureInfoHTML'
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
      const ignored = editor.ignoredParameters();
      const fixed = editor.currentVariant().fixed || [];
      for (const name in routineOperationMetadata[func].parameters)
        if (name in ignored)
          expect(referenced).not.toContain(name); // an ignored parameter is neither worded nor offered as an option
        else if (fixed.includes(name))
          expect(routineOperationVariantChoices({ func }).length).toBeGreaterThan(1); // changed by picking another way to work
        else
          expect(referenced).toContain(name);
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
    expect(move.ignoredParameters().count).toMatch(/fill up to/);
    expect(move.clauses().map(clause => clause.id)).not.toContain('count');
    expect(move.render().querySelector('[data-parameter="count"]')).toBeNull();
  });

  test('the sentence leaves out parameters the engine ignores', () => {
    // FLIP flips to the given face, so the cycle direction has no effect
    const flip = renderOperation({ func: 'FLIP', holder: 'h1', face: 1, faceCycle: 'backward' }).dom;
    expect(flip.textContent).toContain('face down');
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
    expect(template({ func: 'FLIP', faceCycle: 'random' })).toContain('to {faceCycle}');
    expect(template({ func: 'FLIP', face: 0 })).toContain('Turn face up');
    expect(template({ func: 'FLIP', face: 1 })).toContain('Turn face down');
    expect(template({ func: 'FLIP', face: 3 })).toContain('Turn to the face {face}');
    expect(template({ func: 'CANVAS', canvas: 'c1' })).toContain('Clear the canvas {canvas}');
    expect(template({ func: 'CANVAS' })).toContain('Clear the canvas {collection}');
    expect(template({ func: 'CANVAS', mode: 'setPixel' })).toContain('({x}, {y})');
    expect(template({ func: 'CANVAS', mode: 'change' })).toContain('to {color}');
    expect(template({ func: 'AUDIO', silence: true })).toContain('Stop all sounds');
    expect(template({ func: 'SET', relation: '!' })).toContain('Toggle {property}');
    expect(template({ func: 'MOVE', fillTo: 3 })).toContain('until it holds {fillTo}');
    expect(template({ func: 'SELECT', mode: 'add' })).toContain('Add to the pick');
    expect(template({ func: 'SELECT' })).toContain('Pick');
    expect(template({ func: 'TIMER', mode: 'inc', seconds: 5 })).toContain('{seconds} seconds');
    expect(template({ func: 'TIMER' })).toContain('Start or pause');
    expect(template({ func: 'SHUFFLE', mode: 'reverse' })).toContain('Reverse the order');
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
    expect(editor.getDisplayedValue('expression')).toBe('1');
    let result = null;
    editor.registerChangeListener(v => result = v);
    editor.onNewValue({ variable: 'y' });
    expect(result).toBe('var y = 1');
  });

  test('complex var statements fall back to raw editing', () => {
    const { editor } = renderOperation('var $dynamic.${key} = 1 + 2');
    expect(editor.getTemplate()).toBe('Variable {variable} gets the value {expression}');
    const { editor: raw } = renderOperation('var x'); // no " = ", unrepresentable
    expect(raw.getTemplate()).toBe('{statement}');
  });

  // the wording of the whole catalogue in one place: operations taken from the
  // games in library/games, each with the sentence it has to read as. Defaults
  // that mean "not in use" stay out of it, enums and yes/no values are words,
  // and the name of the operation never turns up in its own sentence.
  test.each([
    [ { func: 'SET', collection: [ 'playHolder1' ], property: 'pause', value: true }, 'Set pause of playHolder1 to true' ],
    [ { func: 'SET', property: 'lastOwner', value: null }, 'Set lastOwner of the picked widgets to null' ],
    // the six ways a SET can work, each as the catalogue words it
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
      'Pick at most 5 random cards from hand where parent is nothing, sorted by value — call them aces' ],
    [ { func: 'SELECT', mode: 'add', property: 'letter', value: '${value}', collection: 'letters' },
      'Add to the pick letters: widgets where letter is value' ],
    [ { func: 'IF', operand1: '${cardType}', operand2: 'boba' }, 'If cardType is boba' ],
    [ { func: 'IF', condition: '${showLog}' }, 'If this is true: showLog' ],
    [ { func: 'GET', property: 'cardType' }, 'Read cardType of the picked widgets' ],
    [ { func: 'GET', property: 'score', aggregation: 'sum', variable: 'total' }, 'Add up score of the picked widgets and remember it as total' ],
    [ { func: 'CALL', routine: 'startRandomRoutine' }, 'Run the routine startRandomRoutine' ],
    [ { func: 'CALL', routine: 'dealRoutine', widget: 'deck1', arguments: { count: 5 } }, 'Run the routine dealRoutine of deck1, passing count: 5' ],
    [ { func: 'MOVE', from: 'deck1', to: 'hand1' }, 'Move 1 widget from deck1 to hand1' ],
    [ { func: 'MOVE', to: 'discard' }, 'Move all widgets from the picked widgets to discard' ],
    [ { func: 'COUNT' }, 'Count the picked widgets' ],
    [ { func: 'COUNT', holder: 'hand1', variable: 'cards' }, 'Count what is in hand1 and remember it as cards' ],
    [ { func: 'FLIP', holder: 'deck1', face: 0 }, 'Turn face up all widgets in deck1' ],
    [ { func: 'CLICK', collection: 'myPick', count: 2, mode: 'ignoreClickRoutine' }, 'Click myPick, 2 times, but do not run their click routines' ],
    [ { func: 'RECALL', holder: 'deck1' }, 'Gather all the cards back into deck1' ],
    [ { func: 'RECALL', holder: 'deck1', owned: false }, 'Gather all the cards back into deck1, except the cards players hold' ],
    [ { func: 'SHUFFLE', holder: 'deck1' }, 'Shuffle deck1' ],
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
    [ { func: 'INPUT', fields: [ {}, {}, {} ], header: 'Choose a card' }, 'Ask the player to fill in 3 fields, titled Choose a card' ],
    [ { func: 'UPLOAD' }, 'Ask the player for a file' ],
    [ { func: 'FOREACH', range: [ 1, 10 ] }, 'For each number of 1 to 10' ]
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
    expect(renderOperation({ func: 'SET', relation: '+', property: '' }).dom.textContent).toContain('value of the picked widgets by number');
    expect(renderOperation({ func: 'SET', relation: '+', property: '', value: '' }).dom.textContent).toContain('"text" to property of the picked widgets');
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
    expect(renderOperation({ func: 'SHUFFLE', mode: 'riffle' }).dom.textContent).toContain('Riffle shuffle');
  });

  // the order of https://agent.virtualtabletop.io/reports/routine-grammar/ - the
  // phrasing games write most often is the first entry, not the last one
  test('the drop-down offers the ways to work in the order of the grammar catalogue', () => {
    const leads = func => routineOperationVariantChoices({ func }).map(c => c.lead);
    expect(leads('SET')).toEqual([ 'Set', 'Increase', 'Decrease', 'Multiply', 'Divide', 'Toggle', 'Append' ]);
    expect(leads('SELECT')[0]).toBe('Pick');
    expect(leads('SCORE')[0]).toBe('Set');
    expect(leads('TURN')).toEqual([ 'Pass the turn on', 'Pass the turn back', 'Give the turn to a random seat', 'Give the turn to the seat at position', 'Give the turn to the seat' ]);
    expect(leads('GET')[0]).toBe('Read');
    expect(leads('SHUFFLE')[0]).toBe('Shuffle');
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
    expect(choices.map(c => c.lead)).toEqual([ 'Turn face up', 'Turn face down', 'Turn to the face', 'Flip' ]);
    expect(choices[0].example).toContain('deck1');
    expect(choices[0].example).toContain('Turn face up');
    // operations with only one way to work offer nothing to pick
    expect(routineOperationVariantChoices({ func: 'DELAY' })).toEqual([]);
  });

  test('the sentence starts with a drop-down of the ways to work, plain text when there is one', () => {
    const flip = renderOperation({ func: 'FLIP', holder: 'deck1', face: 0 }).dom;
    const lead = flip.querySelector('.routine-editor-variant');
    expect(lead.textContent).toContain('Turn face up');
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
    expect(menu.querySelector('h1')).toBeNull(); // a menu, not one of the parameter popups
    expect(menu.querySelector('.popup-close')).not.toBeNull(); // but it can be closed like every other popup
    const entryLabels = [...menu.querySelectorAll('.popup-menu-entry-label')].map(e => e.textContent);
    expect(entryLabels).toEqual([ 'Turn face up', 'Turn face down', 'Turn to the face', 'Flip' ]);
    // nothing but the phrases: it is the expander of the field the sentence
    // starts with, and the sentence each phrase produces is a hover away
    expect(menu.querySelector('.popup-menu-entry-preview')).toBeNull();
    expect(menu.querySelector('.popup-menu-entry').title).toContain('deck1');
    expect(menu.querySelector('button.selected .popup-menu-entry-label').textContent).toBe('Turn face up');
    [...menu.querySelectorAll('.popup-menu-entry')].find(b => b.textContent.startsWith('Turn face down')).dispatchEvent(new Event('click'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(result.face).toBe(1);
  });

  test('picking another way to work rewrites exactly the parameters that tell them apart', () => {
    const operation = { func: 'FLIP', holder: 'deck1', faceCycle: 'backward' };
    const down = routineOperationVariantChoices(operation).find(c => c.id == 'down');
    expect(down.values).toEqual({ func: 'FLIP', holder: 'deck1', faceCycle: undefined, face: 1 });
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
    // everything else is nothing but its func
    expect(newOperation('SHUFFLE')).toEqual({ func: 'SHUFFLE' });
  });

  test('the field a sentence starts with is as wide as the phrases it holds', () => {
    const lead = renderOperation({ func: 'FLIP', holder: 'deck1', face: 0 }).dom.querySelector('.routine-editor-variant-menu');
    // "Turn to the face" is the longest of the four ways a FLIP can work
    expect(lead.style.minWidth).toBe('16ch');
    // one way to work is no field at all
    expect(renderOperation({ func: 'DELAY' }).dom.querySelector('.routine-editor-variant').style.minWidth).toBe('');
  });

  test('an option only shows up in the sentence while it is in use', () => {
    const withoutFace = renderOperation({ func: 'MOVE', from: 'a', to: 'b' }).dom;
    expect(withoutFace.querySelector('[data-parameter="face"]')).toBeNull();
    expect(withoutFace.querySelector('.routine-editor-add-clause')).not.toBeNull();
    const withFace = renderOperation({ func: 'MOVE', from: 'a', to: 'b', face: 0 }).dom;
    expect(withFace.textContent).toContain('and turn them face up');
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
    expect(offered.map(clause => clause.label)).toContain('nearest cards first');
    const byDistance = offered.find(clause => clause.id == 'byDistance');
    expect(editor.clauseAddValues(byDistance)).toEqual({ byDistance: true }); // switching it on has to change something
    expect(editor.renderClauseExample(byDistance)).toBe('nearest cards first');
  });

  test('the options are a plain menu of phrases, each with the sentence it would add', async () => {
    const { dom } = renderOperation({ func: 'RECALL', holder: 'deck1' });
    dom.querySelector('.routine-editor-add-clause').dispatchEvent(new Event('click'));
    await new Promise(resolve => setTimeout(resolve, 0));
    const menu = document.querySelector('.inline-popup.popup-menu');
    expect(menu).not.toBeNull();
    expect(menu.querySelector('h1')).toBeNull(); // no title repeating the section repeating the one list
    expect(menu.querySelector('.accordion-section')).toBeNull();
    expect([...menu.querySelectorAll('.popup-menu-entry-label')].map(e => e.textContent)).toContain('nearest cards first');
    expect(menu.querySelector('.popup-close')).not.toBeNull();
    menu.remove();
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
    for (const name in routineOperationMetadata.INPUT.parameters)
      if (name != 'fields') // the one the sentence itself shows
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

  test('removing an operation splices the routine', () => {
    const routine = [ { func: 'FLIP' }, { func: 'SHUFFLE' } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    let notified = null;
    editor.registerChangeListener(v => notified = v);
    [...editor.domElement.querySelectorAll('.routine-editor-operation-controls .material-symbols')].find(b => b.textContent == 'delete').dispatchEvent(new Event('click'));
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
    expect(values).toEqual([ '1', 'stop' ]);
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
    const widget = { state: { type: 'card', clickRoutine: [ { func: 'FLIP' } ], customProp: 'v' }, get(p) { return p in defaults ? defaults[p] : this.state[p]; } };
    const editor = new EventsEditor(widget, () => {});
    expect(editor.recordResetProperties()).toEqual({ x: 100, y: 50, z: 2, rotation: 0, parent: null, owner: null, activeFace: 1, customProp: 'v' });
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
    expect(sectionTitles(popup)).toEqual([ 'Values this routine has', 'A property of a widget in the room' ]);
    popup.hide();
  });

  test('the values are grouped by where they come from, predefined ones included', () => {
    const popup = showPopup(RoutineHoldersOrCollectionSourcePopup, { func: 'FLIP' }, [ 'holder', 'collection' ], [ 'cards' ], [ 'aces' ]);
    const groups = [...popup.domElement.querySelectorAll('.popup-value-group')];
    expect(groups.map(g => g.textContent)).toEqual([
      'Values earlier operations remember', 'Groups of widgets earlier operations select',
      'Available in every routine', 'Groups available in every routine'
    ]);
    // and each group says by its color what it produces, the way the sentence does
    expect(groups.map(g => g.dataset.kind)).toEqual([ 'variable', 'collection', 'variable', 'collection' ]);
    // and the picker that comes first: widgets are chosen in the room, not typed
    expect(sectionTitles(popup)[0]).toBe('Widgets in the room');
    popup.hide();
  });

  test('the sections are colored by what they produce and only one is open', () => {
    const popup = showPopup(RoutineHoldersOrCollectionSourcePopup, { func: 'FLIP' }, [ 'holder', 'collection' ], [ 'cards' ], [ 'aces' ]);
    const sections = [...popup.domElement.querySelectorAll('.accordion-section')];
    expect(sections.map(s => s.dataset.kind)).toEqual([ 'widget', 'variable', 'property' ]);
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
    // a pointer travelling past the button leaves it alone
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
      for(const name in routineOperationMetadata[func].parameters)
        expect(commonInfoTopic(`${func}.${name}`) || parameterInfoLine(topic.info, name)).toBeTruthy();
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

describe('color and icon parameters use the picker popups', () => {
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

  test('no parameter offers null as a value, that is what "use default" does', () => {
    for(const func in routineOperationMetadata)
      for(const name in routineOperationMetadata[func].parameters)
        expect(routineOperationMetadata[func].parameters[name].special || []).not.toContain(null);
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
    handleWidgetPickerSelection([ get('c1') ]);
    expect(picked).toBe('h1');
  });

  test('a click that resolves to nothing matching is ignored', () => {
    const get = room([ 'target', 'button' ], [ 'l1', 'label' ]);
    let picked = null;
    pickInRoom({ typeFilter: 'holder', apply: id => picked = id });
    handleWidgetPickerSelection([ get('l1') ]);
    expect(picked).toBeNull();
    expect(isWidgetPickerActive()).toBe(true); // still waiting for a matching click
  });

  test('without a type filter only resolveCovering pickers look past cards and piles', () => {
    const get = room([ 'target', 'button' ], [ 'h1', 'holder' ], [ 'p1', 'pile', 'h1' ], [ 'c1', 'card', 'p1' ], [ 'c2', 'card' ]);
    let picked = null;
    pickInRoom({ apply: id => picked = id });
    handleWidgetPickerSelection([ get('c1') ]); // the plain picker takes what was clicked
    expect(picked).toBe('c1');

    stopWidgetPicker();
    pickInRoom({ resolveCovering: true, apply: id => picked = id });
    handleWidgetPickerSelection([ get('c1') ]);
    expect(picked).toBe('h1');

    stopWidgetPicker();
    pickInRoom({ resolveCovering: true, apply: id => picked = id });
    handleWidgetPickerSelection([ get('c2') ]); // a card on the table stays itself
    expect(picked).toBe('c2');
  });

  test('a broken parent chain does not send the resolver in circles', () => {
    const get = room([ 'target', 'button' ], [ 'c1', 'card', 'c2' ], [ 'c2', 'card', 'c1' ]);
    let picked = null;
    pickInRoom({ typeFilter: 'holder', apply: id => picked = id });
    handleWidgetPickerSelection([ get('c1') ]);
    expect(picked).toBeNull();
  });

  test('picking several widgets keeps the pick mode running and collects them', () => {
    const get = room([ 'target', 'button' ], [ 'h1', 'holder' ], [ 'h2', 'holder' ], [ 'c1', 'card', 'h2' ]);
    let picked = [];
    pickInRoom({ multiple: true, resolveCovering: true, getSelectedIDs: () => picked, apply: ids => picked = ids });
    handleWidgetPickerSelection([ get('h1') ]);
    expect(isWidgetPickerActive()).toBe(true);
    handleWidgetPickerSelection([ get('c1') ]);
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
    handleWidgetPickerSelection([ widgets.get('target') ]);
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
    [...popup.domElement.querySelectorAll('button')].find(b => b.textContent == 'Use these widgets').dispatchEvent(new Event('click'));
    expect(value).toEqual({ from: [ 'h1', 'h2' ] });
    popup.hide();
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
      'LABEL.label': 'label',
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
    const label = showPopup({ func: 'LABEL' }, [ 'label' ]);
    expect(pickedTypes(label)).toEqual([ 'label' ]);
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
      .toEqual([ 'This widget', 'Other widgets in this room', 'Other standard properties' ]);
    expect(names().slice(0, 4)).toEqual([ 'id', 'myScore', 'type', 'cardType' ]); // this widget first, then the room
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

  test('FOREACH source popup clears competing parameters', () => {
    const popup = new RoutineForeachSourcePopup();
    popup.setOperationDetails({ func: 'FOREACH', 'in': [ 1 ] }, [ 'in', 'range', 'collection' ], { state: {} }, [], []);
    let value = null;
    popup.registerChangeListener(v => value = v);
    popup.setNewCollectionValue('mine');
    expect(value.collection).toBe('mine');
    expect('in' in value && value['in'] === undefined).toBe(true);
  });
});
