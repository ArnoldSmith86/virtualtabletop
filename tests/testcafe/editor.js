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

test('A holder picks what it accepts in the dropTarget editor', async t => {
  await setRoomState({
    deck:   { id: 'deck', type: 'deck', cardTypes: { a: {} }, faceTemplates: [ { objects: [] } ] },
    holder: { id: 'holder', type: 'holder', x: 300, y: 200 }
  });
  await ClientFunction(prepareClient)();
  await setName(t);

  const dropTarget = ClientFunction(() => JSON.stringify(widgets.get('holder').get('dropTarget')));

  // a holder takes cards until it is told otherwise - the match rows say so
  await t
    .click('#editButton')
    .click('#editorSidebar [icon=tune]')
    .click('#w_holder')
    .expect(Selector('#editorModules .widgetHeaderType').innerText).contains('Holder')
    .expect(Selector('#editorModules .dropTargetType').value).eql('type:card');

  // the deck shortcut above the rows narrows that down to one deck, and shows
  // up as a match row like any other
  await t
    .click(Selector('#editorModules .dropTargetDecks .widgetSelectionButton').nth(0))
    .expect(dropTarget()).eql('{"deck":"deck"}')
    .expect(Selector('#editorModules .dropTargetProperty').value).eql('deck');

  // a second match lets something in that is not a card at all
  await t
    .click('#editorModules .dropTargetAddMatch')
    .click(Selector('#editorModules .dropTargetType').nth(1))
    .click(Selector('#editorModules .dropTargetType').nth(1).find('option').withAttribute('value', 'type:dice'))
    .expect(dropTarget()).eql('[{"deck":"deck"},{"type":"dice"}]');

  // clicking the selected deck again takes its match back out
  await t
    .click(Selector('#editorModules .dropTargetDecks .widgetSelectionButton').nth(0))
    .expect(dropTarget()).eql('{"type":"dice"}');
});

test('Position holds the grid and the drag limits, SVG replacements come from the file', async t => {
  await setRoomState({
    // an SVG written for svgReplaces: it uses placeholders in fill, stroke and
    // stroke-width, plus an opacity of its own
    checker: { id: 'checker', type: 'basic', x: 100, y: 100, width: 91, height: 91, image: '/i/game-pieces/2D/Checkers-2D.svg' }
  });
  await ClientFunction(prepareClient)();
  await setName(t);

  const nestedSection = Selector('#editorModules .collapsibleBody > .collapsibleSection > .collapsibleHeader .collapsibleTitle');
  const dragLimit = ClientFunction(() => JSON.stringify(widgets.get('checker').state.dragLimit || null));
  const svgReplaces = ClientFunction(() => JSON.stringify(widgets.get('checker').get('svgReplaces')));

  // where a widget may end up is part of where it is, so both blocks sit
  // inside Position rather than beside it
  await t
    .click('#editButton')
    .click('#editorSidebar [icon=tune]')
    .click('#w_checker')
    .click(Selector('#editorModules .collapsibleHeader').withText('Position'))
    .expect(nestedSection.withExactText('Snap grid').exists).ok()
    .expect(nestedSection.withExactText('Drag limits').exists).ok();

  const dragLimitBody = Selector('#editorModules .collapsibleHeader').withText('Drag limits').sibling('.collapsibleBody');
  await t
    .click(Selector('#editorModules .collapsibleHeader').withText('Drag limits'))
    .click(dragLimitBody.find('.gridLimitToggle label.switchbox'))
    // the whole table minus the widget's own box
    .expect(dragLimit()).eql('{"minX":0,"minY":0,"maxX":1509,"maxY":909}')
    .typeText(dragLimitBody.find('.gridLimits input[type=number]').nth(1), '800', { replace: true })
    .expect(dragLimit()).eql('{"minX":0,"minY":0,"maxX":800,"maxY":909}')
    // the four sides only mean something together, so the switch drops all of
    // them - and an empty rectangle is the default, i.e. no property at all
    .click(dragLimitBody.find('.gridLimitToggle label.switchbox'))
    .expect(dragLimit()).eql('null');

  // the replacements are read out of the SVG: its stroke-width placeholder is
  // offered as a replacement for a borderWidth, and gets a number input
  const swatch = text => Selector('#editorModules .svgColorSwatch').withText(text);
  await t
    .click(Selector('#editorModules .collapsibleHeader').withText('SVG replacements'))
    .expect(swatch('stroke-width: #borderWidth').exists).ok()
    .click(swatch('stroke-width: #borderWidth'))
    .expect(svgReplaces()).eql('{"#borderWidth":"borderWidth"}')
    .expect(Selector('#editorModules .svgReplaceColorsHost .numberInput label').innerText).contains('Border Width');

  // a fill becomes the widget's color and gets a color picker instead
  await t
    .click(swatch('fill: #primaryColor'))
    .expect(svgReplaces()).eql('{"#borderWidth":"borderWidth","#primaryColor":"color"}')
    .expect(Selector('#editorModules .svgReplaceColorsHost .colorInput').exists).ok();
});

