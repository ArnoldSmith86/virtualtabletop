import { ClientFunction, Selector } from 'testcafe';

import { getState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// a deck whose card face has an editable text object: what players type into it is stored in the
// card property the object's value is bound to ("note"), the second object is a plain text object
function editableCardRoom() {
  return {
    deck: {
      id: 'deck', type: 'deck', x: 20, y: 20,
      cardDefaults: { width: 200, height: 140 },
      cardTypes: { note: { title: 'Mission', note: '' } },
      faceTemplates: [
        { objects: [
          { type: 'text', x: 0, y: 5, width: 200, fontSize: 18, textAlign: 'center', dynamicProperties: { value: 'title' } },
          { type: 'text', editable: true, placeholder: 'write here', spellCheck: true, x: 10, y: 40, width: 180, height: 90, fontSize: 14, dynamicProperties: { value: 'note' } }
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
          { type: 'text', x: 10, y: 10, width: 180, height: 20, fontSize: 14, dynamicProperties: { value: 'note', editable: 'unlocked' } }
        ] },
        { objects: [ { type: 'text', x: 0, y: 60, width: 200, fontSize: 18, textAlign: 'center', value: 'back' } ] }
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

// objects that ask to be editable but are bound to properties the engine owns: writing to 'type' would
// replace the card with a different widget and '_ancestor' is computed by the engine and refused to routines
// as well, so both have to render as plain text objects instead
function reservedBindingCardRoom() {
  return {
    deck: {
      id: 'deck', type: 'deck', x: 20, y: 20,
      cardDefaults: { width: 200, height: 140 },
      cardTypes: { note: {} },
      faceTemplates: [
        { objects: [
          { type: 'text', editable: true, x: 10, y: 10, width: 180, height: 40, fontSize: 14, dynamicProperties: { value: 'type' } },
          { type: 'text', editable: true, x: 10, y: 60, width: 180, height: 40, fontSize: 14, dynamicProperties: { value: '_ancestor' } }
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

test('An editable card text stores what is typed on the card and survives a reload', async t => {
  await setRoomState(editableCardRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  const text = Selector('#w_card textarea');
  await t
    .expect(text.getAttribute('placeholder')).eql('write here')
    .expect(text.getAttribute('spellcheck')).eql('true') // opt-in per object, like a label's spellCheck
    .typeText(text, 'hello card');
  await expectEventually(t, ()=>cardProperty('note'), 'hello card');

  // the text comes back from the room state after a reload - it is a card property, not just DOM
  await ClientFunction(()=>location.reload())();
  await t.expect(Selector('#w_card textarea').value).eql('hello card');

  // clicking the card next to its text area still flips it
  await t.click('#w_card', { offsetX: 100, offsetY: 15 });
  await expectEventually(t, ()=>cardProperty('activeFace'), 1);
});

test('A locked card text is shown as a plain text object that overflows instead of being clipped', async t => {
  await setRoomState(lockedCardRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  const text = Selector('#w_card .cardFaceObject');
  // a text area would clip what does not fit into its 20px and could only be scrolled by typing in it, so a
  // locked object is rendered as a div - it overflows the object like every other text object on a card
  const overflowing = ClientFunction(()=>{
    const object = document.querySelector('#w_card .cardFaceObject');
    return object.scrollHeight > object.clientHeight && getComputedStyle(object).overflow == 'visible';
  });
  await t
    .expect(Selector('#w_card textarea').exists).notOk()
    .expect(text.textContent).eql('locked text that is much longer than the area reserved for it')
    .expect(await overflowing()).ok()
    .click(text);
  // and it is part of the card again, so clicking it flips the card
  await expectEventually(t, ()=>cardProperty('activeFace'), 1);
});

test('Locking a card text while it is on the table turns it into a plain text object', async t => {
  await setRoomState(lockableCardRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .expect(Selector('#w_card textarea').value).eql('written text')
    .expect(Selector('#w_card textarea').getAttribute('spellcheck')).eql('false') // off unless asked for
    .click('#w_lock')
    .expect(Selector('#w_card textarea').exists).notOk()
    .expect(Selector('#w_card .cardFaceObject').textContent).eql('written text');
});

test('The deck editor shows a writable object as its placeholder and its list row edits that placeholder', async t => {
  await setRoomState(editableCardRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorSidebar [icon=tune]')
    .click('#w_deck')                                            // selecting the deck opens the deck editor
    .click('.deckEditorStripCard')                               // select the card type so the card is rendered
    .click(Selector('#deckEditorTree .deckEditorTreeFace').nth(0)); // the face carrying the writable object

  // the editor's card is a readonly copy (nothing typed there could be stored), so the writable object is
  // plain text - and while the card property is empty that text is the placeholder, or it would be invisible
  const object = Selector('#deckEditorMain .cardFace.active .cardFaceObject').nth(1);
  await t
    .expect(Selector('#deckEditorMain textarea').exists).notOk()
    .expect(object.textContent).eql('write here')
    .expect(object.hasClass('cardFacePlaceholder')).ok();

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
    .expect(object.textContent).eql('your plan');

  // a writable object always stores its text on the card, so it is only offered as a per-card-type object
  await t
    .click('#deckEditorTreeAdd')
    .expect(Selector('#deckEditorAddWritable').visible).notOk()
    .click('#deckEditorAddMode input[value=dynamic]')
    .expect(Selector('#deckEditorAddWritable').visible).ok();
});

test('A card text bound to a property of the card widget itself is not editable', async t => {
  await setRoomState(reservedBindingCardRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  // typing into them would set the card's type, which would replace it with a different widget, or push a
  // computed read-only property into the room state
  await t
    .expect(Selector('#w_card textarea').exists).notOk()
    .click('#w_card');
  await expectEventually(t, ()=>cardProperty('type'), 'card');
  await expectEventually(t, ()=>cardProperty('_ancestor'), undefined);
});
