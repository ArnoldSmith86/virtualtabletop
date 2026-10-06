import fs from 'fs';

// These scripts share a scope in edit.js. Exercise the merged selection hooks
// and properties dispatch with a small widget graph and the surrounding UI stubbed.
const selectionSource = fs.readFileSync('client/js/editor/selection.js', 'utf8').replace(/^export /gm, '');
const smartCloneSource = fs.readFileSync('client/js/editor/smartClone.js', 'utf8');
const propertiesSource = fs.readFileSync('client/js/editor/sidebar/properties.js', 'utf8');
const noop = () => {};
const $ = (selector, parent = document) => parent.querySelector(selector);

function widget(id, state = {}) {
  return {
    id, state: { type: 'basic', ...state },
    get(property) { return property == 'id' ? id : this.state[property]; },
    set(property, value) { this.state[property] = value; },
    setHighlighted: noop
  };
}

function selectionFor(widgets) {
  const events = [];
  const record = name => (...args) => events.push([ name, ...args ]);
  const subscriber = {
    onSelectionChanged: record('selection'), onDeltaReceived: record('delta'), onStateReceived: record('state')
  };
  const scope = {
    widgets, widgetFilter: filter => [ ...widgets.values() ].filter(filter), $,
    toolbarButtons: [ subscriber ], dragToolbarButtons: [], sidebarModules: [ subscriber ],
    endWidgetPickerWithoutTarget: noop, isWidgetPickerChangingSelection: () => false,
    isWidgetPickerRestoringSelection: () => false, cancelAudioPicker: record('cancelAudio'),
    closeEditorPopups: record('closePopups'), selectionBarSelectionChanged: record('barSelection'),
    jeWidgetHighlightingEnabled: () => false, updateSelectionBars: noop,
    selectionBarDeltaReceived: record('barDelta'), deckEditorReceiveDelta: record('deckDelta'),
    deckEditorStateReplaced: record('deckState'), selectionBarStateReceived: record('barState'),
    record
  };
  return Object.assign(new Function(...Object.keys(scope), `
    ${smartCloneSource}
    ${selectionSource}
    updateDragToolbar = () => {};
    smartCloneDeltaReceived = record('smartDelta');
    return { setSelection, editorReceiveDelta, receiveStateFromServer, smartCloneInit,
      selection: () => selectedWidgets, sourceMap: smartCloneSourceMap };
  `)(...Object.values(scope)), { events });
}

test('clone children select their clone once, and reselecting another child keeps the current popups', () => {
  const clone = widget('clone', { editorSmartClone: {} });
  const child = widget('child', { parent: 'clone' });
  const sibling = widget('sibling', { parent: 'clone' });
  const editor = selectionFor(new Map([ clone, child, sibling ].map(w => [ w.id, w ])));
  editor.setSelection([ child, sibling ]);
  expect(editor.selection()).toEqual([ clone ]);
  expect(editor.events.find(([ name ]) => name == 'barSelection')[1]).toEqual([ clone ]);
  editor.events.length = 0;
  editor.setSelection([ sibling ]);
  expect(editor.events.map(([ name ]) => name)).not.toContain('cancelAudio');
  expect(editor.events.map(([ name ]) => name)).not.toContain('closePopups');
});

test('deltas prune deleted selections and still notify toolbar, selection bar, deck editor and smart clones', () => {
  const selected = widget('selected');
  const widgets = new Map([[ selected.id, selected ]]);
  const editor = selectionFor(widgets);
  editor.setSelection([ selected ]);
  editor.events.length = 0;
  widgets.delete(selected.id);
  const delta = { s: { selected: null } };
  editor.editorReceiveDelta(delta);
  expect(editor.selection()).toEqual([]);
  for(const name of [ 'delta', 'barDelta', 'deckDelta', 'smartDelta' ])
    expect(editor.events).toContainEqual([ name, delta ]);
});

