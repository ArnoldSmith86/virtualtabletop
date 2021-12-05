import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

export default async function convertMTG(content) {
  const zip = await JSZip.loadAsync(content);

  const decks = {};
  const widgets = {};
  let id = 1;

  for(const file in zip.files) {
    const content = await zip.files[file].async('string');

    const data = JSON.parse(content.match(/DeckSampleHand" data-react-props="([^"]+)/)[1].replace(/&quot;/g, '"'));
    const title = data.deck.title || content.match(/<h1.*?\n(.+)/)[1];
    decks[title] = { cards: [], sideboard: [] };

    for(const card of data.deck.entries) {
      decks[title][card.type == 'maindeck' ? 'cards' : 'sideboard'].push({
        face: card.card_database.images.length ? card.card_database.images[card.card_database.images.length-1].url : card.card_database.image_url,
        quantity: card.quantity
      });
    }
  }

  for(const deckTitle in decks) {
    widgets[deckTitle] = {
      id: deckTitle,
      type: 'deck',
      cardDefaults: {
        width: 115,
        height: 160,
        enlarge: 5,
        clickRoutine: [
          {
            func: 'IF',
            condition: '${PROPERTY activeFace}',
            elseRoutine: [
              {
                func: 'FLIP',
                collection: 'thisButton'
              }
            ],
            thenRoutine: [
              {
                func: 'IF',
                condition: '${PROPERTY rotation}',
                elseRoutine: [
                  {
                    func: 'ROTATE',
                    collection: 'thisButton',
                    mode: 'set',
                    angle: 270
                  }
                ],
                thenRoutine: [
                  {
                    func: 'ROTATE',
                    collection: 'thisButton',
                    mode: 'set',
                    angle: 0
                  }
                ]
              }
            ]
          }
        ]
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
              value: decks[deckTitle].cards[0].face.replace(/h\/[^\/]+$/, 'gf/back.jpg')
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
        face: card.face
      };
      for(let c=1; c<=card.quantity; ++c) {
        widgets[deckTitle + '_' + i + '_' + c] = {
          id: deckTitle + '_' + i + '_' + c,
          type: 'card',
          parent: deckTitle + '_pile',
          deck: deckTitle,
          cardType: i
        };
      }
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
