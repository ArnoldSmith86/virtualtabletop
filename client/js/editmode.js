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

  if(widget.parent && !widgets.has(widget.parent)) {
    console.error(`Refusing to add widget ${widget.id} with invalid parent ${widget.parent}.`);
    return null;
  }

  const isNewWidget = !widgets.has(widget.id);
  if(isNewWidget)
    addWidget(widget);
  sendPropertyUpdate(widget.id, widget);
  sendDelta();
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
  $('#buttonColorMain').value = toHex(widget.backgroundColor || "#1f5ca6");
  $('#buttonColorBorder').value = toHex(widget.borderColor || "#0d2f5e");
  $('#buttonColorText').value = toHex(widget.textColor || "#ffffff");


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

  for(let i=0; i<10; ++i) {
    $a('.colorComponent > [type=radio]')[i].checked = widget.activeColor == i;
    $a('.colorComponent > [type=color]')[i].value = toHex(cm[i] || Canvas.defaultColors[i]);
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
  $('#pieceColor').value = toHex(widget.color || "black");
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
  $('#seatPlayerColor').value = toHex(widget.color || "black");
  $('#seatPlayerName').value = widget.player || "~ empty seat ~";
  $('#seatEmpty').checked = false;
}

function applyEditOptionsSeat(widget) {
  if($('#seatEmpty').checked || $('#seatPlayerName').value == "~ empty seat ~") {
    delete widget.player;
    delete widget.color;
  } else {
    if(widget.player) {
      toServer('playerColor', { player: widget.player, color: toHex($('#seatPlayerColor').value) });
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
    classes: 'symbols',
    css: 'font-size: 28px',
    text: 'remove',

    clickRoutine: [ r ]
  };

  return [
    { type:'label', text: 0, id, x, y, width: 65, height: 40, css:'font-size: 30px;', editable: true },
    down,
    Object.assign({ ...down }, { id: id+'U', text: 'add', x: 68, clickRoutine: [ Object.assign({ ...r }, { mode: 'inc' }) ] })
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
      classes: 'symbols',
      css: 'font-size: 28px',
      text: 'play_pause',
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
      classes: 'symbols',
      css: 'font-size: 28px',
      text: 'reload',
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
    w.domElement.id = w.id;
    if(!wi.parent) {
      w.domElement.addEventListener('click', async _=>{
        batchStart();
        overlayDone(await onClick());
        batchEnd();
      });
      $('#addOverlay').appendChild(w.domElement);
    }
  }
  for(const wi of widgetsToAdd) {
    widgets.delete(wi.id)
  }
}

const VTTblue = '#1f5ca6';
  
function addPieceToAddWidgetOverlay(w, wi) {
  w.applyInitialDelta(wi);
  w.domElement.addEventListener('click', async _=>{
    try {
      const result = await w.showInputOverlay({
        header: 'Choose piece color',
        fields: [
          {
            type: 'color',
            value: VTTblue,
            variable: 'color'
          }
        ]
      });
      const toAdd = {...wi};
      toAdd.z = getMaxZ(w.get('layer')) + 1;
      toAdd.color = result.color;

      const id = await addWidgetLocal(toAdd);
      overlayDone(id);
    } catch(e) {}
  });
  w.domElement.id = w.id;
  $('#addOverlay').appendChild(w.domElement);
}

function addWidgetToAddWidgetOverlay(w, wi) {
  w.applyInitialDelta(wi);
  w.domElement.addEventListener('click', async _=>{
    const toAdd = {...wi};
    toAdd.z = getMaxZ(w.get('layer')) + 1;
    const id = await addWidgetLocal(toAdd);
    overlayDone(id);
  });
  w.domElement.id = w.id;
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
  const x = 115;
  addWidgetToAddWidgetOverlay(new Holder('add-holder'), {
    type: 'holder',
    x,
    y: 150
  });

  addCompositeWidgetToAddWidgetOverlay(generateCardDeckWidgets('add-empty-deck', x, 340, false), async function() {
    const id = generateUniqueWidgetID();
    for(const w of generateCardDeckWidgets(id, x, 340, false))
      await addWidgetLocal(w);
    return id
  });
  addCompositeWidgetToAddWidgetOverlay(generateCardDeckWidgets('add-deck', x, 570, true), async function() {
    const id = generateUniqueWidgetID();
    for(const w of generateCardDeckWidgets(id, x, 570, true))
      await addWidgetLocal(w);
    return id
  });

/* Don't add old-style game pieces; replaced by svg
  // Populate the game panel pieces. The real piece choosing happens in popups.
  addPieceToAddWidgetOverlay( new BasicWidget('add-pin0'), {
    classes: 'pinPiece',
    color: VTTblue,
    width: 35.85,
    height: 43.83,
    x: 380,
    y: 80
  });
  addPieceToAddWidgetOverlay( new BasicWidget('add-checkers0'), {
    faces: [
      { classes: "checkersPiece"         },
      { classes: "checkersPiece crowned" }
    ],
    color: VTTblue,
    width: 73.5,
    height: 73.5,
    x: 380 + 60,
    y: 80 + Math.round((43.83 - 73.5)/2)
  });
  addPieceToAddWidgetOverlay( new BasicWidget('add-classic0'), {
    classes: 'classicPiece',
    color: VTTblue,
    width: 56,
    height: 84,
    x: 380 + 150,
    y: 80 + Math.round((43.83 - 84)/2)
  });
*/
  
/* Don't add the unicode symbols
  // Next the unicode symbols
  const centerStyle = 'color:black;display:flex;justify-content:center;align-items:center;text-align:center;';
  addWidgetToAddWidgetOverlay(new BasicWidget('add-unicodeS'), {
    text: '🐻',
    css: 'font-size:25px;'+centerStyle,
    width: 25,
    height: 25,
    x: 380,
    y: 175
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('add-unicodeM'), {
    text: '🔥',
    css: 'font-size:50px;'+centerStyle,
    width: 50,
    height: 50,
    x: 440,
    y: 175
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('add-unicodeL'), {
    text: '♞',
    css: 'font-size:100px;'+centerStyle,
    x: 500,
    y: 150
  });
*/
  
  //Add svg game pieces
  // First row
  addPieceToAddWidgetOverlay(new BasicWidget('Pawn3DSVG'), {
    x: 380,
    y: 79,
    width: 50.4,
    height: 90,

    color: VTTblue,
    css: "border-radius: 40% 40% 50% 50%/ 80% 80% 10% 10%; ",
    image: "i/game-pieces/3D/Pawn-3D.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },

    borderColor: "black",
    borderWidth: 1
  });

  
  addPieceToAddWidgetOverlay(new BasicWidget('Pin3DSVG'), {
    x: 380+75,
    y: 111,
    width: 35,
    height: 40,

    color: VTTblue,
    css: "border-radius: 80% 80% 40% 110%",
    image: "/i/game-pieces/3D/Pin-3D.svg",
    svgReplaces: {
      "#borderWidth": "borderWidth",
      "#borderColor": "borderColor",
      "#primaryColor": "color"
    },

    borderColor: "black",
    borderWidth: "1"
  });

  addPieceToAddWidgetOverlay(new BasicWidget('Marble3DSVG'), {
    x: 380+2*75,
    y: 114,
    width: 35,
    height: 35,

    color: VTTblue,
    css: "border-radius: 50%;",
    image: "/i/game-pieces/3D/Marble-3D.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#secondaryColor": "secondaryColor",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },

    borderColor: "#ffffff",
    borderWidth: 1,
    secondaryColor: "#000000"
  });

  addPieceToAddWidgetOverlay(new BasicWidget('Cube3DSVG'), {
    x: 380+3*75,
    y: 110,
    width: 36,
    height: 40,

    color: VTTblue,
    css: "border-radius: 50%/35%;",
    image: "/i/game-pieces/3D/Cube-3D.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#secondaryColor": "secondaryColor",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },

    borderColor: "white",
    borderWidth: 1,
    secondaryColor: "black"
  });

  // Second row

  addPieceToAddWidgetOverlay(new BasicWidget('Checker2DSVG'), {
    x: 435,
    y: 180,
    width: 75,
    height: 75,

    activeFace: 1,
    classes: "chip",
    color: VTTblue,
    faces: [
      {
        "image": "i/game-pieces/2D/Checkers-2D.svg",
        "crowned": false
      },
      {
        "image": "i/game-pieces/2D/Crowned-Checkers-2D.svg",
        "crowned": true
      }
    ],
    image: "i/game-pieces/2D/Crowned-Checkers-2D.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#secondaryColor": "secondaryColor",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },

    borderColor: "#000000",
    borderWidth: 1,
    crowned: true,
    secondaryColor: "#ffffff"
  });

  addPieceToAddWidgetOverlay(new BasicWidget('Checker3DSVG'), {
    x: 435+100,
    y: 180,
    width: 75,
    height: 75,

    activeFace: 1,
    classes: "chip3D",
    color: VTTblue,
    faces: [
      {
        "image": "i/game-pieces/3D/Checkers-3D.svg",
        "crowned": false
      },
      {
        "image": "i/game-pieces/3D/Crowned-Checkers-3D.svg",
        "crowned": true
      }
    ],
    image: "i/game-pieces/3D/Crowned-Checkers-3D.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#secondaryColor": "secondaryColor",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },

    borderColor: "#000000",
    borderWidth: 1,
    crowned: true,
    secondaryColor: "#ffffff"
  });

  //Third row

  addPieceToAddWidgetOverlay(new BasicWidget('Meeple2DSVG'), {
    x: 440,
    y: 283,
    width: 56,
    height: 56,

    color: VTTblue,
    css: "border-radius: 100% 100% 25% 25%; ",
    image: "i/game-pieces/2D/Meeple-2D.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },

    borderColor: "#000000",
    borderWidth: 3
  });

  addPieceToAddWidgetOverlay(new BasicWidget('Meeple3DSVG'), {
    x: 440+100,
    y: 280,
    width: 66.5,
    height: 70,

    color: VTTblue,
    css: "border-radius: 45% 65% 70% 30%/ 45% 50% 20% 20%; ",
    faces: [
      {
        "image": "i/game-pieces/3D/Meeple-3D.svg",
        "rotation": 0,
        "state": "alive"
      },
      {
        "image": "i/game-pieces/3D/Meeple240-3D-iso.svg",
        "rotation": 240,
        "state": "dead"
      }
    ],
    image: "i/game-pieces/3D/Meeple-3D.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },

    borderColor: "#000000",
    borderWidth: 1,
    state: "alive"
  });

  //Fourth row

  addPieceToAddWidgetOverlay(new BasicWidget('Pig2DSVG'), {
    x: 440,
    y: 382,
    width: 68.56,
    height: 48,

    color: VTTblue,
    css: "border-radius: 15% 20% 20% 25%/ 15% 20% 50% 75%;",
    image: "i/game-pieces/2D/Pig-2D.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },

    borderColor: "#000000",
    borderWidth: 2
  });

  addPieceToAddWidgetOverlay(new BasicWidget('Pig3DSVG'), {
    x: 440+100,
    y: 378,
    width: 85.7,
    height: 60,

    color: VTTblue,
    css: "border-radius: 30% 40% 40% 40%/20% 30% 60% 100%; ",
    image: "i/game-pieces/3D/Pig-3D.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },

    borderColor: "#000000",
    borderWidth: 1
  });

  //Fifth row

  addPieceToAddWidgetOverlay(new BasicWidget('Building3DSVG'), {
    x: 380,
    y: 444,
    width: 69,
    height: 77,

    color: VTTblue,
    css: "border-radius: 52% 48% 35% 65%/30% 70% 25% 45%;",
    image: "/i/game-pieces/3D/Building-3D.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },

    borderColor: "#000000",
    borderWidth: 1
  });

  addPieceToAddWidgetOverlay(new BasicWidget('House3DSVG'), {
    x: 480,
    y: 457,
    width: 60,
    height: 60,

    color: VTTblue,
    css: "border-radius: 26% 74% 46% 54%/ 50% 55% 45% 50%;",
    image: "/i/game-pieces/3D/House-3D.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#secondaryColor": "secondaryColor",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },

    borderColor: "#000000",
    borderWidth: 2
  });

  addPieceToAddWidgetOverlay(new BasicWidget('Road3DSVG'), {
    x: 600,
    y: 430,
    width: 26,
    height: 100,
    rotation: 60,

    activeFace: 1,
    color: VTTblue,
    faces: [
      {
        "image": "i/game-pieces/3D/Road-3D.svg",
        "rotation": 0
      },
      {
        "image": "i/game-pieces/3D/Road240-3D.svg",
        "rotation": 60
      },
      {
        "image": "i/game-pieces/3D/Road90-3D.svg",
        "rotation": 90
      },
      {
        "image": "i/game-pieces/3D/Road120-3D.svg",
        "rotation": 300
      }
    ],
    image: "i/game-pieces/3D/Road240-3D.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },

    note: "Game designer: You can remove any face you may not need. That way you can limit rotation",
    borderColor: "#000000",
    borderWidth: 1
  });

  //Poker column 1

  addWidgetToAddWidgetOverlay(new BasicWidget('EmptyPoker2DSVG'), {
    x: 920,
    y: 164,
    width: 73,
    height: 73,

    classes: "chip",
    color: VTTblue,
    image: "i/game-pieces/2D/Poker-2D.svg",
    svgReplaces: {
      "#accentColor1": "color",
      "#accentColor2": "color",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "color"
    },

    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#00000022"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('DealerPoker2DSVG'), {
    x: 920,
    y: 257,
    width: 73,
    height: 73,

    classes: "chip",
    image: "i/game-pieces/2D/Poker-2D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "Dealer",

    accentColor1: "#55bb66",
    accentColor2: "#55bb66",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#ffffff",
    primaryColor: "#55bb66"

  });

  addWidgetToAddWidgetOverlay(new BasicWidget('5Poker2DSVG'), {
    x: 920,
    y: 350,
    width: 73,
    height: 73,

    classes: "chip",
    css: "font-size:1.5rem",
    image: "i/game-pieces/2D/Poker-2D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "5",

    accentColor1: "#ffffff",
    accentColor2: "#ffff00",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#ed8080",
    primaryColor: "#ff0000"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('25Poker2DSVG'), {
    x: 920,
    y: 443,
    width: 73,
    height: 73,

    classes: "chip",
    css: "font-size:1.5rem",
    image: "i/game-pieces/2D/Poker-2D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "25",

    accentColor1: "#ffffff",
    accentColor2: "#000000",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#22ba22",
    primaryColor: "#008000"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('500Poker2DSVG'), {
    x: 920,
    y: 536,
    width: 73,
    height: 73,

    classes: "chip",
    css: "font-size:1.5rem",
    image: "i/game-pieces/2D/Poker-2D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "500",

    accentColor1: "#ffffff",
    accentColor2: "#808080",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#a9a9a9",
    primaryColor: "#000000"
  });

  //Poker column 2

  addWidgetToAddWidgetOverlay(new BasicWidget('EmptyPoker3DSVG'), {
    x: 1010,
    y: 173,
    width: 75,
    height: 54.75,

    classes: "chip3D",
    color: VTTblue,
    css: "color: #ffffffcc; font-size: 1.8rem",
    image: "i/game-pieces/3D/Poker-3D.svg",
    svgReplaces: {
      "#accentColor1": "color",
      "#accentColor2": "color",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "color"
    },

    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#00000022"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('1Poker2DSVG'), {
    x: 1010,
    y: 257,
    width: 73,
    height: 73,

    classes: "chip",
    css: "font-size:1.5rem",
    image: "i/game-pieces/2D/Poker-2D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "1",

    accentColor1: "#808080",
    accentColor2: "#add8e6",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#d3d3d3",
    primaryColor: "#ffffff"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('10Poker2DSVG'), {
    x: 1010,
    y: 350,
    width: 73,
    height: 73,

    classes: "chip",
    css: "font-size:1.5rem",
    image: "i/game-pieces/2D/Poker-2D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "10",

    accentColor1: "#ffffff",
    accentColor2: "#87ceeb",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#b0c4de",
    primaryColor: "#000080"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('100Poker2DSVG'), {
    x: 1010,
    y: 443,
    width: 73,
    height: 73,

    classes: "chip",
    css: "font-size:1.5rem",
    image: "i/game-pieces/2D/Poker-2D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "100",

    accentColor1: "#ffffff",
    accentColor2: "#ffc0cb",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#ee82ee",
    primaryColor: "#4b0082"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('1000Poker3DSVG'), {
    x: 1010,
    y: 536,
    width: 73,
    height: 73,

    classes: "chip",
    css: "font-size:1.5rem",
    image: "i/game-pieces/2D/Poker-2D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "1000",

    accentColor1: "#ff0000",
    accentColor2: "#daa520",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#ffff00",
    primaryColor: "#ffd700"
  });

  //Poker column 3



  addWidgetToAddWidgetOverlay(new BasicWidget('DealerPoker3DSVG'), {
    x: 1100,
    y: 108,
    width: 75,
    height: 54.75,

    classes: "chip3D",
    css: "font-size:0.9rem",
    image: "i/game-pieces/3D/Poker-3D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "Dealer",

    accentColor1: "#55bb66",
    accentColor2: "#55bb66",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#ffffff",
    primaryColor: "#55bb66"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('1Poker3DSVG'), {
    x: 1100,
    y: 173,
    width: 75,
    height: 54.75,

    classes: "chip3D",
    css: "font-size:1.3rem",
    image: "i/game-pieces/3D/Poker-3D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "1",

    accentColor1: "#808080",
    accentColor2: "#add8e6",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#d3d3d3",
    primaryColor: "#ffffff"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('5Poker3DSVG'), {
    x: 1100,
    y: 238,
    width: 75,
    height: 54.75,

    classes: "chip3D",
    css: "font-size:1.3rem",
    image: "i/game-pieces/3D/Poker-3D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "5",

    accentColor1: "#ffffff",
    accentColor2: "#ffff00",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#ed8080",
    primaryColor: "#ff0000"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('10Poker3DSVG'), {
    x: 1100,
    y: 303,
    width: 75,
    height: 54.75,

    classes: "chip3D",
    css: "font-size:1.3rem",
    image: "i/game-pieces/3D/Poker-3D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "10",

    accentColor1: "#ffffff",
    accentColor2: "#87ceeb",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#b0c4de",
    primaryColor: "#000080"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('25Poker3DSVG'), {
    x: 1100,
    y: 368,
    width: 75,
    height: 54.75,

    classes: "chip3D",
    css: "font-size:1.3rem",
    image: "i/game-pieces/3D/Poker-3D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "25",

    accentColor1: "#ffffff",
    accentColor2: "#000000",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#22ba22",
    primaryColor: "#008000"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('100Poker3DSVG'), {
    x: 1100,
    y: 433,
    width: 75,
    height: 54.75,

    classes: "chip3D",
    css: "font-size:1.3rem",
    image: "i/game-pieces/3D/Poker-3D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "100",

    accentColor1: "#ffffff",
    accentColor2: "#ffc0cb",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#ee82ee",
    primaryColor: "#4b0082"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('500Poker3DSVG'), {
    x: 1100,
    y: 498,
    width: 75,
    height: 54.75,

    classes: "chip3D",
    css: "font-size:1.3rem",
    image: "i/game-pieces/3D/Poker-3D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "500",

    accentColor1: "#ffffff",
    accentColor2: "#808080",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#a9a9a9",
    primaryColor: "#000000"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('1000Poker3DSVG'), {
    x: 1100,
    y: 563,
    width: 75,
    height: 54.75,

    classes: "chip3D",
    css: "font-size:1.3rem",
    image: "i/game-pieces/3D/Poker-3D.svg",
    svgReplaces: {
      "#accentColor1": "accentColor1",
      "#accentColor2": "accentColor2",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth",
      "#labelColor": "labelColor",
      "#primaryColor": "primaryColor"
    },
    text: "1000",

    accentColor1: "#ff0000",
    accentColor2: "#daa520",
    borderColor: "#000000",
    borderWidth: 2,
    labelColor: "#ffff00",
    primaryColor: "#ffd700"
  });


  // Populate the Interactive panel in the add widget overlay.
  // Note that the Add Canvas, Add Seat, and Add Scoreboard buttons are in room.html.

  // Populate the spinners. The real spinner choosing happens in a popup.
  const spinner = new Spinner('add-spinner0');
  const spinAttrs = {
    type: 'spinner',
    value: 6,
    options: Array.from({length: 6}, (_, i) => i + 1),
    x: 450,
    y: 820
  };
  spinner.applyInitialDelta(spinAttrs);
  spinner.domElement.addEventListener('click', async _=>{
    try {
      const result = await spinner.showInputOverlay({
        header: 'Choose number of spinner values',
        fields: [
          {
            type: 'number',
            label: 'Values',
            value: 6,
            variable: 'values',
            min: 2
          }
        ]
      });
      const values = result.values;
      const toAdd = {...spinAttrs};
      toAdd.z = getMaxZ(spinner.get('layer')) + 1;
      toAdd.value = values;
      toAdd.options = Array.from({length: values}, (_, i) => i + 1);

      const id = await addWidgetLocal(toAdd);
      overlayDone(id);
    } catch(e) {}
  });
  spinner.domElement.id = spinner.id;
  $('#addOverlay').appendChild(spinner.domElement);


  addWidgetToAddWidgetOverlay(new Button('add-button'), {
    type: 'button',
    text: 'DEAL',
    clickRoutine: [],
    x: 750,
    y: 835
  });

  // Add the composite timer widget
  addCompositeWidgetToAddWidgetOverlay(generateTimerWidgets('add-timer', 1005, 810), async function() {
    const id = generateUniqueWidgetID();
    for(const w of generateTimerWidgets(id, 1005, 810))
      await addWidgetLocal(w);
    return id
  });

  // Add the composite counter widget
  addCompositeWidgetToAddWidgetOverlay(generateCounterWidgets('add-counter', 1058, 890), async function() {
    const id = generateUniqueWidgetID();
    for(const w of generateCounterWidgets(id, 1058, 890))
      await addWidgetLocal(w);
    return id
  });

  // Populate the Decorative panel in the add widget overlay
  addWidgetToAddWidgetOverlay(new Label('add-label'), {
    type: 'label',
    text: 'Label',
    x: 1385,
    y: 100
  });

  addWidgetToAddWidgetOverlay(new Label('add-heading'), {
    type: 'label',
    text: 'Heading',
    css: 'font-size: 30px',
    height: 42,
    width: 200,
    x: 1335,
    y: 150
  });
  addWidgetToAddWidgetOverlay(new BasicWidget('LineVertical'), {
    x: 1300,
    y: 325,
    width: 200,
    height: 0,

    css: "border: 3px solid #666; border-radius: 3px;"
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('LineHorizontal'), {
    x: 1535,
    y: 190,
    width: 0,
    height: 200,

    css: "border: 3px solid #666; border-radius: 3px;"
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
  batchStart();

  const previousState = JSON.parse(oldState);
  try {
    var widget = JSON.parse(currentState);
  } catch(e) {
    alert(e.toString());
    batchEnd();
    return;
  }

  for(const key in widget)
    if(widget[key] === null)
      delete widget[key];

  if(widget.parent !== undefined && !widgets.has(widget.parent)) {
    alert(`Parent widget ${widget.parent} does not exist.`);
    batchEnd();
    return;
  }

  if(applyChangesFromUI)
    await applyEditOptions(widget);

  const children = Widget.prototype.children.call(widgets.get(previousState.id)); // use Widget.children even for holders so it doesn't filter
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

  if(widget.id !== previousState.id || widget.type !== previousState.type) {
    const id = await addWidgetLocal(widget);

    for(const child of children)
      sendPropertyUpdate(child.get('id'), 'parent', id);
    for(const card of cards)
      sendPropertyUpdate(card.get('id'), 'deck', id);
  } else {
    for(const key in widget) {
      if(widget[key] !== previousState[key] && JSON.stringify(widget[key]) !== JSON.stringify(previousState[key])) {
        sendPropertyUpdate(widget.id, key, widget[key]);
      }
    }
  }

  batchEnd();
}

async function onClickUpdateWidget(applyChangesFromUI) {
  await updateWidget($('#editWidgetJSON').value, $('#editWidgetJSON').dataset.previousState, applyChangesFromUI);

  showOverlay();
}

async function duplicateWidget(widget, recursive, inheritFrom, inheritProperties, incrementKind, incrementIn, xOffset, yOffset, xCopies, yCopies, problems) { // incrementKind: '', 'Letters', 'Numbers'

  const incrementCaps = function(l) {
    const m = l.match(/Z+$/);
    const zs = m ? m[0].length : 0;
    if(m && zs == l.length)
      return 'A'+[...Array(zs)].map(l=>'A').join('');
    else
      return l.substr(0, l.length-zs-1) + String.fromCharCode(l.charCodeAt(l.length-zs-1)+1) + [...Array(zs)].map(l=>'A').join('');
  };

  const clone = async function(widget, recursive, newParent, xOffset, yOffset) {
    let currentWidget = JSON.parse(JSON.stringify(widget.state))

    if(inheritFrom) {
      const inheritAll = JSON.stringify(inheritProperties) == '[""]';
      const inheritWidget = {};
      inheritWidget['inheritFrom'] = {};
      inheritWidget['inheritFrom'][widget.get('id')] = inheritAll ? "*" : inheritProperties;

      // Copy properties from source to new object unless inheritAll is set or the property is in the inherit list.
      for(const key of Object.keys(currentWidget))
        if(currentWidget[key] != undefined && (['id','type','deck','cardType'].includes(key) || !(inheritAll || inheritProperties.includes(key))))
          inheritWidget[key] = currentWidget[key];
      currentWidget = inheritWidget;
    }

    if(incrementKind) {
      let match = currentWidget.id.match(/^(.*?)([0-9]+)([^0-9]*)$/);
      let sourceNumber = match ? parseInt(match[2]) : 0;
      if(incrementKind=='Letters') {
        match = currentWidget.id.match(/^(.*?)([A-Z]+)([^A-Z]*)$/);
        sourceNumber = match ? match[2] : "@"; // If no caps, insert A, which is @+1.
      }
      let targetNumber = sourceNumber;
      const idHead = match ? match[1] : widget.id;
      const idTail = match && match[3] ? match[3] : '';
      while(widgets.has(currentWidget.id)) {
        if(incrementKind=='Letters') {
          targetNumber = incrementCaps(targetNumber);
          currentWidget.id = `${idHead}${targetNumber}${idTail}`;
        } else
          currentWidget.id = `${idHead}${++targetNumber}${idTail}`;
      }
      for(const property of incrementIn) {
        if(property == 'index' && widget.state.type == 'seat' && widget.state.index === undefined)
          currentWidget.index = 1;
        if(currentWidget[property] !== undefined && (property != 'inheritFrom' || !inheritFrom)) // Don't change inheritFrom if it was just added to new widget
          currentWidget[property] = JSON.parse(JSON.stringify(currentWidget[property]).replaceAll(sourceNumber, targetNumber));
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

    if(currentWidget.parent && !widgets.has(currentWidget.parent)) {
      if(Array.isArray(problems))
        problems.push(`Could not add duplicate of widget ${widget.id} to non-existent parent ${currentWidget.parent}.`);
    } else if(currentWidget.type == 'card' && !widgets.has(currentWidget.deck)) {
      if(Array.isArray(problems))
        problems.push(`Could not add duplicate of card ${widget.id} with non-existent deck ${currentWidget.deck}.`);
    } else if(currentWidget.type == 'card' && !widgets.get(currentWidget.deck).get('cardTypes')[currentWidget.cardType]) {
      if(Array.isArray(problems))
        problems.push(`Could not add duplicate of card ${widget.id} with non-existent cardType ${currentWidget.cardType}.`);
    } else {
      const currentId = await addWidgetLocal(currentWidget);

      if(recursive)
        for(const child of widgetFilter(w=>w.get('parent')==widget.id))
          await clone(child, true, currentId, 0, 0);

      if(currentId)
        return currentWidget;
    }
  };

  const gridX = xCopies + 1;
  const gridY = yCopies + 1;
  for(let i=1; i<gridX*gridY; ++i) {
    let x = xOffset*(i%gridX);
    let y = yOffset*Math.floor(i/gridX);
    if(xCopies + yCopies == 1) { // If just one copy, use both offsets as given.
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
  await duplicateWidget(widget, true, false, [], 'Numbers', [], xOffset, yOffset, 1, 0);
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
    const id = await addWidgetLocal({
      type: 'seat',
      index: seats.length && maxIndex ? maxIndex+1 : 1,
      x: 840,
      y: 90
    })
    overlayDone(id);
  });

  on('#addSeatCounter', 'click', async function() {
    const seats = widgetFilter(w=>w.get('type')=='seat');
    const maxIndex = Math.max(...seats.map(w=>w.get('index')));
    const id = await addWidgetLocal({
      type: 'seat',
      index: seats.length && maxIndex ? maxIndex+1 : 1,
      x: 840,
      y: 90
    })
    await addWidgetLocal({
      id: id+'C',
      parent: id,
      fixedParent: true,
      x: -20,
      y: -20,
      width: 30,
      height: 30,
      borderRadius: 100,
      movable: false,
      movableInEdit: false,
      clickable: false,
      css: {'font-size':'18px', 'display':'flex','align-items':'center','justify-content':'center','color':'#6d6d6d','background':'#e4e4e4','border':'2px solid #999999'},
      text: '0',
      ownerGlobalUpdateRoutine: [
        'var parent = ${PROPERTY parent}',
        "var COUNT = 0",
        {
          "func": "COUNT",
          "holder": "${PROPERTY hand OF $parent}",
          "owner": "${PROPERTY player OF $parent}"
        },
        {
          "func": "SET",
          "collection": "thisButton",
          "property": "text",
          "value": "${COUNT}"
        }
      ],
      playerGlobalUpdateRoutine: [
        {
          "func": "CALL",
          "routine": "ownerGlobalUpdateRoutine",
          "widget": "${PROPERTY id}"
        }
      ]
    });
    overlayDone(id);
  });

  on('#addScoreboard', 'click', async function() {
    await addWidgetLocal({
      type: 'scoreboard',
      x: 1000,
      y:660
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
