import { ClientFunction, Selector } from 'testcafe';

import { compareState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

test('Cursor CSS is applied', async t => {
  console.log("USERAGENT: " + t.browser.userAgent);
  await t.resizeWindow(1280, 800);
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#editButton')
    .click('#editorSidebar [icon=settings]')
    .click('#cursorVisibility')
    .click('#cursorVisibility > option[value="solid-no-name"]');

  const style = await Selector('#gameSettingsCss').textContent;
  console.log(style);
  await t.expect(style).contains('--cursorActiveOpacity: 1');
});