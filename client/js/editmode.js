let edit = false;

function generateUniqueWidgetID() {
  let id;
  do {
    id = Math.random().toString(36).substring(3, 7);
  } while (widgets.has(id));
  return id;
}

async function addWidgetLocal(widget) {
  if (!widget.id)
    widget.id = generateUniqueWidgetID();
  const isNewWidget = !widgets.has(widget.id);
  sendPropertyUpdate(widget.id, widget);
  sendDelta(true);
  batchStart();
  if(isNewWidget)
    for(const [ w, routine ] of StateManaged.globalUpdateListeners['id'] || [])
      await w.evaluateRoutine(routine, { widgetID: widget.id, oldValue: null, value: widget.id }, { widget: [ widgets.get(widget.id) ] });
  batchEnd();
  return widget.id;
}
//This section holds the edit overlays for each widget
//basic widget functions
function populateEditOptionsBasic(widget) {
  $('#basicImage').value = widget.image || "~ no image found ~";

  if (widget.layer < 1){
    $('#basicTypeBoard').checked = true
  } else {
    $('#basicTypeToken').checked = true
  }

  $('#basicWidth').value = widget.width||100;
  $('#basicHeight').value = widget.height||100;
  $('#basicWidthNumber').value = widget.width||100;
  $('#basicHeightNumber').value = widget.height||100;

  $('#basicFullscreen').checked = false;
  $('#basicEnlarge').checked = widget.enlarge;
}

function applyWidthHeight(widget, value, dimension) {
  return value.replaceAll(/\d/g, '').replace(/\./g, '')  === '' ? widget[dimension] = parseFloat(value): widget[dimension] = widget[dimension];
}

function applyEditOptionsBasic(widget) {
  if ($('#basicTypeBoard').checked == true){
    widget.layer = -4;
    widget.movable = false;
  } else {
    widget.layer = 1;
    widget.movable = true;
  }

  if ($('#basicImage').value=="~ no image found ~")
    delete widget.image;
  else
    widget.image = $('#basicImage').value;

  applyWidthHeight(widget, $('#basicWidthNumber').value, 'width');
  applyWidthHeight(widget, $('#basicHeightNumber').value, 'height');

  if ($('#basicFullscreen').checked){
    widget.width = 1600;
    widget.height = 1000;
    delete widget.x;
    delete widget.y;
  }

  if (!widget.enlarge || !$('#basicEnlarge').checked)
    widget.enlarge = $('#basicEnlarge').checked;
}

//button functions
function populateEditOptionsButton(widget) {
  $('#buttonText').value = widget.text || "~ no text found ~";
  $('#buttonImage').value = widget.image || "~ no image found ~";
  $('#buttonColorMain').value = widget.backgroundColor || "#1f5ca6";
  $('#buttonColorBorder').value = widget.borderColor || "#0d2f5e";
  $('#buttonColorText').value = widget.textColor || "#ffffff"


  $('#buttonText').style = "display: inline";
  $('[for=buttonText]').style = "display: inline";
  $('#buttonImage').style = "display: inline";
  $('[for=buttonImage]').style = "display: inline";
  $('#uploadButtonImage').style = "display: inline";

  if (!widget.text && widget.image){
    $('#buttonText').style = "display: none !important";
    $('[for=buttonText]').style = "display: none !important";
  }
  if (!widget.image && widget.text){
    $('#buttonImage').style = "display: none !important";
    $('[for=buttonImage]').style = "display: none !important";
    $('#uploadButtonImage').style = "display: none !important";
  }
}

function applyEditOptionsButton(widget) {
  if ($('#buttonText').value=="~ no text found ~")
    delete widget.text;
  else
    widget.text = $('#buttonText').value;

  if ($('#buttonImage').value=="~ no image found ~")
    delete widget.image;
  else
    widget.image = $('#buttonImage').value;

  if ($('#buttonColorMain').value=="#1f5ca6")
    delete widget.backgroundColor;
  else
    widget.backgroundColor = $('#buttonColorMain').value;

  if ($('#buttonColorBorder').value=="#0d2f5e")
    delete widget.borderColor;
  else
    widget.borderColor = $('#buttonColorBorder').value;

  if ($('#buttonColorText').value=="#ffffff")
    delete widget.textColor;
  else
    widget.textColor = $('#buttonColorText').value;
}

