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
      // PCIO deals one card after the other unless it is told to move the pile
      { note: 'Deal one at a time', func: 'FOREACH', range: [ 1, 3 ], loopRoutine: [
        { func: 'MOVE', from: 'source', to: 'target', count: 1, face: 1 }
      ] },
      { func: 'SORT', holder: 'target', key: 'sortingOrder' }
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

    expect(state.button.clickRoutine).toEqual([
      'var pcioroll = randRange 1 7 1',
      'var pcioNumber1 = parseFloat ${PROPERTY text OF counter}',
      'var pciohigh = ${pcioroll} > ${pcioNumber1}',
      {
        func: 'IF',
        condition: '${pciohigh}',
        thenRoutine: [ { func: 'LABEL', label: 'counter', value: '${pcioroll}' } ],
        elseRoutine: [ { func: 'LABEL', label: 'counter', mode: 'inc', value: 1 } ]
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

    expect(state.button.clickRoutine[1]).toEqual({
      note: 'Deal one at a time',
      func: 'IF',
      operand1: '${howMany}',
      relation: '>',
      operand2: 0,
      thenRoutine: [
        { func: 'FOREACH', range: [ 1, '${howMany}' ], loopRoutine: [ { func: 'MOVE', from: 'source', to: 'target', count: 1 } ] }
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

    expect(state.button.clickRoutine).toEqual([ { func: 'MOVE', from: 'source', to: 'target', count: 200 } ]);
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

    expect(state.counter.text).toBe(5);
    expect(state.counter_incrementButton.clickRoutine).toEqual([
      'var pcioCounter = parseFloat ${PROPERTY text OF counter}',
      'var pcioCounter = ${pcioCounter} + 2',
      'var pcioCounter = max ${pcioCounter} 0',
      'var pcioCounter = min ${pcioCounter} 5',
      { func: 'LABEL', label: 'counter', value: '${pcioCounter}' }
    ]);
    expect(state.button.clickRoutine).toEqual([
      'var pcioCounter = parseFloat ${PROPERTY text OF counter}',
      'var pcioCounter = ${pcioCounter} + 4',
      'var pcioCounter = max ${pcioCounter} 0',
      'var pcioCounter = min ${pcioCounter} 5',
      { func: 'LABEL', label: 'counter', value: '${pcioCounter}' }
    ]);
  });

  it('only clamps the side a counter is bounded on', async () => {
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 0, counterValue: 3, counterMax: 10 }
    ], 8);

    expect(state.counter.text).toBe(3);
    expect(state.counter_incrementButton.clickRoutine).toEqual([
      'var pcioCounter = parseFloat ${PROPERTY text OF counter}',
      'var pcioCounter = ${pcioCounter} + 1',
      'var pcioCounter = min ${pcioCounter} 10',
      { func: 'LABEL', label: 'counter', value: '${pcioCounter}' }
    ]);
    expect(state._meta.info.importerWarnings).toEqual([
      'Typing a value into the counter "counter" is not restricted to its maximum of 10 - the buttons and the automations that change it are.'
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

    expect(state.button.clickRoutine).toEqual([
      { func: 'SELECT', property: 'parent', relation: 'in', value: [ 'holder' ], type: 'card', collection: 'pcioPile', sortBy: 'z' },
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

    expect(state.button.clickRoutine).toEqual([
      { func: 'SELECT', property: 'id', relation: 'in', value: [ 'seat1', 'seat2' ], type: 'seat', collection: 'pcioSeats' },
      { note: 'Pass the hands on', func: 'SWAPHANDS', source: 'pcioSeats', interval: 1, direction: 'forward', keepOrder: true }
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
    expect(state.button.clickRoutine).toEqual([
      { func: 'MOVE', from: 'c', to: 'pcioShiftTempHolder',   count: 'all' },
      { func: 'MOVE', from: 'b', to: 'c',                     count: 'all' },
      { func: 'MOVE', from: 'a', to: 'b',                     count: 'all' },
      { func: 'MOVE', from: 'pcioShiftTempHolder', to: 'a',   count: 'all' }
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

    expect(state.button.clickRoutine).toEqual([
      'var pciomod = 7 % 3',
      'var pciopow = ${pciomod} ** 3',
      { func: 'LABEL', label: 'counter', value: '${pciopow}' }
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

    expect(state.button.clickRoutine).toEqual([
      'var pcioask = 1 == 1',
      'var pcioroll = 0',
      { func: 'IF', condition: '${pcioask}', thenRoutine: [ 'var pcioroll = randRange 1 7 1' ] },
      { func: 'LABEL', label: 'counter', value: '${pcioroll}' }
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

    expect(state.button.borderRadius).toBe(12);
    expect(state.button.css).toBe([
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

  it('spells out the faces of a die that has fewer than six of the standard ones', async () => {
    const state = await importWidgets([
      { id: 'd3Deck', type: 'cardDeck', x: 0, y: 0, collectionType: 'dice', cardWidth: 50, cardHeight: 50,
        cardTypes: { one: { image: '/img/dice-basic/1.svg' }, two: { image: '/img/dice-basic/2.svg' }, three: { image: '/img/dice-basic/3.svg' } },
        faceTemplate: { objects: [ { type: 'image', x: 0, y: 0, w: 50, h: 50, valueType: 'dynamic', value: 'image' } ] } },
      { id: 'd3', type: 'dice', deck: 'd3Deck', x: 0, y: 0 }
    ], 8);

    expect(state.d3.faces).toEqual([
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

    expect(state.d6.faces).toBeUndefined();
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
      'Widgets of type "somethingNew" cannot be imported - the striped placeholder at 0,0 marks where "unknown" was.',
      'Ignored a widget without a type (noType).',
      'The automation step "FUTURE_STEP" of "Shift" has no VirtualTabletop equivalent and was skipped.'
    ]);
    expect(state.button.clickRoutine).toEqual([]);
  });

  it('keeps the size of a widget it cannot import and says what it was', async () => {
    const state = await importWidgets([
      { id: 'unknown', type: 'videoPlayer', x: 200, y: 400, width: 180, height: 100 }
    ], 8);

    expect(state.unknown.width).toBe(180);
    expect(state.unknown.height).toBe(100);
    expect(state.unknown.text).toBe('videoPlayer not imported');
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
    expect(state.holder.css).toBe('border: 2px solid #000000; box-sizing: border-box; box-shadow: 0 0 0 8px #ff0000');
    expect(state.holder_label.css).toBeUndefined();
    // the outlines reach 8px beyond the holder, so label and button move aside
    expect(state.holder_label.y).toBe(-48);
    expect(state.holder_shuffleButton.y).toBe(1.02*168 + 8);
  });

  it('styles the value of a counter without styling its caption and buttons', async () => {
    const state = await importWidgets([
      { id: 'counter', type: 'counter', x: 0, y: 0, label: 'Score', counterValue: 3,
        mainBackground: { fill: { type: 'color', color: '#dcedc8' } },
        mainTextStyle: { size: 26, mainFill: { type: 'color', color: '#1b5e20' } } }
    ], 8);

    expect(state.counter.css).toEqual({
      default: 'background: #dcedc8',
      ' > textarea': { 'font-size': '26px', color: '#1b5e20' }
    });
    expect(state.counter_label.css).toBeUndefined();
    expect(state.counter_incrementButton.css).toBeUndefined();
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

  it('shows the address of a webpage button without pretending to open it', async () => {
    const state = await importWidgets([
      { id: 'link', type: 'urlButton', x: 0, y: 0, label: 'Rules', clickURL: 'https://example.com/rules' }
    ], 8);

    expect(state.link.clickRoutine).toEqual([ {
      func: 'INPUT',
      header: 'Rules',
      confirmButtonText: 'Close',
      cancelButtonText: null,
      cancelButtonIcon: null,
      fields: [
        { type: 'text', text: 'On PlayingCards.io this button opened a webpage. VirtualTabletop cannot open links, so here is the address:' },
        { type: 'text', text: 'https://example.com/rules' }
      ]
    } ]);
  });

  it('gives a label text the height PCIO gives it and grows it for wrapping text', async () => {
    const state = await importWidgets([
      { id: 'short', type: 'labelText', x: 0, y: 0,   width: 400, height: 60, labelContent: 'One line',
        mainTextStyle: { size: 30 } },
      { id: 'long',  type: 'labelText', x: 0, y: 100, width: 200, height: 60, mainTextStyle: { size: 30 },
        labelContent: 'A label with quite a lot of text in it that has to wrap several times to fit' }
    ], 8);

    expect(state.short.height).toBe(60);
    expect(state.long.height).toBeGreaterThan(60);
  });

  it('imports a turn button at the size PCIO gives it', async () => {
    const state = await importWidgets([
      { id: 'turn', type: 'turnButton', x: 0, y: 0, label: 'End Turn', clickRoutine: { steps: [] } }
    ], 8);

    expect(state.turn.width).toBe(162);
    expect(state.turn.height).toBe(66);
  });

  it('scales a die face down so that a word fits on it', async () => {
    const state = await importWidgets([
      { id: 'dd', type: 'cardDeck', x: 0, y: 0, collectionType: 'dice', cardWidth: 50, cardHeight: 50,
        cardTypes: { one: { label: 'Yes' }, two: { label: 'No' }, three: { label: 'Maybe' } },
        faceTemplate: { objects: [] } },
      { id: 'die', type: 'dice', deck: 'dd', x: 0, y: 0 }
    ], 8);

    expect(state.die.faces).toEqual([ { value: 'Yes' }, { value: 'No' }, { value: 'Maybe' } ]);
    expect(state.die.css).toBe('--fontSize: 17px');
  });
});
