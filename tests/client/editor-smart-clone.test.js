import fs from 'fs';
import { jest } from '@jest/globals';

// The editor is assembled from plain scripts. Load the merged selection and
// clone implementations together, with the surrounding editor services stubbed.
const source = file => fs.readFileSync(`client/js/editor/${file}`, 'utf8').replace(/^export /gm, '');

function loadSelection() {
  document.body.innerHTML = '<div id="editorDragToolbar"></div>';
  const widgets = new Map();
  const services = {
    widgets,
    getRoomRectangle: () => ({ left: 0, right: 1600, bottom: 1000 }),
    $: selector => document.querySelector(selector),
    endWidgetPickerWithoutTarget: jest.fn(),
    isWidgetPickerChangingSelection: () => false,
    isWidgetPickerRestoringSelection: () => false,
    cancelAudioPicker: jest.fn(),
    closeEditorPopups: jest.fn(),
    selectionBarSelectionChanged: jest.fn(),
    selectionBarDeltaReceived: jest.fn(),
    selectionBarStateReceived: jest.fn(),
    deckEditorReceiveDelta: jest.fn(),
    deckEditorStateReplaced: jest.fn(),
    jeWidgetHighlightingEnabled: () => true,
    updateSelectionBars: jest.fn(),
    toolbarButtons: [],
    dragToolbarButtons: [],
    sidebarModules: [],
    widgetFilter: predicate => [...widgets.values()].filter(predicate)
  };
  const api = new Function(...Object.keys(services), source('smartClone.js') + source('selection.js') + `
    return { setSelection, editorReceiveDelta, receiveStateFromServer,
      selected: () => selectedWidgets,
      sourceMap: smartCloneSourceMap,
      // Observe delta forwarding without running asynchronous clone writes.
      observeCloneDeltas: callback => { smartCloneDeltaReceived = callback; }
    };
  `)(...Object.values(services));
  return { ...services, ...api };
}

function widget(id, state={}) {
  return { id, get: property => state[property], setHighlighted: jest.fn(), state, domElement: document.createElement('div') };
}

test('clone child selections share their parent history entry and keep popup cleanup accurate', () => {
  const editor = loadSelection();
  const clone = widget('clone', { editorSmartClone: {} });
  const child = widget('child', { parent: 'clone' });
  const sibling = widget('sibling', { parent: 'clone' });
  for(const w of [clone, child, sibling]) editor.widgets.set(w.id, w);

  editor.setSelection([child, sibling]);
  expect(editor.selected()).toEqual([clone]);
  expect(editor.selectionBarSelectionChanged).toHaveBeenLastCalledWith([clone]);
  expect(editor.cancelAudioPicker).toHaveBeenCalledTimes(1);
  expect(editor.closeEditorPopups).toHaveBeenCalledTimes(1);

  editor.setSelection([sibling]);
  expect(editor.cancelAudioPicker).toHaveBeenCalledTimes(1);
  expect(editor.closeEditorPopups).toHaveBeenCalledTimes(1);
});

test('deltas clear deleted selections and reach the toolbar, history, deck editor and clones', () => {
  const editor = loadSelection();
  const deleted = widget('deleted');
  editor.widgets.set(deleted.id, deleted);
  editor.setSelection([deleted]);
  editor.widgets.delete(deleted.id);
  const cloneDelta = jest.fn();
  const toolbarDelta = jest.fn();
  editor.observeCloneDeltas(cloneDelta);
  editor.toolbarButtons.push({ onDeltaReceived: toolbarDelta, onSelectionChanged() {} });
  const delta = { s: { deleted: null } };

  editor.editorReceiveDelta(delta);
  expect(editor.selected()).toEqual([]);
  for(const listener of [cloneDelta, toolbarDelta, editor.selectionBarDeltaReceived, editor.deckEditorReceiveDelta])
    expect(listener).toHaveBeenCalledWith(delta);
});

test('replacement states rebuild clone tracking and clear stale widgets before sidebar notification', () => {
  const editor = loadSelection();
  const old = widget('old');
  editor.widgets.set(old.id, old);
  editor.setSelection([old]);
  editor.sourceMap.stale = {};
  editor.widgets.clear();
  const origin = widget('origin');
  const clone = widget('clone', { inheritFrom: 'origin', editorSmartClone: {} });
  editor.widgets.set(origin.id, origin);
  editor.widgets.set(clone.id, clone);
  const notifiedSelections = [];
  editor.sidebarModules.push({
    onSelectionChanged() {},
    onStateReceived() { notifiedSelections.push(editor.selected()); }
  });

  editor.receiveStateFromServer({});
  expect(notifiedSelections).toEqual([[]]);
  expect(editor.sourceMap).toEqual({ clone: { clone: origin } });
  expect(editor.deckEditorStateReplaced).toHaveBeenCalledTimes(1);
  expect(editor.selectionBarStateReceived).toHaveBeenCalledTimes(1);
});

function loadProperties(selection) {
  const services = {
    SidebarModule: class {},
    selectedWidgets: selection,
    handleWidgetPickerSelection: () => false,
    viewportConfig: { targetWidth: 1600, targetHeight: 1000 },
    renderSelectionBar: target => ({ dom: target.appendChild(document.createElement('div')) })
  };
  const PropertiesModule = new Function(...Object.keys(services), source('sidebar/properties.js') + '; return PropertiesModule;')(...Object.values(services));
  const panel = Object.create(PropertiesModule.prototype);
  panel.moduleDOM = document.createElement('div');
  document.body.appendChild(panel.moduleDOM);
  panel.cssEditorState = new Map();
  for(const method of ['clearGridPreview', 'clearDragLimitPreview', 'clearFaceRowRefresh', 'renderForMulti', 'renderForSmartClone', 'renderForBasic', 'renderForSpinner', 'renderEvents'])
    panel[method] = jest.fn();
  return panel;
}

test('the new properties panel renders clone tools for single and multiple selections', () => {
  const clone = widget('clone', { editorSmartClone: {} });
  const plain = widget('plain');
  const panel = loadProperties([clone, plain]);
  panel.onSelectionChangedWhileActive([clone, plain]);
  expect(panel.renderForMulti).toHaveBeenCalledWith([clone, plain]);
  expect(panel.renderForSmartClone).toHaveBeenCalledWith(clone);
  panel.renderForSmartClone.mockClear();

  panel.onSelectionChangedWhileActive([clone]);
  expect(panel.renderForSmartClone).toHaveBeenCalledWith(clone);
  expect(panel.renderEvents).toHaveBeenCalledWith(clone);
  panel.onSelectionChangedWhileActive([widget('spinner', { type: 'spinner' })]);
  expect(panel.renderForSpinner).toHaveBeenCalledTimes(1);
});

test('unlinking a selected clone restores its ordinary properties panel', () => {
  const clone = widget('clone', { editorSmartClone: {} });
  const panel = loadProperties([clone]);
  panel.onSelectionChangedWhileActive([clone]);
  delete clone.state.editorSmartClone;

  panel.onDeltaReceivedWhileActive({ s: { clone: { editorSmartClone: null } } });
  expect(panel.renderForBasic).toHaveBeenCalledWith(clone);
});
