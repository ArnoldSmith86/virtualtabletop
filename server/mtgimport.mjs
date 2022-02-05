import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

function cardImage(cardDB) {
  return cardDB.images.length ? cardDB.images[cardDB.images.length-1].url : cardDB.image_url;
}

export default async function convertMTG(content) {
  const zip = await JSZip.loadAsync(content);

  const decks = {};
  const widgets = JSON.parse(fs.readFileSync(path.resolve() + '/server/mtgimport.json'));
  let id = 1;

  for(const file in zip.files) {
    const content = await zip.files[file].async('string');

    const data = JSON.parse(content.match(/DeckSampleHand" data-react-props="([^"]+)/)[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
    const title = data.deck.title || content.match(/<h1.*?\n(.+)/)[1];
    decks[title] = { cards: [], sideboard: [] };

    for(const card of data.deck.entries) {
      decks[title][card.type == 'maindeck' ? 'cards' : 'sideboard'].push({
        name: card.card,
        face: cardImage(card.card_database),
        back: card.card_database.related_cards.length ? cardImage(card.card_database.related_cards[0].card) : null,
        quantity: card.quantity
      });
    }
  }

  let deckCounter = 0;
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
        },
        {
          objects: [
            {
              type: 'image',
              color: 'black',
              width: 115,
              height: 160,
              dynamicProperties: {
                value: 'back'
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

    if(++deckCounter <= 2)
      widgets[deckTitle].parent = widgets[deckTitle + '_pile'].parent = `Player ${deckCounter} - Library`;

    for(const card of decks[deckTitle].cards) {
      widgets[deckTitle].cardTypes[card.name] = {
        face: card.face
      };
      if(card.back)
        widgets[deckTitle].cardTypes[card.name].back = card.back;
      for(let c=1; c<=card.quantity; ++c) {
        widgets[deckTitle + '_' + card.name + '_' + c] = {
          id: deckTitle + '_' + card.name + '_' + c,
          type: 'card',
          parent: deckTitle + '_pile',
          deck: deckTitle,
          cardType: card.name
        };
      }
    }
  }

  widgets['toolbox'] = {
    type: 'holder',
    id: 'toolbox',
    x: 746.5,
    y: 133,
  };

  widgets['transform'] = {
    type: 'button',
    id: 'transform',
    x: 900,
    y: 133,
    clickRoutine: [
      {
        func: 'SELECT',
        value: 'toolbox'
      },
      {
        func: 'SET',
        property: 'activeFace',
        value: 2
      }
    ],
    text: 'Transform'
  };

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
