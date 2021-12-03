import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import fetch from 'node-fetch';

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

async function addDeck(o, parent=null) {
  const firstDeckID = Math.floor((o.DeckIDs || [ o.CardID ])[0]/100);

  let [ deckWidth, deckHeight ] = await imgSize(processURL(o.CustomDeck[firstDeckID].FaceURL));

  const cardsPerRow = o.CustomDeck[firstDeckID].NumWidth  || 10;
  const cardsPerCol = o.CustomDeck[firstDeckID].NumHeight ||  7;

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
      width: cardWidth,
      height: cardHeight,
      enlarge: 4
    },
    faceTemplates: [
      {
        objects: [{
          type: 'image',
          width:  deckWidth,
          height: deckHeight,
          dynamicProperties: {
            value: 'back',
            x: 'offsetX',
            y: 'offsetY'
          }
        },{
          type: 'image',
          width:  cardWidth,
          height: cardHeight,
          color: 'transparent',
          dynamicProperties: {
            value: 'simpleBack'
          }
        }]
      },
      {
        objects: [{
          type: 'image',
          width:  deckWidth,
          height: deckHeight,
          dynamicProperties: {
            value: 'face',
            x: 'offsetX',
            y: 'offsetY'
          }
        }]
      }
    ]
  };

  for(const cardID of o.DeckIDs || [ o.CardID ]) {
    const deckID = Math.floor(cardID/100);
    const offset = cardID%100;

    deck.cardTypes[cardID] = {
      face: processURL(o.CustomDeck[deckID].FaceURL),
      back: processURL(o.CustomDeck[deckID].BackURL),
      offsetX: (offset%cardsPerRow) * -cardWidth,
      offsetY: Math.floor(offset/cardsPerRow) * -cardHeight
    };
    if(!o.CustomDeck[deckID].UniqueBack) {
      deck.cardTypes[cardID].simpleBack = deck.cardTypes[cardID].back;
      delete deck.cardTypes[cardID].back;
    }
    widgets[`${id}-${cardID}`] = {
      id: `${id}-${cardID}`,
      type: 'card',
      parent: `${id}-pile`,
      deck: id,
      cardType: cardID
    };
  }
  widgets[`${id}-pile`] = {
    id: `${id}-pile`,
    parent,
    type: 'pile',
    width: cardWidth,
    height: cardHeight,
    x: 800+o.Transform.posX*25,
    y: 500-o.Transform.posZ*25,
  };
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
    x: 800+o.Transform.posX*25,
    y: 500-o.Transform.posZ*25,
    text: o.Nickname || 'Open\nBag'
  };
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

export default async function convertTTS(content) {
  const zip = await JSZip.loadAsync(content);

  let json = {};
  for(var file in zip.files)
    if(file.match(/\.json$/))
      json = JSON.parse(await zip.files[file].async('string'));

  const widgets = await addRecursive(json.ObjectStates);

  if(json.TableURL) {
    widgets.back = {
      id: 'back',
      width: 1600,
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
      image: '',
      rules: '',
      bgg: '',
      year: 0,
      mode: 'vs',
      time: 30,
      players: '2-4',
      language: 'US',
      variant: '',
      link: '',
      attribution: ''
    },
    version: 5
  };

  return widgets;
}
