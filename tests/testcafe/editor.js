import { ClientFunction, Selector } from 'testcafe';

import { compareState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

test('Pan in edit mode while holding Space', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    widget: {
      id: 'widget',
      type: 'basic',
      x: 200,
      y: 200
    }
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#editButton');
  await t.expect(Selector('#editorSelection').exists).ok();

  const result = await ClientFunction(() => {
    const zoomSlider = document.querySelector('#zoomSlider');
    zoomSlider.value = 20;
    zoomSlider.dispatchEvent(new Event('input', { bubbles: true }));
    const widget = document.querySelector('#w_widget');
    const widgetLeft = widget.style.left;
    const panBeforeDrag = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanX'));
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Space', key: ' ' }));
    widget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 300, clientY: 300 }));
    document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 250, clientY: 260 }));
    const panAfterDrag = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanX'));
    window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'Space', key: ' ' }));
    widget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 250, clientY: 260 }));
    return {
      panDelta: panAfterDrag - panBeforeDrag,
      selectionActive: document.querySelector('#editorSelection').classList.contains('active'),
      widgetMoved: widget.style.left !== widgetLeft
    };
  })();

  await t.expect(result).eql({ panDelta: -50, selectionActive: false, widgetMoved: false });
});

test('Renaming a widget keeps its color controls clear and it movable', async t => {
  await setRoomState({
    old: { id: 'old', type: 'basic', x: 200, y: 200, movable: true, movableInEdit: true }
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await ClientFunction(() => {
    window.renamedWidgetErrors = [];
    window.addEventListener('error', event => window.renamedWidgetErrors.push(String(event.error || event.message)));
  })();
  await t
    .click('#editButton')
    .click('#editorSidebar [icon=tune]')
    .click('#w_old')
    .expect(Selector('.colorFlexRow label.iconOnly').count).eql(4)
    .expect(Selector('[aria-label="Widget id"]').exists).ok()
    .typeText('[aria-label="Widget id"]', 'new', { replace: true })
    .pressKey('enter')
    .expect(Selector('#w_new').exists).ok();

  const colorControlTitles = await ClientFunction(() =>
    Array.from(document.querySelectorAll('.colorFlexRow .colorInput')).map(input => ({
      label: input.querySelector('label').getAttribute('title'),
      swatch: input.querySelector('.propertyPreviewButton').getAttribute('title'),
      info: !!input.querySelector('.info-button')
    }))
  )();
  await t.expect(colorControlTitles).eql([
    { label: null, swatch: null, info: false },
    { label: null, swatch: null, info: false },
    { label: null, swatch: null, info: false },
    { label: null, swatch: null, info: false }
  ]);

  const result = await ClientFunction(() => {
    const widget = document.querySelector('#w_new');
    widget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2, buttons: 2, clientX: 250, clientY: 250 }));
    return new Promise(resolve => setTimeout(() => {
      document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, button: 2, buttons: 2, clientX: 290, clientY: 280 }));
      setTimeout(() => {
        widget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2, clientX: 290, clientY: 280 }));
        setTimeout(() => resolve({
          x: widgets.get('new') && widgets.get('new').get('x'),
          y: widgets.get('new') && widgets.get('new').get('y'),
          errors: window.renamedWidgetErrors
        }), 50);
      }, 50);
    }, 50));
  })();

  await t.expect(result.errors).eql([]);
  await t.expect(result.x).notEql(200);
  await t.expect(result.y).notEql(200);
});

