import { jest } from '@jest/globals';

import { handleContextMenuInput, handleContextMenuTouchEnd, onLongTouch, onTouchEndContextMenu } from '../../client/js/contextmenu.js';
import { createWidget, removeWidget } from './client-util.js';

describe('Context menu input handling', () => {
  let elementsFromPoint;

  beforeEach(() => {
    elementsFromPoint = document.elementsFromPoint;
  });

  afterEach(() => {
    document.elementsFromPoint = elementsFromPoint;
    onTouchEndContextMenu();
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

  test('touchend on a popup action does not reach the room input handler', () => {
    const stopPropagation = jest.fn();
    const target = { closest: selector => selector === '.contextMenuPopupBg' };

    handleContextMenuTouchEnd({ target, stopPropagation });

    expect(stopPropagation).toHaveBeenCalled();
  });
});
