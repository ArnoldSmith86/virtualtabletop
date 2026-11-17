import fs from 'fs';
import { jest } from '@jest/globals';

// Edit mode is a concatenated script in the browser. Use the same sources here
// to check the integration with selection history, overlays and the properties panel.
const read = file => fs.readFileSync(`client/js/editor/${file}`, 'utf8');

function widget(id, state = {}) {
  return {
    id,
    get: property => property == 'id' ? id : state[property],
    set: jest.fn(async (property, value) => { state[property] = value; }),
    setHighlighted: jest.fn(),
    domElement: document.createElement('div')
  };
}

function selectionEditor(widgets) {
  const processSelection = new Function('widgets', read('smartClone.js') + '\nreturn smartCloneProcessSelection;')(widgets);
  const notifications = {
    onSelectionChanged: jest.fn(), onDeltaReceived: jest.fn(), onStateReceived: jest.fn()
  };
  const globals = {
    widgets,
    $: selector => document.querySelector(selector),
    toolbarButtons: [], dragToolbarButtons: [], sidebarModules: [ notifications ],
    smartCloneProcessSelection: processSelection,
    smartCloneDeltaReceived: jest.fn(), smartCloneInit: jest.fn(),
    aiRoutineDeltaReceived: jest.fn(), aiForgetAllResults: jest.fn(),
    selectionBarSelectionChanged: jest.fn(), selectionBarDeltaReceived: jest.fn(),
    selectionBarStateReceived: jest.fn(), deckEditorReceiveDelta: jest.fn(),
    deckEditorStateReplaced: jest.fn(), endWidgetPickerWithoutTarget: jest.fn(),
    isWidgetPickerChangingSelection: () => false, isWidgetPickerRestoringSelection: () => false,
    cancelAudioPicker: jest.fn(), closeEditorPopups: jest.fn(),
    jeWidgetHighlightingEnabled: () => true, updateSelectionBars: jest.fn(),
    getRoomRectangle: () => ({ bottom: 1000, left: 0, right: 1000 })
  };
  const source = read('selection.js').replace(/^export /gm, '');
  const editor = new Function(...Object.keys(globals), source + `
    return { setSelection, editorReceiveDelta, receiveStateFromServer,
      selection: () => selectedWidgets };
  `)(...Object.values(globals));
  return { ...editor, globals, notifications };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="editorDragToolbar"></div>';
});

test('selecting a child of the current smart clone keeps its overlays and records the clone in history', () => {
  const clone = widget('clone', { editorSmartClone: {} });
  const child = widget('child', { parent: 'clone' });
  const editor = selectionEditor(new Map([ ['clone', clone], ['child', child] ]));
  editor.setSelection([clone]);
  editor.globals.cancelAudioPicker.mockClear();
  editor.globals.closeEditorPopups.mockClear();

  editor.setSelection([child, clone]);

  expect(editor.selection()).toEqual([clone]);
  expect(editor.globals.selectionBarSelectionChanged).toHaveBeenLastCalledWith([clone]);
  expect(editor.globals.cancelAudioPicker).not.toHaveBeenCalled();
  expect(editor.globals.closeEditorPopups).not.toHaveBeenCalled();
});

test('moving from a smart clone to another widget closes the previous editor overlays', () => {
  const clone = widget('clone', { editorSmartClone: {} });
  const other = widget('other');
  const editor = selectionEditor(new Map([ ['clone', clone], ['other', other] ]));
  editor.setSelection([clone]);
  editor.globals.cancelAudioPicker.mockClear();
  editor.globals.closeEditorPopups.mockClear();

  editor.setSelection([other]);

  expect(editor.selection()).toEqual([other]);
  expect(editor.globals.cancelAudioPicker).toHaveBeenCalledTimes(1);
  expect(editor.globals.closeEditorPopups).toHaveBeenCalledTimes(1);
  expect(clone.setHighlighted).toHaveBeenLastCalledWith(false);
});

