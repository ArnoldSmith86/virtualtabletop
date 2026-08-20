import { widgets } from '../../../client/js/serverstate.js';
import { setupRoom, useBundleWidgets } from './harness.js';

// Holder enter/leave events, one assertion per combination of "how did the widget move" and
// "what is the holder configured to do about it". Both answers are written down: the modern
// one the engine gives now, and the one the legacyHolderEnterLeaveEvents mode restores.
//
// The trace is a string a holder's enterRoutine/leaveRoutine appends to, carrying the widget
// the event was about and the properties it had *at that moment* - which is the whole point:
// `mark=null` means the routine ran before the property half of its own event, and `parent=`
// says whether the move was already written when the routine looked.
//
// What Layer A can and cannot say: routine-driven moves (MOVE, MOVEXY, SET, CLONE, RECALL,
// DELETE) run the real operation, so those cases are exact. A drag has no layout in jsdom, so
// dragWidget() below replays the parent bookkeeping the drag performs rather than the drag
// itself - the real pointer path is covered by tests/testcafe/holderevents.js and
// tests/testcafe/enterleave.js. Coordinates are never asserted here (see harness.js).
//
// One more jsdom gap has a visible consequence: widget.parent, the link pile.js reads to hand
// a card back to the holder it sits in, is written by applyDeltaToDOM(), which only runs for a
// delta coming back from a server. The legacy pipeline used that link, so legacy expectations
// for cards leaving a pile *inside* a holder live in the TestCafe fixtures instead.

beforeAll(() => useBundleWidgets());

const FIELDS = [ 'parent', 'mark', 'owner' ];

// One trace entry: the tag, the id of the widget in the `child` collection and the fields read
// off it. Reading the log through ${PROPERTY trace OF log} rather than a variable is what makes
// entries accumulate across the separate routine invocations the engine makes.
function traceRoutine(tag, fields = FIELDS) {
  return [
    { func: 'GET', collection: 'child', property: 'id', variable: 'childID' },
    ...fields.map(property => ({ func: 'GET', collection: 'child', property, variable: `f_${property}` })),
    { func: 'SELECT', property: 'id', value: 'log', collection: 'log' },
    { func: 'SET', collection: 'log', property: 'trace',
      value: `\${PROPERTY trace OF log}${tag} \${childID}[${fields.map(p=>`${p}=\${f_${p}}`).join(' ')}];` }
  ];
}

function holder(id, properties = {}, fields = FIELDS) {
  return Object.assign({
    type: 'holder',
    onEnter: { mark: `enter-${id}` },
    onLeave: { mark: `leave-${id}` },
    enterRoutine: traceRoutine(`enter ${id}`, fields),
    leaveRoutine: traceRoutine(`leave ${id}`, fields)
  }, properties);
}

// A room with two traced holders, a card on the table and a button to run routines from.
function room(overrides = {}, holderOptions = {}, fields = FIELDS) {
  const state = {
    trigger: { type: 'button' },
    log: { type: 'widget', trace: '' },
    handA: holder('handA', holderOptions, fields),
    handB: holder('handB', holderOptions, fields),
    c1: { type: 'card' }
  };
  for(const [ id, properties ] of Object.entries(overrides))
    state[id] = state[id] ? Object.assign({}, state[id], properties) : properties;
  return state;
}

function trace() {
  return String(widgets.get('log').get('trace') || '').split(';').filter(entry => entry);
}

// The parent bookkeeping a drag performs, without the pointer: moveStart() detaches the widget,
// move() lets checkParent() drop it once it is out of the holder's box, and moveEnd() hands it
// to the holder it was released over. `leavesBox: false` is a drag that never left the holder
// it started in, which is the one case where the two differ.
async function dragWidget(id, { to = null, leavesBox = true } = {}) {
  const widget = widgets.get(id);
  const ancestor = widget.get('_ancestor');

  if(widgets.has(ancestor))
    widget.currentParent = widgets.get(ancestor);
  widget.disablePileUpdateAfterParentChange = true;
  await widget.set('parent', null);
  delete widget.disablePileUpdateAfterParentChange;

  if(leavesBox)
    await widget.checkParent(true);

  widget.pileUpdateFromDrag = true;
  if(to)
    await widget.moveToHolder(widgets.get(to));
  await widget.updatePiles();
  delete widget.pileUpdateFromDrag;
  delete widget.currentParent;
}

