import JSZip from 'jszip';
import fetch from 'node-fetch';
import { BSON } from 'bson';

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
async function imgSize(url) {
  if(imgSizeCache[url])
    return imgSizeCache[url];

  try {
    const r = await fetch(url, { headers: { 'Range': 'bytes=0-40000' } });
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
  return imgSizeCache[url] = [ 1, 1 ];
}

function collectImageURLs(objects, urls=new Set()) {
  for(const o of objects || []) {
    if(o && typeof o == 'object') {
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
  const match = String(url || '').match(/\/ugc\/[0-9]+\/[0-9A-F]+\//);
  return match ? `https://steamusercontent-a.akamaihd.net${match[0]}` : String(url || '').replace(/^http:/, 'https:');
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
  if(!cardIDs.length)
    return null;

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
  if(Object.keys(widgets).length > 2) {
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

// A bag becomes a holder that is hidden until its button is clicked - and hides
// itself again when it is clicked. Bags can hold anything in TTS, so unlike a
// regular holder this one accepts every widget type.
async function addBag(o, parent) {
  const widgets = {};
  const id = getID(o);

  widgets[id] = place(o, {
    id,
    parent,
    type: 'holder',
    width: 120,
    height: 170,
    dropTarget: {},
    owner: [],
    clickable: true,
    clickRoutine: [
      {
        func: 'SET',
        collection: [ id ],
        property: 'owner',
        value: []
      }
    ]
  });

  widgets[`${id}-toggle`] = place(o, {
    id: `${id}-toggle`,
    parent,
    type: 'button',
    width: 120,
    height: 40,
    text: o.Nickname || 'Open\nBag',
    clickRoutine: [
      {
        func: 'SET',
        collection: [ id ],
        property: 'owner'
      }
    ]
  });

  if(o.ContainedObjects)
    Object.assign(widgets, await addRecursive(o.ContainedObjects, id));
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
    color: 'transparent',
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
  let sides = diceSides[String(o.Name || '')];
  if(o.CustomImage && o.CustomImage.CustomDice)
    sides = customDiceSides[number(o.CustomImage.CustomDice.Type, 1)];
  if(!(sides > 1))
    sides = 6;

  const size = clamp(Math.round(baseSize.dice * transformOf(o).scaleX), 40, 200);
  const widget = {
    id: getID(o),
    parent,
    type: 'dice',
    width: size,
    height: size,
    movable: true,
    color: toColor(o.ColorDiffuse, 'white'),
    faces: Array.from({ length: sides }, (unused, i)=>i+1),
    shape3d: true
  };

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

function addNotecard(o, parent) {
  const text = [ String(o.Nickname || '').trim(), String(o.Description || '').trim() ].filter(t=>t).join('\n\n');
  const widget = {
    id: getID(o),
    parent,
    type: 'label',
    text,
    width: 240,
    height: 160,
    movable: true,
    css: 'background: #fdf8d8; color: #333333; border-radius: 4px; font-size: 13px'
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
    color,
    borderRadius: name.match(roundPieces) ? '50%' : 8,
    text,
    css: `font-size: 10px; overflow: hidden; border: 1px solid #0006; color: ${contrastColor(color)}`
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

  // 1. Find bounding box for all parent-less widgets
  for(const widget of Object.values(widgets)) {
    if(widget.parent)
      continue;
    minX = Math.min(minX, widget.x || 0);
    minY = Math.min(minY, widget.y || 0);
    maxX = Math.max(maxX, (widget.x || 0) + (widget.width  || 0));
    maxY = Math.max(maxY, (widget.y || 0) + (widget.height || 0));
  }
  if(minX > maxX)
    return widgets;

  // 2. Shrink the layout until it fits onto the surface and center it there. The
  //    layout is never stretched: objects that are next to each other in TTS
  //    should stay next to each other instead of being spread over the table.
  const scale = Math.min(1, 1500/(maxX-minX || 1), (bottom-top-40)/(maxY-minY || 1));
  const offsetX =       (1600       - (maxX-minX)*scale)/2;
  const offsetY = top + (bottom-top - (maxY-minY)*scale)/2;

  for(const widget of Object.values(widgets)) {
    if(widget.parent)
      continue;
    widget.x = clamp(Math.round(((widget.x || 0) - minX)*scale + offsetX),   0, Math.max(0,   1600 - (widget.width  || 0)));
    widget.y = clamp(Math.round(((widget.y || 0) - minY)*scale + offsetY), top, Math.max(top, bottom - (widget.height || 0)));
  }

  return widgets;
}

async function convertTTS(content, linkContent) {
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
  await prefetchImageSizes(json.ObjectStates);

  const handColors = ((json.Hands || {}).HandTransforms || []).map(h=>String((h || {}).Color || '')).filter(c=>c);
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
      x: 50,
      y: 820,
      width: 1500,
      height: 180
    };
  }

  // TTS defines one hand zone per player color - VTT uses one hand for all
  // players, so the colors become the seats that share it
  handColors.forEach((color, index)=>{
    widgets[`seat-${index+1}`] = {
      id: `seat-${index+1}`,
      type: 'seat',
      index: index+1,
      x: 20 + index*155,
      y: 5,
      width: 150,
      height: 40,
      color: playerColors[color] || '#999999',
      colorEmpty: playerColors[color] || '#999999',
      hideWhenUnused: true
    };
  });

  widgets._meta = {
    info: {
      name: json.SaveName,
      importerTemp: 'TTS',
      importerTime: +new Date()
    },
    version: 5
  };

  return widgets;
}

async function fromBSON(content) {
  return {
    TTS: {
      '0.json': await convertTTS(null, content)
    }
  };
}

async function fromZIP(content) {
  return await convertTTS(content);
}

function isTTSlink(link) {
  return link.match(/\?id=([0-9]+)/);
}

async function resolveLink(link) {
  const id = isTTSlink(link);
  if(!id)
    return link;

  Logging.log(`resolving TTS link with ID ${id[1]}`);
  return (await (await fetch('http://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `itemcount=1&publishedfileids[0]=${id[1]}`
  })).json()).response.publishedfiledetails[0].file_url;
}

export default {
  fromBSON,
  fromZIP,
  isTTSlink,
  resolveLink
}
