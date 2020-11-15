let edit = false;

function addWidgetLocal(widget) {
  if(!widget.id)
    widget.id = Math.random().toString(36).substring(3, 7);
  addWidget(widget);
  sendPropertyUpdate(widget.id, widget);
}

function editClick(e) {
  if(edit) {
    const target = widgets.get(e.target.id);
    const { clientX, clientY } = e.type === "touchend" ? e.changedTouches[0] : e;

    if(target.dragStartEvent.clientX == clientX && target.dragStartEvent.clientY == clientY) {
      $('#editWidgetJSON').dataset.id = e.target.id;
      $('#editWidgetJSON').value = JSON.stringify(target.sourceObject, null, '  ');
      showOverlay('editOverlay');
    }
  }
}

function removeWidgetLocal(widgetID) {
  removeWidget(widgetID);
  sendPropertyUpdate(widgetID, null);
}

onLoad(function() {
  on('#editButton', 'click', function() {
    if(edit)
      $('body').classList.remove('edit');
    else
      $('body').classList.add('edit');
    edit = !edit;
    showOverlay();
  });

  on('#addWidget', 'click', function() {
    addWidgetLocal(JSON.parse($('#widgetText').value));
    showOverlay();
  });

  on('#updateWidget', 'click', function() {
    removeWidgetLocal($('#editWidgetJSON').dataset.id);
    addWidgetLocal(JSON.parse($('#editWidgetJSON').value));
    showOverlay();
  });

  on('#removeWidget', 'click', function() {
    removeWidgetLocal($('#editWidgetJSON').dataset.id);
    showOverlay();
  });

  on('#room', 'mouseup',  editClick);
  on('#room', 'touchend', editClick);
});
