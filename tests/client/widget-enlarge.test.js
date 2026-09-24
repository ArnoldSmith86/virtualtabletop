import { createWidget, removeWidget } from './client-util.js';

const enlarged = () => document.getElementById('enlarged');
const showCopyOf = widget => {
  enlarged().className = 'widget';
  enlarged().dataset.id = widget.get('id');
};

describe('The enlarged copy of a hovered widget', () => {
  afterEach(() => {
    document.body.classList.remove('edit');
  });

  test('stays on screen for a widget selected in the editor while editing', () => {
    const widget = createWidget({ id: 'enlarge-editing', type: 'widget', enlarge: 2 });
    widget.setHighlighted(true);
    document.body.classList.add('edit');
    showCopyOf(widget);

    widget.hideEnlarged();

    expect(enlarged().classList.contains('hidden')).toBe(false);
    removeWidget(widget.get('id'));
  });

  test('hides again after leaving edit mode even though the selection survives it', () => {
    const widget = createWidget({ id: 'enlarge-playing', type: 'widget', enlarge: 2 });
    widget.setHighlighted(true);
    showCopyOf(widget);

    widget.hideEnlarged();

    expect(enlarged().classList.contains('hidden')).toBe(true);
    removeWidget(widget.get('id'));
  });
});