test('Space does not interrupt an active edit-mode widget drag', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    widget: {
      id: 'widget',
      type: 'basic',
      x: 200,
      y: 200
    }
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#editButton');
  await t.expect(Selector('#editorSelection').exists).ok();

  const result = await ClientFunction(() => {
    const zoomSlider = document.querySelector('#zoomSlider');
    zoomSlider.value = 20;
    zoomSlider.dispatchEvent(new Event('input', { bubbles: true }));
    const widget = document.querySelector('#w_widget');
    const panBeforeDrag = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanX'));
    widget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2, buttons: 2, clientX: 300, clientY: 300 }));
    document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 2, clientX: 250, clientY: 260 }));
    return new Promise(resolve => setTimeout(() => {
      const wasDraggingBeforeSpace = widgets.get('widget').get('dragging') !== null;
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Space', key: ' ' }));
      const spacePanArmed = document.body.classList.contains('spacePanActive');
      document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2, clientX: 250, clientY: 260 }));
      window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'Space', key: ' ' }));
      setTimeout(() => {
        const panAfterDrag = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomPanX'));
        resolve({
          panDelta: panAfterDrag - panBeforeDrag,
          spacePanArmed,
          spacePanActive: document.body.classList.contains('spacePanActive'),
          wasDraggingBeforeSpace,
          widgetDragging: widgets.get('widget').get('dragging'),
          widgetMoved: widgets.get('widget').get('x') !== 200 || widgets.get('widget').get('y') !== 200
        });
      }, 100);
    }, 100));
  })();

  await t.expect(result).eql({ panDelta: 0, spacePanArmed: false, spacePanActive: false, wasDraggingBeforeSpace: true, widgetDragging: null, widgetMoved: true });
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
  const getCardTypes = ClientFunction(deckID => JSON.stringify(widgets.get(deckID).get('cardTypes')));

  const deckNode = Selector('#deckEditorTree .deckEditorTreeDeck');
  await t
    .click(`#w_${deckID}`) // selecting the deck opens the deck editor directly (no separate "edit" button)
    .click('#deckEditorStripAdd')                     // add a card type
    .click(deckNode)                                  // select the deck
    .click('#deckEditorTreeAdd')                      // deck "+" adds a new (empty) face, now selected
    .click('#deckEditorTreeAdd')                      // face "+" reveals the add-object controls
    .click('#deckEditorAddMode input[value=dynamic]') // add per-card-type objects (seeds a card type property)
    .click('#deckEditorAddText')                      // add the text object (auto-selected)
    .pressKey('delete'); // deletes the object; its seeded card type property is deliberately KEPT (see below)
  // Regression: deleting a face object's last visual binding must NOT auto-delete the card type property it
  // used, since routines / SELECT / CSS can reference it independently of face rendering.
  await t.expect(getCardTypes(deckID)).contains('"text":"Text"');
  await t
    .click(deckNode)                                  // select the deck again
    .click('#deckEditorTreeAdd')                      // deck "+" adds another new face (now selected)
    .setNativeDialogHandler(() => true)
    .click('#deckEditorTreeDelete')                   // delete the just-added (current) face
    .pressKey('esc') // closes the deck editor, since no face object is selected at this point
    .click('#editorToolbar [icon=undo]'); // undoes the face deletion through the normal room undo protocol
  await compareState(t, '3e20074150f78219095df84abeeb74dc');
});

