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

function generateCardDeckWidgets(id, x, y) {
  const widgets = [
    { type:'holder', id, x, y, dropTarget: { deck: id+'D' } },
    { type:'pile', id: id+'P', parent: id },
    {
      id: id+'B',
      parent: id,
      y: 171.36,
      width: 111,
      height: 40,
      type: 'button',
      text: 'Recall & Shuffle',
      movableInEdit: false,

      clickRoutine: [
        { func: 'RECALL',  holder: id },
        { func: 'FLIP',    holder: id, face: 0 },
        { func: 'SHUFFLE', holder: id }
      ]
    }
  ];

  const types = {};
  const cards = [];

  [ '1J', '2J' ].forEach(c=>types[c] = { image:`/i/cards-default/${c}.svg` });

  [ 'C', 'D', 'H', 'S' ].forEach(function(s) {
    [ 'A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K' ].forEach(function(n) {
      types[n+s] = { image:`/i/cards-default/${n}${s}.svg` };
      cards.push({ id:id+n+s, parent:id+'P', deck:id+'D', type:'card', cardType:n+s });
    });
  });

  const front = { type:'image', x:0, y:0, width:103, height:160, valueType:'dynamic', value:'image' };
  const back  = { ...front };
  back.valueType = 'static';
  back.value = '/i/cards-default/2B.svg';
  widgets.push({
    type: 'deck',
    id: id+'D',
    parent: id,
    cardTypes: types,
    faceTemplates: [ {
      border: false, radius: 8, objects: [ back  ]
    }, {
      border: false, radius: 8, objects: [ front ]
    } ]
  });

  cards.forEach(function(c) {
    widgets.push(c);
  });

  return widgets;
}

function addCompositeWidgetToAddWidgetOverlay(widgetsToAdd, onClick) {
  for(const wi of widgetsToAdd) {
    let w = null;
    if(wi.type == 'button') w = new Button(wi.id);
    if(wi.type == 'card')   w = new Card(wi.id);
    if(wi.type == 'deck')   w = new Deck(wi.id);
    if(wi.type == 'holder') w = new Holder(wi.id);
    if(wi.type == 'pile')   w = new Pile(wi.id);
    widgets.set(wi.id, w);
    w.applyDelta(wi);
    if(!wi.parent) {
      w.domElement.addEventListener('click', _=>{
        onClick();
        showOverlay();
      });
      $('#addOverlay').appendChild(w.domElement);
    }
  }
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

  addCompositeWidgetToAddWidgetOverlay(generateCardDeckWidgets('add-deck', 120, 600), function() {
    for(const w of generateCardDeckWidgets(Math.random().toString(36).substring(3, 7), 120, 600))
      addWidgetLocal(w);
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
