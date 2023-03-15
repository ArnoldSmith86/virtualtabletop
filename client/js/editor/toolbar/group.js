class GroupButton extends ToolbarButton {
  constructor() {
    super('view_in_ar', 'Group the selected widgets by inserting an invisible parent widget.', 'g');
    this.setMinimumSelection(2);
  }

  async click() {
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
      height: Math.max(...selectedWidgets.map(w=>w.get('y')+w.get('height'))) - y
    }

    const newParent = await addWidgetLocal(groupWidget);
    for(const widget of selectedWidgets)
      await widget.set('parent', newParent);

    setSelection([ widgets.get(newParent) ]);
  }
}