async function clickRoutine(routine) {
  await widgets.get('trigger').evaluateRoutine(routine, {}, {});
}

// Run the same scenario in both combinations and assert both traces. A case that is supposed to
// be unaffected by the mode passes the same array twice, which is what makes "this behaviour did
// not change" an assertion rather than an omission.
function scenario(name, build, action, expectations) {
  for(const [ combination, expected ] of Object.entries(expectations)) {
    const legacy = combination == 'legacy' ? { legacyHolderEnterLeaveEvents: true } : {};
    test(`${name} [${combination}]`, async () => {
      setupRoom(build(), { legacy });
      await action();
      expect(trace()).toEqual(expected);
    });
  }
}

// ------------------------------------------------------------------------------------------
// Dragging
// ------------------------------------------------------------------------------------------

describe('dragging', () => {
  scenario('a card from the table into a holder enters once',
    () => room(),
    () => dragWidget('c1', { to: 'handB' }),
    {
      modern: [ 'enter handB c1[parent=handB mark=enter-handB owner=null]' ],
      legacy: [ 'enter handB c1[parent=handB mark=enter-handB owner=null]' ]
    });

  scenario('a card out of a holder onto the table leaves once',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => dragWidget('c1'),
    {
      // one departure, with onLeave applied before the routine reads it
      modern: [ 'leave handA c1[parent=null mark=leave-handA owner=null]' ],
      // the two firing sites of issue #480: the detach and the dispense
      legacy: [
        'leave handA c1[parent=null mark=null owner=null]',
        'leave handA c1[parent=null mark=leave-handA owner=null]'
      ]
    });

  scenario('a card from one holder to another leaves and enters once each',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => dragWidget('c1', { to: 'handB' }),
    {
      modern: [
        'leave handA c1[parent=null mark=leave-handA owner=null]',
        'enter handB c1[parent=handB mark=enter-handB owner=null]'
      ],
      legacy: [
        'leave handA c1[parent=null mark=null owner=null]',
        'leave handA c1[parent=null mark=leave-handA owner=null]',
        'enter handB c1[parent=handB mark=enter-handB owner=null]'
      ]
    });

  scenario('a card dragged within its holder leaves and enters it again',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => dragWidget('c1', { to: 'handA', leavesBox: false }),
    {
      // the properties and the routines agree that the card left and came back
      modern: [
        'leave handA c1[parent=null mark=leave-handA owner=null]',
        'enter handA c1[parent=handA mark=enter-handA owner=null]'
      ],
      // the legacy pipeline recognised the return by currentParent and skipped onEnter, so the
      // routine said "entered" while the properties said nothing had happened
      legacy: [
        'leave handA c1[parent=null mark=null owner=null]',
        'enter handA c1[parent=handA mark=null owner=null]'
      ]
    });

  scenario('a card dragged out of a holder and back before the drop',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => dragWidget('c1', { to: 'handA' }),
    {
      modern: [
        'leave handA c1[parent=null mark=leave-handA owner=null]',
        'enter handA c1[parent=handA mark=enter-handA owner=null]'
      ],
      legacy: [
        'leave handA c1[parent=null mark=null owner=null]',
        'leave handA c1[parent=null mark=leave-handA owner=null]',
        'enter handA c1[parent=handA mark=enter-handA owner=null]'
      ]
    });

  scenario('a holder without routines fires nothing',
    () => room({ handA: { enterRoutine: null, leaveRoutine: null, onEnter: {}, onLeave: {} }, handB: { enterRoutine: null, leaveRoutine: null, onEnter: {}, onLeave: {} }, c1: { type: 'card', parent: 'handA' } }),
    () => dragWidget('c1', { to: 'handB' }),
    { modern: [], legacy: [] });
});

