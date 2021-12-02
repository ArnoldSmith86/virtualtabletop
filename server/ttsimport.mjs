import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

function processURL(url) {
  const match = url.match(/\/ugc\/[0-9]+\/[0-9A-F]+\//);
  return match ? `https://steamusercontent-a.akamaihd.net${match[0]}` : url;
}

function addDeck(o, parent=null) {
  const firstDeckID = Math.floor((o.DeckIDs || [ o.CardID ])[0]/100);

  const cardsPerRow = o.CustomDeck[firstDeckID].NumWidth  || 10;
  const cardsPerCol = o.CustomDeck[firstDeckID].NumHeight ||  7;

  const cardHeight = 197.4;
  const cardWidth = 128;

  const widgets = {};
  const deck = {
    id: o.GUID,
    parent,
    type: 'deck',
    cardTypes: {},
    cardDefaults: {
      width: cardWidth,
      height: cardHeight,
      enlarge: 3
    },
    faceTemplates: [
      {
        objects: [{
          type: 'image',
          width:  cardsPerRow * cardWidth,
          height: cardsPerCol * cardHeight,
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
          width:  cardsPerRow * cardWidth,
          height: cardsPerCol * cardHeight,
          dynamicProperties: {
            value: 'face',
            x: 'offsetX',
            y: 'offsetY'
          }
        }]
      }
    ]
  };

  for(const id of o.DeckIDs || [ o.CardID ]) {
    const deckID = Math.floor(id/100);
    const offset = id%100;
    deck.cardTypes[id] = {
      face: processURL(o.CustomDeck[deckID].FaceURL),
      back: processURL(o.CustomDeck[deckID].BackURL),
      offsetX: (offset%cardsPerRow) * -cardWidth,
      offsetY: Math.floor(offset/cardsPerRow) * -cardHeight
    };
    if(!o.CustomDeck[deckID].UniqueBack)
      deck.cardTypes[id].simpleBack = deck.cardTypes[id].back;
    widgets[`${o.GUID}-${id}`] = {
      id: `${o.GUID}-${id}`,
      type: 'card',
      parent: `${o.GUID}-pile`,
      deck: o.GUID,
      cardType: id
    };
  }
  widgets[`${o.GUID}-pile`] = {
    id: `${o.GUID}-pile`,
    parent,
    type: 'pile',
    width: cardWidth,
    height: cardHeight,
    x: 50,
    y: 50
  };
  widgets[o.GUID] = deck;
  return widgets;
}

function addBag(o, parent) {
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
    text: o.Nickname || 'Open\nBag'
  };
  Object.assign(widgets, addRecursive(o.ContainedObjects, o.GUID));
  return widgets;
}

function addRecursive(os, parent=null) {
  const widgets = {};

  for(const o of os) {
    if(o.CustomDeck)
      Object.assign(widgets, addDeck(o, parent));
    else if(o.Name == 'Bag')
      Object.assign(widgets, addBag(o, parent));
    else if(o.ContainedObjects && o.Name != 'DeckCustom' && o.Name != 'Deck')
      Object.assign(widgets, addRecursive(o.ContainedObjects, parent));
  }

  return widgets;
}

export default async function convertTTS(content) {
  const zip = await JSZip.loadAsync(content);

  let json = {};
  for(var file in zip.files)
    if(file.match(/\.json$/))
      json = JSON.parse(await zip.files[file].async('string'));

  const widgets = addRecursive(json.ObjectStates);
  let xOffset = 0;
  for(const id in widgets) {
    if(widgets[id].type == 'pile') {
      widgets[id].x += xOffset;
      xOffset += 50;
    }
  }

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

  if(json.Hands.Enable) {
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
