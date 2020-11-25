let edit = false;

function addWidgetLocal(widget) {
  if(!widget.id)
    widget.id = Math.random().toString(36).substring(3, 7);
  sendPropertyUpdate(widget.id, widget);
  sendDelta(true);
}

function editClick(widget) {
  $('#editWidgetJSON').value = JSON.stringify(widget.state, null, '  ');
  $('#editWidgetJSON').dataset.previousState = $('#editWidgetJSON').value;
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
    const previousState = JSON.parse($('#editWidgetJSON').dataset.previousState);
    const widget = JSON.parse($('#editWidgetJSON').value);
    if(widget.id !== previousState.id || widget.type !== previousState.type) {
      removeWidgetLocal(previousState.id);
    } else {
      for(const key in previousState)
        if(widget[key] === undefined)
          widget[key] = null;
    }
    addWidgetLocal(widget);
    showOverlay();
  });

  on('#removeWidget', 'click', function() {
    removeWidgetLocal($('#editWidgetJSON').dataset.id);
    showOverlay();
  });
});
