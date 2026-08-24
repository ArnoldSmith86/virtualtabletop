import CRC32 from 'crc-32';

import Config from './config.mjs';
import { VERSION } from './fileupdater.mjs';
import FileWriter from './filewriter.mjs';
import Logging from './logging.mjs';
import Zip from './zip.mjs';

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

// the names PCIO's own editor uses - a warning that says MOVE_CARDS_BETWEEN_HOLDERS
// or labelText does not help anyone looking for the thing in playingcards.io
const pcioFuncNames = {
  CHANGE_CHOOSER:             'Change Chooser',
  CHANGE_COUNTER:             'Change Counter',
  CHANGE_TIMER_STATE:         'Start / Pause Timer',
  CHANGE_TIMER_TIME:          'Change Timer',
  COMPARE_NUMBERS:            'Compare Numbers',
  FIND_CARDS_PIECES:          'Find Cards & Pieces',
  FLIP_CARDS:                 'Flip Objects',
  IS_EQUAL:                   'Is Equal',
  MATH:                       'Math',
  MOVE_CARDS_BETWEEN_HOLDERS: 'Move Objects',
  NEXT_TURN:                  'Finish Turn',
  NUMBERS_FROM_COUNTERS:      'Numbers from Counters',
  RANDOM_NUMBER:              'Random Number',
  RECALL_CARDS:               'Recall Objects',
  REVERSE_TURN_DIRECTION:     'Reverse Turn Direction',
  ROLL_DICE:                  'Roll / Change Dice',
  ROTATE_OBJECTS:             'Rotate Objects',
  SHIFT_OBJECTS:              'Shift Objects',
  SHUFFLE_CARDS:              'Shuffle Objects',
  SORT_CARDS:                 'Sort Objects',
  SPIN_SPINNER:               'Spin Spinners',
  STAND_UP_PLAYER:            'Stand Up Players',
  SUM_LIST:                   'Sum'
};

const pcioTypeNames = {
  automationButton: 'Button',
  board:            'Board',
  card:             'Card',
  cardDeck:         'Collection',
  cardPile:         'Holder',
  chooser:          'Chooser',
  counter:          'Counter',
  dice:             'Dice',
  hand:             'Hand',
  holder:           'Holder',
  labelText:        'Label Text',
  piece:            'Piece',
  seat:             'Player Seat',
  separator:        'Separator',
  spinner:          'Spinner',
  timer:            'Timer',
  turnButton:       'Turn Button',
  urlButton:        'URL Button'
};

// the newest PCIO file format this importer was written against
const knownSchemaVersion = 8;

