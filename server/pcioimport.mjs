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
}

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

  const output = {};

  for(const widget of widgets) {
    if([ 'hand' ].indexOf(widget.type) > -1)
      continue;

    const w = {};

    w.id = widget.id;
    w.x = widget.x;
    w.y = widget.y;
    w.z = widget.z;
    if(widget.width)
      w.width  = widget.width;
    if(widget.height)
      w.height = widget.height;

    if(widget.type == 'gamePiece' && widget.pieceType == 'checkers') {
      w.width  = 90;
      w.height = 90;
      const [ c1, c2 ] = checkersColors[widget.color] || checkersColors.default;
      w.css = `box-sizing: border-box; background: radial-gradient(circle, ${c1} 0%, ${c1} 33%, ${c2} 33%, ${c2} 46%, ${c1} 46%, ${c1} 58%, rgba(0, 0, 0, 0) 58%);`;
      w.layer = 1;
    } else if(widget.type == 'cardPile') {
      w.css = 'background:white; box-sizing: border-box; border-top: 1px solid #d8d8d8; border-left: 1px solid #d8d8d8; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; background: #fff; border-radius: 8px;';
      w.movable = false;
      w.layer = -2;
      w.dropTarget = { 'type': 'card' };
      w.width = widget.width || 111;
      w.height = widget.height || 168;
    } else if(widget.type == 'cardDeck') {
      w.type = 'deck';
      w.cardTypes = widget.cardTypes;
      w.faceTemplates = [
        widget.backTemplate,
        widget.faceTemplate
      ];
      w.cardWidth = widget.cardWidth;
      w.cardHeight = widget.cardHeight;

      for(const face of w.faceTemplates)
        for(const object of face.objects)
          object.value = nameMap[object.value] || object.value;
      for(const type in w.cardTypes)
        for(const key in w.cardTypes[type])
          w.cardTypes[type][key] = nameMap[w.cardTypes[type][key]] || w.cardTypes[type][key];
    } else if(widget.type == 'card') {
      w.type = 'card';
      w.deck = widget.deck;
      w.cardType = widget.cardType;
      w.parent = widget.parent;
      w.activeFace = widget.faceup ? 1 : 0;
    } else if(widget.type == 'board') {
      w.image = widget.boardImage;
      w.movable = false;
      w.layer = -3;
    } else if(widget.type == 'automationButton') {
      w.css = 'box-sizing: border-box; border-radius: 800px; background: #a9e9e2; color: #6d6d6d; border: 3px solid #93d0c9; display:flex;justify-content:center;align-items:center;';
      w.content = widget.label;
      w.width  = widget.width || 80;
      w.height = widget.height || 80;
      w.movable = false;
      w.layer = -1;
    } else if(widget.type == 'spinner') {
      w.type = widget.type;
      w.options = widget.options;
      w.value = widget.value;
    } else {
      w.css = 'background: repeating-linear-gradient(45deg, red, red 10px, darkred 10px, darkred 20px);';
    }

    if(w.image)
      w.image = nameMap[w.image] || w.image;

    output[widget.id] = w;
  }
  return output;
}
