let edit = false;

function generateUniqueWidgetID() {
  let id;
  do {
    id = Math.random().toString(36).substring(3, 7);
  } while (widgets.has(id));
  return id;
}

function addWidgetLocal(widget) {
  if (!widget.id)
    widget.id = generateUniqueWidgetID();
  sendPropertyUpdate(widget.id, widget);
  sendDelta(true);
}

async function applyEditOptionsDeck(widget) {
  for(const type of $a('#cardTypesList tr.cardType')) {
    const id = $('.id', type).value;
    const oldID = $('.id', type).dataset.oldID;

    for(let i=0; i<$('.count', type).value-$('.count', type).dataset.oldValue; ++i) {
      const card = { deck:widget.id, type:'card', cardType:oldID };
      addWidgetLocal(card);
      if(widget.parent)
        await widgets.get(card.id).moveToHolder(widgets.get(widget.parent));
    }
    for(let i=0; i<$('.count', type).dataset.oldValue-$('.count', type).value; ++i) {
      const card = widgetFilter(w=>w.get('deck')==widget.id&&w.get('cardType')==oldID)[0];
      await removeWidgetLocal(card.get('id'));
    }

    if(id != oldID) {
      widget.cardTypes[id] = widget.cardTypes[oldID];
      delete widget.cardTypes[oldID];
      for(const w of widgetFilter(w=>w.get('deck')==widget.id&&w.get('cardType')==oldID))
        await w.set('cardType', id);
    }

    for(const object of $a('.properties > div', type))
      widget.cardTypes[id][$('label', object).textContent] = $('input', object).value;
  }
}

function populateEditOptionsHolder(widget) {
  $('#resizeHolderToChildren').checked = false;
  $('#transparentHolder').checked = widget.classes && !!widget.classes.match(/transparent/);
}

function applyEditOptionsHolder(widget) {
  if($('#transparentHolder').checked && !widget.classes)
    widget.classes = 'transparent';
  else if($('#transparentHolder').checked && !widget.classes.match(/(^| )transparent($| )/))
    widget.classes += ' transparent';
  else if(!$('#transparentHolder').checked && widget.classes && widget.classes.match(/(^| )transparent($| )/))
    widget.classes = widget.classes.replace(/(^| )transparent($| )/, '');
  if(widget.classes === '')
    delete widget.classes;

  if($('#resizeHolderToChildren').checked) {
    const w = widgets.get(widget.id);
    const children = w.children();
    if(children.length) {
      widget.width  = children[0].get('width')  + 2*w.get('dropOffsetX');
      widget.height = children[0].get('height') + 2*w.get('dropOffsetY');
    }
  }
}

async function applyEditOptions(widget) {
  if(widget.type == 'deck')
    await applyEditOptionsDeck(widget);
  if(widget.type == 'holder')
    applyEditOptionsHolder(widget);
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

  vmEditOverlay.selectedWidget = widget

  if(type == 'holder')
    populateEditOptionsHolder(widget.state);

  showOverlay('editOverlay');
}