test('state replacement clears stale selections and rebuilds smart clone tracking from new widget objects', () => {
  const source = widget('source');
  const clone = widget('clone', { editorSmartClone: {}, inheritFrom: 'source' });
  const widgets = new Map([ source, clone ].map(w => [ w.id, w ]));
  const editor = selectionFor(widgets);
  editor.smartCloneInit();
  editor.setSelection([ clone ]);
  const replacement = widget('source');
  widgets.set(source.id, replacement);
  widgets.delete(clone.id);
  widgets.set('newClone', widget('newClone', { editorSmartClone: {}, inheritFrom: 'source' }));
  editor.receiveStateFromServer({});
  expect(editor.selection()).toEqual([]);
  expect(Object.keys(editor.sourceMap)).toEqual([ 'newClone' ]);
  expect(editor.sourceMap.newClone.newClone).toBe(replacement);
  expect(editor.events.map(([ name ]) => name)).toEqual(expect.arrayContaining([ 'deckState', 'state', 'barState' ]));
});

function propertiesFor(selection) {
  const method = name => propertiesSource.match(new RegExp(`^  ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}`, 'm'))[0];
  const div = (parent, className, html) => {
    const element = document.createElement('div');
    element.className = className;
    element.innerHTML = html;
    parent.appendChild(element);
    return element;
  };
  const scope = {
    selectedWidgets: selection, viewportConfig: {}, handleWidgetPickerSelection: () => false, $, div,
    smartCloneUnlink: id => {
      selection.find(w => w.id == id).state.editorSmartClone = null;
      panel.onDeltaReceivedWhileActive({ s: { [id]: { editorSmartClone: null } } });
    }
  };
  const panel = new Function(...Object.keys(scope), `return new class {
    ${method('onSelectionChangedWhileActive')}
    ${method('renderForSmartClone')}
    ${method('onDeltaReceivedWhileActive')}
  };`)(...Object.values(scope));
  const moduleDOM = document.createElement('div');
  document.body.appendChild(moduleDOM);
  const bar = document.createElement('div');
  moduleDOM.appendChild(bar);
  Object.assign(panel, {
    moduleDOM, selectionBar: { dom: bar }, cssEditorState: new Map(), renders: [],
    clearGridPreview: noop, clearDragLimitPreview: noop, clearFaceRowRefresh: noop,
    circleAlignMatchesSelection: () => true,
    addHeader: text => div(moduleDOM, 'header', text),
    renderForBasic: w => panel.renders.push([ 'basic', w.id ]),
    renderForSpinner: w => panel.renders.push([ 'spinner', w.id ]),
    renderForMulti: widgets => panel.renders.push([ 'multi', widgets.map(w => w.id) ]),
    renderEvents: w => panel.renders.push([ 'events', w.id ])
  });
  panel.onSelectionChangedWhileActive(selection);
  return panel;
}

test('ordinary widgets retain type-specific controls and events', () => {
  const panel = propertiesFor([ widget('spinner', { type: 'spinner' }) ]);
  expect(panel.renders).toEqual([ [ 'spinner', 'spinner' ], [ 'events', 'spinner' ] ]);
  panel.moduleDOM.remove();
});

test('smart clone controls refresh on remote options changes and unlink restores the normal editor', () => {
  const clone = widget('clone', { editorSmartClone: { flipX: true, replaces: { from: 'to' } } });
  const panel = propertiesFor([ clone ]);
  expect(panel.renders).toEqual([]);
  expect($('.flipX', panel.moduleDOM).checked).toBe(true);
  const include = $('.includeCards', panel.moduleDOM);
  include.checked = true;
  include.dispatchEvent(new Event('change'));
  expect(clone.state.editorSmartClone).toEqual({ flipX: true, includeCards: true, replaces: { from: 'to' } });
  clone.state.editorSmartClone.flipX = false;
  panel.onDeltaReceivedWhileActive({ s: { clone: { editorSmartClone: clone.state.editorSmartClone } } });
  expect($('.flipX', panel.moduleDOM).checked).toBe(false);
  $('[icon=link_off]', panel.moduleDOM).click();
  expect(panel.renders).toEqual([ [ 'basic', 'clone' ], [ 'events', 'clone' ] ]);
  expect($('.flipX', panel.moduleDOM)).toBe(null);
  panel.moduleDOM.remove();
});

test('multi-selection keeps common controls and offers separate options for each smart clone', () => {
  const panel = propertiesFor([ widget('ordinary'), widget('clone1', { editorSmartClone: {} }), widget('clone2', { editorSmartClone: {} }) ]);
  expect(panel.renders).toEqual([ [ 'multi', [ 'ordinary', 'clone1', 'clone2' ] ] ]);
  expect(panel.moduleDOM.querySelectorAll('[icon=link_off]').length).toBe(2);
  panel.moduleDOM.remove();
});