// ------------------------------------------------------------------------------------------
// Routines that move widgets
// ------------------------------------------------------------------------------------------

describe('MOVE', () => {
  scenario('from one holder to another',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => clickRoutine([ { func: 'MOVE', from: 'handA', to: 'handB', count: 1 } ]),
    {
      modern: [
        'leave handA c1[parent=null mark=leave-handA owner=null]',
        'enter handB c1[parent=handB mark=enter-handB owner=null]'
      ],
      // moveToHolder() detaches through checkParent(), so MOVE inherited the doubled leave -
      // and its second call ran after the card had already arrived in handB
      legacy: [
        'leave handA c1[parent=null mark=null owner=null]',
        'leave handA c1[parent=null mark=leave-handA owner=null]',
        'enter handB c1[parent=handB mark=enter-handB owner=null]'
      ]
    });

  scenario('of a collection into a holder',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'MOVE', to: 'handB' } ]),
    {
      modern: [
        'leave handA c1[parent=null mark=leave-handA owner=null]',
        'enter handB c1[parent=handB mark=enter-handB owner=null]'
      ],
      legacy: [
        'leave handA c1[parent=null mark=null owner=null]',
        'leave handA c1[parent=null mark=leave-handA owner=null]',
        'enter handB c1[parent=handB mark=enter-handB owner=null]'
      ]
    });

  scenario('from the table into a holder only enters',
    () => room(),
    () => clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'MOVE', to: 'handB' } ]),
    {
      modern: [ 'enter handB c1[parent=handB mark=enter-handB owner=null]' ],
      legacy: [ 'enter handB c1[parent=handB mark=enter-handB owner=null]' ]
    });

  scenario('into the holder the widget is already in fires nothing',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => clickRoutine([ { func: 'MOVE', from: 'handA', to: 'handA', count: 1 } ]),
    { modern: [], legacy: [] });

  scenario('to a seat moves into that seat\'s hand',
    () => room({
      c1: { type: 'card', parent: 'handA' },
      seat1: { type: 'seat', hand: 'handB', player: 'jestPlayer' },
      handB: { childrenPerOwner: true }
    }),
    () => clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'MOVE', to: 'seat1' } ]),
    {
      modern: [
        'leave handA c1[parent=null mark=leave-handA owner=null]',
        'enter handB c1[parent=handB mark=enter-handB owner=jestPlayer]'
      ],
      legacy: [
        'leave handA c1[parent=null mark=null owner=null]',
        'leave handA c1[parent=null mark=leave-handA owner=null]',
        'enter handB c1[parent=handB mark=enter-handB owner=jestPlayer]'
      ]
    });
});

describe('MOVEXY', () => {
  scenario('out of a holder applies onLeave and leaves once',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => clickRoutine([ { func: 'MOVEXY', from: 'handA', x: 600, y: 300 } ]),
    {
      // issue #1371: the departure is the same event however the widget was moved
      modern: [ 'leave handA c1[parent=null mark=leave-handA owner=null]' ],
      // the legacy pipeline never reached dispenseCard() here, so onLeave was skipped entirely
      legacy: [ 'leave handA c1[parent=null mark=null owner=null]' ]
    });

  scenario('of a widget that is already on the table fires nothing',
    () => room({ c1: { type: 'card' } }),
    () => clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'MOVEXY', from: 'handA', x: 10, y: 10 } ]),
    { modern: [], legacy: [] });
});

