import { setText } from '../../client/js/domhelpers.js';
import { compareDropTarget, dropTargets } from '../../client/js/main.js';
import { playerName } from '../../client/js/overlays/players.js';
import { addWidget, widgetFilter, widgets } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';
import { Label } from '../../client/js/widgets/label.js';

export function createWidget(definition, WidgetClass=Widget) {
  const widget = new WidgetClass(definition.id);
  addWidget(definition, widget);
  return widget;
}

export function addLabel(id) {
  const labelDef = { id: id, type: 'label' }
  const label = new Label(labelDef.id);
  addWidget(labelDef, label);
  return label;
}

// The browser concatenates all client scripts into a single module, so most widget classes
// refer to each other and to the helpers they use as globals. Provide those globals before
// importing the classes that need them at evaluation time (their extends clause).
export async function loadWidgetClasses() {
  window.Widget = Widget;
  window.widgets = widgets;
  window.widgetFilter = widgetFilter;
  window.dropTargets = dropTargets;
  window.compareDropTarget = compareDropTarget;
  window.playerName = playerName;
  window.setText = setText;
  window.legacyMode = () => false;
  window.ImageWidget = (await import('../../client/js/widgets/imagewidget.js')).ImageWidget;
  return {
    Holder: (await import('../../client/js/widgets/holder.js')).Holder,
    Seat: (await import('../../client/js/widgets/seat.js')).Seat
  };
}

//start: copied from serverstate.js due to circular imports
export function removeWidget(widgetID) {
  widgets.get(widgetID).applyRemove();
  widgets.delete(widgetID);
  dropTargets.delete(widgetID);
}
//end: copied from serverstate.js
