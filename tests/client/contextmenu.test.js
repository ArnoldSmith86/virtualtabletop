import { jest } from '@jest/globals';

import { closeContextMenu, handleContextMenuInput, handleContextMenuTouchEnd, onLongTouch, onTouchEndContextMenu, openContextMenuWithMenu } from '../../client/js/contextmenu.js';
import { createWidget, removeWidget } from './client-util.js';
import { routineState, runRoutine } from './engine/harness.js';

// the popup markup of room.html
const popupMarkup = `
  <div id="contextMenuPopup" class="contextMenuPopup hidden">
    <div class="contextMenuPopupBg">
      <div id="contextMenuTitleRow" class="contextMenuTitleRow hidden"></div>
      <div class="contextMenuMainRow">
        <div class="contextMenuLeftColumn">
          <div class="contextMenuPreviewWrap">
            <div id="contextMenuPreview" class="contextMenuPreview"></div>
            <div id="contextMenuDescriptionPopover" class="contextMenuDescriptionPopover hidden"></div>
          </div>
          <div class="contextMenuPreviewNavRow"></div>
        </div>
        <div class="contextMenuRightColumn">
          <div class="contextMenuRotationRow"></div>
          <div class="contextMenuButtons"></div>
        </div>
      </div>
    </div>
  </div>`;

const popupIsOpen = () => !document.getElementById('contextMenuPopup').classList.contains('hidden');

describe('Context menu input handling', () => {
  let elementsFromPoint;

  beforeAll(() => {
    document.body.insertAdjacentHTML('beforeend', popupMarkup);
  });

  beforeEach(() => {
    elementsFromPoint = document.elementsFromPoint;
  });

  afterEach(() => {
    document.elementsFromPoint = elementsFromPoint;
    onTouchEndContextMenu();
    closeContextMenu();
    jest.useRealTimers();
  });

  test('legacy enlarge keeps the normal right-click click and drag path', () => {
    const widget = createWidget({ id: 'context-enlarge', type: 'widget', enlarge: 2 });
    document.elementsFromPoint = jest.fn(() => [ widget.domElement ]);

    expect(handleContextMenuInput('mousedown', { button: 2, clientX: 10, clientY: 10 })).toBe(false);

    removeWidget(widget.get('id'));
  });

  test('long-touch hold-and-move is only armed on empty space', () => {
    jest.useFakeTimers();
    const widget = createWidget({ id: 'context-plain', type: 'widget', movable: true });
    document.elementsFromPoint = jest.fn(() => [ widget.domElement ]);
    const touch = { clientX: 10, clientY: 10 };

    handleContextMenuInput('touchstart', { touches: [ touch ] });
    jest.advanceTimersByTime(500);

    expect(handleContextMenuInput('touchmove', { touches: [ touch ] })).toBe(false);

    removeWidget(widget.get('id'));
  });

  test('a long-touch rightClickRoutine suppresses the normal click', () => {
    const widget = createWidget({ id: 'context-routine', type: 'widget', rightClickRoutine: [] });
    widget.evaluateRoutine = jest.fn(() => Promise.resolve());

    onLongTouch(widget);

    expect(widget.domElement.classList.contains('longtouch')).toBe(true);

    widget.domElement.classList.remove('longtouch');
    removeWidget(widget.get('id'));
  });

  test('a long touch on a widget without any right-click behavior is not a click', () => {
    const widget = createWidget({ id: 'context-plain-touch', type: 'widget', clickRoutine: [] });

    onLongTouch(widget);

    expect(widget.domElement.classList.contains('longtouch')).toBe(true);

    widget.domElement.classList.remove('longtouch');
    removeWidget(widget.get('id'));
  });

  test('the popup closes when the widget it shows is removed', () => {
    const widget = createWidget({ id: 'context-doomed', type: 'widget', rotationSteps: 90 });
    const other = createWidget({ id: 'context-bystander', type: 'widget' });

    openContextMenuWithMenu(widget, [ { text: 'Nothing', routine: 'nothingRoutine' } ]);
    expect(popupIsOpen()).toBe(true);

    removeWidget(other.get('id'));
    expect(popupIsOpen()).toBe(true);

    removeWidget(widget.get('id'));
    expect(popupIsOpen()).toBe(false);
    expect(document.getElementById('contextMenuPreview').innerHTML).toBe('');
  });

  test('CONTEXTMENU without a collection opens the popup on the widget running the routine', async () => {
    await runRoutine(routineState({ other: { type: 'basic' } }), [
      { func: 'SELECT', property: 'id', value: 'other' },
      { func: 'CONTEXTMENU', contextMenu: [ { text: 'Self', routine: 'clickRoutine' } ] }
    ]);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(popupIsOpen()).toBe(true);
    expect(document.getElementById('contextMenuPreview').dataset.id).toBe('trigger');

    closeContextMenu();
    await runRoutine(routineState({ other: { type: 'basic' } }), [
      { func: 'SELECT', property: 'id', value: 'other' },
      { func: 'CONTEXTMENU', collection: 'DEFAULT', contextMenu: [ { text: 'Other', routine: 'clickRoutine' } ] }
    ]);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.getElementById('contextMenuPreview').dataset.id).toBe('other');
  });

  test('touchend on a popup action does not reach the room input handler', () => {
    const stopPropagation = jest.fn();
    const target = { closest: selector => selector === '.contextMenuPopupBg' };

    handleContextMenuTouchEnd({ target, stopPropagation });

    expect(stopPropagation).toHaveBeenCalled();
  });
});
