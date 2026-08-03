import { ClientFunction, Selector } from 'testcafe';

import { getState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// a deck whose card face has a "write" object: what players type into it is stored in the card
// property the object's value is bound to ("note"), the first object is a plain text object
function editableCardRoom() {
  return {
    deck: {
      id: 'deck', type: 'deck', x: 20, y: 20,
      cardDefaults: { width: 200, height: 140 },
      cardTypes: { note: { title: 'Mission', note: '' } },
      faceTemplates: [
        { objects: [
          { type: 'text', x: 0, y: 5, width: 200, fontSize: 18, textAlign: 'center', dynamicProperties: { value: 'title' } },
          { type: 'write', placeholder: 'write here', spellCheck: true, x: 10, y: 40, width: 180, height: 90, fontSize: 14, dynamicProperties: { value: 'note' } }
        ] },
        { objects: [ { type: 'text', x: 0, y: 60, width: 200, fontSize: 18, textAlign: 'center', value: 'back' } ] }
      ]
    },
    card: { id: 'card', type: 'card', deck: 'deck', cardType: 'note', x: 400, y: 300 }
  };
}

// the same object, but locked through a dynamic "editable" that is false for this card type: the text can be
// read but not typed into, and the card still behaves like a card even though the area covers the whole face
function lockedCardRoom() {
  return {
    deck: {
      id: 'deck', type: 'deck', x: 20, y: 20,
      cardDefaults: { width: 200, height: 140 },
      // more text than fits into the 20px high area, so it has to overflow instead of being clipped away
      cardTypes: { note: { note: 'locked text that is much longer than the area reserved for it', unlocked: false } },
      faceTemplates: [
        { objects: [
          { type: 'write', backgroundColor: '#ffff00', borderColor: '#ff0000', x: 10, y: 10, width: 180, height: 20, fontSize: 14, dynamicProperties: { value: 'note', editable: 'unlocked' } }
        ] },
        { objects: [ { type: 'text', x: 0, y: 60, width: 200, fontSize: 18, textAlign: 'center', value: 'back' } ] }
      ]
    },
    card: { id: 'card', type: 'card', deck: 'deck', cardType: 'note', x: 400, y: 300 }
  };
}

// the same object with a css object that aligns its text, and a card type that already carries some text so
// that the room and the deck editor's readonly copy of the card have the same thing to lay out
function styledCardRoom() {
  return {
    deck: {
      id: 'deck', type: 'deck', x: 20, y: 20,
      cardDefaults: { width: 200, height: 140 },
      cardTypes: { note: { note: 'aligned' } },
      faceTemplates: [
        { objects: [
          { type: 'write', placeholder: 'write here', x: 10, y: 10, width: 180, height: 90, fontSize: 14,
            css: 'display: flex; justify-content: right; align-items: center', dynamicProperties: { value: 'note' } }
        ] }
      ]
    },
    card: { id: 'card', type: 'card', deck: 'deck', cardType: 'note', x: 400, y: 300 }
  };
}

// a card that starts out writable and is locked by a button while it is on the table
function lockableCardRoom() {
  const room = lockedCardRoom();
  room.deck.cardTypes.note = { note: 'written text', unlocked: true };
  room.lock = { id: 'lock', type: 'button', x: 800, y: 300, clickRoutine: [
    { func: 'SELECT', property: 'id', value: 'card' },
    { func: 'SET', property: 'unlocked', value: false }
  ] };
  return room;
}

// write objects bound to properties the engine owns: writing to 'type' would replace the card with a
// different widget and '_ancestor' is computed by the engine and refused to routines as well, so both have
// to render as plain text objects instead
function reservedBindingCardRoom() {
  return {
    deck: {
      id: 'deck', type: 'deck', x: 20, y: 20,
      cardDefaults: { width: 200, height: 140 },
      cardTypes: { note: {} },
      faceTemplates: [
        { objects: [
          { type: 'write', x: 10, y: 10, width: 180, height: 40, fontSize: 14, dynamicProperties: { value: 'type' } },
          { type: 'write', x: 10, y: 60, width: 180, height: 40, fontSize: 14, dynamicProperties: { value: '_ancestor' } }
        ] }
      ]
    },
    card: { id: 'card', type: 'card', deck: 'deck', cardType: 'note', x: 400, y: 300 }
  };
}

async function cardProperty(property) {
  return JSON.parse(await getState()).card[property];
}

async function expectEventually(t, get, expected) {
  let actual = null;
  for(let wait=50; wait<1000; wait*=2) {
    actual = await get();
    if(JSON.stringify(actual) == JSON.stringify(expected))
      break;
    await new Promise(resolve=>setTimeout(resolve, wait));
  }
  await t.expect(actual).eql(expected);
}

test('A write object stores what is typed on the card and survives a reload', async t => {
  await setRoomState(editableCardRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  const text = Selector('#w_card .cardFaceObject.write');
  // the box players write in is styled by the object's own properties, which default to a transparent fill
  // and a black border - no css object needed to make the writable area visible
  const boxStyle = ClientFunction(()=>{
    const style = getComputedStyle(document.querySelector('#w_card .cardFaceObject.write'));
    return [ style.backgroundColor, style.borderTopColor, style.borderTopWidth ];
  });
  await t
    // an empty object shows its placeholder, drawn as generated content so that it is never typed into
    .expect(text.hasClass('cardFacePlaceholder')).ok()
    .expect(text.getAttribute('data-placeholder')).eql('write here')
    .expect(text.getAttribute('spellcheck')).eql('true') // opt-in per object, like a label's spellCheck
    .expect(await boxStyle()).eql([ 'rgba(0, 0, 0, 0)', 'rgb(0, 0, 0)', '1px' ]);

  // What a player types can only be checked in Chrome: TestCafe (3.7.3) can not drive a contenteditable
  // element in Firefox - a click on one that is contenteditable="plaintext-only" never returns and pressKey
  // throws for any of them - while Firefox itself types into the object just fine.
  if(t.browser.name == 'Firefox')
    return;

  // typeText emulates typing into a form control and does not reach a contenteditable object reliably
  await t
    .click(text)
    .pressKey('h e l l o space c a r d');
  await expectEventually(t, ()=>cardProperty('note'), 'hello card');
  await t.expect(text.hasClass('cardFacePlaceholder')).notOk(); // the hint is gone once there is text

  // the text comes back from the room state after a reload - it is a card property, not just DOM
  await ClientFunction(()=>location.reload())();
  await t.expect(Selector('#w_card .cardFaceObject.write').textContent).eql('hello card');

  // clicking the card next to its text area still flips it
  await t.click('#w_card', { offsetX: 100, offsetY: 15 });
  await expectEventually(t, ()=>cardProperty('activeFace'), 1);
});

test('A locked write object is shown as a plain text object that overflows instead of being clipped', async t => {
  await setRoomState(lockedCardRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  const text = Selector('#w_card .cardFaceObject');
  // a writable object clips what does not fit into its 20px and scrolls it, which nobody could do once the
  // card is locked - so a locked object overflows the object like every other text object on a card
  const overflowing = ClientFunction(()=>{
    const object = document.querySelector('#w_card .cardFaceObject');
    return object.scrollHeight > object.clientHeight && getComputedStyle(object).overflow == 'visible';
  });
  // the object keeps the look its own backgroundColor/borderColor give it, so locking a card does not
  // suddenly change what it looks like on the table
  const boxStyle = ClientFunction(()=>{
    const style = getComputedStyle(document.querySelector('#w_card .cardFaceObject'));
    return [ style.backgroundColor, style.borderTopColor ];
  });
  await t
    .expect(Selector('#w_card [contenteditable]').exists).notOk()
    .expect(text.textContent).eql('locked text that is much longer than the area reserved for it')
    .expect(await overflowing()).ok()
    .expect(await boxStyle()).eql([ 'rgb(255, 255, 0)', 'rgb(255, 0, 0)' ])
    .click(text);
  // and it is part of the card again, so clicking it flips the card
  await expectEventually(t, ()=>cardProperty('activeFace'), 1);
});

test('Locking a write object while it is on the table turns it into a plain text object', async t => {
  await setRoomState(lockableCardRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  const text = Selector('#w_card .cardFaceObject.write');
  await t
    .expect(text.getAttribute('contenteditable')).eql('plaintext-only')
    .expect(text.textContent).eql('written text')
    .expect(text.getAttribute('spellcheck')).eql('false') // off unless asked for
    .click('#w_lock')
    .expect(Selector('#w_card [contenteditable]').exists).notOk()
    .expect(text.textContent).eql('written text');
});

test('The css of a write object lays its text out the same way on the table and in the deck editor', async t => {
  await setRoomState(styledCardRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  // a write object is a div like every other face object, not a form control laying its own text out, so
  // the css a game author writes for it does the same thing wherever the object is rendered
  const layout = ClientFunction(selector=>{
    const object = document.querySelector(selector);
    const box = object.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(object);
    const text = range.getBoundingClientRect();
    return [
      getComputedStyle(object).display,
      box.right - text.right < 4 * box.width / 180,                            // pushed to the right edge
      Math.abs(box.top + box.bottom - text.top - text.bottom) < 4 * box.width / 180 // and vertically centered
    ];
  });

  await t.expect(await layout('#w_card .cardFaceObject.write')).eql([ 'flex', true, true ]);

  await t
    .click('#editButton')
    .click('#editorSidebar [icon=tune]')
    .click('#w_deck')
    .click('.deckEditorStripCard')
    .click(Selector('#deckEditorTree .deckEditorTreeFace').nth(0));
  await t.expect(await layout('#deckEditorMain .cardFace.active .cardFaceObject')).eql([ 'flex', true, true ]);
});

test('The deck editor shows a write object as its placeholder and its list row edits that placeholder', async t => {
  await setRoomState(editableCardRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorSidebar [icon=tune]')
    .click('#w_deck')                                            // selecting the deck opens the deck editor
    .click('.deckEditorStripCard')                               // select the card type so the card is rendered
    .click(Selector('#deckEditorTree .deckEditorTreeFace').nth(0)); // the face carrying the writable object

  // the editor's card is a readonly copy (nothing typed there could be stored), so the writable object can
  // not be written on - and while the card property is empty it shows the placeholder, or it would be blank
  const object = Selector('#deckEditorMain .cardFace.active .cardFaceObject').nth(1);
  // only the hint itself is dimmed: the object keeps the backgroundColor and borderColor it was given at
  // full strength, so what the deck editor shows is the color the game author picked
  const placeholderStyle = ClientFunction(()=>{
    const object = document.querySelectorAll('#deckEditorMain .cardFace.active .cardFaceObject')[1];
    return [ getComputedStyle(object).opacity, getComputedStyle(object, '::before').opacity, getComputedStyle(object).borderTopColor ];
  });
  await t
    .expect(Selector('#deckEditorMain [contenteditable]').exists).notOk()
    .expect(object.getAttribute('data-placeholder')).eql('write here')
    .expect(object.hasClass('cardFacePlaceholder')).ok()
    .expect(await placeholderStyle()).eql([ '1', '0.45', 'rgb(0, 0, 0)' ]);

  // what a player types is per card, so there is nothing for the creator to fill in: the object's list row
  // edits its placeholder instead of the card type property the value is bound to
  const listRow = Selector('#deckEditorTree .deckEditorObjectRow .deckEditorPreviewText').nth(1);
  await t
    .expect(listRow.value).eql('write here')
    .click(listRow) // selects the object, which re-renders the tree - type into the row it is rebuilt as
    .typeText(listRow, 'your plan', { replace: true });
  await expectEventually(t, ClientFunction(()=>widgets.get('deck').get('faceTemplates')[0].objects[1].placeholder), 'your plan');
  await t
    .expect(await ClientFunction(()=>widgets.get('deck').get('cardTypes').note.note)()).eql('')
    .expect(object.getAttribute('data-placeholder')).eql('your plan');

  // a write object always stores its text on the card, so it is only offered as a per-card-type object
  await t
    .click('#deckEditorTreeAdd')
    .expect(Selector('#deckEditorAddWritable').visible).notOk()
    .click('#deckEditorAddMode input[value=dynamic]')
    .expect(Selector('#deckEditorAddWritable').visible).ok()
    .expect(Selector('#deckEditorAddWritable').textContent).eql('Label')
    .click('#deckEditorAddWritable');
  // the button adds an object of the "write" type, bound to a card type property of its own
  await expectEventually(t, ClientFunction(()=>{
    const object = widgets.get('deck').get('faceTemplates')[0].objects[2] || {};
    return [ object.type, object.editable, (object.dynamicProperties || {}).value ];
  }), [ 'write', true, 'note2' ]);

  // "editable" is one of the object's rows, as the checkbox that turns writing off again - and it is offered
  // for a dynamic link even on the object above, which does not carry the property
  const editableRow = Selector('.deckEditorObjectProperties .deckEditorTypedInput').withText('editable').find('input');
  await t
    .expect(editableRow.checked).ok()
    .click(editableRow);
  await expectEventually(t, ClientFunction(()=>widgets.get('deck').get('faceTemplates')[0].objects[2].editable), false);
  // with it off the object is not written on any more, while the other write object still is
  await t
    .expect(Selector('#w_card [contenteditable]').count).eql(1)
    .click(Selector('#deckEditorTree .deckEditorObjectRow').nth(1))
    .expect(Selector('#deckEditorObjPropList option').withAttribute('value', 'editable').exists).ok();
});

test('A write object bound to a property of the card widget itself is not editable', async t => {
  await setRoomState(reservedBindingCardRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  // typing into them would set the card's type, which would replace it with a different widget, or push a
  // computed read-only property into the room state
  await t
    .expect(Selector('#w_card [contenteditable]').exists).notOk()
    .click('#w_card');
  await expectEventually(t, ()=>cardProperty('type'), 'card');
  await expectEventually(t, ()=>cardProperty('_ancestor'), undefined);
});