describe('SET parent', () => {
  scenario('from one holder to another leaves and enters',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'SET', property: 'parent', value: 'handB' } ]),
    {
      // issue #1836: onLeave is applied whichever way the parent changed. The parent is already
      // the destination when the routines run, because SET writes it before the event.
      modern: [
        'leave handA c1[parent=handB mark=leave-handA owner=null]',
        'enter handB c1[parent=handB mark=enter-handB owner=null]'
      ],
      legacy: [
        'leave handA c1[parent=handB mark=null owner=null]',
        'enter handB c1[parent=handB mark=enter-handB owner=null]'
      ]
    });

  scenario('to null leaves',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'SET', property: 'parent', value: null } ]),
    {
      modern: [ 'leave handA c1[parent=null mark=leave-handA owner=null]' ],
      legacy: [ 'leave handA c1[parent=null mark=null owner=null]' ]
    });

  scenario('from the table into a holder enters',
    () => room(),
    () => clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'SET', property: 'parent', value: 'handB' } ]),
    {
      modern: [ 'enter handB c1[parent=handB mark=enter-handB owner=null]' ],
      legacy: [ 'enter handB c1[parent=handB mark=enter-handB owner=null]' ]
    });
});

describe('other operations', () => {
  scenario('CLONE into another holder enters',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => clickRoutine([
      { func: 'SELECT', property: 'id', value: 'c1' },
      { func: 'CLONE', count: 1, properties: { id: 'clone1', parent: 'handB' } }
    ]),
    {
      modern: [ 'enter handB clone1[parent=handB mark=enter-handB owner=null]' ],
      legacy: [ 'enter handB clone1[parent=handB mark=enter-handB owner=null]' ]
    });

  scenario('CLONE inside a holder piles the copy onto the original',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => clickRoutine([
      { func: 'SELECT', property: 'id', value: 'c1' },
      { func: 'CLONE', count: 1, properties: { id: 'clone1' } }
    ]),
    {
      // the copy arrives in handA, and the pile the two of them form inside it is not a
      // second move: issue #1094
      modern: [ 'enter handA clone1[parent=handA mark=enter-handA owner=null]' ],
      legacy: [
        'enter handA clone1[parent=handA mark=enter-handA owner=null]',
        'leave handA c1[parent=generated-1 mark=null owner=null]',
        'leave handA clone1[parent=generated-1 mark=enter-handA owner=null]'
      ]
    });

  scenario('DELETE of a card in a holder leaves without applying onLeave',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'DELETE' } ]),
    {
      // a widget on its way out of the room has nothing left to apply properties to, but the
      // holder is still told that it lost a card
      modern: [ 'leave handA c1[parent=handA mark=null owner=null]' ],
      legacy: [ 'leave handA c1[parent=handA mark=null owner=null]' ]
    });

  scenario('a card that never changes parent fires nothing',
    () => room({ c1: { type: 'card', parent: 'handA' } }),
    () => clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'SET', property: 'x', value: 42 } ]),
    { modern: [], legacy: [] });
});

// ------------------------------------------------------------------------------------------
// The holder properties that change what an event does
// ------------------------------------------------------------------------------------------

