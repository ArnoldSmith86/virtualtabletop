import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

function processURL(url) {
  const match = url.match(/\/ugc\/[0-9]+\/[0-9A-F]+\//);
  return match ? `https://steamusercontent-a.akamaihd.net${match[0]}` : url;
}

export default async function convertTTS(content) {
  const zip = await JSZip.loadAsync(content);

  let json = {};
  for(var file in zip.files)
    if(file.match(/\.json$/))
      json = JSON.parse(await zip.files[file].async('string'));

  const widgets = {};
  for(const o of json.ObjectStates) {
    if(o.CustomDeck) {
      const firstDeckID = Math.floor((o.DeckIDs || [ o.CardID ])[0]/100);

      const cardsPerRow = o.CustomDeck[firstDeckID].NumWidth  || 10;
      const cardsPerCol = o.CustomDeck[firstDeckID].NumHeight ||  7;

      const cardHeight = 197.4;
      const cardWidth = 128;

      console.log(o.GUID);
      const deck = {
        id: o.GUID,
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
      }
      widgets[o.GUID] = deck;
    }
  }

  return widgets;
}