//canvas functions
function populateEditOptionsCanvas(widget) {
  const cm = widget.colorMap || Canvas.defaultColors
  const ctx = document.createElement('canvas').getContext('2d');

  for(let i=0; i<10; ++i) {
    $a('.colorComponent > [type=radio]')[i].checked = widget.activeColor == i;
    // using canvas fillStyle to turn color names into hex colors
    ctx.fillStyle = cm[i] || Canvas.defaultColors[i];
    $a('.colorComponent > [type=color]')[i].value = ctx.fillStyle;
  }

  $('#canvasColorReset').checked = false;
}

function applyEditOptionsCanvas(widget) {
  if(!Array.isArray(widget.colorMap))
    widget.colorMap = [];
  for(let i=0; i<10; ++i) {
    if($a('.colorComponent > [type=radio]')[i].checked)
      widget.activeColor = i;
    widget.colorMap[i] = $a('.colorComponent > [type=color]')[i].value;
  }

  if($('#canvasColorReset').checked){
    for(const choice of $a('#canvasPresets > [name=canvasPresets]')) {
      if(choice.selected) {
        switch(choice.value) {
          case "original":
          widget.colorMap = ["#F0F0F0","#1F5CA6","#000000","#FF0000","#008000","#FFFF00","#FFA500","#FFC0CB","#800080","#A52A2A"];
          break;
          case "pieces":
          widget.colorMap = ["#F0F0F0","#1F5CA6","#4A4A4A","#000000","#E84242","#E2A633","#E0CB0B","#23CA5B","#4C5FEA","#BC5BEE"];
          break;
          case "basic":
          widget.colorMap = ["#FFFFFF","#000000","#FF0000","#FF8000","#FFFF00","#00FF00","#00FFFF","#0000FF","#8000FF","#FF00FF"];
          break;
          case "pencil":
          widget.colorMap = ["#FFFFFF","#000000","#8B3003","#E52C2C","#F08A38","#FAE844","#71C82A","#1F5CA6","#775094","#CD36BC"];
          break;
          case "pastel":
          widget.colorMap = ["#FFFFFF","#7A7A7A","#FFADAD","#FFD6A5","#FDFFB6","#CAFFBF","#9BF6FF","#A0C4FF","#BDB2FF","#FFC6FF"];
          break;
          case "grey":
          widget.colorMap = ["#FFFFFF","#E0E0E0","#C4C4C4","#A8A8A8","#8C8C8C","#707070","#545454","#383838","#1C1C1C","#000000"];
          break;
        }
      }
    }
  }
}

