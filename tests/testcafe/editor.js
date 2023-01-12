import { ClientFunction, Selector } from 'testcafe';

import { compareState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

test('Create game using edit mode', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#addButton')
    .click('#add-spinner0')
    .typeText('#INPUT_\\;values', '8')
    .click('#buttonInputGo')
    .click('#w_2ng4')
    .click('#addButton')
    .click('#add-holder')
    .click('#addButton')
    .click('#addHand')
    .drag('#w_hand', 100, -100) // this shouldn't change anything because it's not movable
    .click('#editButton')
    .click('#w_hand')
    .click('#transparentHolder')
    .click('#updateWidget')
    .click('#activeGameButton')
    .click('#addButton')
    .click('#add-deck_K_S')
    .click('#w_9ee9B')
    .click('#w_9ee9P > .handle')
    .click('#pileOverlay > button:nth-of-type(3)')
    .click('#w_5ip4 > .handle')
    .click('#pileOverlay > button:nth-of-type(1)')
    .click('#w_5ip4 > .handle')
    .click('#pileOverlay > button:nth-of-type(3)')
    .click('#w_oklb > .handle')
    .click('#pileOverlay > button:nth-of-type(2)')
    .dragToElement('#w_oklb > .handle', '#w_hand')
    .click('#editButton')
    .click('#w_2ng4')
    .click('#duplicateWidget')
    .click('#w_2ng5')
    .click('#manualEdit')
    .typeText('#editWidgetJSON', '{"type":"spinner","options":[1,2],"angle": 5,"id": "2ng5"}', { replace: true })
    .click('#editJSONoverlay #updateWidget')
    .click('#w_2ng4')
    .setNativeDialogHandler(() => true)
    .click('#removeWidget')
    .click('#activeGameButton')
    .click('#addButton')
    .click('#add-2D-chips')
    .click('#addButton')
    .click('#EmptyPoker3DSVG')
    .click('#w_3fseC1')
    .click('#addButton')
    .click('#addSeat')
    .click('#addButton')
    .click('#addSeatCounter')
    .click('#addButton')
    .click('#addScoreboard')
    .click('#w_9972');
  await compareState(t, 'e02bf9c6e248299f20d145c58b047990');
});
