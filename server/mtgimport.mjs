import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

export default async function convertMTG(content) {
  const zip = await JSZip.loadAsync(content);

  const dfcMap = {};
  const decks = {};
  const widgets = {};
  let id = 1;

  for(const file in zip.files) {
    const content = await zip.files[file].async('string');
    const matches = [...content.matchAll(/srcset[^>]*(http[^ ']+)( 3x|')/g)];
    if(matches.length == 3) {
      dfcMap[matches[0][1]] = matches[2][1];
      continue;
    }
    const cardMatches = [...content.matchAll(/([^\/"]+)"><img alt="([^"]+)" class="[^"]+" src="([^"]*)" \/>|Sideboard/g)];
    const title = content.match(/<span>([^<]+)<\/span>/) ? content.match(/<span>([^<]+)<\/span>/)[1] : file;
    decks[title] = { cards: [], sideboard: [] };

    let isSideboard = false;
    for(const card of cardMatches) {
      if(card[0] == 'Sideboard') {
        isSideboard = true;
        continue;
      }
      decks[title][isSideboard ? 'sideboard' : 'cards'].push([
        card[1],
        card[2],
        card[3]
      ]);
    }
  }

  for(const deckTitle in decks) {
    widgets[deckTitle] = {
      id: deckTitle,
      type: 'deck',
      cardDefaults: {
        width: 115,
        height: 160,
        enlarge: 5
      },
      cardTypes: {},
      faceTemplates: [
        {
          objects: [
            {
              type: 'image',
              color: 'black',
              width: 115,
              height: 160,
              value: decks[deckTitle].cards[0][2].replace(/[^\/]+$/, 'back.jpg')
            }
          ],
          radius: 5
        },
        {
          objects: [
            {
              type: 'image',
              color: 'black',
              width: 115,
              height: 160,
              dynamicProperties: {
                value: 'face'
              }
            }
          ],
          radius: 5
        }
      ]
    };
    widgets[deckTitle + '_pile'] = {
      id: deckTitle + '_pile',
      type: 'pile',
      width: 115,
      height: 160
    };
    let i=1;
    for(const card of decks[deckTitle].cards) {
      widgets[deckTitle].cardTypes[i] = {
        face: card[2]
      };
      widgets[deckTitle + '_' + i] = {
        id: deckTitle + '_' + i,
        type: 'card',
        parent: deckTitle + '_pile',
        deck: deckTitle,
        cardType: i
      };
      ++i;
    }
  }

  widgets._meta = {
    info: {
      name: Object.keys(decks).join(' vs '),
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
