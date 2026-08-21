import fs from 'fs';

import CRC32 from 'crc-32';
import { BSON } from 'bson';

import Config from './config.mjs';
import { VERSION } from './fileupdater.mjs';
import Logging from './logging.mjs';
import Zip from './zip.mjs';

// node-fetch capped how much of a response it would buffer through its "size" option and
// gave up once that was exceeded. Node's built-in fetch has no such limit, so the body is
// read chunk by chunk and dropped at the same point - truncating it instead would hand
// back half an image, which both callers would then treat as a whole one.
async function fetchBuffer(url, options, maxBytes) {
  const response = await fetch(url, options);
  if(!response.body)
    return Buffer.alloc(0);

  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    chunks.push(chunk);
    length += chunk.length;
    if(length > maxBytes)
      throw new Error(`the response is bigger than ${maxBytes} bytes`);
  }
  return Buffer.concat(chunks, length);
}

// A TTS unit is about an inch, which is 50px on the VTT surface (a poker card is
// 3.5 units / 160px high). TTS tables are much bigger than the VTT surface, so
// the layout gets scaled down into the visible area by moveIntoBounds afterwards.
const pixelsPerUnit = 50;

// TTS objects are 3D meshes and planes without a size we could read, so these
// are the on-table footprints (in pixels, for an object at TTS scale 1) that
// come closest to how big the objects look in TTS. They are multiplied with the
// scale of the object.
const baseSize = {
  board:    600,
  tile:     150,
  token:    100,
  figurine:  60,
  dice:      50,
  piece:     50
};

// TTS dice objects, the values of CustomImage.CustomDice.Type and the TTS player
// colors that hand zones (and therefore VTT seats) are defined for.
const diceSides = { Die_4: 4, Die_6: 6, Die_6_Rounded: 6, Die_8: 8, Die_10: 10, Die_12: 12, Die_20: 20, Die_Piecepack: 6 };
const customDiceSides = [ 4, 6, 8, 10, 12, 20 ];
const diceShapes = [ 2, 4, 6, 8, 10, 12, 20 ];
const playerColors = {
  White:  '#ffffff',
  Brown:  '#703a16',
  Red:    '#da1917',
  Orange: '#f3631c',
  Yellow: '#e6e42d',
  Green:  '#31b32b',
  Teal:   '#21b198',
  Blue:   '#118ed7',
  Purple: '#9741da',
  Pink:   '#f570ce',
  Grey:   '#808080',
  Black:  '#404040'
};

// objects that only make sense in 3D: invisible zones and objects that are
// nothing but a mesh, a sound or a PDF
const invisibleObjects = /Trigger$|^(Fog|Custom_PDF|Custom_Audio|Tileset_)/;
const pieceObjects = /^(Backgammon|Block|Checker|Chess|Chinese_Checkers_Piece|Chip|Coin|Domino|Figurine|Mahjong|Pawn|PlayerPawn|go_game_piece|reversi)/;
const roundPieces = /^(Backgammon|Checker|Chip|Coin|PlayerPawn|go_game_piece|reversi)/;

// Everything that has to stay unique or be remembered for the length of one
// conversion. This cannot be module state: a conversion waits for images, so two
// players importing a save at the same time would hand out the same widget IDs.
function newImport() {
  return {
    usedIDs: new Set(),
    nextID: 1,
    // The fallback for an image whose dimensions could not be read is remembered for
    // the current import only - a host that times out once should not keep every later
    // import of that image pinned to a 1:1 aspect ratio.
    failedImages: {},
    // Everything that could not be brought over from TTS ends up in
    // _meta.info.importerWarnings, which the game details show as import notes.
    warnings: [],
    warned: new Set(),
    warningGroups: {},
    suppressedWarnings: 0
  };
}

// A mod can hold thousands of objects, so the report is capped: it is shown in the
// interface and stored in the room, which nobody is served by filling with
// thousands of lines.
const maxWarnings = 100;

function warn(imp, text) {
  if(imp.warned.has(text))
    return;
  imp.warned.add(text);
  if(imp.warnings.length < maxWarnings)
    imp.warnings.push(text);
  else
    ++imp.suppressedWarnings;
}

// A note that names the object it is about would repeat itself once per object, so
// the objects that share a problem are collected under one key and turned into a
// single line naming them once the whole save has been read.
function warnAbout(imp, key, o, message) {
  const group = imp.warningGroups[key] = imp.warningGroups[key] || { names: [], count: 0, message };
  const name = objectName(o);
  if(group.names.indexOf(name) == -1)
    group.names.push(name);
  ++group.count;
}

// how an object is called in a note - the name its author gave it if it has one
function objectName(o) {
  return `"${String((o || {}).Nickname || '').trim() || String((o || {}).Name || '').trim() || 'unnamed'}"`;
}

// a list of object names, shortened so that a mod full of them stays readable -
// objects that share a name are counted instead of naming one of them for all
function objectNames(names, count) {
  let list = names[0];
  if(names.length > 3)
    list = `${names.slice(0, 3).join(', ')} and ${names.length-3} more`;
  else if(names.length > 1)
    list = `${names.slice(0, -1).join(', ')} and ${names[names.length-1]}`;
  return names.length == 1 && count > 1 ? `${count}× ${list}` : list;
}

function importWarnings(imp) {
  for(const group of Object.values(imp.warningGroups))
    warn(imp, group.message(objectNames(group.names, group.count), group.count));
  if(imp.suppressedWarnings)
    imp.warnings.push(`${imp.suppressedWarnings} more note${imp.suppressedWarnings > 1 ? 's are' : ' is'} not listed here.`);
  return imp.warnings;
}

// 'The 1 decal' - a note about how many of something a save has counts only when
// there is more than one of it
function many(count, singular, plural) {
  return count > 1 ? `The ${count} ${plural}` : `The ${singular}`;
}

// what an object that exists in 3D only is called in a note
function invisibleLabel(name) {
  if(name.match(/^Custom_PDF/))
    return 'A PDF';
  if(name.match(/^Custom_Audio/))
    return 'An audio player';
  if(name.match(/^Fog/))
    return 'A hidden zone';
  if(name.match(/^Tileset_/))
    return '3D scenery';
  if(name.match(/Trigger$/))
    return 'A zone';
  return `An object of type "${name}"`;
}

