import { dropTargets } from '../../client/js/main.js';
import { addWidget, widgets } from '../../client/js/serverstate.js';
import { Button } from '../../client/js/widgets/button.js';
import { Label } from '../../client/js/widgets/label.js';

export function addButton(definition) {
  const button = new Button(definition.id);
  addWidget(definition, button);
  return button;
}

export function addLabel(id) {
  const labelDef = { id: id, type: 'label' }
  const label = new Label(labelDef.id);
  addWidget(labelDef, label);
  return label;
}

//start: copied from serverstate.js due to circular imports
export function removeWidget(widgetID) {
  widgets.get(widgetID).applyRemove();
  widgets.delete(widgetID);
  dropTargets.delete(widgetID);
}
//end: copied from serverstate.js