test('Deck editor: symbol pickers and JSON fallback', async t => {
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
  const getObjectTypeCounts = ClientFunction(deckID => {
    const objects = widgets.get(deckID).get('faceTemplates').flatMap(face => face.objects || []);
    return {
      image: objects.filter(object => object.type == 'image').length,
      icon: objects.filter(object => object.type == 'icon').length
    };
  });
  const getJSONText = ClientFunction(() => document.querySelector('#jeText').textContent);

  await t
    .click('#topSurface', { offsetX: 10, offsetY: 10 })
    .click('#editorToolbar [icon=style]')
    .click(Selector('#deckEditorTree .deckEditorTreeFace').nth(0))
    .click('#deckEditorTreeAdd')
    .click('#deckEditorAddImage')
    .expect(Selector('#symbolPickerOverlay').visible).ok()
    .click(Selector('#symbolList .gameicons').nth(0))
    .expect(getObjectTypeCounts(deckID)).eql({ image: 3, icon: 0 })
    .click('#deckEditorAddIcon')
    .expect(Selector('#symbolPickerOverlay').visible).ok()
    .click(Selector('#symbolList .material-symbols').nth(0))
    .expect(getObjectTypeCounts(deckID)).eql({ image: 3, icon: 1 });

  await t
    .click('#editorSidebar [icon=data_object]')
    .expect(getJSONText()).contains(deckID)
    .click('#editorSidebar [icon=data_object]')
    .pressKey('esc')
    .pressKey('esc');
  await compareState(t, '5019957515d8552f09fed2340a4e1d3d');
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

  const deckNode = Selector('#deckEditorTree .deckEditorTreeDeck');
  await t
    .click(`#w_${deckID}`) // selecting the deck opens the deck editor directly (no separate "edit" button)
    .click('#deckEditorStripAdd')  // step 1
    .click(deckNode)                         // select the deck
    .click('#deckEditorTreeAdd')             // step 2: deck "+" adds a face (now empty, selected)
    .click('#deckEditorTreeAdd')             // reveal the add-object controls (UI only, not a history step)
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

  const deckNode = Selector('#deckEditorTree .deckEditorTreeDeck');
  await t
    .click(`#w_${deckID}`) // selecting the deck opens the deck editor directly (no separate "edit" button)
    .click('#deckEditorStripAdd')
    .click(deckNode)
    .click('#deckEditorTreeAdd')
    .click('#deckEditorTreeAdd')
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
        document.querySelector('#deckEditorTree .deckEditorTreeDeck').click(); // select the deck, then add a face
        document.querySelector('#deckEditorTreeAdd').click();
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
    .click(`#w_${deckID}`) // selecting the deck opens the deck editor directly (no separate "edit" button)
    .click('#deckEditorStripAdd')
    .click(Selector('#deckEditorTree .deckEditorObjectRow').nth(0)) // select the existing object
    .click('#deckEditorTreeAdd')                                    // reveal the add-object controls
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
    .click(`#w_${deckID}`) // selecting the deck opens the deck editor directly (no separate "edit" button)
    .click('#deckEditorStripAdd'); // make a change, leaving the deck editor open

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

  // All sidebar sections share the same row markup; find a row by its section header and label text. Scan every
  // sibling up to the next header (an image object puts its Upload button between the header and the rows).
  const findRow = (header, label) => {
    const headers = document.querySelectorAll('#deckEditorSidebar header');
    for(let i = 0; i < headers.length; ++i) {
      if(headers[i].querySelector('h2').textContent != header)
        continue;
      for(let el = headers[i].nextElementSibling; el && el.tagName != 'HEADER'; el = el.nextElementSibling) {
        const rows = el.querySelectorAll('.genericInput');
        for(let j = 0; j < rows.length; ++j)
          if(rows[j].querySelector('label').textContent == label)
            return rows[j];
      }
    }
    return null;
  };
  // Card defaults rows are fixed-type inputs now (no per-row type dropdown); width/height are number fields.
  const setField = ClientFunction((header, label, value) => {
    const row = findRow(header, label);
    if(!row)
      return false;
    const input = row.querySelector('input');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, { dependencies: { findRow } });
  // The "Entire face" band uses plain number inputs (border/radius/enlarge), not the generic dropdown rows.
  const setNumberField = ClientFunction((header, label, value) => {
    const headers = document.querySelectorAll('#deckEditorSidebar header');
    for(let i = 0; i < headers.length; ++i) {
      if(headers[i].querySelector('h2').textContent != header)
        continue;
      const rows = headers[i].nextElementSibling.querySelectorAll('.deckEditorNumberInput');
      for(let j = 0; j < rows.length; ++j)
        if(rows[j].querySelector('label').textContent == label) {
          const input = rows[j].querySelector('input');
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
    }
    return false;
  });
  const clickRowButton = ClientFunction((header, label, buttonSelector) => {
    const row = findRow(header, label);
    const button = row && row.querySelector(buttonSelector);
    if(!button)
      return false;
    button.click();
    return true;
  }, { dependencies: { findRow } });
  // Entire-face properties (border/radius/enlarge/custom) are rows only while present; add one via the section's
  // "add property" control (the first .deckEditorAddProperty). border/radius are forced to numbers on the face.
  const addFaceProperty = ClientFunction(name => {
    const add = document.querySelectorAll('#deckEditorSidebar .deckEditorAddProperty')[0];
    if(!add)
      return false;
    add.querySelector('input').value = name;
    add.querySelector('button').click();
    return true;
  });

  await t
    .click('#editButton')
    .click('#editorSidebar [icon=tune]')
    .click('#editor .noSelectionButton[icon=style]') // "Open deck editor": opens the empty editor (no auto-created deck)
    .click('#deckEditorAddDeck')                     // Add New Deck submenu (defaults to the Empty deck option)
    .click('#deckEditorNewDeckPanel button')         // "Create empty deck" -> creates a starter deck and opens it
    .setNativeDialogHandler(() => true)
    .click(Selector('#deckEditorTree .deckEditorTreeFace').nth(0)).click('#deckEditorTreeDelete') // delete a face
    .click(Selector('#deckEditorTree .deckEditorTreeFace').nth(0)).click('#deckEditorTreeDelete') // delete the other -> faceless deck
    .click('#deckEditorTreeAdd')                    // faceless deck: reveal the add-object controls
    .click('#deckEditorAddColor');                  // no faces left: auto-creates the first face
  // the color box is selected: bind its color to a new "color" card-type property via the Dynamic properties
  // Link control (the per-row split button was removed; both sides are type-or-pick comboboxes)
  await t
    .typeText('.deckEditorAddBinding .objectProperty', 'color')
    .typeText('.deckEditorAddBinding .typeProperty', 'color')
    .click('.deckEditorAddBindingButton');
  // The add-property type selector's "color" option seeds the row with a color value, so it gets the swatch +
  // color picker right away even though the property is not named after a color.
  const addObjectProperty = ClientFunction((name, type) => {
    const add = document.querySelectorAll('#deckEditorSidebar .deckEditorAddProperty')[0];
    if(!add)
      return false;
    add.querySelector('input').value = name;
    add.querySelector('select').value = type;
    add.querySelector('button').click();
    return true;
  });
  const rowHasColorPicker = ClientFunction(label => {
    const rows = document.querySelectorAll('#deckEditorSidebar .genericInput');
    for(let i = 0; i < rows.length; ++i)
      if(rows[i].querySelector('label').textContent == label)
        return rows[i].classList.contains('hasColorPicker');
    return false;
  });
  await t.expect(addObjectProperty('background', 'color')).ok();
  await t.expect(rowHasColorPicker('background')).ok();
  await t.wait(700); // let the debounced faceTemplates commit fire
  await t.pressKey('esc'); // deselect the object -> the sidebar falls back to the object's face
  // The sidebar's tab bar follows the selection and switches the scope being edited: Escape just dropped the
  // face object, so Face is showing. Object stays selectable (it offers the add-object "+" even without a
  // selection) and then only says that nothing is selected.
  const sidebarTab = id => Selector(`#deckEditorTab_${id}`);
  const sidebarHeaders = ClientFunction(() => {
    const titles = [];
    const headers = document.querySelectorAll('#deckEditorSidebar header h2');
    for(let i = 0; i < headers.length; ++i)
      titles.push(headers[i].textContent);
    return titles;
  });
  await t
    .expect(sidebarTab('face').hasClass('active')).ok()
    .expect(sidebarTab('object').hasAttribute('disabled')).notOk()
    .expect(sidebarHeaders()).eql([ 'Entire face properties' ])
    .click(sidebarTab('object'))
    .expect(sidebarHeaders()).eql([])
    .expect(Selector('#deckEditorSidebar p.deckEditorSectionNote').exists).ok()
    // add / copy / delete of the active scope are repeated at the top of the tab; without a selected object
    // only the "+" is usable
    .expect(Selector('#deckEditorSidebar .deckEditorSidebarToolbar button').nth(0).hasAttribute('disabled')).notOk()
    .expect(Selector('#deckEditorSidebar .deckEditorSidebarToolbar button').nth(1).hasAttribute('disabled')).ok()
    .click(sidebarTab('cardType'))
    .expect(sidebarHeaders()).eql([ 'Card type properties' ])
    .click(sidebarTab('face'));
  await t.expect(addFaceProperty('radius')).ok(); // radius is a row only once added
  await t.expect(setNumberField('Entire face properties', 'radius', 8)).ok();
  await t.wait(700); // let the debounced faceTemplates commit fire
  // edit the card defaults, which live on the "All Cards" tab
  await t.click(sidebarTab('defaults'));
  await t.expect(setField('Card defaults', 'width', 120)).ok();
  await t.wait(700); // let the debounced cardDefaults commit fire
  await t.expect(clickRowButton('Card defaults', 'width', '.deckEditorDeleteProperty')).ok();
  await t.click('#deckEditorUndo'); // restores the deleted width
  await t.click('#deckEditorStripCopy'); // copies "type 1" (still current) including its color property
  await t.pressKey('esc');          // closes the deck editor - and only the deck editor
  await t.expect(Selector('body').hasClass('deckEditorActive')).notOk();
  await t.expect(Selector('body').hasClass('edit')).ok(); // Escape must not have left edit mode
  await compareState(t, 'eb956b82d7fcbdea9ddeaeda95ece571');
});

test('Deck editor: toolbar button toggles the editor and stays in sync with Escape', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-empty-deck'); // the added deck is selected, so the toolbar button opens it

  const toolbarButton = Selector('#editorToolbar .editorToolbarButton button[icon=style]');

  // open via the toolbar toggle button
  await t.click('#editorToolbar [icon=style]');
  await t.expect(Selector('body').hasClass('deckEditorActive')).ok();
  await t.expect(toolbarButton.hasClass('active')).ok();
  await t.expect(Selector('#deckEditorClose').exists).notOk(); // the old Close button is gone

  // close via the same button
  await t.click('#editorToolbar [icon=style]');
  await t.expect(Selector('body').hasClass('deckEditorActive')).notOk();
  await t.expect(toolbarButton.hasClass('active')).notOk();

  // reopen and turn "Card view" off: the card stage hides and the room shows through it, while the tree,
  // property sidebar and card type strip stay on screen
  await t.click('#editorToolbar [icon=style]');
  await t.expect(Selector('body').hasClass('deckEditorActive')).ok();
  await t.click('#deckEditorCardView');
  await t
    .expect(Selector('body').hasClass('deckEditorRoomVisible')).ok()
    .expect(Selector('#deckEditorCardView').hasClass('active')).notOk()
    .expect(Selector('#deckEditorMain').visible).notOk()
    .expect(Selector('#deckEditorSidebar').visible).ok();
  await t.click('#deckEditorCardView');
  await t
    .expect(Selector('body').hasClass('deckEditorRoomVisible')).notOk()
    .expect(Selector('#deckEditorCardView').hasClass('active')).ok()
    .expect(Selector('#deckEditorMain').visible).ok();

  // close with Escape -> the button must deactivate too
  await t.pressKey('esc');
  await t.expect(Selector('body').hasClass('deckEditorActive')).notOk();
  await t.expect(toolbarButton.hasClass('active')).notOk();
});

// With no deck in the game, the toolbar button creates a starter deck (like the Properties tab option) and
// opens it, instead of doing nothing.
test('Deck editor: toolbar button opens an empty editor when the game has none', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  const deckCount = ClientFunction(() => {
    let count = 0;
    widgets.forEach(w => { if(w.get('type') == 'deck') count++; });
    return count;
  });

  await t
    .click('#editButton')
    .click('#editorToolbar [icon=style]'); // no deck exists yet
  await t
    .expect(Selector('body').hasClass('deckEditorActive')).ok()  // the editor opens...
    .expect(deckCount()).eql(0)      // ...but no deck is auto-created
    .pressKey('esc')
    .expect(Selector('body').hasClass('deckEditorActive')).notOk();
});

