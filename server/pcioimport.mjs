import fs from 'fs';
import JSZip from 'jszip';

import Config from './config.mjs';
import Logging from './logging.mjs';

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

// PCIO font IDs mapped onto the closest font VirtualTabletop ships
const pcioFonts = {
  'abbasy-calligraphy':  'Handwriting',
  'fivecomputers':       'Gugi',
  'iansui':              'Handwriting Casual',
  'opensans-light':      'Roboto',
  'opensans-regular':    'Roboto',
  'opensans-semibold':   'Roboto',
  'opensans-bold':       'Roboto',
  'unquiet-spirits':     'Creepster',
  'westminstergotisch':  'Metamorphous'
};

export default async function convertPCIO(content) {
  const zip = await JSZip.loadAsync(content);
  const widgets = JSON.parse(await zip.files['widgets.json'].async('string'));

  // the file format version lives in its own zip member since PCIO schema 3
  let schemaVersion = 0;
  if(zip.files['schemaVersion'])
    schemaVersion = +(await zip.files['schemaVersion'].async('string')) || 0;

  // everything that could not be translated ends up in _meta.info.importerWarnings
  const warnings = [];
  function warn(text) {
    if(warnings.indexOf(text) == -1)
      warnings.push(text);
  }

  const nameMap = {};
  try {
    // created by the client while removing already uploaded assets
    for(const [ k, v ] of Object.entries(JSON.parse(await zip.files['asset-map.json'].async('string'))))
      nameMap[`package://${v}`] = `/assets/${k}`;
  } catch(e) {}

  for(const filename in zip.files) {
    if(filename.match(/^\/?userassets/) && zip.files[filename]._data) {
      // 10 MiB is the same limit that FileLoader applies to assets in .vtt files
      if(zip.files[filename]._data.uncompressedSize >= 10485760) {
        warn(`Asset ${filename} is bigger than 10 MiB and was not imported.`);
        continue;
      }
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

      const spanish = /https:\/\/playingcards\.io\/img\/cards-spanish\/(coins|cups|swords|clubs)-([0-9]+).svg/.exec(name);
      if(spanish)
        name = `/i/cards-spanish/${spanish[2]}${{coins:'Coin',cups:'Cup',swords:'Sword',clubs:'Club'}[spanish[1]]}.svg`;

      const german = /https:\/\/playingcards\.io\/img\/cards-german\/(acorns|bells|hearts|leaves)-([0-9]+).svg/.exec(name);
      if(german)
        name = `/i/cards-german/${german[2]}${{acorns:'Acorn',bells:'Bell',hearts:'Heart',leaves:'Leaf'}[german[1]]}.svg`;

      if(name.match(/^https:\/\/playingcards\.io\/img\//))
        warn(`Images in ${name.replace(/^https:\/\/playingcards\.io|[^/]*$/g, '')} have no VirtualTabletop equivalent and stay linked to playingcards.io.`);
    }
    return nameMap[name] || name;
  }

  // PCIO fill object (solid colour or gradient) as a CSS background/color value
  function pcioFill(fill) {
    if(!fill || typeof fill != 'object')
      return null;
    if(fill.type == 'color')
      return fill.color;
    if(!Array.isArray(fill.stops) || !fill.stops.length)
      return null;
    const stops = fill.stops.map(function(stop, i, all) {
      let position = stop.position !== undefined ? stop.position : stop.offset;
      if(position === undefined)
        position = all.length > 1 ? i/(all.length-1) : 0;
      return `${stop.color} ${Math.round((position > 1 ? position/100 : position)*100)}%`;
    }).join(', ');
    if(fill.type == 'radialGradient')
      return `radial-gradient(circle, ${stops})`;
    if(fill.type == 'conicGradient')
      return `conic-gradient(from ${fill.angle || 0}deg, ${stops})`;
    return `linear-gradient(${(fill.angle || 0) + 180}deg, ${stops})`;
  }

  // PCIO applies mainBackground/mainOutlines/mainTextStyle/mainBorderRadius to
  // holders, buttons, labels, counters and seats alike - translate them to CSS
  function pcioStyle(widget, w, css=[]) {
    const background = pcioFill((widget.mainBackground || {}).fill);
    if(background && !(w.classes || '').match(/transparent/))
      css.push(`background: ${background}`);

    if(Array.isArray(widget.mainOutlines)) {
      const outline = widget.mainOutlines.filter(o=>o && o.size && pcioFill(o.fill)).pop();
      if(outline) {
        css.push(`border: ${outline.size}px solid ${pcioFill(outline.fill)}`, 'box-sizing: border-box');
        if(widget.mainOutlines.length > 1)
          warn('Stacked outlines are not supported and were collapsed into a single border.');
      } else if(!(w.classes || '').match(/transparent/)) {
        css.push('border-color: transparent');
      }
    }

    const text = widget.mainTextStyle;
    if(text && typeof text == 'object') {
      if(text.size)
        css.push(`font-size: ${Math.round(text.size)}px`);
      if(text.size && text.lineHeight)
        css.push(`line-height: ${Math.round(text.size*text.lineHeight)}px`);
      if(text.align)
        css.push(`text-align: ${text.align}`);
      const color = pcioFill(text.mainFill);
      if(color)
        css.push(`color: ${color}`);
      if(text.font && pcioFonts[text.font])
        css.push(`font-family: ${pcioFonts[text.font]}`);
      else if(text.font)
        warn(`Font ${text.font} is not available in VirtualTabletop.`);
      if(Array.isArray(text.outlines) && text.outlines.length)
        warn('Outlined text is not supported.');
    }

    if(typeof widget.mainBorderRadius == 'number')
      w.borderRadius = widget.mainBorderRadius;
    if(css.length)
      w.css = (w.css ? w.css.replace(/;\s*$/, '') + '; ' : '') + css.join('; ');
    return w;
  }

  function addDimensions(w, widget, defaultWidth=100, defaultHeight=100) {
    if(widget.width != defaultWidth && widget.width !== undefined)
      w.width = widget.width;
    if(widget.height != defaultHeight && widget.height !== undefined)
      w.height = widget.height;
  }

  function importWidgetQuery(routine, args, legacySource, holdersParam, collectionParam, target) {
    const objects = args.objects || args.customObjects;
    if(objects && objects.type == 'reference') {
      target[collectionParam] = objects.questionId;
      return target;
    }
    if(objects && objects.type == 'literal' && Array.isArray(objects.value)) {
      routine.push({
        func: 'SELECT',
        property: 'id',
        relation: 'in',
        value: objects.value
      });
      return target;
    }
    if(objects && objects.type == 'query') {
      const holders = objects.holders || [];
      const collections = objects.collections || [];
      if(Array.isArray(objects.queryWidgetTypes) && objects.queryWidgetTypes.filter(t=>t != 'card' && t != 'piece').length)
        warn(`An automation looks for ${objects.queryWidgetTypes.join('/')} but only cards and pieces are selected.`);
      if(holders.length && !collections.length) {
        target[holdersParam] = holders;
        return target;
      }
      routine.push(holders.length ? {
        func: 'SELECT',
        property: 'parent',
        relation: 'in',
        value: holders,
        type: 'card'
      } : {
        func: 'SELECT',
        property: 'type',
        value: 'card',
        type: 'card'
      });
      // choosers are cards in VTT but PCIO never includes them in a query
      const chooserDecks = widgets.filter(w=>w && w.type == 'cardDeck' && w.collectionType == 'choosers').map(w=>w.id);
      if(chooserDecks.length) {
        routine.push({
          func: 'SELECT',
          source: 'DEFAULT',
          property: 'deck',
          relation: 'in',
          value: chooserDecks,
          mode: 'remove'
        });
      }
      if(collections.length) {
        routine.push({
          func: 'SELECT',
          source: 'DEFAULT',
          property: 'deck',
          relation: 'in',
          value: collections
        });
      }
      return target;
    }
    if(args[legacySource])
      target[holdersParam] = args[legacySource].value;
    return target;
  }

  // ROTATE for one of PCIO's rotation modes, null if it has no equivalent
  function rotateOperation(target, routine, mode, setRotation) {
    if(mode == 'cw' || mode == 'ccw')
      return Object.assign(target, { func: 'ROTATE', angle: mode == 'ccw' ? -90 : 90 });
    if(mode == 'set')
      return Object.assign(target, { func: 'ROTATE', angle: setRotation || 0, mode: 'set' });
    if(mode == 'random') {
      routine.push('var pcioRotation = randRange 0 360 45');
      return Object.assign(target, { func: 'ROTATE', angle: '${pcioRotation}', mode: 'set' });
    }
    warn(`Rotating objects to "${mode}" (fit to holder) has no VirtualTabletop equivalent.`);
    return null;
  }

  // PCIO stores the turn direction in the room while VTT's TURN takes it per
  // call: a hidden label holds the direction so it can be read and reversed
  function turnDirection() {
    if(!output.pcioTurnDirection) {
      output.pcioTurnDirection = {
        id: 'pcioTurnDirection',
        type: 'label',
        text: 'forward',
        x: -200,
        y: -100,
        movable: false,
        movableInEdit: false
      };
    }
    return 'pcioTurnDirection';
  }

  // PCIO renamed cardPile to holder in schema 6 without changing its properties
  // and used 'rotation' before it became 'r' - normalize both so that the rest
  // of the importer only has to deal with one spelling
  for(const widget of widgets) {
    if(!widget || typeof widget != 'object')
      continue;
    if(widget.type == 'holder')
      widget.type = 'cardPile';
    if(widget.r === undefined && typeof widget.rotation == 'number' && widget.type != 'spinner')
      widget.r = widget.rotation;
  }

  const pileHasDeck = {};
  const pileOverlaps = {};
  const pileTransparent = {};
  const turnAtSeat = {};

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
    if(!widget || typeof widget != 'object')
      continue;
    if(!widget.type) {
      // schema 6 files contain records that only carry styling for an attached label
      warn(`Ignored a widget without a type (${widget.id}).`);
      continue;
    }

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
      // PCIO dice are backed by a cardDeck whose cardTypes hold the faces
      w.type = 'dice';
      const deck = byID[widget.deck];
      if(deck && deck.cardTypes) {
        const faces = Object.entries(deck.cardTypes);
        const pips = faces.every(([ , face ], i)=>String(face.image || '').match(new RegExp(`/img/dice-basic/${i+1}.svg$`)));
        if(!pips) {
          w.faces = faces.map(function([ , face ]) {
            if(face.image)
              return { image: mapName(face.image) };
            if(face.label !== undefined)
              return { value: face.label };
            return {};
          });
        }
        w.width  = deck.cardWidth  || 50;
        w.height = deck.cardHeight || 50;
        const activeFace = faces.findIndex(([ key ])=>key == widget.diceValue);
        if(activeFace > 0)
          w.activeFace = activeFace;
      }
      addDimensions(w, widget, w.width || 50, w.height || 50);
    } else if(widget.type == 'urlButton') {
      // VTT cannot open a link from a button - show it so it can be copied
      w.type = 'button';
      w.text = widget.label || 'Open';
      addDimensions(w, widget, 80, 80);
      const url = widget.clickURL || widget.url;
      if(url) {
        w.clickRoutine = [
          {
            func: 'INPUT',
            header: w.text,
            fields: [
              { type: 'text',   text: 'PlayingCards.io opened this link in a new tab:' },
              { type: 'string', label: 'Link', value: url, variable: 'url' }
            ]
          }
        ];
      }
      pcioStyle(widget, w);
      warn('Webpage buttons cannot open a link in VirtualTabletop - they now show the link instead.');
    } else if(widget.type == 'hand') {
      if(widget.enabled === false) {
        warn('A disabled hand was not imported.');
        continue;
      }
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
      if(widget.allowedDecks && widget.allowedDecks.length)
        w.dropTarget = widget.allowedDecks.map(d=>({deck:d}));
      pcioStyle(widget, w);
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
      if(widget.layoutType == 'grid') {
        // VTT holders can only spread along one axis
        w.alignChildren = false;
        warn(`Holder ${widget.label || widget.id} uses PCIO's grid layout which has no VirtualTabletop equivalent - imported as freeform.`);
      }
      if(widget.spreadMulti == 'multi' && widget.layoutType == 'spread')
        warn(`Holder ${widget.label || widget.id} spreads cards into multiple groups which VirtualTabletop cannot do - all cards are in one row.`);

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

      pcioStyle(widget, w);

      if(widget.label) {
        output[widget.id + '_label'] = pcioStyle({ mainTextStyle: widget.mainTextStyle }, {
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
        });
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
      if(widget.cardOverlapH === 0 && !widget.cardOverlapV)
        w.cardDefaults.overlap = false;
      if(widget.onRemoveFromHand === null)
        w.cardDefaults.ignoreOnLeave = true;
      if(widget.allowPlayerMove === false)
        w.cardDefaults.movable = false;
      if(widget.allowPlayerClick === false)
        w.cardDefaults.clickable = false;
      if(Array.isArray(widget.snapAngles) && widget.snapAngles.length > 1)
        warn('Card rotation snapping (snapAngles) has no VirtualTabletop equivalent.');
      if(widget.showUnflipped)
        warn('"Show unflipped side to owner" has no VirtualTabletop equivalent.');

      for(const face of w.faceTemplates) {
        // includeBorder is a boolean in old files and light/heavy in new ones
        face.border = face.includeBorder ? { light: 1, heavy: 1.5 }[face.includeBorder] || 1 : false;
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
          if(object.textFont) {
            if(pcioFonts[object.textFont])
              object.css = `font-family: ${pcioFonts[object.textFont]}`;
            else
              warn(`Font ${object.textFont} is not available in VirtualTabletop.`);
            delete object.textFont;
          }
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
      w.text = widget.counterValue;
      w.editable = true;
      pcioStyle(widget, w, (widget.mainTextStyle || {}).size ? [] : [ 'font-size: 30px' ]);
      if(widget.counterMin !== undefined && widget.counterMin !== null || widget.counterMax !== undefined && widget.counterMax !== null)
        warn(`Counter ${widget.label || widget.id} has minimum/maximum bounds which are not enforced after the import.`);

      const counterStep = Math.abs(+widget.counterStep) || 1;

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
      addCounterButton('_decrementButton', 0,                  '-', -counterStep);
      addCounterButton('_incrementButton', w.width - w.height, '+',  counterStep);

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
      const style = widget.mainTextStyle || {};
      const size = Math.round(style.size || widget.textSize || 18) - 2;
      w.type = 'label';
      w.text = widget.labelContent;
      w.css = {
        default: {
          'line-height': `${style.lineHeight ? Math.round(size*style.lineHeight) : size}px`,
          'font-size':   `${size}px`,
          'font-weight': weight,
          'text-align':  style.align || widget.textAlign
        },
        ' textarea': {
          'letter-spacing': '-1px'
        }
      };
      const color = pcioFill(style.mainFill);
      if(color)
        w.css.default.color = color;
      if(style.font && pcioFonts[style.font])
        w.css.default['font-family'] = pcioFonts[style.font];
      else if(style.font)
        warn(`Font ${style.font} is not available in VirtualTabletop.`);
      addDimensions(w, widget, 100, 20);
      w.height = (size+2) * 3.5;
    } else if(widget.type == 'separator') {
      w.movable = false;
      w.layer = -1;
      w.css = `background:${pcioFill((widget.mainBackground || {}).fill) || '#ddd'}`;
      const thickness = widget.mainThickness || 1;
      if(widget.separatorType == 'horizontal') {
        w.width  = widget.width || 150;
        w.height = thickness;
      } else {
        w.height = widget.height || 150;
        w.width  = thickness;
      }
    } else if(widget.type == 'seat') {
      w.type = 'seat';
      w.display = 'seatIndex';
      w.displayEmpty = 'seatIndex';
      w.hideWhenUnused = true;
      if(typeof widget.seatIndex == 'number')
        w.index = widget.seatIndex + 1;
      if(widget.flipTableForSeated)
        warn('"Flip table for seated player" has no VirtualTabletop equivalent.');
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
      if(widget.timerStart)
        w.paused = false
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
        if(widget.playersCanReverse || widget.turnCCW) {
          if(widget.turnCCW)
            output[turnDirection()].text = 'backward';
          w.clickRoutine.push({
            func: 'TURN',
            turnCycle: `\${PROPERTY text OF ${turnDirection()}}`
          });
        } else {
          w.clickRoutine.push({
            func: 'TURN'
          });
        }
        if(widget.currentTurn && byID[widget.currentTurn])
          turnAtSeat[widget.currentTurn] = true;
        if(widget.playersCanReverse)
          warn('Players cannot reverse the turn direction by clicking the turn button - use the "Reverse turn direction" button that was added instead.');
      }

      const steps = [];
      for(const step of widget.clickRoutine ? (widget.clickRoutine.steps || widget.clickRoutine) : [])
        // PCIO wraps every step into { id, branches: [ { func, args } ] } since schema 6
        for(const branch of step && step.branches || [ step ])
          steps.push(branch);

      for(let c of steps) {
        if(!c || !c.func) {
          warn('An automation step could not be read and was skipped.');
          continue;
        }
        c = Object.assign({}, c, { args: c.args || {} });

        if(c.func == 'MOVE_CARDS_BETWEEN_HOLDERS') {
          if((!c.args.from && !c.args.objects) || !c.args.to)
            continue;
          const args = c.args;
          const moveFlip = c.args.moveFlip && c.args.moveFlip.value;

          let quantity = 1;
          if(c.args.quantity) {
            if(c.args.quantity.type == 'reference')
              quantity = '${' + c.args.quantity.questionId + '}';
            else if(c.args.quantity.counterId && byID[c.args.quantity.counterId])
              quantity = `\${PROPERTY text OF ${c.args.quantity.counterId}}`;
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

          const toPosition = (args.toPosition || {}).value;
          if(toPosition && toPosition != 'top')
            warn(`Moving objects to "${toPosition}" is not supported - they end up on top of the destination.`);
          if((args.startingOffset || {}).value)
            warn('The starting holder offset of a move automation is not supported.');

          // 'auto' (fit to holder) needs no operation: VTT children inherit the
          // rotation of their holder
          const changeRotation = (args.changeRotation || {}).value;
          if(c.func == 'MOVE' && changeRotation && changeRotation != 'none' && changeRotation != 'auto') {
            const rotate = rotateOperation({
              holder: c.to,
              count:  c.count !== undefined ? c.count : (c.fillTo !== undefined ? c.fillTo : 1)
            }, w.clickRoutine, changeRotation, (args.setRotation || {}).value);
            if(rotate) {
              w.clickRoutine.push(c);
              c = rotate;
            }
          }
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
          const sources = c.args.sources || c.args.holders;
          const direction = c.args.direction || c.args.sortDirection;
          if(!sources)
            continue;
          const holders = sources.value.map(id=>byID[id] && byID[id].type == 'seat' ? 'hand' : id);
          c = {
            func:   'SORT',
            holder: holders,
            key:    'sortingOrder',
            reverse: !direction || direction.value != 'za'
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
          if((c.args.reverse || {}).value == 'reverse')
            warn('Reversing the order of a pile while flipping it is not supported.');

          c = importWidgetQuery(w.clickRoutine, c.args, 'holders', 'holder', 'collection', {
            func:   'FLIP',
            count:  !c.args.flipMode || c.args.flipMode.value != 'pile' ? 1 : 0
          });
          if(c.holder && c.holder.length == 1)
            c.holder = c.holder[0];
          if(!c.count)
            delete c.count;
          if(flipFace && (flipFace.value == 'faceUp' || flipFace.value == 'faceDown'))
            c.face = flipFace.value == 'faceDown' ? 0 : 1;
          else if(flipFace && flipFace.value == 'random')
            warn('Randomly flipping objects has no VirtualTabletop equivalent - they are flipped to the other side instead.');
          else if(flipFace && flipFace.value == 'switch')
            warn('Flipping all objects to the same side is not supported - each object is flipped individually.');
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
          // PCIO used add/subtract before it settled on inc/dec
          const changeMode = c.args.counterChangeMode || c.args.changeMode;
          let value = c.args.changeNumber ? c.args.changeNumber.value : 0;
          if(c.args.changeNumber && c.args.changeNumber.counterId && byID[c.args.changeNumber.counterId])
            value = `\${PROPERTY text OF ${c.args.changeNumber.counterId}}`;
          c = {
            func: 'LABEL',
            label: c.args.counters.value,
            mode:  { add: 'inc', subtract: 'dec' }[changeMode && changeMode.value] || (changeMode ? changeMode.value : 'set'),
            value
          };
          if(c.label.length == 1)
            c.label = c.label[0];
          if(c.mode == 'set')
            delete c.mode;
          if(c.value === 0)
            delete c.value;
        }
        if(c.func == 'CHANGE_CHOOSER' || c.func == 'ROLL_DICE') {
          // "Roll / Change Dice" and "Change Chooser" both cycle the faces of
          // the widgets they target
          const isDice = c.func == 'ROLL_DICE';
          const targets = isDice ? c.args.dice : c.args.choosers;
          if(!targets)
            continue;
          const changeType = (c.args.chooserChangeType || c.args.diceChangeType || c.args.changeType || {}).value;
          const choice = c.args.chooserChoice || c.args.diceChoice || c.args.choice;
          const deck = byID[targets.value[0]] && byID[byID[targets.value[0]].deck];
          const faces = deck && deck.cardTypes ? Object.keys(deck.cardTypes) : [];

          if(isDice && (!changeType || changeType == 'random')) {
            c = {
              note:       'Roll dice',
              func:       'CLICK',
              collection: targets.value
            };
          } else if(isDice) {
            // dice have no flip(), their face is set directly - out of range
            // values wrap around so +1/-1 cycles through the faces
            w.clickRoutine.push({
              func: 'SELECT',
              property: 'id',
              relation: 'in',
              value: targets.value,
              type: 'dice'
            });
            c = changeType == 'set' && choice && faces.indexOf(choice.value) != -1 ? {
              note: 'Change dice',
              func: 'SET',
              property: 'activeFace',
              value: faces.indexOf(choice.value)
            } : {
              note: 'Cycle dice',
              func: 'SET',
              property: 'activeFace',
              relation: changeType == 'prev' ? '-' : '+',
              value: 1
            };
          } else {
            c = {
              func: 'FLIP',
              collection: targets.value
            };
            if(changeType == 'random' && faces.length) {
              w.clickRoutine.push(`var pcioFace = randInt 0 ${faces.length-1}`);
              c.face = '${pcioFace}';
            } else if(changeType == 'set' && choice && faces.indexOf(choice.value) != -1) {
              c.face = faces.indexOf(choice.value);
            } else if(changeType == 'prev') {
              c.faceCycle = 'backward';
            }
          }
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
        if(c.func == 'ROTATE_OBJECTS') {
          const target = importWidgetQuery(w.clickRoutine, c.args, 'objects', 'holder', 'collection', {
            count: (c.args.rotateMode || {}).value == 'top' ? 1 : 0
          });
          const rotate = rotateOperation(target, w.clickRoutine, (c.args.changeRotation || {}).value || 'auto', (c.args.setRotation || {}).value);
          if(!rotate)
            continue;
          c = rotate;
          if(c.holder && c.holder.length == 1)
            c.holder = c.holder[0];
        }
        if(c.func == 'SHIFT_OBJECTS') {
          // shift the contents of an ordered list of holders by one position,
          // optionally wrapping the last one around to the first
          const holders = c.args.holders ? c.args.holders.value : [];
          if(holders.length < 2)
            continue;
          if(holders.filter(id=>!byID[id] || byID[id].type != 'cardPile').length) {
            warn('Shifting objects between player seats has no VirtualTabletop equivalent and was skipped.');
            continue;
          }
          const wrap = !c.args.moveMode || c.args.moveMode.value == 'wrap';
          const order = (c.args.moveDirection || {}).value == 'reverse' ? holders.slice().reverse() : holders;
          const count = (c.args.objectsMode || {}).value == 'top' ? 1 : 0;
          const steps = Math.min(+((wrap ? c.args.stepsWrap : c.args.stepsEdge) || {}).value || 1, holders.length);
          if((c.args.objectsMode || {}).value == 'custom')
            warn('Shifting only a subset of the objects in a holder is not supported - all objects are shifted.');

          if(wrap) {
            output.pcioShiftTempHolder = {
              id: 'pcioShiftTempHolder',
              type: 'holder',
              x: -200,
              y: -300
            };
          }
          for(let step=0; step<steps; ++step) {
            if(wrap)
              w.clickRoutine.push({ func: 'MOVE', from: order[order.length-1], to: 'pcioShiftTempHolder', count });
            for(let i=order.length-2; i>=0; --i)
              w.clickRoutine.push({ func: 'MOVE', from: order[i], to: order[i+1], count });
            if(wrap)
              w.clickRoutine.push({ func: 'MOVE', from: 'pcioShiftTempHolder', to: order[0], count });
          }
          continue;
        }
        if(c.func == 'STAND_UP_PLAYER') {
          if(!c.args.seats)
            continue;
          w.clickRoutine.push({
            func: 'SELECT',
            property: 'id',
            relation: 'in',
            value: c.args.seats.value,
            type: 'seat'
          });
          c = {
            note: 'Stand up players',
            func: 'SET',
            property: 'player',
            value: ''
          };
        }
        if(c.func == 'NEXT_TURN') {
          c = {
            func: 'TURN',
            turnCycle: `\${PROPERTY text OF ${turnDirection()}}`
          };
        }
        if(c.func == 'REVERSE_TURN_DIRECTION') {
          const direction = (c.args.turnDirection || {}).value;
          const set = value=>[
            { func: 'SELECT', property: 'id', value: turnDirection() },
            { func: 'SET',    property: 'text', value }
          ];
          c = direction == 'cw' || direction == 'ccw' ? {
            note: 'Set turn direction',
            func: 'IF',
            condition: true,
            thenRoutine: set(direction == 'ccw' ? 'backward' : 'forward')
          } : {
            note: 'Reverse turn direction',
            func: 'IF',
            operand1: `\${PROPERTY text OF ${turnDirection()}}`,
            operand2: 'forward',
            thenRoutine: set('backward'),
            elseRoutine: set('forward')
          };
        }

        if(c.args) {
          warn(`The automation step ${c.func} of "${widget.label || widget.id}" has no VirtualTabletop equivalent and was skipped.`);
          continue;
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
      warn(`Widgets of type ${widget.type} cannot be imported.`);
      w.css = 'background: repeating-linear-gradient(45deg, red, red 10px, darkred 10px, darkred 20px);';
    }

    if(w.image)
      w.image = mapName(w.image);

    output[widget.id] = w;
  }

  // whose turn it is - the seats are created after the turn button was read
  for(const seatID in turnAtSeat)
    if(output[seatID])
      output[seatID].turn = true;

  if(warnings.length) {
    output._meta.info.importerWarnings = warnings;
    Logging.log(`PCIO import (schema version ${schemaVersion || 'unknown'}): ${warnings.length} warnings: ${warnings.join(' ')}`);
  }
  output._meta.info.importerSchemaVersion = schemaVersion;

  return output;
}
