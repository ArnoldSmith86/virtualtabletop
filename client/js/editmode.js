let edit = false;

function addWidgetLocal(widget) {
  if(!widget.id)
    widget.id = Math.random().toString(36).substring(3, 7);
  sendPropertyUpdate(widget.id, widget);
  sendDelta(true);
}

function populateEditOptionsDeck(widget) {
  removeFromDOM('#cardTypesList tr.cardType');
  for(const typeID in widget.cardTypes) {
    const type = widget.cardTypes[typeID];
    const entry = domByTemplate('template-cardtypeslist-entry', 'tr');
    entry.className = 'cardType';

    $('.id', entry).value = typeID;
    $('.id', entry).dataset.oldID = typeID;

    $('.count', entry).value = $('.count', entry).dataset.oldValue = widgetFilter(w=>w.p('deck')==widget.id&&w.p('cardType')==typeID).length;

    const propertiesAdded = [];
    for(const face of widget.faceTemplates) {
      for(const object of face.objects) {
        if(object.valueType == 'dynamic' && propertiesAdded.indexOf(object.value) == -1) {
          propertiesAdded.push(object.value);
          const oEntry = domByTemplate('template-cardtypeslist-property-entry');
          $('label', oEntry).textContent = object.value;
          $('input', oEntry).value = type[object.value] || '';

          if(object.type == 'image') {
            $('.uploadAsset', oEntry).addEventListener('click', _=>uploadAsset().then(function(asset) {
              if(asset)
                $('input', oEntry).value = asset;
            }));
          } else {
            $('.uploadAsset', oEntry).style.display = 'none';
          }

          $('.properties', entry).appendChild(oEntry);
        }
      }
    }

    $('#cardTypesList').appendChild(entry);
  }
}

function applyEditOptionsDeck(widget) {
  for(const type of $a('#cardTypesList tr.cardType')) {
    const id = $('.id', type).value;
    const oldID = $('.id', type).dataset.oldID;

    for(let i=0; i<$('.count', type).value-$('.count', type).dataset.oldValue; ++i) {
      const card = { deck:widget.id, type:'card', cardType:oldID };
      addWidgetLocal(card);
      if(widget.parent)
        widgets.get(card.id).moveToHolder(widgets.get(widget.parent));
    }
    for(let i=0; i<$('.count', type).dataset.oldValue-$('.count', type).value; ++i) {
      const card = widgetFilter(w=>w.p('deck')==widget.id&&w.p('cardType')==oldID)[0];
      removeWidgetLocal(card.p('id'));
    }

    if(id != oldID) {
      widget.cardTypes[id] = widget.cardTypes[oldID];
      delete widget.cardTypes[oldID];
      widgetFilter(w=>w.p('deck')==widget.id&&w.p('cardType')==oldID).forEach(w=>w.p('cardType', id));
    }

    for(const object of $a('.properties > div', type))
      widget.cardTypes[id][$('label', object).textContent] = $('input', object).value;
  }
}

function applyEditOptions(widget) {
  if(widget.type == 'deck')
    applyEditOptionsDeck(widget);
}

function editClick(widget) {
  $('#editWidgetJSON').value = JSON.stringify(widget.state, null, '  ');
  $('#editWidgetJSON').dataset.previousState = $('#editWidgetJSON').value;

  $a('#editOverlay > div').forEach(d=>d.style.display = 'none');

  const type = widget.state.type;
  const typeSpecific = $(`#editOverlay > .${type}Edit`);

  if(!typeSpecific)
    return showOverlay('editJSONoverlay');

  typeSpecific.style.display = 'block';
  if(type == 'deck')
    populateEditOptionsDeck(widget.state);

  showOverlay('editOverlay');
}

