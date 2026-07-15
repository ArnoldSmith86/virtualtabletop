import { ClientFunction, Selector } from 'testcafe';

import { compareState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

test('Smart clone lifecycle', async t => {
  await setRoomState({
    base: { id: 'base', type: 'basic', owner: 'A' },
    scoreboard: { id: 'scoreboard', type: 'scoreboard', scoreProperty: 'points' },
    source: { id: 'source', type: 'basic', width: 140 },
    sourceDice: { id: 'sourceDice', type: 'dice', parent: 'source', activeFace: 1, rollCount: 2 },
    sourceSeat: { id: 'sourceSeat', type: 'seat', parent: 'source', index: 1, points: 10 },
    sourceChild: { id: 'sourceChild', type: 'basic', parent: 'source', text: 'literal[' },
    clone: {
      id: 'clone',
      type: 'basic',
      x: 200,
      editorSmartClone: { replaces: { 'literal[': 'value$&' } },
      inheritFrom: {
        source: [ '!x', '!y', '!rotation', '!parent', '!dragging', '!hoverParent', '!owner', '!hoverTarget' ],
        base: [ 'owner' ]
      }
    },
    cloneDice: {
      id: 'cloneDice',
      type: 'dice',
      parent: 'clone',
      activeFace: 5,
      rollCount: 7,
      inheritFrom: { sourceDice: [ '!parent', '!x', '!y', '!dragging', '!hoverParent', '!owner', '!hoverTarget', '!activeFace', '!rollCount' ] }
    },
    cloneSeat: {
      id: 'cloneSeat',
      type: 'seat',
      parent: 'clone',
      index: 2,
      points: 4,
      inheritFrom: { sourceSeat: [ '!parent', '!x', '!y', '!dragging', '!hoverParent', '!owner', '!hoverTarget', '!points', '!player', '!color', '!turn', '!index' ] }
    },
    cloneChild: { id: 'cloneChild', type: 'basic', parent: 'clone', inheritFrom: 'sourceChild' }
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#editButton');

  await ClientFunction(async () => {
    batchStart();
    await widgets.get('sourceDice').set('activeFace', 3);
    await widgets.get('sourceDice').set('rollCount', 4);
    await widgets.get('sourceSeat').set('points', 12);
    batchEnd();
  })();
  await t.wait(100);

  const independentState = await ClientFunction(() => ({
    activeFace: widgets.get('cloneDice').get('activeFace'),
    rollCount: widgets.get('cloneDice').get('rollCount'),
    points: widgets.get('cloneSeat').get('points'),
    replacedText: widgets.get('cloneChild').get('text')
  }))();
  await t.expect(independentState).eql({ activeFace: 5, rollCount: 7, points: 4, replacedText: 'value$&' });

  await ClientFunction(async () => widgets.get('sourceChild').set('parent', null))();
  await t.wait(100);
  await t.expect(ClientFunction(() => widgets.has('cloneChild'))()).notOk();

  await t
    .click('#editorSidebar [icon=tune]')
    .rightClick('#w_clone')
    .click('[icon=link_off]')
    .wait(100);

  await ClientFunction(async () => {
    batchStart();
    await widgets.get('source').set('width', 180);
    await widgets.get('base').set('owner', 'B');
    batchEnd();
  })();
  await t.wait(100);

  const unlinkedState = await ClientFunction(() => ({
    width: widgets.get('clone').get('width'),
    owner: widgets.get('clone').get('owner'),
    inheritFrom: widgets.get('clone').get('inheritFrom'),
    hasEditorSmartClone: Object.prototype.hasOwnProperty.call(widgets.get('clone').state, 'editorSmartClone')
  }))();
  await t.expect(unlinkedState).eql({
    width: 140,
    owner: 'B',
    inheritFrom: { base: [ 'owner' ] },
    hasEditorSmartClone: false
  });
});

test('Create game using edit mode', async t => {
  console.log("USERAGENT: " + t.browser.userAgent);
  await t.resizeWindow(1280, 800);
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-spinner0')
    .typeText('#INPUT_\\;values', '8', { replace: true })
    .click('#buttonInputGo')
    .rightClick('#w_2ng4')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-holder')
    .click('#editorToolbar > div > [icon=add]')
    .click('#addHand')
    .drag('#w_hand', 100, -100) // this shouldn't change anything because it's not movable
    .rightClick('#w_hand')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-deck_K_S')
    .pressKey('esc')
    .click('#w_9ee9B')
    .click('#w_9ee9P > .handle')
    .click('#pileOverlay .modal > div:nth-of-type(6) > button')
    .click('#w_b86p > .handle')
    .click('#pileOverlay .modal > div:nth-of-type(3) > button')
    .click('#w_b86p > .handle')
    .click('#pileOverlay .modal > div:nth-of-type(6) > button')
    .click('#w_5ip4 > .handle')
    .click('#pileOverlay .modal > div:nth-of-type(4) > button')
    .dragToElement('#w_5ip4 > .handle', '#w_hand')
    .pressKey('esc')
    .pressKey('esc')
    .click('#editButton')
    .click('#editorSidebar [icon=data_object]')
    .click('#w_2ng4')
    .click('#je_duplicateWidget')
    .typeText('#je_duplicateWidget_X\\ offset', '100')
    .click('#jeCommandOptions button:nth-of-type(1)')
    .click('#w_2ng4')
    .setNativeDialogHandler(() => true)
    .pressKey('d')
    .pressKey('esc')
    .pressKey('esc')
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-2D-chips')
    .pressKey('esc')
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#EmptyPoker3DSVG')
    .rightClick('#w_es5bB')
    .pressKey('esc')
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#addSeat')
    .rightClick('#w_cgp8')
    .pressKey('esc')
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#addSeatCounter')
    .rightClick('#w_m06r')
    .pressKey('esc')
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#addScoreboard')
    .rightClick('#w_qz2l')
    .pressKey('esc')
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-dice2D0')
    .typeText('#INPUT_\\;sides', '8', { replace: true })
    .click('#buttonInputGo')
    .rightClick('#w_8sfj')
    .pressKey('esc')
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-dice3D0')
    .typeText('#INPUT_\\;sides', '12', { replace: true })
    .click('#buttonInputGo')
    .rightClick('#w_bldn')
    .click('#w_bldn');
  await compareState(t, 'a8da89943cf6f6fbc9b77ddaab41dc06');
});
