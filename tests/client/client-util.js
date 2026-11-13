import { dropTargets } from '../../client/js/main.js';
import { addWidget, widgets } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';
import { Label } from '../../client/js/widgets/label.js';

export function createWidget(definition) {
  const widget = new Widget(definition.id);
  addWidget(definition, widget);
  return widget;
}

export function addLabel(id) {
  const labelDef = { id: id, type: 'label' }
  const label = new Label(labelDef.id);
  addWidget(labelDef, label);
  return label;
}

//start: copied from serverstate.js due to circular imports
export function removeWidget(widgetID) {
  const widget = widgets.get(widgetID);
  widget.applyRemove();
  widgets.delete(widgetID);
  dropTargets.delete(widgetID);
  widget.revertInheritedValues();
}
//end: copied from serverstate.js