// scripting is the one thing a mod can be built on that has no counterpart at all
const scriptWarning = 'This mod is scripted (Lua/XML UI) - VirtualTabletop cannot run that script, so everything it automated has to be done by hand.';

const imgSizeCache = {};
async function imgSize(url, imp) {
  if(imgSizeCache[url] || imp.failedImages[url])
    return imgSizeCache[url] || imp.failedImages[url];

  try {
    // only the first few KB are needed, but a host may ignore the Range header and
    // send the whole image - don't wait or buffer indefinitely for that
    const buffer = await fetchBuffer(url, { headers: { 'Range': 'bytes=0-40000' }, signal: AbortSignal.timeout(15000) }, 1000000);
    if(buffer.toString('ascii', 1, 4) == 'PNG')
      return imgSizeCache[url] = [ buffer.readUInt32BE(16), buffer.readUInt32BE(20) ];
    for(let offset=4; offset<buffer.length; offset+=2) {
      offset += buffer.readUInt16BE(offset);
      if([ 0xC0, 0xC1, 0xC2 ].indexOf(buffer[offset+1])>-1)
        return imgSizeCache[url] = [ buffer.readUInt16BE(offset+7), buffer.readUInt16BE(offset+5) ];
    }
  } catch(e) {
    Logging.log(`TTS import: could not read the dimensions of ${url}: ${e.toString()}`);
  }
  return imp.failedImages[url] = [ 1, 1 ];
}

function collectImageURLs(objects, urls=new Set()) {
  for(const o of objects || []) {
    if(o && typeof o == 'object' && !String(o.Name || '').match(invisibleObjects)) {
      for(const deck of Object.values(o.CustomDeck || {}))
        urls.add(processURL(deck.FaceURL));
      if(o.CustomImage && o.CustomImage.ImageURL)
        urls.add(processURL(o.CustomImage.ImageURL));
      collectImageURLs(o.ContainedObjects, urls);
    }
  }
  return urls;
}

// The images are only downloaded for their dimensions - a game can reference
// hundreds of them, so fill the cache with a couple of parallel requests instead
// of blocking the conversion of every single object on its own request.
async function prefetchImageSizes(objects, imp) {
  const queue = [ ...collectImageURLs(objects) ].filter(url=>url && !imgSizeCache[url]);
  await Promise.all(Array.from({ length: 16 }, async _=>{
    while(queue.length)
      await imgSize(queue.shift(), imp);
  }));
}