describe('holder properties', () => {
  scenario('childrenPerOwner claims what enters and releases what leaves',
    () => room({ handA: { childrenPerOwner: true }, handB: { childrenPerOwner: true }, c1: { type: 'card', parent: 'handA', owner: 'jestPlayer' } }),
    () => dragWidget('c1', { to: 'handB' }),
    {
      modern: [
        'leave handA c1[parent=null mark=leave-handA owner=null]',
        'enter handB c1[parent=handB mark=enter-handB owner=jestPlayer]'
      ],
      // the owner was still set when the first of the two legacy calls ran: checkParent() reset
      // it between them
      legacy: [
        'leave handA c1[parent=null mark=null owner=jestPlayer]',
        'leave handA c1[parent=null mark=leave-handA owner=null]',
        'enter handB c1[parent=handB mark=enter-handB owner=jestPlayer]'
      ]
    });

  scenario('childrenPerOwner also releases a card taken out by SET parent',
    () => room({ handA: { childrenPerOwner: true }, c1: { type: 'card', parent: 'handA', owner: 'jestPlayer' } }),
    () => clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'SET', property: 'parent', value: null } ]),
    {
      modern: [ 'leave handA c1[parent=null mark=leave-handA owner=null]' ],
      // the owner reset lived in checkParent(), which a SET never reaches
      legacy: [ 'leave handA c1[parent=null mark=null owner=jestPlayer]' ]
    });

  scenario('ignoreOnLeave skips the property half but not the routine',
    () => room({ c1: { type: 'card', parent: 'handA', ignoreOnLeave: true } }),
    () => dragWidget('c1'),
    {
      modern: [ 'leave handA c1[parent=null mark=null owner=null]' ],
      legacy: [
        'leave handA c1[parent=null mark=null owner=null]',
        'leave handA c1[parent=null mark=null owner=null]'
      ]
    });

  scenario('onEnter and onLeave with several properties are all applied before the routine',
    () => room({
      handB: { onEnter: { mark: 'enter-handB', activeFace: 1 } },
      c1: { type: 'card' }
    }, {}, [ 'mark', 'activeFace' ]),
    () => dragWidget('c1', { to: 'handB' }),
    {
      modern: [ 'enter handB c1[mark=enter-handB activeFace=1]' ],
      legacy: [ 'enter handB c1[mark=enter-handB activeFace=1]' ]
    });

  scenario('a holder moved out of another widget does not run its leaveRoutine',
    () => room({ handB: { parent: 'handA' } }),
    () => clickRoutine([ { func: 'SELECT', property: 'id', value: 'handB' }, { func: 'SET', property: 'parent', value: null } ]),
    {
      // holders are furniture, not cards - a holder changing parent has never been a departure
      modern: [],
      legacy: []
    });

  scenario('a deck is exempt from onEnter',
    () => room({ d1: { type: 'deck' } }, {}, [ 'mark' ]),
    () => clickRoutine([ { func: 'SELECT', property: 'id', value: 'd1' }, { func: 'SET', property: 'parent', value: 'handB' } ]),
    {
      modern: [ 'enter handB d1[mark=null]' ],
      legacy: [ 'enter handB d1[mark=null]' ]
    });
});

// ------------------------------------------------------------------------------------------
// Piles
// ------------------------------------------------------------------------------------------
//
// A pile is a stack of cards inside whatever holds it, not a container of its own. Every case
// below is one consequence of that, and the modern answers are the ones issue #1094 asks for.
// The legacy answers of the cases that involve pile.js reading widget.parent are covered in
// tests/testcafe/enterleave.js instead - see the note at the top of this file.