// The "Add a new deck" wizard's text-cards section: every typed line becomes a card type with a "text"
// property, the design inputs shape the two faces and the deck lands in a holder with cards, like the other
// wizard sections. Card type names are derived from the text, deduplicated, and fall back to a running number
// when a line has no usable characters (the "______" line below).
test('Deck editor: add a deck of text cards from the new deck wizard', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar [icon=style]') // opens the (empty) deck editor
    .click('#deckEditorAddDeck')
    .click('#deckEditorNewDeckGroupCustom .deckEditorNewDeckGroupHeader') // open the "Create a custom deck" section
    .click('#deckEditorNewDeckOverlay input[value=text]');

  // A multi-line value in one go - typeText would send the newlines as key presses.
  await ClientFunction(() => {
    const textarea = document.querySelector('.textCardsInput');
    textarea.value = 'A short one.\n______ + ______ = ______.\nA short one.';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  })();

  // A typed value ignores the input's "min"/"max", so an out-of-range card width must be clamped to the
  // declared range (20-600) rather than reaching the deck - here visible on the real-size preview card.
  const setDesignValue = ClientFunction((selector, value) => {
    const input = document.querySelector(selector);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await setDesignValue('.textCardsWidth', '-50');
  await t.expect(Selector('.textCardsPreviewCard').getStyleProperty('width')).eql('20px');
  await setDesignValue('.textCardsWidth', '150');

  await t
    .typeText('.textCardsLabel', 'Test Deck')
    .typeText('.textCardsFontSize', '20', { replace: true })
    .typeText('.textCardsCopies', '2', { replace: true })
    .click('#deckEditorNewDeckPanel .goButton [icon=add]')
    .expect(Selector('#deckEditorStrip .deckEditorStripCard').count).eql(3); // the wizard's deck is now open
  await compareState(t, '94d9f0542c71541a5e20ae14a37499b1');
});

// The other way of cutting the typed text into cards: with a blank line as the separator a card's text keeps
// the line breaks inside it, and the deck label - a textarea - carries its own onto the card backs, where the
// front's one-line footer flattens them back into spaces.
test('Deck editor: text cards with line breaks in the new deck wizard', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar [icon=style]') // opens the (empty) deck editor
    .click('#deckEditorAddDeck')
    .click('#deckEditorNewDeckGroupCustom .deckEditorNewDeckGroupHeader') // open the "Create a custom deck" section
    .click('#deckEditorNewDeckOverlay input[value=text]')
    .click('.textCardsSplit input[value=block]');

  // Indented lines, a doubled separator and a trailing blank line: all of them are trimmed away, so this is
  // two card types, the first of which is two lines long.
  await ClientFunction(() => {
    for(const [ selector, value ] of [
      [ '.textCardsInput', 'Cards that make\n   you think twice\n\n\nA short one.\n\n' ],
      [ '.textCardsLabel', 'Line\nBreak\nDeck' ]
    ]) {
      const element = document.querySelector(selector);
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })();

  await t
    .expect(Selector('.textCardsStatus').innerText).eql('2 card types × 1 = 2 cards.')
    .expect(Selector('.textCardsPreviewCard .cardFace.active .cardFaceObject').nth(1).textContent).eql('Cards that make\nyou think twice')
    .click('#deckEditorNewDeckPanel .goButton [icon=add]')
    .expect(Selector('#deckEditorStrip .deckEditorStripCard').count).eql(2); // the wizard's deck is now open

  const deck = await ClientFunction(() => {
    let deck = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deck = w; });
    return {
      cardTypes: deck.get('cardTypes'),
      back: deck.get('faceTemplates')[0].objects[1].value,
      footer: deck.get('faceTemplates')[1].objects[2].value
    };
  })();

  await t
    .expect(deck.cardTypes).eql({
      'Cards that make you think twic': { text: 'Cards that make\nyou think twice' },
      'A short one': { text: 'A short one.' }
    })
    .expect(deck.back).eql('Line\nBreak\nDeck')
    .expect(deck.footer).eql('Line Break Deck');
});

