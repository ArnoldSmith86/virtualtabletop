import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const checkersColors = {
  default: [ '#000000', '#525252' ],
  black:   [ '#4a4a4a', '#848484' ],
  blue:    [ '#4c5fea', '#8693f1' ],
  purple:  [ '#bc5bee', '#d290f4' ],
  red:     [ '#e84242', '#f07f7f' ],
  yellow:  [ '#e0cb0b', '#eadc59' ],
  green:   [ '#23ca5b', '#6adb90' ],
  orange:  [ '#e2a633', '#ecc375' ]
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
    if(name.match(/^\/img\//))
      name = 'https://playingcards.io' + name;
    return nameMap[name] || name;
  }

  function addDimensions(w, widget, defaultWidth=100, defaultHeight=100) {
    if(widget.width != defaultWidth)
      w.width = widget.width;
    if(widget.height != defaultHeight)
      w.height = widget.height;
  }

  const pileHasDeck = {};
  for(const widget of widgets)
    if(widget.type == 'cardDeck' && widget.parent)
      pileHasDeck[widget.parent] = true;

  const byID = {};
  for(const widget of widgets)
    byID[widget.id] = widget;

  const output = {};

  for(const widget of widgets) {
    const w = {};

    w.id = widget.id;
    w.x = widget.x;
    w.y = widget.y;
    if(widget.z)
      w.z = widget.z;

    if(widget.parent) {
      w.x -= byID[widget.parent].x;
      w.y -= byID[widget.parent].y;
    }

    if(widget.type == 'gamePiece' && widget.pieceType == 'checkers') {
      w.width  = 90;
      w.height = 90;
      const [ c1, c2 ] = checkersColors[widget.color] || checkersColors.default;
      w.css = `box-sizing: border-box; background: radial-gradient(circle, ${c1} 0%, ${c1} 33%, ${c2} 33%, ${c2} 46%, ${c1} 46%, ${c1} 58%, rgba(0, 0, 0, 0) 58%);`;
    } else if(widget.type == 'gamePiece' && widget.pieceType == 'classic') {
      w.width  = 90;
      w.height = 90;
      w.classes = 'widget classicPiece'
      w.css = `background: ${checkersColors[widget.color || 'default'][0]};`;
    } else if(widget.type == 'gamePiece' && widget.pieceType == 'pin') {
      w.width  = 35.85;
      w.height = 43.83;
      w.image = `https://playingcards.io/img/pieces/pin-${widget.color}.svg`;
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

      if(widget.label) {
        output[widget.id + '_label'] = {
          id: widget.id + '_label',
          x: widget.x,
          y: widget.y - 20,
          width: w.width || 111,
          type: 'label',
          text: widget.label
        };
      }

      if(widget.hasShuffleButton && pileHasDeck[widget.id]) {
        output[widget.id + '_shuffleButton'] = {
          id: widget.id + '_shuffleButton',
          x: widget.x,
          y: widget.y + 1.02*(w.height || 168),
          width: w.width || 111,
          height: 32,
          type: 'button',
          text: w.width < 70 ? 'R&S' : 'Recall & Shuffle',

          clickRoutine: [
            { func: 'RECALL',  holder: widget.id },
            { func: 'FLIP',    holder: widget.id, face: 0 },
            { func: 'SHUFFLE', holder: widget.id }
          ]
        };
      }
    } else if(widget.type == 'cardDeck') {
      w.type = 'deck';
      w.parent = widget.parent;
      w.cardTypes = widget.cardTypes;
      w.faceTemplates = [
        widget.backTemplate,
        widget.faceTemplate
      ];
      w.cardDefaults = {};
      if(widget.cardWidth && widget.cardWidth != 103)
        w.cardDefaults.width = widget.cardWidth;
      if(widget.cardHeight && widget.cardHeight != 160)
        w.cardDefaults.height = widget.cardHeight;
      if(widget.enlarge)
        w.cardDefaults.enlarge = true;

      for(const face of w.faceTemplates)
        for(const object of face.objects)
          object.value = mapName(object.value);
      for(const type in w.cardTypes)
        for(const key in w.cardTypes[type])
          w.cardTypes[type][key] = mapName(w.cardTypes[type][key]);
    } else if(widget.type == 'card') {
      w.type = 'card';
      w.deck = widget.deck;
      w.cardType = widget.cardType;
      w.parent = widget.parent;
      if(widget.faceup)
        w.activeFace = 1;
    } else if(widget.type == 'counter') {
      w.type = 'label';
      w.text = widget.counterValue;
      w.css = 'font-size: 30px;';
      w.width = widget.width || 140;
      w.height = widget.height || 44;

      function addCounterButton(suffix, x, text, value) {
        output[widget.id + suffix] = {
          id: widget.id + suffix,
          x,
          y: widget.y,
          width: w.height - 4,
          height: w.height - 4,
          type: 'button',
          text,

          clickRoutine: [
            { func: 'LABEL', label: widget.id, mode: 'inc', value }
          ]
        };
      }
      addCounterButton('_decrementButton', widget.x,                      '-', -1);
      addCounterButton('_incrementButton', widget.x + w.width - w.height, '+',  1);

      if(widget.label) {
        output[widget.id + 'label'] = {
          id: widget.id + 'label',
          x: widget.x,
          y: widget.y - 20,
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
      addDimensions(w, widget);
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
