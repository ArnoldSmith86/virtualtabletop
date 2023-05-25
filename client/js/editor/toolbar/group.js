class GroupButton extends ToolbarToggleButton {
  constructor() {
    super('view_in_ar', 'Group widgets', 'Group the selected widgets by inserting an invisible parent widget.', 'g');
    this.setMinimumSelection(1);
  }

  async activate() {
    const parent = [...new Set(selectedWidgets.map(w=>w.get('parent')))];

    if(parent.length != 1) {
      alert('This only works if all widgets have the same parent.');
      return;
    }

    const x = Math.min(...selectedWidgets.map(w=>w.get('x')));
    const y = Math.min(...selectedWidgets.map(w=>w.get('y')));

    const groupWidget = {
      parent: parent[0],
      x,
      y,
      width:  Math.max(...selectedWidgets.map(w=>w.get('x')+w.get('width' ))) - x,
      height: Math.max(...selectedWidgets.map(w=>w.get('y')+w.get('height'))) - y,
      editorGroup: true,
      movable: false
    }

    const newParent = await addWidgetLocal(groupWidget);
    for(const widget of selectedWidgets)
      await widget.set('parent', newParent);

    setSelection([ widgets.get(newParent) ]);
  }

  async deactivate() {
    const parent   = selectedWidgets[0];
    const children = parent.children();
    for(const childWidget of children) {
      await childWidget.set('parent', parent.get('parent'));
      await childWidget.set('x', childWidget.get('x') + parent.get('x'));
      await childWidget.set('y', childWidget.get('y') + parent.get('y'));
    }
    setSelection(children);
    await removeWidgetLocal(parent.get('id'));
  }

  onSelectionChanged(newSelection, oldSelection) {
    this.setState(newSelection.length == 1 && newSelection[0].get('editorGroup'));
    const sameParent = newSelection.length > 1 && newSelection.every(w=>w.get('parent')==newSelection[0].get('parent'));
    this.setMinimumSelection(this.active ? 1 : (sameParent ? 2 : 9999999));
  }
}
