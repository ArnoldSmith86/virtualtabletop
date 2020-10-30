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
  let output = {};
  for(const widget of widgets) {
    if([ 'cardDeck', 'hand' ].indexOf(widget.type) > -1)
      continue;

    const w = {};

    w.id = widget.id;
    w.x = widget.x;
    w.y = widget.y;
    w.width  = widget.width;
    w.height = widget.height;

    if(widget.type == 'gamePiece' && widget.pieceType == 'checkers') {
      w.width  = 90;
      w.height = 90;
      const [ c1, c2 ] = checkersColors[widget.color] || checkersColors.default;
      w.css = `background: radial-gradient(circle, ${c1} 0%, ${c1} 33%, ${c2} 33%, ${c2} 46%, ${c1} 46%, ${c1} 58%, rgba(0, 0, 0, 0) 58%);`;
    } else if(widget.type == 'board') {
      w.image = widget.boardImage;
    } else {
      w.css = 'background: repeating-linear-gradient(45deg, red, red 10px, darkred 10px, darkred 20px);';
    }

    output[widget.id] = w;
  }
  return output;
}
