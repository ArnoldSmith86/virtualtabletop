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
          { type: 'text', editable: true, placeholder: 'write here', x: 10, y: 40, width: 180, height: 90, fontSize: 14, dynamicProperties: { value: 'note' } }
        ] },
        { objects: [ { type: 'text', x: 0, y: 60, width: 200, fontSize: 18, textAlign: 'center', value: 'back' } ] }
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
    .typeText(text, 'hello card');
  await expectEventually(t, ()=>cardProperty('note'), 'hello card');

  // the text comes back from the room state after a reload - it is a card property, not just DOM
  await ClientFunction(()=>location.reload())();
  await t.expect(Selector('#w_card textarea').value).eql('hello card');

  // clicking the card next to its text area still flips it
  await t.click('#w_card', { offsetX: 100, offsetY: 15 });
  await expectEventually(t, ()=>cardProperty('activeFace'), 1);
});
