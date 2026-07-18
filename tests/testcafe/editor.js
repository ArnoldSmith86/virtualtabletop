import { ClientFunction, Selector } from 'testcafe';

import { compareState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

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

test('Deck editor: add card type, dynamic object, delete face, undo', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-empty-deck')
    .click('#editorSidebar [icon=tune]');

  const getDeckID = ClientFunction(() => {
    let deckID = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deckID = w.get('id'); });
    return deckID;
  });
  const deckID = await getDeckID();

  await t
    .click(`#w_${deckID}`)
    .click('#editor [icon=edit]')
    .click('.deckEditorAddCardType button')
    .click('#deckEditorAddFace')
    .click('#deckEditorAddTextDynamic')
    .pressKey('delete') // deletes the selected face object; also exercises the Delete-key path once nothing is focused
    .click('#deckEditorAddFace')
    .setNativeDialogHandler(() => true)
    .click('#deckEditorDeleteFace')
    .pressKey('esc') // closes the deck editor, since no face object is selected at this point
    .click('#editorToolbar [icon=undo]'); // undoes the face deletion through the normal room undo protocol
  await compareState(t, '8924f45d4e6a80729054e7a7c23f7599');
});

test('Deck editor: breadcrumb undo and redo', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-empty-deck')
    .click('#editorSidebar [icon=tune]');

  const getDeckID = ClientFunction(() => {
    let deckID = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deckID = w.get('id'); });
    return deckID;
  });
  const deckID = await getDeckID();

  const editTextAndUndoImmediately = ClientFunction(() => {
    const rows = document.querySelectorAll('#deckEditorSidebar > .deckEditorProperties:first-of-type .genericInput');
    let input = null;
    for(let i=0; i<rows.length; ++i)
      if(rows[i].querySelector('label').textContent == 'value')
        input = rows[i].querySelector('input');
    input.value = 'Changed before debounce';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#deckEditorUndo').click();
  });
  const getHistoryLength = ClientFunction(() => document.querySelectorAll('#deckEditorBreadcrumb .deckEditorCrumb').length);
  const getFirstObjectValue = ClientFunction(deckID => {
    for(const face of widgets.get(deckID).get('faceTemplates'))
      for(const object of face.objects || [])
        if(object.type == 'text')
          return object.value;
    return null;
  });

  await t
    .click(`#w_${deckID}`)
    .click('#editor [icon=edit]')
    .click('.deckEditorAddCardType button')  // step 1
    .click('#deckEditorAddFace')             // step 2
    .click('#deckEditorAddText');             // step 3
  await t.expect(getHistoryLength()).eql(4);
  await editTextAndUndoImmediately();         // flushes and undoes pending step 4, before its 500ms timer fires
  await t
    .expect(getFirstObjectValue(deckID)).eql('Text')
    .click('#deckEditorUndo')                 // undo step 3 (the added object)
    .click('#deckEditorRedo')                 // restore and then remove it again to exercise redo without changing the old final state
    .click('#deckEditorUndo')
    .pressKey('esc');
  await compareState(t, '0fe0eb8554cd82ec74d0c2c99513dffa');
});

