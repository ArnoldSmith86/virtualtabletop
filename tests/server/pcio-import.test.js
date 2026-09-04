import { expectNoLegacyModes } from './fileupdater-util.js';
import convertPCIO from '../../server/pcioimport.mjs';
import Zip from '../../server/zip.mjs';

async function importWidgets(widgets, schemaVersion, files={}) {
  const entries = { 'widgets.json': JSON.stringify(widgets) };
  if(schemaVersion !== undefined)
    entries['schemaVersion'] = String(schemaVersion);
  // a null content means a folder entry, which is stored as an empty entry ending in a slash
  for(const [ name, content ] of Object.entries(files))
    entries[content === null ? `${name}/` : name] = content === null ? new Uint8Array(0) : content;
  const state = await convertPCIO(await Zip.create(entries));
  expectNoLegacyModes(state);
  return state;
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

    expect(state.holder1.type).toBe('holder');
    expect(state.holder1.css).toBeUndefined();
    expect(state.holder1_label.text).toBe('Draw');
    expect(state.holder1_shuffleButton.type).toBe('button');
    expect(state.card1.parent).toBe('holder1');
    expect(state._meta.info.importerSchemaVersion).toBe(8);
    expect(state._meta.info.importerWarnings).toBeUndefined();
  });

  it('replaces the PlayingCards.io IDs everywhere in the file', async () => {
    const state = await importWidgets([
      { id: 'wDgT', type: 'holder', x: 0, y: 0, allowedDecks: [ 'kR2m' ] },
      { id: 'kR2m', type: 'cardDeck', parent: 'wDgT', x: 0, y: 0, cardTypes: { xY7q: { label: 'A' } } },
      { id: 'q7Ka', type: 'card', deck: 'kR2m', cardType: 'xY7q', parent: 'wDgT', x: 0, y: 0 },
      { id: 'zP4v', type: 'seat', seatIndex: 0, x: 400, y: 0 },
      { id: 'hand', type: 'hand', x: 0, y: 400, linkedSeat: 'zP4v' },
      { id: 'tN9d', type: 'turnButton', label: 'Next', x: 200, y: 300, currentTurn: 'zP4v' },
      {
        id: 'bT8n', type: 'automationButton', label: 'Deal', x: 0, y: 300,
        clickRoutine: { steps: [ { id: 'aQ2w', branches: [ { func: 'MOVE_CARDS_BETWEEN_HOLDERS', args: {
          from:     { type: 'literal', value: [ 'wDgT' ] },
          to:       { type: 'literal', value: [ 'hand' ] },
          quantity: { type: 'literal', value: 1 }
        } } ] } ] }
      }
    ], 8);

    expect(JSON.stringify(state)).not.toMatch(/wDgT|kR2m|q7Ka|zP4v|tN9d|bT8n|aQ2w/);
    expect(state.card1.deck).toBe('deck1');
    expect(state.holder1.dropTarget).toEqual([ { deck: 'deck1' } ]);
    expect(state.hand.linkedToSeat).toBe('seat1');
    expect(state.button2.clickRoutine).toEqual([ { func: 'MOVE', from: 'holder1', to: 'hand' } ]);
  });

  it('leaves a card type alone that is named like a widget', async () => {
    const state = await importWidgets([
      { id: 'holder', type: 'holder', x: 0, y: 0 },
      { id: 'q7Ka', type: 'holder', x: 200, y: 0 },
      { id: 'deck', type: 'cardDeck', parent: 'holder', x: 0, y: 0, cardTypes: { q7Ka: { label: 'A' } } },
      { id: 'card', type: 'card', deck: 'deck', cardType: 'q7Ka', parent: 'holder', x: 0, y: 0 }
    ], 8);

    expect(Object.keys(state.deck1.cardTypes)).toEqual([ 'q7Ka' ]);
    expect(state.card1.cardType).toBe('q7Ka');
  });

  it('still imports the old cardPile type', async () => {
    const state = await importWidgets([
      { id: 'holder', type: 'cardPile', x: 10, y: 20, layoutType: 'spread', spreadDirection: 'down' }
    ]);
    expect(state.holder1.type).toBe('holder');
    expect(state.holder1.stackOffsetY).toBe(168);
    expect(state._meta.info.importerSchemaVersion).toBe(0);
  });

  it('keeps the position of a counter that sits at the very top of the table', async () => {
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 0, counterValue: 3 }
    ], 8);
    expect(state.counter1.y).toBe(5);
    expect(state.counter1.x).toBeUndefined();
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

    expect(state.button1.clickRoutine).toEqual([
      // PCIO deals one card after the other unless it is told to move the pile
      { note: 'Deal one at a time', func: 'FOREACH', range: [ 1, 3 ], loopRoutine: [
        { func: 'MOVE', from: 'holder1', to: 'holder2', count: 1, face: 1 }
      ] },
      { func: 'SORT', holder: 'holder2', key: 'sortingOrder' }
    ]);
  });

  it('runs the alternatives of a step as an IF chain over the results of its read steps', async () => {
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 0, counterValue: 1 },
      {
        id: 'button', type: 'automationButton', label: 'Coin', x: 0, y: 300,
        clickRoutine: { steps: [
          { id: 'roll', branches: [ { func: 'RANDOM_NUMBER', args: {
            minimum: { type: 'literal', value: 1 },
            maximum: { type: 'literal', value: 6 },
            step:    { type: 'literal', value: 1 }
          } } ] },
          { id: 'high', branches: [ { func: 'COMPARE_NUMBERS', args: {
            numberA:            { type: 'variable', callId: 'roll' },
            comparisonOperator: { type: 'literal', value: 'gt' },
            numberB:            { type: 'query', counters: [ 'counter' ] }
          } } ] },
          { id: 'change', branches: [
            { func: 'CHANGE_COUNTER', condition: { type: 'variable', callId: 'high' }, args: {
              counters:          { type: 'literal', value: [ 'counter' ] },
              counterChangeMode: { type: 'literal', value: 'set' },
              changeNumber:      { type: 'variable', callId: 'roll' }
            } },
            { func: 'CHANGE_COUNTER', args: {
              counters:          { type: 'literal', value: [ 'counter' ] },
              counterChangeMode: { type: 'literal', value: 'inc' },
              changeNumber:      { type: 'literal', value: 1 }
            } }
          ] }
        ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([
      'var pcioroll = randRange 1 7 1',
      'var pcioNumber1 = parseFloat ${PROPERTY text OF counter1}',
      'var pciohigh = ${pcioroll} > ${pcioNumber1}',
      {
        func: 'IF',
        condition: '${pciohigh}',
        thenRoutine: [ { func: 'LABEL', label: 'counter1', value: '${pcioroll}' } ],
        elseRoutine: [ { func: 'LABEL', label: 'counter1', mode: 'inc', value: 1 } ]
      }
    ]);
  });

  it('deals a quantity that is only known when the button is clicked', async () => {
    const state = await importWidgets([
      { id: 'source', type: 'holder', x: 0, y: 0 },
      { id: 'target', type: 'holder', x: 200, y: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Deal', x: 0, y: 300,
        clickRoutine: {
          popupMessage: 'How many?',
          questions: [ { id: 'howMany', type: 'number', label: 'Cards', defaultValue: 5 } ],
          steps: [ { id: 'a', branches: [ { func: 'MOVE_CARDS_BETWEEN_HOLDERS', args: {
            from:     { type: 'literal', value: [ 'source' ] },
            to:       { type: 'literal', value: [ 'target' ] },
            quantity: { type: 'reference', questionId: 'howMany' }
          } } ] } ]
        }
      }
    ], 8);

    expect(state.button1.clickRoutine[1]).toEqual({
      note: 'Deal one at a time',
      func: 'IF',
      operand1: '${howMany}',
      relation: '>',
      operand2: 0,
      thenRoutine: [
        { func: 'FOREACH', range: [ 1, '${howMany}' ], loopRoutine: [ { func: 'MOVE', from: 'holder1', to: 'holder2', count: 1 } ] }
      ]
    });
    expect(state._meta.info.importerWarnings).toBeUndefined();
  });

  it('reports a quantity too large to deal one at a time', async () => {
    const state = await importWidgets([
      { id: 'source', type: 'holder', x: 0, y: 0 },
      { id: 'target', type: 'holder', x: 200, y: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Deal', x: 0, y: 300,
        clickRoutine: { steps: [ { id: 'a', branches: [ { func: 'MOVE_CARDS_BETWEEN_HOLDERS', args: {
          from:     { type: 'literal', value: [ 'source' ] },
          to:       { type: 'literal', value: [ 'target' ] },
          quantity: { type: 'literal', value: 200 }
        } } ] } ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([ { func: 'MOVE', from: 'holder1', to: 'holder2', count: 200 } ]);
    expect(state._meta.info.importerWarnings).toEqual([
      '"Deal" moves up to 200 objects in one go instead of one after the other - they can end up in the opposite order.'
    ]);
  });

  it('keeps a counter within its bounds wherever it is changed', async () => {
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 0, counterValue: 9, counterMin: 0, counterMax: 5, counterStep: 2 },
      {
        id: 'button', type: 'automationButton', label: 'Add', x: 0, y: 300,
        clickRoutine: { steps: [ { id: 'a', branches: [ { func: 'CHANGE_COUNTER', args: {
          counters:          { type: 'literal', value: [ 'counter' ] },
          counterChangeMode: { type: 'literal', value: 'inc' },
          changeNumber:      { type: 'literal', value: 4 }
        } } ] } ] }
      }
    ], 8);

    expect(state.counter1.text).toBe(5);
    expect(state.counter1_incrementButton.clickRoutine).toEqual([
      'var pcioCounter = parseFloat ${PROPERTY text OF counter1}',
      'var pcioCounter = ${pcioCounter} || 0',
      'var pcioCounter = ${pcioCounter} + 2',
      'var pcioCounter = max ${pcioCounter} 0',
      'var pcioCounter = min ${pcioCounter} 5',
      { func: 'LABEL', label: 'counter1', value: '${pcioCounter}' }
    ]);
    expect(state.button1.clickRoutine).toEqual([
      'var pcioCounter = parseFloat ${PROPERTY text OF counter1}',
      'var pcioCounter = ${pcioCounter} || 0',
      'var pcioCounter = ${pcioCounter} + 4',
      'var pcioCounter = max ${pcioCounter} 0',
      'var pcioCounter = min ${pcioCounter} 5',
      { func: 'LABEL', label: 'counter1', value: '${pcioCounter}' }
    ]);
  });

  it('only clamps the side a counter is bounded on', async () => {
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 0, counterValue: 3, counterMax: 10 }
    ], 8);

    expect(state.counter1.text).toBe(3);
    expect(state.counter1_incrementButton.clickRoutine).toEqual([
      'var pcioCounter = parseFloat ${PROPERTY text OF counter1}',
      'var pcioCounter = ${pcioCounter} || 0',
      'var pcioCounter = ${pcioCounter} + 1',
      'var pcioCounter = min ${pcioCounter} 10',
      { func: 'LABEL', label: 'counter1', value: '${pcioCounter}' }
    ]);
    expect(state._meta.info.importerWarnings).toEqual([
      'Typing a value into the counter "counter1" is not restricted to its maximum of 10 - the buttons and the automations that change it are.'
    ]);
  });

  it('turns a whole pile over: every card to the same side and the order reversed', async () => {
    const state = await importWidgets([
      { id: 'holder', type: 'holder', x: 0, y: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Flip', x: 0, y: 300,
        clickRoutine: { steps: [ { id: 'a', branches: [ { func: 'FLIP_CARDS', args: {
          objects:  { type: 'query', queryWidgetTypes: [ 'card', 'piece' ], holders: [ 'holder' ] },
          flipMode: { type: 'literal', value: 'pile' },
          flipFace: { type: 'literal', value: 'switch' },
          reverse:  { type: 'literal', value: 'reverse' }
        } } ] } ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([
      { func: 'SELECT', property: 'parent', relation: 'in', value: [ 'holder1' ], type: 'card', collection: 'pcioPile', sortBy: 'z' },
      'var pcioFace = 0',
      { func: 'GET', collection: 'pcioPile', property: 'activeFace', aggregation: 'last', variable: 'pcioFace' },
      'var pcioFace = 1 - ${pcioFace}',
      { func: 'FLIP', collection: 'pcioPile', face: '${pcioFace}' },
      { note: 'Reverse the pile', func: 'SHUFFLE', collection: 'pcioPile', mode: 'reverse' }
    ]);
  });

  it('passes the hands of the players on when objects are shifted between seats', async () => {
    const state = await importWidgets([
      { id: 'seat1', type: 'seat', seatIndex: 0, x: 0, y: 0 },
      { id: 'seat2', type: 'seat', seatIndex: 1, x: 100, y: 0 },
      { id: 'hand', type: 'hand', x: 0, y: 400 },
      {
        id: 'button', type: 'automationButton', label: 'Pass', x: 0, y: 300,
        clickRoutine: { steps: [ { id: 'a', branches: [ { func: 'SHIFT_OBJECTS', args: {
          holders:   { type: 'literal', value: [ 'seat1', 'seat2' ] },
          moveMode:  { type: 'literal', value: 'wrap' },
          stepsWrap: { type: 'literal', value: 1 }
        } } ] } ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([
      { note: 'Pass the hands on', func: 'SHIFT', holders: [ 'seat1', 'seat2' ], interval: 1, direction: 'forward' }
    ]);
  });

  it('shifts the contents of plain holders around through a temporary holder', async () => {
    const state = await importWidgets([
      { id: 'a', type: 'holder', x: 0,   y: 0 },
      { id: 'b', type: 'holder', x: 200, y: 0 },
      { id: 'c', type: 'holder', x: 400, y: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Shift', x: 0, y: 300,
        clickRoutine: { steps: [ { id: 'shift', branches: [ { func: 'SHIFT_OBJECTS', args: {
          holders:   { type: 'literal', value: [ 'a', 'b', 'c' ] },
          moveMode:  { type: 'literal', value: 'wrap' },
          stepsWrap: { type: 'literal', value: 1 }
        } } ] } ] }
      }
    ], 8);

    expect(state.pcioShiftTempHolder.type).toBe('holder');
    expect(state.button1.clickRoutine).toEqual([
      { func: 'MOVE', from: 'holder3', to: 'pcioShiftTempHolder',   count: 'all' },
      { func: 'MOVE', from: 'holder2', to: 'holder3',                     count: 'all' },
      { func: 'MOVE', from: 'holder1', to: 'holder2',                     count: 'all' },
      { func: 'MOVE', from: 'pcioShiftTempHolder', to: 'holder1',   count: 'all' }
    ]);
  });

  it('calculates with the operators that have no named function', async () => {
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 0, counterValue: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Math', x: 0, y: 300,
        clickRoutine: { steps: [
          { id: 'mod', branches: [ { func: 'MATH', args: {
            mathOperator: { type: 'literal', value: 'remainder' },
            numberA:      { type: 'literal', value: 7 },
            numberB:      { type: 'literal', value: 3 }
          } } ] },
          { id: 'pow', branches: [ { func: 'MATH', args: {
            mathOperator: { type: 'literal', value: 'exponent' },
            numberA:      { type: 'variable', callId: 'mod' },
            numberB:      { type: 'literal', value: 3 }
          } } ] },
          { id: 'set', branches: [ { func: 'CHANGE_COUNTER', args: {
            counters:          { type: 'literal', value: [ 'counter' ] },
            counterChangeMode: { type: 'literal', value: 'set' },
            changeNumber:      { type: 'variable', callId: 'pow' }
          } } ] }
        ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([
      'var pciomod = 7 % 3',
      'var pciopow = ${pciomod} ** 3',
      { func: 'LABEL', label: 'counter1', value: '${pciopow}' }
    ]);
  });

  it('gives a read step that only runs under a condition its empty default', async () => {
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 0, counterValue: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Maybe', x: 0, y: 300,
        clickRoutine: { steps: [
          { id: 'ask', branches: [ { func: 'IS_EQUAL', args: {
            numberA: { type: 'literal', value: 1 },
            numberB: { type: 'literal', value: 1 }
          } } ] },
          { id: 'roll', branches: [ { func: 'RANDOM_NUMBER', condition: { type: 'variable', callId: 'ask' }, args: {
            minimum: { type: 'literal', value: 1 },
            maximum: { type: 'literal', value: 6 },
            step:    { type: 'literal', value: 1 }
          } } ] },
          { id: 'set', branches: [ { func: 'CHANGE_COUNTER', args: {
            counters:          { type: 'literal', value: [ 'counter' ] },
            counterChangeMode: { type: 'literal', value: 'set' },
            changeNumber:      { type: 'variable', callId: 'roll' }
          } } ] }
        ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([
      'var pcioask = 1 == 1',
      'var pcioroll = 0',
      { func: 'IF', condition: '${pcioask}', thenRoutine: [ 'var pcioroll = randRange 1 7 1' ] },
      { func: 'LABEL', label: 'counter1', value: '${pcioroll}' }
    ]);
  });

  it('adds up the counters of a number list when that step runs, not where the sum is used', async () => {
    const state = await importWidgets([
      { id: 'a', type: 'counter', x: 0, y: 0, counterValue: 1 },
      { id: 'b', type: 'counter', x: 100, y: 0, counterValue: 2 },
      { id: 'total', type: 'counter', x: 200, y: 0, counterValue: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Total', x: 0, y: 300,
        clickRoutine: { steps: [
          { id: 'list', branches: [ { func: 'NUMBERS_FROM_COUNTERS', args: {
            counters: { type: 'literal', value: [ 'a', 'b' ] }
          } } ] },
          // PCIO sums the values the list step saw, so this must not change the result
          { id: 'bump', branches: [ { func: 'CHANGE_COUNTER', args: {
            counters:          { type: 'literal', value: [ 'a' ] },
            counterChangeMode: { type: 'literal', value: 'inc' },
            changeNumber:      { type: 'literal', value: 10 }
          } } ] },
          { id: 'sum', branches: [ { func: 'SUM_LIST', args: {
            list: { type: 'variable', callId: 'list' }
          } } ] },
          { id: 'set', branches: [ { func: 'CHANGE_COUNTER', args: {
            counters:          { type: 'literal', value: [ 'total' ] },
            counterChangeMode: { type: 'literal', value: 'set' },
            changeNumber:      { type: 'variable', callId: 'sum' }
          } } ] }
        ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([
      'var pciolist = parseFloat ${PROPERTY text OF counter1}',
      'var pciolist = ${pciolist} + ${PROPERTY text OF counter2}',
      { func: 'LABEL', label: 'counter1', mode: 'inc', value: 10 },
      'var pciosum = ${pciolist}',
      { func: 'LABEL', label: 'counter3', value: '${pciosum}' }
    ]);
  });

  it('picks the counters of the number list alternative that actually runs', async () => {
    const state = await importWidgets([
      { id: 'a', type: 'counter', x: 0, y: 0, counterValue: 1 },
      { id: 'b', type: 'counter', x: 100, y: 0, counterValue: 2 },
      { id: 'total', type: 'counter', x: 200, y: 0, counterValue: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Total', x: 0, y: 300,
        clickRoutine: { steps: [
          { id: 'first', branches: [ { func: 'IS_EQUAL', args: {
            numberA: { type: 'query', counters: [ 'a' ] },
            numberB: { type: 'literal', value: 1 }
          } } ] },
          { id: 'list', branches: [
            { func: 'NUMBERS_FROM_COUNTERS', condition: { type: 'variable', callId: 'first' }, args: {
              counters: { type: 'literal', value: [ 'a' ] }
            } },
            { func: 'NUMBERS_FROM_COUNTERS', args: {
              counters: { type: 'literal', value: [ 'b' ] }
            } }
          ] },
          { id: 'sum', branches: [ { func: 'SUM_LIST', args: {
            list: { type: 'variable', callId: 'list' }
          } } ] },
          { id: 'set', branches: [ { func: 'CHANGE_COUNTER', args: {
            counters:          { type: 'literal', value: [ 'total' ] },
            counterChangeMode: { type: 'literal', value: 'set' },
            changeNumber:      { type: 'variable', callId: 'sum' }
          } } ] }
        ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([
      'var pcioNumber1 = parseFloat ${PROPERTY text OF counter1}',
      'var pciofirst = ${pcioNumber1} == 1',
      'var pciolist = 0',
      {
        func: 'IF',
        condition: '${pciofirst}',
        thenRoutine: [ 'var pciolist = parseFloat ${PROPERTY text OF counter1}' ],
        elseRoutine: [ 'var pciolist = parseFloat ${PROPERTY text OF counter2}' ]
      },
      'var pciosum = ${pciolist}',
      { func: 'LABEL', label: 'counter3', value: '${pciosum}' }
    ]);
  });

  it('translates the background, outlines and text style of a button', async () => {
    const state = await importWidgets([
      {
        id: 'button', type: 'automationButton', label: 'Styled', x: 0, y: 0, width: 120, height: 60,
        mainBackground: { fill: { type: 'linearGradient', angle: 90, stops: [ { color: '#ff0000', position: 0 }, { color: '#0000ff', position: 1 } ] } },
        mainOutlines: [ { size: 2, offset: 0, fill: { type: 'color', color: '#000000' } }, { size: 3, offset: 4, fill: { type: 'color', color: '#ffffff' } } ],
        mainTextStyle: { size: 20, align: 'left', mainFill: { type: 'color', color: '#123456' } },
        mainBorderRadius: 12,
        clickRoutine: { steps: [] }
      }
    ], 8);

    expect(state.button1.borderRadius).toBe(12);
    expect(state.button1.css).toBe([
      'background: linear-gradient(270deg, #ff0000 0%, #0000ff 100%)',
      'border: 2px solid #000000',
      'box-sizing: border-box',
      'box-shadow: 0 0 0 7px #ffffff',
      'font-size: 20px',
      'text-align: left',
      'color: #123456'
    ].join('; '));
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

    expect(state.button1.clickRoutine).toEqual([
      { func: 'LABEL', label: 'counter1', mode: 'inc', value: 2 },
      { func: 'FLIP', collection: [ 'card1' ], faceCycle: 'backward' }
    ]);
  });

  it('imports the faces of a deck backed die', async () => {
    const state = await importWidgets([
      { id: 'diceDeck', type: 'cardDeck', x: 0, y: 0, collectionType: 'dice', cardWidth: 60, cardHeight: 60,
        cardTypes: { one: { label: '1', image: '/img/dice-d4/1.svg' }, two: { label: '2', image: '/img/dice-d4/2.svg' } },
        faceTemplate: { objects: [ { type: 'image', x: 0, y: 0, w: 60, h: 60, valueType: 'dynamic', value: 'image' } ] } },
      { id: 'die', type: 'dice', deck: 'diceDeck', x: 0, y: 0, diceValue: 'two' }
    ], 8);

    expect(state.dice1).toMatchObject({
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

  it('spells out the faces of a die that has fewer than six of the standard ones', async () => {
    const state = await importWidgets([
      { id: 'd3Deck', type: 'cardDeck', x: 0, y: 0, collectionType: 'dice', cardWidth: 50, cardHeight: 50,
        cardTypes: { one: { image: '/img/dice-basic/1.svg' }, two: { image: '/img/dice-basic/2.svg' }, three: { image: '/img/dice-basic/3.svg' } },
        faceTemplate: { objects: [ { type: 'image', x: 0, y: 0, w: 50, h: 50, valueType: 'dynamic', value: 'image' } ] } },
      { id: 'd3', type: 'dice', deck: 'd3Deck', x: 0, y: 0 }
    ], 8);

    expect(state.dice1.faces).toEqual([
      { image: 'https://playingcards.io/img/dice-basic/1.svg' },
      { image: 'https://playingcards.io/img/dice-basic/2.svg' },
      { image: 'https://playingcards.io/img/dice-basic/3.svg' }
    ]);
  });

  it('leaves the faces of a standard six sided die to the dice widget', async () => {
    const faces = {};
    for(let i=1; i<=6; ++i)
      faces['f' + i] = { image: `/img/dice-basic/${i}.svg` };
    const state = await importWidgets([
      { id: 'd6Deck', type: 'cardDeck', x: 0, y: 0, collectionType: 'dice', cardWidth: 50, cardHeight: 50, cardTypes: faces,
        faceTemplate: { objects: [ { type: 'image', x: 0, y: 0, w: 50, h: 50, valueType: 'dynamic', value: 'image' } ] } },
      { id: 'd6', type: 'dice', deck: 'd6Deck', x: 0, y: 0 }
    ], 8);

    expect(state.dice1.faces).toBeUndefined();
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
      'Widgets of type "somethingNew" cannot be imported - the striped placeholder at 0,0 marks where "somethingnew1" was.',
      'Ignored a widget without a type (widget1).',
      'The automation step "FUTURE_STEP" of "Shift" has no VirtualTabletop equivalent and was skipped.'
    ]);
    expect(state.button1.clickRoutine).toEqual([]);
  });

  it('keeps the size of a widget it cannot import and says what it was', async () => {
    const state = await importWidgets([
      { id: 'unknown', type: 'videoPlayer', x: 200, y: 400, width: 180, height: 100 }
    ], 8);

    expect(state.videoplayer1.width).toBe(180);
    expect(state.videoplayer1.height).toBe(100);
    expect(state.videoplayer1.text).toBe('videoPlayer not imported');
  });

  it('does not put the text style of a holder on the chrome it generates', async () => {
    const textStyle = { size: 22, font: 'unquiet-spirits', mainFill: { type: 'color', color: '#ffffff' } };
    const state = await importWidgets([
      { id: 'holder', type: 'holder', x: 0, y: 0, width: 111, height: 168, label: 'Draw Pile', hasShuffleButton: true,
        mainTextStyle: textStyle,
        mainOutlines: [ { size: 2, offset: 0, fill: { type: 'color', color: '#000000' } }, { size: 4, offset: 4, fill: { type: 'color', color: '#ff0000' } } ] },
      deck
    ], 8);

    // PCIO renders a holder label at a fixed size and ignores mainTextStyle there
    expect(state.holder1.css).toBe('border: 2px solid #000000; box-sizing: border-box; box-shadow: 0 0 0 8px #ff0000');
    expect(state.holder1_label.css).toBeUndefined();
    // the outlines reach 8px beyond the holder, so label and button move aside
    expect(state.holder1_label.y).toBe(-48);
    expect(state.holder1_shuffleButton.y).toBe(1.02*168 + 8);
  });

  it('styles the value of a counter without styling its caption and buttons', async () => {
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 0, label: 'Score', counterValue: 3,
        mainBackground: { fill: { type: 'color', color: '#dcedc8' } },
        mainTextStyle: { size: 26, mainFill: { type: 'color', color: '#1b5e20' } } }
    ], 8);

    // PCIO draws a value shorter than four characters a quarter larger than its style
    expect(state.counter1.css).toEqual({
      default: 'background: #dcedc8',
      ' > textarea': { 'font-size': '33px', 'line-height': '33px', color: '#1b5e20' }
    });
    expect(state.counter1_label.css).toBeUndefined();
    expect(state.counter1_incrementButton.css).toBeUndefined();
  });

  it('paints a gradient text fill onto the glyphs and reports where it cannot', async () => {
    const gradient = { fill: { type: 'linearGradient', angle: 0, stops: [ { color: '#ff0000', position: 0 }, { color: '#0000ff', position: 1 } ] } };
    const state = await importWidgets([
      { id: 'label',   type: 'labelText', x: 0, y: 0,   labelContent: 'Gradient', mainTextStyle: { size: 30, mainFill: gradient.fill } },
      { id: 'counter', type: 'counter',   x: 0, y: 100, counterValue: 3,          mainTextStyle: { size: 26, mainFill: gradient.fill } },
      { id: 'button',  type: 'urlButton', x: 0, y: 200, label: 'Rules', clickURL: 'https://example.com',
        mainTextStyle: { size: 20, mainFill: gradient.fill } }
    ], 8);

    const gradientCSS = {
      'background-image': 'linear-gradient(180deg, #ff0000 0%, #0000ff 100%)',
      '-webkit-background-clip': 'text',
      'background-clip': 'text',
      '-webkit-text-fill-color': 'transparent'
    };
    expect(state.label1.css[' textarea']).toEqual(Object.assign({ 'letter-spacing': '-1px' }, gradientCSS));
    expect(state.label1.css.default.color).toBeUndefined();
    expect(state.counter1.css[' > textarea']).toEqual(Object.assign({ 'font-size': '33px', 'line-height': '33px' }, gradientCSS));
    // the url button paints its own background, which clipping the text would eat
    expect(state.urlbutton1.css).toBe('font-size: 20px');
    expect(state._meta.info.importerWarnings).toEqual([
      'The text of "Rules" is filled with a gradient, which VirtualTabletop only does for labels and counters - it uses the default text colour instead.'
    ]);
  });

  it('reports the same problem on several widgets as one line', async () => {
    const state = await importWidgets([
      { id: 'a', type: 'holder', x: 0,   y: 0, label: 'One',   layoutType: 'grid' },
      { id: 'b', type: 'holder', x: 200, y: 0, label: 'Two',   layoutType: 'grid' },
      { id: 'c', type: 'holder', x: 400, y: 0, label: 'Three', layoutType: 'grid' },
      { id: 'd', type: 'holder', x: 600, y: 0, label: 'Four',  layoutType: 'grid' }
    ], 8);

    expect(state._meta.info.importerWarnings).toEqual([
      `PlayingCards.io's grid layout has no VirtualTabletop equivalent - the holders "One", "Two", "Three" and 1 more were imported as freeform.`
    ]);
  });

  it('warns about a file format that is newer than the importer', async () => {
    const state = await importWidgets([ { id: 'holder', type: 'holder', x: 0, y: 0 } ], 9);

    expect(state._meta.info.importerWarnings[0]).toBe('This file uses PlayingCards.io format 9 while the importer only knows up to 8 - anything newer than that is missing.');
  });

  it('makes a webpage button a real link', async () => {
    const state = await importWidgets([
      { id: 'link', type: 'urlButton', x: 0, y: 0, label: 'Rules & "tips"', clickURL: 'https://example.com/rules?a=1&b=2' }
    ], 8);

    expect(state.urlbutton1.type).toBe('basic');
    expect(state.urlbutton1.classes).toBe('button');
    expect(state.urlbutton1.movable).toBe(false);
    expect(state.urlbutton1.clickRoutine).toBe(undefined);
    expect(state.urlbutton1.html).toContain('href="https://example.com/rules?a=1&amp;b=2"');
    expect(state.urlbutton1.html).toContain('>Rules &amp; &quot;tips&quot;</a>');
    expect(state._meta.info.importerWarnings).toBe(undefined);
  });

  it('shows the address of a webpage button it cannot link to', async () => {
    const state = await importWidgets([
      { id: 'link', type: 'urlButton', x: 0, y: 0, label: 'Rules', clickURL: 'javascript:alert(1)' }
    ], 8);

    expect(state.urlbutton1.type).toBe('button');
    expect(state.urlbutton1.html).toBe(undefined);
    expect(state.urlbutton1.clickRoutine).toEqual([ {
      func: 'INPUT',
      header: 'Rules',
      confirmButtonText: 'Close',
      cancelButtonText: null,
      cancelButtonIcon: null,
      fields: [
        { type: 'text', text: 'On PlayingCards.io this button opened a webpage. VirtualTabletop cannot open this address, so here it is:' },
        { type: 'text', text: 'javascript:alert(1)' }
      ]
    } ]);
    expect(state._meta.info.importerWarnings).toEqual([ 'The webpage button "Rules" opens an address that VirtualTabletop cannot follow - it shows it instead.' ]);
  });

  it('gives a label text the height PCIO gives it and grows it for wrapping text', async () => {
    const state = await importWidgets([
      { id: 'short', type: 'labelText', x: 0, y: 0,   width: 400, height: 60, labelContent: 'One line',
        mainTextStyle: { size: 30 } },
      { id: 'long',  type: 'labelText', x: 0, y: 100, width: 200, height: 60, mainTextStyle: { size: 30 },
        labelContent: 'A label with quite a lot of text in it that has to wrap several times to fit' }
    ], 8);

    expect(state.label1.height).toBe(60);
    expect(state.label2.height).toBeGreaterThan(60);
  });

  it('puts a classic game piece into the box its pawn shape fills', async () => {
    const state = await importWidgets([
      { id: 'pawn',   type: 'gamePiece', pieceType: 'classic', color: 'red',  x: 300, y: 300 },
      { id: 'origin', type: 'gamePiece', pieceType: 'classic', color: 'blue' }
    ], 8);

    // PCIO gives the piece a 90x90 box while the pawn only fills 56x84 of it, at 17,3
    expect(state.pawn1).toMatchObject({ x: 317, y: 303, width: 56, height: 84, classes: 'classicPiece' });
    expect(state.pawn2).toMatchObject({ x: 17, y: 3, width: 56, height: 84 });
  });

  it('grows a label whose box is shorter than one line of its own text', async () => {
    const state = await importWidgets([
      { id: 'unknown', type: 'videoPlayer', x: 0, y: 200, height:  5 }
    ], 8);

    // the striped placeholder is written in the default 16px
    expect(state.videoplayer1.height).toBe(18);
  });

  it('lays a counter out the way PCIO does instead of from the size in the file', async () => {
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 100, width: 40, height: 10, counterValue: 3 },
      { id: 'plain',   type: 'counter', x: 0, y: 200, counterValue: 3 },
      { id: 'bounded', type: 'counter', x: 0, y: 300, counterValue: 3, counterMin: 0, counterMax: 10 },
      { id: 'bare',    type: 'counter', x: 0, y: 400, counterValue: 3, counterShowButtons: false }
    ], 8);

    // PCIO ignores the width and height of a counter: its box is as wide as the
    // widest value its bounds allow, at least 52px, plus 44px per button, and one
    // line of the value tall, at least as tall as the buttons
    expect(state.counter1).toMatchObject({ width: state.counter2.width, height: 44 });
    expect(state.counter2.width).toBeCloseTo(4.5*0.62*21 + 88);
    // -9999..9999 needs room for 4.5 characters, 0..10 only for two, so the 52px win
    expect(state.counter3.width).toBe(140);
    expect(state.counter4).toMatchObject({ width: state.counter2.width - 88, height: 28 });
    expect(state.counter4_decrementButton).toBeUndefined();
  });

  it('puts a 32px button into each end of a counter the way PCIO draws them', async () => {
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 100, width: 40, height: 10, counterValue: 3 },
      { id: 'tall',    type: 'counter', x: 0, y: 200, counterValue: 3, mainTextStyle: { size: 40, lineHeight: 1.6 } }
    ], 8);

    // 44px of the box belong to each button, of which PCIO paints the middle 32px
    expect(state.counter1_decrementButton).toMatchObject({ x: 6, y: 6, width: 32, height: 32 });
    expect(state.counter1_incrementButton).toMatchObject({ x: state.counter1.width - 38, y: 6, width: 32, height: 32 });
    // a value that needs a taller box keeps its buttons in the middle of it
    expect(state.counter2.height).toBe(82);
    expect(state.counter2_decrementButton).toMatchObject({ x: 6, y: 25, width: 32, height: 32 });
  });

  it('writes the value of a counter in the size PCIO draws it at', async () => {
    const state = await importWidgets([
      { id: 'short', type: 'counter', x: 0, y: 100, counterValue: 3 },
      { id: 'long',  type: 'counter', x: 0, y: 200, counterValue: 1234 },
      { id: 'flat',  type: 'counter', x: 0, y: 300, counterValue: 3, counterBoostFontSize: false }
    ], 8);

    // PCIO writes a counter in 21px and enlarges it by a quarter while its value
    // is shorter than four characters
    expect(state.counter1.css[' > textarea']['font-size']).toBe('26px');
    expect(state.counter2.css[' > textarea']['font-size']).toBe('21px');
    expect(state.counter3.css[' > textarea']['font-size']).toBe('21px');
  });

  it('imports a turn button at the size PCIO gives it', async () => {
    const state = await importWidgets([
      { id: 'turn', type: 'turnButton', x: 0, y: 0, label: 'End Turn', clickRoutine: { steps: [] } }
    ], 8);

    expect(state.button1.width).toBe(162);
    expect(state.button1.height).toBe(66);
  });

  it('scales a die face down so that a word fits on it', async () => {
    const state = await importWidgets([
      { id: 'dd', type: 'cardDeck', x: 0, y: 0, collectionType: 'dice', cardWidth: 50, cardHeight: 50,
        cardTypes: { one: { label: 'Yes' }, two: { label: 'No' }, three: { label: 'Maybe' } },
        faceTemplate: { objects: [] } },
      { id: 'die', type: 'dice', deck: 'dd', x: 0, y: 0 }
    ], 8);

    expect(state.dice1.faces).toEqual([ { value: 'Yes' }, { value: 'No' }, { value: 'Maybe' } ]);
    expect(state.dice1.css).toBe('--fontSize: 17px');
  });

  it('deals all objects one at a time, once per object that is there', async () => {
    const state = await importWidgets([
      { id: 'source', type: 'holder', x: 0, y: 0 },
      { id: 'target', type: 'holder', x: 200, y: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Recall', x: 0, y: 300,
        clickRoutine: { steps: [ { id: 'a', branches: [ { func: 'MOVE_CARDS_BETWEEN_HOLDERS', args: {
          from:     { type: 'literal', value: [ 'source' ] },
          to:       { type: 'literal', value: [ 'target' ] },
          quantity: { type: 'literal', value: 'all' }
        } } ] } ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([
      { func: 'SELECT', type: 'card', property: 'parent', relation: 'in', value: [ 'holder1' ], collection: 'pcioDeal1' },
      { note: 'Deal one at a time', func: 'FOREACH', collection: 'pcioDeal1', loopRoutine: [
        { func: 'MOVE', from: 'holder1', to: 'holder2', count: 1 }
      ] }
    ]);
    expect(state._meta.info.importerWarnings).toBeUndefined();
  });

  it('moves all objects in one go when PCIO does not deal them one by one', async () => {
    const state = await importWidgets([
      { id: 'source', type: 'holder', x: 0, y: 0 },
      { id: 'target', type: 'holder', x: 200, y: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Dump', x: 0, y: 300,
        clickRoutine: { steps: [ { id: 'a', branches: [ { func: 'MOVE_CARDS_BETWEEN_HOLDERS', args: {
          from:       { type: 'literal', value: [ 'source' ] },
          to:         { type: 'literal', value: [ 'target' ] },
          quantity:   { type: 'literal', value: 'all' },
          moveMethod: { type: 'literal', value: 'all' }
        } } ] } ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([ { func: 'MOVE', from: 'holder1', to: 'holder2', count: 'all' } ]);
  });

  it('moves objects into the hand and hands recalled ones back to everyone', async () => {
    const state = await importWidgets([
      { id: 'source', type: 'holder', x: 0, y: 0 },
      { id: 'hand', type: 'hand', x: 0, y: 800 },
      { id: 'deck', type: 'cardDeck', x: 100, y: 0, cardTypes: { a: { label: 'A' } }, faceTemplate: { objects: [] } },
      {
        id: 'button', type: 'automationButton', label: 'Hand', x: 0, y: 300,
        clickRoutine: { steps: [
          { id: 'a', branches: [ { func: 'MOVE_CARDS_BETWEEN_HOLDERS', args: {
            from:       { type: 'literal', value: [ 'source' ] },
            to:         { type: 'literal', value: [ 'hand' ] },
            quantity:   { type: 'literal', value: 1 },
            moveMethod: { type: 'literal', value: 'all' }
          } } ] },
          { id: 'b', branches: [ { func: 'RECALL_CARDS', args: {
            decks: { type: 'literal', value: [ 'deck' ] }
          } } ] }
        ] }
      }
    ], 8);

    // objects moved to a hand become the private property of whoever pressed the
    // button, which is what a hand is on PlayingCards.io
    expect(state.button1.clickRoutine[0]).toEqual({ func: 'MOVE', from: 'holder1', to: 'hand' });
    // a deck without a holder is recalled onto its own position, and a recall takes
    // the objects back from their owner
    const recall = state.button1.clickRoutine.find(operation=>operation.func == 'MOVEXY');
    expect(recall.resetOwner).toBeUndefined();
  });

  it('leaves out a move to a hand that PlayingCards.io does not show', async () => {
    const state = await importWidgets([
      { id: 'source', type: 'holder', x: 0, y: 0 },
      { id: 'hand', type: 'hand', x: 0, y: 800, enabled: false },
      {
        id: 'button', type: 'automationButton', label: 'Hand', x: 0, y: 300,
        clickRoutine: { steps: [ { id: 'a', branches: [ { func: 'MOVE_CARDS_BETWEEN_HOLDERS', args: {
          from:     { type: 'literal', value: [ 'source' ] },
          to:       { type: 'literal', value: [ 'hand' ] },
          quantity: { type: 'literal', value: 1 }
        } } ] } ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([]);
  });

  it('moves as many objects as the counter says and none at all when it says zero', async () => {
    const dealing = args=>[
      { id: 'source', type: 'holder', x: 0, y: 0 },
      { id: 'target', type: 'holder', x: 200, y: 0 },
      { id: 'hand', type: 'hand', x: 0, y: 800 },
      { id: 'counter', type: 'counter', x: 400, y: 0, counterValue: 2 },
      {
        id: 'button', type: 'automationButton', label: 'Deal', x: 0, y: 300,
        clickRoutine: { steps: [ { id: 'a', branches: [ { func: 'MOVE_CARDS_BETWEEN_HOLDERS', args: Object.assign({
          from:     { type: 'literal', value: [ 'source' ] },
          quantity: { counterId: 'counter' }
        }, args) } ] } ] }
      }
    ];

    // the count is the counter itself. A file old enough for the count migration has the
    // operation wrapped in an IF that moves *everything* when the count comes out as 0,
    // while PlayingCards.io moves nothing then - which is what the plain operation does
    const toHand = await importWidgets(dealing({
      to:         { type: 'literal', value: [ 'hand' ] },
      moveMethod: { type: 'literal', value: 'all' }
    }), 8);
    expect(toHand.button1.clickRoutine).toEqual([
      { func: 'MOVE', count: '${PROPERTY text OF counter1}', from: 'holder1', to: 'hand' }
    ]);

    // moving the objects in one go rather than one at a time, and turning them afterwards
    const wholePile = await importWidgets(dealing({
      to:             { type: 'literal', value: [ 'target' ] },
      moveMethod:     { type: 'literal', value: 'all' },
      changeRotation: { type: 'literal', value: 'cw' }
    }), 8);
    expect(wholePile.button1.clickRoutine).toEqual([
      { func: 'MOVE',   count: '${PROPERTY text OF counter1}', from: 'holder1', to: 'holder2' },
      { func: 'ROTATE', count: '${PROPERTY text OF counter1}', holder: 'holder2', angle: 90 }
    ]);

    // the same case with the zero spelled out in the file
    const nothing = await importWidgets(dealing({
      to:         { type: 'literal', value: [ 'target' ] },
      moveMethod: { type: 'literal', value: 'all' },
      quantity:   { type: 'literal', value: 0 }
    }), 8);
    expect(nothing.button1.clickRoutine).toEqual([
      { func: 'MOVE', count: 0, from: 'holder1', to: 'holder2' }
    ]);
  });

  it('puts objects under the ones a pile already holds, starting at the given destination', async () => {
    const state = await importWidgets([
      { id: 'source', type: 'holder', x: 0, y: 0 },
      { id: 'left',   type: 'holder', x: 200, y: 0 },
      { id: 'right',  type: 'holder', x: 400, y: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Under', x: 0, y: 300,
        clickRoutine: { steps: [ { id: 'a', branches: [ { func: 'MOVE_CARDS_BETWEEN_HOLDERS', args: {
          from:           { type: 'literal', value: [ 'source' ] },
          to:             { type: 'literal', value: [ 'left', 'right' ] },
          quantity:       { type: 'literal', value: 1 },
          startingOffset: { type: 'literal', value: 1 },
          toPosition:     { type: 'literal', value: 'bottom' }
        } } ] } ] }
      }
    ], 8);

    // a bottom move only works on a single pile, so the two destinations keep it
    // at the top and are dealt starting at the second one
    expect(state.button1.clickRoutine).toEqual([ { func: 'MOVE', from: 'holder1', to: [ 'holder3', 'holder2' ] } ]);
    expect(state._meta.info.importerWarnings).toEqual([
      'Moving objects to "bottom" is not supported - the objects "Under" moves end up on top of the destination.'
    ]);
  });

  it('recovers a bounded counter that a player cleared and keeps fractional steps clean', async () => {
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 0, counterValue: 0, counterMin: 0, counterMax: 1, counterStep: 0.1 }
    ], 8);

    expect(state.counter1_incrementButton.clickRoutine).toEqual([
      'var pcioCounter = parseFloat ${PROPERTY text OF counter1}',
      'var pcioCounter = ${pcioCounter} || 0',
      'var pcioCounter = ${pcioCounter} + 0.1',
      'var pcioCounter = max ${pcioCounter} 0',
      'var pcioCounter = min ${pcioCounter} 1',
      'var pcioCounter = ${pcioCounter} toFixed 1',
      { func: 'LABEL', label: 'counter1', value: '${pcioCounter}' }
    ]);
  });

  it('gives a step its read default when the read function is not its first alternative', async () => {
    const state = await importWidgets([
      { id: 'holder', type: 'holder', x: 0, y: 0 },
      { id: 'counter', type: 'counter', x: 100, y: 0, counterValue: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Mixed', x: 0, y: 300,
        clickRoutine: { steps: [
          { id: 'ask', branches: [ { func: 'IS_EQUAL', args: {
            numberA: { type: 'literal', value: 1 },
            numberB: { type: 'literal', value: 1 }
          } } ] },
          { id: 'mix', branches: [
            { func: 'SHUFFLE_CARDS', condition: { type: 'variable', callId: 'ask' }, args: {
              holders: { type: 'literal', value: [ 'holder' ] }
            } },
            { func: 'MATH', args: {
              mathOperator: { type: 'literal', value: 'add' },
              numberA:      { type: 'literal', value: 2 },
              numberB:      { type: 'literal', value: 3 }
            } }
          ] },
          { id: 'set', branches: [ { func: 'CHANGE_COUNTER', args: {
            counters:          { type: 'literal', value: [ 'counter' ] },
            counterChangeMode: { type: 'literal', value: 'set' },
            changeNumber:      { type: 'variable', callId: 'mix' }
          } } ] }
        ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([
      'var pcioask = 1 == 1',
      'var pciomix = 0',
      {
        func: 'IF',
        condition: '${pcioask}',
        thenRoutine: [ { func: 'SHUFFLE', holder: 'holder1' } ],
        elseRoutine: [ 'var pciomix = 2 + 3' ]
      },
      { func: 'LABEL', label: 'counter1', value: '${pciomix}' }
    ]);
  });

  it('reads a counter wherever a number is expected and reports one it cannot', async () => {
    const state = await importWidgets([
      { id: 'a', type: 'counter', x: 0, y: 0, counterValue: 2 },
      { id: 'total', type: 'counter', x: 100, y: 0, counterValue: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Double', x: 0, y: 300,
        clickRoutine: { steps: [
          { id: 'calc', branches: [ { func: 'MATH', args: {
            mathOperator: { type: 'literal', value: 'multiply' },
            numberA:      { counterId: 'a' },
            numberB:      { type: 'somethingNew' }
          } } ] },
          { id: 'set', branches: [ { func: 'CHANGE_COUNTER', args: {
            counters:          { type: 'literal', value: [ 'total' ] },
            counterChangeMode: { type: 'literal', value: 'set' },
            changeNumber:      { type: 'variable', callId: 'calc' }
          } } ] }
        ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([
      'var pciocalc = ${PROPERTY text OF counter1} * 1',
      { func: 'LABEL', label: 'counter2', value: '${pciocalc}' }
    ]);
    expect(state._meta.info.importerWarnings).toEqual([
      'A number an automation step of "Double" calculates with could not be imported - it uses 1 instead.'
    ]);
  });

  it('reports an automation that works on a widget which is not in the file', async () => {
    const state = await importWidgets([
      { id: 'holder', type: 'holder', x: 0, y: 0 },
      {
        id: 'button', type: 'automationButton', label: 'Shuffle', x: 0, y: 300,
        clickRoutine: { steps: [
          { id: 'a', branches: [ { func: 'SHUFFLE_CARDS', args: {
            holders: { type: 'literal', value: [ 'holder', 'deletedHolder' ] }
          } } ] },
          { id: 'b', branches: [ { func: 'RECALL_CARDS', args: {
            decks: { type: 'literal', value: [ 'deletedDeck' ] }
          } } ] }
        ] }
      }
    ], 8);

    expect(state.button1.clickRoutine).toEqual([ { func: 'SHUFFLE', holder: 'holder1' } ]);
    expect(state._meta.info.importerWarnings).toEqual([
      'An automation step of "Shuffle" works on a widget that is not part of the file - that widget was left out.'
    ]);
  });

  it('does not report the images of a die that VirtualTabletop draws itself', async () => {
    const pips = Object.fromEntries([ 1, 2, 3, 4, 5, 6 ].map(i=>[ String(i), { image: `/img/dice-basic/${i}.svg` } ]));
    const state = await importWidgets([
      { id: 'dd', type: 'cardDeck', x: 0, y: 0, collectionType: 'dice', cardWidth: 50, cardHeight: 50,
        cardTypes: pips, faceTemplate: { objects: [] } },
      { id: 'die', type: 'dice', deck: 'dd', x: 0, y: 0 }
    ], 8);

    expect(state.dice1.faces).toBeUndefined();
    expect(state._meta.info.importerWarnings).toBeUndefined();
  });

  it('caps the report instead of storing a note per widget', async () => {
    const broken = [];
    for(let i=0; i<150; ++i)
      broken.push({ id: `v${i}`, type: 'videoPlayer', x: i, y: 0, width: 10, height: 10 });
    const state = await importWidgets(broken, 8);

    expect(state._meta.info.importerWarnings.length).toBe(101);
    expect(state._meta.info.importerWarnings[100]).toBe('50 more notes are not listed here.');
  });

  it('points an asset at the copy the client already uploaded', async () => {
    const state = await importWidgets([
      { id: 'board', type: 'board', x: 0, y: 0, width: 100, height: 100, boardImage: 'package://userassets/board.png' }
    ], 8, { 'asset-map.json': JSON.stringify({ '1234_5678': 'userassets/board.png' }) });

    expect(state.board1.image).toBe('/assets/1234_5678');
  });

  it('ignores the folder entry that a .pcio carries for its assets', async () => {
    const state = await importWidgets([
      { id: 'board', type: 'board', x: 0, y: 0, width: 100, height: 100, boardImage: 'package://userassets/' }
    ], 8, { 'userassets': null });

    // it has no content, so it used to become an empty "undefined_undefined" asset
    expect(state.board1.image).toBe('package://userassets/');
    expect(state._meta.info.importerWarnings).toBeUndefined();
  });

  it('skips an asset that is bigger than the limit for .vtt assets', async () => {
    const state = await importWidgets([
      { id: 'board', type: 'board', x: 0, y: 0, width: 100, height: 100, boardImage: 'package://userassets/huge.png' }
    ], 8, { 'userassets/huge.png': Buffer.alloc(10485760) });

    expect(state.board1.image).toBe('package://userassets/huge.png');
    expect(state._meta.info.importerWarnings).toEqual([
      'Asset userassets/huge.png is bigger than 10 MiB and was not imported.'
    ]);
  });

  it('writes face objects that follow a card type property as dynamic properties', async () => {
    const state = await importWidgets([ deck, { id: 'card', type: 'card', deck: 'deck', cardType: 'a', x: 0, y: 0 } ], 8);

    expect(state.deck1.faceTemplates[0].objects[1]).toEqual({
      type: 'image', x: 0, y: 0, width: 103, height: 160, dynamicProperties: { value: 'image' }
    });
  });

  it('gives a hand the drop shadow, the hidden cursors and the caption of a VirtualTabletop hand', async () => {
    const state = await importWidgets([ { id: 'hand', type: 'hand', x: 0, y: 800 } ], 8);

    expect(state.hand.childrenPerOwner).toBe(true);
    expect(state.hand.dropShadow).toBe(true);
    expect(state.hand.hidePlayerCursors).toBe(true);
    expect(state.hand.text).toBe('Your hand');
  });

  it('captions a hand with the name it was given in PlayingCards.io', async () => {
    const state = await importWidgets([
      { id: 'hand',    type: 'hand', x: 0, y: 800, label: 'Your cards' },
      { id: 'hand2',   type: 'hand', x: 0, y: 600, label: 'Tricks you won' },
      { id: 'hand3',   type: 'hand', x: 0, y: 400 }
    ], 8);

    expect(state.hand.text).toBe('Your cards');
    expect(state.holder1.text).toBe('Tricks you won');
    // only the main hand is the player's hand - the other private zones say what they are
    expect(state.holder2.text).toBe('Private');
  });

  it('writes the file at the current version so that no legacy mode is turned on for it', async () => {
    // importWidgets checks the version and the round trip through FileUpdater for every
    // import of this suite - this one holds the widgets the legacy modes look for
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 0, counterValue: 1, counterMin: 0 },
      { id: 'hand', type: 'hand', x: 0, y: 800 }
    ], 8);

    // the var expressions of the counter buttons are what the legacy modes for the old var
    // semantics look for in an old file
    expect(JSON.stringify(state)).toContain('var pcioCounter');
  });

  it('imports a file whose schema version is missing or unreadable', async () => {
    for(const version of [ undefined, '', 'seven' ]) {
      const state = await importWidgets([ { id: 'holder', type: 'holder', x: 0, y: 0 } ], version);
      expect(state.holder1.type).toBe('holder');
      expect(state._meta.info.importerSchemaVersion).toBe(0);
      expect(state._meta.info.importerWarnings).toBeUndefined();
    }
  });
});