export default async function convertPCIO(content) {
  const entries = Zip.list(content);
  // a null entry in widgets.json must not break the loops that follow
  const widgets = JSON.parse(await Zip.readString(content, 'widgets.json')).filter(widget=>widget && typeof widget == 'object');

  // the file format version lives in its own zip member since PCIO schema 3
  let schemaVersion = 0;
  if(entries['schemaVersion'] !== undefined)
    schemaVersion = +(await Zip.readString(content, 'schemaVersion')) || 0;

  // everything that could not be translated ends up in _meta.info.importerWarnings.
  // A broken file can have a note per widget, so the report is capped: it is
  // shown in the interface and stored in the room, which nobody is served by
  // filling with thousands of lines.
  const maxWarnings = 100;
  const warnings = [];
  const warned = new Set();
  let suppressedWarnings = 0;
  function warn(text) {
    if(warned.has(text))
      return;
    warned.add(text);
    if(warnings.length < maxWarnings)
      warnings.push(text);
    else
      ++suppressedWarnings;
  }

  // how a widget is called in a warning - the label the user gave it if it has one
  function widgetName(widget) {
    return `"${(widget || {}).label || (widget || {}).id || 'unnamed'}"`;
  }

  // a list of widget names, shortened so that a room full of them stays readable
  function widgetNames(names) {
    if(names.length > 3)
      return `${names.slice(0, 3).join(', ')} and ${names.length-3} more`;
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length-1]}` : names[0];
  }

  // A warning that names the widget it is about would repeat itself once per
  // widget, so the same problem on several widgets is collected under one key
  // and turned into a single line listing them once everything was imported.
  const groupedWarnings = {};
  function warnAbout(key, widget, message) {
    const group = groupedWarnings[key] = groupedWarnings[key] || { names: [], message };
    if(group.names.indexOf(widgetName(widget)) == -1)
      group.names.push(widgetName(widget));
  }

  function warnFont(font, widget) {
    warnAbout(`font ${font}`, widget, (names, count)=>`The font ${font} is not available in VirtualTabletop - ${names} ${count > 1 ? 'use' : 'uses'} the default font instead.`);
  }

  const nameMap = {};
  try {
    // created by the client while removing already uploaded assets
    for(const [ k, v ] of Object.entries(JSON.parse(await Zip.readString(content, 'asset-map.json'))))
      nameMap[`package://${v}`] = `/assets/${k}`;
  } catch(e) {}

  for(const filename in entries) {
    // a .pcio carries a folder entry for its assets, which has no content: it
    // would be written out as an empty "undefined_undefined" asset
    if(filename.match(/^\/?userassets/) && !filename.match(/\/$/)) {
      // 10 MiB is the same limit that FileLoader applies to assets in .vtt files
      if(entries[filename] >= 10485760) {
        warn(`Asset ${filename} is bigger than 10 MiB and was not imported.`);
        continue;
      }
      const asset = (await Zip.read(content, [ filename ]))[filename];
      const targetFile = CRC32.buf(asset) + '_' + asset.length;
      nameMap['package://' + filename] = '/assets/' + targetFile;
      if(!Config.resolveAsset(targetFile))
        FileWriter.writeFileSync(Config.directory('assets') + '/' + targetFile, asset);
    }
  }

  function mapName(name, silent) {
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

      if(!silent && name.match(/^https:\/\/playingcards\.io\/img\//))
        warn(`Images in ${name.replace(/^https:\/\/playingcards\.io|[^/]*$/g, '')} have no VirtualTabletop equivalent and stay linked to playingcards.io.`);
    }
    return nameMap[name] || name;
  }

  // text and URLs from the file end up inside a widget's html property
  function htmlEscape(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  // A text fill can be a gradient, which CSS only paints as a background - so
  // put it behind the text and clip it to the glyphs. That works where the text
  // has an element of its own (the textarea of a label or a counter); where the
  // widget itself shows the text, clipping would take its background with it.
  function textFill(fill, ownElement, widget) {
    const value = pcioFill(fill);
    if(!value)
      return {};
    if(!value.match(/gradient\(/))
      return { 'color': value };
    if(ownElement)
      return {
        'background-image': value,
        '-webkit-background-clip': 'text',
        'background-clip': 'text',
        '-webkit-text-fill-color': 'transparent'
      };
    warnAbout('textGradient', widget, (names, count)=>`The text of ${names} is filled with a gradient, which VirtualTabletop only does for labels and counters - ${count > 1 ? 'they use' : 'it uses'} the default text colour instead.`);
    return {};
  }

  // PCIO applies mainBackground/mainOutlines/mainTextStyle/mainBorderRadius to
  // holders, buttons, labels, counters and seats alike - translate them to CSS.
  // Whatever the importer generates inside such a widget (a holder's label and
  // shuffle button, a counter's caption and +/- buttons) is VirtualTabletop
  // chrome that PCIO does not style, so it must not inherit the text style:
  // options.noTextStyle drops it (PCIO ignores it for holders and hands as well)
  // and options.textSelector keeps it on the element that shows the text.
  function pcioStyle(widget, w, css=[], options={}) {
    const textCSS = Object.assign({}, options.text);
    const background = pcioFill((widget.mainBackground || {}).fill);
    if(background && !(w.classes || '').match(/transparent/))
      css.push(`background: ${background}`);

    if(Array.isArray(widget.mainOutlines)) {
      // PCIO draws every outline as a ring around the widget at its own offset:
      // the innermost one becomes the border, the ones around it box-shadows
      const outlines = widget.mainOutlines.filter(o=>o && o.size && pcioFill(o.fill)).sort((a, b)=>(a.offset || 0) - (b.offset || 0));
      if(outlines.length) {
        css.push(`border: ${outlines[0].size}px solid ${pcioFill(outlines[0].fill)}`, 'box-sizing: border-box');
        if(outlines.length > 1)
          css.push('box-shadow: ' + outlines.slice(1).map(o=>`0 0 0 ${(o.offset || 0) + o.size}px ${pcioFill(o.fill)}`).join(', '));
      } else if(!(w.classes || '').match(/transparent/)) {
        css.push('border-color: transparent');
      }
    }

    const text = options.noTextStyle ? null : widget.mainTextStyle;
    if(text && typeof text == 'object') {
      // options.textSize is the size the text is actually drawn at where that is
      // not the size of the style itself - a counter enlarges its value
      const size = options.textSize || text.size;
      if(size)
        textCSS['font-size'] = `${Math.round(size)}px`;
      if(size && text.lineHeight)
        textCSS['line-height'] = `${Math.round(size*text.lineHeight)}px`;
      if(text.align)
        textCSS['text-align'] = text.align;
      Object.assign(textCSS, textFill(text.mainFill, !!options.textSelector, widget));
      if(text.font && pcioFonts[text.font])
        textCSS['font-family'] = pcioFonts[text.font];
      else if(text.font)
        warnFont(text.font, widget);
      // a stroke painted behind the glyphs is what PCIO's text outline looks
      // like - it strokes twice the size so that the fill covers the inner half
      const textOutline = (text.outlines || []).filter(o=>o && o.size && pcioFill(o.fill)).pop();
      if(textOutline) {
        textCSS['-webkit-text-stroke'] = `${textOutline.size*2}px ${pcioFill(textOutline.fill)}`;
        textCSS['paint-order'] = 'stroke fill';
      }
    }

    if(typeof widget.mainBorderRadius == 'number')
      w.borderRadius = widget.mainBorderRadius;

    const textDeclarations = Object.entries(textCSS).map(([ property, value ])=>`${property}: ${value}`);
    if(options.textSelector && textDeclarations.length) {
      const style = {};
      if(w.css || css.length)
        style.default = (w.css ? w.css.replace(/;\s*$/, '') + '; ' : '') + css.join('; ');
      style[options.textSelector] = textCSS;
      w.css = style;
    } else if(css.length || textDeclarations.length) {
      w.css = (w.css ? w.css.replace(/;\s*$/, '') + '; ' : '') + css.concat(textDeclarations).join('; ');
    }
    return w;
  }

  // how far the outlines of a widget reach beyond its width and height - PCIO
  // paints them outside the widget as well, so whatever the importer puts next
  // to the widget has to keep that distance to stay readable
  function outlineExtent(widget) {
    if(!Array.isArray(widget.mainOutlines))
      return 0;
    return widget.mainOutlines.reduce((extent, o)=>Math.max(extent, o && o.size ? (o.offset || 0) + o.size : 0), 0);
  }

  function addDimensions(w, widget, defaultWidth=100, defaultHeight=100) {
    if(widget.width != defaultWidth && widget.width !== undefined)
      w.width = widget.width;
    if(widget.height != defaultHeight && widget.height !== undefined)
      w.height = widget.height;
  }

  // a label whose box is shorter than one line of its text shows nothing at all, so this is
  // the smallest height that one line of its own font still fits into - never below the 16px
  // a label in the default font needs, however tiny the font it was styled with is
  function labelMinHeight(w) {
    const sizes = [ ...JSON.stringify(w.css || '').matchAll(/(?:font-size|line-height)"?:"? *([0-9.]+) *px/g) ].map(match=>+match[1]);
    return Math.max(16, ...sizes) + 2;
  }

  // The objects an automation works on: either a holder parameter on the
  // operation itself or a SELECT into a collection. Returns null for a query
  // that matches nothing so that the caller can skip the whole step, which is
  // what PCIO does with it.
  function importWidgetQuery(routine, args, legacySource, holdersParam, collectionParam, target, options={}) {
    const objects = args.objects || args.customObjects;
    const collection = options.collection;
    const into = ops=>routine.push(Object.assign(ops, collection ? { collection } : {}, options.sortBy ? { sortBy: options.sortBy } : {}));
    if(objects && objects.type == 'reference') {
      target[collectionParam] = objects.questionId;
      return target;
    }
    if(objects && objects.type == 'variable') {
      // the object a "Find Cards & Pieces" step looked up - VirtualTabletop
      // automations have nothing to select it by
      warn(`An automation step works on the object that a "${pcioFuncNames.FIND_CARDS_PIECES}" step looked up, which has no VirtualTabletop equivalent - that step was skipped.`);
      return null;
    }
    if(objects && objects.type == 'literal' && Array.isArray(objects.value)) {
      into({
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
      // PCIO finds nothing when a query is restricted to neither a holder nor a
      // deck and nothing when it does not name the widget types it looks for
      if(!holders.length && !collections.length || !Array.isArray(objects.queryWidgetTypes))
        return null;
      if(objects.queryWidgetTypes.filter(t=>t != 'card' && t != 'piece').length)
        warn(`An automation looks for ${objects.queryWidgetTypes.join('/')} but only cards and pieces are selected.`);
      if(holders.length && !collections.length && !collection) {
        target[holdersParam] = holders;
        return target;
      }
      into(holders.length ? {
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
      const chooserDecks = widgets.filter(w=>w.type == 'cardDeck' && w.collectionType == 'choosers').map(w=>w.id);
      if(chooserDecks.length) {
        into({
          func: 'SELECT',
          source: collection || 'DEFAULT',
          property: 'deck',
          relation: 'in',
          value: chooserDecks,
          mode: 'remove'
        });
      }
      if(collections.length) {
        into({
          func: 'SELECT',
          source: collection || 'DEFAULT',
          property: 'deck',
          relation: 'in',
          value: collections
        });
      }
      return target;
    }
    if(args[legacySource]) {
      target[holdersParam] = args[legacySource].value;
      return target;
    }
    return null;
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
    // "fit to holder": a widget in a holder is drawn at the rotation of that
    // holder, so aligning it with its holder means rotating it back to 0
    if(mode == 'auto')
      return Object.assign(target, { func: 'ROTATE', angle: 0, mode: 'set' });
    warn(`Rotating objects to "${mode}" has no VirtualTabletop equivalent - that step was skipped.`);
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
    if(widget.type == 'holder')
      widget.type = 'cardPile';
    if(widget.r === undefined && typeof widget.rotation == 'number' && widget.type != 'spinner')
      widget.r = widget.rotation;
  }

  const pileHasDeck = {};
  const pileOverlaps = {};
  const pileTransparent = {};
  const turnAtSeat = {};

  // PCIO keeps every counter inside its bounds while a VTT label just counts on,
  // so a counter with bounds gets them applied wherever its value is changed. A
  // counter can be bounded on one side only, which stays unbounded here as well.
  const counterBounds = {};
  for(const widget of widgets) {
    if(widget.type != 'counter')
      continue;
    const min = isNaN(parseFloat(widget.counterMin)) ? -Infinity : parseFloat(widget.counterMin);
    const max = isNaN(parseFloat(widget.counterMax)) ?  Infinity : parseFloat(widget.counterMax);
    if(min == -Infinity && max == Infinity)
      continue;
    if(max < min)
      warn(`Counter ${widgetName(widget)} has a maximum below its minimum - its value is kept at ${max}.`);
    counterBounds[widget.id] = { min, max };
  }

  // how a range of a counter reads in a warning
  function boundsText(bounds) {
    if(bounds.min == -Infinity)
      return `maximum of ${bounds.max}`;
    if(bounds.max == Infinity)
      return `minimum of ${bounds.min}`;
    return `range of ${bounds.min} to ${bounds.max}`;
  }

  // a player can clear a counter or type text into it, which parses to NaN and
  // would stick forever once it is calculated with - LABEL's own inc/dec mode
  // falls back to 0 the same way
  function readCounter(id, variable) {
    return [
      `var ${variable} = parseFloat \${PROPERTY text OF ${id}}`,
      `var ${variable} = \${${variable}} || 0`
    ];
  }

  // LABEL rounds an increment to the decimals of the value and the step while
  // plain float arithmetic turns 0.1+0.2 into 0.30000000000000004
  function roundCounter(variable, step) {
    const decimals = typeof step == 'number' ? (String(step).split('.')[1] || '').length : 0;
    return decimals ? [ `var ${variable} = \${${variable}} toFixed ${decimals}` ] : [];
  }

  // PCIO does not lay a counter out from the width and height in the file - it
  // ignores both and builds the box from the size of the value: room for the
  // widest number the bounds allow (at least 52px) plus a 44px button at each
  // end, and a line of the value's own font, never shorter than those buttons.
  // The value itself is drawn a quarter larger while it is shorter than four
  // characters.
  function counterLayout(widget) {
    const style   = widget.mainTextStyle || {};
    const size    = +style.size || 21;
    const buttons = widget.counterShowButtons !== false;

    // the bounds every PCIO counter has, which are what its box is wide enough for
    const min = Math.max(-1e10, Math.min(1e10, isNaN(parseFloat(widget.counterMin)) ? -9999 : parseFloat(widget.counterMin)));
    let   max = Math.max(-1e10, Math.min(1e10, isNaN(parseFloat(widget.counterMax)) ?  9999 : parseFloat(widget.counterMax)));
    if(min >= max)
      max = min + 1;
    const characters = Math.max(String(Math.abs(min)).length + (min < 0 ? 0.5 : 0), String(max).length);

    const value      = counterValue(widget);
    const boosted    = widget.counterBoostFontSize !== false && String(value).length < 4 ? Math.min(size*1.25, 150) : size;
    const fontSize   = Math.round(boosted);
    const lineHeight = Math.round(fontSize*(style.lineHeight || 1));
    return {
      buttons,
      buttonSize: 32,
      buttonMargin: 6,
      fontSize,
      lineHeight,
      width:  Math.max(52, characters*0.62*size) + (buttons ? 88 : 0),
      // PCIO lets a value taller than the box overflow it while a VTT label cuts
      // it off, so the box is never shorter than the line the value takes
      height: Math.max(buttons ? 44 : 0, size, lineHeight + 2)
    };
  }

  // the value a counter starts at, kept inside its bounds the way PCIO does
  function counterValue(widget) {
    const bounds = counterBounds[widget.id];
    return bounds ? Math.min(Math.max(+widget.counterValue || 0, bounds.min), bounds.max) : widget.counterValue;
  }

  // the operations that keep a variable within the bounds of a counter
  function clampCounter(id, variable) {
    const bounds = counterBounds[id] || { min: -Infinity, max: Infinity };
    const operations = [];
    if(bounds.min > -Infinity)
      operations.push(`var ${variable} = max \${${variable}} ${bounds.min}`);
    if(bounds.max < Infinity)
      operations.push(`var ${variable} = min \${${variable}} ${bounds.max}`);
    return operations;
  }

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

  // PCIO backs its dice with a cardDeck. A deck that holds exactly the six
  // standard pip faces and is only used by dice is rendered by VirtualTabletop's
  // own dice widget, so those images never reach the table and reporting them as
  // "stays linked to playingcards.io" would be untrue.
  function isStandardPipDeck(deck) {
    const faces = deck && deck.cardTypes ? Object.entries(deck.cardTypes) : [];
    return faces.length == 6 && faces.every(([ , face ], i)=>String((face || {}).image || '').match(new RegExp(`/img/dice-basic/${i+1}.svg$`)));
  }
  const nativeDiceDecks = {};
  for(const widget of widgets)
    if(widget.type == 'dice' && isStandardPipDeck(byID[widget.deck]))
      nativeDiceDecks[widget.deck] = true;
  for(const widget of widgets)
    if(widget.type == 'card' || widget.type == 'piece' || widget.type == 'chooser')
      delete nativeDiceDecks[widget.deck];

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
      version: VERSION
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
      // the PCIO piece is a 90x90 box while the pawn shape only fills 56x84 of it
      w.width  = 56;
      w.height = 84;
      w.x = (w.x || 0) + 17;
      w.y = (w.y || 0) + 3;
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
        // only the six standard pip faces are what a VTT dice widget shows by
        // default - a die with fewer of them needs its faces spelled out
        const pips = isStandardPipDeck(deck);
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
        // a face default-prints at almost the size of the die, which only fits a
        // single character - scale a word down so that it stays on the face
        const longestFace = (w.faces || []).reduce((longest, face)=>Math.max(longest, String(face.value === undefined ? '' : face.value).length), 0);
        if(longestFace > 1)
          w.css = `--fontSize: ${Math.round(Math.min(w.width, w.height)/(0.6*longestFace))}px`;
        const activeFace = faces.findIndex(([ key ])=>key == widget.diceValue);
        if(activeFace > 0)
          w.activeFace = activeFace;
      }
      addDimensions(w, widget, w.width || 50, w.height || 50);
    } else if(widget.type == 'urlButton') {
      const label = widget.label || 'Open';
      const url = String(widget.clickURL || widget.url || '');
      addDimensions(w, widget, 80, 80);
      if(url.match(/^(https?:\/\/|mailto:)/i)) {
        // a link in the html of a basic widget is a real link: the room page
        // sets <base target="_blank">, so it opens the page in a new tab just
        // like the PCIO button does. The button class keeps the look, and the
        // link fills the widget so that a click anywhere on it counts.
        w.type = 'basic';
        w.classes = 'button';
        w.movable = false;
        w.layer = -1;
        w.borderRadius = 800;
        w.html = `<a href="${htmlEscape(url)}" style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: inherit; text-decoration: none">${htmlEscape(label)}</a>`;
      } else {
        // an address VirtualTabletop would not open as a link - show it instead
        w.type = 'button';
        w.text = label;
        if(url) {
          w.clickRoutine = [
            {
              func: 'INPUT',
              header: label,
              // a single honest button: nothing here navigates anywhere
              confirmButtonText: 'Close',
              cancelButtonText: null,
              cancelButtonIcon: null,
              fields: [
                { type: 'text',   text: 'On PlayingCards.io this button opened a webpage. VirtualTabletop cannot open this address, so here it is:' },
                { type: 'text',   text: url }
              ]
            }
          ];
          warnAbout('urlButton', widget, (names, count)=>`The webpage button${count > 1 ? 's' : ''} ${names} ${count > 1 ? 'open addresses' : 'opens an address'} that VirtualTabletop cannot follow - ${count > 1 ? 'they show them' : 'it shows it'} instead.`);
        }
      }
      pcioStyle(widget, w);
    } else if(widget.type == 'hand') {
      if(widget.enabled === false) {
        warn(`The disabled hand ${widgetName(widget)} was not imported.`);
        continue;
      }
      w.type = 'holder';
      w.onEnter = { activeFace: 1 };
      w.onLeave = { activeFace: 0 };
      if(pileTransparent[w.id])
        w.classes = 'transparent';
      if(widget.id == 'hand') {
        // a PCIO hand is a multi-group spread: cards fan out and can be
        // grouped into stacks the player arranges, 20 pixels apart
        w.layout = 'multipleSpread';
        w.dropOffsetX = 6;
        w.dropOffsetY = 6;
        w.stackOffsetX = 40;
        w.pilesGapX = 20;
      } else {
        w.layout = 'freeform';
      }
      w.inheritChildZ = true;
      w.childrenPerOwner = true;
      w.dropShadow = true;
      w.hidePlayerCursors = true;
      // an empty holder is a blank band otherwise. Only the main hand is captioned as one:
      // a PCIO table can carry any number of further private zones next to it
      w.text = widget.label || (widget.id == 'hand' ? 'Your hand' : 'Private');
      w.width = widget.width || 1500;
      w.height = widget.height || 180;
      if(widget.allowedDecks && widget.allowedDecks.length)
        w.dropTarget = widget.allowedDecks.map(d=>({deck:d}));
      pcioStyle(widget, w, [], { noTextStyle: true });
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
            dropOffsetX = Math.round(Math.min(dropOffsetX, ((widget.width  || 111) - (byID[allowed.deck].cardWidth  || 103))/2));
            dropOffsetY = Math.round(Math.min(dropOffsetY, ((widget.height || 168) - (byID[allowed.deck].cardHeight || 160))/2));
          }
        }
      }
      if(widget.hideStackTab)
        w.preventPiles = true;
      if(widget.layoutType == 'freeform')
        w.layout = 'freeform';
      if(widget.layoutType == 'grid') {
        // the grid layout derives its rows and columns from the holder size the
        // way PCIO does; PCIO insets the cards 6 pixels from the edge and packs
        // the cells tightly, so the wider native default gap is pinned down
        w.layout = 'grid';
        w.dropOffsetX = 6;
        w.dropOffsetY = 6;
        w.stackOffsetX = 4;
        w.stackOffsetY = 4;
      }

      if(widget.layoutType == 'spread' && widget.spreadMulti == 'multi') {
        // a multi-group spread: each group fans out by the band PCIO leaves
        // visible of a card (40 x 54 pixels), the groups sit the 20 pixels
        // apart PCIO keeps between them
        w.layout = 'multipleSpread';
        w.pilesGapX = 20;
        if(widget.spreadDirection == 'down') {
          w.stackOffsetY = 54;
        } else if(widget.spreadDirection == 'up') {
          w.stackOffsetY = -54;
        } else if(widget.spreadDirection == 'left') {
          w.stackOffsetX = -40;
        } else {
          w.stackOffsetX = 40;
        }
      } else if(widget.layoutType == 'spread') {
        w.layout = 'singleSpread';
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
      } else if(widget.layoutType != 'grid' && widget.layoutType != 'freeform') {
        // no layoutType is PCIO's pile: everything stacks in one centered spot
        w.layout = 'pile';
        if(dropOffsetX != 100)
          w.dropOffsetX = dropOffsetX;
        if(dropOffsetY != 100)
          w.dropOffsetY = dropOffsetY;

        if(pileOverlaps[w.id]) {
          w.x = (w.x || 0) + 4;
          w.y = (w.y || 0) + 4;
          w.width = (w.width || 111) - 8;
          w.height = (w.height || 168) - 8;
          w.dropOffsetX = 0;
          w.dropOffsetY = 0;
        }
      }

      if(widget.layoutType != 'spread' && widget.layoutType != 'freeform')
        w.inheritChildZ = true;

      pcioStyle(widget, w, [], { noTextStyle: true });

      const outlines = outlineExtent(widget);
      if(widget.label) {
        output[widget.id + '_label'] = {
          id: widget.id + '_label',
          parent: widget.id,
          x: -(w.width || 111) * 0.1,
          y: -40 - outlines,
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
          y: 1.02*(w.height || 168) + outlines,
          width: w.width || 111,
          height: 32,
          type: 'button',
          // PCIO shortens the label the same way below 60px - a smaller font is
          // what keeps the long one on one line in a holder-wide button
          text: (w.width || 111) < 60 ? 'R & S' : 'Recall & Shuffle',
          css: 'font-size: 13px',
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
        warnAbout('snapAngles', widget, (names, count)=>`The "Rotation Snapping" of the collection${count > 1 ? 's' : ''} ${names} has no VirtualTabletop equivalent - those objects rotate freely.`);
      if(widget.showUnflipped)
        warnAbout('showUnflipped', widget, (names, count)=>`"Show Unflipped Side To Owner" of the collection${count > 1 ? 's' : ''} ${names} has no VirtualTabletop equivalent.`);

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
          if(object.textFont !== undefined) {
            if(pcioFonts[object.textFont])
              object.css = `font-family: ${pcioFonts[object.textFont]}`;
            else if(object.textFont)
              warnFont(object.textFont, widget);
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
          w.cardTypes[type][key] = mapName(w.cardTypes[type][key], nativeDiceDecks[widget.id]);
        w.cardTypes[type].sortingOrder = ++sortingOrder;
      }

      // PCIO marks a face object that takes its content from a card type property with
      // valueType/value, which VirtualTabletop writes as a dynamicProperties entry instead
      for(const face of w.faceTemplates) {
        for(const object of face.objects) {
          if(object.valueType != 'static' && object.value) {
            object.dynamicProperties = Object.assign({}, object.dynamicProperties, { value: object.value });
            delete object.value;
          }
          delete object.valueType;
        }
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
        if(widget.parent)
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
      w.y = (w.y || 0) + 5;
      const counter = counterLayout(widget);
      w.width = counter.width;
      w.height = counter.height;
      const bounds = counterBounds[widget.id];
      w.text = counterValue(widget);
      if(widget.allowPlayerEditValue !== false)
        w.editable = true;
      // the text style belongs on the value, not on the caption and +/- buttons
      pcioStyle(widget, w, [], {
        textSelector: ' > textarea',
        textSize: counter.fontSize,
        text: { 'font-size': `${counter.fontSize}px`, 'line-height': `${counter.lineHeight}px` }
      });
      if(bounds && !isNaN(parseFloat(widget.counterValue)) && w.text != parseFloat(widget.counterValue))
        warn(`Counter ${widgetName(widget)} was outside its ${boundsText(bounds)} and starts at ${w.text} instead of ${widget.counterValue}.`);
      if(bounds && widget.allowPlayerEditValue !== false)
        warnAbout(`bounds ${boundsText(bounds)}`, widget, (names, count)=>`Typing a value into the counter${count > 1 ? 's' : ''} ${names} is not restricted to ${count > 1 ? 'their' : 'its'} ${boundsText(bounds)} - the buttons and the automations that change ${count > 1 ? 'them' : 'it'} are.`);

      const counterStep = Math.abs(+widget.counterStep) || 1;

      function addCounterButton(suffix, x, text, value) {
        output[widget.id + suffix] = {
          id: widget.id + suffix,
          parent: widget.id,
          x: counter.buttonMargin,
          y: Math.round((counter.height - counter.buttonSize)/2),
          width: counter.buttonSize,
          height: counter.buttonSize,
          type: 'button',
          movableInEdit: false,
          text,

          clickRoutine: bounds ? [
            ...readCounter(widget.id, 'pcioCounter'),
            `var pcioCounter = \${pcioCounter} + ${value}`,
            ...clampCounter(widget.id, 'pcioCounter'),
            ...roundCounter('pcioCounter', value),
            { func: 'LABEL', label: widget.id, value: '${pcioCounter}' }
          ] : [
            { func: 'LABEL', label: widget.id, mode: 'inc', value }
          ]
        };
        if(x)
          output[widget.id + suffix].x += x;
      }
      if(counter.buttons) {
        addCounterButton('_decrementButton', 0, '-', -counterStep);
        addCounterButton('_incrementButton', counter.width - 2*counter.buttonMargin - counter.buttonSize, '+', counterStep);
      }

      if(widget.label) {
        output[widget.id + '_label'] = {
          id: widget.id + '_label',
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
      const fill = textFill(style.mainFill, true, widget);
      if(fill.color)
        w.css.default.color = fill.color;
      else
        Object.assign(w.css[' textarea'], fill);
      if(style.font && pcioFonts[style.font])
        w.css.default['font-family'] = pcioFonts[style.font];
      else if(style.font)
        warnFont(style.font, widget);
      addDimensions(w, widget, 100, 20);
      // a PCIO label text is always 60px high and lets longer text overflow it -
      // VirtualTabletop scrolls instead, so grow the box for text that wraps
      const lineHeight = style.lineHeight ? Math.round(size*style.lineHeight) : size;
      const charsPerLine = Math.max(1, Math.floor((w.width || widget.width || 200) / (size*0.55)));
      const rows = String(w.text || '').split('\n').reduce((sum, line)=>sum + Math.max(1, Math.ceil(line.length/charsPerLine)), 0);
      w.height = Math.max(60, rows*lineHeight + 6);
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
        warnAbout('flipTable', widget, (names, count)=>`"Flip Table For Seated Player" of the player seat${count > 1 ? 's' : ''} ${names} has no VirtualTabletop equivalent - the table looks the same for everyone.`);
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

      // a PCIO turn button cannot be resized - it is always 162x66, which is
      // also what its label was written for
      if(widget.type == 'turnButton') {
        widget.width = 162;
        widget.height = 66;
      }
      addDimensions(w, widget, 80, 80);
      pcioStyle(widget, w);

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
          warn('The turn button has no arrows to reverse the turn direction - clicking it always advances in the current direction, which only a "Reverse Turn Direction" automation can turn around.');
      }

      // PCIO wraps every step into { id, branches: [ { func, args } ] } since
      // schema 6. The branches of one step are alternatives of which the first
      // one whose condition holds runs, so they import as a chain of IFs. The
      // condition is the result of an earlier step that calls a "read" function;
      // arguments can reference those results the same way. Every result is kept
      // in a variable named after the step that produced it.
      const readValues = {};
      const numberLists = {};
      const readDefaults = { COMPARE_NUMBERS: false, IS_EQUAL: false, MATH: 0, NUMBERS_FROM_COUNTERS: 0, RANDOM_NUMBER: 0, SUM_LIST: 0 };
      let temporaries = 0;

      function readVariable(stepID) {
        return 'pcio' + String(stepID).replace(/[^A-Za-z0-9_]/g, '');
      }

      // an automation can name a widget that is no longer in the file, which
      // would import as an operation on something that does not exist
      function knownIDs(ids) {
        const known = (ids || []).filter(id=>byID[id]);
        if(known.length < (ids || []).length)
          warn(`An automation step of ${widgetName(widget)} works on a widget that is not part of the file - that widget was left out.`);
        return known;
      }

      function importSteps(steps, routine) {
        for(const step of steps || []) {
          const branches = step && step.branches || [ step ];
          // a read step whose alternatives are conditional - or which is only one
          // of several alternatives - may not run at all, in which case PCIO sees
          // its result as empty
          const read = branches.find(branch=>branch && readDefaults[branch.func] !== undefined);
          if(read && (read !== branches[0] || branches[0].condition))
            routine.push(`var ${readVariable(step.id)} = ${readDefaults[read.func]}`);
          importBranches(branches, routine, step && step.id);
        }
      }

      function importBranches(branches, routine, stepID) {
        const branch = branches[0];
        if(!branch)
          return;
        const condition = branch.condition && branch.condition.callId;
        if(condition && !readValues[condition]) {
          warn(`The condition of an automation step of ${widgetName(widget)} could not be imported - that alternative was skipped.`);
          importBranches(branches.slice(1), routine, stepID);
          return;
        }
        if(!condition) {
          // an alternative without a condition always runs: PCIO never looks at
          // the ones behind it
          importBranch(branch, routine, stepID);
          return;
        }
        const thenRoutine = [];
        importBranch(branch, thenRoutine, stepID);
        const elseRoutine = [];
        importBranches(branches.slice(1), elseRoutine, stepID);
        if(!thenRoutine.length && !elseRoutine.length)
          return;
        const operation = { func: 'IF', condition: `\${${readValues[condition]}}`, thenRoutine };
        if(elseRoutine.length)
          operation.elseRoutine = elseRoutine;
        routine.push(operation);
      }

      // a number argument is a fixed value, the value of a counter, an answer
      // from the popup, the result of an earlier read step or a query that adds
      // up counters or card fields
      function numberArgument(routine, argument, fallback) {
        if(!argument || typeof argument != 'object')
          return fallback;
        if(argument.counterId)
          return byID[argument.counterId] ? `\${PROPERTY text OF ${argument.counterId}}` : unknownNumber(fallback);
        if(argument.type == 'literal')
          return argument.value === null || argument.value === undefined ? fallback : argument.value;
        if(argument.type == 'reference' && argument.questionId)
          return `\${${argument.questionId}}`;
        if(argument.type == 'variable')
          return readValues[argument.callId] ? `\${${readValues[argument.callId]}}` : unknownNumber(fallback);
        if(argument.type == 'query') {
          const counters = (argument.counters || []).filter(id=>byID[id]);
          const variable = `pcioNumber${++temporaries}`;
          if(counters.length) {
            routine.push(...addUpCounters(counters, variable));
            return `\${${variable}}`;
          }
          const field = (argument.collectionFieldSelectors || [])[0];
          if(field && field.fieldId) {
            // PCIO adds up one field of the card type of everything it finds.
            // The objects may already be a collection of a popup question, in
            // which case the query selects nothing of its own.
            const target = importWidgetQuery(routine, { objects: argument }, '', '', 'collection', {}, { collection: variable });
            if(target) {
              routine.push({ func: 'GET', collection: target.collection || variable, property: field.fieldId, aggregation: 'sum', variable, skipMissing: true });
              return `\${${variable}}`;
            }
          }
        }
        return unknownNumber(fallback);
      }

      // a number the importer cannot calculate would silently turn into whatever
      // the fallback is, which can make a comparison always true
      function unknownNumber(fallback) {
        warn(`A number an automation step of ${widgetName(widget)} calculates with could not be imported - it uses ${fallback} instead.`);
        return fallback;
      }

      function addUpCounters(counters, variable) {
        return counters.map((counter, i)=>i
          ? `var ${variable} = \${${variable}} + \${PROPERTY text OF ${counter}}`
          : `var ${variable} = parseFloat \${PROPERTY text OF ${counter}}`);
      }

      // the read functions: their result goes into the variable of their step
      function importReadStep(c, routine, stepID) {
        const variable = readVariable(stepID);
        const args = c.args;
        if(c.func == 'FIND_CARDS_PIECES') {
          // returns the ID of an object, which none of PCIO's own automations can
          // do anything with - importing the step would have no effect
          warn(`The automation step "${pcioFuncNames.FIND_CARDS_PIECES}" of ${widgetName(widget)} was skipped - VirtualTabletop automations cannot work with the object it looks up.`);
          return true;
        }
        if(c.func == 'NUMBERS_FROM_COUNTERS') {
          // A list of counter values which only SUM_LIST consumes, so the sum is
          // all that has to survive. PCIO reads the counters when this step runs,
          // so it is captured here and not where the sum is used - the counters
          // may well change in between, and a step that runs in one alternative
          // only must not leak its counters into the others.
          const counters = ((args.counters || {}).value || []).filter(id=>byID[id]);
          routine.push(...(counters.length ? addUpCounters(counters, variable) : [ `var ${variable} = 0` ]));
          numberLists[stepID] = variable;
          return true;
        }
        if(c.func == 'SUM_LIST') {
          const list = numberLists[(args.list || {}).callId];
          routine.push(`var ${variable} = ${list ? `\${${list}}` : 0}`);
        } else if(c.func == 'MATH') {
          const operator = (args.mathOperator || {}).value || 'add';
          const infix = { add: '+', subtract: '-', multiply: '*', divide: '/', remainder: '%', exponent: '**' }[operator];
          const prefix = { absolute: 'abs', round: 'round', ceiling: 'ceil', floor: 'floor' }[operator];
          const a = numberArgument(routine, args.numberA, 1);
          if(infix)
            routine.push(`var ${variable} = ${a} ${infix} ${numberArgument(routine, args.numberB, 1)}`);
          else if(prefix)
            routine.push(`var ${variable} = ${prefix} ${a}`);
          else
            return false;
        } else if(c.func == 'RANDOM_NUMBER') {
          const min = numberArgument(routine, args.minimum, 1);
          const step = numberArgument(routine, args.step, 1);
          let max = numberArgument(routine, args.maximum, 10);
          // randRange stops short of its endpoint while PCIO includes the maximum
          if(typeof max == 'number' && typeof step == 'number') {
            max += step;
          } else {
            const endpoint = `pcioNumber${++temporaries}`;
            routine.push(`var ${endpoint} = ${max} + ${step}`);
            max = `\${${endpoint}}`;
          }
          routine.push(`var ${variable} = randRange ${min} ${max} ${step}`);
        } else if(c.func == 'COMPARE_NUMBERS' || c.func == 'IS_EQUAL') {
          const relation = c.func == 'IS_EQUAL' ? '==' : { eq: '==', gt: '>', lt: '<', gte: '>=', lte: '<=' }[(args.comparisonOperator || {}).value] || '==';
          const a = numberArgument(routine, args.numberA, 1);
          routine.push(`var ${variable} = ${a} ${relation} ${numberArgument(routine, args.numberB, 1)}`);
        } else {
          return false;
        }
        readValues[stepID] = variable;
        return true;
      }

      function importBranch(c, routine, stepID) {
        if(!c || !c.func) {
          warn(`An automation step of ${widgetName(widget)} could not be read and was skipped.`);
          return;
        }
        c = Object.assign({}, c, { args: c.args || {} });

        if(importReadStep(c, routine, stepID))
          return;

        if(c.func == 'MOVE_CARDS_BETWEEN_HOLDERS') {
          if((!c.args.from && !c.args.objects) || !c.args.to)
            return;
          const args = c.args;
          const moveFlip = c.args.moveFlip && c.args.moveFlip.value;

          const quantity = numberArgument(routine, args.quantity, 1);
          const fill = args.fillAdd && args.fillAdd.value == 'fill' && quantity !== 'all';

          // a hand PCIO does not show is nowhere to move objects to, and without
          // any destination left there is nothing to move
          const destinations = args.to.value.filter(id=>!byID[id] || byID[id].type != 'hand' || byID[id].enabled !== false);
          if(!destinations.length)
            return;
          // PCIO starts dealing at the n-th of its destinations
          destinations.push(...destinations.splice(0, (+(args.startingOffset || {}).value || 0) % destinations.length));

          c = importWidgetQuery(routine, args, 'from', 'from', 'collection', {
            func:  'MOVE',
            count: quantity,
            to:    destinations,
            fillTo: fill ? quantity : null
          });
          if(!c)
            return;
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
          if(moveFlip && moveFlip != 'none')
            c.face = moveFlip == 'faceDown' ? 0 : 1;

          // PCIO can put the objects below the ones already in the destination.
          // VTT always moves onto the top, so the ones that are there are parked
          // in a hidden holder and put back on top afterwards.
          const toPosition = (args.toPosition || {}).value;
          const toBottom = toPosition == 'bottom' && c.func == 'MOVE' && typeof c.to == 'string' && byID[c.to] && byID[c.to].type == 'cardPile';
          if(toBottom) {
            output.pcioMoveTempHolder = {
              id: 'pcioMoveTempHolder',
              type: 'holder',
              layout: 'pile',
              x: -200,
              y: -500
            };
            routine.push({ func: 'MOVE', from: c.to, to: 'pcioMoveTempHolder', count: 'all' });
          } else if(toPosition && toPosition != 'top') {
            warn(`Moving objects to "${toPosition}" is not supported - the objects ${widgetName(widget)} moves end up on top of the destination.`);
          }

          // PCIO hands out one object after the other, going around the
          // destinations, which leaves them in the opposite order of moving the
          // whole pile at once. Only a move out of a holder has an order to keep:
          // a collection is moved in the order it was selected in.
          const oneAtATime = (args.moveMethod || {}).value != 'all' && c.func == 'MOVE' && c.from && !fill;
          const sources = [].concat(c.from);
          const dealLoop = ()=>({ func: 'FOREACH', range: [ 1, quantity ], loopRoutine: [ Object.assign({}, c, { count: 1 }) ] });
          if(oneAtATime && quantity === 'all' && sources.every(id=>byID[id])) {
            // "all objects" has no number to count up to, so the loop runs once
            // per object that is in the source when the button is clicked
            const collection = `pcioDeal${++temporaries}`;
            routine.push({ func: 'SELECT', type: 'card', property: 'parent', relation: 'in', value: sources, collection });
            routine.push({ note: 'Deal one at a time', func: 'FOREACH', collection, loopRoutine: [ Object.assign({}, c, { count: 1 }) ] });
          } else if(oneAtATime && typeof quantity == 'number' && quantity > 1 && quantity <= 100) {
            routine.push(Object.assign({ note: 'Deal one at a time' }, dealLoop()));
          } else if(oneAtATime && typeof quantity == 'string' && quantity !== 'all') {
            // the quantity is only known when the button is clicked and a range
            // ending below its start would count down, so dealing nothing at all
            // has to skip the loop
            routine.push({
              note: 'Deal one at a time',
              func: 'IF',
              operand1: quantity,
              relation: '>',
              operand2: 0,
              thenRoutine: [ dealLoop() ]
            });
          } else {
            if(oneAtATime && (quantity === 'all' || typeof quantity == 'number' && quantity > 100))
              warn(`${widgetName(widget)} moves ${quantity === 'all' ? 'all objects' : `up to ${quantity} objects`} in one go instead of one after the other - they can end up in the opposite order.`);
            routine.push(c);
          }

          // 'auto' (fit to holder) needs no operation: VTT children inherit the
          // rotation of their holder
          const changeRotation = (args.changeRotation || {}).value;
          if(c.func == 'MOVE' && changeRotation && changeRotation != 'none' && changeRotation != 'auto') {
            const rotate = rotateOperation({
              holder: c.to,
              count:  c.count !== undefined ? c.count : (c.fillTo !== undefined ? c.fillTo : 1)
            }, routine, changeRotation, (args.setRotation || {}).value);
            if(rotate)
              routine.push(rotate);
          }

          if(toBottom)
            routine.push({ func: 'MOVE', from: 'pcioMoveTempHolder', to: c.to, count: 'all' });
          return;
        }
        if(c.func == 'RECALL_CARDS') {
          if(!c.args.decks)
            return;
          const decks = knownIDs(c.args.decks.value);
          if(!decks.length)
            return;

          // a deck that sits on the table has no holder to recall into, so its cards are
          // gathered on its position instead - a recall takes them back from their owner
          // as much as it takes them out of a holder
          for(const deckID of decks) {
            if(!byID[deckID].parent) {
              output.tempHolderForDeckRecall = {
                id: 'tempHolderForDeckRecall',
                type: 'holder',
                layout: 'custom',
                x: -200
              };
              routine.push({
                func: 'SELECT',
                property: 'deck',
                value: deckID
              });
              routine.push({
                func: 'SET',
                property: 'parent',
                value: 'tempHolderForDeckRecall'
              });
              routine.push({
                func: 'MOVEXY',
                from: 'tempHolderForDeckRecall',
                x: byID[deckID].x + (86-(byID[deckID].cardWidth ||103))/2,
                y: byID[deckID].y + (86-(byID[deckID].cardHeight||160))/2,
                count: 'all'
              });
            }
          }

          const holders = decks.map(d=>byID[d].parent).filter(d=>d);
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
            routine.push(c);
            c = {
              func:   'FLIP',
              holder: holders,
              face:   flip && flip.value == 'faceUp' ? 1 : 0
            };
          }
        }
        if(c.func == 'SHUFFLE_CARDS') {
          if(!c.args.holders)
            return;
          const holders = knownIDs(c.args.holders.value).map(id=>byID[id].type == 'seat' ? 'hand' : id);
          if(!holders.length)
            return;
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
            return;
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
            return;
          const args = c.args;
          // "switch" is PCIO's default: every object ends up on the side opposite
          // to the one the object on top currently shows
          const flipFace = (args.flipFace || {}).value || 'switch';
          const wholePile = (args.flipMode || {}).value == 'pile';
          // turning a whole pile over also reverses its order unless that is
          // switched off - reversing and flipping to the side of the top object
          // both need the objects in a collection ordered bottom to top
          const reverse = wholePile && (args.reverse || {}).value != 'none';
          const ordered = wholePile && (reverse || flipFace == 'switch');

          c = importWidgetQuery(routine, args, 'holders', 'holder', 'collection', {
            func:  'FLIP',
            count: wholePile ? 0 : 1
          }, ordered ? { collection: 'pcioPile', sortBy: 'z' } : {});
          if(!c)
            return;
          if(c.holder && c.holder.length == 1)
            c.holder = c.holder[0];
          if(!c.count)
            delete c.count;
          if(ordered) {
            if(c.holder) {
              routine.push({ func: 'SELECT', property: 'parent', relation: 'in', value: [].concat(c.holder), type: 'card', collection: 'pcioPile', sortBy: 'z' });
              delete c.holder;
            }
            c.collection = c.collection || 'pcioPile';
          }
          if(flipFace == 'faceUp' || flipFace == 'faceDown') {
            c.face = flipFace == 'faceDown' ? 0 : 1;
          } else if(flipFace == 'random') {
            // flip() rolls a face of its own for every object it is given
            c.faceCycle = 'random';
          } else if(ordered) {
            // GET leaves the variable alone for an empty pile, which nothing is
            // flipped in anyway - the default keeps it from becoming NaN
            routine.push('var pcioFace = 0');
            routine.push({ func: 'GET', collection: c.collection, property: 'activeFace', aggregation: 'last', variable: 'pcioFace' });
            routine.push('var pcioFace = 1 - ${pcioFace}');
            c.face = '${pcioFace}';
          } else if(flipFace == 'switch' && (Array.isArray(c.holder) || c.collection)) {
            // flipping the top object of one pile that way is just flipping it
            warn(`Flipping the top objects of several piles all to the same side is not supported - ${widgetName(widget)} flips each of them to its other side instead.`);
          }
          if(reverse) {
            routine.push(c);
            c = { note: 'Reverse the pile', func: 'SHUFFLE', collection: c.collection, mode: 'reverse' };
          }
        }
        if(c.func == 'CHANGE_TIMER_STATE') {
          if(!c.args.timers)
            return;
          if ((c.args.playState && c.args.playState.value)=="switch"){
            var mode = "toggle"
          } else if ((c.args.playState && c.args.playState.value)=="pause"){
            var mode = "pause"
          } else {
            var mode = "start"
          };
          c = {
            func: 'TIMER',
            timer: knownIDs(c.args.timers.value),
            mode: mode
          };
          if(!c.timer.length)
            return;

          if(c.timer.length == 1)
            c.timer = c.timer[0];
        }
        if(c.func == 'CHANGE_TIMER_TIME') {
          if(!c.args.timers)
            return;
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
            timer: knownIDs(c.args.timers.value),
            mode: mode,
            seconds: numberArgument(routine, c.args.seconds, 30)
          };
          if(!c.timer.length)
            return;
          if(c.timer.length == 1)
            c.timer = c.timer[0];
          if(c.seconds === undefined)
            c.seconds = 30;
          if(c.mode == 'reset' || c.seconds === 0)
            delete c.seconds;
        }
        if(c.func == 'CHANGE_COUNTER') {
          if(!c.args.counters)
            return;
          // PCIO used add/subtract before it settled on inc/dec
          const changeMode = c.args.counterChangeMode || c.args.changeMode;
          const value = numberArgument(routine, c.args.changeNumber, 0);
          const mode = { add: 'inc', subtract: 'dec' }[changeMode && changeMode.value] || (changeMode ? changeMode.value : 'set');

          // a counter with bounds is not simply counted on but calculated and
          // clamped for every counter it is applied to
          for(const counter of c.args.counters.value.filter(id=>counterBounds[id])) {
            if(mode == 'set') {
              routine.push(`var pcioCounter = ${value} + 0`);
              if(typeof value != 'number')
                routine.push('var pcioCounter = ${pcioCounter} || 0');
            } else {
              routine.push(...readCounter(counter, 'pcioCounter'));
              routine.push(`var pcioCounter = \${pcioCounter} ${mode == 'dec' ? '-' : '+'} ${value}`);
            }
            routine.push(...clampCounter(counter, 'pcioCounter'));
            if(mode != 'set')
              routine.push(...roundCounter('pcioCounter', value));
            routine.push({ func: 'LABEL', label: counter, value: '${pcioCounter}' });
          }

          const counters = c.args.counters.value.filter(id=>!counterBounds[id]);
          if(!counters.length)
            return;
          c = {
            func: 'LABEL',
            label: counters.length == 1 ? counters[0] : counters,
            mode,
            value
          };
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
            return;
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
            routine.push({
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
              routine.push(`var pcioFace = randInt 0 ${faces.length-1}`);
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
            return;
          c = {
            note:       'Spin spinners',
            func:       'CLICK',
            collection: c.args.spinners.value
          };
        }
        if(c.func == 'ROTATE_OBJECTS') {
          const target = importWidgetQuery(routine, c.args, 'objects', 'holder', 'collection', {
            count: (c.args.rotateMode || {}).value == 'top' ? 1 : 'all'
          });
          if(!target)
            return;
          const rotate = rotateOperation(target, routine, (c.args.changeRotation || {}).value || 'auto', (c.args.setRotation || {}).value);
          if(!rotate)
            return;
          c = rotate;
          if(c.holder && c.holder.length == 1)
            c.holder = c.holder[0];
        }
        if(c.func == 'SHIFT_OBJECTS') {
          // shift the contents of an ordered list of holders by one position,
          // optionally wrapping the last one around to the first
          const holders = knownIDs(c.args.holders ? c.args.holders.value : []);
          if(holders.length < 2)
            return;
          const reversed = (c.args.moveDirection || {}).value == 'reverse';
          const wrap = !c.args.moveMode || c.args.moveMode.value == 'wrap';
          const order = reversed ? holders.slice().reverse() : holders;
          const count = (c.args.objectsMode || {}).value == 'top' ? 1 : 'all';
          const steps = Math.min(+((wrap ? c.args.stepsWrap : c.args.stepsEdge) || {}).value || 1, holders.length);
          if((c.args.objectsMode || {}).value == 'custom')
            warn(`Shifting only a subset of the objects in a holder is not supported - ${widgetName(widget)} shifts all of them.`);

          const seats = holders.filter(id=>byID[id] && byID[id].type == 'seat');
          if(seats.length && seats.length < holders.length) {
            warn(`Shifting objects between a mix of holders and player seats has no VirtualTabletop equivalent - the step of ${widgetName(widget)} was skipped.`);
            return;
          }
          if(seats.length) {
            // a hand is one holder per room in VTT and it is the owner that makes
            // its cards a player's own, which is exactly what SHIFT passes on. the
            // seats are handed over as a written-out list so that the hands travel
            // along the order the automation gives rather than along the seat index
            const shift = {
              note: 'Pass the hands on',
              func: 'SHIFT',
              holders: seats,
              interval: steps,
              direction: reversed ? 'backward' : 'forward'
            };
            if(count == 1)
              shift.widgets = 'top';
            if(!wrap)
              shift.wrap = false;
            routine.push(shift);
            return;
          }

          if(wrap) {
            output.pcioShiftTempHolder = {
              id: 'pcioShiftTempHolder',
              type: 'holder',
              layout: 'custom',
              x: -200,
              y: -300
            };
          }
          for(let step=0; step<steps; ++step) {
            if(wrap)
              routine.push({ func: 'MOVE', from: order[order.length-1], to: 'pcioShiftTempHolder', count });
            for(let i=order.length-2; i>=0; --i)
              routine.push({ func: 'MOVE', from: order[i], to: order[i+1], count });
            if(wrap)
              routine.push({ func: 'MOVE', from: 'pcioShiftTempHolder', to: order[0], count });
          }
          return;
        }
        if(c.func == 'STAND_UP_PLAYER') {
          if(!c.args.seats)
            return;
          routine.push({
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
          warn(`The automation step "${pcioFuncNames[c.func] || c.func}" of ${widgetName(widget)} has no VirtualTabletop equivalent and was skipped.`);
          return;
        }
        routine.push(c);
      }

      importSteps(widget.clickRoutine ? (widget.clickRoutine.steps || widget.clickRoutine) : [], w.clickRoutine);

    } else if(widget.type == 'spinner') {
      w.type = widget.type;
      if(widget.options && JSON.stringify(widget.options) != JSON.stringify([ 1, 2, 3, 4, 5, 6 ]))
        w.options = widget.options;
      if(widget.value && widget.value != '🎲')
        w.value = widget.value;
      addDimensions(w, widget, 110, 110);
    } else {
      // keep the size and say what is missing instead of leaving a nameless
      // striped block where the widget used to be
      const typeName = pcioTypeNames[widget.type] || widget.type;
      w.width = widget.width || 100;
      w.height = widget.height || 100;
      w.type = 'label';
      w.text = `${typeName} not imported`;
      w.css ='background: repeating-linear-gradient(45deg, red, red 10px, darkred 10px, darkred 20px); color: white; text-shadow: 0 0 4px black;';
      warn(`Widgets of type "${typeName}" cannot be imported - the striped placeholder at ${Math.round(widget.x || 0)},${Math.round(widget.y || 0)} marks where ${widgetName(widget)} was.`);
    }

    if(w.image)
      w.image = mapName(w.image);

    output[widget.id] = w;
  }

  // whose turn it is - the seats are created after the turn button was read
  for(const seatID in turnAtSeat)
    if(output[seatID])
      output[seatID].turn = true;

  // grow every label that ended up shorter than one line of its own text
  for(const w of Object.values(output)) {
    if(w.type != 'label')
      continue;
    const minHeight = labelMinHeight(w);
    if((w.height ?? 20) < minHeight)
      w.height = minHeight;
  }

  for(const group of Object.values(groupedWarnings))
    warn(group.message(widgetNames(group.names), group.names.length));

  if(suppressedWarnings)
    warnings.push(`${suppressedWarnings} more note${suppressedWarnings > 1 ? 's are' : ' is'} not listed here.`);

  if(schemaVersion > knownSchemaVersion)
    warnings.unshift(`This file uses PlayingCards.io format ${schemaVersion} while the importer only knows up to ${knownSchemaVersion} - anything newer than that is missing.`);

  if(warnings.length) {
    output._meta.info.importerWarnings = warnings;
    Logging.log(`PCIO import (schema version ${schemaVersion || 'unknown'}): ${warnings.length} warnings: ${warnings.join(' ')}`);
  }
  output._meta.info.importerSchemaVersion = schemaVersion;

  return output;
}