test('Deck editor: remote update preserves an unrelated pending edit', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-empty-deck')
    .click('#editorSidebar [icon=tune]');

  const getDeckID = ClientFunction(() => {
    let deckID = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deckID = w.get('id'); });
    return deckID;
  });
  const deckID = await getDeckID();
  const editAndReceiveRemoteChange = ClientFunction(deckID => {
    const rows = document.querySelectorAll('#deckEditorSidebar > .deckEditorProperties:first-of-type .genericInput');
    let input = null;
    for(let i=0; i<rows.length; ++i)
      if(rows[i].querySelector('label').textContent == 'value')
        input = rows[i].querySelector('input');
    input.value = 'Pending local edit';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const cardTypes = JSON.parse(JSON.stringify(widgets.get(deckID).get('cardTypes')));
    cardTypes['type 1'].receivedProperty = 'Remote value';
    sendRawDelta({ s: { [deckID]: { cardTypes }}, c: 'Another player updated card types' });
  });
  const getEditedValues = ClientFunction(deckID => {
    const deck = widgets.get(deckID);
    let text = null;
    for(const face of deck.get('faceTemplates'))
      for(const object of face.objects || [])
        if(object.type == 'text')
          text = object.value;
    return { text, receivedProperty: deck.get('cardTypes')['type 1'].receivedProperty };
  });

  await t
    .click(`#w_${deckID}`)
    .click('#editor [icon=edit]')
    .click('.deckEditorAddCardType button')
    .click('#deckEditorAddFace')
    .click('#deckEditorAddText');
  await editAndReceiveRemoteChange(deckID);
  await t
    .expect(getEditedValues(deckID)).eql({ text: 'Pending local edit', receivedProperty: 'Remote value' })
    .pressKey('esc');
  await compareState(t, 'a2c9165768e325ccd6c8452f2194d314');
});

// Two different fields edited within one debounce window, then a structural action right after, must stay
// three separate undo steps: undoing the added face must not revert the typed edits, and undoing once more
// must revert only the second field.
test('Deck editor: rapid cross-field edits stay separate undo steps', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-empty-deck')
    .click('#editorSidebar [icon=tune]');

  const getDeckID = ClientFunction(() => {
    let deckID = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deckID = w.get('id'); });
    return deckID;
  });
  const deckID = await getDeckID();

  const rapidEditsThenAddFace = ClientFunction(() => new Promise(resolve => {
    const setField = (label, value) => {
      const rows = document.querySelectorAll('#deckEditorSidebar > .deckEditorProperties:first-of-type .genericInput');
      for(const row of rows) {
        if(row.querySelector('label').textContent == label) {
          const input = row.querySelector('input');
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
      }
    };
    setField('value', 'RapidValue');
    setTimeout(() => { // second field well within the first field's 500ms debounce window
      setField('fontSize', '55');
      setTimeout(() => { // structural action while the second field's commit is still pending
        document.querySelector('#deckEditorAddFace').click();
        setTimeout(resolve, 200);
      }, 50);
    }, 50);
  }));
  const getTextObject = ClientFunction(deckID => {
    for(const face of widgets.get(deckID).get('faceTemplates'))
      for(const object of face.objects || [])
        if(object.type == 'text')
          return { value: object.value, fontSize: object.fontSize };
    return null;
  });
  const getFaceCount = ClientFunction(deckID => widgets.get(deckID).get('faceTemplates').length);

  await t
    .click(`#w_${deckID}`)
    .click('#editor [icon=edit]')
    .click('.deckEditorAddCardType button')
    .click('#deckEditorAddText');
  await rapidEditsThenAddFace();
  await t
    .expect(getFaceCount(deckID)).eql(3)
    .click('#deckEditorUndo') // reverts only the added face
    .expect(getFaceCount(deckID)).eql(2)
    .expect(getTextObject(deckID)).eql({ value: 'RapidValue', fontSize: 55 })
    .click('#deckEditorUndo') // reverts only the fontSize edit
    .expect(getTextObject(deckID)).eql({ value: 'RapidValue', fontSize: 20 })
    .pressKey('esc');
  await compareState(t, '6e41185d918e1b8dfe69610ff6f74e77');
});

// Regression test for the crash reported on switching games while a deck was being edited (the previously
// selected deck/card no longer exists when the new state arrives). TestCafe fails the test on any uncaught
// client error, so simply performing the switch guards against the crash coming back.
test('Deck editor: switching games while editing does not crash', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-empty-deck')
    .click('#editorSidebar [icon=tune]');

  const getDeckID = ClientFunction(() => {
    let deckID = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deckID = w.get('id'); });
    return deckID;
  });
  const deckID = await getDeckID();

  await t
    .click(`#w_${deckID}`)
    .click('#editor [icon=edit]')
    .click('.deckEditorAddCardType button'); // make a change, leaving the deck editor open

  // Simulate switching to another game: replace the whole room state. The deck being edited disappears.
  await setRoomState({ switchedLabel: { id: 'switchedLabel', type: 'label', x: 100, y: 100, text: 'Another game' } });

  // The deck editor must have closed and the client must still be alive and interactive.
  await t.expect(Selector('body').hasClass('deckEditorActive')).notOk();
  await compareState(t, 'fa933ba639405309b6cf6aef448bfeb4');
});

