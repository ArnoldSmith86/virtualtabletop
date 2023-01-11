import { ClientFunction } from 'testcafe';

import { compareState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

test('Create game using edit mode', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#addButton')
    .click('#add-spinner6')
    .click('#w_jyo2')
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
    .click('#w_3nsjB')
    .click('#w_3nsjP > .handle')
    .click('#pileOverlay > button:nth-of-type(3)')
    .click('#w_b86p > .handle')
    .click('#pileOverlay > button:nth-of-type(1)')
    .click('#w_b86p > .handle')
    .click('#pileOverlay > button:nth-of-type(3)')
    .click('#w_5ip4 > .handle')
    .click('#pileOverlay > button:nth-of-type(2)')
    .dragToElement('#w_5ip4 > .handle', '#w_hand')
    .click('#editButton')
    .click('#w_jyo2')
    .click('#duplicateWidget')
    .click('#w_jyo3')
    .click('#manualEdit')
    .typeText('#editWidgetJSON', '{"type":"spinner","options":[1,2],"angle": 5,"id": "jyo3"}', { replace: true })
    .click('#editJSONoverlay #updateWidget')
    .click('#w_jyo2')
    .setNativeDialogHandler(() => true)
    .click('#removeWidget')
    .click('#activeGameButton')
    .click('#addButton')
    .click('#addSeat')
    .click('#addButton')
    .click('#addSeatCounter')
    .click('#addButton')
    .click('#addScoreboard')
    .click('#w_es5b');
  await compareState(t, 'ee8d76eb7d49ded77dc0d9abe88410e7');
});