describe('piles', () => {
  const withPile = (holderProperties = {}) => room({
    handB: holderProperties,
    pile1: { type: 'pile', parent: 'handB' },
    c1: { type: 'card', parent: 'pile1' },
    c2: { type: 'card', parent: 'pile1' }
  });

  test('a card leaving a pile inside a holder leaves the holder once', async () => {
    setupRoom(withPile());
    await clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'SET', property: 'parent', value: null } ]);
    expect(trace()).toEqual([ 'leave handB c1[parent=null mark=leave-handB owner=null]' ]);
  });

  test('a card joining a pile inside its holder raises no event', async () => {
    setupRoom(room({
      handB: {},
      pile1: { type: 'pile', parent: 'handB' },
      c2: { type: 'card', parent: 'pile1' },
      c3: { type: 'card', parent: 'pile1' },
      c1: { type: 'card', parent: 'handB' }
    }));
    await clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'SET', property: 'parent', value: 'pile1' } ]);
    expect(trace()).toEqual([]);
  });

  test('a card entering a holder and joining a pile in it enters exactly once', async () => {
    setupRoom(room({
      handB: {},
      pile1: { type: 'pile', parent: 'handB' },
      c2: { type: 'card', parent: 'pile1' },
      c3: { type: 'card', parent: 'pile1' }
    }));
    await clickRoutine([
      { func: 'SELECT', property: 'id', value: 'c1' },
      { func: 'SET', property: 'parent', value: 'handB' },
      { func: 'SET', property: 'parent', value: 'pile1' }
    ]);
    expect(trace()).toEqual([ 'enter handB c1[parent=handB mark=enter-handB owner=null]' ]);
  });

  test('a pile dissolving in its holder raises no event for the card that stays', async () => {
    setupRoom(withPile());
    await clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'SET', property: 'parent', value: null } ]);
    // c2 ends up directly in handB, and the pile is gone - neither is a departure or an arrival
    expect(widgets.get('c2').get('parent')).toBe('handB');
    expect(widgets.has('pile1')).toBe(false);
    expect(trace()).toEqual([ 'leave handB c1[parent=null mark=leave-handB owner=null]' ]);
  });

  test('a pile dragged into a holder enters once and marks every card in it', async () => {
    setupRoom(room({ pile1: { type: 'pile' }, c1: { type: 'card', parent: 'pile1' }, c2: { type: 'card', parent: 'pile1' } }));
    await dragWidget('pile1', { to: 'handB' });
    expect(trace()).toEqual([ 'enter handB pile1[parent=handB mark=null owner=null]' ]);
    expect(widgets.get('c1').get('mark')).toBe('enter-handB');
    expect(widgets.get('c2').get('mark')).toBe('enter-handB');
  });

  test('a pile dragged out of a holder leaves once and marks every card in it', async () => {
    setupRoom(withPile());
    await dragWidget('pile1');
    expect(trace()).toEqual([ 'leave handB pile1[parent=null mark=null owner=null]' ]);
    expect(widgets.get('c1').get('mark')).toBe('leave-handB');
    expect(widgets.get('c2').get('mark')).toBe('leave-handB');
  });

  test('two cards forming a pile inside a holder raise no event', async () => {
    setupRoom(room({
      // Two properties a real card carries and a harness card does not: updatePiles() merges
      // only widgets whose owner is strictly equal (moveToHolder writes null), and it reads
      // onPileCreation for the limit of the pile it would create - {} is the Card default.
      c1: { type: 'card', parent: 'handB', x: 10, y: 10, owner: null, onPileCreation: {} },
      c2: { type: 'card', parent: 'handB', x: 10, y: 10, owner: null, onPileCreation: {} }
    }, { alignChildren: false }));
    await dragWidget('c1', { to: 'handB', leavesBox: false });
    const pile = [ ...widgets.values() ].find(w => w.get('type') == 'pile');
    expect(pile).toBeDefined();
    expect(pile.get('parent')).toBe('handB');
    // picking the card up and dropping it again is the whole event story; the pile the drop
    // forms out of the two cards is not a third move
    expect(trace()).toEqual([
      'leave handB c1[parent=null mark=leave-handB owner=null]',
      'enter handB c1[parent=handB mark=enter-handB owner=null]'
    ]);
  });

  // A pile on the table has no holder behind it, so it is a container of its own and its own
  // routines are what a card entering or leaving it raises.
  // away from the origin, so a card that leaves it keeps coordinates far enough away for
  // updatePiles() not to put it straight back
  const tracedPile = { type: 'pile', x: 500, y: 500, enterRoutine: traceRoutine('enter pile1'), leaveRoutine: traceRoutine('leave pile1') };

  test('a card leaving a pile on the table raises that pile\'s leave event', async () => {
    // three cards, so taking one out does not dissolve the pile in the same breath
    setupRoom(room({ pile1: tracedPile, c1: { type: 'card', parent: 'pile1' }, c2: { type: 'card', parent: 'pile1' }, c3: { type: 'card', parent: 'pile1' } }));
    await clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'SET', property: 'parent', value: null } ]);
    expect(trace()).toEqual([ 'leave pile1 c1[parent=null mark=null owner=null]' ]);
  });

  test('a card joining a pile on the table raises that pile\'s enter event', async () => {
    setupRoom(room({ pile1: tracedPile, c2: { type: 'card', parent: 'pile1' }, c3: { type: 'card', parent: 'pile1' } }));
    await clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'SET', property: 'parent', value: 'pile1' } ]);
    expect(trace()).toEqual([ 'enter pile1 c1[parent=pile1 mark=null owner=null]' ]);
  });

  test('a per-owner holder claims every card of a pile it unpacks', async () => {
    setupRoom(room({ pile1: { type: 'pile' }, c1: { type: 'card', parent: 'pile1' }, c2: { type: 'card', parent: 'pile1' } },
      { preventPiles: true, childrenPerOwner: true }));
    await dragWidget('pile1', { to: 'handB' });
    // the cards become children of the holder one by one, which is not an arrival from outside -
    // so the owner cannot hang off the enter event
    expect([ widgets.get('c1').get('owner'), widgets.get('c2').get('owner') ]).toEqual([ 'jestPlayer', 'jestPlayer' ]);
  });

  test('a preventPiles holder unpacks a dropped pile without extra events', async () => {
    setupRoom(room({ pile1: { type: 'pile' }, c1: { type: 'card', parent: 'pile1' }, c2: { type: 'card', parent: 'pile1' } },
      { preventPiles: true }));
    await dragWidget('pile1', { to: 'handB' });
    expect(widgets.get('c1').get('parent')).toBe('handB');
    expect(widgets.get('c2').get('parent')).toBe('handB');
    expect(trace()).toEqual([ 'enter handB pile1[parent=handB mark=null owner=null]' ]);
  });
});

