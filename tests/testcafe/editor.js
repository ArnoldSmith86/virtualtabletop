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
  const endHandle = Selector('.widget.line.selectedInEdit .lineHandle').nth(1);
  const transformBefore = await endHandle.getStyleProperty('transform');
  await t
    .drag(endHandle, 90, 60)
    .expect(endHandle.getStyleProperty('transform')).notEql(transformBefore)
    .click('#editorToolbar > div > [icon=delete_forever]');
  // the added stop's id is derived from the existing stops instead of being
  // random, so the compared state no longer depends on the seeded rand() stream
  await compareState(t, '7da80b26d6a3d7352f9ae5d58dce6fab');
});
