let edit = false;

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
    objectToWidget(JSON.parse($('#widgetText').value));
    showOverlay();
  });

  on('#updateWidget', 'click', function() {
    widgets.get($('#editWidgetJSON').dataset.id).sourceObject = JSON.parse($('#editWidgetJSON').value);
    widgets.get($('#editWidgetJSON').dataset.id).sendUpdate();
    showOverlay();
  });

  on('#removeWidget', 'click', function() {
    toServer('remove', $('#editWidgetJSON').dataset.id);
    showOverlay();
  });

  on('#room', 'click', function(e) {
    if(edit) {
      const target = widgets.get(e.target.id);
      if(target.dragStartEvent.clientX == e.clientX && target.dragStartEvent.clientY == e.clientY) {
        $('#editWidgetJSON').dataset.id = e.target.id;
        $('#editWidgetJSON').value = JSON.stringify(target.sourceObject, null, '  ');
        showOverlay('editOverlay');
      }
    }
  });
});
