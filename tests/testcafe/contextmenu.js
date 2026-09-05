import { ClientFunction, Selector } from 'testcafe';

import { compareState, expectEventually, getStateObject, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

const popup = Selector('#contextMenuPopup');
const entry = text => popup.find('.contextMenuActionLabel').withText(text);
const widgetProperty = (id, property) => getStateObject().then(state => state[id][property]);

// a widget that rotates in quarter turns and carries a menu with a submenu, plus a button
// whose CONTEXTMENU has no collection and therefore opens the popup on the button itself
function contextMenuRoom() {
  return {
    hero: {
      id: 'hero', type: 'basic', x: 300, y: 200, width: 100, height: 100, rotationSteps: [ 0, 90, 180, 270 ],
      contextMenu: [
        { text: 'Mark', routine: 'markRoutine' },
        { text: 'More', menu: [ { text: 'Flag', routine: 'flagRoutine' } ] }
      ],
      markRoutine: [ { func: 'SET', collection: 'thisButton', property: 'marked', value: true } ],
      flagRoutine: [ { func: 'SET', collection: 'thisButton', property: 'flag', value: '${previewIndex}' } ]
    },
    opener: {
      id: 'opener', type: 'button', text: 'menu', x: 700, y: 200,
      clickRoutine: [ { func: 'CONTEXTMENU', contextMenu: [ { text: 'Self', routine: 'selfRoutine' } ] } ],
      selfRoutine: [ { func: 'SET', collection: 'thisButton', property: 'opened', value: true } ]
    }
  };
}

test('The right-click popup rotates a widget in steps and runs the routines of its menu', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState(contextMenuRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  // rotation steps: two clicks turn the widget from 0 to 180, and the popup stays open because it has buttons
  await t
    .rightClick('#w_hero')
    .expect(popup.visible).ok()
    .click(popup.find('.contextMenuRotationRow [icon=rotate_right]'))
    .click(popup.find('.contextMenuRotationRow [icon=rotate_right]'))
    .expect(popup.visible).ok();
  await expectEventually(t, _=>widgetProperty('hero', 'rotation'), 180, 'two rotation steps');

  // a menu entry runs its routine and closes the popup
  await t
    .click(entry('Mark'))
    .expect(popup.visible).notOk();
  await expectEventually(t, _=>widgetProperty('hero', 'marked'), true, 'the Mark entry');

  // a submenu replaces the entries, and its routine receives previewIndex
  await t
    .rightClick('#w_hero')
    .click(entry('More'))
    .expect(entry('Mark').exists).notOk()
    .click(entry('Flag'))
    .expect(popup.visible).notOk();
  await expectEventually(t, _=>widgetProperty('hero', 'flag'), 0, 'the Flag entry of the submenu');

  // CONTEXTMENU without a collection opens the popup on the widget running the routine
  await t
    .click('#w_opener')
    .expect(popup.visible).ok()
    .expect(Selector('#contextMenuPreview').getAttribute('data-id')).eql('opener')
    .click(entry('Self'))
    .expect(popup.visible).notOk();
  await expectEventually(t, _=>widgetProperty('opener', 'opened'), true, 'the Self entry');

  await compareState(t, 'c81a7fa121d952c0d4e3da5d34f29950');
});
