class WidgetSelection {
  constructor(widgets, callback, resolveWidget=null) {
    this.widgets = widgets;
    this.callback = callback;
    this.resolveWidget = resolveWidget; // maps a picked widget to the one that was meant (e.g. card to its holder)
    this.domElement = document.createElement('div');
    this.widgetRows = {};
  }

  resolveAll(widgets) {
    if(!this.resolveWidget)
      return widgets;
    const resolved = [];
    for(const widget of widgets.map(this.resolveWidget))
      if(widget && resolved.indexOf(widget) == -1)
        resolved.push(widget);
    return resolved;
  }

  addWidgetEntry(widget) {
    const row = document.createElement('tr');
    for(const text of [ widget.id, widget.get('type') ]) {
      const cell = document.createElement('td');
      cell.textContent = text; // widget ids and types come from untrusted room state
      row.appendChild(cell);
    }
    const actionCell = document.createElement('td');
    button(actionCell, 'Remove', _=>this.removeWidget(widget));
    row.appendChild(actionCell);
    row.dataset.widgetId = widget.id;
    this.widgetRows[widget.id] = row;
    $('table', this.domElement).appendChild(row);
  }

  removeWidget(widget) {
    this.widgetRows[widget.id].remove();
    delete this.widgetRows[widget.id];
    this.widgets = this.widgets.filter(w=>w.id !== widget.id);
  }

  render() {
    const selectionDiv = div(this.domElement, 'selection', `
        <table>
          <tr>
            <th>Widget</th>
            <th>Type</th>
            <th>Action</th>
          </tr>
        </table>
        <div class=start>
          <button>Add Widgets</button>
          <button>Start Fresh</button>
          <button>Use These Widgets</button>
        </div>
        <div class=end style=display:none>
          <p>Select widgets in the room. A plain click replaces the selection; shift-click adds to it. Then click Select to apply the selection.</p>
          <button>Select</button>
        </div>
    `);
    for(const widget of this.widgets) {
      this.addWidgetEntry(widget);
    }
    $('.start button:nth-child(1)', selectionDiv).addEventListener('click', _=>{
      startCustomSelection(this.widgets, customSelection=>this.updateWidgets(this.resolveAll(customSelection)));
      $('.start', selectionDiv).style.display = 'none';
      $('.end', selectionDiv).style.display = 'block';
    });
    $('.start button:nth-child(2)', selectionDiv).addEventListener('click', _=>{
      startCustomSelection([], customSelection=>this.updateWidgets(this.resolveAll(customSelection)));
      $('.start', selectionDiv).style.display = 'none';
      $('.end', selectionDiv).style.display = 'block';
    });
    $('.start button:nth-child(3)', selectionDiv).addEventListener('click', _=>{
      this.callback(this.widgets);
    });
    $('.end button', selectionDiv).addEventListener('click', _=>{
      endCustomSelection();
      $('.start', selectionDiv).style.display = 'block';
      $('.end', selectionDiv).style.display = 'none';
    });
  }

  updateWidgets(widgets) {
    for(const widget of this.widgets)
      if(!widgets.includes(widget))
        this.removeWidget(widget);
    for(const widget of widgets) {
      if(!this.widgetRows[widget.id]) {
        this.addWidgetEntry(widget);
        this.widgets.push(widget);
      }
    }
  }
}