function generateEmptyDeckWidget(id, x, y) {
  const widgets = [
    { type:'holder', id, x, y, dropTarget: { type: 'card' } },
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
  const front = { type:'image', x:0, y:0, width:103, height:160, valueType:'dynamic', value:'image', color:'transparent' };
  const back  = { ...front };
  back.valueType = 'static'
  back.value = '/i/cards-default/2B.svg';
  widgets.push({
    type: 'deck',
    id: id+'D',
    parent: id,
    x: 12,
    y: 41,
    cardTypes: {},
    faceTemplates: [ {
      border: false, radius: false, objects: [ back  ]
    }, {
      border: false, radius: false, objects: [ front ]
    } ]
  });
  return widgets;
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

  [ {label:'1J', color: "🃏", suit: "T", alternating:"5J", rank: "J1"}, {label:'2J', color: "🃏", suit: "T", alternating:"5J", rank: "J2"}].forEach(c=>types[c.suit+" "+c.label] = { image:`/i/cards-default/${c.label}.svg` , suit:c.suit, suitColor:c.color, suitAlt:c.alternating, rank:c.rank, rankA:c.rank, rankFixed:c.rank+" "+c.suit});

  [ {label:'C', color: "♣", alternating:"1♣"}, {label:'D', color: "♦", alternating:"4♦"}, {label:'H', color: "♥", alternating:"2♥"}, {label:'S', color: "♠", alternating:"3♠"} ].forEach(function(s) {
    [ {label:'A', rank: "01", rankA:"5A"}, {label:'2', rank: "02", rankA:"02"},{label:'3', rank: "03", rankA:"03"},{label:'4', rank: "04", rankA:"04"},{label:'5', rank: "05", rankA:"05"},{label:'6', rank: "06", rankA:"06"},{label:'7', rank: "07", rankA:"07"},{label:'8', rank: "08", rankA:"08"},{label:'9', rank: "09", rankA:"09"},{label:'T', rank: "10", rankA:"10"},{label:'J', rank: "2J", rankA:"2J"},{label:'Q', rank: "3Q", rankA:"3Q"},{label:'K', rank: "4K", rankA:"4K"}].forEach(function(n) {
      types[s.label+" "+n.rank] = { image:`/i/cards-default/${n.label}${s.label}.svg`, suit:s.label, suitColor:s.color, suitAlt:s.alternating, rank:n.rank,rankA:n.rankA, rankFixed:n.rank+" "+s.label};
      cards.push({ id:id+"_"+n.label+"_"+s.label, parent:id+'P', deck:id+'D', type:'card', cardType:s.label+" "+n.rank });
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
    x: -38,
    y: 1,
    width: 36,
    height: 36,
    type: 'button',
    movableInEdit: false,
    text: '-',

    clickRoutine: [ r ]
  };

  return [
    { type:'label', text: 0, id, x, y, width: 65, height: 40, css:'font-size: 30px;', editable: true },
    down,
    Object.assign({ ...down }, { id: id+'U', text: '+', x: 68, clickRoutine: [ Object.assign({ ...r }, { mode: 'inc' }) ] })
  ];
}

function generateTimerWidgets(id, x, y) {
  return [
    { type:'timer', id: id, x: x, y: y },
    {
      parent: id,
      id: id+'P',
      x: 120,
      y: -4,
      width: 36,
      height: 36,
      type: "button",
      movableInEdit: false,
      clickRoutine: [
        {
          func: "TIMERSTATE",
          timer: id
        }
      ],
      image: "/i/button-icons/White-Play_Pause.svg",
      css: "background-size: 75% 75%"
    },
    {
      parent: id,
      id: id+'R',
      x: 80,
      y: -4,
      width: 36,
      height: 36,
      type: "button",
      movableInEdit: false,
      clickRoutine: [
        {
          func: "TIMERSTATE",
          timer: id,
          mode: "pause"
        },
        {
          func: "TIMERTIME",
          timer: id
        }
      ],
      image: "/i/button-icons/White-Reset.svg",
      css: "background-size: 80% 80%"
    }
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
    if(wi.type == 'timer')  w = new Timer(wi.id);
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
    toAdd.z = getMaxZ(w.get('layer')) + 1;
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
    y: 130
  });

  addCompositeWidgetToAddWidgetOverlay(generateEmptyDeckWidget('add-empty-deck', x, 320), function() {
  for(const w of generateEmptyDeckWidget(generateUniqueWidgetID(), x, 320))
    addWidgetLocal(w);
  });
  addCompositeWidgetToAddWidgetOverlay(generateCardDeckWidgets('add-deck', x, 550), function() {
    for(const w of generateCardDeckWidgets(generateUniqueWidgetID(), x, 535))
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

  addCompositeWidgetToAddWidgetOverlay(generateCounterWidgets('add-counter', 827, 700), function() {
    for(const w of generateCounterWidgets(generateUniqueWidgetID(), 827, 700))
      addWidgetLocal(w);
  });

  addCompositeWidgetToAddWidgetOverlay(generateTimerWidgets('add-timer', 775, 500), function() {
    for(const w of generateTimerWidgets(generateUniqueWidgetID(), 775, 500))
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

async function removeWidgetLocal(widgetID, removeChildren) {
  if(removeChildren)
    for(const [ childWidgetID, childWidget ] of widgets)
      if(childWidget.get('parent') == widgetID || childWidget.get('deck') == widgetID)
        await removeWidgetLocal(childWidgetID, removeChildren);
  if(widgets.has(widgetID)) {
    const w = widgets.get(widgetID);
    w.isBeingRemoved = true;
    // don't actually set deck and parent to null (only pretend to) because when "receiving" the delta, the applyRemove has to find the parent
    await w.onPropertyChange('deck', w.get('deck'), null);
    await w.onPropertyChange('parent', w.get('parent'), null);
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

async function onClickUpdateWidget(applyChangesFromUI) {
    const previousState = JSON.parse($('#editWidgetJSON').dataset.previousState);
    try {
      var widget = JSON.parse($('#editWidgetJSON').value);
    } catch(e) {
      alert(e.toString());
      return;
    }

    if(applyChangesFromUI)
      await applyEditOptions(widget);

    const children = Widget.prototype.children.call(widgets.get(previousState.id));
    const cards = widgetFilter(w=>w.get('deck')==previousState.id);

    if(widget.id !== previousState.id || widget.type !== previousState.type) {
      for(const child of children)
        sendPropertyUpdate(child.get('id'), 'parent', null);
      for(const card of cards)
        sendPropertyUpdate(card.get('id'), 'deck', null);
      await removeWidgetLocal(previousState.id);
    } else {
      for(const key in previousState)
        if(widget[key] === undefined)
          widget[key] = null;
    }
    addWidgetLocal(widget);

    for(const child of children)
      sendPropertyUpdate(child.get('id'), 'parent', widget.id);
    for(const card of cards)
      sendPropertyUpdate(card.get('id'), 'deck', widget.id);

    showOverlay();
}

async function onClickDuplicateWidget() {
    const widget = JSON.parse($('#editWidgetJSON').dataset.previousState);
    delete widget.id;
    if(widget.x)
      widget.x += 20;
    if(widget.y)
      widget.y += 20;
    addWidgetLocal(widget);
    const w = widgets.get(widget.id);
    if(widget.x && w.absoluteCoord('x') > 1500)
      await w.set('x', w.get('x')-40);
    if(widget.y && w.absoluteCoord('y') > 900)
      await w.set('y', w.get('y')-40);
    showOverlay();
}

async function onClickRemoveWidget() {
    if(confirm('Really remove?')) {
      await removeWidgetLocal(JSON.parse($('#editWidgetJSON').dataset.previousState).id, true);
      showOverlay();
    }
}

function onClickManualEditWidget() {
  showOverlay('editJSONoverlay')
}

function onClickIncrementAllCardTypes() {
  $a('#cardTypesList .count').forEach(i=>++i.value);
}

function onClickDecrementAllCardTypes() {
  $a('#cardTypesList .count').forEach(i=>i.value=Math.max(0, i.value-1));
}

function addCardType(cardType, value) {
    try {
      var widget = JSON.parse($('#editWidgetJSON').value);
    } catch(e) {
      alert(e.toString());
      return;
    }
    widget.cardTypes[cardType] = value;
    $('#editWidgetJSON').value = JSON.stringify(widget)
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

  populateAddWidgetOverlay();
});
