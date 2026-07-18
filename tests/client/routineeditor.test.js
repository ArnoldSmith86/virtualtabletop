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
  window.customSelectionCallback = null;
  window.endCustomSelection = () => {};

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
    'EventsEditor', 'InfoPopup', 'WidgetSelection', 'RoutineStringPopup', 'RoutineNumberPopup'
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

  test('every declared parameter is reachable as a chip in the template', () => {
    for (const func in routineOperationMetadata) {
      const editor = editorForOperation({ func });
      editor.setOperationDetails({ state: {} }, { func }, [], []);
      const referenced = (editor.getTemplate().match(/\{([a-zA-Z0-9,]+)\}/g) || []).flatMap(m => m.slice(1, -1).split(','));
      for (const name in routineOperationMetadata[func].parameters)
        expect(referenced).toContain(name);
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
    expect(dom.firstChild).toBe(toggle); // the arrow sits at the start of the operation
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
    const names = [...editor.domElement.querySelectorAll(':scope > .routine-editor-parameter-row .routine-editor-parameter-name')].map(e => e.textContent);
    expect(names).toEqual([ 'condition', 'operand1', 'relation', 'operand2' ]);
    expect(editor.domElement.querySelector('.routine-editor')).not.toBeNull(); // nested routines stay visible
  });

  test('shows optional segments when their parameter is explicitly set', () => {
    const { dom } = renderOperation({ func: 'MOVE', from: 'h1', to: 'h2', face: 0 });
    expect(dom.querySelector('[data-parameter="face"]')).not.toBeNull();
  });

  test('conditional templates follow the parameter values', () => {
    const template = operation => {
      const editor = editorForOperation(operation);
      editor.setOperationDetails({ state: {} }, operation, [], []);
      return editor.getTemplate();
    };
    expect(template({ func: 'FLIP', faceCycle: 'random' })).toContain('a {faceCycle} face');
    expect(template({ func: 'FLIP' })).toContain('cycle {faceCycle} by {face}');
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
  function makeEditor(state, onChange = () => {}) {
    const widget = { state, get(p) { return this.state[p]; } };
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

  test('no text input without a text hint', () => {
    const source = document.createElement('span');
    document.getElementById('editor').append(source);
    const popup = new RoutineNumberPopup({});
    popup.setSource(source);
    popup.setOperationDetails({ func: 'CLICK' }, [ 'count' ], { state: {} }, [], []);
    popup.show();
    expect(popup.domElement.querySelector('input[type=text]')).toBeNull();
    popup.hide();
  });
});

describe('widget picker resolution', () => {
  test('picked widgets run through the resolver and are deduplicated', () => {
    const holder = { id: 'h1', get: p => ({ type: 'holder', parent: null })[p] };
    const cardA = { id: 'c1', get: p => ({ type: 'card', parent: 'h1' })[p] };
    const cardB = { id: 'c2', get: p => ({ type: 'card', parent: 'h1' })[p] };
    const selection = new WidgetSelection([], () => {}, w => w.get('type') == 'card' ? holder : w);
    expect(selection.resolveAll([ cardA, cardB, holder ])).toEqual([ holder ]);
  });

  test('without a resolver the picked widgets pass through unchanged', () => {
    const widgetsPicked = [ { id: 'a' }, { id: 'b' } ];
    const selection = new WidgetSelection([], () => {});
    expect(selection.resolveAll(widgetsPicked)).toBe(widgetsPicked);
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