test('deleted selections and replacement states clear stale widgets while notifying both editor systems', () => {
  const clone = widget('clone', { editorSmartClone: {} });
  const widgets = new Map([ ['clone', clone] ]);
  const editor = selectionEditor(widgets);
  editor.setSelection([clone]);
  widgets.delete('clone');
  const delta = { s: { clone: null } };

  editor.editorReceiveDelta(delta);

  expect(editor.selection()).toEqual([]);
  expect(editor.notifications.onDeltaReceived).toHaveBeenCalledWith(delta);
  expect(editor.globals.selectionBarDeltaReceived).toHaveBeenCalledWith(delta);
  expect(editor.globals.deckEditorReceiveDelta).toHaveBeenCalledWith(delta);
  expect(editor.globals.smartCloneDeltaReceived).toHaveBeenCalledWith(delta);
  expect(editor.globals.aiRoutineDeltaReceived).toHaveBeenCalledTimes(1);

  const state = { s: {} };
  editor.receiveStateFromServer(state);
  expect(editor.globals.smartCloneInit).toHaveBeenCalledTimes(1);
  expect(editor.globals.aiForgetAllResults).toHaveBeenCalledTimes(1);
  expect(editor.globals.deckEditorStateReplaced).toHaveBeenCalledTimes(1);
  expect(editor.notifications.onStateReceived).toHaveBeenCalledTimes(1);
  expect(editor.notifications.onStateReceived).toHaveBeenCalledWith(state);
  expect(editor.globals.selectionBarStateReceived).toHaveBeenCalledTimes(1);
});

function propertiesEditor() {
  const div = (parent, className, html = '') => {
    const element = document.createElement('div');
    element.className = className;
    element.innerHTML = html;
    parent.append(element);
    return element;
  };
  const unlink = jest.fn();
  const globals = {
    SidebarModule: class {
      addHeader(text) {
        const header = document.createElement('h1');
        header.textContent = text;
        this.moduleDOM.append(header);
      }
    },
    div, $: (selector, parent) => parent.querySelector(selector),
    smartCloneUnlink: unlink, viewportConfig: { targetWidth: 1600, targetHeight: 1000 },
    handleWidgetPickerSelection: () => false,
    renderSelectionBar: parent => ({ dom: div(parent, 'selectionBar') })
  };
  const PropertiesModule = new Function(...Object.keys(globals), read('sidebar/properties.js') + '\nreturn PropertiesModule;')(...Object.values(globals));
  const panel = Object.create(PropertiesModule.prototype);
  panel.moduleDOM = document.createElement('div');
  document.body.append(panel.moduleDOM);
  panel.cssEditorState = new Map();
  for(const method of ['clearGridPreview', 'clearDragLimitPreview', 'clearFaceRowRefresh', 'renderForMulti', 'renderForSpinner', 'renderEvents'])
    panel[method] = jest.fn();
  panel.circleAlignMatchesSelection = () => true;
  return { panel, unlink };
}

test('several selected smart clones each expose their own options and unlink action', async () => {
  const { panel, unlink } = propertiesEditor();
  const first = widget('first', { editorSmartClone: { flipX: true } });
  const second = widget('second', { editorSmartClone: { includeCards: true } });
  panel.onSelectionChangedWhileActive([ first, second ]);

  expect([...panel.moduleDOM.querySelectorAll('h1')].map(header => header.textContent)).toEqual(['Smart Clone first', 'Smart Clone second']);
  const flips = panel.moduleDOM.querySelectorAll('.flipX');
  expect(flips[0].checked).toBe(true);
  expect(flips[1].checked).toBe(false);
  flips[1].click();
  expect(second.set).toHaveBeenCalledWith('editorSmartClone', { includeCards: true, flipX: true });
  panel.moduleDOM.querySelectorAll('[icon=link_off]')[1].click();
  expect(unlink).toHaveBeenCalledWith('second');
  expect(panel.renderForMulti).not.toHaveBeenCalled();
});

test('ordinary multi-selection and a single spinner retain their existing editors', () => {
  const { panel } = propertiesEditor();
  const first = widget('first', { type: 'spinner' });
  const second = widget('second', { type: 'spinner' });
  panel.onSelectionChangedWhileActive([ first, second ]);
  expect(panel.renderForMulti).toHaveBeenCalledWith([ first, second ]);

  panel.onSelectionChangedWhileActive([ first ]);
  expect(panel.renderForSpinner).toHaveBeenCalledWith(first);
  expect(panel.renderEvents).toHaveBeenCalledWith(first);
  expect(panel.moduleDOM.querySelector('[icon=link_off]')).toBe(null);
});