// The wizard's front/back image section: both uploads are sorted by file name - numerically, so front2 comes
// before front10 - and then matched up position by position, giving every card type its own back image. The
// card size comes from the aspect ratio of the first front image.
test('Deck editor: pair front and back images in the new deck wizard', async t => {
  // 40x60 SVGs, one per file name so the pairing is visible in the resulting cardTypes.
  const asset = fileName=>`data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="60"><title>${fileName}</title></svg>`).toString('base64')}`;
  const fronts = [ 'front10.png', 'front2.png', 'front1.png' ];
  const backs  = [ 'back2.png', 'back10.png', 'back1.png' ];
  const fileNameOfAsset = {};
  for(const fileName of [ ...fronts, ...backs ])
    fileNameOfAsset[asset(fileName)] = fileName;

  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar [icon=style]') // opens the (empty) deck editor
    .click('#deckEditorAddDeck')
    .click('#deckEditorNewDeckGroupCustom .deckEditorNewDeckGroupHeader') // open the "Create a custom deck" section
    .click('#deckEditorNewDeckOverlay input[value=imagePairs]');

  // The uploads go through a file picker that can't be driven from a test, so uploadAsset is replaced by a
  // stub handing the wizard the asset paths the server would have returned for the files below.
  const stubUploadOf = ClientFunction(assets => {
    window.uploadAsset = callback => {
      for(const [ fileName, imagePath ] of assets)
        callback(imagePath, fileName);
    };
  });
  const uploadButton = Selector('#deckEditorNewDeckPanel [icon=upload]');

  await stubUploadOf(fronts.map(fileName=>[ fileName, asset(fileName) ]));
  await t.click(uploadButton.nth(0));
  await stubUploadOf(backs.map(fileName=>[ fileName, asset(fileName) ]));
  await t.click(uploadButton.nth(1));

  // The card width is read from the first front image, so wait until the browser knows its size.
  const firstFrontHeight = ClientFunction(() => document.querySelector('.imagePairList img').naturalHeight);
  await t.expect(firstFrontHeight()).eql(60);

  await t
    .click('#deckEditorNewDeckPanel .goButton [icon=add]')
    .expect(Selector('#deckEditorStrip .deckEditorStripCard').count).eql(3); // the wizard's deck is now open

  const deck = await ClientFunction(() => {
    let deck = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deck = w; });
    return {
      width: deck.get('cardDefaults').width,
      pairs: Object.entries(deck.get('cardTypes')).map(([ cardType, c ])=>`${cardType}: ${fileNameOfAsset[c.image]} + ${fileNameOfAsset[c.backImage]}`)
    };
  }, { dependencies: { fileNameOfAsset } })();

  await t.expect(deck.pairs).eql([
    'front1: front1.png + back1.png',
    'front2: front2.png + back2.png',
    'front10: front10.png + back10.png'
  ]);
  await t.expect(deck.width).eql(107); // 40x60 fronts at the default card height of 160
});

// The other states of the same section: unequal numbers of fronts and backs keep "Add to game" disabled until
// the lists are made to match again by deleting an image, and a single back image is shared by every card.
test('Deck editor: mismatched and shared card backs in the new deck wizard', async t => {
  const asset = fileName=>`data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="60"><title>${fileName}</title></svg>`).toString('base64')}`;

  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar [icon=style]') // opens the (empty) deck editor
    .click('#deckEditorAddDeck')
    .click('#deckEditorNewDeckGroupCustom .deckEditorNewDeckGroupHeader') // open the "Create a custom deck" section
    .click('#deckEditorNewDeckOverlay input[value=imagePairs]');

  const stubUploadOf = ClientFunction(assets => {
    window.uploadAsset = callback => {
      for(const [ fileName, imagePath ] of assets)
        callback(imagePath, fileName);
    };
  });
  const uploadButton = Selector('#deckEditorNewDeckPanel [icon=upload]');
  const addButton = Selector('#deckEditorNewDeckPanel .goButton [icon=add]');
  const status = Selector('.imagePairStatus');
  const backs = Selector('.imagePairList').nth(1).find('.imagePairEntry');

  await stubUploadOf([ 'front1.png', 'front2.png', 'front3.png' ].map(fileName=>[ fileName, asset(fileName) ]));
  await t.click(uploadButton.nth(0));
  await stubUploadOf([ 'back1.png', 'back2.png' ].map(fileName=>[ fileName, asset(fileName) ]));
  await t.click(uploadButton.nth(1));

  await t
    .expect(status.innerText).contains('3 fronts but 2 backs')
    .expect(status.hasClass('imagePairMismatch')).ok()
    .expect(addButton.hasAttribute('disabled')).ok();

  // Deleting one of the two backs leaves a single back image, which is shared by all three cards.
  await t
    .click(backs.nth(1).find('[icon=delete]'))
    .expect(backs.count).eql(1)
    .expect(status.innerText).contains('all sharing the single back image')
    .expect(addButton.hasAttribute('disabled')).notOk();

  await t
    .click(addButton)
    .expect(Selector('#deckEditorStrip .deckEditorStripCard').count).eql(3); // the wizard's deck is now open

  await t.expect(await ClientFunction(() => {
    let deck = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deck = w; });
    return Object.values(deck.get('cardTypes')).map(c=>c.backImage);
  })()).eql(Array(3).fill(asset('back1.png')));
});

