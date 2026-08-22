import { ClientFunction, Selector } from 'testcafe';

import { prepareClient, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// the second category of the game list, between In-Progress Games and Public Library
const shelfGames = Selector('#statesList > div:nth-of-type(2) .list .roomState');
const variants = Selector('#stateDetailsOverlay .variantsList .variant');
const detailsOverlay = Selector('#stateDetailsOverlay');

// "Add game" -> "Save room state" adds the current room to the shelf as a game named Unnamed and
// opens its details in edit mode
async function addGameFromRoomState(t) {
  await t
    .pressKey('esc')
    .click('#statesButton')
    .click('#addState')
    .click('#stateAddOverlay button[icon=save]')
    .expect(shelfGames.count).eql(1)
    .expect(variants.count).eql(1);
}

// the buttons of a variant only appear once that variant is opened for editing
async function deleteVariant(t, index) {
  await t
    .click(variants.nth(index).find('button[icon=edit]'))
    .click(variants.nth(index).find('button[icon=delete]'));
}

async function editDetails(t) {
  await t
    .click('#stateDetailsOverlay .buttons [icon=menu]')
    .click('#stateDetailsOverlay .buttons [icon=edit]');
}

async function saveDetails(t) {
  await t.click('#stateDetailsOverlay > .buttons button[icon=save]');
}

// saving a game whose last variant was deleted removes the game, which asks first
async function confirmSave(t) {
  await t.click('#confirmOverlay [data-field=confirmButton]');
}

test('Deleting the last variant of a game removes the game from the shelf', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();

  await addGameFromRoomState(t);
  await deleteVariant(t, 0);
  await t.expect(variants.count).eql(0);

  // keeping the game at the confirmation returns to its details and changes nothing
  await saveDetails(t);
  await t
    .click('#confirmOverlay [data-field=cancelButton]')
    .expect(detailsOverlay.visible).ok()
    .expect(shelfGames.count).eql(1);

  await saveDetails(t);
  await confirmSave(t);

  // the game is gone, so its details close instead of being refilled from a tile that the game
  // list no longer has
  await t
    .expect(shelfGames.count).eql(0)
    .expect(detailsOverlay.visible).notOk();
});

test('Deleting one of several variants keeps the game', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();

  await addGameFromRoomState(t);
  await t
    .click('#variantsList > button[icon=add]')
    .click('#variantAddOverlay button[icon=save]')
    .expect(variants.count).eql(2);
  await saveDetails(t);
  await t.expect(variants.count).eql(2);

  await editDetails(t);
  await deleteVariant(t, 0);
  await saveDetails(t);
  await t
    .expect(shelfGames.count).eql(1)
    .expect(variants.count).eql(1);

  // leave the shared room without a game in its shelf
  await t
    .click('#stateDetailsOverlay .buttons [icon=menu]')
    .click('#stateDetailsOverlay .buttons [icon=delete]')
    .click('#confirmOverlay [data-field=confirmButton]')
    .expect(shelfGames.count).eql(0);
});
