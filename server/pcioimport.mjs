import fs from 'fs';
import JSZip from 'jszip';

import Config from './config.mjs';

const pieceColors = {
  default: '#000000',
  black:   '#4a4a4a',
  blue:    '#4c5fea',
  purple:  '#bc5bee',
  red:     '#e84242',
  yellow:  '#e0cb0b',
  green:   '#23ca5b',
  orange:  '#e2a633',
  white:   '#ffffff'
};

export default async function convertPCIO(content) {
  const zip = await JSZip.loadAsync(content);
  const widgets = JSON.parse(await zip.files['widgets.json'].async('string'));

  const nameMap = {};
  try {
    // created by the client while removing already uploaded assets
    for(const [ k, v ] of Object.entries(JSON.parse(await zip.files['asset-map.json'].async('string'))))
      nameMap[`package://${v}`] = `/assets/${k}`;
  } catch(e) {}

  for(const filename in zip.files) {
    if(filename.match(/^\/?userassets/) && zip.files[filename]._data && zip.files[filename]._data.uncompressedSize < 2097152) {
      const targetFile = zip.files[filename]._data.crc32 + '_' + zip.files[filename]._data.uncompressedSize;
      nameMap['package://' + filename] = '/assets/' + targetFile;
      if(!Config.resolveAsset(targetFile))
        fs.writeFileSync(Config.directory('assets') + '/' + targetFile, await zip.files[filename].async('nodebuffer'));
    }
  }

  function mapName(name) {
    if(name.match(/^\/img\//)) {
      name = 'https://playingcards.io' + name;

      name = name.replace(/https:\/\/playingcards\.io\/img\/cardback.*blue.svg/,                      '/i/cards-default/1B.svg');
      name = name.replace(/https:\/\/playingcards\.io\/img\/cardback.*red.svg/,                       '/i/cards-default/2B.svg');
      name = name.replace(/https:\/\/playingcards\.io\/img\/cards(?:-french)?\/joker-black.svg/,      '/i/cards-default/2J.svg');
      name = name.replace(/https:\/\/playingcards\.io\/img\/cards(?:-french)?\/joker-(red|blue).svg/, '/i/cards-default/1J.svg');

      const regex = /https:\/\/playingcards\.io\/img\/cards(?:-french)?\/(hearts|spades|diamonds|clubs)-([2-9jqka]|10).svg/;
      const match = regex.exec(name);
      if(match) {
        const face = match[2].toUpperCase().replace(/10/, "T");
        const suit = match[1][0].toUpperCase();
        name = `/i/cards-default/${face}${suit}.svg`;
      }
    }
    return nameMap[name] || name;
  }

  function addDimensions(w, widget, defaultWidth=100, defaultHeight=100) {
    if(widget.width != defaultWidth && widget.width !== undefined)
      w.width = widget.width;
    if(widget.height != defaultHeight && widget.height !== undefined)
      w.height = widget.height;
  }

  function importWidgetQuery(routine, args, legacySource, holdersParam, collectionParam, target) {
    if(args.objects) {
      if(args.objects.type == 'reference') {
        target[collectionParam] = args.objects.questionId;
      } else if(args.objects.collections && args.objects.collections.length) {
        routine.push({
          func: 'SELECT',
          property: 'parent',
          relation: 'in',
          value: args.objects.holders,
          type: 'card'
        });
        routine.push({
          func: 'SELECT',
          source: 'DEFAULT',
          property: 'deck',
          relation: 'in',
          value: args.objects.collections
        });
      } else {
        target[holdersParam] = args.objects.holders;
      }
    } else {
      target[holdersParam] = args[legacySource].value;
    }
    return target;
  }

  const pileHasDeck = {};
  const pileOverlaps = {};
  const pileTransparent = {};

  for(const widget of widgets) {
    if(widget.type == 'cardDeck' && widget.parent)
      pileHasDeck[widget.parent] = widget;

    if(widget.type == 'cardPile' || widget.type == 'hand') {
      const x1 = widget.x      || 0;
      const y1 = widget.y      || 0;
      const w1 = widget.width  || (widget.type == 'hand' ? 1500 : 111);
      const h1 = widget.height || (widget.type == 'hand' ?  180 : 168);
      for(const wi2 of widgets) {
        if((wi2.type == 'cardPile' || wi2.type == 'board') && widget.id != wi2.id) {
          const x2 = wi2.x      || 0;
          const y2 = wi2.y      || 0;
          const w2 = wi2.width  || 111;
          const h2 = wi2.height || 168;
          if(!(y1+h1 <= y2 || y1 >= y2+h2 || x1+w1 <= x2 || x1 >= x2+w2)) {
            if(wi2.type == 'board') {
              const factor = widget.type == 'hand' ? 1.5 : 3;
              if(wi2.z*factor < widget.z)
                pileTransparent[widget.id] = true;
            } else if(widget.type == 'cardPile') {
              pileOverlaps[widget.id] = true;
              pileOverlaps[wi2.id] = true;
            }
          }
        }
      }
    }
  }

  const byID = {};
  for(const widget of widgets)
    byID[widget.id] = widget;

  const cardsPerCoordinates = {};
  for(const widget of widgets) {
    if(widget.type == 'card' || widget.type == 'piece') {
      const index = widget.x + ',' + widget.y + ',' + (widget.parent || "") + ',' + (widget.owner || "");
      if(!widget.parent || !byID[widget.parent] || !byID[widget.parent].hideStackTab)
        cardsPerCoordinates[index] = (cardsPerCoordinates[index] || 0) + 1;
    }
  }

  const output = {
    _meta: {
      info: {
        importerTemp: 'PCIO',
        importerTime: +new Date()
      },
      version: 4
    }
  };

  const piles = {};
  for(const coord in cardsPerCoordinates) {
    if(cardsPerCoordinates[coord] > 1) {
      const id = Math.random().toString(36).substring(3, 7);
      output[id] = piles[coord] = {
        id,
        type: 'pile',
        x: +coord.replace(/,.*/, ''),
        y: +coord.replace(/.*?,/, '').replace(/,.*/, '')
      };
    }
  }

  for(const widget of widgets) {
    const w = {};

    w.id = widget.id;
    if(widget.x)
      w.x = widget.x;
    if(widget.y)
      w.y = widget.y;
    if(widget.z)
      w.z = widget.z;
    if(widget.r)
      w.rotation = widget.r;

    if(widget.linkedSeat && byID[widget.linkedSeat])
      w.linkedToSeat = widget.linkedSeat;

    if(widget.parent && !byID[widget.parent])
      widget.parent = null;

    if(widget.parent) {
      w.x = (w.x || 0) - (byID[widget.parent].x || 0);
      w.y = (w.y || 0) - (byID[widget.parent].y || 0);
    }

    if(widget.type == 'gamePiece' && widget.pieceType == 'checkers') {
      w.width  = 73.5;
      w.height = 73.5;
      w.x = (w.x || 0) + 8.25;
      w.y = (w.y || 0) + 8.25;
      w.faces = [
        { classes: 'checkersPiece' },
        { classes: 'checkersPiece crowned' }
      ];
      w.color = pieceColors[widget.color] || pieceColors.default;
      if(widget.kinged)
        w.activeFace = 1;
    } else if(widget.type == 'gamePiece' && widget.pieceType == 'classic') {
      w.width  = 90;
      w.height = 90;
      w.classes = 'classicPiece';
      w.color = pieceColors[widget.color] || pieceColors.default;
    } else if(widget.type == 'gamePiece' && widget.pieceType == 'pin') {
      w.width  = 35.85;
      w.height = 43.83;
      w.classes = 'pinPiece';
      w.color = pieceColors[widget.color] || pieceColors.default;
    } else if(widget.type == 'gamePiece') {
      w.image = `https://playingcards.io/img/pieces/${widget.color}-${widget.pieceType}.svg`;
      addDimensions(w, widget);
    } else if(widget.type == 'dice') {
      w.type = 'dice';
    } else if(widget.type == 'hand') {
      if(widget.enabled === false)
        continue;
      w.type = 'holder';
      w.onEnter = { activeFace: 1 };
      w.onLeave = { activeFace: 0 };
      if(pileTransparent[w.id])
        w.classes = 'transparent';
      if(widget.id == 'hand') {
        w.dropOffsetX = 6;
        w.dropOffsetY = 6;
        w.stackOffsetX = 40;
      } else {
        w.alignChildren = false;
      }
      w.inheritChildZ = true;
      w.childrenPerOwner = true;
      w.width = widget.width || 1500;
      w.height = widget.height || 180;
    } else if(widget.type == 'cardPile') {
      w.type = 'holder';
      if(pileTransparent[w.id])
        w.classes = 'transparent';
      addDimensions(w, widget, 111, 168);

      let dropOffsetX = 100;
      let dropOffsetY = 100;

      if(widget.allowedDecks) {
        w.dropTarget = widget.allowedDecks.map(d=>({deck:d}));
        if(pileHasDeck[widget.id] && widget.allowedDecks.indexOf(pileHasDeck[widget.id].id) == -1)
          w.dropTarget.push({ deck: pileHasDeck[widget.id].id });

        for(const allowed of w.dropTarget) {
          if(byID[allowed.deck]) {
            dropOffsetX = Math.round(Math.min(dropOffsetX, (widget.width  - (byID[allowed.deck].cardWidth  || 103))/2));
            dropOffsetY = Math.round(Math.min(dropOffsetY, (widget.height - (byID[allowed.deck].cardHeight || 160))/2));
          }
        }
      }
      if(widget.hideStackTab)
        w.preventPiles = true;
      if(widget.layoutType == 'freeform')
        w.alignChildren = false;

      if(widget.layoutType == 'spread') {
        if(widget.spreadDirection == 'down') {
          w.stackOffsetY = 168;
        } else if(widget.spreadDirection == 'up') {
          w.dropOffsetY = (w.height || 168) - 168;
          w.stackOffsetY = -168;
        } else if(widget.spreadDirection == 'left') {
          w.dropOffsetX = (w.width || 111) - 111;
          w.stackOffsetX = -111;
        } else {
          w.stackOffsetX = 111;
        }
      } else {
        if(dropOffsetX != 100)
          w.dropOffsetX = dropOffsetX;
        if(dropOffsetY != 100)
          w.dropOffsetY = dropOffsetY;

        if(pileOverlaps[w.id]) {
          w.x += 4;
          w.y += 4;
          w.width = (w.width || 111) - 8;
          w.height = (w.height || 168) - 8;
          w.dropOffsetX = 0;
          w.dropOffsetY = 0;
        }
      }

      if(widget.layoutType != 'spread' && widget.layoutType != 'freeform')
        w.inheritChildZ = true;

      if(widget.label) {
        output[widget.id + '_label'] = {
          id: widget.id + '_label',
          parent: widget.id,
          x: -(w.width || 111) * 0.1,
          y: -40,
          width: (w.width || 111) * 1.2,
          height: 40,
          type: 'label',
          text: widget.label,
          twoRowBottomAlign: true,
          movableInEdit: false
        };
        if(widget.allowPlayerEditLabel)
          output[widget.id + '_label'].editable = true;
      }

      if(widget.hasShuffleButton && pileHasDeck[widget.id]) {
        function recallConfirmation(cR) {
          if(pileHasDeck[widget.id].confirmRecall || pileHasDeck[widget.id].confirmRecallAll !== false) {
            cR[0].owned = '${owned}';
            cR.unshift({
              func: 'INPUT',
              header: 'Recalling cards...',
              fields: [
                {
                  type: 'text',
                  text: "You're about to recall all cards belonging into this holder. Are you sure?"
                },
                {
                  type: 'checkbox',
                  label: 'Recall player-owned cards',
                  variable: 'owned'
                }
              ]
            });
          }
          return cR;
        }

        output[widget.id + '_shuffleButton'] = {
          id: widget.id + '_shuffleButton',
          parent: widget.id,
          y: 1.02*(w.height || 168),
          width: w.width || 111,
          height: 32,
          type: 'button',
          text: w.width < 70 ? 'R&S' : 'Recall & Shuffle',
          movableInEdit: false,

          clickRoutine: recallConfirmation([
            { func: 'RECALL',  holder: widget.id },
            { func: 'FLIP',    holder: widget.id, face: 0 },
            { func: 'SHUFFLE', holder: widget.id }
          ])
        };
      }
    } else if(widget.type == 'cardDeck') {
      w.type = 'deck';
      if(widget.parent)
        w.parent = widget.parent;
      w.cardTypes = widget.cardTypes;
      w.faceTemplates = [];
      if(widget.backTemplate)
        w.faceTemplates.push(widget.backTemplate);
      if(widget.faceTemplate)
        w.faceTemplates.push(widget.faceTemplate);
      w.cardDefaults = {};
      if(widget.cardWidth && widget.cardWidth != 103)
        w.cardDefaults.width = widget.cardWidth;
      if(widget.cardHeight && widget.cardHeight != 160)
        w.cardDefaults.height = widget.cardHeight;
      if(widget.enlarge)
        w.cardDefaults.enlarge = 3;
      if(widget.cardOverlapH === 0)
        w.cardDefaults.overlap = false;
      if(widget.onRemoveFromHand === null)
        w.cardDefaults.ignoreOnLeave = true;

      for(const face of w.faceTemplates) {
        face.border = face.includeBorder ? 1 : false;
        face.radius = face.includeRadius ? 8 : false;
        delete face.includeBorder;
        delete face.includeRadius;
        for(const object of face.objects) {
          if(object.value)
            object.value = mapName(object.value);
          object.width = object.w;
          object.height = object.h;
          delete object.w;
          delete object.h;
        }
        face.objects.unshift({
          width:     w.cardDefaults.width  || 103,
          height:    w.cardDefaults.height || 160,
          type:      'image',
          color:     widget.collectionType == 'pieces' ? 'transparent' : 'white',
          valueType: 'static',
          value:     ''
        });
      }

      if(widget.collectionType == 'pieces') {
        for(const cardType of Object.values(w.cardTypes)) {
          for(const [ key, value ] of Object.entries(cardType)) {
            const pieceMatch = String(value).match(/^\/img\/pieces\/(pegs|pins|marbles|checkers|pucks|chips)\/(white|red|blue|green|black|purple|yellow|orange|peach|teal|pink|brown)(-kinged)?\.svg$/);
            if(pieceMatch) {
              const urls = {
                pegs:              '/i/game-pieces/3D/Pawn-3D.svg',
                pins:              '/i/game-pieces/3D/Pin-3D.svg',
                marbles:           '/i/game-pieces/3D/Marble-3D.svg',
                checkers:          '/i/game-pieces/2D/Checkers-2D.svg',
                'checkers-kinged': '/i/game-pieces/2D/Crowned-Checkers-2D.svg',
                pucks:             '/i/game-pieces/2D/Poker-2D.svg',
                chips:             '/i/game-pieces/2D/Poker-2D.svg'
              };
              const colors = {
                white:  '#dae0df',
                red:    '#ed1b43',
                blue:   '#5894f4',
                green:  '#69d83a',
                black:  '#666565',
                purple: '#9458f4',
                yellow: '#ffce00',
                orange: '#ff7b23',
                peach:  '#f2948c',
                teal:   '#2fd1cd',
                pink:   '#ff69b3',
                brown:  '#a8570e'
              };

              cardType[key] = urls[pieceMatch[1] + (pieceMatch[3] || '')];
              if(pieceMatch[1] == 'chips')
                cardType[`${key}LabelColor`] = '#fff8';
              if(pieceMatch[1] == 'pucks')
                cardType[`${key}LabelColor`] = colors[pieceMatch[2]];
              cardType[`${key}Color`] = colors[pieceMatch[2]];

              for(const faceTemplate of w.faceTemplates)
                for(const object of faceTemplate.objects)
                  if(object.valueType == 'dynamic' && object.value == key)
                    object.svgReplaces = { '#primaryColor': `${key}Color`, '#labelColor': `${key}LabelColor` };
            }
          }
        }
      }

      if(widget.collectionType == 'choosers') {
        const options = Object.values(w.cardTypes);
        const firstTemplate = JSON.parse(JSON.stringify(w.faceTemplates[0]));
        for(let i=0; i<options.length; ++i) {
          if(i)
            w.faceTemplates.push(JSON.parse(JSON.stringify(firstTemplate)));
          for(const object of w.faceTemplates[i].objects) {
            if(object.valueType == 'dynamic') {
              object.valueType = 'static';
              object.value = options[i][object.value] ? mapName(options[i][object.value]) : '';
            }
          }
        }
        w.cardTypes = { chooser: {} };
        w.cardDefaults.movable = false;
        w.cardDefaults.borderRadius = 12;
        w.cardDefaults.css = 'border: 4px solid #dedede';
        if(options.length > 2) {
          w.cardDefaults.clickRoutine = [
            {
              "func": "INPUT",
              "fields": [
                {
                  "type": "choose",
                  "source": [ "${PROPERTY id}" ],
                  "mode": "faces",
                  "variable": "face"
                }
              ]
            },
            {
              "func": "SET",
              "property": "activeFace",
              "value": "${face}"
            }
          ];
        }
      }

      let sortingOrder = 0;
      for(const type in w.cardTypes) {
        for(const key in w.cardTypes[type])
          w.cardTypes[type][key] = mapName(w.cardTypes[type][key]);
        w.cardTypes[type].sortingOrder = ++sortingOrder;
      }
    } else if(widget.type == 'card' || widget.type == 'piece' || widget.type == 'chooser') {
      if(!byID[widget.deck]) // orphan card without deck
        continue;

      w.type = 'card';
      w.deck = widget.deck;
      w.cardType = widget.type == 'chooser' ? 'chooser' : widget.cardType;

      if(pileOverlaps[widget.parent]) {
        w.x = (w.x || 0) - 4;
        w.y = (w.y || 0) - 4;
      }

      const pile = piles[widget.x + ',' + widget.y + ',' + (widget.parent || "") + ',' + (widget.owner || "")];
      if(pile) {
        pile.x = w.x;
        if(pile.x == 4)
          delete pile.x;
        pile.y = w.y;
        if(pile.y == 4)
          delete pile.y;
        pile.width = byID[w.deck].cardWidth || 103;
        pile.height = byID[w.deck].cardHeight || 160;
        pile.parent = widget.parent;

        delete w.x;
        delete w.y;
        w.parent = pile.id;
      } else if(widget.parent) {
        w.parent = widget.parent;
      }

      if(w.x === 0)
        delete w.x;
      if(w.y === 0)
        delete w.y;

      if(widget.faceup)
        w.activeFace = 1;
      if(widget.type == 'chooser' && widget.chooserChoice)
        w.activeFace = Object.keys(byID[widget.deck].cardTypes).indexOf(widget.chooserChoice);
      if(widget.owner)
        w.owner = widget.owner;
    } else if(widget.type == 'counter') {
      w.type = 'label';
      w.y += 5;
      w.width = widget.width || 140;
      w.height = widget.height || 44;
      w.css = 'font-size: 30px;';
      w.text = widget.counterValue;
      w.editable = true;

      function addCounterButton(suffix, x, text, value) {
        output[widget.id + suffix] = {
          id: widget.id + suffix,
          parent: widget.id,
          x: 4,
          y: -2,
          width: w.height - 8,
          height: w.height - 8,
          type: 'button',
          movableInEdit: false,
          text,

          clickRoutine: [
            { func: 'LABEL', label: widget.id, mode: 'inc', value }
          ]
        };
        if(x)
          output[widget.id + suffix].x += x;
      }
      addCounterButton('_decrementButton', 0,                  '-', -1);
      addCounterButton('_incrementButton', w.width - w.height, '+',  1);

      if(widget.label) {
        output[widget.id + 'label'] = {
          id: widget.id + 'label',
          parent: widget.id,
          movableInEdit: false,
          y: -28,
          width: w.width,
          type: 'label',
          text: widget.label
        };
      }
    } else if(widget.type == 'labelText') {
      const weight = widget.bold ? 'bold' : 'normal';
      w.type = 'label';
      w.text = widget.labelContent;
      w.css = {
        default: {
          'line-height': `${widget.textSize-2}px`,
          'font-size':   `${widget.textSize-2}px`,
          'font-weight': weight,
          'text-align':  widget.textAlign
        },
        ' textarea': {
          'letter-spacing': '-1px'
        }
      };
      addDimensions(w, widget, 100, 20);
      w.height = widget.textSize * 3.5;
    } else if(widget.type == 'separator') {
      w.movable = false;
      w.layer = -1;
      w.css = `background:#ddd`;
      if(widget.separatorType == 'horizontal') {
        w.width  = widget.width || 150;
        w.height = 1;
      } else {
        w.height = widget.height || 150;
        w.width  = 1;
      }
    } else if(widget.type == 'seat') {
      w.type = 'seat';
      w.display = 'seatIndex';
      w.displayEmpty = 'seatIndex';
      w.hideWhenUnused = true;
      if(typeof widget.seatIndex == 'number')
        w.index = widget.seatIndex + 1;
      w.x = (widget.x || 0) + 69;
      w.y = (widget.y || 0) - 38;
      w.height = 42;
      w.width = 42;
      w.css = 'box-sizing:border-box;border-width:2px;';
      w.borderRadius = '50%';
      w.playerChangeRoutine = [
        {
          func: 'SELECT',
          value: '${PROPERTY id}',
          type: 'button'
        },
        {
          func: 'SELECT',
          value: '${PROPERTY id}',
          collection: 'LABEL'
        },
        {
          func: 'SELECT',
          source: 'LABEL',
          property: 'TYPE',
          value: 'label',
          collection: 'LABEL'
        },
        {
          func: 'SELECT',
          value: '${PROPERTY id}',
          collection: 'COUNT'
        },
        {
          func: 'SELECT',
          source: 'COUNT',
          property: 'TYPE',
          value: 'count',
          collection: 'COUNT'
        },
        {
          func: 'IF',
          condition: '${value}',
          thenRoutine: [
            {
              func: 'SET',
              property: 'owner',
              value: []
            },
            {
              func: 'SET',
              collection: 'LABEL',
              property: 'text',
              value: '${playerName}'
            },
            {
              func: 'SET',
              collection: 'COUNT',
              property: 'owner'
            }
          ],
          elseRoutine: [
            {
              func: 'SET',
              property: 'owner'
            },
            {
              func: 'SET',
              collection: 'LABEL',
              property: 'text',
              value: 'Player ${PROPERTY index}'
            },
            {
              func: 'SET',
              collection: 'COUNT',
              property: 'owner',
              value: []
            }
          ]
        }
      ];

      const clickRoutine = [
        {
          func: 'SELECT',
          property: 'id',
          value: '${PROPERTY parent}'
        },
        {
          func: 'CLICK'
        }
      ];

      output[widget.id + 'label'] = {
        id: widget.id + 'label',
        parent: widget.id,
        x: -71,
        y: 36,
        layer: 0,
        height: 44,
        width: 180,
        movable: false,
        movableInEdit: false,
        TYPE: 'label',
        text: `Player ${widget.seatIndex + 1}`,
        css: 'background:white;border:1px solid lightgrey;font-size:18px;display: flex;justify-content: center;align-items: center;',
        borderRadius: '36%',
        clickRoutine
      };

      output[widget.id + 'sit'] = {
        id: widget.id + 'sit',
        type: 'button',
        parent: widget.id,
        x: -23.5,
        y: 74,
        layer: 1,
        height: 28,
        width: 85,
        movable: false,
        movableInEdit: false,
        text: 'Sit Here',
        css: 'background: white; color: black;font-size:16px; border:1px solid lightgrey',
        borderRadius: 4,
        clickRoutine
      };

      output[widget.id + 'count'] = {
        id: widget.id + 'count',
        parent: widget.id,
        x: -40,
        y: 2,
        layer: 3,
        height: 38,
        width: 30,
        movable: false,
        movableInEdit: false,
        owner: [],
        TYPE: 'count',
        text: 0,
        css: 'background: white; color: black;font-size:18px; border:1px solid lightgrey;display: flex;justify-content: center;align-items: center;',
        borderRadius: 4,
        clickRoutine,
        ownerGlobalUpdateRoutine: [
          "var parent = ${PROPERTY parent}",
          "var player = ${PROPERTY player OF $parent}",
          {
            func: 'SELECT',
            property: 'owner',
            value: '${player}'
          },
          {
            func: 'COUNT'
          },
          {
            func: 'SET',
            collection: 'thisButton',
            property: 'text',
            value: '${COUNT}'
          }
        ]
      };
      output[widget.id + 'count1'] = {
        id: widget.id + 'count1',
        parent: widget.id,
        x: -40,
        y: 2,
        layer: 2,
        height: 38,
        width: 30,
        rotation: -6,
        movable: false,
        movableInEdit: false,
        owner: [],
        TYPE: 'count',
        css: 'background: white; color: black;font-size:16px; border:1px solid lightgrey;transform-origin:bottom left',
        borderRadius: 4
      };
      output[widget.id + 'count2'] = {
        id: widget.id + 'count2',
        parent: widget.id,
        x: -40,
        y: 2,
        layer: 1,
        height: 38,
        width: 30,
        rotation: -12,
        movable: false,
        movableInEdit: false,
        owner: [],
        TYPE: 'count',
        css: 'background: white; border-radius: 4px; color: black;font-size:16px; border:1px solid lightgrey;transform-origin:bottom left',
        borderRadius: 4
      };
    } else if(widget.type == 'timer') {
      w.type = 'timer';
      w.clickable = false
      w.countdown = !widget.timerCountUp
      if (widget.timerCountUp) {
        w.end = widget.timerLength
        w.start = 0
      } else {
        w.start = widget.timerLength
        w.end = 0
      }
      w.milliseconds = widget.pauseTime||w.start
      var id = widget.id
      output[widget.id + 'P'] = {
        parent: id,
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
            timer: id
          }
        ],
        image: "/i/button-icons/White-Play_Pause.svg",
        css: "background-size: 75% 75%"
      };
      output[widget.id + 'R'] = {
        parent: id,
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
            timer: id,
            mode: "reset"
          }
        ],
        image: "/i/button-icons/White-Reset.svg",
        css: "background-size: 80% 80%"
      }
    } else if(widget.type == 'board') {
      w.image = widget.boardImage;
      w.movable = false;
      w.layer = -4;
      w.z = 10000 - w.z;
      addDimensions(w, widget);
    } else if(widget.type == 'automationButton' || widget.type == 'turnButton') {
      w.type = 'button';
      if(widget.label !== '')
        w.text = widget.label;

      if(widget.type == 'turnButton')
        widget.height = widget.width = 64;
      addDimensions(w, widget, 80, 80);

      w.clickRoutine = [];

      if(widget.clickRoutine && (widget.clickRoutine.popupMessage || widget.clickRoutine.questions)) {
        const popup = {
          func: 'INPUT',
          header: widget.clickRoutine.popupMessage,
          confirmButtonText: widget.label,
          fields: []
        };
        for(const question of widget.clickRoutine.questions || []) {
          if(question.type == 'number') {
            popup.fields.push({
              type: 'number',
              label: question.label,
              value: question.defaultValue,
              variable: question.id
            });
          }
          if(question.type == 'widgets') {
            popup.fields.push({
              type: 'choose',
              label: question.label,
              holder: question.holders.length == 1 ? question.holders[0] : question.holders,
              variable: question.id,
              max: question.widgetSelectionLimit || 99999,
              collection: question.id,
              propertyOverride: {
                activeFace: question.showWidgetSide == 'back' ? 0 : 1
              }
            });
          }
        }
        w.clickRoutine.push(popup);
      }

      if(widget.type == 'turnButton') {
        w.clickRoutine.push({
          func: 'TURN'
        });
      }

      for(let c of widget.clickRoutine ? (widget.clickRoutine.steps || widget.clickRoutine) : []) {
        if(c.func == 'MOVE_CARDS_BETWEEN_HOLDERS') {
          if((!c.args.from && !c.args.objects) || !c.args.to)
            continue;
          const moveFlip = c.args.moveFlip && c.args.moveFlip.value;

          let quantity = 1;
          if(c.args.quantity) {
            if(c.args.quantity.type == 'reference')
              quantity = '${' + c.args.quantity.questionId + '}';
            else if(c.args.quantity.value == 'all')
              quantity = 0;
            else
              quantity = c.args.quantity.value;
          }

          c = importWidgetQuery(w.clickRoutine, c.args, 'from', 'from', 'collection', {
            func:  'MOVE',
            count: quantity,
            to:    c.args.to.value,
            fillTo: c.args.fillAdd && c.args.fillAdd.value == 'fill' ? quantity : null
          });
          if(c.from && c.from.length == 1)
            c.from = c.from[0];
          if(c.count == 1)
            delete c.count;
          if(c.fillTo === null)
            delete c.fillTo;
          else
            delete c.count;
          if(c.to.length == 1)
            c.to = c.to[0];
          if(c.to == 'hand') {
            delete c.to;
            c.func = 'MOVEXY';
          }
          if(moveFlip && moveFlip != 'none')
            c.face = moveFlip == 'faceDown' ? 0 : 1;
        }
        if(c.func == 'RECALL_CARDS') {
          if(!c.args.decks)
            continue;

          for(const deckID of c.args.decks.value) {
            if(!byID[deckID].parent) {
              output.tempHolderForDeckRecall = {
                id: 'tempHolderForDeckRecall',
                type: 'holder',
                x: -200
              };
              w.clickRoutine.push({
                func: 'SELECT',
                property: 'deck',
                value: deckID
              });
              w.clickRoutine.push({
                func: 'SET',
                property: 'parent',
                value: 'tempHolderForDeckRecall'
              });
              w.clickRoutine.push({
                func: 'MOVEXY',
                from: 'tempHolderForDeckRecall',
                x: byID[deckID].x + (86-(byID[deckID].cardWidth ||103))/2,
                y: byID[deckID].y + (86-(byID[deckID].cardHeight||160))/2,
                count: 0
              });
            }
          }

          const holders = c.args.decks.value.map(d=>byID[d].parent).filter(d=>d);
          const flip = c.args.flip;
          c = {
            func:     'RECALL',
            holder:   holders,
            owned:      c.args.includeHands   && c.args.includeHands.value   == 'hands'  || false,
            inHolder: !(c.args.includeHolders && c.args.includeHolders.value == 'normal' || false)
          };
          if(c.holder.length == 1)
            c.holder = c.holder[0];
          if(c.owned)
            delete c.owned;
          if(c.inHolder)
            delete c.inHolder;
          if(!flip || flip.value != 'none') {
            w.clickRoutine.push(c);
            c = {
              func:   'FLIP',
              holder: holders,
              face:   flip && flip.value == 'faceUp' ? 1 : 0
            };
          }
        }
        if(c.func == 'SHUFFLE_CARDS') {
          if(!c.args.holders)
            continue;
          const holders = c.args.holders.value.map(id=>byID[id].type == 'seat' ? 'hand' : id);
          c = {
            func:   'SHUFFLE',
            holder: holders
          };
          if(c.holder.length == 1)
            c.holder = c.holder[0];
        }
        if(c.func == 'SORT_CARDS') {
          if(!c.args.sources)
            continue;
          const holders = c.args.sources.value.map(id=>byID[id].type == 'seat' ? 'hand' : id);
          c = {
            func:   'SORT',
            holder: holders,
            key:    'sortingOrder',
            reverse: !c.args.direction || c.args.direction.value != 'za'
          };
          if(c.holder.length == 1)
            c.holder = c.holder[0];
          if(!c.reverse)
            delete c.reverse;
        }
        if(c.func == "FLIP_CARDS") {
          if(!c.args.holders && !c.args.objects)
            continue;
          const flipFace = c.args.flipFace;


          c = importWidgetQuery(w.clickRoutine, c.args, 'holders', 'holder', 'collection', {
            func:   'FLIP',
            count:  !c.args.flipMode || c.args.flipMode.value != 'pile' ? 1 : 0
          });
          if(c.holder && c.holder.length == 1)
            c.holder = c.holder[0];
          if(!c.count)
            delete c.count;
          if(flipFace)
            c.face = flipFace.value == 'faceDown' ? 0 : 1;
        }
        if(c.func == 'CHANGE_TIMER_STATE') {
          if(!c.args.timers)
            continue;
          if ((c.args.playState && c.args.playState.value)=="switch"){
            var mode = "toggle"
          } else if ((c.args.playState && c.args.playState.value)=="pause"){
            var mode = "pause"
          } else {
            var mode = "start"
          };
          c = {
            func: 'TIMER',
            timer: c.args.timers.value,
            mode: mode
          };

          if(c.timer.length == 1)
            c.timer = c.timer[0];
        }
        if(c.func == 'CHANGE_TIMER_TIME') {
          if(!c.args.timers)
            continue;
          if ((c.args.changeType && c.args.changeType.value)=='add'){
            var mode = 'inc'
          } else if ((c.args.changeType && c.args.changeType.value)=='subtract'){
            var mode = 'dec'
          } else if ((c.args.changeType && c.args.changeType.value)=='set'){
            var mode = 'set'
          } else {
            var mode = 'reset'
          };
          c = {
            func: 'TIMER',
            timer: c.args.timers.value,
            mode: mode,
            seconds: c.args.seconds && c.args.seconds.value
          };
          if(c.timer.length == 1)
            c.timer = c.timer[0];
          if(c.seconds === undefined)
            c.seconds = 30;
          if(c.mode == 'reset' || c.seconds === 0)
            delete c.seconds;
        }
        if(c.func == 'CHANGE_COUNTER') {
          if(!c.args.counters)
            continue;
          c = {
            func: 'LABEL',
            label: c.args.counters.value,
            mode:  c.args.changeMode ? c.args.changeMode.value : 'set',
            value: c.args.changeNumber ? c.args.changeNumber.value : 0
          };
          if(c.label.length == 1)
            c.label = c.label[0];
          if(c.mode == 'set')
            delete c.mode;
          if(c.value === 0)
            delete c.value;
        }
        if(c.func == 'CHANGE_CHOOSER') {
          if(!c.args.choosers)
            continue;
          c = {
            func: 'FLIP',
            collection: c.args.choosers.value,
            face: c.args.choice ? Object.keys(byID[byID[c.args.choosers.value[0]].deck].cardTypes).indexOf(c.args.choice.value) : null,
            faceCycle: c.args.changeType == 'prev' ? 'backward' : null
          };
          if(c.face === null)
            delete c.face;
          if(c.faceCycle === null)
            delete c.faceCycle;
        }
        if(c.func == 'ROLL_DICE') {
          if(!c.args.dice)
            continue;
          c = {
            note:       'Roll dice',
            func:       'CLICK',
            collection: c.args.dice.value
          };
        }
        if(c.func == 'SPIN_SPINNER') {
          if(!c.args.spinners)
            continue;
          c = {
            note:       'Spin spinners',
            func:       'CLICK',
            collection: c.args.spinners.value
          };
        }
        w.clickRoutine.push(c);
      }

    } else if(widget.type == 'spinner') {
      w.type = widget.type;
      if(widget.options && JSON.stringify(widget.options) != JSON.stringify([ 1, 2, 3, 4, 5, 6 ]))
        w.options = widget.options;
      if(widget.value && widget.value != '🎲')
        w.value = widget.value;
      addDimensions(w, widget, 110, 110);
    } else {
      w.css = 'background: repeating-linear-gradient(45deg, red, red 10px, darkred 10px, darkred 20px);';
    }

    if(w.image)
      w.image = mapName(w.image);

    output[widget.id] = w;
  }
  return output;
}