test('A pile is edited through its handle, css through declaration rows', async t => {
  await setRoomState({
    deck:  { id: 'deck', type: 'deck', cardTypes: { a: {} }, faceTemplates: [ { objects: [] } ] },
    pile:  { id: 'pile', type: 'pile', x: 300, y: 200, width: 103, height: 160 },
    card1: { id: 'card1', type: 'card', deck: 'deck', cardType: 'a', parent: 'pile' },
    card2: { id: 'card2', type: 'card', deck: 'deck', cardType: 'a', parent: 'pile' }
  });
  await ClientFunction(prepareClient)();
  await setName(t);

  // the handle is the only part of a pile the cards do not cover
  await t
    .click('#editButton')
    .click('#editorSidebar [icon=tune]')
    .click(Selector('#w_pile .handle'))
    .expect(Selector('.widgetHeaderType').innerText).contains('Pile')
    .typeText('.textInput input', 'chips', { replace: true })
    .expect(ClientFunction(() => widgets.get('pile').get('text'))()).eql('chips');

  // every fold-away block draws the same arrow, which points sideways while
  // the block is folded and down while it is open
  const cssArrow = Selector('#editorModules .collapsibleHeader').withText('CSS').find('.collapseArrow');
  await t.expect(cssArrow.hasClass('collapsed')).ok();

  // the handle colors are written into handleCSS, not into css
  await t
    .click(Selector('#editorModules .collapsibleHeader').withText('CSS'))
    .expect(cssArrow.hasClass('collapsed')).notOk()
    .click(Selector('#editorModules .cssDeclarationAddRow input'))
    .typeText(Selector('#editorModules .cssDeclarationAddRow input'), 'opacity')
    .pressKey('enter')
    .typeText(Selector('#editorModules .cssDeclarationValue').nth(0), '0.5')
    .expect(ClientFunction(() => JSON.stringify(widgets.get('pile').get('css')))()).eql('{"opacity":"0.5"}');

  // switching a declaration off takes it out of the widget, switching it back
  // on restores it
  await t
    .click(Selector('#editorModules .cssDeclarationToggle').nth(0))
    // unset css falls back to the default of the property, an empty string
    .expect(ClientFunction(() => JSON.stringify(widgets.get('pile').get('css') || null))()).eql('null')
    .click(Selector('#editorModules .cssDeclarationToggle').nth(0))
    .expect(ClientFunction(() => JSON.stringify(widgets.get('pile').get('css')))()).eql('{"opacity":"0.5"}');

  // a pile removes itself as soon as it holds a single card - the editor has to
  // drop it from the selection, or the next keystroke in one of its inputs
  // writes to a dead widget id and the server re-creates it as a ghost widget
  await ClientFunction(() => widgets.get('card2').set('parent', null))();
  await t
    .expect(ClientFunction(() => widgets.has('pile'))()).eql(false)
    .expect(Selector('#editorModules .widgetHeaderType').exists).notOk();
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
