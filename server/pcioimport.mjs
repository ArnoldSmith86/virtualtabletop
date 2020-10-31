import zip from 'node-zip';

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

export default function convertPCIO(content) {
  const zip = new JSZip(content);
  const widgets = JSON.parse(zip.files['widgets.json']._data.getContent().toString('utf-8'));

  const byID = {};
  const output = {};
  for(const widget of widgets)
    byID[widget.id] = widget;

  for(const widget of widgets) {
    if([ 'cardDeck', 'hand' ].indexOf(widget.type) > -1)
      continue;

    const w = {};

    w.id = widget.id;
    w.x = widget.x;
    w.y = widget.y;
    w.z = widget.z;
    w.width  = widget.width;
    w.height = widget.height;

    if(widget.type == 'gamePiece' && widget.pieceType == 'checkers') {
      w.width  = 90;
      w.height = 90;
      const [ c1, c2 ] = checkersColors[widget.color] || checkersColors.default;
      w.css = `box-sizing: border-box; background: radial-gradient(circle, ${c1} 0%, ${c1} 33%, ${c2} 33%, ${c2} 46%, ${c1} 46%, ${c1} 58%, rgba(0, 0, 0, 0) 58%);`;
    } else if(widget.type == 'cardPile') {
      w.css = 'background:white; box-sizing: border-box; border-top: 1px solid #d8d8d8; border-left: 1px solid #d8d8d8; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; background: #fff; border-radius: 8px;';
    } else if(widget.type == 'card') {
      w.width = byID[widget.deck].cardWidth;
      w.height = byID[widget.deck].cardHeight;
      w.image = byID[widget.deck].cardTypes[widget.cardType].image;
    } else if(widget.type == 'board') {
      w.image = widget.boardImage;
    } else if(widget.type == 'automationButton') {
      w.css = 'box-sizing: border-box; border-radius: 800px; background: #a9e9e2; color: #6d6d6d; border: 3px solid #93d0c9; display:flex;justify-content:center;align-items:center;';
      w.content = widget.label;
      w.width  = widget.width || 80;
      w.height = widget.height || 80;
    } else {
      w.css = 'background: repeating-linear-gradient(45deg, red, red 10px, darkred 10px, darkred 20px);';
    }

    output[widget.id] = w;
  }
  return output;
}