function processURL(url) {
  const u = String(url || '');
  const match = u.match(/\/ugc\/[0-9]+\/[0-9A-F]+\//);
  return match ? `https://steamusercontent-a.akamaihd.net${match[0]}` : u.replace(/^http:/, 'https:');
}

function getID(o, imp) {
  let id = String(o.GUID || imp.nextID++);
  while(imp.usedIDs.has(id))
    id = `${id}-${imp.nextID++}`;
  imp.usedIDs.add(id);
  return id;
}

function extractNumber(property) {
  if(typeof property == 'object' && property !== null)
    return Object.values(property)[0];
  else
    return property;
}

function number(property, fallback) {
  const n = +extractNumber(property);
  return isNaN(n) ? fallback : n;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function transformOf(o) {
  const t = o.Transform || {};
  return {
    posX:   number(t.posX, 0),
    posY:   number(t.posY, 0),
    posZ:   number(t.posZ, 0),
    rotY:   number(t.rotY, 0),
    rotZ:   number(t.rotZ, 0),
    scaleX: number(t.scaleX, 1) || 1,
    scaleZ: number(t.scaleZ, 1) || 1
  };
}

// The faces of a rollable object, or null if it isn't one. Numeric labels stay
// numbers so that they are rendered like the faces of a regular die.
function rotationValues(o) {
  if(!Array.isArray(o.RotationValues) || o.RotationValues.length < 2)
    return null;
  return o.RotationValues.map(r=>{
    const value = String((r || {}).Value === undefined ? '' : r.Value).trim();
    return value !== '' && !isNaN(+value) ? +value : value;
  });
}

function isFaceDown(o) {
  const rotZ = (transformOf(o).rotZ % 360 + 360) % 360;
  return rotZ > 90 && rotZ < 270;
}

function toColor(color, fallback=null) {
  if(typeof color != 'object' || color === null)
    return fallback;
  const channel = c=>clamp(Math.round(number(c, 0)*255), 0, 255).toString(16).padStart(2, '0');
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

function contrastColor(hex) {
  const [ r, g, b ] = [ 1, 3, 5 ].map(i=>parseInt(hex.substr(i, 2), 16) || 0);
  return r*0.3 + g*0.6 + b*0.1 > 128 ? '#000000' : '#ffffff';
}

// The html property of a widget goes through the property replacements, so a $ has
// to be escaped as well to show a text that happens to contain ${...} as it is.
function escapeHTML(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\$/g, '&#36;');
}

function shade(hex, factor) {
  return '#' + [ 1, 3, 5 ].map(i=>clamp(Math.round((parseInt(hex.substr(i, 2), 16) || 0) * factor), 0, 255).toString(16).padStart(2, '0')).join('');
}

// Positions the widget where the object was on the TTS table: x/y are the center
// of the object, the height above the table becomes the stacking order and the
// rotation around the vertical axis becomes the widget rotation. TTS spawns most
// objects rotated by 180° (facing the camera), so only the part of the rotation
// that actually turns the object on the table is kept.
function place(o, widget) {
  const t = transformOf(o);

  let rotation = (t.rotY % 180 + 180) % 180;
  if(rotation > 90)
    rotation -= 180;
  if(Math.round(rotation))
    widget.rotation = Math.round(rotation);

  if(widget.parent)
    return widget;

  widget.x = Math.round(800 + t.posX*pixelsPerUnit - (widget.width  || 0)/2);
  widget.y = Math.round(500 - t.posZ*pixelsPerUnit - (widget.height || 0)/2);
  if(t.posY > 0)
    widget.z = Math.round(t.posY*10);

  return widget;
}

async function addDeck(o, imp, parent=null) {
  const cardIDs = (o.DeckIDs || [ o.CardID ]).map(extractNumber).filter(id=>!isNaN(+id) && o.CustomDeck[Math.floor(+id/100)]);
  if(!cardIDs.length) {
    warnAbout(imp, 'deck without images', o, (names, count)=>`The card images of ${names} are not part of the save, so ${count > 1 ? 'those decks were' : 'that deck was'} not imported.`);
    Logging.log(`TTS import: skipping ${o.Name} (${o.GUID}): no card refers to an existing CustomDeck entry`);
    return null;
  }

  const firstDeckID = Math.floor(cardIDs[0]/100);

  let [ deckWidth, deckHeight ] = await imgSize(processURL(o.CustomDeck[firstDeckID].FaceURL), imp);

  const cardsPerRow = extractNumber(o.CustomDeck[firstDeckID].NumWidth)  || 10;
  const cardsPerCol = extractNumber(o.CustomDeck[firstDeckID].NumHeight) ||  7;

  let cardWidth = deckWidth / cardsPerRow;
  let cardHeight = deckHeight / cardsPerCol;

  let scale = 160/cardHeight;
  if(cardWidth > cardHeight)
    scale = 160/cardWidth;

  deckWidth *= scale;
  cardWidth *= scale;
  deckHeight *= scale;
  cardHeight *= scale;

  const widgets = {};
  const id = getID(o, imp);
  const deck = {
    id,
    parent,
    type: 'deck',
    cardTypes: {},
    cardDefaults: {
      width: Math.round(cardWidth),
      height: Math.round(cardHeight),
      enlarge: 4,
      css: {
        '--offsetX':    '${PROPERTY offsetX}',
        '--offsetY':    '${PROPERTY offsetY}',
        '--deckWidth':  '${PROPERTY deckWidth}',
        '--deckHeight': '${PROPERTY deckHeight}',
        '--width':      '${PROPERTY width}',
        '--height':     '${PROPERTY height}'
      }
    },
    faceTemplates: [
      // The back face is filled in below: which of the two kinds of back image the deck uses is only known
      // once its card types have been read.
      { objects: [] },
      {
        objects: [{
          type: 'image',
          css: {
            "background-size": "calc(var(--width) * var(--deckWidth) * 1px) calc(var(--height) * var(--deckHeight) * 1px)",
            "background-position": "calc(var(--width) * var(--offsetX) * -1px) calc(var(--height) * var(--offsetY) * -1px)"
          },
          dynamicProperties: {
            value: 'face',
            width: 'width',
            height: 'height'
          }
        }]
      }
    ]
  };

  const cardCounts = {};
  for(const cardID of cardIDs) {
    const deckID = Math.floor(cardID/100);
    const offset = cardID%100;

    const cardsPerRow = extractNumber(o.CustomDeck[deckID].NumWidth)  || 10;
    const cardsPerCol = extractNumber(o.CustomDeck[deckID].NumHeight) ||  7;

    deck.cardTypes[cardID] = {
      face: processURL(o.CustomDeck[deckID].FaceURL),
      back: processURL(o.CustomDeck[deckID].BackURL),
      offsetX: Math.round((offset%cardsPerRow)),
      offsetY: Math.round(Math.floor(offset/cardsPerRow)),
      deckWidth: Math.round(cardsPerRow),
      deckHeight: Math.round(cardsPerCol)
    };
    if(!o.CustomDeck[deckID].UniqueBack) {
      deck.cardTypes[cardID].simpleBack = deck.cardTypes[cardID].back;
      delete deck.cardTypes[cardID].back;
    }
    const i = cardCounts[`${id}-${cardID}`] = (cardCounts[`${id}-${cardID}`] || 0) + 1;
    widgets[`${id}-${cardID}-${i}`] = {
      id: `${id}-${cardID}-${i}`,
      type: 'card',
      parent: `${id}-pile`,
      deck: id,
      cardType: String(cardID)
    };
    if(!isFaceDown(o))
      widgets[`${id}-${cardID}-${i}`].activeFace = 1;
  }
  // TTS stores a back image per CustomDeck entry, as a sheet of individual backs when UniqueBack is set and
  // as a single image for the whole deck when it is not - so a card type carries either "back" or
  // "simpleBack", never both. Adding an object for each of them regardless left every imported deck with a
  // second, empty image object on its back face that no card type ever fills.
  const usedByACardType = property=>Object.values(deck.cardTypes).some(cardType=>cardType[property]);
  if(usedByACardType('back'))
    deck.faceTemplates[0].objects.push({
      type: 'image',
      css: {
        "background-size": "calc(var(--width) * var(--deckWidth) * 1px) calc(var(--height) * var(--deckHeight) * 1px)",
        "background-position": "calc(var(--width) * var(--offsetX) * -1px) calc(var(--height) * var(--offsetY) * -1px)"
      },
      dynamicProperties: {
        value: 'back',
        width: 'width',
        height: 'height'
      }
    });
  // the fallback also covers a deck whose cards have no back image at all, which would otherwise end up with
  // a back face without any object on it
  if(usedByACardType('simpleBack') || !deck.faceTemplates[0].objects.length)
    deck.faceTemplates[0].objects.push({
      type: 'image',
      color: 'transparent',
      dynamicProperties: {
        value: 'simpleBack',
        width: 'width',
        height: 'height'
      }
    });

  // widgets only holds the cards at this point - two of them still need a pile
  if(Object.keys(widgets).length > 1) {
    widgets[`${id}-pile`] = place(o, {
      id: `${id}-pile`,
      parent,
      type: 'pile',
      width: Math.round(cardWidth),
      height: Math.round(cardHeight)
    });
  } else {
    // a single card doesn't need a pile - place it on the table directly
    const position = place(o, { parent, width: Math.round(cardWidth), height: Math.round(cardHeight) });
    delete position.width;
    delete position.height;
    for(const widget of Object.values(widgets))
      Object.assign(widget, position);
  }
  widgets[id] = deck;
  return widgets;
}

// A bag becomes a button in the shape of a bag that carries the bag's name and the
// number of objects inside it, with a holder for the contents inside it. Clicking
// the button toggles whether the contents are shown. The holder is a child of the
// button so that the two always stay together, and it accepts every widget type
// because bags can hold anything in TTS.
async function addBag(o, imp, parent) {
  const id = getID(o, imp);
  const contents = await addRecursive(o.ContainedObjects, imp, id);
  // the cards of a stack live in its pile and a deck is invisible: what a player
  // gets out of the bag are the widgets that sit in the holder itself
  const children = Object.values(contents).filter(w=>w.parent == id && w.type != 'deck');
  if(!children.length) {
    // a bag that is empty after the import is nothing to play with
    if(Array.isArray(o.ContainedObjects) && o.ContainedObjects.length)
      warnAbout(imp, 'empty bag', o, (names, count)=>`Nothing that ${names} holds could be imported, so ${count > 1 ? 'those bags are' : 'that bag is'} not on the table.`);
    return null;
  }

  const color = toColor(o.ColorDiffuse, '#a97e4b');
  const bagID = `${id}-bag`;
  const widgets = {};

  widgets[bagID] = place(o, {
    id: bagID,
    parent,
    type: 'button',
    width: 130,
    height: 54,
    text: `${String(o.Nickname || '').trim() || 'Bag'} (${children.length})`,
    backgroundColor: color,
    borderColor: shade(color, 0.6),
    textColor: contrastColor(color),
    borderRadius: '20px 20px 6px 6px',
    // the border width is spelled out because the holder below is positioned inside
    // it: both have to shrink by the same factor when the layout is scaled down
    css: 'padding: 2px 4px; font-size: 12px; line-height: 1.15; border-width: 4px',
    clickRoutine: [
      {
        func: 'IF',
        operand1: `\${PROPERTY owner OF ${id}}`,
        relation: '==',
        operand2: null,
        thenRoutine: [ { func: 'SET', collection: [ id ], property: 'owner', value: [] } ],
        elseRoutine: [ { func: 'SET', collection: [ id ], property: 'owner' } ]
      }
    ]
  });

  // the contents stack in one spot, so the holder only has to be big enough for the
  // largest of them instead of being a mostly empty panel
  const largest = property=>Math.max(...children.map(w=>w[property] || 0), 60);
  const width = clamp(largest('width') + 24, 130, 340);

  widgets[id] = {
    id,
    parent: bagID,
    type: 'holder',
    // the button positions its children inside its 4px border, and a holder that is
    // wider than the button hangs over both of its sides evenly
    x: Math.round(-4 + (130-width)/2),
    y: 50,
    width,
    height: clamp(largest('height') + 24, 80, 340),
    borderRadius: '0 0 6px 6px',
    color: '#ffffffdd',
    css: `border: 2px solid ${shade(color, 0.6)}`,
    dropTarget: {},
    owner: []
  };

  Object.assign(widgets, contents);
  return widgets;
}

async function addImage(o, imp, parent) {
  const name = String(o.Name || '');
  const image = processURL(o.CustomImage.ImageURL);
  const back = o.CustomImage.ImageSecondaryURL ? processURL(o.CustomImage.ImageSecondaryURL) : null;
  const t = transformOf(o);

  let base = baseSize.tile;
  if(name.match(/^Custom_Board/))
    base = baseSize.board;
  else if(name.match(/^Custom_Token/))
    base = baseSize.token;
  else if(name.match(/^Figurine/))
    base = baseSize.figurine * number(o.CustomImage.ImageScalar, 1);

  const [ imageWidth, imageHeight ] = await imgSize(image, imp);
  const aspect = imageWidth && imageHeight ? imageWidth/imageHeight : 1;

  if(imp.failedImages[image])
    warnAbout(imp, 'unreadable image', o, (names, count)=>`The image of ${names} could not be read from the server it is stored on - ${count > 1 ? 'those objects are' : 'that object is'} square instead of having the shape of the image.`);

  const widget = {
    id: getID(o, imp),
    parent,
    width:  clamp(Math.round(base * t.scaleX * (aspect < 1 ? aspect : 1)), 8, 1600),
    height: clamp(Math.round(base * t.scaleZ / (aspect > 1 ? aspect : 1)), 8, 1000),
    image
  };

  const tile = o.CustomImage.CustomTile;
  if(tile) {
    // Box, Hex, Circle and Rounded custom tiles - the outline is all that can be kept
    if(number(tile.Type, 0) == 1)
      widget.css = 'clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)';
    if(number(tile.Type, 0) == 2)
      widget.borderRadius = '50%';
    if(number(tile.Type, 0) == 3)
      widget.borderRadius = 12;
  }

  if(back) {
    widget.faces = [ { image }, { image: back } ];
    widget.activeFace = isFaceDown(o) ? 1 : 0;
  }

  if(o.Locked)
    widget.movable = false;

  // locked and really big objects are the board and the background of a TTS table:
  // put them below the cards and pieces instead of on top of them
  if(o.Locked || name.match(/^Custom_Board/) || widget.width > 400 && widget.height > 400)
    widget.layer = -4;

  return { [widget.id]: place(o, widget) };
}

function addDice(o, imp, parent) {
  // TTS gives every object that can be rolled a RotationValues list: one entry per
  // face with the value that is up in that rotation. That is the only way to know
  // the faces of a die that is just a mesh (Custom_Model), and it also gives the
  // real labels of dice that don't simply count from 1.
  let faces = rotationValues(o);
  if(!faces) {
    let sides = diceSides[String(o.Name || '')];
    if(o.CustomImage && o.CustomImage.CustomDice)
      sides = customDiceSides[number(o.CustomImage.CustomDice.Type, 1)];
    if(!(sides > 1))
      sides = 6;
    faces = Array.from({ length: sides }, (unused, i)=>i+1);
  }

  const hasLabels = faces.some(f=>typeof f == 'string');
  const size = clamp(Math.round(baseSize.dice * transformOf(o).scaleX), 40, 200);

  const widget = {
    id: getID(o, imp),
    parent,
    type: 'dice',
    width: size,
    height: size,
    movable: true,
    color: toColor(o.ColorDiffuse, '#f0f0f0'),
    faces
  };

  // the face font is sized for a single digit, so word labels like 'Blue' need a
  // smaller one: derived from the longest word so that a face like 'Black (Joker)'
  // wraps into readable lines instead of being cut off
  if(hasLabels) {
    const longestWord = Math.max(...faces.map(f=>Math.max(...String(f).split(/\s+/).map(w=>w.length))), 2);
    const fontSize = clamp(Math.round(size*1.4/longestWord), 6, Math.round(size/4));
    widget.faceCSS = `font-size: ${fontSize}px; line-height: 1.1; word-break: break-word`;
  }

  // the 3D shapes only exist for these face counts - anything else stays flat
  if(diceShapes.indexOf(faces.length) > -1)
    widget.shape3d = true;

  return { [widget.id]: place(o, widget) };
}

function addText(o, imp, parent) {
  const text = String((o.Text || {}).Text || '').trim();
  if(!text)
    return null;

  const lines = text.split('\n');
  const fontSize = clamp(Math.round(number((o.Text || {}).fontSize, 64) * 0.35 * transformOf(o).scaleX), 10, 72);
  const widget = {
    id: getID(o, imp),
    parent,
    type: 'label',
    text,
    width:  clamp(Math.round(fontSize*0.62*Math.max(...lines.map(l=>l.length))), 40, 800),
    height: Math.round(lines.length*fontSize*1.3),
    css: `font-size: ${fontSize}px; color: ${toColor((o.Text || {}).colorstate, '#6d6d6d')}`
  };

  return { [widget.id]: place(o, widget) };
}

// A notecard holds as much text as its author typed, so the card grows with it
// instead of cutting the text off at a fixed height. Its title is the heading.
function addNotecard(o, imp, parent) {
  const title = String(o.Nickname || '').trim();
  const body = String(o.Description || '').trim();
  const paragraphs = (title ? [ title ] : []).concat(body ? body.split('\n') : []);
  if(!paragraphs.length)
    return null;

  // ~38 characters of the 13px font fit into a line of the 240px card, and the title
  // is followed by an empty line
  const rows = paragraphs.reduce((sum, p)=>sum + Math.max(1, Math.ceil(p.length/38)), title && body ? 1 : 0);
  const widget = {
    id: getID(o, imp),
    parent,
    width: 240,
    height: clamp(rows*15 + 16, 60, 500),
    movable: true,
    html: (title ? `<b>${escapeHTML(title)}</b><br>${body ? '<br>' : ''}` : '') + escapeHTML(body).replace(/\n/g, '<br>'),
    // the text is escaped and joined with <br>, so the runs of spaces the author typed have to survive
    css: 'background: #fdf8d8; color: #333333; border-radius: 4px; font-size: 13px; padding: 6px 8px; box-sizing: border-box; overflow-wrap: break-word; overflow: hidden; white-space: pre-wrap'
  };

  return { [widget.id]: place(o, widget) };
}

// Meshes, asset bundles and the built-in 3D pieces have no 2D representation at
// all, so they become plain colored pieces carrying their name. Unnamed ones are
// usually decoration of the 3D table and are left out.
function addPiece(o, imp, parent) {
  const name = String(o.Name || '');
  const text = String(o.Nickname || '').trim();
  const mesh = o.CustomMesh || name.match(/^Custom_(Model|Assetbundle)/);
  if(!text && !name.match(pieceObjects)) {
    if(mesh)
      warnAbout(imp, 'unnamed mesh', o, (names, count)=>`${names} ${count > 1 ? 'are 3D models' : 'is a 3D model'} without a name and without an image - ${count > 1 ? 'they were' : 'it was'} left out, as an unnamed model is usually decoration of the TTS table.`);
    return null;
  }

  if(mesh)
    warnAbout(imp, 'mesh as piece', o, (names, count)=>`${names} ${count > 1 ? 'are 3D models' : 'is a 3D model'} that cannot be shown in 2D - ${count > 1 ? 'they are on the table as colored pieces carrying their names' : 'it is on the table as a colored piece carrying its name'}.`);

  const size = clamp(Math.round(baseSize.piece * transformOf(o).scaleX), 40, 400);
  const color = toColor(o.ColorDiffuse, '#cccccc');
  const widget = {
    id: getID(o, imp),
    parent,
    width: size,
    height: size,
    borderRadius: name.match(roundPieces) ? '50%' : 8,
    text,
    // a plain widget is not painted with its color property, and its text starts in
    // the top left corner - which a round piece clips away
    css: `background-color: ${color}; border: 1px solid #0006; color: ${contrastColor(color)}; font-size: 10px; line-height: 1.1; display: flex; align-items: center; justify-content: center; text-align: center; word-break: break-word; overflow: hidden`
  };

  if(o.Locked)
    widget.movable = false;

  return { [widget.id]: place(o, widget) };
}

async function addObject(o, imp, parent) {
  const name = String(o.Name || '');

  if(name.match(invisibleObjects)) {
    // the hand zones are not lost - they become the seats
    if(name != 'HandTrigger')
      warnAbout(imp, `invisible ${name}`, o, (names, count)=>`${invisibleLabel(name)} cannot be shown on a 2D table: ${names} ${count > 1 ? 'were' : 'was'} not imported.`);
    return null;
  }
  if(String(o.LuaScript || '').trim() || String(o.XmlUI || '').trim())
    warn(imp, scriptWarning);
  if(o.States && Object.keys(o.States).length)
    warnAbout(imp, 'object states', o, (names, count)=>`${names} ${count > 1 ? 'have' : 'has'} several states in TTS - only the state that was on the table was imported.`);
  if(o.CustomDeck)
    return await addDeck(o, imp, parent);
  if(name.match(/Bag$/))
    return await addBag(o, imp, parent);
  if(name == 'Custom_Dice' || name.match(/^Die_/))
    return addDice(o, imp, parent);
  if(name == '3DText')
    return addText(o, imp, parent);
  if(name == 'Notecard')
    return addNotecard(o, imp, parent);
  if(Array.isArray(o.ContainedObjects) && o.ContainedObjects.length)
    return await addRecursive(stackedAt(o), imp, parent); // a stack of tokens/tiles or an unknown container
  if(o.CustomImage && o.CustomImage.ImageURL)
    return await addImage(o, imp, parent);
  if(rotationValues(o))
    return addDice(o, imp, parent); // a mesh that can be rolled, e.g. a Custom_Model die
  return addPiece(o, imp, parent);
}

// The objects of a stack are all in the same spot on the TTS table, and the
// transforms that are stored with them inside the stack are often the ones they had
// before they were stacked - so they are put where the stack is instead of where
// they claim to be, one above the other.
function stackedAt(o) {
  const t = transformOf(o);
  return o.ContainedObjects.map((contained, index)=>contained && typeof contained == 'object' ? Object.assign({}, contained, {
    Transform: Object.assign({}, transformOf(contained), { posX: t.posX, posY: t.posY + index/100, posZ: t.posZ, rotY: t.rotY })
  }) : contained);
}

async function addRecursive(os, imp, parent=null) {
  const widgets = {};

  for(const o of os || []) {
    if(!o || typeof o != 'object')
      continue;
    try {
      for(const widget of Object.values(await addObject(o, imp, parent) || {})) {
        if(!widget.parent)
          delete widget.parent; // no parent is the default - don't spell it out
        widgets[widget.id] = widget;
      }
    } catch(e) {
      // one broken object should not fail the whole import
      warnAbout(imp, 'broken object', o, (names, count)=>`${names} could not be converted and ${count > 1 ? 'were' : 'was'} left out.`);
      Logging.log(`TTS import: skipping ${o.Name} (${o.GUID}): ${e.toString()}`);
    }
  }

  return widgets;
}

// How much room a widget really takes up, as a box relative to its x/y. That is
// not simply width x height: a widget rotated by 90 degrees is as high as it is
// wide, and an opened bag reaches far below its button because the holder holding
// the contents is a child of it. The rotation happens around the center of the
// widget, so the box can start left of / above x/y and extend past width/height.
// Widgets nobody owns are hidden until a routine shows them - the holder of a bag
// is only included when the room that an opened bag needs is being asked for.
function widgetExtent(widget, byParent, includeHidden) {
  let x0 = 0, y0 = 0, x1 = widget.width || 0, y1 = widget.height || 0;

  for(const child of byParent[widget.id] || []) {
    if(!includeHidden && Array.isArray(child.owner) && !child.owner.length)
      continue;
    const box = widgetExtent(child, byParent, includeHidden);
    x0 = Math.min(x0, (child.x || 0) + box.x0);
    y0 = Math.min(y0, (child.y || 0) + box.y0);
    x1 = Math.max(x1, (child.x || 0) + box.x1);
    y1 = Math.max(y1, (child.y || 0) + box.y1);
  }

  if(widget.rotation) {
    const rad = widget.rotation*Math.PI/180;
    const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    // rotate the box around the center of the widget and take the upright box
    // around the result - that is what the surface has to have room for
    const cx = (widget.width || 0)/2, cy = (widget.height || 0)/2;
    const mx = (x0+x1)/2 - cx,        my = (y0+y1)/2 - cy;
    const hw = (x1-x0)/2,             hh = (y1-y0)/2;
    const rx = cx + Math.cos(rad)*mx - Math.sin(rad)*my;
    const ry = cy + Math.sin(rad)*mx + Math.cos(rad)*my;
    x0 = rx - (hw*cos + hh*sin); x1 = rx + (hw*cos + hh*sin);
    y0 = ry - (hw*sin + hh*cos); y1 = ry + (hw*sin + hh*cos);
  }

  return { x0, y0, x1, y1 };
}

// Every length the importer writes into a css string is a px value of its own
// making, so scaling them all keeps fonts, paddings and borders in proportion with
// the widget they belong to.
function scaleLengths(css, factor) {
  return String(css).replace(/(-?[0-9.]+)px/g, (all, length)=>`${Math.round(length*factor*100)/100}px`);
}

// Shrinking the layout makes the widgets themselves smaller instead of setting the
// scale property on the top level ones: a card dragged out of a pile or a token
// taken out of a bag becomes a top level widget itself, and would jump to full size
// if the scale it is rendered with belonged to its former parent.
function scaleWidget(widget, factor, keepPosition) {
  for(const property of keepPosition ? [ 'width', 'height' ] : [ 'width', 'height', 'x', 'y' ])
    if(typeof widget[property] == 'number')
      widget[property] = Math.round(widget[property]*factor);

  for(const property of [ 'css', 'faceCSS', 'borderRadius' ])
    if(typeof widget[property] == 'string')
      widget[property] = scaleLengths(widget[property], factor);
    else if(typeof widget[property] == 'number')
      widget[property] = Math.round(widget[property]*factor*100)/100;

  if(widget.cardDefaults) {
    widget.cardDefaults.width  = Math.round(widget.cardDefaults.width *factor);
    widget.cardDefaults.height = Math.round(widget.cardDefaults.height*factor);
    // enlarge is a multiple of the size of the card, which is smaller now: keep
    // showing a card that is looked at as big as one of a native VTT game
    widget.cardDefaults.enlarge = Math.round(clamp(4/factor, 4, 40));
  }
}

function moveIntoBounds(widgets, imp, top, bottom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const byParent = {};
  for(const widget of Object.values(widgets))
    if(widget.parent)
      (byParent[widget.parent] = byParent[widget.parent] || []).push(widget);

  // Widgets that are not on the surface at all: children move with their parent,
  // and a deck is invisible and has no position. Counting a deck as a widget at
  // (0, 0) would pull the whole bounding box to the origin. The box of a widget is
  // measured twice: as it is seen now, and as it is once a bag in it is opened.
  const placed = Object.values(widgets).filter(w=>!w.parent && w.x !== undefined)
    .map(w=>({ widget: w, box: widgetExtent(w, byParent, false), full: widgetExtent(w, byParent, true) }));

  // 1. Find bounding box for all parent-less widgets
  for(const { widget, box } of placed) {
    minX = Math.min(minX, widget.x + box.x0);
    minY = Math.min(minY, widget.y + box.y0);
    maxX = Math.max(maxX, widget.x + box.x1);
    maxY = Math.max(maxY, widget.y + box.y1);
  }
  if(minX > maxX)
    return widgets;

  // 2. Shrink the layout until it fits onto the surface and center it there. The
  //    layout is never stretched: objects that are next to each other in TTS
  //    should stay next to each other instead of being spread over the table.
  const scale = Math.round(Math.min(1, 1500/(maxX-minX || 1), (bottom-top-40)/(maxY-minY || 1))*1000)/1000;
  const offsetX =       (1600       - (maxX-minX)*scale)/2;
  const offsetY = top + (bottom-top - (maxY-minY)*scale)/2;

  // 3. Make every widget smaller by that factor, children included: their x/y is
  //    relative to their parent and shrinks with the rest of the layout.
  if(scale < 1) {
    warn(imp, `The table of this mod is bigger than the VirtualTabletop surface, so everything on it was scaled down to ${Math.round(scale*100)}% of the size it has in TTS.`);
    for(const widget of Object.values(widgets))
      scaleWidget(widget, scale, !widget.parent);
  }

  // 4. Put the top level widgets where the scaled down layout has them
  for(const { widget, box, full } of placed) {
    const left = (widget.x + box.x0 - minX)*scale + offsetX;
    const topY = (widget.y + box.y0 - minY)*scale + offsetY;

    // What is visible stays inside the band between the seats and the hand. What is
    // only there once a bag has been opened just has to stay on the surface, which
    // is where a player can reach it - outside of it, overflow: hidden swallows it.
    const loX =        (box.x0 - full.x0)*scale;
    const hiX = 1600 - (full.x1 - box.x0)*scale;
    const loY = Math.max(top,               (box.y0 - full.y0)*scale);
    const hiY = Math.min(bottom - (box.y1 - box.y0)*scale, 1000 - (full.y1 - box.y0)*scale);

    // x/y is the top left corner of the unrotated widget, which is not where its box
    // begins - a rotated widget sticks out of it on the side it turned towards.
    widget.x = Math.round(clamp(left, loX, Math.max(loX, hiX)) - box.x0*scale);
    widget.y = Math.round(clamp(topY, loY, Math.max(loY, hiY)) - box.y0*scale);
  }

  return widgets;
}

// Parts of a save that are not objects on the table and therefore never reach
// addObject: the notebook, the table itself and the settings around it.
function reportSaveContents(json, imp, seats) {
  if(String(json.LuaScript || '').trim() || String(json.XmlUI || '').trim())
    warn(imp, scriptWarning);

  const pages = Object.keys(json.TabStates || {}).length;
  if(pages)
    warn(imp, `The notebook of this mod (${pages} page${pages > 1 ? 's' : ''}) was not imported - VirtualTabletop keeps rules text in the game details instead.`);

  const snapPoints = (json.SnapPoints || []).length;
  if(snapPoints)
    warn(imp, `${many(snapPoints, 'snap point of the table was', 'snap points of the table were')} not imported - objects can be dropped anywhere, and only a holder keeps them in place.`);

  const decals = (json.Decals || []).length;
  if(decals)
    warn(imp, `${many(decals, 'decal on the table was', 'decals on the table were')} not imported.`);

  const drawn = (json.VectorLines || []).length;
  if(drawn)
    warn(imp, `${many(drawn, 'line drawn on the table was', 'lines drawn on the table were')} not imported.`);

  if((json.Turns || {}).Enable)
    warn(imp, 'The turn order of this mod was not imported - whose turn it is has to be agreed on by the players.');

  if(seats > 1)
    warn(imp, `VirtualTabletop has one hand for all players instead of one zone each: the ${seats} hand zones became seats, and every player sees their own cards in the hand at the bottom.`);

  if([ ...collectImageURLs(json.ObjectStates) ].some(url=>url.match(/^https?:/)))
    warn(imp, 'The images of this game are still loaded from the servers they are stored on - they disappear from the table if the mod is taken down there.');
}

async function convertTTS(content, linkContent, workshop={}) {
  let json = {};

  if(linkContent) {
    json = BSON.deserialize(linkContent);
  } else {
    for(const file in Zip.list(content))
      if(file.match(/\.json$/))
        json = JSON.parse(await Zip.readString(content, file));
  }

  const imp = newImport();
  await prefetchImageSizes(json.ObjectStates, imp);

  // Older saves list the hand zones in Hands.HandTransforms, newer ones store them
  // as HandTrigger objects with the player color in FogColor. VTT uses one hand for
  // all players, so only the set of colors matters - they become the seats.
  const handColors = [ ...new Set([
    ...((json.Hands || {}).HandTransforms || []).map(h=>String((h || {}).Color || '')),
    ...(json.ObjectStates || []).map(o=>o && String(o.Name || '') == 'HandTrigger' ? String(o.FogColor || '') : '')
  ].filter(c=>c)) ];
  const hasHand = handColors.length || json.Hands && json.Hands.Enable;

  // leave room for the seats at the top and the hand at the bottom
  const widgets = moveIntoBounds(await addRecursive(json.ObjectStates, imp), imp, handColors.length ? 50 : 0, hasHand ? 810 : 1000);

  reportSaveContents(json, imp, handColors.length);

  if(json.TableURL) {
    widgets.back = {
      id: 'back',
      x: 0,
      y: 0,
      width: 1600,
      height: 1000,
      layer: -9,
      movable: false,
      image: processURL(json.TableURL),
      css: 'background-size: cover'
    };
  }

  if(hasHand) {
    widgets.hand = {
      id: 'hand',
      type: 'holder',
      onEnter: { activeFace: 1 },
      onLeave: { activeFace: 0 },
      dropOffsetX: 10,
      dropOffsetY: 14,
      stackOffsetX: 40,
      childrenPerOwner: true,
      dropShadow: true,
      hidePlayerCursors: true,
      text: 'Your hand', // an empty holder is a blank band otherwise
      x: 50,
      y: 820,
      width: 1500,
      height: 180
    };
  }

  // The seats share one centered row above the table, so they get narrower when a
  // game has hand zones for many of the twelve TTS player colors instead of running
  // off the right edge of the surface.
  const seatPitch = Math.min(155, Math.floor(1580/(handColors.length || 1)));
  const seatOffset = Math.round((1600 - handColors.length*seatPitch)/2);

  handColors.forEach((color, index)=>{
    widgets[`seat-${index+1}`] = {
      id: `seat-${index+1}`,
      type: 'seat',
      index: index+1,
      x: seatOffset + index*seatPitch,
      y: 5,
      width: seatPitch - 10,
      height: 40,
      color: playerColors[color] || '#999999',
      colorEmpty: playerColors[color] || '#999999',
      hideWhenUnused: true
    };
  });

  const info = Object.assign({}, workshop, {
    importerTemp: 'TTS',
    importerTime: +new Date()
  });
  // the name of the save wins over the title of the workshop item it came from
  if(json.SaveName)
    info.name = String(json.SaveName);

  const warnings = importWarnings(imp);
  if(warnings.length) {
    info.importerWarnings = warnings;
    Logging.log(`TTS import: ${warnings.length} import notes: ${warnings.join(' ')}`);
  }

  widgets._meta = { info, version: VERSION };

  return widgets;
}

async function fromBSON(content, link) {
  return {
    TTS: {
      '0.json': await convertTTS(null, content, link ? await workshopMeta(link) : {})
    }
  };
}

async function fromZIP(content) {
  return await convertTTS(content);
}

function isTTSlink(link) {
  return link.match(/\?id=([0-9]+)/);
}

async function publishedFileDetails(id) {
  return (await (await fetch('http://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `itemcount=1&publishedfileids[0]=${id}`
  })).json()).response.publishedfiledetails[0];
}

async function resolveLink(link) {
  const id = isTTSlink(link);
  if(!id)
    return link;

  Logging.log(`resolving TTS link with ID ${id[1]}`);
  return (await publishedFileDetails(id[1])).file_url;
}

// The workshop thumbnail becomes the image of the imported game. It is stored as an
// asset like an uploaded image so that the game keeps its picture even when the
// workshop item disappears - and asked for at 400px because the full size preview is
// a multi-megapixel PNG.
async function storeThumbnail(url) {
  try {
    const request = `${url}${url.indexOf('?') > -1 ? '&' : '?'}imw=400&imh=400&ima=fit&impolicy=Letterbox`;
    const content = await fetchBuffer(request, { signal: AbortSignal.timeout(15000) }, 20000000);
    const asset = `${CRC32.buf(content)}_${content.length}`;
    if(!Config.resolveAsset(asset))
      fs.writeFileSync(`${Config.directory('assets')}/${asset}`, content);
    return `/assets/${asset}`;
  } catch(e) {
    Logging.log(`TTS import: could not store the workshop thumbnail ${url}: ${e.toString()}`);
    return null;
  }
}

// Workshop descriptions are BBCode and can be pages long: keep the text, drop the
// markup and cut it down to something that fits into the game details. The plain
// HTML that some of them contain is left alone: the game details write the
// description with innerText, so it is shown as the text it is.
function plainText(text) {
  const result = String(text || '')
    .replace(/\[\/?(b|i|u|h[1-3]|strike|spoiler|noparse|quote|code|list|olist|table|tr|td|th|img|url|previewyoutube|hr|carousel|nolinebreak|sub|sup|size|color|center)(=[^\]]*)?\]/gi, '')
    .replace(/\[\*\]/g, '- ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return result.length > 800 ? `${result.substr(0, 800).replace(/\s+\S*$/, '')}…` : result;
}

function numericTags(tags, pattern) {
  return [ ...new Set(tags.map(t=>(t.match(pattern) || [])[1]).filter(n=>n !== undefined).map(Number)) ].sort((a, b)=>a-b);
}

function range(values, asSpan) {
  const last = values[values.length-1];
  if(values[0] == last)
    return String(last);
  return asSpan ? `${values[0]}-${last}` : values.join(',');
}

// The workshop page of a game knows things that its save file does not: a thumbnail,
// a description and tags for the player count ('2', '4+') and the playing time
// ('30 minutes'). They become the metadata that the game shelf shows and filters by.
async function workshopMeta(link) {
  const id = isTTSlink(link);
  if(!id)
    return {};

  let details;
  try {
    details = await publishedFileDetails(id[1]) || {};
  } catch(e) {
    Logging.log(`TTS import: could not read the workshop details of ${link}: ${e.toString()}`);
    return {};
  }

  const meta = { attribution: `Imported from the Tabletop Simulator Steam Workshop:\nhttps://steamcommunity.com/sharedfiles/filedetails/?id=${id[1]}` };
  const tags = (details.tags || []).map(t=>String((t || {}).tag || ''));

  if(details.title)
    meta.name = String(details.title);

  if(details.preview_url) {
    const image = await storeThumbnail(String(details.preview_url).replace(/^http:/, 'https:'));
    if(image)
      meta.image = image;
  }

  const description = plainText(details.description);
  if(description)
    meta.description = description;

  // the player counts are tagged one by one and can be open ended ('4+'), the playing
  // times are the ends of a span
  const players = numericTags(tags, /^([0-9]+)\+?$/);
  if(players.length)
    meta.players = tags.some(t=>t.match(/^[0-9]+\+$/)) ? `${players[0]}+` : range(players, players[players.length-1]-players[0]+1 == players.length);

  const minutes = numericTags(tags, /^([0-9]+)\+? minutes$/);
  if(minutes.length)
    meta.time = range(minutes, true);

  return meta;
}

export default {
  fromBSON,
  fromZIP,
  isTTSlink,
  resolveLink
}