// Covers creating a deck from the Properties tab radio option and the newer sidebar features: deleting all
// faces and adding a color box to a faceless deck (auto-creates the face), one-click per-card-type
// conversion, face border/radius editing, per-row property deletion and cardDefaults editing with undo.
// Also guards against Escape leaking to the room editor behind the deck editor (it used to toggle the
// sidebar tab and could exit edit mode entirely).
test('Deck editor: create deck from scratch with color box, face and defaults', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  // All sidebar sections share the same row markup; find a row by its section header and label text.
  const findRow = (header, label) => {
    const headers = document.querySelectorAll('#deckEditorSidebar header');
    for(let i = 0; i < headers.length; ++i) {
      if(headers[i].querySelector('h2').textContent != header)
        continue;
      const rows = headers[i].nextElementSibling.querySelectorAll('.genericInput');
      for(let j = 0; j < rows.length; ++j)
        if(rows[j].querySelector('label').textContent == label)
          return rows[j];
    }
    return null;
  };
  const setField = ClientFunction((header, label, value) => {
    const row = findRow(header, label);
    if(!row)
      return false;
    const select = row.querySelector('select');
    select.value = 'number';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const input = row.querySelector('input');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, { dependencies: { findRow } });
  const clickRowButton = ClientFunction((header, label, buttonSelector) => {
    const row = findRow(header, label);
    const button = row && row.querySelector(buttonSelector);
    if(!button)
      return false;
    button.click();
    return true;
  }, { dependencies: { findRow } });
  const clickStripButton = ClientFunction(labelPart => {
    const tiles = document.querySelectorAll('#deckEditorStrip .deckEditorAddCardType');
    for(let i = 0; i < tiles.length; ++i) {
      if(tiles[i].textContent.indexOf(labelPart) != -1) {
        tiles[i].querySelector('button').click();
        return true;
      }
    }
    return false;
  });

  await t
    .click('#editButton')
    .click('#editorSidebar [icon=tune]')
    .click('label[for=deckType2]')
    .click('#editor .buttonBar button[icon=style]') // creates the new deck and opens the deck editor
    .setNativeDialogHandler(() => true)
    .click('#deckEditorDeleteFace')                 // delete both faces to get a faceless deck
    .click('#deckEditorDeleteFace')
    .click('#deckEditorAddColor');                  // no faces left: auto-creates the first face
  await t.expect(setField('Card defaults', 'width', 120)).ok();
  await t.wait(700); // let the debounced cardDefaults commit fire
  // one-click conversion of the color box's color into a per-card-type property
  await t.expect(clickRowButton('Face object 1 (image)', 'color', '.deckEditorMakeDynamic')).ok();
  await t.pressKey('esc'); // deselect the object
  await t.expect(setField('Face 0', 'radius', 8)).ok();
  await t.wait(700); // let the debounced faceTemplates commit fire
  await t.expect(clickRowButton('Card defaults', 'width', '.deckEditorDeleteProperty')).ok();
  await t.click('#deckEditorUndo'); // restores the deleted width
  await t.expect(clickStripButton('Copy card type')).ok(); // copies "type 1" including its color property
  await t.pressKey('esc');          // closes the deck editor - and only the deck editor
  await t.expect(Selector('body').hasClass('deckEditorActive')).notOk();
  await t.expect(Selector('body').hasClass('edit')).ok(); // Escape must not have left edit mode
  await compareState(t, '4fd7ce515016591869c345b5b0d52e78');
});
