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
    [
      {label:'1J', color: "🃏", suit: "T", alternating:"5J", rank: "J1", imageName: "1J"},
      {label:'2J', color: "🃏", suit: "T", alternating:"5J", rank: "J2", imageName: "2J"},
      {label:'3J', color: "🃏", suit: "T", alternating:"5J", rank: "J3", imageName: "3J"},
      {label:'4J', color: "🃏", suit: "T", alternating:"5J", rank: "J4", imageName: "4J"}
    ].forEach(c=>types[c.suit+" "+c.label] = { image:`/i/cards-default/${c.imageName}.svg`, suit:c.suit, suitColor:c.color, suitAlt:c.alternating, rank:c.rank, rankA:c.rank, rankFixed:c.rank+" "+c.suit});

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

function generateChipPileWidgets(id, x, y, type) {
  const widgets = [
    { type:'holder', id, x, y, width: 81,
      height: type==2 ? 81 : 54, borderRadius: "100%", dropOffsetY: type==2 ? 4 : -6, dropTarget: { classes: type==2 ? 'pokerChip' : 'pokerChip3D' } },
    {
      type: 'button',
      id: id+'B',
      parent: id,
      fixedParent: true,
      y: type==2 ? 83: 56,
      width: 81,
      height: 35,
      movableInEdit: false,
      classes: 'symbols',
      css: { 'font-size': '30px' },
      text: 'recallsort_ascending',

      clickRoutine: [
        { func: 'RECALL', holder: '${PROPERTY parent}' },
        { func: 'SORT', holder: '${PROPERTY parent}', reverse: true }
      ]
    },
    { type:'pile',
      id: id+'P',
      parent: id,
      width:73,
      height:73,
      y: type==2 ? 4 : -6,
      text: 1641,
      enterRoutine: [
        {
          func: "GET",
          property: "value",
          collection: "child",
          aggregation: "sum",
          variable: "value"
        },
        {
          func: "SET",
          property: "text",
          collection: "thisButton",
          relation: "+",
          value: "\${value}"
        }
      ],
      leaveRoutine: [
        {
          func: "GET",
          property: "value",
          collection: "child",
          aggregation: "sum",
          variable: "value"
        },
        {
          func: "SET",
          property: "text",
          collection: "thisButton",
          relation: "-",
          value: "\${value}"
        }
      ]
    },
    { type: 'deck',
      id: id+'D',
      parent: id,
      x: -2,
      y: -2,
      scale: 0.5,
      cardDefaults: {
        classes: type==2 ? 'pokerChip' : 'pokerChip3D',
        width: 73,
        height: 73,
        onPileCreation: {
          text: 0,
          enterRoutine: [
            {
              func: "GET",
              property: "value",
              collection: "child",
              aggregation: "sum",
              variable: "value"
            },
            {
              func: "SET",
              property: "text",
              collection: "thisButton",
              relation: "+",
              value: "\${value}"
            }
          ],
          leaveRoutine: [
            {
              func: "GET",
              property: "value",
              collection: "child",
              aggregation: "sum",
              variable: "value"
            },
            {
              func: "SET",
              property: "text",
              collection: "thisButton",
              relation: "-",
              value: "\${value}"
            }
          ]
        }
      },
      cardTypes: {
        1: { value: 1, accentColor1: "#808080", accentColor2: "#add8e6", borderColor: "#000000", borderWidth: 2, labelColor: "#d3d3d3", primaryColor: "#ffffff"
        },
        5: { value: 5, accentColor1: "#ffffff", accentColor2: "#ffff00", borderColor: "#000000", borderWidth: 2, labelColor: "#ed8080", primaryColor: "#ff0000"
        },
        10: { value: 10, accentColor1: "#ffffff", accentColor2: "#87ceeb", borderColor: "#000000", borderWidth: 2, labelColor: "#b0c4de", primaryColor: "#000080"
        },
        25: { value: 25, accentColor1: "#ffffff", accentColor2: "#000000", borderColor: "#000000", borderWidth: 2, labelColor: "#22ba22", primaryColor: "#008000"
        },
        100: { value: 100, accentColor1: "#ffffff", accentColor2: "#ffc0cb", borderColor: "#000000", borderWidth: 2, labelColor: "#ee82ee", primaryColor: "#4b0082"
        },
        500: { value: 500, accentColor1: "#ffffff", accentColor2: "#808080", borderColor: "#000000", borderWidth: 2, labelColor: "#a9a9a9", primaryColor: "#000000"
        },
        1000: { value: 1000, accentColor1: "#ff0000", accentColor2: "#daa520", borderColor: "#000000", borderWidth: 2, labelColor: "#ffff00", primaryColor: "#ffd700"
        }
      },
      faceTemplates: [
        {
          border: false,
          radius: false,
          objects: [
            {
              css: type==2 ? "font-size:1.5rem" : "font-size:1.3rem",
              type: "image",
              x: 0,
              y: 0,
              width: 73,
              height: 73,
              color: "transparent",
              value: type==2 ? "i/game-pieces/2D/Poker-2D.svg" : "i/game-pieces/3D/Poker-3D.svg",
              dynamicProperties: { accentColor1: "accentColor1", accentColor2: "accentColor2", borderColor: "borderColor", borderWidth: "borderWidth", labelColor: "labelColor", primaryColor: "primaryColor"
              },
              svgReplaces: { "#accentColor1": "accentColor1", "#accentColor2": "accentColor2", "#borderColor": "borderColor", "#borderWidth": "borderWidth", "#labelColor": "labelColor", "#primaryColor": "primaryColor"
              }
            },
            {
              type: "text",
              x: 0,
              y: 26,
              fontSize: 22,
              textAlign: "center",
              width: 73,
              dynamicProperties: {
                value: "value"
              },
              css: "color: #222222;"
            }
          ]
        }
      ]
    }
  ];

  for (const value of [1000, 500, 100, 25, 10, 5, 1]) {
    widgets.push({ type: "card", id: `${id}C${value}`, parent: id + 'P', deck: id + 'D', cardType: value, x:0, y:0})
  }

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
        setDeltaCause(`${getPlayerDetails().playerName} added new ${wi.type || 'basic widget'} in editor: ${w.id}`);
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
      toAdd.color = result.variables.color;

      const id = await addWidgetLocal(toAdd);
      overlayDone(id);
    } catch(e) {
      console.log(e);
    }
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
  if(getEdit())
    setSelection([ widgets.get(id) ]);
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
    x: 390,
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
    x: 390+75,
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
    x: 390+2*75,
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
    x: 390+3*75,
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
    x: 445,
    y: 190,
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
    x: 445+100,
    y: 200,
    width: 75,
    height: 54.75,

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
    x: 450,
    y: 303,
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
    x: 450+100,
    y: 300,
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
    x: 450,
    y: 412,
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
    x: 450+100,
    y: 408,
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
    x: 390,
    y: 494,
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
    x: 490,
    y: 507,
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
    x: 610,
    y: 480,
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

   //Sixth row (hexagons)

   addPieceToAddWidgetOverlay(new BasicWidget('HexFlat'), {
    x: 390,
    y: 600,
    width: 50,
    height: 50,
    color: VTTblue,
    image: "i/game-pieces/2D/Hex-Flat.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },
    borderColor: "#000000",
    borderWidth: 2,
    hexType: "flat"
  });

  addPieceToAddWidgetOverlay(new BasicWidget('HexPoint'), {
    x: 465,
    y: 600,
    width: 50,
    height: 50,
    color: VTTblue,
    image: "i/game-pieces/2D/Hex-Point.svg",
    svgReplaces: {
      "#primaryColor": "color",
      "#borderColor": "borderColor",
      "#borderWidth": "borderWidth"
    },
    borderColor: "#000000",
    borderWidth: 2,
    hexType: "point"
  });

  //This is added only to provide a visual background for the actual piece "HexFlatImage" since the css there does not show on the overlay

  addPieceToAddWidgetOverlay(new BasicWidget('HexFlatImageBack'), {
    x: 530,
    y: 590,
    width: 70,
    height: 70,
    color: VTTblue,
    image: "i/icons/hexagon_horizontal.svg",
    svgReplaces: {
      "currentColor": "color"
    }
  });

  addPieceToAddWidgetOverlay(new BasicWidget('HexFlatImage'), {
    x: 540,
    y: 600,
    width: 50,
    height: 50,
    imageColor: '#ffffff',
    image: "i/icons/zoom_in.svg",
    svgReplaces: {
      "currentColor": "imageColor"
    },
    css: {
      "default": {
        "background-color": "${PROPERTY color}",
        "background-image": "url('${PROPERTY image}')",
        "background-size": "75% 75%",
        "background-repeat": "no-repeat",
        "background-position": "center center",
        "clip-path": "polygon(25% 6.67%, 75% 6.67%, 100% 50%, 75% 93.33%, 25% 93.33%, 0% 50%)"
      }
    },
    hexType: "flat"
  });

  //This is added only to provide a visual background for the actual piece "HexPointImage" since the css there does not show on the overlay

  addPieceToAddWidgetOverlay(new BasicWidget('HexFlatImageBack'), {
    x: 605,
    y: 590,
    width: 70,
    height: 70,
    color: VTTblue,
    image: "i/icons/hexagon_vertical.svg",
    svgReplaces: {
      "currentColor": "color"
    }
  });

  addPieceToAddWidgetOverlay(new BasicWidget('HexPointImage'), {
    x: 615,
    y: 600,
    width: 50,
    height: 50,
    imageColor: '#ffffff',
    image: "i/icons/zoom_out.svg",
    svgReplaces: {
      "currentColor": "imageColor"
    },
    css: {
      "default": {
        "background-color": "${PROPERTY color}",
        "background-image": "url('${PROPERTY image}')",
        "background-size": "75% 75%",
        "background-repeat": "no-repeat",
        "background-position": "center center",
        "clip-path": "polygon(93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%, 50% 0%)"
      }
    },
    hexType: "point"
  });

  //Poker chips

  addWidgetToAddWidgetOverlay(new BasicWidget('EmptyPoker2DSVG'), {
    x: 920,
    y: 114,
    width: 73,
    height: 73,

    classes: "pokerChip",
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
    y: 207,
    width: 73,
    height: 73,

    classes: "pokerChip",
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

  addCompositeWidgetToAddWidgetOverlay(generateChipPileWidgets('add-2D-chips', 916, 300, 2), async function() {
    const id = generateUniqueWidgetID();
    for(const w of generateChipPileWidgets(id, 916, 300, 2))
      await addWidgetLocal(w);
    return id
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('EmptyPoker3DSVG'), {
    x: 1010,
    y: 123,
    width: 75,
    height: 54.75,

    classes: "pokerChip3D",
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

  addWidgetToAddWidgetOverlay(new BasicWidget('DealerPoker3DSVG'), {
    x: 1010,
    y: 216,
    width: 75,
    height: 54.75,

    classes: "pokerChip3D",
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

  addCompositeWidgetToAddWidgetOverlay(generateChipPileWidgets('add-3D-chips', 1010, 309, 3), async function() {
    const id = generateUniqueWidgetID();
    for(const w of generateChipPileWidgets(id, 1010, 309, 3))
      await addWidgetLocal(w);
    return id
  });

  // Populate the dice. The real dice choosing happens in a popup.
  const dice2D = new Dice('add-dice2D0');
  const dice2DAttrs = {
    type: 'dice',
    x: 930,
    y: 455
  };
  dice2D.applyInitialDelta(dice2DAttrs);
  dice2D.domElement.addEventListener('click', async _=>{
    try {
      const result = await dice2D.showInputOverlay({
        header: 'Choose number of sides',
        fields: [
          {
            type: 'number',
            label: 'Sides',
            value: 6,
            variable: 'sides',
            min: 2
          }
        ]
      });
      const sides = result.variables.sides;
      const toAdd = {...dice2DAttrs};
      toAdd.z = getMaxZ(dice2D.get('layer')) + 1;
      toAdd.faces = Array.from({length: sides}, (_, i) => i + 1);
      if(sides != 6)
        toAdd.pipSymbols = false;

      const id = await addWidgetLocal(toAdd);
      overlayDone(id);
    } catch(e) {}
  });
  dice2D.domElement.id = dice2D.id;
  $('#addOverlay').appendChild(dice2D.domElement);

  const dice2DCube = new Dice('add-dice2DCube0');
  const dice2DCubeAttrs = {
    type: 'dice',
    x: 930,
    y: 525,
    faces: [
      {value:1,image:"/i/dice/cube-1-1.svg"},
      {value:1,image:"/i/dice/cube-1-2.svg"},
      {value:1,image:"/i/dice/cube-1-3.svg"},
      {value:1,image:"/i/dice/cube-1-4.svg"},
      {value:2,image:"/i/dice/cube-2-1.svg"},
      {value:2,image:"/i/dice/cube-2-2.svg"},
      {value:2,image:"/i/dice/cube-2-3.svg"},
      {value:2,image:"/i/dice/cube-2-4.svg"},
      {value:3,image:"/i/dice/cube-3-1.svg"},
      {value:3,image:"/i/dice/cube-3-2.svg"},
      {value:3,image:"/i/dice/cube-3-3.svg"},
      {value:3,image:"/i/dice/cube-3-4.svg"},
      {value:4,image:"/i/dice/cube-4-1.svg"},
      {value:4,image:"/i/dice/cube-4-2.svg"},
      {value:4,image:"/i/dice/cube-4-3.svg"},
      {value:4,image:"/i/dice/cube-4-4.svg"},
      {value:5,image:"/i/dice/cube-5-1.svg"},
      {value:5,image:"/i/dice/cube-5-2.svg"},
      {value:5,image:"/i/dice/cube-5-3.svg"},
      {value:5,image:"/i/dice/cube-5-4.svg"},
      {value:6,image:"/i/dice/cube-6-1.svg"},
      {value:6,image:"/i/dice/cube-6-2.svg"},
      {value:6,image:"/i/dice/cube-6-3.svg"},
      {value:6,image:"/i/dice/cube-6-4.svg"}
    ],
    imageScale: 1,
    color: 'transparent',
    borderColor: 'transparent',
    svgReplaces: {
      'topColor': 'cT',
      'leftColor': 'cL',
      'rightColor': 'cR',
      'pipColor': 'cP'
    },
    cT: '#ffffff',
    cL: '#e8e8e8',
    cR: '#dbdbdb',
    cP: '#000000'
  };
  dice2DCube.applyInitialDelta(dice2DCubeAttrs);
  dice2DCube.domElement.addEventListener('click', async _=>{
    try {
      const result = await dice2DCube.showInputOverlay({
        header: 'Choose die color',
        fields: [
          {
            type: 'color',
            value: '#ffffff',
            variable: 'color'
          }
        ]
      });
      const toAdd = {...dice2DCubeAttrs};
      toAdd.z = getMaxZ(dice2DCube.get('layer')) + 1;
      toAdd.cT = result.variables.color;
      toAdd.cL = contrastAnyColor(result.variables.color, 0.2);
      toAdd.cR = contrastAnyColor(result.variables.color, 0.4);
      toAdd.cP = contrastAnyColor(result.variables.color, 1);

      const id = await addWidgetLocal(toAdd);
      overlayDone(id);
    } catch(e) {}
  });
  dice2DCube.domElement.id = dice2DCube.id;
  $('#addOverlay').appendChild(dice2DCube.domElement);

  const dice3D = new Dice('add-dice3D0');
  const dice3DAttrs = {
    type: 'dice',
    x: 1020,
    y: 455,
    shape3d: true,
    faces: ['1','2','3','4','5','6','7','8']
  };
  dice3D.applyInitialDelta(dice3DAttrs);
  dice3D.domElement.addEventListener('click', async _=>{
    try {
      const result = await dice3D.showInputOverlay({
        header: 'Choose number of sides',
        fields: [
          {
            type: 'number',
            select: 'Sides',
            value: 8,
            variable: 'sides',
            min: 2
          }
        ]
      });
      const sides = result.variables.sides;
      const toAdd = {...dice3DAttrs};
      toAdd.z = getMaxZ(dice3D.get('layer')) + 1;
      toAdd.faces = Array.from({length: sides}, (_, i) => i + 1);
      if(sides != 6)
        toAdd.pipSymbols = false;
      toAdd.shape3d = sides == 2 ? 'd2-flip' : true;
      const id = await addWidgetLocal(toAdd);
      overlayDone(id);
    } catch(e) {}
  });
  dice3D.domElement.id = dice3D.id;
  $('#addOverlay').appendChild(dice3D.domElement);

  // Populate the Interactive panel in the add widget overlay.
  // Note that the Add Canvas, Add Seat, and Add Scoreboard buttons are in room.html.

  // Populate the spinners. The real spinner choosing happens in a popup.
  const spinner = new Spinner('add-spinner0');
  const spinAttrs = {
    type: 'spinner',
    value: 6,
    options: Array.from({length: 6}, (_, i) => i + 1),
    x: 450,
    y: 835
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
      const values = result.variables.values;
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
    y: 860
  });

  // Add the composite timer widget
  addCompositeWidgetToAddWidgetOverlay(generateTimerWidgets('add-timer', 1005, 825), async function() {
    const id = generateUniqueWidgetID();
    for(const w of generateTimerWidgets(id, 1005, 825))
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
    borderRadius: "3px",

    css: { "border": "3px solid #666" }
  });

  addWidgetToAddWidgetOverlay(new BasicWidget('LineHorizontal'), {
    x: 1535,
    y: 190,
    width: 0,
    height: 200,
    borderRadius: "3px",

    css: { "border": "3px solid #666" }
  });
}
// end of JSON generators

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
    setDeltaCause(`${getPlayerDetails().playerName} updated ${widget.id} in editor`);
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

  if(widget.id !== previousState.id) {
    await updateWidgetId(widget, previousState.id);
  } else if (widget.type !== previousState.type) {
    await removeWidgetLocal(previousState.id, true);
    const id = await addWidgetLocal(widget);

    // Handle special case where type is removed
    if(widget.type === undefined)
      sendPropertyUpdate(id, 'type', null);
  } else {
    for(const key in previousState)
      if(widget[key] === undefined)
        widget[key] = null;
    for(const key in widget) {
      if(widget[key] !== previousState[key] && JSON.stringify(widget[key]) !== JSON.stringify(previousState[key])) {
        widgets.get(widget.id).state[key] = widget[key];
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

      const clonedWidgets = [ widgets.get(currentId) ];
      if(recursive)
        for(const child of widgetFilter(w=>w.get('parent')==widget.id))
          clonedWidgets.push(...await clone(child, true, currentId, 0, 0));

      return clonedWidgets;
    }
  };

  const gridX = xCopies + 1;
  const gridY = yCopies + 1;
  const clonedWidgets = [];
  for(let i=1; i<gridX*gridY; ++i) {
    let x = xOffset*(i%gridX);
    let y = yOffset*Math.floor(i/gridX);
    if(xCopies + yCopies == 1) { // If just one copy, use both offsets as given.
      x = xOffset;
      y = yOffset;
    }
    clonedWidgets.push(...await clone(widget, recursive, false, x, y));
  }
  return clonedWidgets;
}

export function initializeEditMode(currentMetaData) {
  const div = document.createElement('div');
  div.innerHTML = ' //*** HTML ***// ';
  $('body').append(div);

  const style = document.createElement('style');
  style.appendChild(document.createTextNode(' //*** CSS ***// '));
  $('head').appendChild(style);

  for(const overlay of $a('#editorOverlays > *'))
    $('#roomArea').append(overlay);

  jeInitEventListeners();
  initializeTraceViewer();
  initializeEditor(currentMetaData);

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
      dropShadow: true,
      hidePlayerCursors: true,
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
          "func": "SELECT",
          "property": "_ancestor",
          "value": "${PROPERTY hand OF $parent}"
        },
        {
          "func": "COUNT",
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

  populateAddWidgetOverlay();
};
