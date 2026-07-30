import fs from 'fs';

import CRC32 from 'crc-32';
import JSZip from 'jszip';
import fetch from 'node-fetch';
import { BSON } from 'bson';

import Config from './config.mjs';
import Logging from './logging.mjs';

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

const imgSizeCache = {};
// The fallback for an image whose dimensions could not be read is remembered for
// the current import only - a host that times out once should not keep every later
// import of that image pinned to a 1:1 aspect ratio.
let imgSizeFailed = {};
async function imgSize(url) {
  if(imgSizeCache[url] || imgSizeFailed[url])
    return imgSizeCache[url] || imgSizeFailed[url];

  try {
    // only the first few KB are needed, but a host may ignore the Range header and
    // send the whole image - don't wait or buffer indefinitely for that
    const r = await fetch(url, { headers: { 'Range': 'bytes=0-40000' }, signal: AbortSignal.timeout(15000), size: 20000000 });
    const buffer = await r.buffer();
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
  return imgSizeFailed[url] = [ 1, 1 ];
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
async function prefetchImageSizes(objects) {
  const queue = [ ...collectImageURLs(objects) ].filter(url=>url && !imgSizeCache[url]);
  await Promise.all(Array.from({ length: 16 }, async _=>{
    while(queue.length)
      await imgSize(queue.shift());
  }));
}

function processURL(url) {
  const u = String(url || '');
  const match = u.match(/\/ugc\/[0-9]+\/[0-9A-F]+\//);
  return match ? `https://steamusercontent-a.akamaihd.net${match[0]}` : u.replace(/^http:/, 'https:');
}

let nextID = 1;
let usedIDs = new Set();
function getID(o) {
  let id = String(o.GUID || nextID++);
  while(usedIDs.has(id))
    id = `${id}-${nextID++}`;
  usedIDs.add(id);
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

function escapeHTML(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

async function addDeck(o, parent=null) {
  const cardIDs = (o.DeckIDs || [ o.CardID ]).map(extractNumber).filter(id=>!isNaN(+id) && o.CustomDeck[Math.floor(+id/100)]);
  if(!cardIDs.length) {
    Logging.log(`TTS import: skipping ${o.Name} (${o.GUID}): no card refers to an existing CustomDeck entry`);
    return null;
  }

  const firstDeckID = Math.floor(cardIDs[0]/100);

  let [ deckWidth, deckHeight ] = await imgSize(processURL(o.CustomDeck[firstDeckID].FaceURL));

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
  const id = getID(o);
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
      {
        objects: [{
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
        },{
          type: 'image',
          color: 'transparent',
          dynamicProperties: {
            value: 'simpleBack',
            width: 'width',
            height: 'height'
          }
        }]
      },
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
async function addBag(o, parent) {
  const id = getID(o);
  const contents = await addRecursive(o.ContainedObjects, id);
  // the cards of a stack live in its pile and a deck is invisible: what a player
  // gets out of the bag are the widgets that sit in the holder itself
  const children = Object.values(contents).filter(w=>w.parent == id && w.type != 'deck');
  if(!children.length)
    return null; // a bag that is empty after the import is nothing to play with

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
    css: 'padding: 2px 4px; font-size: 12px; line-height: 1.15',
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

async function addImage(o, parent) {
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

  const [ imageWidth, imageHeight ] = await imgSize(image);
  const aspect = imageWidth && imageHeight ? imageWidth/imageHeight : 1;

  const widget = {
    id: getID(o),
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

function addDice(o, parent) {
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
    id: getID(o),
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

function addText(o, parent) {
  const text = String((o.Text || {}).Text || '').trim();
  if(!text)
    return null;

  const lines = text.split('\n');
  const fontSize = clamp(Math.round(number((o.Text || {}).fontSize, 64) * 0.35 * transformOf(o).scaleX), 10, 72);
  const widget = {
    id: getID(o),
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
function addNotecard(o, parent) {
  const title = String(o.Nickname || '').trim();
  const body = String(o.Description || '').trim();
  const paragraphs = (title ? [ title ] : []).concat(body ? body.split('\n') : []);
  if(!paragraphs.length)
    return null;

  // ~38 characters of the 13px font fit into a line of the 240px card, and the title
  // is followed by an empty line
  const rows = paragraphs.reduce((sum, p)=>sum + Math.max(1, Math.ceil(p.length/38)), title && body ? 1 : 0);
  const widget = {
    id: getID(o),
    parent,
    width: 240,
    height: clamp(rows*15 + 16, 60, 500),
    movable: true,
    html: (title ? `<b>${escapeHTML(title)}</b><br>${body ? '<br>' : ''}` : '') + escapeHTML(body).replace(/\n/g, '<br>'),
    css: 'background: #fdf8d8; color: #333333; border-radius: 4px; font-size: 13px; padding: 6px 8px; box-sizing: border-box; overflow-wrap: break-word; overflow: hidden'
  };

  return { [widget.id]: place(o, widget) };
}

// Meshes, asset bundles and the built-in 3D pieces have no 2D representation at
// all, so they become plain colored pieces carrying their name. Unnamed ones are
// usually decoration of the 3D table and are left out.
function addPiece(o, parent) {
  const name = String(o.Name || '');
  const text = String(o.Nickname || '').trim();
  if(!text && !name.match(pieceObjects))
    return null;

  const size = clamp(Math.round(baseSize.piece * transformOf(o).scaleX), 40, 400);
  const color = toColor(o.ColorDiffuse, '#cccccc');
  const widget = {
    id: getID(o),
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

async function addObject(o, parent) {
  const name = String(o.Name || '');

  if(name.match(invisibleObjects))
    return null;
  if(o.CustomDeck)
    return await addDeck(o, parent);
  if(name.match(/Bag$/))
    return await addBag(o, parent);
  if(name == 'Custom_Dice' || name.match(/^Die_/))
    return addDice(o, parent);
  if(name == '3DText')
    return addText(o, parent);
  if(name == 'Notecard')
    return addNotecard(o, parent);
  if(Array.isArray(o.ContainedObjects) && o.ContainedObjects.length)
    return await addRecursive(o.ContainedObjects, parent); // a stack of tokens/tiles or an unknown container
  if(o.CustomImage && o.CustomImage.ImageURL)
    return await addImage(o, parent);
  if(rotationValues(o))
    return addDice(o, parent); // a mesh that can be rolled, e.g. a Custom_Model die
  return addPiece(o, parent);
}

async function addRecursive(os, parent=null) {
  const widgets = {};

  for(const o of os || []) {
    if(!o || typeof o != 'object')
      continue;
    try {
      for(const widget of Object.values(await addObject(o, parent) || {})) {
        if(!widget.parent)
          delete widget.parent; // no parent is the default - don't spell it out
        widgets[widget.id] = widget;
      }
    } catch(e) {
      // one broken object should not fail the whole import
      Logging.log(`TTS import: skipping ${o.Name} (${o.GUID}): ${e.toString()}`);
    }
  }

  return widgets;
}

function moveIntoBounds(widgets, top, bottom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // Widgets that are not on the surface at all: children move with their parent,
  // and a deck is invisible and has no position. Counting a deck as a widget at
  // (0, 0) would pull the whole bounding box to the origin.
  const placed = Object.values(widgets).filter(w=>!w.parent && w.x !== undefined);

  // 1. Find bounding box for all parent-less widgets
  for(const widget of placed) {
    minX = Math.min(minX, widget.x);
    minY = Math.min(minY, widget.y);
    maxX = Math.max(maxX, widget.x + (widget.width  || 0));
    maxY = Math.max(maxY, widget.y + (widget.height || 0));
  }
  if(minX > maxX)
    return widgets;

  // 2. Shrink the layout until it fits onto the surface and center it there. The
  //    layout is never stretched: objects that are next to each other in TTS
  //    should stay next to each other instead of being spread over the table.
  const scale = Math.round(Math.min(1, 1500/(maxX-minX || 1), (bottom-top-40)/(maxY-minY || 1))*1000)/1000;
  const offsetX =       (1600       - (maxX-minX)*scale)/2;
  const offsetY = top + (bottom-top - (maxY-minY)*scale)/2;

  for(const widget of placed) {
    const width  = widget.width  || 0;
    const height = widget.height || 0;

    // The objects are scaled along with the distances between them - scaling only
    // the positions would let everything overlap on a table bigger than the surface.
    // The scale property keeps the center of a widget in place, so its position is
    // derived from the center as well, and x/y stay the top left corner of the
    // unscaled widget: the visible box is centered inside it.
    const inset = (1-scale)/2;
    const left = (widget.x + width /2 - minX)*scale + offsetX - width *scale/2;
    const topY = (widget.y + height/2 - minY)*scale + offsetY - height*scale/2;

    // a widget that is higher than the band between the seats and the hand cannot
    // be kept inside it - a full table board is allowed to use the whole surface
    const fits = height*scale <= bottom-top;
    const lo = fits ? top    : 0;
    const hi = fits ? bottom : 1000;
    widget.x = Math.round(clamp(left, 0,  Math.max(0,  1600 - width *scale)) - width *inset);
    widget.y = Math.round(clamp(topY, lo, Math.max(lo, hi   - height*scale)) - height*inset);
    if(scale < 1)
      widget.scale = scale;
  }

  return widgets;
}

async function convertTTS(content, linkContent, workshop={}) {
  let json = {};

  if(linkContent) {
    json = BSON.deserialize(linkContent);
  } else {
    const zip = await JSZip.loadAsync(content);
    for(var file in zip.files)
      if(file.match(/\.json$/))
        json = JSON.parse(await zip.files[file].async('string'));
  }

  usedIDs = new Set();
  imgSizeFailed = {};
  await prefetchImageSizes(json.ObjectStates);

  // Older saves list the hand zones in Hands.HandTransforms, newer ones store them
  // as HandTrigger objects with the player color in FogColor. VTT uses one hand for
  // all players, so only the set of colors matters - they become the seats.
  const handColors = [ ...new Set([
    ...((json.Hands || {}).HandTransforms || []).map(h=>String((h || {}).Color || '')),
    ...(json.ObjectStates || []).map(o=>o && String(o.Name || '') == 'HandTrigger' ? String(o.FogColor || '') : '')
  ].filter(c=>c)) ];
  const hasHand = handColors.length || json.Hands && json.Hands.Enable;

  // leave room for the seats at the top and the hand at the bottom
  const widgets = moveIntoBounds(await addRecursive(json.ObjectStates), handColors.length ? 50 : 0, hasHand ? 810 : 1000);

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
      text: 'Hand', // an empty holder is a blank band otherwise
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

  widgets._meta = { info, version: 5 };

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
    const content = Buffer.from(await (await fetch(request, { signal: AbortSignal.timeout(15000), size: 20000000 })).arrayBuffer());
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
// markup and cut it down to something that fits into the game details.
function plainText(text) {
  const result = String(text || '')
    .replace(/\[\/?(b|i|u|h[1-3]|strike|spoiler|noparse|quote|code|list|olist|table|tr|td|th|img|url|previewyoutube)(=[^\]]*)?\]/gi, '')
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
