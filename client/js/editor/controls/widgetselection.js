class WidgetSelection {
  constructor(widgets, callback) {
    this.widgets = widgets;
    this.callback = callback;
    this.domElement = document.createElement('div');
    this.widgetRows = {};
  }

  addWidgetEntry(widget) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${widget.id}</td>
      <td>${widget.get('type')}</td>
      <td><button>Remove</button></td>
    `;
    row.dataset.widgetId = widget.id;
    this.widgetRows[widget.id] = row;
    $('table', this.domElement).appendChild(row);
    $('button', row).addEventListener('click', _=>{
      this.removeWidget(widget);
    });
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
          <p>Select widgets in the room. Then click Select to apply the selection.</p>
          <button>Select</button>
        </div>
    `);
    for(const widget of this.widgets) {
      this.addWidgetEntry(widget);
    }
    $('.start button:nth-child(1)', selectionDiv).addEventListener('click', _=>{
      startCustomSelection(this.widgets, customSelection=>this.updateWidgets(customSelection));
      $('.start', selectionDiv).style.display = 'none';
      $('.end', selectionDiv).style.display = 'block';
    });
    $('.start button:nth-child(2)', selectionDiv).addEventListener('click', _=>{
      startCustomSelection([], customSelection=>this.updateWidgets(customSelection));
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
