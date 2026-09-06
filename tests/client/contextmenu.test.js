import { jest } from '@jest/globals';

import { closeContextMenu, handleContextMenuInput, handleContextMenuTouchEnd, onLongTouch, onTouchEndContextMenu, openContextMenuWithMenu } from '../../client/js/contextmenu.js';
import { widgets } from '../../client/js/serverstate.js';
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
const popupButton = selector => document.querySelector(`#contextMenuPopup ${selector}`);
const rotationButton = icon => popupButton(`.contextMenuRotationRow [icon=${icon}]`);

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

  test('a finger held still on a widget opens its popup after the delay', () => {
    jest.useFakeTimers();
    const widget = createWidget({ id: 'context-hold', type: 'widget', movable: true, rotationSteps: 90 });

    widget.touchstart({ touches: [ { clientX: 10, clientY: 10 } ] });
    widget.touchmove({ touches: [ { clientX: 14, clientY: 12 } ] }); // the jitter of a finger that holds still
    jest.advanceTimersByTime(500);

    expect(popupIsOpen()).toBe(true);
    expect(widget.domElement.classList.contains('longtouch')).toBe(true);

    widget.touchend();
    widget.domElement.classList.remove('longtouch');
    removeWidget(widget.get('id'));
  });

  test('a finger that drags the widget on within the delay never opens its popup', () => {
    jest.useFakeTimers();
    const widget = createWidget({ id: 'context-drag', type: 'widget', movable: true, rotationSteps: 90 });

    widget.touchstart({ touches: [ { clientX: 10, clientY: 10 } ] });
    jest.advanceTimersByTime(200);
    widget.touchmove({ touches: [ { clientX: 40, clientY: 10 } ] });
    jest.advanceTimersByTime(500);

    expect(popupIsOpen()).toBe(false);
    expect(widget.domElement.classList.contains('longtouch')).toBe(false);

    widget.touchend();
    removeWidget(widget.get('id'));
  });

  test('swiping away from empty space within the delay does not arm hold-and-move', () => {
    jest.useFakeTimers();
    const widget = createWidget({ id: 'context-swipe', type: 'widget', rotationSteps: 90 });
    document.elementsFromPoint = jest.fn(() => []);

    handleContextMenuInput('touchstart', { touches: [ { clientX: 10, clientY: 10 } ] });
    document.elementsFromPoint = jest.fn(() => [ widget.domElement ]);
    expect(handleContextMenuInput('touchmove', { touches: [ { clientX: 40, clientY: 10 } ] })).toBe(false);
    jest.advanceTimersByTime(500);

    expect(popupIsOpen()).toBe(false);
    expect(handleContextMenuInput('touchmove', { touches: [ { clientX: 40, clientY: 10 } ] })).toBe(false);

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

  test('a rotation whose change routine removes the widget closes the popup without an error', async () => {
    const widget = createWidget({ id: 'context-rotating', type: 'widget', rotationSteps: 90, rotationChangeRoutine: [] });
    widget.evaluateRoutine = jest.fn(async () => removeWidget(widget.get('id')));
    openContextMenuWithMenu(widget, []);
    expect(popupIsOpen()).toBe(true);

    await rotationButton('rotate_right').onclick();

    expect(widget.evaluateRoutine).toHaveBeenCalledWith('rotationChangeRoutine', expect.anything(), expect.anything());
    expect(widgets.has('context-rotating')).toBe(false);
    expect(popupIsOpen()).toBe(false);
  });

  test('a rotation whose change routine opens the popup on another widget leaves that popup alone', async () => {
    const widget = createWidget({ id: 'context-first', type: 'widget', rotationSteps: 90, rotationChangeRoutine: [] });
    const other = createWidget({ id: 'context-second', type: 'widget' });
    widget.evaluateRoutine = jest.fn(async () => openContextMenuWithMenu(other, []));
    openContextMenuWithMenu(widget, []);

    await rotationButton('rotate_right').onclick();

    expect(widget.get('rotation')).toBe(90);
    expect(popupIsOpen()).toBe(true);
    expect(document.getElementById('contextMenuPreview').dataset.id).toBe('context-second');

    removeWidget(widget.get('id'));
    removeWidget(other.get('id'));
  });

  test('rotation steps turn to the next allowed angle in the chosen direction', async () => {
    const widget = createWidget({ id: 'context-steps', type: 'widget', rotation: 30, rotationSteps: [ 270, 0, 180, 90 ] });
    openContextMenuWithMenu(widget, []);

    for (const [ icon, expected ] of [ [ 'rotate_left', 0 ], [ 'rotate_left', 270 ], [ 'rotate_right', 0 ], [ 'rotate_right', 90 ], [ 'rotate_right', 180 ] ]) {
      await rotationButton(icon).onclick();
      expect(widget.get('rotation')).toBe(expected);
    }

    // the angles are written the way the list spells them, and a single one is a full turn away from itself
    const signed = createWidget({ id: 'context-signed', type: 'widget', rotationSteps: [ -90, 0, 90 ] });
    openContextMenuWithMenu(signed, []);
    await rotationButton('rotate_left').onclick();
    expect(signed.get('rotation')).toBe(-90);
    const single = createWidget({ id: 'context-single', type: 'widget', rotation: 45, rotationSteps: [ 45 ] });
    openContextMenuWithMenu(single, []);
    await rotationButton('rotate_right').onclick();
    expect(single.get('rotation')).toBe(45);

    for (const id of [ 'context-steps', 'context-signed', 'context-single' ])
      removeWidget(id);
  });

  test('the popup closes when its widget is handed to another player', async () => {
    const widget = createWidget({ id: 'context-owned', type: 'widget', rotationSteps: 90 });
    openContextMenuWithMenu(widget, []);
    expect(popupIsOpen()).toBe(true);

    await widget.set('owner', 'somebody else');

    expect(widget.domElement.classList.contains('foreign')).toBe(true);
    expect(popupIsOpen()).toBe(false);

    removeWidget(widget.get('id'));
  });

  test('the popup closes when the parent of its widget is hidden', async () => {
    const parent = createWidget({ id: 'context-hand', type: 'widget' });
    const child = createWidget({ id: 'context-card', type: 'widget', parent: 'context-hand', rotationSteps: 90 });
    openContextMenuWithMenu(child, []);
    expect(popupIsOpen()).toBe(true);

    await parent.set('display', false);

    expect(popupIsOpen()).toBe(false);

    removeWidget(child.get('id'));
    removeWidget(parent.get('id'));
  });

  test('a menu action and a rotation do nothing once the widget is hidden from the player', async () => {
    const widget = createWidget({ id: 'context-stolen', type: 'widget', rotationSteps: 90, markRoutine: [] });
    widget.evaluateRoutine = jest.fn(() => Promise.resolve());
    openContextMenuWithMenu(widget, [ { text: 'Mark', routine: 'markRoutine' } ]);
    const action = popupButton('.contextMenuAction');
    const rotate = rotationButton('rotate_right');
    // hidden without a delta of its own, the way a seat change hides widgets
    widget.domElement.classList.add('foreign');

    await rotate.onclick();
    expect(widget.get('rotation')).toBe(0);
    expect(popupIsOpen()).toBe(false);

    openContextMenuWithMenu(widget, [ { text: 'Mark', routine: 'markRoutine' } ]);
    expect(popupIsOpen()).toBe(false);
    await action.onclick();
    expect(widget.evaluateRoutine).not.toHaveBeenCalled();

    removeWidget(widget.get('id'));
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

  test('opening the popup hides the enlarged copy of a widget that also has enlarge', () => {
    const widget = createWidget({ id: 'context-enlarge-popup', type: 'widget', enlarge: 2, contextMenuOptions: { factor: 3 } });
    const enlarged = document.getElementById('enlarged');
    enlarged.className = 'widget';
    enlarged.dataset.id = widget.get('id');

    openContextMenuWithMenu(widget, []);

    expect(popupIsOpen()).toBe(true);
    expect(enlarged.classList.contains('hidden')).toBe(true);
    removeWidget(widget.get('id'));
  });

  test('touchend on a popup action does not reach the room input handler', () => {
    const stopPropagation = jest.fn();
    const target = { closest: selector => selector === '.contextMenuPopupBg' };

    handleContextMenuTouchEnd({ target, stopPropagation });

    expect(stopPropagation).toHaveBeenCalled();
  });
});