// ------------------------------------------------------------------------------------------
// Ordering invariants
// ------------------------------------------------------------------------------------------

describe('ordering', () => {
  test('a leave is complete before the enter of the same move starts', async () => {
    setupRoom(room({
      c1: { type: 'card', parent: 'handA' },
      handA: { leaveRoutine: [
        { func: 'SELECT', property: 'id', value: 'log', collection: 'log' },
        { func: 'SET', collection: 'log', property: 'trace', value: '${PROPERTY trace OF log}leave-start;' },
        { func: 'SET', collection: 'log', property: 'trace', value: '${PROPERTY trace OF log}leave-end;' }
      ] },
      handB: { enterRoutine: [
        { func: 'SELECT', property: 'id', value: 'log', collection: 'log' },
        { func: 'SET', collection: 'log', property: 'trace', value: '${PROPERTY trace OF log}enter;' }
      ] }
    }));
    await clickRoutine([ { func: 'MOVE', from: 'handA', to: 'handB', count: 1 } ]);
    expect(trace()).toEqual([ 'leave-start', 'leave-end', 'enter' ]);
  });

  test('the enterRoutine of a holder is told where the widget came from', async () => {
    setupRoom(room({
      c1: { type: 'card', parent: 'handA' },
      handB: { enterRoutine: [
        { func: 'SELECT', property: 'id', value: 'log', collection: 'log' },
        { func: 'SET', collection: 'log', property: 'oldParent', value: '${oldParentID}' }
      ] }
    }));
    await clickRoutine([ { func: 'SELECT', property: 'id', value: 'c1' }, { func: 'SET', property: 'parent', value: 'handB' } ]);
    expect(widgets.get('log').get('oldParent')).toBe('handA');
  });

  test('a drag tells the receiving holder nothing about the origin', async () => {
    setupRoom(room({
      c1: { type: 'card', parent: 'handA' },
      handB: { enterRoutine: [
        { func: 'SELECT', property: 'id', value: 'log', collection: 'log' },
        { func: 'SET', collection: 'log', property: 'oldParent', value: '${oldParentID}' }
      ] }
    }));
    await dragWidget('c1', { to: 'handB' });
    // the drag detaches the widget before it lands, so there is no old parent left to name
    expect(widgets.get('log').get('oldParent')).toBe(null);
  });
});
