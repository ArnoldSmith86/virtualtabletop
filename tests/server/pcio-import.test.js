import JSZip from 'jszip';

import convertPCIO from '../../server/pcioimport.mjs';

async function importWidgets(widgets, schemaVersion) {
  const zip = new JSZip();
  zip.file('widgets.json', JSON.stringify(widgets));
  if(schemaVersion !== undefined)
    zip.file('schemaVersion', String(schemaVersion));
  return await convertPCIO(await zip.generateAsync({ type: 'nodebuffer' }));
}

const deck = {
  id: 'deck', type: 'cardDeck', parent: 'holder', x: 0, y: 0,
  cardTypes: { a: { label: 'A', image: '/img/cards-french/spades-a.svg' } },
  faceTemplate: { includeBorder: 'heavy', objects: [ { type: 'image', x: 0, y: 0, w: 103, h: 160, valueType: 'dynamic', value: 'image' } ] }
};

describe('PCIO importer', () => {
  it('imports schema 6+ holders which used to be called cardPile', async () => {
    const state = await importWidgets([
      { id: 'holder', type: 'holder', x: 10, y: 20, width: 111, height: 168, label: 'Draw', hasShuffleButton: true },
      deck,
      { id: 'card', type: 'card', deck: 'deck', cardType: 'a', parent: 'holder', x: 10, y: 20 }
    ], 8);

    expect(state.holder.type).toBe('holder');
    expect(state.holder.css).toBeUndefined();
    expect(state.holder_label.text).toBe('Draw');
    expect(state.holder_shuffleButton.type).toBe('button');
    expect(state.card.parent).toBe('holder');
    expect(state._meta.info.importerSchemaVersion).toBe(8);
    expect(state._meta.info.importerWarnings).toBeUndefined();
  });

  it('still imports the old cardPile type', async () => {
    const state = await importWidgets([
      { id: 'holder', type: 'cardPile', x: 10, y: 20, layoutType: 'spread', spreadDirection: 'down' }
    ]);
    expect(state.holder.type).toBe('holder');
    expect(state.holder.stackOffsetY).toBe(168);
    expect(state._meta.info.importerSchemaVersion).toBe(0);
  });

  it('reads automation steps wrapped in branches and translates their arguments', async () => {
    const state = await importWidgets([
      { id: 'source', type: 'holder', x: 0, y: 0 },
      { id: 'target', type: 'holder', x: 200, y: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Deal', x: 0, y: 300,
        clickRoutine: { steps: [
          { id: 'step1', branches: [ { func: 'MOVE_CARDS_BETWEEN_HOLDERS', args: {
            from:     { type: 'literal', value: [ 'source' ] },
            to:       { type: 'literal', value: [ 'target' ] },
            quantity: { type: 'literal', value: 3 },
            moveFlip: { type: 'literal', value: 'faceUp' }
          } } ] },
          { id: 'step2', branches: [ { func: 'SORT_CARDS', args: {
            holders:       { type: 'literal', value: [ 'target' ] },
            sortDirection: { type: 'literal', value: 'za' }
          } } ] }
        ] }
      }
    ], 8);

    expect(state.button.clickRoutine).toEqual([
      { func: 'MOVE', from: 'source', to: 'target', count: 3, face: 1 },
      { func: 'SORT', holder: 'target', key: 'sortingOrder' }
    ]);
  });

  it('translates counter and chooser changes including cycling backwards', async () => {
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 0, counterValue: 0 },
      { id: 'chooserDeck', type: 'cardDeck', x: 0, y: 0, collectionType: 'choosers',
        cardTypes: { one: { label: '1' }, two: { label: '2' } },
        faceTemplate: { objects: [ { type: 'image', x: 0, y: 0, w: 80, h: 40, valueType: 'dynamic', value: 'image' } ] } },
      { id: 'chooser', type: 'chooser', deck: 'chooserDeck', x: 0, y: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Score', x: 0, y: 300,
        clickRoutine: { steps: [
          { id: 'a', branches: [ { func: 'CHANGE_COUNTER', args: {
            counters:          { type: 'literal', value: [ 'counter' ] },
            counterChangeMode: { type: 'literal', value: 'inc' },
            changeNumber:      { type: 'literal', value: 2 }
          } } ] },
          { id: 'b', branches: [ { func: 'CHANGE_CHOOSER', args: {
            choosers:          { type: 'literal', value: [ 'chooser' ] },
            chooserChangeType: { type: 'literal', value: 'prev' }
          } } ] }
        ] }
      }
    ], 8);

    expect(state.button.clickRoutine).toEqual([
      { func: 'LABEL', label: 'counter', mode: 'inc', value: 2 },
      { func: 'FLIP', collection: [ 'chooser' ], faceCycle: 'backward' }
    ]);
  });

  it('imports the faces of a deck backed die', async () => {
    const state = await importWidgets([
      { id: 'diceDeck', type: 'cardDeck', x: 0, y: 0, collectionType: 'dice', cardWidth: 60, cardHeight: 60,
        cardTypes: { one: { label: '1', image: '/img/dice-d4/1.svg' }, two: { label: '2', image: '/img/dice-d4/2.svg' } },
        faceTemplate: { objects: [ { type: 'image', x: 0, y: 0, w: 60, h: 60, valueType: 'dynamic', value: 'image' } ] } },
      { id: 'die', type: 'dice', deck: 'diceDeck', x: 0, y: 0, diceValue: 'two' }
    ], 8);

    expect(state.die).toMatchObject({
      type: 'dice',
      width: 60,
      height: 60,
      activeFace: 1,
      faces: [
        { image: 'https://playingcards.io/img/dice-d4/1.svg' },
        { image: 'https://playingcards.io/img/dice-d4/2.svg' }
      ]
    });
  });

  it('reports what it could not translate', async () => {
    const state = await importWidgets([
      { id: 'unknown', type: 'somethingNew', x: 0, y: 0 },
      { id: 'noType', x: 0, y: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Shift', x: 0, y: 0,
        clickRoutine: { steps: [ { id: 'a', branches: [ { func: 'FUTURE_STEP', args: {} } ] } ] }
      }
    ], 8);

    expect(state._meta.info.importerWarnings).toEqual([
      'Widgets of type somethingNew cannot be imported.',
      'Ignored a widget without a type (noType).',
      'The automation step FUTURE_STEP of "Shift" has no VirtualTabletop equivalent and was skipped.'
    ]);
    expect(state.button.clickRoutine).toEqual([]);
  });
});
