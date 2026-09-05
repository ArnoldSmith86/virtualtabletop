import { ClientFunction, Selector } from 'testcafe';

import { compareState, expectEventually, getStateObject, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

const popup = Selector('#contextMenuPopup');
const rotationButton = icon => popup.find(`.contextMenuRotationRow [icon=${icon}]`);
const entry = text => popup.find('.contextMenuActionLabel').withText(text);
const widgetProperty = (id, property) => getStateObject().then(state => state[id] && state[id][property]);

// a widget that starts between two of its allowed rotations and carries a menu with a submenu,
// a button whose CONTEXTMENU has no collection and therefore opens the popup on the button itself,
// a widget whose rotation deletes it, and a button that hands the first widget to another player
function contextMenuRoom() {
  return {
    hero: {
      id: 'hero', type: 'basic', x: 300, y: 200, width: 100, height: 100, rotation: 120, rotationSteps: [ 0, 90, 180, 270 ],
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
    },
    doomed: {
      id: 'doomed', type: 'basic', x: 500, y: 200, width: 100, height: 100, rotationSteps: 90,
      rotationChangeRoutine: [ { func: 'DELETE', collection: 'thisButton' } ]
    },
    thief: {
      id: 'thief', type: 'button', text: 'steal', x: 700, y: 400,
      clickRoutine: [
        { func: 'DELAY', milliseconds: 1500 },
        { func: 'SELECT', property: 'id', value: 'hero' },
        { func: 'SET', property: 'owner', value: 'somebody else' }
      ]
    }
  };
}

test('The right-click popup rotates a widget in steps and runs the routines of its menu', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState(contextMenuRoom());
  await ClientFunction(prepareClient)();
  await setName(t);

  // rotation steps: from 120 the next allowed angle to the left is 90, then two clicks to the right
  // turn the widget to 270, and the popup stays open because it has buttons
  await t
    .rightClick('#w_hero')
    .expect(popup.visible).ok()
    .click(rotationButton('rotate_left'));
  await expectEventually(t, _=>widgetProperty('hero', 'rotation'), 90, 'the rotation step to the left of 120');
  await t
    .click(rotationButton('rotate_right'))
    .click(rotationButton('rotate_right'))
    .expect(popup.visible).ok();
  await expectEventually(t, _=>widgetProperty('hero', 'rotation'), 270, 'two rotation steps');

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

  // a rotation whose change routine deletes the widget takes the popup with it and leaves no error behind
  await t
    .rightClick('#w_doomed')
    .expect(popup.visible).ok()
    .click(rotationButton('rotate_right'))
    .expect(popup.visible).notOk()
    .expect(Selector('#w_doomed').exists).notOk()
    .expect(Selector('#clientErrorOverlay').visible).notOk();

  // the popup closes when its widget is handed to another player while it is open
  await t
    .click('#w_thief')
    .rightClick('#w_hero')
    .expect(popup.visible).ok()
    .expect(popup.visible).notOk({ timeout: 5000 });
  await expectEventually(t, _=>widgetProperty('hero', 'owner'), 'somebody else', 'the steal button');

  await compareState(t, 'd6067220353bdbe22c4cb8e1de217e84');
});