// The "one image per card" section fills the copy counts straight from its number inputs, so they arrive as
// strings - a handful of single-copy fronts must not be mistaken for a large deck by the shared confirmation.
test('Deck editor: a few uploaded card fronts are added without a large-deck confirmation', async t => {
  const asset = fileName=>`data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="60"><title>${fileName}</title></svg>`).toString('base64')}`;
  const fronts = [ 'card1.png', 'card2.png', 'card3.png', 'card4.png' ];

  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar [icon=style]') // opens the (empty) deck editor
    .click('#deckEditorAddDeck')
    .click('#deckEditorNewDeckGroupCustom .deckEditorNewDeckGroupHeader') // open the "Create a custom deck" section
    .click('#deckEditorNewDeckOverlay input[value=images]');

  // The file picker can't be driven from a test - hand the wizard the asset paths the server would return.
  await ClientFunction(assets => {
    window.uploadAsset = callback => {
      for(const [ fileName, imagePath ] of assets)
        callback(imagePath, fileName);
    };
  })(fronts.map(fileName=>[ fileName, asset(fileName) ]));

  // Declining a confirmation would abort the whole deck, so this asserts twice: no dialog, and the cards exist.
  await t
    .setNativeDialogHandler(() => false)
    .click('#deckEditorNewDeckPanel #frontsButton')
    .click('#deckEditorNewDeckPanel .goButton [icon=add]')
    .expect(Selector('#deckEditorStrip .deckEditorStripCard').count).eql(4); // the wizard's deck is now open

  await t.expect(await t.getNativeDialogHistory()).eql([]);
  await t.expect(await ClientFunction(() => {
    let cards = 0;
    widgets.forEach(w => { if(w.get('type') == 'card') ++cards; });
    return cards;
  })()).eql(4);
});

test('Line widget in edit mode', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-line')
    .click('#editorSidebar [icon=tune]')
    // "Add stop" opens the menu of the three ways to add one; the first is a new
    // widget inheriting from an existing stop, which the Add button then creates
    .click('#editorModules .lineAddStop')
    .click(Selector('#editorModules .lineAddStopMenuEntry').nth(0))
    .click('#editorModules .lineAddStopConfirm')
    .click(Selector('#editorModules .lineShapePreset').withAttribute('aria-label', 'Shallow curve'));
  const lineID = await ClientFunction(() => document.querySelector('.widget.line').id.slice(2))();

  // "Target widgets" writes the line's dropTarget: each match is a widget type
  // plus any number of property/value conditions, several matches are an array
  await t
    .click('#editorModules .dropTargetAddMatch')
    .click('#editorModules .dropTargetType')
    .click(Selector('#editorModules .dropTargetType option').withAttribute('value', 'type:card'));
  const dropTarget = await ClientFunction(id => JSON.stringify(widgets.get(id).get('dropTarget')))(lineID);
  await t.expect(dropTarget).eql('{"type":"card"}');

  // a second match, narrowed down with a condition, and true stays a boolean
  await t
    .click('#editorModules .dropTargetAddMatch')
    .click(Selector('#editorModules .dropTargetAddCondition').nth(1))
    .typeText(Selector('#editorModules .dropTargetProperty').nth(0), 'movable')
    .typeText(Selector('#editorModules .dropTargetValue').nth(0), 'true')
    .pressKey('tab');
  const dropTargets = await ClientFunction(id => JSON.stringify(widgets.get(id).get('dropTarget')))(lineID);
  await t.expect(dropTargets).eql('[{"type":"card"},{"movable":true}]');

  await t.click(Selector('#editorModules .dropTargetRemoveMatch').nth(1));

  await t
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-line')
    .typeText('#editorModules .lineConnectStartID', lineID)
    .pressKey('tab');
  const connectedLine = await ClientFunction(() => {
    const connection = widgets.get(document.querySelector('.widget.line.selectedInEdit').id.slice(2)).get('connectStart');
    return connection && connection.line;
  })();
  await t.expect(connectedLine).eql(lineID);

  // dragging a handle moves it by browser-dependent pixels, so verify it in the
  // DOM and delete the dragged line again to keep the compared state stable
  // an end point handle is a ring with a hole in the middle (so the stop below
  // it stays clickable), so the drag grabs its left edge instead of its centre
  const endHandle = Selector('.widget.line.selectedInEdit .lineHandle').nth(1);
  const transformBefore = await endHandle.getStyleProperty('transform');
  const handleRect = await endHandle.boundingClientRect;
  await t
    .drag(endHandle, 90, 60, { offsetX: 1, offsetY: Math.round(handleRect.height/2) })
    .expect(endHandle.getStyleProperty('transform')).notEql(transformBefore)
    .click('#editorToolbar > div > [icon=delete_forever]');
  // the added stop's id is derived from the existing stops instead of being
  // random, so the compared state no longer depends on the seeded rand() stream
  await compareState(t, 'd35bd7362c7e87ea9ecb29895cc8d0b9');
});

test('Enabling the Debug module while a routine waits for INPUT does not abort the routine', async t => {
  await setRoomState({
    button: {
      id: 'button',
      type: 'button',
      clickRoutine: [
        { func: 'LABEL', label: 'label', value: 'start' },
        { func: 'INPUT', header: 'Continue?', fields: [ { type: 'string', variable: 'answer', value: 'yes' } ] },
        { func: 'LABEL', label: 'label', value: 'done' }
      ]
    },
    label: { id: 'label', type: 'label', y: 100, text: '' }
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await ClientFunction(() => {
    window.debugToggleErrors = [];
    window.addEventListener('error', event => window.debugToggleErrors.push(String(event.error || event.message)));
    window.addEventListener('unhandledrejection', event => window.debugToggleErrors.push(String(event.reason)));
  })();

  // enter edit mode with the Debug module closed, then start the routine and let it suspend on INPUT
  await t
    .click('#editButton')
    .expect(Selector('#editorSidebar [icon=pest_control]').visible).ok(); // edit mode finished loading
  await ClientFunction(() => {
    widgets.get('button').evaluateRoutine('clickRoutine', {}, {});
  })();
  await t.expect(Selector('#buttonInputOverlay').visible).ok();

  // opening Debug now switches routine logging on in the middle of the suspended routine (#2672)
  await t
    .click('#editorSidebar [icon=pest_control]')
    .click('#buttonInputGo');

  await t.expect(await ClientFunction(() => widgets.get('label').get('text'))()).eql('done');
  await t.expect(await ClientFunction(() => window.debugToggleErrors)()).eql([]);
  // the running routine can not be logged retroactively - the log explains the gap instead
  await t.expect(Selector('#jeLog .jeLogNote').innerText).contains('could not be recorded');
  await compareState(t, 'ae64bb637f9aff6df4fe20773602a8e0');
});
