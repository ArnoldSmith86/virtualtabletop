let edit = false;

function addWidgetLocal(widget) {
  if(!widget.id)
    widget.id = Math.random().toString(36).substring(3, 7);
  sendPropertyUpdate(widget.id, widget);
  sendDelta(true);
}

function editClick(widget) {
  $('#editWidgetJSON').dataset.id = widget.p('id');
  $('#editWidgetJSON').dataset.type = widget.p('type');
  $('#editWidgetJSON').value = JSON.stringify(widget.state, null, '  ');
  showOverlay('editOverlay');
}

function removeWidgetLocal(widgetID) {
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
    const oldID = $('#editWidgetJSON').dataset.id;
    const oldType = $('#editWidgetJSON').dataset.type;
    const widget = JSON.parse($('#editWidgetJSON').value);
    if(widget.id !== oldID || widget.type !== oldType)
      removeWidgetLocal(oldID);
    addWidgetLocal(widget);
    showOverlay();
  });

  on('#removeWidget', 'click', function() {
    removeWidgetLocal($('#editWidgetJSON').dataset.id);
    showOverlay();
  });
});