//deck functions
async function applyEditOptionsDeck(widget) {
  for(const type of $a('#cardTypesList tr.cardType')) {
    const id = $('.id', type).value;
    const oldID = $('.id', type).dataset.oldID;

    for(let i=0; i<$('.count', type).value-$('.count', type).dataset.oldValue; ++i) {
      const card = { deck:widget.id, type:'card', cardType:oldID };
      const cardId = await addWidgetLocal(card);
      if(widget.parent)
        await widgets.get(cardId).moveToHolder(widgets.get(widget.parent));
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

    for(const object of $a('.properties > div', type)) {
      if (($('input', object).value) == '')
        delete widget.cardTypes[id][$('label', object).textContent];
      else if (!(/\D/).test($('input', object).value))
        widget.cardTypes[id][$('label', object).textContent] = parseFloat($('input', object).value);
      else if ($('input', object).value === 'true' || $('input', object).value ==='false')
        widget.cardTypes[id][$('label', object).textContent] = ($('input', object).value === 'true');
      else if ($('input', object).value !== '')
        widget.cardTypes[id][$('label', object).textContent] = $('input', object).value.replaceAll('\\n','\n').replaceAll('\"', '').replaceAll('\'', '');
      else
        widget.cardTypes[id][$('label', object).textContent] = '';
    }
  }
}

//holder functions
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

//label functions
function populateEditOptionsLabel(widget) {
  $('#labelText').value = widget.text;
  $('#labelWidth').value = widget.width||100;
  $('#labelHeight').value = widget.height||20;
  $('#labelWidthNumber').value = widget.width||100;
  $('#labelHeightNumber').value = widget.height||20;
  $('#labelEditable').checked = widget.editable;
}

function applyEditOptionsLabel(widget) {
  widget.text = $('#labelText').value;

  applyWidthHeight(widget, $('#labelWidthNumber').value, 'width');
  applyWidthHeight(widget, $('#labelHeightNumber').value, 'height');

  widget.editable = $('#labelEditable').checked;
}

//piece widget functions
function populateEditOptionsPiece(widget) {
  $('#pieceColor').value = widget.color || "black";
  if (widget.classes == "classicPiece") {
    $('#pieceTypeClassic').checked = true
  } else if (widget.classes == "checkersPiece" || widget.classes == "checkersPiece crowned") {
    $('#pieceTypeChecker').checked = true
  } else if (widget.classes == "pinPiece") {
    $('#pieceTypePin').checked = true
  }
}

function applyEditOptionsPiece(widget) {
  if ($('#pieceTypeClassic').checked == true){
    delete widget.activeFace;
    delete widget.faces;
    widget.classes = "classicPiece";
    widget.height = 90;
    widget.width = 90;
  } else if ($('#pieceTypeChecker').checked == true){
    widget.classes = "checkersPiece";
    widget.activeFace = 0;
    widget.faces = [{"classes": "checkersPiece"},{"classes": "checkersPiece crowned"}];
    widget.height = 73.5;
    widget.width = 73.5;
    widget.activeFace = (widget.activeFace ? 1 : 0);
  } else if ($('#pieceTypePin').checked == true){
    delete widget.activeFace;
    delete widget.faces;
    widget.classes = "pinPiece";
    widget.height = 43.83;
    widget.width = 35.85;
  }

  widget.color = $('#pieceColor').value;
}

//seat functions
function populateEditOptionsSeat(widget) {
  $('#seatPlayerColor').value = widget.color || "black";
  $('#seatPlayerName').value = widget.player || "~ empty seat ~";
  $('#seatEmpty').checked = false;
}

function applyEditOptionsSeat(widget) {
  if($('#seatEmpty').checked || $('#seatPlayerName').value == "~ empty seat ~") {
    delete widget.player;
    delete widget.color;
  } else {
    if(widget.player) {
      toServer('playerColor', { player: widget.player, color: $('#seatPlayerColor').value });
      toServer('rename', { oldName: widget.player, newName: $('#seatPlayerName').value });
    }
    widget.player = $('#seatPlayerName').value;
    widget.color = $('#seatPlayerColor').value;
  }
}

//spinner functions
function populateEditOptionsSpinner(widget) {
}

function applyEditOptionsSpinner(widget) {
  for(let i=0; i<9; ++i) {
    if($a('#spinnerOptions > [name=spinnerOptions]')[i].selected){
      widget.options = JSON.parse($a('#spinnerOptions > [name=spinnerOptions]')[i].value);
      delete widget.angle;
      widget.value=widget.options[widget.options.length-1];
    }
  }
}

//timer functions
function populateEditOptionsTimer(widget) {
  $('#timerCountdown').checked = widget.countdown;
  if (widget.end || widget.end==0){
    var duration = Math.abs(widget.start-widget.end)
    console.log(duration,Math.floor(duration / 60000),Math.floor((duration % 60000)/1000))
    $('#timerMinutes').value = Math.floor(duration / 60000) || 0;
    $('#timerSeconds').value = Math.floor((duration % 60000)/1000);
  } else {
    $('#timerMinutes').value = "--";
    $('#timerSeconds').value = "--";
  }
  $('#timerReset').checked = false;
}

function applyEditOptionsTimer(widget) {
  widget.countdown = $('#timerCountdown').checked;
  if ($('#timerMinutes').value == "--" && $('#timerSeconds').value == "--"){
    delete widget.start
    delete widget.end
  } else if ($('#timerCountdown').checked) {
    var minutes = $('#timerMinutes').value == "--" ? 0 : $('#timerMinutes').value*60000
    var seconds = $('#timerSeconds').value == "--" ? 0 : $('#timerSeconds').value*1000
    widget.end = 0;
    widget.start = minutes + seconds
  } else {
    var minutes = $('#timerMinutes').value == "--" ? 0 : $('#timerMinutes').value*60000
    var seconds = $('#timerSeconds').value == "--" ? 0 : $('#timerSeconds').value*1000
    widget.end = minutes + seconds;
    widget.start = 0
  }


  if($('#timerReset').checked) {
    widget.paused = true;
    widget.milliseconds = widget.start;
  }
}

//This section calls the relative widgets' overlays and functions
async function applyEditOptions(widget) {
  var type = widget.type||'piece';
  if (type=='piece' && widget.image)
    type = 'basic';

  if(type == 'basic')
    applyEditOptionsBasic(widget);
  if(type == 'button')
    applyEditOptionsButton(widget);
  if(type == 'canvas')
    applyEditOptionsCanvas(widget);
  if(type == 'deck')
    await applyEditOptionsDeck(widget);
  if(type == 'holder')
    applyEditOptionsHolder(widget);
  if(type == 'label')
    applyEditOptionsLabel(widget);
  if(type == 'piece')
    applyEditOptionsPiece(widget);
  if(type == 'seat')
    applyEditOptionsSeat(widget);
  if(type == 'spinner')
    applyEditOptionsSpinner(widget);
  if(type == 'timer')
    applyEditOptionsTimer(widget);
}

function editClick(widget) {
  $('#editWidgetJSON').value = JSON.stringify(widget.state, null, '  ');
  $('#editWidgetJSON').dataset.previousState = $('#editWidgetJSON').value;

  $a('#editOverlay > div').forEach(d=>d.style.display = 'none');

  var type = widget.state.type||'piece';
  if (type=='piece' && widget.state.image)
    type = 'basic';

  const typeSpecific = $(`#editOverlay > .${type}Edit`);

  if(!typeSpecific)
    return showOverlay('editJSONoverlay');

  typeSpecific.style.display = 'block';

  vmEditOverlay.selectedWidget = widget

  if(type == 'basic')
    populateEditOptionsBasic(widget.state);
  if(type == 'button')
    populateEditOptionsButton(widget.state);
  if(type == 'canvas')
    populateEditOptionsCanvas(widget.state);
  if(type == 'holder')
    populateEditOptionsHolder(widget.state);
  if(type == 'label')
    populateEditOptionsLabel(widget.state);
  if(type == 'piece')
    populateEditOptionsPiece(widget.state);
  if(type == 'seat')
    populateEditOptionsSeat(widget.state);
  if(type == 'spinner')
    populateEditOptionsSpinner(widget.state);
  if(type == 'timer')
    populateEditOptionsTimer(widget.state);

  showOverlay('editOverlay');
}

//This section holds the functions that generate the JSON of the widgets in the add widget overlay
function generateCardDeckWidgets(id, x, y, addCards) {
  const widgets = [
    { type:'holder', id, x, y, dropTarget: { type: 'card' } },
    {
      id: id+'B',
      parent: id,
      fixedParent: true,
      y: 171.36,
      width: 111,
      height: 40,
      type: 'button',
      text: 'Recall & Shuffle',
      movableInEdit: false,

      clickRoutine: [
        { func: 'RECALL',  holder: '${PROPERTY parent}' },
        { func: 'FLIP',    holder: '${PROPERTY parent}', face: 0 },
        { func: 'SHUFFLE', holder: '${PROPERTY parent}' }
      ]
    }
  ];

  const types = {};
  const cards = [];

  if(addCards) {
    widgets.push({ type:'pile', id: id+'P', parent: id, width:103, height:160 });
    [ {label:'1J', color: "🃏", suit: "T", alternating:"5J", rank: "J1"}, {label:'2J', color: "🃏", suit: "T", alternating:"5J", rank: "J2"}].forEach(c=>types[c.suit+" "+c.label] = { image:`/i/cards-default/${c.label}.svg` , suit:c.suit, suitColor:c.color, suitAlt:c.alternating, rank:c.rank, rankA:c.rank, rankFixed:c.rank+" "+c.suit});

    [ {label:'C', color: "♣", alternating:"1♣"}, {label:'D', color: "♦", alternating:"4♦"}, {label:'H', color: "♥", alternating:"2♥"}, {label:'S', color: "♠", alternating:"3♠"} ].forEach(function(s) {
      [ {label:'A', rank: "01", rankA:"5A"}, {label:'2', rank: "02", rankA:"02"},{label:'3', rank: "03", rankA:"03"},{label:'4', rank: "04", rankA:"04"},{label:'5', rank: "05", rankA:"05"},{label:'6', rank: "06", rankA:"06"},{label:'7', rank: "07", rankA:"07"},{label:'8', rank: "08", rankA:"08"},{label:'9', rank: "09", rankA:"09"},{label:'T', rank: "10", rankA:"10"},{label:'J', rank: "2J", rankA:"2J"},{label:'Q', rank: "3Q", rankA:"3Q"},{label:'K', rank: "4K", rankA:"4K"}].forEach(function(n) {
        types[s.label+" "+n.rank] = { image:`/i/cards-default/${n.label}${s.label}.svg`, suit:s.label, suitColor:s.color, suitAlt:s.alternating, rank:n.rank,rankA:n.rankA, rankFixed:n.rank+" "+s.label};
        cards.push({ id:id+"_"+n.label+"_"+s.label, parent:id+'P', deck:id+'D', type:'card', cardType:s.label+" "+n.rank });
      });
    });
  }

  const front = { type:'image', x:0, y:0, width:103, height:160, color:'transparent', dynamicProperties:{value:'image'} };
  const back  = { ...front };
  delete back.dynamicProperties;
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
  const r = { func: 'LABEL', label: '${PROPERTY parent}', mode: 'dec', value: 1 };

  const down = {
    id: id+'D',
    parent: id,
    fixedParent: true,
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
      fixedParent: true,
      id: id+'P',
      x: 120,
      y: -3,
      width: 36,
      height: 36,
      type: "button",
      movableInEdit: false,
      clickRoutine: [
        {
          func: "TIMER",
          timer: '${PROPERTY parent}'
        }
      ],
      image: "/i/button-icons/White-Play_Pause.svg",
      css: "background-size: 75% 75%"
    },
    {
      parent: id,
      fixedParent: true,
      id: id+'R',
      x: 80,
      y: -3,
      width: 36,
      height: 36,
      type: "button",
      movableInEdit: false,
      clickRoutine: [
        {
          func: "TIMER",
          timer: '${PROPERTY parent}',
          mode: "reset"
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
    if(wi.type == 'canvas') w = new Canvas(wi.id);
    if(wi.type == 'card')   w = new Card(wi.id);
    if(wi.type == 'deck')   w = new Deck(wi.id);
    if(wi.type == 'holder') w = new Holder(wi.id);
    if(wi.type == 'label')  w = new Label(wi.id);
    if(wi.type == 'pile')   w = new Pile(wi.id);
    if(wi.type == 'timer')  w = new Timer(wi.id);
    widgets.set(wi.id, w);
    w.applyInitialDelta(wi);
    if(!wi.parent) {
      w.domElement.addEventListener('click', async _=>{
        overlayDone(await onClick());
      });
      $('#addOverlay').appendChild(w.domElement);
    }
  }
}

function addWidgetToAddWidgetOverlay(w, wi) {
  w.applyInitialDelta(wi);
  w.domElement.addEventListener('click', async _=>{
    const toAdd = {...wi};
    toAdd.z = getMaxZ(w.get('layer')) + 1;
    const id = await addWidgetLocal(toAdd);
    overlayDone(id);
  });
  $('#addOverlay').appendChild(w.domElement);
}

// Called by most routines that add widgets. If the widget add came from the JSON editor,
// call a routine in the JSON editor to clean up. Then hide the add widget overlay.
function overlayDone(id) {
  if(jeEnabled)
    jeAddWidgetDone(id);
  showOverlay();
}

function populateAddWidgetOverlay() {
  // Populate the Cards panel in the add widget overlay
  const x = 20+140-111/2;
  addWidgetToAddWidgetOverlay(new Holder('add-holder'), {
    type: 'holder',
    x,
    y: 130
  });

  addCompositeWidgetToAddWidgetOverlay(generateCardDeckWidgets('add-empty-deck', x, 320, false), async function() {
    const id = generateUniqueWidgetID();
    for(const w of generateCardDeckWidgets(id, x, 320, false))
      await addWidgetLocal(w);
    return id
  });
  addCompositeWidgetToAddWidgetOverlay(generateCardDeckWidgets('add-deck', x, 550, true), async function() {
    const id = generateUniqueWidgetID();
    for(const w of generateCardDeckWidgets(id, x, 550, true))
      await addWidgetLocal(w);
    return id
  });

  // Populate the Game Pieces panel in the add widget overlay
  let y = 100;
  // First the pins, checkers, and pawns
  for(const color of [ '#bc5bee','#4c5fea','#23ca5b','#e0cb0b','#e2a633','#e84242','#000000','#4a4a4a','#ffffff' ]) {
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
      width: 56,
      height: 84,
      x: 528,
      y: y + (43.83 - 84)/2
    });
    y += 88;
  }

  // Next the unicode symbols
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

  // Populate the Interactive panel in the add widget overlay.
  // Note that the Add Canvas and Add Seat buttons are in room.html.

  // First the various spinners
  y = 180;
  for(const sides of [ 2, 6, 10, 20 ]) {
    addWidgetToAddWidgetOverlay(new Spinner('add-spinner'+sides), {
      type: 'spinner',
      value: sides,
      options: Array.from({length: sides}, (_, i) => i + 1),
      x: 675,
      y: y
    });
    y += 120;
  }

  y = 180;
  for(const sides of [ 4, 8, 12 ]) {
    addWidgetToAddWidgetOverlay(new Spinner('add-spinner'+sides), {
      type: 'spinner',
      value: sides,
      options: Array.from({length: sides}, (_, i) => i + 1),
      x: 810,
      y: y
    });
    y += 120;
  }

  addWidgetToAddWidgetOverlay(new Button('add-button'), {
    type: 'button',
    text: 'DEAL',
    clickRoutine: [],
    x: 760,
    y: 660
  });

  // Add the composite timer widget
  addCompositeWidgetToAddWidgetOverlay(generateTimerWidgets('add-timer', 710, 790), async function() {
    const id = generateUniqueWidgetID();
    for(const w of generateTimerWidgets(id, 710, 790))
      await addWidgetLocal(w);
    return id
  });

  // Add the composite counter widget
  addCompositeWidgetToAddWidgetOverlay(generateCounterWidgets('add-counter', 767, 870), async function() {
    const id = generateUniqueWidgetID();
    for(const w of generateCounterWidgets(id, 767, 870))
      await addWidgetLocal(w);
    return id
  });

  // Populate the Decorative panel in the add widget overlay
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
// end of JSON generators

async function removeWidgetLocal(widgetID, keepChildren) {
  function getWidgetsToRemove(widgetID) {
    const children = [];
    if(!keepChildren)
      for(const [ childWidgetID, childWidget ] of widgets)
        if(!childWidget.inRemovalQueue && (childWidget.get('parent') == widgetID || childWidget.get('deck') == widgetID))
          children.push(...getWidgetsToRemove(childWidgetID));
    widgets.get(widgetID).inRemovalQueue = true;
    children.push(widgets.get(widgetID));
    return children;
  }

  if(widgets.get(widgetID).inRemovalQueue)
    return;

  for(const w of getWidgetsToRemove(widgetID)) {
    w.isBeingRemoved = true;
    // don't actually set deck and parent to null (only pretend to) because when "receiving" the delta, the applyRemove has to find the parent
    await w.onPropertyChange('deck', w.get('deck'), null);
    await w.onPropertyChange('parent', w.get('parent'), null);
    sendPropertyUpdate(w.id, null);
  }
}

function uploadWidget(preset) {
  uploadAsset().then(async function(asset) {
    let id;
    if(asset && preset == 'board') {
      id = await addWidgetLocal({
        image: asset,
        movable: false,
        width: 1600,
        height: 1000,
        layer: -4
      });
    }
    if(asset && preset == 'token') {
      id = await addWidgetLocal({
        image: asset
      });
    }
    overlayDone(id);
  });
}

async function updateWidget(currentState, oldState, applyChangesFromUI) {
  const previousState = JSON.parse(oldState);
  try {
    var widget = JSON.parse(currentState);
  } catch(e) {
    alert(e.toString());
    return;
  }

  for(const key in widget)
    if(widget[key] === null)
      delete widget[key];

  if(widget.parent !== undefined && !widgets.has(widget.parent)) {
    alert(`Parent widget ${widget.parent} does not exist.`);
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
    await removeWidgetLocal(previousState.id, true);
  } else {
    for(const key in previousState)
      if(widget[key] === undefined)
        widget[key] = null;
  }
  const id = await addWidgetLocal(widget);

  for(const child of children)
    sendPropertyUpdate(child.get('id'), 'parent', id);
  for(const card of cards)
    sendPropertyUpdate(card.get('id'), 'deck', id);
}

async function onClickUpdateWidget(applyChangesFromUI) {
  await updateWidget($('#editWidgetJSON').value, $('#editWidgetJSON').dataset.previousState, applyChangesFromUI);

  showOverlay();
}

async function duplicateWidget(widget, recursive, inheritFrom, increment, xOffset, yOffset, xCopies, yCopies) {
  const clone = async function(widget, recursive, newParent, xOffset, yOffset) {
    let currentWidget = JSON.parse(JSON.stringify(widget.state))

    if(inheritFrom) {
      const inheritWidget = { inheritFrom: currentWidget.id };
      for(const key of [ 'id', 'type', 'deck', 'cardType' ])
        if(currentWidget[key] !== undefined)
          inheritWidget[key] = currentWidget[key];
      currentWidget = inheritWidget;
    }

    if(increment) {
      const match = currentWidget.id.match(/^(.*?)([0-9]+)([^0-9]*)$/);
      let number = match ? parseInt(match[2]) : 0;
      while(widgets.has(currentWidget.id)) {
        ++number;
        if(match)
          currentWidget.id = `${match[1]}${number}${match[3]}`;
        else
          currentWidget.id = `${widget.id}${number}`;
      }
    } else {
      delete currentWidget.id;
    }

    if(newParent)
      currentWidget.parent = newParent;
    if(xOffset || !newParent && inheritFrom)
      currentWidget.x = widget.get('x') + xOffset;
    if(yOffset || !newParent && inheritFrom)
      currentWidget.y = widget.get('y') + yOffset;

    const currentId = await addWidgetLocal(currentWidget);

    if(recursive)
      for(const child of widgetFilter(w=>w.get('parent')==widget.id))
        await clone(child, true, currentId, 0, 0);

    return currentWidget;
  };

  const gridX = xCopies + 1;
  const gridY = yCopies + 1;
  for(let i=1; i<gridX*gridY; ++i) {
    let x = xOffset*(i%gridX);
    let y = yOffset*Math.floor(i/gridX);
    if(xCopies + yCopies == 1) {
      x = xOffset;
      y = yOffset;
    }
    var clonedWidget = await clone(widget, recursive, false, x, y);
  }
  return clonedWidget;
}

async function onClickDuplicateWidget() {
  const widget = widgets.get(JSON.parse($('#editWidgetJSON').dataset.previousState).id);
  const xOffset = widget.absoluteCoord('x') > 1500 ? -20 : 20;
  const yOffset = widget.absoluteCoord('y') >  900 ? -20 : 20;
  await duplicateWidget(widget, true, false, true, xOffset, yOffset, 1, 0);
  showOverlay();
}

async function onClickRemoveWidget() {
  if(confirm('Really remove?')) {
    await removeWidgetLocal(JSON.parse($('#editWidgetJSON').dataset.previousState).id);
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

function toggleEditMode() {
  if(edit)
    $('body').classList.remove('edit');
  else
    $('body').classList.add('edit');
  edit = !edit;
  showOverlay();
}

onLoad(function() {
  on('#editButton', 'click', toggleEditMode);

  // This now adds an empty basic widget
  on('#addBasicWidget', 'click', async function() {
    const id = await addWidgetLocal({
      text: "Basic widget"
    });
    overlayDone(id);
  });

  on('#addHand', 'click', async function() {
    const hand = {
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
    }
    if(!widgets.has('hand'))
      hand.id = 'hand';
    overlayDone(await addWidgetLocal(hand));
  });

  on('#addCanvas', 'click', async function() {
    const id = await addWidgetLocal({
      type: "canvas",

      x: 400,
      y: 100,
      width: 800,
      height: 800,

      c00: "*01001001001/1%/1.01.010",
      c01: ",01&,1/0101*1/1+1.1'0",
      c10: ",,1()0",
      c11: "0*1()0",
      c13: "+-01$/10",
      c14: "01/1.1/1/1.1/1/1.1/1.101.1.101.1.101.1-1-1-1-1.010",
      c15: ".1$0",
      c20: ",,1()0",
      c21: "0*1()0",
      c23: ".-01()0",
      c24: "./1/1+1-101/11010110101/101-1/101-1/101,10",
      c25: "1()0",
      c30: "+01(*1/1/1.1/10101101(/11.1/101-1/1/10",
      c31: "*011/1-1/101-1-11.1-101101-1-1/101,11/10",
      c33: ".-01()0",
      c34: "/-1/101(/1/1-101/101'01/101/1/11.1(0",
      c35: "1()0",
      c40: "+/1.1(/10101-101.11/11+10101/1(.10",
      c41: "/-1/1(/1101-101/101'01/101/101/1/1(010",
      c43: ".-01()0",
      c44: "/1$01-1-1-1-1-101'-1-1-101'-101.1.1/110",
      c45: "1()0",
      c50: ".1/01+1/11+101+1/1/01+1.10",
      c51: "/-1.1(/10101/101/101/10110101/101/1/1(/1+1*1(0",
      c53: ".-01()0",
      c54: ",01-1-1-1-1-1/101(/1/101/101/101/101/101(.10",
      c55: "1()0",
      c61: "0/11*1/1/1.1+1/1-1(/1-1-1/1011-110",
      c63: ".-01()0",
      c64: "0/1/01,11/11/11/101/101'01/101-1/1/11.1/10",
      c65: "1()0",
      c71: "*01/01,11/1.11/101/1-101/1-101/1/11.1/110",
      c73: ".-01()0",
      c74: "/-1/1(,101/1-101/1-101(/101/1/01/010",
      c75: "110101&0",
      c81: "--101,101101-101*101/010",
      c83: ".-01%.010",
      c84: "*1/1+1,11/1/101/101/101/101/101/101/1/11/1/01/010010",
      c85: "1%0"
    })
    await addWidgetLocal({
      type: "button",
      id: id+"-Reset",

      parent: id,
      fixedParent: true,

      x: -50,
      y: 0,
      width: 50,
      height: 50,

      movable: false,
      movableInEdit: false,

      clickRoutine: [
        {
          func: "CANVAS",
          canvas: "${PROPERTY parent}",
          mode: "reset"
        }
      ],
      css: "border-width: 1px;  --wcBorder: #555; --wcBorderOH: black; --wcMainOH: #0d2f5e; ",
      borderRadius: '50% 0% 0% 0%',
      text: "Reset"
    })
    await addWidgetLocal({
      type: "button",
      id: id+"-Color",

      parent: id,
      fixedParent: true,

      x: -50,
      y: 50,
      width: 50,
      height: 50,

      movable: false,
      movableInEdit: false,

      clickRoutine: [
        "var parent = ${PROPERTY parent}",
        {
          func: "CANVAS",
          canvas: '${parent}',
          mode: "inc",
          value: 1
        },
        "var color = ${PROPERTY colorMap OF $parent} getIndex ${PROPERTY activeColor OF $parent}",
        {
          func: "SET",
          collection: "thisButton",
          property: "color",
          value: "${color}"
        }
      ],
      color: "#1F5CA6",
      css: "border-width: 1px; background-color: var(--color);  --wcBorder: #555; --wcBorderOH: black  ",
      borderRadius: '0% 0% 0% 50%'
    });
    overlayDone(id);
  });

  on('#addSeat', 'click', async function() {
    const seats = widgetFilter(w=>w.get('type')=='seat');
    const maxIndex = Math.max(...seats.map(w=>w.get('index')));
    await addWidgetLocal({
      type: 'seat',
      index: seats.length && maxIndex ? maxIndex+1 : 1,
      x: 840,
      y: 90
    });
    showOverlay();
  });

  on('#uploadBoard', 'click', _=>uploadWidget('board'));
  on('#uploadToken', 'click', _=>uploadWidget('token'));

  on('#addWidget', 'click', async function() {
    const widget = JSON.parse($('#widgetText').value);

    for(const key in widget)
      if(widget[key] === null)
        delete widget[key];

    if(widget.parent !== undefined && !widgets.has(widget.parent)) {
      alert(`Parent widget ${widget.parent} does not exist.`);
      return;
    }

    const id = await addWidgetLocal(widget);
    overlayDone(id);
  });

  const editOverlayApp = Vue.createApp({
    data() { return {
      selectedWidget: {},
    }}
  });
  loadComponents(editOverlayApp);
  vmEditOverlay = editOverlayApp.mount("#editOverlayVue");

  on('#labelWidthNumber', 'input', e=>$('#labelWidth').value=e.target.value)
  on('#labelWidth', 'input', e=>$('#labelWidthNumber').value=e.target.value)
  on('#labelHeightNumber', 'input', e=>$('#labelHeight').value=e.target.value)
  on('#labelHeight', 'input', e=>$('#labelHeightNumber').value=e.target.value)

  on('#basicWidthNumber', 'input', e=>$('#basicWidth').value=e.target.value)
  on('#basicWidth', 'input', e=>$('#basicWidthNumber').value=e.target.value)
  on('#basicHeightNumber', 'input', e=>$('#basicHeight').value=e.target.value)
  on('#basicHeight', 'input', e=>$('#basicHeightNumber').value=e.target.value)

  on('#uploadButtonImage', 'click', _=>uploadAsset().then(function(asset) {
    if(asset)
      $('#buttonImage').value = asset;
  }));

  populateAddWidgetOverlay();
});