function generateCardDeckWidgets(id, x, y) {
  const widgets = [
    { type:'holder', id, x, y, dropTarget: { type: 'card' } },
    { type:'pile', id: id+'P', parent: id, width:103, height:160 },
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

  const front = { type:'image', x:0, y:0, width:103, height:160, valueType:'dynamic', value:'image', color:'transparent' };
  const back  = { ...front };
  back.valueType = 'static';
  back.value = '/i/cards-default/2B.svg';
  widgets.push({
    type: 'deck',
    id: id+'D',
    parent: id,
    x: 12,
    y: 41,
    cardTypes: types,
    faceTemplates: [ {
      border: false, radius: false, objects: [ back  ]
    }, {
      border: false, radius: false, objects: [ front ]
    } ]
  });

  cards.forEach(function(c) {
    widgets.push(c);
  });

  return widgets;
}

function generateCounterWidgets(id, x, y) {
  const r = { func: 'LABEL', label: id, mode: 'dec', value: 1 };

  const down = {
    id: id+'D',
    parent: id,
    x: 4,
    y: -2,
    width: 36,
    height: 36,
    type: 'button',
    movableInEdit: false,
    text: '-',

    clickRoutine: [ r ]
  };

  return [
    { type:'label', text: 0, id, x, y, width: 140, height: 44, css:'font-size: 30px;', editable: true },
    down,
    Object.assign({ ...down }, { id: id+'U', text: '+', x: 100, clickRoutine: [ Object.assign({ ...r }, { mode: 'inc' }) ] })
  ];
}

function addCompositeWidgetToAddWidgetOverlay(widgetsToAdd, onClick) {
  for(const wi of widgetsToAdd) {
    let w = null;
    if(wi.type == 'button') w = new Button(wi.id);
    if(wi.type == 'card')   w = new Card(wi.id);
    if(wi.type == 'deck')   w = new Deck(wi.id);
    if(wi.type == 'holder') w = new Holder(wi.id);
    if(wi.type == 'label')  w = new Label(wi.id);
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
  const x = 20+140-111/2;
  addWidgetToAddWidgetOverlay(new Holder('add-holder'), {
    type: 'holder',
    x,
    y: 300
  });

  addCompositeWidgetToAddWidgetOverlay(generateCardDeckWidgets('add-deck', x, 500), function() {
    for(const w of generateCardDeckWidgets(Math.random().toString(36).substring(3, 7), x, 500))
      addWidgetLocal(w);
  });

  let y = 100;
  for(const color of [ '#000000','#4a4a4a','#4c5fea','#bc5bee','#e84242','#e0cb0b','#23ca5b','#e2a633','#ffffff' ]) {
    addWidgetToAddWidgetOverlay(new BasicWidget('add-pin-'+color), {
      classes: 'pinPiece',
      color,
      width: 35.85,
      height: 43.83,
      x: 380,
      y
    });

    addWidgetToAddWidgetOverlay(new BasicWidget('add-checkers-'+color), {
      faces: [
        { classes: "checkersPiece"         },
        { classes: "checkersPiece crowned" }
      ],
      color,
      width: 73.5,
      height: 73.5,
      x: 440,
      y: y + (43.83 - 73.5)/2
    });

    addWidgetToAddWidgetOverlay(new BasicWidget('add-classic-'+color), {
      classes: 'classicPiece',
      color,
      width: 90,
      height: 90,
      x: 510,
      y: y + (43.83 - 90)/2
    });
    y += 88;
  }

  const centerStyle = 'color:black;display:flex;justify-content:center;align-items:center;text-align:center;';
  addWidgetToAddWidgetOverlay(new BasicWidget('add-unicodeS'), {
    text: '🐻',
    css: 'font-size:25px;'+centerStyle,
    width: 25,
    height: 25,
    x: 380,
    y: y + 5
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('add-unicodeM'), {
    text: '🔥',
    css: 'font-size:50px;'+centerStyle,
    width: 50,
    height: 50,
    x: 440,
    y
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('add-unicodeL'), {
    text: '♞',
    css: 'font-size:100px;'+centerStyle,
    x: 500,
    y: y - 25
  });

  addWidgetToAddWidgetOverlay(new Button('add-button'), {
    type: 'button',
    text: 'DEAL',
    clickRoutine: [],
    x: 810,
    y: 300
  });

  y = 100;
  for(const sides of [ 2, 4, 6, 8, 10, 12, 20 ]) {
    addWidgetToAddWidgetOverlay(new Spinner('add-spinner'+sides), {
      type: 'spinner',
      value: sides,
      options: Array.from({length: sides}, (_, i) => i + 1),
      x: 675,
      y: y
    });
    y += 120;
  }

  addCompositeWidgetToAddWidgetOverlay(generateCounterWidgets('add-counter', 780, 700), function() {
    for(const w of generateCounterWidgets(Math.random().toString(36).substring(3, 7), 780, 700))
      addWidgetLocal(w);
  });

  addWidgetToAddWidgetOverlay(new Label('add-label'), {
    type: 'label',
    text: 'Label',
    x: 1000,
    y: 400
  });

  addWidgetToAddWidgetOverlay(new Label('add-heading'), {
    type: 'label',
    text: 'Heading',
    css: 'font-size: 30px',
    height: 42,
    width: 200,
    x: 1000,
    y: 600
  });
}

function removeWidgetLocal(widgetID, removeChildren) {
  if(removeChildren)
    for(const [ childWidgetID, childWidget ] of widgets)
      if(childWidget.p('parent') == widgetID || childWidget.p('deck') == widgetID)
        removeWidgetLocal(childWidgetID, removeChildren);
  if(widgets.has(widgetID)) {
    widgets.get(widgetID).p('deck', null);
    widgets.get(widgetID).p('parent', null);
    sendPropertyUpdate(widgetID, null);
  }
}

function uploadWidget(preset) {
  uploadAsset().then(function(asset) {
    if(asset && preset == 'board') {
      addWidgetLocal({
        image: asset,
        movable: false,
        width: 1600,
        height: 1000,
        layer: -4
      });
    }
    if(asset && preset == 'token') {
      addWidgetLocal({
        image: asset
      });
    }
    showOverlay();
  });
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

  on('#addHand', 'click', function() {
    addWidgetLocal({
      type: 'holder',
      onEnter: { activeFace: 1 },
      onLeave: { activeFace: 0 },
      dropOffsetX: 10,
      dropOffsetY: 14,
      stackOffsetX: 40,
      childrenPerOwner: true,
      x: 50,
      y: 820,
      width: 1500,
      height: 180
    });
    showOverlay();
  });

  on('#uploadBoard', 'click', _=>uploadWidget('board'));
  on('#uploadToken', 'click', _=>uploadWidget('token'));

  on('#addWidget', 'click', function() {
    addWidgetLocal(JSON.parse($('#widgetText').value));
    showOverlay();
  });

  on('#updateWidget, #updateWidgetJSON', 'click', function(e) {
    const previousState = JSON.parse($('#editWidgetJSON').dataset.previousState);
    const widget = JSON.parse($('#editWidgetJSON').value);

    if(e.target == $('#updateWidget'))
      applyEditOptions(widget);

    const children = Widget.prototype.children.call(widgets.get(previousState.id));
    const cards = widgetFilter(w=>w.p('deck')==previousState.id);

    if(widget.id !== previousState.id || widget.type !== previousState.type) {
      for(const child of children)
        sendPropertyUpdate(child.p('id'), 'parent', null);
      for(const card of cards)
        sendPropertyUpdate(card.p('id'), 'deck', null);
      removeWidgetLocal(previousState.id);
    } else {
      for(const key in previousState)
        if(widget[key] === undefined)
          widget[key] = null;
    }
    addWidgetLocal(widget);

    for(const child of children)
      sendPropertyUpdate(child.p('id'), 'parent', widget.id);
    for(const card of cards)
      sendPropertyUpdate(card.p('id'), 'deck', widget.id);

    showOverlay();
  });

  on('#duplicateWidget, #duplicateWidgetJSON', 'click', function() {
    const widget = JSON.parse($('#editWidgetJSON').dataset.previousState);
    delete widget.id;
    if(widget.x)
      widget.x += 20;
    if(widget.y)
      widget.y += 20;
    addWidgetLocal(widget);
    showOverlay();
  });

  on('#removeWidget, #removeWidgetJSON', 'click', function() {
    if(confirm('Really remove?')) {
      removeWidgetLocal(JSON.parse($('#editWidgetJSON').dataset.previousState).id, true);
      showOverlay();
    }
  });

  on('#manualEdit', 'click', _=>showOverlay('editJSONoverlay'));

  populateAddWidgetOverlay();
});
