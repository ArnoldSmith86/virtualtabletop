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

function addWidgetToAddWidgetOverlay(w, wi) {
  w.applyDelta(wi);
  w.domElement.addEventListener('click', _=>{
    const toAdd = {...wi};
    toAdd.z = getMaxZ(w.p('layer')) + 1;
    addWidgetLocal(toAdd);
    showOverlay();
  });
  $('#addOverlay').appendChild(w.domElement);
}

function populateAddWidgetOverlay() {
  addWidgetToAddWidgetOverlay(new BasicWidget('add-pin'), {
    classes: 'pinPiece',
    color: 'red',
    width: 35.85,
    height: 43.83,
    x: 120,
    y: 300
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('add-checkers'), {
    faces: [
      { classes: "checkersPiece"         },
      { classes: "checkersPiece crowned" }
    ],
    color: 'red',
    width: 73.5,
    height: 73.5,
    x: 200,
    y: 300
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('add-classic'), {
    classes: 'classicPiece',
    color: 'red',
    width: 90,
    height: 90,
    x: 300,
    y: 300
  });

  addWidgetToAddWidgetOverlay(new Holder('add-holder'), {
    type: 'holder',
    x: 120,
    y: 400
  });

  addWidgetToAddWidgetOverlay(new Button('add-button'), {
    type: 'button',
    text: 'DEAL',
    clickRoutine: [],
    x: 300,
    y: 400
  });

  addWidgetToAddWidgetOverlay(new Spinner('add-spinner'), {
    type: 'spinner',
    x: 400,
    y: 400
  });

  addWidgetToAddWidgetOverlay(new Label('add-label'), {
    type: 'label',
    text: 'Label',
    x: 500,
    y: 400
  });
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

  on('#addCustomWidgetOverlay', 'click', _=>showOverlay('addCustomOverlay'));

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
    removeWidgetLocal(JSON.parse($('#editWidgetJSON').dataset.previousState).id);
    showOverlay();
  });

  populateAddWidgetOverlay();
});
