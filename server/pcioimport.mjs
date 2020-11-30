import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

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
  for(const filename in zip.files) {
    if(filename.match(/^userassets/) && zip.files[filename]._data && zip.files[filename]._data.uncompressedSize < 2097152) {
      const targetFile = '/assets/' + zip.files[filename]._data.crc32 + '_' + zip.files[filename]._data.uncompressedSize;
      nameMap['package://' + filename] = targetFile;
      if(!fs.existsSync(path.resolve() + '/save' + targetFile))
        fs.writeFileSync(path.resolve() + '/save' + targetFile, await zip.files[filename].async('nodebuffer'));
    }
  }

  function mapName(name) {
    if(name.match(/^\/img\//)) {
      name = 'https://playingcards.io' + name;

      name = name.replace('https://playingcards.io/img/cardback-red.svg',                        '/i/cards-default/2B.svg');
      name = name.replace(/https:\/\/playingcards\.io\/img\/cards(?:-french)?\/joker-black.svg/, '/i/cards-default/2J.svg');
      name = name.replace(/https:\/\/playingcards\.io\/img\/cards(?:-french)?\/joker-red.svg/,   '/i/cards-default/1J.svg');

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

  const pileHasDeck = {};
  for(const widget of widgets)
    if(widget.type == 'cardDeck' && widget.parent)
      pileHasDeck[widget.parent] = widget;

  const pileOverlaps = {};
  for(const wi1 of widgets) {
    if(wi1.type == 'cardPile' && !pileOverlaps[wi1.id]) {
      const x1 = wi1.x      || 0;
      const y1 = wi1.y      || 0;
      const w1 = wi1.width  || 111;
      const h1 = wi1.height || 168;
      for(const wi2 of widgets) {
        if(wi2.type == 'cardPile' && wi1.id != wi2.id) {
          const x2 = wi2.x      || 0;
          const y2 = wi2.y      || 0;
          const w2 = wi2.width  || 111;
          const h2 = wi2.height || 168;
          if(!(y1+h1 <= y2 || y1 >= y2+h2 || x1+w1 <= x2 || x1 >= x2+w2)) {
            pileOverlaps[wi1.id] = true;
            pileOverlaps[wi2.id] = true;
            break;
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
    if(widget.type == 'card') {
      const index = widget.x + ',' + widget.y + ',' + widget.parent + ',' + widget.owner;
      cardsPerCoordinates[index] = (cardsPerCoordinates[index] || 0) + 1;
    }
  }

  const output = {};

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
    } else if(widget.type == 'hand') {
      if(widget.enabled === false)
        continue;
      w.type = 'holder';
      w.onEnter = { activeFace: 1 };
      w.onLeave = { activeFace: 0 };
      if(widget.id == 'hand') {
        w.dropOffsetX = 10;
        w.dropOffsetY = 14;
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
      w.inheritChildZ = true;
      addDimensions(w, widget, 111, 168);

      if(pileOverlaps[w.id]) {
        w.x += 4;
        w.y += 4;
        w.width = (w.width || 111) - 8;
        w.height = (w.height || 168) - 8;
        w.dropOffsetX = 0;
        w.dropOffsetY = 0;
      }

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
            cR[0].applyVariables = [ { parameter: 'owned', variable: 'owned' } ];
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
      w.faceTemplates = [
        widget.backTemplate,
        widget.faceTemplate
      ];
      w.cardDefaults = {
        pilesWith: {
          type: 'card'
        }
      };
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
          object.value = mapName(object.value);
          object.width = object.w;
          object.height = object.h;
          delete object.w;
          delete object.h;
          if(object.value == '/i/cards-default/2B.svg')
            object.color = '#ffffff';
        }
      }
      for(const type in w.cardTypes)
        for(const key in w.cardTypes[type])
          w.cardTypes[type][key] = mapName(w.cardTypes[type][key]);
    } else if(widget.type == 'card') {
      if(!byID[widget.deck]) // orphan card without deck
        continue;

      w.type = 'card';
      w.deck = widget.deck;
      w.cardType = widget.cardType;

      if(pileOverlaps[widget.parent]) {
        w.x = (w.x || 0) - 4;
        w.y = (w.y || 0) - 4;
      }

      const pile = piles[widget.x + ',' + widget.y + ',' + widget.parent + ',' + widget.owner];
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
      w.css = `font-size: ${widget.textSize}px; font-weight: ${weight}; text-align: ${widget.textAlign};`;
      addDimensions(w, widget, 100, 20);
    } else if(widget.type == 'board') {
      w.image = widget.boardImage;
      w.movable = false;
      w.layer = -4;
      w.z = 10000 - w.z;
      addDimensions(w, widget);
    } else if(widget.type == 'automationButton') {
      w.type = 'button';
      if(widget.label !== '')
        w.text = widget.label;
      addDimensions(w, widget, 80, 80);

      w.clickRoutine = [];
      for(let c of widget.clickRoutine) {
        if(c.func == 'MOVE_CARDS_BETWEEN_HOLDERS') {
          const moveFlip = c.args.moveFlip && c.args.moveFlip.value;
          c = {
            func:  'MOVE',
            from:  c.args.from.value,
            count: (c.args.quantity || { value: 1 }).value,
            to:    c.args.to.value
          };
          if(c.from.length == 1)
            c.from = c.from[0];
          if(c.count == 1)
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
        if(c.func == 'SHUFFLE_CARDS') {
          c = {
            func:   'SHUFFLE',
            holder: c.args.holders.value
          };
          if(c.holder.length == 1)
            c.holder = c.holder[0];
        }
        if(c.func == "FLIP_CARDS") {
          const flipFace = c.args.flipFace;
          c = {
            func:   'FLIP',
            holder: c.args.holders.value,
            count:  !c.args.flipMode || c.args.flipMode.value == 'pile' ? 0 : 1
          };
          if(c.holder.length == 1)
            c.holder = c.holder[0];
          if(!c.count)
            delete c.count;
          if(flipFace)
            c.face = flipFace.value == 'faceDown' ? 0 : 1;
        }
        if(c.func == "CHANGE_COUNTER") {
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
