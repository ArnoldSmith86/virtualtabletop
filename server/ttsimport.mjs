import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import fetch from 'node-fetch';
import { BSON } from 'bson';

import Logging from './logging.mjs';

const imgSizeCache = {};
async function imgSize(url) {
  if(imgSizeCache[url])
    return imgSizeCache[url];

  const r = await fetch(url, { headers: { 'Range': 'bytes=0-40000' } });
  const buffer = await r.buffer();
  fs.writeFileSync('/tmp/out', buffer);
  if(buffer.toString('ascii', 1, 4) == 'PNG')
    return imgSizeCache[url] = [ buffer.readUInt32BE(16), buffer.readUInt32BE(20) ];
  for(let offset=4; offset<buffer.length; offset+=2) {
    offset += buffer.readUInt16BE(offset);
    if([ 0xC0, 0xC1, 0xC2 ].indexOf(buffer[offset+1])>-1)
      return imgSizeCache[url] = [ buffer.readUInt16BE(offset+7), buffer.readUInt16BE(offset+5) ];
  }
  return imgSizeCache[url] = [ 1, 1 ];
}

function processURL(url) {
  const match = url.match(/\/ugc\/[0-9]+\/[0-9A-F]+\//);
  return match ? `https://steamusercontent-a.akamaihd.net${match[0]}` : url.replace(/^http:/, 'https:');
}

let nextID = 1;
function getID(o) {
  return o.GUID || nextID++;
}

function extractNumber(property) {
  if(typeof property == 'object' && property !== null)
    return Object.values(property)[0];
  else
    return property;
}

async function addDeck(o, parent=null) {
  const firstDeckID = Math.floor(extractNumber((o.DeckIDs || [ o.CardID ])[0])/100);

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
  for(let cardID of o.DeckIDs || [ o.CardID ]) {
    cardID = extractNumber(cardID);
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
      cardType: cardID
    };
  }
  if(Object.keys(widgets).length > 2) {
    widgets[`${id}-pile`] = {
      id: `${id}-pile`,
      parent,
      type: 'pile',
      width: cardWidth,
      height: cardHeight,
      x: 800+extractNumber(o.Transform.posX)*25,
      y: 500-extractNumber(o.Transform.posZ)*25,
    };
  } else {
    for(const widget in widgets) {
      if(widgets[widget].type != 'deck') {
        widgets[widget].x = 800+extractNumber(o.Transform.posX)*25;
        widgets[widget].y = 500+extractNumber(o.Transform.posZ)*25;
        widgets[widget].parent = parent;
      }
    }
  }
  widgets[id] = deck;
  return widgets;
}

async function addBag(o, parent) {
  const widgets = {};
  widgets[o.GUID] = {
    id: o.GUID,
    parent,
    type: 'holder',
    owner: [],
    clickable: true,
    clickRoutine: [
      {
        func: 'SET',
        collection: [ o.GUID ],
        property: 'owner',
        value: []
      }
    ]
  };
  widgets[`${o.GUID}-toggle`] = {
    id: `${o.GUID}-toggle`,
    parent,
    type: 'button',
    clickRoutine: [
      {
        func: 'SET',
        collection: [ o.GUID ],
        property: 'owner'
      }
    ],
    x: 800+extractNumber(o.Transform.posX)*25,
    y: 500-extractNumber(o.Transform.posZ)*25,
    text: o.Nickname || 'Open\nBag'
  };
  if(o.ContainedObjects)
    Object.assign(widgets, await addRecursive(o.ContainedObjects, o.GUID));
  return widgets;
}

async function addRecursive(os, parent=null) {
  const widgets = {};

  for(const o of os) {
    if(o.CustomDeck)
      Object.assign(widgets, await addDeck(o, parent));
    else if(o.Name == 'Bag')
      Object.assign(widgets, await addBag(o, parent));
    else if(o.ContainedObjects && o.Name != 'DeckCustom' && o.Name != 'Deck')
      Object.assign(widgets, await addRecursive(o.ContainedObjects, parent));
  }

  return widgets;
}

function moveIntoBounds(widgets) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // 1. Find bounding box for all parent-less widgets
    for (let key in widgets) {
        let widget = widgets[key];
        if (widget.parent) continue;
        minX = Math.min(minX, (widget.x||0));
        minY = Math.min(minY, (widget.y||0));
        maxX = Math.max(maxX, (widget.x||0));
        maxY = Math.max(maxY, (widget.y||0));
    }

    const visibleWidth = 1400;
    const visibleHeight = (widgets.hand !== undefined) ? 600 : 800;

    // 2. Adjust each widget's position based on its proportional distance from bounding box edge
    for (let key in widgets) {
        let widget = widgets[key];
        if (widget.parent || key=='hand') continue;

        // Proportional movement
        let proportionX = (widget.x - minX) / (maxX - minX);
        widget.x = 50 + proportionX * visibleWidth;

        let proportionY = (widget.y - minY) / (maxY - minY);
        widget.y = 50 + proportionY * visibleHeight;
    }

    return widgets;
}

async function convertTTS(content, linkContent) {
  let json = {};

  if(linkContent) {
    json = BSON.deserialize(linkContent);
    fs.writeFileSync('/tmp/tts.json', JSON.stringify(json, null, '  '));
  } else {
    const zip = await JSZip.loadAsync(content);
    for(var file in zip.files)
      if(file.match(/\.json$/))
        json = JSON.parse(await zip.files[file].async('string'));
  }

  const widgets = await addRecursive(json.ObjectStates);

  if(json.TableURL) {
    widgets.back = {
      id: 'back',
      width: 1778,
      height: 1000,
      layer: -9,
      movable: false,
      image: processURL(json.TableURL),
      css: 'background-size: cover'
    };
  }

  if(json.Hands && json.Hands.Enable) {
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

  widgets._meta = {
    info: {
      name: json.SaveName,
      importerTemp: 'TTS',
      importerTime: +new Date()
    },
    version: 5
  };

  return moveIntoBounds(widgets);
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
