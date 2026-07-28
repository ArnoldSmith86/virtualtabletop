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
    'editorForOperation', 'routineOperationExamples', 'routineOperationMetadata', 'simpleRoutineOperationExamples',
    'RoutineHoldersOrCollectionSourcePopup', 'RoutineForeachSourcePopup', 'newRoutineValues', 'escapeHTML',
    'EventsEditor', 'InfoPopup', 'RoutineStringPopup', 'RoutineNumberPopup', 'RoutinePropertyNamePopup',
    'RoutineColorPopup', 'RoutineIconPopup', 'RoutineJSONPopup', 'RoutineWidgetIDPopup',
    'renderWidgetSelectPopout', 'startWidgetPicker', 'stopWidgetPicker', 'isWidgetPickerActive',
    'handleWidgetPickerSelection', 'operationUIState', 'commonInfoTopic', 'parameterInfoLine'
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

  test('simple operation recipes reference valid operations', () => {
    expect(simpleRoutineOperationExamples.length).toBeGreaterThan(3);
    for (const { example, newOperation } of simpleRoutineOperationExamples) {
      expect(typeof example).toBe('string');
      expect(routineOperationMetadata[newOperation.func]).toBeDefined();
      for (const key in newOperation)
        if (key != 'func')
          expect(routineOperationMetadata[newOperation.func].parameters[key]).toBeDefined();
    }
  });

  test('common operations include SELECT and one MOVE, and drop AUDIO', () => {
    const funcs = simpleRoutineOperationExamples.map(e => e.newOperation.func);
    expect(funcs).toContain('SELECT');
    expect(funcs.filter(f => f == 'MOVE')).toHaveLength(1);
    expect(funcs).not.toContain('AUDIO');
  });

  test('every declared parameter is reachable as a chip in the template', () => {
    for (const func in routineOperationMetadata) {
      const editor = editorForOperation({ func });
      editor.setOperationDetails({ state: {} }, { func }, [], []);
      const referenced = (editor.getTemplate().match(/\{([a-zA-Z0-9,]+)\}/g) || []).flatMap(m => m.slice(1, -1).split(','));
      const ignored = editor.ignoredParameters();
      for (const name in routineOperationMetadata[func].parameters)
        if (name in ignored)
          expect(referenced).not.toContain(name); // ignored parameters stay out of the summary, the list view still offers them
        else
          expect(referenced).toContain(name);
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

  test('the sentence hides default-valued segments and the arrow expands to a list view', () => {
    const { editor, dom } = renderOperation({ func: 'MOVE', from: 'h1', to: 'h2' });
    expect(dom.querySelector('[data-parameter="face"]')).toBeNull(); // face at its default stays hidden
    const toggle = dom.querySelector('.routine-editor-view-toggle');
    expect(toggle).not.toBeNull();
    expect(dom.querySelector('.routine-editor-operation-body').firstChild).toBe(toggle); // the arrow sits at the start of the operation
    toggle.dispatchEvent(new Event('click'));
    expect(editor.domElement.classList.contains('list-view')).toBe(true);
    const rows = editor.domElement.querySelectorAll('.routine-editor-parameter-row');
    expect(rows.length).toBe(1 + Object.keys(routineOperationMetadata.MOVE.parameters).length);
  });

  test('operations without parameters get no view toggle', () => {
    const { dom } = renderOperation('// hello');
    expect(dom.querySelector('.routine-editor-view-toggle')).toBeNull();
  });

  test('the IF list view includes the condition parameter and keeps nested routines', () => {
    const { editor, dom } = renderOperation({ func: 'IF', operand1: 1, thenRoutine: [ { func: 'FLIP' } ] });
    const toggle = dom.querySelector('.routine-editor-view-toggle');
    expect(toggle).not.toBeNull();
    toggle.dispatchEvent(new Event('click'));
    const names = [...editor.domElement.querySelectorAll(':scope > .routine-editor-operation-header > .routine-editor-operation-body > .routine-editor-parameter-row .routine-editor-parameter-name')].map(e => e.textContent);
    expect(names).toEqual([ 'condition', 'operand1', 'relation', 'operand2' ]);
    expect(editor.domElement.querySelector('.routine-editor')).not.toBeNull(); // nested routines stay visible
  });

  test('shows optional segments when their parameter is explicitly set', () => {
    const { dom } = renderOperation({ func: 'MOVE', from: 'h1', to: 'h2', face: 0 });
    expect(dom.querySelector('[data-parameter="face"]')).not.toBeNull();
  });

  test('the list view strikes ignored parameters and explains why', () => {
    const move = editorForOperation({ func: 'MOVE', fillTo: 3, count: 2 });
    move.setOperationDetails({ state: {} }, { func: 'MOVE', fillTo: 3, count: 2 }, [], []);
    expect(move.ignoredParameters().count).toMatch(/fill up to/);
    const rendered = renderInListView({ func: 'MOVE', fillTo: 3, count: 2 });
    const countRow = [...rendered.querySelectorAll('.routine-editor-parameter-row')].find(r => r.textContent.startsWith('count'));
    expect(countRow.classList.contains('routine-editor-parameter-ignored')).toBe(true);
    expect(countRow.querySelector('.routine-editor-parameter-ignored-warning').title).toMatch(/fill up to/);
  });

  test('the sentence leaves out parameters the engine ignores', () => {
    // FLIP flips to the given face, so the cycle direction has no effect
    const flip = renderOperation({ func: 'FLIP', holder: 'h1', face: 1, faceCycle: 'backward' }).dom;
    expect(flip.textContent).toContain('to face');
    expect(flip.querySelector('[data-parameter="faceCycle"]')).toBeNull();

    // the deprecated canvas parameter replaces collection
    const canvas = renderOperation({ func: 'CANVAS', canvas: 'c1', collection: 'stuff' }).dom;
    expect(canvas.querySelector('[data-parameter="canvas"]').textContent).toBe('c1');
    expect(canvas.querySelector('[data-parameter="collection"]')).toBeNull();

    // an explicitly set count is ignored while MOVE fills up to a number
    const move = renderOperation({ func: 'MOVE', from: 'h1', to: 'h2', fillTo: 3, count: 2 }).dom;
    expect(move.querySelector('[data-parameter="count"]')).toBeNull();
  });

  test('the deprecated CANVAS canvas parameter is editable in both views', () => {
    const sentence = renderOperation({ func: 'CANVAS', canvas: 'c1' }).dom;
    expect(sentence.querySelector('[data-parameter="canvas"]')).not.toBeNull();
    const list = renderInListView({ func: 'CANVAS' });
    const canvasRow = [...list.querySelectorAll('.routine-editor-parameter-row')].find(r => r.textContent.startsWith('canvas'));
    expect(canvasRow).not.toBeNull(); // available even when the operation does not set it
  });

  test('a deprecated parameter gets a warning info button in both views', () => {
    for(const dom of [ renderOperation({ func: 'CANVAS', canvas: 'c1' }).dom, renderInListView({ func: 'CANVAS', canvas: 'c1' }) ]) {
      const warning = dom.querySelector('.routine-editor-parameter-warning.deprecated');
      expect(warning).not.toBeNull();
      expect(warning.previousSibling.dataset.parameter).toBe('canvas');
      warning.dispatchEvent(new Event('click'));
      const popup = document.querySelector('.inline-popup');
      expect(popup.textContent).toMatch(/deprecated/);
      expect(popup.textContent).toMatch(/collection/);
      popup.querySelector('.popup-close').dispatchEvent(new Event('click'));
    }
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

  test('the list view shows custom properties the operation does not support', () => {
    const rendered = renderInListView({ func: 'FLIP', typo: 3, holder: 'h1' });
    const row = [...rendered.querySelectorAll('.routine-editor-parameter-row')].find(r => r.textContent.startsWith('typo'));
    expect(row).not.toBeNull();
    expect(row.classList.contains('routine-editor-parameter-unsupported')).toBe(true);
    expect(row.querySelector('[data-parameter="typo"]').textContent).toBe('3');
    const warning = row.querySelector('.routine-editor-parameter-warning.unsupported');
    expect(warning).not.toBeNull();
    warning.dispatchEvent(new Event('click'));
    const popup = document.querySelector('.inline-popup');
    expect(popup.textContent).toContain('FLIP does not support the property typo');
    popup.querySelector('.popup-close').dispatchEvent(new Event('click'));
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

  function renderInListView(operation) {
    const editor = editorForOperation(operation);
    editor.setOperationDetails({ state: {} }, operation, [], []);
    const dom = editor.render();
    const toggle = dom.querySelector('.routine-editor-view-toggle');
    toggle.dispatchEvent(new Event('click'));
    return editor.domElement;
  }

  test('the expanded view offers a raw-JSON button', () => {
    const dom = renderInListView({ func: 'MOVE', from: 'h1' });
    expect(dom.querySelector('.routine-editor-operation-json')).not.toBeNull();
  });

  test('conditional templates follow the parameter values', () => {
    const template = operation => {
      const editor = editorForOperation(operation);
      editor.setOperationDetails({ state: {} }, operation, [], []);
      return editor.getTemplate();
    };
    expect(template({ func: 'FLIP', faceCycle: 'random' })).toContain('a {faceCycle} face');
    expect(template({ func: 'FLIP' })).toContain('cycle {faceCycle}');
    expect(template({ func: 'FLIP', face: 1 })).toContain('to face {face}');
    expect(template({ func: 'CANVAS', canvas: 'c1' })).toContain('on {canvas}');
    expect(template({ func: 'CANVAS' })).toContain('on {collection}');
    expect(template({ func: 'CANVAS', mode: 'setPixel' })).toContain('({x}, {y})');
    expect(template({ func: 'CANVAS', mode: 'change' })).toContain('to {color}');
    expect(template({ func: 'AUDIO', silence: true })).toContain('stop all sounds');
    expect(template({ func: 'SET', relation: '!' })).toContain('the {relation} of its current value');
    expect(template({ func: 'MOVE', fillTo: 3 })).toContain('fill up to {fillTo}');
    expect(template({ func: 'SELECT', mode: 'add' })).toContain('{mode} to {collection}');
    expect(template({ func: 'SELECT' })).toContain('{mode} as {collection}');
    expect(template({ func: 'TIMER', mode: 'inc', seconds: 5 })).toContain('time by {seconds} seconds');
    expect(template({ func: 'TIMER' })).toContain('{mode} timers in {collection}');
    expect(template({ func: 'SHUFFLE', mode: 'reverse' })).toContain('order of widgets');
    expect(template({ func: 'TURN', turnCycle: 'random' })).toContain('choose a {turnCycle} seat');
    expect(template({ func: 'LABEL', label: 'l1' })).toContain('to {label}');
    expect(template({ func: 'LABEL' })).toContain('labels in {collection}');
  });

  test('classifies parameter chips for color coding', () => {
    const { dom } = renderOperation({ func: 'SELECT', value: '${myVar}', collection: 'stuff' });
    expect(dom.querySelector('.routine-editor-parameter-func')).not.toBeNull();
    expect(dom.querySelector('.routine-editor-parameter-variable')).not.toBeNull();
    expect(dom.querySelector('.routine-editor-parameter-collection')).not.toBeNull();
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
    expect(editor.getTemplate()).toBe('variable {variable} gets value {expression}');
    const { editor: raw } = renderOperation('var x'); // no " = ", unrepresentable
    expect(raw.getTemplate()).toBe('{statement}');
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
    [...editor.domElement.querySelectorAll('.routine-editor-operation-buttons .material-symbols')].find(b => b.textContent == 'delete').dispatchEvent(new Event('click'));
    expect(notified).toHaveLength(1);
    expect(notified[0].func).toBe('SHUFFLE');
  });

  test('moves an operation into an adjacent IF block', () => {
    const routine = [ { func: 'IF', operand1: 1 }, { func: 'FLIP' } ];
    const editor = new RoutineEditor({ state: {} }, routine);
    let notified = null;
    editor.registerChangeListener(v => notified = v);
    // the FLIP row shows a ↰ to nest into the IF above
    const upInto = [...editor.domElement.querySelectorAll('.routine-editor-block-arrow')].find(b => b.textContent == '↰');
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
    // the ↱ inside the IF block hoists the first nested op out after the IF
    const out = [...editor.domElement.querySelectorAll('.routine-editor .routine-editor-block-arrow')].find(b => b.textContent == '↱');
    expect(out).not.toBeNull();
    out.dispatchEvent(new Event('click'));
    expect(notified).toHaveLength(2);
    expect(notified[0].thenRoutine).toEqual([ { func: 'SHUFFLE' } ]);
    expect(notified[1].func).toBe('FLIP');
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

  test('toggling the view of a selected operation keeps it looking selected', () => {
    const editor = new RoutineEditor({ state: {} }, [ { func: 'MOVE', from: 'h1', to: 'h2' }, { func: 'FLIP' } ]);
    editor.directChildCards()[0].dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
    editor.directChildCards()[0].querySelector('.routine-editor-view-toggle').dispatchEvent(new Event('click'));
    // the toggle replaces the card: without the selection class it looks
    // unselected while a drag would still move it along with the next selection
    expect(editor.selectedIndices.has(0)).toBe(true);
    expect(editor.directChildCards()[0].classList.contains('routine-editor-operation-selected')).toBe(true);
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

  test('holders get onEnter/onLeave cards, other widgets only resetProperties', () => {
    const { editor } = makeEditor({ type: 'holder' });
    const props = [...editor.domElement.querySelectorAll('.events-editor-property')].map(e => e.textContent);
    expect(props).toEqual(expect.arrayContaining([ 'onEnter', 'onLeave', 'resetProperties' ]));
    const { editor: buttonEditor } = makeEditor({ type: 'button' });
    const buttonProps = [...buttonEditor.domElement.querySelectorAll('.events-editor-property')].map(e => e.textContent);
    expect(buttonProps).toContain('resetProperties');
    expect(buttonProps).not.toContain('onEnter');
  });

  test('automation cards are collapsed by default and expand to a JSON textarea', () => {
    const { editor } = makeEditor({ type: 'holder', onEnter: { activeFace: 1 } });
    expect(editor.domElement.querySelector('.events-editor-property-json')).toBeNull();
    editor.expandedEvents.onEnter = true;
    editor.render();
    const textarea = editor.domElement.querySelector('.events-editor-property-json');
    expect(textarea).not.toBeNull();
    expect(JSON.parse(textarea.value)).toEqual({ activeFace: 1 });
  });

  test('editing the JSON reports the parsed value', () => {
    let received = null;
    const { editor } = makeEditor({ type: 'holder' }, (property, value) => received = { property, value });
    editor.expandedEvents.onLeave = true;
    editor.render();
    const textarea = editor.domElement.querySelector('.events-editor-property-json');
    textarea.value = '{ "activeFace": 0 }';
    textarea.dispatchEvent(new Event('change'));
    expect(received).toEqual({ property: 'onLeave', value: { activeFace: 0 } });
  });

  test('invalid JSON is flagged and not reported', () => {
    let received = null;
    const { editor } = makeEditor({ type: 'button' }, (property, value) => received = { property, value });
    editor.expandedEvents.resetProperties = true;
    editor.render();
    const textarea = editor.domElement.querySelector('.events-editor-property-json');
    textarea.value = '{ broken';
    textarea.dispatchEvent(new Event('change'));
    expect(received).toBeNull();
    expect(textarea.classList.contains('inputError')).toBe(true);
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

  test('default-null parameters display as unset, explicit null keeps its display', () => {
    const editor = editorForOperation({ func: 'SELECT' });
    editor.setOperationDetails({ state: {} }, { func: 'SELECT' }, [], []);
    expect(editor.getDisplayedValue('sortBy')).toBe('unset');
    const setEditor = editorForOperation({ func: 'SET', value: null });
    setEditor.setOperationDetails({ state: {} }, { func: 'SET', value: null }, [], []);
    expect(String(setEditor.getDisplayedValue('value'))).toBe('null'); // explicit null is a real value, rendered as-is
  });
});

describe('information in the expanded view', () => {
  function listView(operation) {
    operationUIState(operation).listView = true;
    const editor = editorForOperation(operation);
    editor.setOperationDetails({ state: {} }, operation, [], []);
    const dom = editor.render();
    document.getElementById('editor').append(dom);
    return dom;
  }

  // clicks an info button and returns the text of the popup it opened
  function infoTextOf(button) {
    button.dispatchEvent(new Event('click'));
    const popups = [...document.querySelectorAll('.inline-popup')];
    const popup = popups[popups.length-1];
    const text = popup.textContent;
    popup.querySelector('.popup-close').dispatchEvent(new Event('click'));
    return text;
  }

  const rowNamed = (dom, name) => [...dom.querySelectorAll('.routine-editor-parameter-row')]
    .find(r => (r.querySelector('.routine-editor-parameter-name') || {}).textContent == name);

  test('every row of the expanded view has an info button, the operation included', () => {
    const dom = listView({ func: 'MOVE', from: 'h1', to: 'h2' });
    const rows = [...dom.querySelectorAll('.routine-editor-parameter-row')];
    expect(rows.length).toBe(Object.keys(routineOperationMetadata.MOVE.parameters).length + 1); // + the func row
    for(const row of rows)
      expect(row.querySelector('.routine-editor-parameter-info')).not.toBeNull();
    // the operation's own button is the one in the row without a parameter name
    const operationRow = rows.find(r => !r.querySelector('.routine-editor-parameter-name'));
    expect(infoTextOf(operationRow.querySelector('.routine-editor-parameter-info'))).toContain('This function moves widgets into a target');
    dom.remove();
  });

  test('a parameter shows the line its operation describes it with', () => {
    const dom = listView({ func: 'MOVE', from: 'h1' });
    const text = infoTextOf(rowNamed(dom, 'count').querySelector('.routine-editor-parameter-info'));
    expect(text).toContain('limits the amount of moved widgets');
    expect(text).not.toContain('This function moves widgets into a target'); // just the parameter, not everything
    expect(text).toContain('for the whole operation'); // ...which is one click away, as a topic link
    expect(text).toContain('See MOVE');
    dom.remove();
  });

  test('a parameter with a topic of its own uses that text', () => {
    const dom = listView({ func: 'MOVE', from: 'h1' });
    expect(infoTextOf(rowNamed(dom, 'from').querySelector('.routine-editor-parameter-info')))
      .toContain('The from parameter specifies the widget(s) that contains the widgets to move');
    dom.remove();
  });

  test('a custom property the operation does not support falls back to the operation text', () => {
    const dom = listView({ func: 'MOVE', from: 'h1', typo: 1 });
    expect(infoTextOf(rowNamed(dom, 'typo').querySelector('.routine-editor-parameter-info')))
      .toContain('This function moves widgets into a target');
    dom.remove();
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

  test('the widget the picker belongs to is listed first when allowed, never picked in the room', () => {
    room([ 'target', 'holder' ], [ 'h1', 'holder' ]);
    let picked = null;
    const ids = controls => [...controls.popout.querySelectorAll('.widgetPickerEntry')].map(e => e.textContent.replace(/holder|this widget/g, ''));

    expect(ids(pickInRoom({ apply: id => picked = id }))).toEqual([ 'h1' ]);
    stopWidgetPicker();
    // it cannot be clicked in the room, so it is pinned to the top and marked
    const controls = pickInRoom({ allowSelf: true, apply: id => picked = id });
    expect(ids(controls)).toEqual([ 'target', 'h1' ]);
    expect(controls.popout.querySelector('.widgetPickerSelf').textContent).toBe('this widget');

    // the target is selected again after every pick, so clicking it in the room
    // cannot be told apart from that restore
    handleWidgetPickerSelection([ widgets.get('target') ]);
    expect(picked).toBeNull();
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
