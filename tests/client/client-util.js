import { topSurface } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';
import { Label } from '../../client/js/widgets/label.js';

export function createWidget(definition) {
  const widget = new Widget(definition.id);
  topSurface.addWidget(definition, widget);
  return widget;
}

export function addLabel(id) {
  const labelDef = { id: id, type: 'label' }
  const label = new Label(labelDef.id);
  topSurface.addWidget(labelDef, label);
  return label;
}

//start: copied from serverstate.js due to circular imports
export function removeWidget(widgetID) {
  topSurface.widgets.get(widgetID).applyRemove();
  topSurface.widgets.delete(widgetID);
  topSurface.dropTargets.delete(widgetID);
}
//end: copied from serverstate.js
