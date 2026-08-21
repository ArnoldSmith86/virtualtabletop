import { ClientFunction, Selector } from 'testcafe';

import { compareState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// Which modules edit mode comes up with depends on what the browser has stored and on whether the
// window has room for a panel next to the board, and both survive a test. Every test that expects
// the properties module to be open therefore states its own window size and editor state instead of
// inheriting them from whichever test ran before it.
const setEditorState = ClientFunction(state => {
  if(state)
    localStorage.setItem('editorState', JSON.stringify(state));
  else
    localStorage.removeItem('editorState');
});

const moduleWidth = ClientFunction(() => document.querySelector('#editorModules').getBoundingClientRect().width);

// the editor state of a test that wants the properties module open the way the user opens it, rather
// than as the panel edit mode opens on its own the very first time (which sizes itself to its content)
const propertiesModuleOpen = { modules: { 'Edit Widgets': 'editorModuleTopLeft' } };
// edit mode imports itself on the first click of the edit button, so waiting for the module the state
// above restores is what tells "the editor is there" from "the click has not arrived yet"
const propertiesModule = Selector('#editorModuleTopLeft.tune');

test('Edit mode opens the Edit Widgets module when no module is remembered', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    widget: { id: 'widget', type: 'basic', x: 200, y: 200 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);
  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
    .expect(Selector('#editorSidebar button[icon=tune].active').exists).ok()
    // sized to its content, not to the 50/50 split a module the user opens gets
    .expect(Selector('body.defaultEditorModuleWidth').exists).ok()
    .expect(moduleWidth()).lte(420)
    // opening a module by hand hands the width back to the resizer
    .click('#editorSidebar button[icon=data_object]')
    .expect(Selector('body.defaultEditorModuleWidth').exists).notOk()
    .expect(moduleWidth()).gt(420);
  await setEditorState(null);
});

test('Edit mode restores the remembered module instead of the default one', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    widget: { id: 'widget', type: 'basic', x: 200, y: 200 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState({ modules: { JSON: 'editorModuleTopLeft' } });
  await setName(t);
  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.data_object').exists).ok()
    .expect(Selector('#editorModuleTopLeft.tune').exists).notOk();
  await setEditorState(null);
});

// closing every module deletes the last entry, so only the flag tells "I closed
// them all" apart from "I have never been here"
test('Edit mode leaves the modules closed once the default has been opened before', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    widget: { id: 'widget', type: 'basic', x: 200, y: 200 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState({ modules: {}, defaultModuleOpened: true });
  await setName(t);
  await t
    .click('#editButton')
    .expect(Selector('#editorToolbar > div > [icon=add]').exists).ok() // edit mode has loaded
    .expect(Selector('#editorModuleTopLeft.tune').exists).notOk()
    .expect(Selector('#editor.moduleActive').exists).notOk();
  await setEditorState(null);
});

// there the panel is a fullscreen overlay, so opening it by default would hide
// the room the user just went to edit
test('Edit mode skips the default module in the narrow-window layout', async t => {
  await t.resizeWindow(900, 600);
  await setRoomState({
    widget: { id: 'widget', type: 'basic', x: 200, y: 200 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);
  await t
    .click('#editButton')
    .expect(Selector('#editorToolbar > div > [icon=add]').exists).ok() // edit mode has loaded
    .expect(Selector('#editorModuleTopLeft.tune').exists).notOk()
    .expect(Selector('#editor.moduleActive').exists).notOk();
  await setEditorState(null);
});

// a portrait window showing a landscape board asks the user to rotate the device,
// which is more useful than a properties panel covering that message
test('Edit mode skips the default module in a portrait window', async t => {
  await t.resizeWindow(410, 845);
  await setRoomState({
    widget: { id: 'widget', type: 'basic', x: 200, y: 200 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);
  await t
    .click('#editButton')
    .expect(Selector('#editorToolbar > div > [icon=add]').exists).ok() // edit mode has loaded
    .expect(Selector('#editorModuleTopLeft.tune').exists).notOk()
    .expect(Selector('#editor.moduleActive').exists).notOk();
  await setEditorState(null);
});

// the module that opens itself is closed the same way every other one is: with
// the sidebar button that opened it. There is no close button in the panel.
test('A module is closed again through its sidebar button', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    widget: { id: 'widget', type: 'basic', x: 200, y: 200 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);
  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
    .expect(Selector('#editorModuleTopLeft .moduleCloseButton').exists).notOk()
    .click('#editorSidebar button[icon=tune]')
    .expect(Selector('#editorModuleTopLeft.tune').exists).notOk()
    .expect(Selector('#editor.moduleActive').exists).notOk()
    .expect(Selector('#editorSidebar button[icon=tune].active').exists).notOk();
  await setEditorState(null);
});

// The toolbar's undo button cuts the undo protocol short behind the History module's back, so the
// rows the module has rendered describe entries that are no longer in the protocol. It has to drop
// them instead of writing to a row that has no entry behind it - the second undo in a row lands on
// exactly that row.
test('Undoing from the toolbar keeps the History module in sync', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    widget: { id: 'widget', type: 'basic', x: 200, y: 200 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState({ modules: { History: 'editorModuleTopLeft' } });
  await setName(t);

  const historyRows = Selector('.undoEntry');
  const widgetCount = ClientFunction(() => widgets.size);
  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.undo').exists).ok();

  // the room states the client loaded with - one per state message it has seen so far
  const rowsBefore = await historyRows.count;
  await t
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-line')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-holder')
    .expect(historyRows.count).eql(rowsBefore+2)
    .expect(widgetCount()).eql(5) // the widget of the room state, the line with its two stops, the holder
    // each undo drops the row of the entry it removes instead of adding one for itself
    .click('#editorToolbar [icon=undo]')
    .expect(historyRows.count).eql(rowsBefore+1)
    .expect(widgetCount()).eql(4)
    .click('#editorToolbar [icon=undo]')
    .expect(historyRows.count).eql(rowsBefore)
    .expect(widgetCount()).eql(1);
  await setEditorState(null);
});

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
  await t.resizeWindow(1280, 800);
  await setRoomState({
    old: { id: 'old', type: 'basic', x: 200, y: 200, movable: true, movableInEdit: true }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);
  await ClientFunction(() => {
    window.renamedWidgetErrors = [];
    window.addEventListener('error', event => window.renamedWidgetErrors.push(String(event.error || event.message)));
  })();
  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
    .click('#w_old')
    // the icon color only paints something once there is an icon (or a class
    // or css reading --color), so its chip is not offered on a plain widget
    .expect(Selector('.colorFlexRow label.iconOnly').count).eql(4)
    .expect(Selector('.colorFlexRow label.iconOnly').filterVisible().count).eql(3)
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
    // the icon color says what it paints, since it is the one chip that is
    // only there for some widgets
    { label: null, swatch: null, info: true }
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

test('Dice faces have their own icon, image scale and CSS controls', async t => {
  // Keep this at the narrow layout from the review so the controls remain
  // useful in the smallest supported properties sidebar.
  await t.resizeWindow(410, 845);
  await setRoomState({
    die: {
      id: 'die', type: 'dice', x: 200, y: 200, width: 100, height: 100,
      faces: [ { icon: 'casino' }, { image: '/i/game-pieces/2D/Checkers-2D.svg', imageScale: 1.4 }, { text: 'A' } ]
    }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  const diceState = ClientFunction(() => JSON.stringify(widgets.get('die').state));
  const matchingFaceValueWidths = ClientFunction(() => {
    const rows = document.querySelectorAll('#editorModules .diceFaceRow');
    const iconScale = rows[0].querySelector('.numberInput input');
    const text = rows[2].querySelector('.textInput input');
    return Math.abs(iconScale.getBoundingClientRect().width - text.getBoundingClientRect().width) < 1;
  });
  const compactFaceLayout = ClientFunction(() => {
    const rows = document.querySelectorAll('#editorModules .diceFaceRow');
    const preview = rows[0].querySelector('.diceFacePreview').getBoundingClientRect();
    const icon = rows[0].querySelector('.propertyPreviewButton').getBoundingClientRect();
    const image = rows[1].querySelector('.propertyPreviewButton').getBoundingClientRect();
    const main = rows[0].querySelector('.diceFaceMain').getBoundingClientRect();
    const toggle = rows[0].querySelector('.diceFaceCssToggle');
    const genericInput = document.querySelector('#editorModules .genericAddPropertyRow input');
    return {
      previewsMatch: [ icon, image ].every(rect => Math.abs(rect.width - preview.width) < 1 && Math.abs(rect.height - preview.height) < 1),
      previewCentered: Math.abs((preview.top + preview.height / 2) - (main.top + main.height / 2)) < 1,
      cssUsesSectionHeader: toggle.classList.contains('collapsibleHeader'),
      nativeSuggestionList: !!genericInput.getAttribute('list'),
      extraSuggestionButtons: document.querySelectorAll('#editorModules .genericAddPropertyRow .suggestionListButton').length
    };
  });
  const setAllImageScale = ClientFunction(() => {
    const input = document.querySelector('#editorModules .diceImageScale input');
    input.value = '0.7';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const rows = Selector('#editorModules .diceFaceRow');
  await t
    .click('#editButton')
    // portrait window, so this is one of the layouts where the module does not open by default
    .click('#editorSidebar [icon=tune]')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
    .click('#w_die')
    // Background, pips/icon and border no longer repeat generic color help.
    .expect(Selector('#editorModules .diceSharedColors .info-button').count).eql(0)
    // Shared face colors live once above the list. Turning one off gives
    // every face its own matching swatch instead of repeating all three.
    .expect(Selector('#editorModules .diceSharedColors .colorFlexRow .propertyInput').count).eql(3)
    .expect(rows.nth(0).find('.colorFlexRow .propertyInput').count).eql(0)
    .click(Selector('#editorModules .diceColorLockChecks label.switchbox').nth(0))
    .expect(Selector('#editorModules .diceSharedColors .colorFlexRow .propertyInput').count).eql(2)
    .expect(rows.nth(0).find('.colorFlexRow .propertyInput').count).eql(1)
    .expect(matchingFaceValueWidths()).ok()
    .expect(rows.nth(0).find('.diceFaceCssToggle .collapseArrow').exists).ok()
    .expect(rows.nth(0).find('.diceFaceCssToggle').textContent).eql('CSS')
    .expect(compactFaceLayout()).eql({
      previewsMatch: true,
      previewCentered: true,
      cssUsesSectionHeader: true,
      nativeSuggestionList: true,
      extraSuggestionButtons: 0
    })
    .typeText(rows.nth(0).find('.numberInput input[type=number]'), '1.5', { replace: true })
    .expect(diceState()).contains('{"icon":{"name":"casino","scale":1.5}}')
    // An image face has a local override, while the all-faces control removes
    // it and writes the shared dice property.
    .expect(rows.nth(1).find('.numberInput input').value).eql('1.4');
  await setAllImageScale();
  await t
    .expect(diceState()).contains('"imageScale":0.7')
    .expect(diceState()).notContains('"image":"/i/game-pieces/2D/Checkers-2D.svg","imageScale"')
    // Face CSS starts folded and stays on the one face, not on the dice as a whole.
    .expect(rows.nth(0).find('.diceFaceCSS textarea').exists).notOk()
    .click(rows.nth(0).find('.diceFaceCssToggle'))
    .typeText(rows.nth(0).find('.diceFaceCSS textarea'), 'opacity: 0.5')
    .expect(diceState()).contains('"faceCSS":"opacity: 0.5"')
    // Other properties is always present and can seed a new generic row.
    .expect(ClientFunction(() => [ ...document.querySelectorAll('#editorModules .genericAddPropertyRow option') ].some(option => /Routine$/.test(option.value)))()).notOk()
    .typeText('#editorModules .genericAddPropertyRow input', 'customValue')
    .pressKey('enter')
    .expect(diceState()).contains('"customValue":""');
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
  await t.resizeWindow(1280, 800);
  await setRoomState({
    deck:   { id: 'deck', type: 'deck', cardTypes: { a: {} }, faceTemplates: [ { objects: [] } ] },
    holder: { id: 'holder', type: 'holder', x: 300, y: 200 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  const dropTarget = ClientFunction(() => JSON.stringify(widgets.get('holder').get('dropTarget')));

  // a holder takes cards until it is told otherwise - the match rows say so
  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
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
  await t.resizeWindow(1280, 800);
  await setRoomState({
    // an SVG written for svgReplaces: it uses placeholders in fill, stroke and
    // stroke-width, plus an opacity of its own
    checker: { id: 'checker', type: 'basic', x: 100, y: 100, width: 91, height: 91, image: '/i/game-pieces/2D/Checkers-2D.svg' }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  const nestedSection = Selector('#editorModules .collapsibleBody > .collapsibleSection > .collapsibleHeader .collapsibleTitle');
  const dragLimit = ClientFunction(() => JSON.stringify(widgets.get('checker').state.dragLimit || null));
  const grid = ClientFunction(() => JSON.stringify(widgets.get('checker').get('grid')));
  const svgReplaces = ClientFunction(() => JSON.stringify(widgets.get('checker').get('svgReplaces')));

  // where a widget may end up is part of where it is, so both blocks sit
  // inside Position rather than beside it
  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
    .click('#w_checker')
    .click(Selector('#editorModules .collapsibleHeader').withText('Position'))
    .expect(nestedSection.withExactText('Snap grid').exists).ok()
    .expect(nestedSection.withExactText('Drag limits').exists).ok();

  const dragLimitBody = Selector('#editorModules .collapsibleHeader').withText('Drag limits').sibling('.collapsibleBody');
  const areaPreview = Selector('.dragLimitPreviewOverlay');
  await t
    .click(Selector('#editorModules .collapsibleHeader').withText('Drag limits'))
    .click(dragLimitBody.find('.gridLimitToggle label.switchbox'))
    // the whole table minus the widget's own box
    .expect(dragLimit()).eql('{"minX":0,"minY":0,"maxX":1509,"maxY":909}')
    .typeText(dragLimitBody.find('.dragLimitRow input').nth(1), '800', { replace: true })
    .expect(dragLimit()).eql('{"minX":0,"minY":0,"maxX":800,"maxY":909}')
    // a side takes an expression instead of a number, and the area does not
    // have to be a rectangle at all - one condition per line
    .typeText(dragLimitBody.find('.dragLimitRow input').nth(1), '${PROPERTY width OF checker} * 10', { replace: true })
    .expect(dragLimit()).eql('{"minX":0,"minY":0,"maxX":"${PROPERTY width OF checker} * 10","maxY":909}')
    .typeText(dragLimitBody.find('textarea'), 'y > x')
    .expect(dragLimit()).eql('{"minX":0,"minY":0,"maxX":"${PROPERTY width OF checker} * 10","maxY":909,"condition":"y > x"}')
    .typeText(dragLimitBody.find('textarea'), '\n2x^2 + y > 4')
    .expect(dragLimit()).eql('{"minX":0,"minY":0,"maxX":"${PROPERTY width OF checker} * 10","maxY":909,"condition":["y > x","2x^2 + y > 4"]}')
    // which point of the widget all of that holds - the same 3x3 picker a snap
    // grid uses to say which point of it lands on a grid line
    .click(dragLimitBody.find('.gridAnchorRow .gridAnchor').nth(4))
    .expect(dragLimit()).eql('{"minX":0,"minY":0,"maxX":"${PROPERTY width OF checker} * 10","maxY":909,"condition":["y > x","2x^2 + y > 4"],"alignX":0.5,"alignY":0.5}')
    // and the top left corner is what the engine uses anyway, so picking it
    // drops the two keys again
    .click(dragLimitBody.find('.gridAnchorRow .gridAnchor').nth(0))
    .expect(dragLimit()).eql('{"minX":0,"minY":0,"maxX":"${PROPERTY width OF checker} * 10","maxY":909,"condition":["y > x","2x^2 + y > 4"]}')
    // a condition that is not a comparison is a number, and a number is true
    // wherever it is not 0 - so it is reported like one that cannot be read at
    // all rather than left behind as a limit that limits nothing
    .typeText(dragLimitBody.find('textarea'), 'x - 100', { replace: true })
    .expect(dragLimitBody.find('.propertyInputProblem').withText('comparison').exists).ok()
    // and conditions that hold nowhere at all are said out loud too: no single
    // line of that is wrong, but together they describe no area, and an area
    // nothing satisfies limits nothing
    .typeText(dragLimitBody.find('textarea'), 'x < 200\nx > 800', { replace: true })
    .expect(dragLimitBody.find('.dragLimitEmptyArea').innerText).contains('satisfies')
    .typeText(dragLimitBody.find('textarea'), 'y > x', { replace: true })
    .expect(dragLimitBody.find('.dragLimitEmptyArea').innerText).eql('')
    // the area a condition describes is sampled onto the board while the
    // section is open, and the switch next to it takes it away again
    .expect(areaPreview.exists).ok()
    .click(dragLimitBody.find('.dragLimitPreviewToggle label.switchbox'))
    .expect(areaPreview.exists).notOk()
    .click(dragLimitBody.find('.dragLimitPreviewToggle label.switchbox'))
    .expect(areaPreview.exists).ok()
    // the four sides only mean something together, so the switch drops all of
    // them - and an empty rectangle is the default, i.e. no property at all
    .click(dragLimitBody.find('.gridLimitToggle label.switchbox'))
    .expect(dragLimit()).eql('null')
    // and a widget that can be dragged anywhere has no area to draw
    .expect(areaPreview.exists).notOk();

  // nothing tells the editor whether an image is a hexagon, let alone which way
  // up, so both orientations are offered and the user picks one
  const gridBody = Selector('#editorModules .collapsibleHeader').withText('Snap grid').sibling('.collapsibleBody');
  const gridButton = gridBody.find('.gridActions button');
  await t
    .click(Selector('#editorModules .collapsibleHeader').withText('Snap grid'))
    .expect(gridButton.count).eql(3)
    .expect(gridButton.nth(0).textContent).contains('Square grid (91 × 91)')
    .expect(gridButton.nth(1).textContent).contains('Hex grid (flat top)')
    .expect(gridButton.nth(2).textContent).contains('Hex grid (pointy top)')
    // the two staggered grids of a pointy topped hexagon that is 91px across:
    // half a step further along on both axes, so the rows interlock
    .click(gridButton.nth(2))
    .expect(grid()).eql('[{"x":78.81,"y":136.5,"offsetX":39.405,"offsetY":68.25},{"x":78.81,"y":136.5,"offsetX":0,"offsetY":0}]')
    // and the flat topped one is its mirror image
    .click(gridBody.find('.gridEntry [icon=delete]').nth(1))
    .click(gridBody.find('.gridEntry [icon=delete]').nth(0))
    .click(gridButton.nth(1))
    .expect(grid()).eql('[{"x":136.5,"y":78.81,"offsetX":68.25,"offsetY":39.405},{"x":136.5,"y":78.81,"offsetX":0,"offsetY":0}]');

  // the area one grid applies in: the rectangle, plus conditions for an area
  // that is not one. The Conditions field sits right under the X/Y rows and
  // stores what the engine reads - one condition as a string, several as a list
  const conditionOutline = Selector('.gridConditionOutline');
  // every dot of one grid is one zero-length subpath of one path, so the marked
  // positions can be read back out of it and held against the conditions
  const conditionDots = ClientFunction(() => {
    const path = document.querySelector('.gridConditionDots .dotCore');
    const dots = path ? path.getAttribute('d').split('M ').slice(1).map(dot => dot.split(' ').map(Number)) : [];
    return { count: dots.length, outside: dots.filter(([ x, y ]) => !(y > x && x > 200)).length };
  });
  await t
    .click(gridBody.find('.gridEntry [icon=delete]').nth(1))
    .click(gridBody.find('.gridEntry [icon=delete]').nth(0))
    .click(gridButton.nth(0))
    .click(gridBody.find('.gridEntry .collapsibleHeader').withText('More options'))
    .expect(conditionOutline.exists).notOk()
    .click(gridBody.find('.gridLimitToggle label.switchbox'))
    .expect(grid()).eql('[{"x":91,"y":91,"minX":0,"minY":0,"maxX":1600,"maxY":1000}]')
    .typeText(gridBody.find('.gridLimits textarea'), 'y > x')
    .expect(grid()).eql('[{"x":91,"y":91,"minX":0,"minY":0,"maxX":1600,"maxY":1000,"condition":"y > x"}]')
    .typeText(gridBody.find('.gridLimits textarea'), '\nx > 200')
    .expect(grid()).eql('[{"x":91,"y":91,"minX":0,"minY":0,"maxX":1600,"maxY":1000,"condition":["y > x","x > 200"]}]')
    // the boundary of that area is traced onto the board in the same dashed
    // line the rectangle is outlined with
    .expect(conditionOutline.exists).ok()
    // and the dots are drawn one by one, so only the lattice points the widget
    // can be put on are marked rather than the whole rectangle
    .expect(Selector('.gridPreviewOverlay.ownDots').exists).ok()
    .expect(conditionDots()).eql({ count: 28, outside: 0 })
    // a line that is not a comparison is a number, and a number is true
    // wherever it is not 0 - so it is reported rather than left behind
    .typeText(gridBody.find('.gridLimits textarea'), 'x - 100', { replace: true })
    .expect(gridBody.find('.propertyInputProblem').withText('comparison').exists).ok()
    // and switching the area off drops the conditions with the four sides
    .typeText(gridBody.find('.gridLimits textarea'), 'y > x', { replace: true })
    .click(gridBody.find('.gridLimitToggle label.switchbox'))
    .expect(grid()).eql('[{"x":91,"y":91}]')
    .expect(conditionOutline.exists).notOk()
    .click(gridBody.find('.gridEntry [icon=delete]').nth(0));

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
  await t.resizeWindow(1280, 800);
  await setRoomState({
    deck:  { id: 'deck', type: 'deck', cardTypes: { a: {} }, faceTemplates: [ { objects: [] } ] },
    pile:  { id: 'pile', type: 'pile', x: 300, y: 200, width: 103, height: 160 },
    card1: { id: 'card1', type: 'card', deck: 'deck', cardType: 'a', parent: 'pile' },
    card2: { id: 'card2', type: 'card', deck: 'deck', cardType: 'a', parent: 'pile' }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  const pileTemplate = ClientFunction(() => JSON.stringify((widgets.get('deck').get('cardDefaults') || {}).onPileCreation || null));

  // the handle is the only part of a pile the cards do not cover
  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
    .click(Selector('#w_pile .handle'))
    .expect(Selector('.widgetHeaderType').innerText).contains('Pile')
    // a pile is temporary, so the panel says up front that it edits the
    // template of the cards' deck along with the pile
    .expect(Selector('.pileTemplateMode').innerText).contains('pile template');

  // the handle counts the cards unless it is told to show a text, so the two
  // are a choice and the text field only exists for the second one
  const handleShows = Selector('#editorModules .selectInput').withText('Handle shows').find('select');
  await t
    .expect(handleShows.value).eql('"count"')
    .expect(Selector('#editorModules .textInput input').filterVisible().count).eql(0)
    .click(handleShows)
    .click(handleShows.find('option').withText('A fixed text'))
    .typeText(Selector('#editorModules .textInput input').filterVisible(), 'chips', { replace: true })
    .expect(ClientFunction(() => widgets.get('pile').get('text'))()).eql('chips')
    // and the same edit landed in the pile template
    .expect(pileTemplate()).eql('{"text":"chips"}');

  // every fold-away block draws the same arrow, which points sideways while
  // the block is folded and down while it is open
  const cssArrow = Selector('#editorModules .collapsibleHeader').withText('CSS').find('.collapseArrow');
  await t.expect(cssArrow.hasClass('collapsed')).ok();

  // a css property is a block of one row per declaration. The handle colors are
  // written into handleCSS, not into css, so the pile has a block for each of
  // the two, each of them named by the property it edits.
  const cssTitles = Selector('#editorModules .cssEditor .propertyPickerSectionTitle');
  await t
    .click(Selector('#editorModules .collapsibleHeader').withText('CSS'))
    .expect(cssArrow.hasClass('collapsed')).notOk()
    .expect(cssTitles.nth(0).innerText).contains('css')
    .expect(cssTitles.nth(1).innerText).contains('handleCSS')
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
    .expect(ClientFunction(() => JSON.stringify(widgets.get('pile').get('css')))()).eql('{"opacity":"0.5"}')
    .expect(pileTemplate()).eql('{"text":"chips","css":{"opacity":"0.5"}}');

  // with the opt-out switch on, an edit stops at the pile in front of you
  await t
    .click(Selector('#editorModules .pileTemplateMode .switchbox[for]'))
    .expect(Selector('.pileTemplateMode').innerText).contains('this pile only')
    .typeText(Selector('#editorModules .textInput input').filterVisible(), 'stack', { replace: true })
    .expect(ClientFunction(() => widgets.get('pile').get('text'))()).eql('stack')
    .expect(pileTemplate()).eql('{"text":"chips","css":{"opacity":"0.5"}}');

  // a pile removes itself as soon as it holds a single card - the editor has to
  // drop it from the selection, or the next keystroke in one of its inputs
  // writes to a dead widget id and the server re-creates it as a ghost widget
  await ClientFunction(() => widgets.get('card2').set('parent', null))();
  await t
    .expect(ClientFunction(() => widgets.has('pile'))()).eql(false)
    .expect(Selector('#editorModules .widgetHeaderType').exists).notOk();
});

test("A pile's drop limit is set on the pile and lands in its template", async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    deck:  { id: 'deck', type: 'deck', cardTypes: { a: {} }, faceTemplates: [ { objects: [] } ] },
    pile:  { id: 'pile', type: 'pile', x: 300, y: 200, width: 103, height: 160 },
    card1: { id: 'card1', type: 'card', deck: 'deck', cardType: 'a', parent: 'pile' },
    card2: { id: 'card2', type: 'card', deck: 'deck', cardType: 'a', parent: 'pile' }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  const pileTemplate = ClientFunction(() => JSON.stringify((widgets.get('deck').get('cardDefaults') || {}).onPileCreation || null));
  const dropLimit = Selector('#editorModules .propertyInput').withText('Drop limit');
  const showLimit = Selector('#editorModules .checkboxInput').withText('Show the limit on the handle');
  const handle = Selector('#w_pile .handle');

  // a pile takes cards through its snap range instead of a dropTarget, so the
  // limit is offered in Behavior - and the handle display only once there is a
  // limit for it to show
  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
    .click(handle)
    .expect(dropLimit.visible).ok()
    .expect(showLimit.visible).notOk()
    .typeText(dropLimit.find('input[type=number]'), '3', { replace: true })
    .expect(handle.innerText).eql('2')
    .expect(showLimit.visible).ok()
    .click(showLimit.find('label.switchbox'))
    .expect(handle.innerText).eql('2/3')
    // a pile is temporary, so both land in the template new piles of these
    // cards are built from
    .expect(pileTemplate()).eql('{"dropLimit":3,"showLimit":true}');
});

test('A deck that overrides the pile template says so while the pile mirrors into it', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    deck:  { id: 'deck', type: 'deck', cardTypes: { a: { onPileCreation: { text: 'fixed' } } }, faceTemplates: [ { objects: [] } ] },
    pile:  { id: 'pile', type: 'pile', x: 300, y: 200, width: 103, height: 160 },
    card1: { id: 'card1', type: 'card', deck: 'deck', cardType: 'a', parent: 'pile' },
    card2: { id: 'card2', type: 'card', deck: 'deck', cardType: 'a', parent: 'pile' }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  // cardDefaults is the last place a card looks for onPileCreation, so a card
  // type that sets it wins over everything the mirroring writes there - the
  // warning has to be visible in the mode that does the mirroring, which is
  // also the default one
  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
    .click(Selector('#w_pile .handle'))
    .expect(Selector('.pileTemplateMode').innerText).contains('pile template')
    .expect(Selector('.pileTemplateMode .pileHelp.warning').innerText).contains('onPileCreation');
});

test('Loading another game with a widget still selected does not break the client', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    deck: { id: 'deck', type: 'deck', cardTypes: { a: {} }, faceTemplates: [ { objects: [] } ] },
    card: { id: 'card', type: 'card', deck: 'deck', cardType: 'a', x: 100, y: 100 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);
  await ClientFunction(() => {
    window.stateLoadErrors = [];
    window.addEventListener('error', event => window.stateLoadErrors.push(String(event.error || event.message)));
  })();

  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
    .click('#w_card')
    .expect(Selector('.widgetHeaderType').innerText).contains('Card');

  // the selection survives leaving edit mode, and a new state replaces every
  // widget in the room - so re-rendering the editor for the card would look up
  // a deck that is gone
  await t.click('#editorToolbar [icon=close]');
  await setRoomState({ other: { id: 'other', type: 'basic', x: 200, y: 200 } });

  await t
    .expect(Selector('#w_other').exists).ok()
    .expect(Selector('#w_card').exists).notOk()
    .expect(ClientFunction(() => window.stateLoadErrors)()).eql([])
    .expect(Selector('#editorModules .widgetHeaderType').exists).notOk();
});

test('Basic curates the stacking, scale and visibility switches, the scoreboard its seats', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    block: { id: 'block', type: 'basic', x: 100, y: 100 },
    seat1: { id: 'seat1', type: 'seat', x: 100, y: 400, index: 1 },
    seat2: { id: 'seat2', type: 'seat', x: 300, y: 400, index: 2 },
    board: { id: 'board', type: 'scoreboard', x: 600, y: 100 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  const value = ClientFunction((id, property) => JSON.stringify(widgets.get(id).get(property)));

  // where a widget ends up in the stacking order belongs to Position, and the
  // factor it is drawn at to Size
  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
    .click('#w_block')
    .click(Selector('#editorModules .collapsibleHeader').withText('Position'))
    .click('#inheritChildZ_block')
    .expect(value('block', 'inheritChildZ')).eql('true');

  const sizeBody = Selector('#editorModules .collapsibleHeader').withText('Size').sibling('.collapsibleBody');
  await t
    .click(Selector('#editorModules .collapsibleHeader').withText('Size'))
    .typeText(sizeBody.find('.numberOrTextInput input'), '2', { replace: true })
    .expect(value('block', 'scale')).eql('2')
    // the collapsed headers name what is set
    .expect(Selector('#editorModules .collapsibleHeader').withText('Size').find('.collapsibleSummary').innerText).contains('×2');

  // "display" is a switch the other way round: ticking it takes the widget out
  // of the room for the players
  await t
    .click(Selector('#editorModules .collapsibleHeader').withText('Interaction & display'))
    .click('#hidePlayerCursors_block')
    .expect(value('block', 'hidePlayerCursors')).eql('true')
    .expect(Selector('#display_block').checked).notOk()
    .click('#display_block')
    .expect(value('block', 'display')).eql('false');

  // the click sound sits next to the clickable switch; its picker offers the
  // bundled sound library, an upload and - what this types into - a plain path
  const soundInput = Selector('#editorModules .soundInput');
  await t
    .click(soundInput.find('.propertyPreviewButton'))
    .typeText(soundInput.find('.propertyPicker input'), '/i/audio/casino/card-shuffle.mp3')
    .pressKey('enter')
    .expect(value('block', 'clickSound')).eql('"/i/audio/casino/card-shuffle.mp3"')
    .expect(soundInput.find('.propertySoundName').innerText).eql('card-shuffle')
    .click(soundInput.find('.propertyPickerFooter button'))
    .expect(value('block', 'clickSound')).eql('null');

  // the seat block holds what a widget dragged onto this one is shown as
  await t
    .click(Selector('#editorModules .collapsibleHeader').withText("Widget's links"))
    .click(Selector('#editorModules button').withExactText('Add seat'))
    .click('#hoverInheritVisibleForSeat_block')
    .expect(value('block', 'hoverInheritVisibleForSeat')).eql('false');

  // a seat's "display" is the text it shows, so it never gets that switch
  await t
    .click('#w_seat1')
    .click(Selector('#editorModules .collapsibleHeader').withText('Interaction & display'))
    .expect(Selector('#hidePlayerCursors_seat1').exists).ok()
    .expect(Selector('#display_seat1').exists).notOk();

  // the scoreboard shows every seat unless it is given a list of them
  const seatsMode = Selector('#editorModules select.scoreboardSeatsMode');
  await t
    .click('#w_board')
    .expect(seatsMode.value).eql('all')
    .click(seatsMode)
    .click(seatsMode.find('option').withExactText('Chosen seats'))
    .expect(value('board', 'seats')).eql('["seat1","seat2"]')
    .typeText(Selector('#editorModules .seatReferenceInput').filterVisible(), 'seat1', { replace: true })
    .pressKey('tab')
    .expect(value('board', 'seats')).eql('"seat1"')
    // emptying the field means "chosen, nothing chosen" - the mode has its own
    // "All seats" entry, so it must not jump back to it behind the user's back
    .selectText(Selector('#editorModules .seatReferenceInput').filterVisible())
    .pressKey('delete tab')
    .expect(value('board', 'seats')).eql('[]')
    .expect(seatsMode.value).eql('pick')
    .typeText(Selector('#editorModules .seatReferenceInput').filterVisible(), 'seat1', { replace: true })
    .pressKey('tab')
    .expect(value('board', 'seats')).eql('"seat1"');

  // teams are the third shape of the same property: one column each, adding up
  // the seats given to it
  await t
    .click(seatsMode)
    .click(seatsMode.find('option').withExactText('Teams'))
    .expect(value('board', 'seats')).eql('{"Team 1":["seat1"]}')
    .click(Selector('#editorModules .scoreboardTeams button').withText(/add team/i))
    .expect(value('board', 'seats')).eql('{"Team 1":["seat1"],"Team 2":[]}');

  const secondRow = Selector('#editorModules .scoreboardTeamRow').nth(1);
  await t
    .typeText(secondRow.find('.scoreboardTeamName'), 'Reds', { replace: true })
    .pressKey('tab')
    // renaming keeps the team where it was, which is the order of the columns
    .expect(value('board', 'seats')).eql('{"Team 1":["seat1"],"Reds":[]}')
    .typeText(Selector('#editorModules .scoreboardTeamRow').nth(1).find('.scoreboardTeamSeats'), 'seat2', { replace: true })
    .pressKey('tab')
    .expect(value('board', 'seats')).eql('{"Team 1":["seat1"],"Reds":["seat2"]}')
    .expect(Selector('#w_board').innerText).contains('Reds');

  await t
    .click(Selector('#editorModules .scoreboardTeamRow').nth(1).find('button[icon=delete]'))
    .expect(value('board', 'seats')).eql('{"Team 1":["seat1"]}')
    // and back to every seat, which is the property being unset
    .click(seatsMode)
    .click(seatsMode.find('option').withExactText('All seats'))
    .expect(value('board', 'seats')).eql('null');
});

test('Create game using edit mode', async t => {
  console.log("USERAGENT: " + t.browser.userAgent);
  await t.resizeWindow(1280, 800);
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);
  await t
    .click('#editButton')
    // this one places widgets in the room, so it gets the whole room: close the
    // Edit Widgets module edit mode opens on
    .click('#editorSidebar [icon=tune]')
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
  await compareState(t, '6924f0c5e2ca0fe7a0e976dafcacecb6');
});

test('Deck editor: add card type, dynamic object, delete face, undo', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-empty-deck')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok();

  const getDeckID = ClientFunction(() => {
    let deckID = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deckID = w.get('id'); });
    return deckID;
  });
  const deckID = await getDeckID();
  const getCardTypes = ClientFunction(deckID => JSON.stringify(widgets.get(deckID).get('cardTypes')));

  const deckNode = Selector('#deckEditorTree .deckEditorTreeDeck');
  await t
    .click(`#w_${deckID}`) // selects the deck, showing the abbreviated Basic/Other properties panel
    .click('#propertiesOpenDeckEditor') // opens the full deck editor
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
  await compareState(t, '107a190b3e5bf5acb816e1655f165f88');
});

// Both the object form of the css property and the css of an html face object are put into a style element
// and scoped to the widget's id. Every preview card the editor renders is created without one, so they used
// to share that scope and the last preview rendered restyled all the others - a strip in which every card
// type wore the last one's colors. The room card with a space in its id covers the other half: an id that is
// not a valid class name made classList.add() throw, so that card rendered no html face objects at all.
test('Deck editor: every card type preview keeps its own css', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    deck: { id: 'deck', type: 'deck', x: 20, y: 20,
      cardDefaults: { width: 100, height: 150, css: { default: { 'border-color': '${PROPERTY tint}' } } },
      cardTypes: { red: { tint: '#ff0000' }, green: { tint: '#008000' }, blue: { tint: '#0000ff' } },
      faceTemplates: [ { objects: [] }, { objects: [ {
        type: 'html', x: 0, y: 0, width: 100, height: 150,
        value: '<div>tinted</div>', css: { body: { 'background-color': '${PROPERTY tint}' } }
      } ] } ]
    },
    'my card': { id: 'my card', type: 'card', deck: 'deck', cardType: 'green', x: 300, y: 20, activeFace: 1 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);

  const roomCardColor = ClientFunction(() => {
    const object = document.querySelector('#w_my_x0020_card .cardFace.active .cardFaceObject');
    return object && getComputedStyle(object).backgroundColor;
  });
  const stripColors = ClientFunction(() => {
    const colors = [];
    document.querySelectorAll('#deckEditorStrip .cardFace.active .cardFaceObject').forEach(o=>colors.push(getComputedStyle(o).backgroundColor));
    return colors;
  });
  const stripBorderColors = ClientFunction(() => {
    const colors = [];
    document.querySelectorAll('#deckEditorStrip .card').forEach(c=>colors.push(getComputedStyle(c).borderTopColor));
    return colors;
  });
  await t
    .expect(roomCardColor()).eql('rgb(0, 128, 0)', 'a card whose id is not a valid class name renders its html face object')
    .click('#editButton')
    .click('#w_deck')
    .click('#propertiesOpenDeckEditor')
    .expect(stripColors()).eql([ 'rgb(255, 0, 0)', 'rgb(0, 128, 0)', 'rgb(0, 0, 255)' ], 'each card type preview shows its own html face object tint')
    .expect(stripBorderColors()).eql([ 'rgb(255, 0, 0)', 'rgb(0, 128, 0)', 'rgb(0, 0, 255)' ], 'each card type preview shows its own css property tint')
    .pressKey('esc');
});

test('Deck editor: symbol pickers and JSON fallback', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-empty-deck')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok();

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
    // this picker shows images only, so a search that only a font icon answers has to say so instead of
    // showing the empty list ("10k" is a material symbol and matches nothing among the images)
    .typeText('#symbolPickerOverlay input', '10k')
    .expect(Selector('#symbolNoResults').visible).ok()
    .expect(Selector('#symbolList').visible).notOk()
    .selectText('#symbolPickerOverlay input')
    .pressKey('delete')
    .expect(Selector('#symbolNoResults').visible).notOk()
    // pin the icon instead of taking whichever comes first: that depends on the order of the
    // game-icons sections in symbols.json, so recategorising them would change the state hash
    .click(Selector('#symbolList .gameicons[data-symbol="viscious-speed/abstract-001"]'))
    .expect(getObjectTypeCounts(deckID)).eql({ image: 3, icon: 0 })
    .click('#deckEditorAddIcon')
    .expect(Selector('#symbolPickerOverlay').visible).ok()
    // the same search in the unrestricted picker does find its one match
    .typeText('#symbolPickerOverlay input', '10k')
    .expect(Selector('#symbolNoResults').visible).notOk()
    .expect(Selector('#symbolList i:not(.hidden)').count).eql(1)
    .selectText('#symbolPickerOverlay input')
    .pressKey('delete')
    .click(Selector('#symbolList .material-symbols').nth(0))
    .expect(getObjectTypeCounts(deckID)).eql({ image: 3, icon: 1 });

  await t
    .click('#editorSidebar [icon=data_object]')
    .expect(getJSONText()).contains(deckID)
    .click('#editorSidebar [icon=data_object]')
    .pressKey('esc')
    .pressKey('esc');
  await compareState(t, '8fb79df2e3ed3c8d8ecfdea4f04fd31d');
});

test('The symbol picker says an image-only search found nothing', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    // the "Pick a symbol" button only shows up while the text is in symbol mode, which the class decides
    w: { id: 'w', type: 'basic', x: 200, y: 200, text: 'home', classes: 'material-symbols' }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  // that picker offers the font icons only, so a search that only an image answers ("abbot" is a
  // game-icon) leaves the list empty and has to explain that rather than show a blank card
  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
    .click('#w_w')
    .click(Selector('#editorModuleTopLeft button[icon=emoji_symbols]'))
    .expect(Selector('#symbolPickerOverlay').visible).ok()
    .typeText('#symbolPickerOverlay input', 'abbot')
    .expect(Selector('#symbolNoResults').visible).ok()
    .expect(Selector('#symbolNoResults').innerText).contains('abbot')
    .expect(Selector('#symbolList').visible).notOk()
    .typeText('#symbolPickerOverlay input', '10k', { replace: true })
    .expect(Selector('#symbolNoResults').visible).notOk()
    .expect(Selector('#symbolList .material-symbols').filterVisible().count).eql(1)
    .click('#symbolPickerOverlay [icon=close]')
    .expect(Selector('#symbolPickerOverlay').visible).notOk();
  await setEditorState(null);
});

test('Deck editor: breadcrumb undo and redo', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-empty-deck')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok();

  const getDeckID = ClientFunction(() => {
    let deckID = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deckID = w.get('id'); });
    return deckID;
  });
  const deckID = await getDeckID();

  const editTextAndUndoImmediately = ClientFunction(() => {
    const rows = document.querySelectorAll('#deckEditorSidebar .deckEditorObjectProperties .genericInput');
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
    .click(`#w_${deckID}`) // selects the deck, showing the abbreviated Basic/Other properties panel
    .click('#propertiesOpenDeckEditor') // opens the full deck editor
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
  await compareState(t, '080564aa3d452a551711d5913083c057');
});

test('Deck editor: remote update preserves an unrelated pending edit', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-empty-deck')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok();

  const getDeckID = ClientFunction(() => {
    let deckID = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deckID = w.get('id'); });
    return deckID;
  });
  const deckID = await getDeckID();
  const editAndReceiveRemoteChange = ClientFunction(deckID => {
    const rows = document.querySelectorAll('#deckEditorSidebar .deckEditorObjectProperties .genericInput');
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
    .click(`#w_${deckID}`) // selects the deck, showing the abbreviated Basic/Other properties panel
    .click('#propertiesOpenDeckEditor') // opens the full deck editor
    .click('#deckEditorStripAdd')
    .click(deckNode)
    .click('#deckEditorTreeAdd')
    .click('#deckEditorTreeAdd')
    .click('#deckEditorAddText');
  await editAndReceiveRemoteChange(deckID);
  await t
    .expect(getEditedValues(deckID)).eql({ text: 'Pending local edit', receivedProperty: 'Remote value' })
    .pressKey('esc');
  await compareState(t, '5d0b5d0effa672e633b9d5eff677561a');
});

// Two different fields edited within one debounce window, then a structural action right after, must stay
// three separate undo steps: undoing the added face must not revert the typed edits, and undoing once more
// must revert only the second field.
test('Deck editor: rapid cross-field edits stay separate undo steps', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-empty-deck')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok();

  const getDeckID = ClientFunction(() => {
    let deckID = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deckID = w.get('id'); });
    return deckID;
  });
  const deckID = await getDeckID();

  const rapidEditsThenAddFace = ClientFunction(() => new Promise(resolve => {
    const setField = (label, value) => {
      const rows = document.querySelectorAll('#deckEditorSidebar .deckEditorObjectProperties .genericInput');
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
    .click(`#w_${deckID}`) // selects the deck, showing the abbreviated Basic/Other properties panel
    .click('#propertiesOpenDeckEditor') // opens the full deck editor
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
  await compareState(t, '3b98bcdea7d0726315cb85533bdd870e');
});

// Regression test for the crash reported on switching games while a deck was being edited (the previously
// selected deck/card no longer exists when the new state arrives). TestCafe fails the test on any uncaught
// client error, so simply performing the switch guards against the crash coming back.
test('Deck editor: switching games while editing does not crash', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-empty-deck')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok();

  const getDeckID = ClientFunction(() => {
    let deckID = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deckID = w.get('id'); });
    return deckID;
  });
  const deckID = await getDeckID();

  await t
    .click(`#w_${deckID}`) // selects the deck, showing the abbreviated Basic/Other properties panel
    .click('#propertiesOpenDeckEditor') // opens the full deck editor
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
  await t.resizeWindow(1280, 800);
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setEditorState(null);
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
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
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
  await t.expect(Selector('#deckEditorClose').exists).ok(); // the Close button next to Card view

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

  // close via the Close button next to Card view -> the toolbar button must deactivate too
  await t.click('#editorToolbar [icon=style]');
  await t.expect(Selector('body').hasClass('deckEditorActive')).ok();
  await t.click('#deckEditorClose');
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

test('Deck editor: a css property is edited as declaration rows in every scope', async t => {
  await setRoomState({
    d1: {
      id: 'd1', type: 'deck',
      cardDefaults: { width: 103, height: 160, css: 'color: red; font-weight: bold' },
      cardTypes: { a: { css: { background: '#ffcc00' } } },
      faceTemplates: [ { css: { border: '2px solid green' }, objects: [
        { type: 'text', x: 5, y: 5, width: 90, height: 30, fontSize: 16, value: 'hi', css: 'font-style: italic' },
        { type: 'text', x: 5, y: 45, width: 90, height: 30, fontSize: 16, value: 'ho', css: 'font-style: italic' }
      ] } ]
    },
    c1: { id: 'c1', type: 'card', deck: 'd1', cardType: 'a', x: 300, y: 100 }
  });
  await ClientFunction(prepareClient)();
  await setName(t);

  const deckProperty = ClientFunction(property => JSON.stringify(widgets.get('d1').get(property)));
  const tab = id => Selector(`#deckEditorTab_${id}`);
  const cssProperty = Selector('#deckEditorSidebar .deckEditorCssProperty');
  const cssText = cssProperty.find('input.cssRowText');
  const openList = Selector('#deckEditorSidebar .deckEditorCssPickerButton');
  const rows = Selector('#deckEditorSidebar .deckEditorCssProperty .cssDeclarationRow');
  const names = Selector('#deckEditorSidebar .deckEditorCssProperty .cssDeclarationName');
  const values = Selector('#deckEditorSidebar .deckEditorCssProperty .cssDeclarationValue');
  const addClassRow = Selector('#deckEditorSidebar .deckEditorCssProperty input').withAttribute('placeholder', /new class/);
  const objectRow = Selector('#deckEditorTree .deckEditorObjectRow');
  const objectsWithCss = ClientFunction(text => widgets.get('d1').get('faceTemplates')[0].objects.filter(object=>String(object.css).indexOf(text) != -1).length);

  await t
    .click('#editButton')
    .click('#editorToolbar [icon=style]')
    .click(tab('defaults'))
    // a css property is a text row like every other property of the sidebar...
    .expect(cssText.value).eql('color: red; font-weight: bold')
    // ...with the declaration rows of the Edit Widgets tab behind its button. The card defaults become
    // properties of every card, so their css is a widget css: it has the class/selector sections that tab
    // offers, and the string form stays a string
    .click(openList)
    .expect(rows.count).eql(2)
    .expect(names.nth(0).value).eql('color')
    .expect(addClassRow.exists).ok()
    .typeText(values.nth(0), 'blue', { replace: true })
    .expect(deckProperty('cardDefaults')).contains('color: blue; font-weight: bold;');

  // the face template's own css styles the face div itself, which the engine writes into a style
  // attribute - so no class/selector sections there
  await t
    .click(tab('face'))
    .click(openList)
    .expect(rows.count).eql(1)
    .expect(names.nth(0).value).eql('border')
    .expect(addClassRow.exists).notOk()
    .typeText(values.nth(0), '3px solid blue', { replace: true })
    .expect(deckProperty('faceTemplates')).contains('"css":{"border":"3px solid blue"}')
    // the row follows what the list writes
    .expect(cssText.value).eql('border: 3px solid blue;');

  // a declaration switched off leaves the deck without losing its place in the list
  await t
    .click(tab('cardType'))
    .click(openList)
    .expect(rows.count).eql(1)
    .click(Selector('#deckEditorSidebar .cssDeclarationToggle').nth(0))
    .expect(deckProperty('cardTypes')).eql('{"a":{}}')
    .click(Selector('#deckEditorSidebar .cssDeclarationToggle').nth(0))
    .expect(deckProperty('cardTypes')).eql('{"a":{"css":{"background":"#ffcc00"}}}');

  // several face objects that agree on their css get one set of declaration rows, editing all of them at once
  await t
    .click(objectRow.nth(0))
    .click(objectRow.nth(1), { modifiers: { ctrl: true } })
    .click(tab('object'))
    .click(openList)
    .expect(rows.count).eql(1)
    .expect(names.nth(0).value).eql('font-style')
    .typeText(values.nth(0), 'oblique', { replace: true })
    .expect(objectsWithCss('oblique')).eql(2);

  // typing into the row itself is the same edit as filling in the rows
  await t
    .click(objectRow.nth(0))
    .click(tab('object'))
    .typeText(cssText, 'font-weight: bold', { replace: true })
    // a css written as a string stays a string, like the rows keep it
    .expect(deckProperty('faceTemplates')).contains('"css":"font-weight: bold')
    .click(openList)
    .expect(rows.count).eql(1)
    .expect(names.nth(0).value).eql('font-weight')
    .click(Selector('#deckEditorSidebar .deckEditorCssProperty .cssDeclarationRow button[icon=delete]'))
    // the last declaration removed is no css property at all, rather than an empty one
    .expect(objectsWithCss('font-weight')).eql(0);

  // ...but declarations can only be edited from a shared starting point, so once the selected objects
  // disagree the css falls back to the plain "(mixed)" row every other property has
  await t
    .click(objectRow.nth(1), { modifiers: { ctrl: true } })
    .expect(Selector('#deckEditorTree .deckEditorObjectRow.selected').count).eql(2)
    .expect(cssProperty.exists).notOk()
    .expect(Selector('#deckEditorSidebar .deckEditorObjectProperties input').withAttribute('placeholder', '(mixed)').exists).ok();
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

// The public library's deck browser is opened from the "Add New Deck" dialog, which hides itself while the
// browser is up. The browser is moved into #editor for that (see DeckEditor.initializeDOM), where it needs a
// box and a stacking order of its own - without them the deck editor paints over it and not a single deck can
// be seen or clicked.
test('Deck editor: the public library deck browser opens above the deck editor', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar [icon=style]') // opens the (empty) deck editor
    .click('#deckEditorAddDeck')
    .click('#deckEditorNewDeckGroupExisting .deckEditorNewDeckGroupHeader') // open the "Use an existing deck" section
    .click('#deckEditorNewDeckOverlay input[value=library]')
    .click('#deckEditorNewDeckPanel button[icon=style]') // "Browse the public library"
    // the deck catalog is built on the server the first time it is asked for, which takes a moment
    .expect(Selector('.libraryDeckEntry').exists).ok({ timeout: 120000 });

  // a deck is only pickable when a click at its own position actually reaches it
  const firstEntryIsOnTop = ClientFunction(() => {
    const entry = document.querySelector('.libraryDeckEntry');
    const rect = entry.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width/2, rect.y + rect.height/2);
    return !!(hit && hit.closest('.libraryDeckEntry'));
  });
  await t.expect(firstEntryIsOnTop()).ok();

  // and closing it without picking one comes back to the dialog it was opened from, still on that section
  await t
    .click('#libraryDecksClose')
    .expect(Selector('#deckEditorNewDeckOverlay').visible).ok()
    .expect(Selector('#libraryDecksOverlay').visible).notOk()
    .expect(Selector('#deckEditorNewDeckGroupExisting').hasClass('deckEditorNewDeckGroupOpen')).ok();
});

// The same browser is opened from plain edit mode's add widget overlay, where it used to be scaled with the
// board: on anything but a full size board that made the filter field, the sort control and every deck name
// render at a fraction of their size. It gets the editor's box in both places now.
test('Edit mode: the public library deck browser is not scaled with the board', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#browseLibraryDecks')
    // the deck catalog is built on the server the first time it is asked for, which takes a moment
    .expect(Selector('.libraryDeckEntry').exists).ok({ timeout: 120000 });

  const overlay = await ClientFunction(() => {
    const o = document.querySelector('#libraryDecksOverlay');
    const box = o.getBoundingClientRect();
    const entry = document.querySelector('.libraryDeckEntry').getBoundingClientRect();
    const hit = document.elementFromPoint(entry.x + entry.width/2, entry.y + entry.height/2);
    return {
      transform: getComputedStyle(o).transform,
      width: Math.round(box.width),
      windowWidth: window.innerWidth,
      clickable: !!(hit && hit.closest('.libraryDeckEntry'))
    };
  })();

  await t.expect(overlay.transform).eql('none');
  // the box is the window minus the edit sidebar, not the board scaled into it
  await t.expect(overlay.width).gte(overlay.windowWidth - 140);
  await t.expect(overlay.clickable).ok();
});

// Sorting the deck browser by stars or by play time can only do something on a server that has counted any:
// both are per-server statistics, and a fresh server (a test server, a private installation - or this test)
// has none at all, so every game ties at zero and the list stays in the order by name. Without a word about
// that the sort control looks broken, which is exactly how it was reported.
test('Edit mode: the deck browser says when a sort has nothing to sort by', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#browseLibraryDecks')
    // the deck catalog is built on the server the first time it is asked for, which takes a moment
    .expect(Selector('.libraryDeckEntry').exists).ok({ timeout: 120000 });

  const sort = Selector('#libraryDecksSort');
  const hint = Selector('#libraryDecksSortHint');
  const pick = async value => t.click(sort).click(sort.find('option').withAttribute('value', value));

  // sorting by name is the order the list is in anyway, so there is nothing to say
  await t.expect(hint.innerText).eql('');
  await pick('stars');
  await t.expect(hint.innerText).contains('No game on this server has been starred yet');
  await pick('popularity');
  await t.expect(hint.innerText).contains('No game on this server has been played yet');
  await pick('name');
  await t.expect(hint.innerText).eql('');
});

// The tiled counterpart of the front/back pairs above: one picture holding a grid of fronts and a second one
// holding the backs in the same grid, so every card gets the back sitting in its own cell.
test('Deck editor: a sheet of fronts with a matching sheet of backs in the new deck wizard', async t => {
  const asset = (fileName, width, height)=>`data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><title>${fileName}</title></svg>`).toString('base64')}`;
  const fronts = asset('fronts.png', 1500, 400); // 5 x 2 cards of 300 x 200 each
  const backs  = asset('backs.png', 750, 200);   // the same grid at half the resolution

  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar [icon=style]') // opens the (empty) deck editor
    .click('#deckEditorAddDeck')
    .click('#deckEditorNewDeckGroupCustom .deckEditorNewDeckGroupHeader') // open the "Create a custom deck" section
    .click('#deckEditorNewDeckOverlay input[value=imageSheet]');

  // as in the tests above: the file picker can't be driven from a test, so uploadAsset hands the wizard the
  // asset path the server would have returned
  const stubUploadOf = ClientFunction((fileName, imagePath) => {
    window.uploadAsset = callback => callback(imagePath, fileName);
  });
  const setGrid = ClientFunction((columns, rows) => {
    for(const [ selector, value ] of [ [ '.cols', columns ], [ '.rows', rows ] ]) {
      const input = document.querySelector(`.cardFrontPreview ${selector} [type=number]`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  const addButton = Selector('#deckEditorNewDeckPanel .goButton [icon=add]');
  const status = Selector('.imagePairStatus');

  await stubUploadOf('fronts.png', fronts);
  await t.click('#deckEditorNewDeckPanel #frontsButton');
  // a sheet still set to its 1 x 1 default is not cut at all, which is the other mode - so the wizard asks
  // for the grid instead of offering to make one stretched card out of the whole sheet
  await t
    .expect(status.innerText).contains('Say how many cards this sheet holds across and down')
    .expect(addButton.hasAttribute('disabled')).ok();
  await setGrid(5, 2);
  await t.expect(Selector('.cardFrontPreviewSummary').nth(0).innerText).contains('10 cards of 300 × 200 pixels, 160 × 107 on the table');

  // and a sheet every card of which is asked for zero times would add an empty deck
  const setCopies = ClientFunction(copies => {
    const input = document.querySelector('.cardFrontPreview .cards [type=number]');
    input.value = copies;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await setCopies(0);
  await t
    .expect(status.innerText).contains('nothing would be added')
    .expect(addButton.hasAttribute('disabled')).ok();
  await setCopies(1);
  await t.expect(addButton.hasAttribute('disabled')).notOk();

  // asking for a sheet of backs blocks the import until that sheet is there
  await t
    .click('input[name=deckImagesBackMode][value=sheet]')
    .expect(status.innerText).contains('1 sheet of fronts but 0 of backs')
    .expect(addButton.hasAttribute('disabled')).ok();

  await stubUploadOf('backs.png', backs);
  await t
    .click('#deckEditorNewDeckPanel #backSheetButton')
    .expect(status.innerText).contains('each with its own back from the sheet in the same position')
    .expect(addButton.hasAttribute('disabled')).notOk()
    .click(addButton)
    .expect(Selector('#deckEditorStrip .deckEditorStripCard').count).eql(10); // the wizard's deck is now open

  const deck = await ClientFunction(() => {
    let deck = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deck = w; });
    const cardTypes = deck.get('cardTypes');
    return {
      cardDefaults: deck.get('cardDefaults'),
      backFace: deck.get('faceTemplates')[0].objects,
      lastOfFirstRow: cardTypes[Object.keys(cardTypes)[4]]
    };
  })();

  // the cards have the shape of one cell of the sheet, not the deck default
  await t.expect(deck.cardDefaults.width).eql(160);
  await t.expect(deck.cardDefaults.height).eql(107);
  // both sheets are read with the same offsets, so a card's back is the cell its front came from
  await t.expect(deck.lastOfFirstRow).eql({
    image: fronts,
    offsetX: 4,
    offsetY: 0,
    deckWidth: 5,
    deckHeight: 2,
    backImage: backs
  });
  // and the back face has exactly one object - the card's own back, cut out of the sheet of backs
  await t.expect(deck.backFace.length).eql(1);
  await t.expect(deck.backFace[0].dynamicProperties.value).eql('backImage');
  await t.expect(deck.backFace[0].css['background-position']).contains('--offsetX');
});

// A sheet of fronts and a sheet of backs belong together by position, so deleting a sheet of fronts has to
// take its sheet of backs with it. Without that, every later sheet of backs moves onto the wrong fronts and
// the wizard happily builds a deck whose cards all show the back of a sheet the user deleted.
test('Deck editor: deleting a sheet of fronts deletes the sheet of backs paired with it', async t => {
  const asset = (title, width, height)=>`data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><title>${title}</title></svg>`).toString('base64')}`;
  const fronts1 = asset('fronts1', 400, 400); // two 2 x 2 sheets of fronts...
  const fronts2 = asset('fronts2', 400, 400);
  const backs1  = asset('backs1',  400, 400); // ...and a sheet of backs for each of them
  const backs2  = asset('backs2',  400, 400);

  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar [icon=style]') // opens the (empty) deck editor
    .click('#deckEditorAddDeck')
    .click('#deckEditorNewDeckGroupCustom .deckEditorNewDeckGroupHeader') // open the "Create a custom deck" section
    .click('#deckEditorNewDeckOverlay input[value=imageSheet]');

  const stubUploadOf = ClientFunction((fileName, imagePath) => {
    window.uploadAsset = callback => callback(imagePath, fileName);
  });
  const setSheet = ClientFunction((index, columns, rows) => {
    const preview = document.querySelectorAll('.cardFrontPreview:not(.cardBackSheetPreview)')[index];
    for(const [ selector, value ] of [ [ '.cols', columns ], [ '.rows', rows ] ]) {
      const input = preview.querySelector(`${selector} [type=number]`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  const frontSheets = Selector('.cardFrontPreview:not(.cardBackSheetPreview)');
  const backSheets = Selector('.cardBackSheetPreview');
  const status = Selector('.imagePairStatus');

  await stubUploadOf('fronts1.png', fronts1);
  await t.click('#deckEditorNewDeckPanel #frontsButton');
  await setSheet(0, 2, 2);
  await stubUploadOf('fronts2.png', fronts2);
  await t.click('#deckEditorNewDeckPanel #frontsButton');
  await setSheet(1, 2, 2);

  await t.click('input[name=deckImagesBackMode][value=sheet]');
  await stubUploadOf('backs1.png', backs1);
  await t.click('#deckEditorNewDeckPanel #backSheetButton');
  await stubUploadOf('backs2.png', backs2);
  await t.click('#deckEditorNewDeckPanel #backSheetButton');

  await t
    .expect(backSheets.count).eql(2)
    .expect(backSheets.nth(0).find('.cardFrontPreviewSummary').innerText).contains('Backs for "fronts1.png"')
    .expect(backSheets.nth(1).find('.cardFrontPreviewSummary').innerText).contains('Backs for "fronts2.png"')
    .expect(status.innerText).contains('8 cards, each with its own back from the sheet in the same position');

  // deleting the first sheet of fronts leaves the second one - with its own sheet of backs, not with the one
  // that belonged to the deleted sheet
  await t
    .click(frontSheets.nth(0).find('[icon=delete]'))
    .expect(frontSheets.count).eql(1)
    .expect(backSheets.count).eql(1)
    .expect(backSheets.nth(0).find('.cardFrontPreviewSummary').innerText).contains('Backs for "fronts2.png"')
    .expect(status.innerText).contains('4 cards, each with its own back from the sheet in the same position')
    .click('#deckEditorNewDeckPanel .goButton [icon=add]')
    .expect(Selector('#deckEditorStrip .deckEditorStripCard').count).eql(4); // the wizard's deck is now open

  const deck = await ClientFunction(() => {
    let deck = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deck = w; });
    const cardTypes = deck.get('cardTypes');
    return {
      names: Object.keys(cardTypes),
      images: Object.values(cardTypes).map(c=>c.image),
      backImages: Object.values(cardTypes).map(c=>c.backImage)
    };
  })();

  // the deck is made of the sheet that is left, and every card shows the back sitting in its own cell of the
  // sheet of backs that came with it - not of the one the deleted sheet of fronts owned
  await t.expect(deck.names).eql([ 'fronts2.png 1,1', 'fronts2.png 1,2', 'fronts2.png 2,1', 'fronts2.png 2,2' ]);
  await t.expect(deck.images).eql(Array(4).fill(fronts2));
  await t.expect(deck.backImages).eql(Array(4).fill(backs2));
});

// A card is sized after the picture it shows, and one import can hold pictures of different shapes: the first
// upload sets the deck's card defaults and every card type from a differently shaped upload carries its own
// size, so a portrait sheet uploaded after a landscape one is not squashed into the landscape shape.
test('Deck editor: sheets of different card shapes each keep their own card size', async t => {
  const asset = (fileName, width, height)=>`data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><title>${fileName}</title></svg>`).toString('base64')}`;
  const landscape = asset('landscape.png', 1500, 400); // 5 x 2 cards of 300 x 200 each
  const portrait  = asset('portrait.png',   400, 1200); // 2 x 4 cards of 200 x 300 each

  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar [icon=style]') // opens the (empty) deck editor
    .click('#deckEditorAddDeck')
    .click('#deckEditorNewDeckGroupCustom .deckEditorNewDeckGroupHeader') // open the "Create a custom deck" section
    .click('#deckEditorNewDeckOverlay input[value=imageSheet]');

  const stubUploadOf = ClientFunction((fileName, imagePath) => {
    window.uploadAsset = callback => callback(imagePath, fileName);
  });
  const setSheet = ClientFunction((index, columns, rows, copies) => {
    const preview = document.querySelectorAll('.cardFrontPreview')[index];
    for(const [ selector, value ] of [ [ '.cols', columns ], [ '.rows', rows ], [ '.cards', copies ] ]) {
      const input = preview.querySelector(`${selector} [type=number]`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  await stubUploadOf('landscape.png', landscape);
  await t.click('#deckEditorNewDeckPanel #frontsButton');
  await setSheet(0, 5, 2, 2);
  await stubUploadOf('portrait.png', portrait);
  await t.click('#deckEditorNewDeckPanel #frontsButton');
  await setSheet(1, 2, 4, 1);

  // each sheet says what its own cards will look like, and the status line counts the copies of both
  await t
    .expect(Selector('.cardFrontPreviewSummary').nth(0).innerText).contains('10 cards of 300 × 200 pixels, 160 × 107 on the table, 2 copies each — 20 cards in total')
    .expect(Selector('.cardFrontPreviewSummary').nth(1).innerText).contains('8 cards of 200 × 300 pixels, 107 × 160 on the table')
    .expect(Selector('.imagePairStatus').innerText).contains('28 cards')
    .click('#deckEditorNewDeckPanel .goButton [icon=add]')
    .expect(Selector('#deckEditorStrip .deckEditorStripCard').count).eql(18); // the wizard's deck is now open

  const deck = await ClientFunction(() => {
    let deck = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deck = w; });
    const cardTypes = deck.get('cardTypes');
    const sizeOfCardFrom = sheet => {
      let card = null;
      widgets.forEach(w => { if(w.get('type') == 'card' && !card && w.get('cardType').indexOf(sheet) == 0) card = w; });
      return [ card.get('width'), card.get('height') ];
    };
    return {
      cardDefaults: deck.get('cardDefaults'),
      fromLandscape: cardTypes['landscape.png 1,1'],
      fromPortrait: cardTypes['portrait.png 1,1'],
      landscapeCard: sizeOfCardFrom('landscape.png'),
      portraitCard: sizeOfCardFrom('portrait.png')
    };
  })();

  // the first sheet sizes the deck, so its own card types say nothing about their size
  await t.expect(deck.cardDefaults.width).eql(160);
  await t.expect(deck.cardDefaults.height).eql(107);
  await t.expect(deck.fromLandscape.width).eql(undefined);
  await t.expect(deck.fromLandscape.height).eql(undefined);
  // the second one is a different shape and carries it - all the way to the card on the table
  await t.expect(deck.fromPortrait.width).eql(107);
  await t.expect(deck.fromPortrait.height).eql(160);
  await t.expect(deck.landscapeCard).eql([ 160, 107 ]);
  await t.expect(deck.portraitCard).eql([ 107, 160 ]);
});

// Card type names start from the file name of the upload they come from, and one import can hold two files
// of the same name (the same file twice, or two files of that name from different folders) - the second
// upload must not overwrite the card types of the first one.
test('Deck editor: two uploads with the same file name keep their own cards', async t => {
  const asset = (title, width, height)=>`data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><title>${title}</title></svg>`).toString('base64')}`;
  const first  = asset('first',  400, 400); // both are 2 x 2 sheets of 200 x 200 cards...
  const second = asset('second', 400, 400); // ...uploaded under the same file name

  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  await t
    .click('#editButton')
    .click('#editorToolbar [icon=style]') // opens the (empty) deck editor
    .click('#deckEditorAddDeck')
    .click('#deckEditorNewDeckGroupCustom .deckEditorNewDeckGroupHeader') // open the "Create a custom deck" section
    .click('#deckEditorNewDeckOverlay input[value=imageSheet]');

  const stubUploadOf = ClientFunction((fileName, imagePath) => {
    window.uploadAsset = callback => callback(imagePath, fileName);
  });
  const setGrid = ClientFunction((index, columns, rows) => {
    const preview = document.querySelectorAll('.cardFrontPreview')[index];
    for(const [ selector, value ] of [ [ '.cols', columns ], [ '.rows', rows ] ]) {
      const input = preview.querySelector(`${selector} [type=number]`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  await stubUploadOf('sheet.png', first);
  await t.click('#deckEditorNewDeckPanel #frontsButton');
  await setGrid(0, 2, 2);
  await stubUploadOf('sheet.png', second);
  await t.click('#deckEditorNewDeckPanel #frontsButton');
  await setGrid(1, 2, 2);

  await t
    .expect(Selector('.imagePairStatus').innerText).contains('8 cards')
    .click('#deckEditorNewDeckPanel .goButton [icon=add]')
    // the status line promised eight cards, so eight of them have to be there
    .expect(Selector('#deckEditorStrip .deckEditorStripCard').count).eql(8);

  const deck = await ClientFunction(() => {
    let deck = null;
    widgets.forEach(w => { if(w.get('type') == 'deck') deck = w; });
    const cardTypes = deck.get('cardTypes');
    return { names: Object.keys(cardTypes), images: Object.values(cardTypes).map(c => c.image) };
  })();

  // the second upload is named apart instead of writing over the card types of the first one
  await t.expect(deck.names.length).eql(8);
  await t.expect(deck.names).contains('sheet.png 1,1');
  await t.expect(deck.names).contains('sheet.png (2) 1,1');
  await t.expect(deck.images.filter(image => image == first).length).eql(4);
  await t.expect(deck.images.filter(image => image == second).length).eql(4);
});

// A deck opens in the card-defaults view, which shows an explanation instead of a card - but the tree's object
// previews are clones of the rendered card, so they came out empty there and only filled in once a face was
// selected. They are cloned from an off-screen card now, and a card cut out of a sheet shows its own cell
// rather than the whole sheet (the object's tiling CSS instead of a plain "contain" refit).
test('Deck editor: the tree previews show the card art before a face is selected', async t => {
  const sheet = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="107"><title>sheet</title></svg>').toString('base64')}`;
  const tiling = {
    'background-size': 'calc(var(--width) * var(--deckWidth) * 1px) calc(var(--height) * var(--deckHeight) * 1px)',
    'background-position': 'calc(var(--width) * var(--offsetX) * -1px) calc(var(--height) * var(--offsetY) * -1px)'
  };

  await setRoomState({
    deck: {
      id: 'deck', type: 'deck',
      cardDefaults: { width: 160, height: 107, css: {
        '--offsetX': '${PROPERTY offsetX}', '--offsetY': '${PROPERTY offsetY}',
        '--deckWidth': '${PROPERTY deckWidth}', '--deckHeight': '${PROPERTY deckHeight}',
        '--width': '${PROPERTY width}', '--height': '${PROPERTY height}'
      } },
      cardTypes: {
        'sheet.png 1,1': { image: sheet, offsetX: 0, offsetY: 0, deckWidth: 2, deckHeight: 1 },
        'sheet.png 2,1': { image: sheet, offsetX: 1, offsetY: 0, deckWidth: 2, deckHeight: 1 }
      },
      faceTemplates: [
        { objects: [ { type: 'image', color: 'transparent', value: '/i/cards-default/2B.svg', dynamicProperties: { height: 'height', width: 'width' } } ] },
        { objects: [ { type: 'image', color: 'transparent', dynamicProperties: { value: 'image', height: 'height', width: 'width' }, css: tiling } ] }
      ]
    },
    card: { id: 'card', type: 'card', deck: 'deck', cardType: 'sheet.png 2,1', x: 100, y: 100 }
  });
  await ClientFunction(prepareClient)();
  await setName(t);

  const treePreview = ClientFunction(() => {
    const box = document.querySelector('#deckEditorTree .deckEditorObjectRow .deckEditorObjectPreview');
    const node = box && box.querySelector('.cardFaceObject');
    const style = node && getComputedStyle(node);
    return {
      cardRendered: !!document.querySelector('#deckEditorMain .cardFace'),
      hasImage: !!style && style.backgroundImage.indexOf('data:image/svg') != -1,
      backgroundSize: style ? style.backgroundSize : '',
      backgroundPosition: style ? style.backgroundPosition : ''
    };
  });

  await t.click('#editButton').click('#editorToolbar [icon=style]');

  // No card on screen, but the front face's object still shows the picture, cut to the cell of the card type
  // the deck opens on: the sheet is drawn at twice the card's width, with its first cell in view.
  await t.expect(treePreview()).eql({
    cardRendered: false,
    hasImage: true,
    backgroundSize: '320px 107px',
    backgroundPosition: '0px 0px'
  });

  // and selecting the face - which does render the card - shows exactly the same thing
  await t.click(Selector('#deckEditorTree .deckEditorTreeFace').nth(1));
  await t.expect(treePreview()).eql({
    cardRendered: true,
    hasImage: true,
    backgroundSize: '320px 107px',
    backgroundPosition: '0px 0px'
  });

  // the second card type is the other half of the same sheet, so its preview is shifted by one card
  await t.click(Selector('#deckEditorStrip .deckEditorStripCard').nth(1));
  await t.expect(treePreview()).eql({
    cardRendered: true,
    hasImage: true,
    backgroundSize: '320px 107px',
    backgroundPosition: '-160px 0px'
  });
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

// A rank list is empty while it is being retyped: the design gallery has no card to show then and must say so
// instead of rendering a card without a card type (which throws and leaves the Add button as it was).
test('Deck editor: the custom deck wizard survives an empty rank list', async t => {
  await t.resizeWindow(1280, 900);
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setName(t);

  // typed into the shared ranks field, which "Same ranks for each suit" copies to every suit
  const setSharedRanks = ClientFunction(ranks => {
    const input = document.querySelector('.deckGeneratorSuitRanks');
    input.value = ranks;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const designs = Selector('.deckDesignButton');
  const hint = Selector('.deckGeneratorDesignHint');
  const addToGame = Selector('#deckEditorNewDeckPanel button.green');

  await t
    .click('#editButton')
    .click('#editorToolbar [icon=style]')
    .click('#deckEditorAddDeck')
    .click('#deckEditorNewDeckGroupCustom .deckEditorNewDeckGroupHeader') // open the "Create a custom deck" section
    .click('#deckEditorNewDeckOverlay input[value=custom]')
    .expect(designs.count).gt(0)
    .expect(hint.textContent).eql('52 cards from 4 suits. Pick how they look:')
    .click(designs.nth(0))
    .expect(addToGame.hasAttribute('disabled')).notOk();

  await setSharedRanks('');
  await t
    .expect(hint.textContent).eql('Add at least one rank above to see the card designs.')
    .expect(designs.count).eql(0)
    .expect(addToGame.hasAttribute('disabled')).ok();

  // and it comes back once there is a rank again - with the design that was picked before still picked, so the
  // deck can be added without noticing that the gallery was rebuilt in between
  await setSharedRanks('A');
  await t
    .expect(hint.textContent).eql('4 cards from 4 suits. Pick how they look:')
    .expect(designs.count).gt(0)
    .expect(designs.nth(0).hasClass('selected')).ok()
    .expect(addToGame.hasAttribute('disabled')).notOk();

  // a range that would build a card type per rank on every keystroke is cut off, and the hint says so
  await setSharedRanks('2-100000');
  await t
    .expect(hint.textContent).eql('800 cards from 4 suits. Only the first 200 ranks of a suit are used. Pick how they look:')
    .pressKey('esc');
});

// Several face objects can be selected at once (Ctrl/Shift+click on the card or in the tree). A property row
// then writes to all of them - showing "(mixed)" while they disagree - and the Object tab's align/distribute
// buttons line them up. The properties themselves are grouped into the collapsible blocks the Edit Widget
// sidebar uses, which is what the group/summary expectations below check.
test('Deck editor: multi-selected face objects share property edits and alignment', async t => {
  await t.resizeWindow(1280, 900);
  await setRoomState({
    multiDeck: {
      id: 'multiDeck', type: 'deck', x: 20, y: 20,
      cardTypes: { plain: {} },
      faceTemplates: [ { objects: [
        { type: 'text', x: 4,   y: 10,  width: 40, height: 20, fontSize: 14, value: 'one',    color: '#000000' },
        { type: 'text', x: 30,  y: 60,  width: 60, height: 20, fontSize: 14, value: 'two',    color: '#000000' },
        { type: 'text', x: 12,  y: 120, width: 50, height: 20, fontSize: 14, value: 'three',  color: '#333333' },
        { type: 'text', x: 200, y: 200, width: 50, height: 20, fontSize: 14, value: 'hidden', color: '#333333', display: false }
      ] } ]
    },
    multiCard: { id: 'multiCard', type: 'card', deck: 'multiDeck', cardType: 'plain', x: 300, y: 100 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);

  const objectRow = Selector('#deckEditorTree .deckEditorObjectRow');
  const groupTitles = ClientFunction(() => {
    const titles = [];
    const groups = document.querySelectorAll('#deckEditorSidebar .deckEditorGroupTitle');
    for(let i = 0; i < groups.length; ++i)
      titles.push(groups[i].textContent);
    return titles;
  });
  const faceObjects = ClientFunction(() => JSON.stringify(widgets.get('multiDeck').get('faceTemplates')[0].objects));
  // What kind of field a property row got, and whether it says the objects disagree - a "(mixed)" row has to
  // keep the type of the property (a checkbox stays a checkbox) instead of falling back to a text field.
  const fieldOf = ClientFunction(label => {
    const rows = document.querySelectorAll('#deckEditorSidebar .deckEditorObjectProperties .genericInput');
    for(let i = 0; i < rows.length; ++i) {
      if(rows[i].querySelector('label').textContent == label) {
        const input = rows[i].querySelector('input, textarea');
        return `${input.type || input.tagName.toLowerCase()}:${input.indeterminate || input.placeholder == '(mixed)' ? 'mixed' : 'common'}`;
      }
    }
    return null;
  });
  // A shift+click on the text field of a row that is already being typed in - focused first, so the click sees
  // the field the way it does mid-edit. Returns whether the field kept the focus.
  const shiftClickFocusedField = ClientFunction(row => {
    const input = document.querySelectorAll('#deckEditorTree .deckEditorObjectRow')[row].querySelector('.deckEditorPreviewText');
    input.focus();
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: true }));
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    return document.activeElement == input;
  });
  const setSharedField = ClientFunction((label, value) => {
    const rows = document.querySelectorAll('#deckEditorSidebar .deckEditorObjectProperties .genericInput');
    for(let i = 0; i < rows.length; ++i) {
      if(rows[i].querySelector('label').textContent == label) {
        const input = rows[i].querySelector('input');
        const placeholder = input.placeholder;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return placeholder;
      }
    }
    return null;
  });

  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
    .click('#w_multiDeck') // selects the deck, showing the abbreviated Basic/Other properties panel
    .click('#propertiesOpenDeckEditor') // opens the full deck editor on it
    .click(objectRow.nth(0));
  // one object: the properties are sorted into the same blocks the Edit Widget sidebar uses
  await t
    .expect(groupTitles()).eql([ 'Content', 'Position', 'Size', 'Colors', 'Appearance' ])
    .expect(Selector('#deckEditorAlignLeft').hasAttribute('disabled')).ok(); // needs a second object

  await t
    .click(objectRow.nth(1), { modifiers: { ctrl: true } })
    .click(objectRow.nth(2), { modifiers: { ctrl: true } })
    .expect(Selector('#deckEditorTree .deckEditorObjectRow.selected').count).eql(3)
    .expect(Selector('#deckEditorMain .deckEditorSelectedObject').count).eql(3)
    .expect(Selector('#deckEditorSidebar header h2').innerText).eql('3 face objects selected (1, 2, 3)')
    .expect(Selector('#deckEditorAlignLeft').hasAttribute('disabled')).notOk()
    .expect(Selector('#deckEditorDistributeV').hasAttribute('disabled')).notOk();

  // the three objects disagree about their color, so the row says so - and typing gives all of them the value
  await t.expect(setSharedField('color', '#cc0000')).eql('(mixed)');
  await t.wait(700); // let the debounced faceTemplates commit fire
  await t
    .click('#deckEditorAlignLeft')
    .click('#deckEditorDistributeV')
    .expect(Selector('#deckEditorTree .deckEditorObjectRow.selected').count).eql(3); // the selection survives
  await t.wait(700); // let the alignment's commit reach the server
  const aligned = JSON.parse(await faceObjects());
  await t
    .expect(aligned[0].x).eql(aligned[1].x) // aligned left: one x for all three
    .expect(aligned[1].x).eql(aligned[2].x)
    // distributed vertically: equal gaps, i.e. equal steps since the three are equally tall (±1 for rounding)
    .expect(Math.abs((aligned[1].y - aligned[0].y) - (aligned[2].y - aligned[1].y)) <= 1).ok()
    .pressKey('ctrl+a') // Ctrl+A picks up the whole face, including the hidden object
    .expect(Selector('#deckEditorTree .deckEditorObjectRow.selected').count).eql(4);

  // a hidden object has no box on screen, so aligning must leave it where it is instead of moving it to where
  // its zero-sized rectangle appears to be
  await t.click('#deckEditorAlignLeft');
  await t.expect(JSON.parse(await faceObjects())[3].x).eql(200);

  // ...and with nothing but that hidden object next to a single visible one there is nothing to align at all,
  // so the button has to be disabled instead of being clickable and doing nothing
  await t
    .click(objectRow.nth(0))
    .click(objectRow.nth(3), { modifiers: { ctrl: true } })
    .expect(Selector('#deckEditorTree .deckEditorObjectRow.selected').count).eql(2)
    .expect(Selector('#deckEditorAlignLeft').hasAttribute('disabled')).ok()
    .click(objectRow.nth(1), { modifiers: { ctrl: true } }) // back to the whole face for the rows below
    .click(objectRow.nth(2), { modifiers: { ctrl: true } })
    .expect(Selector('#deckEditorTree .deckEditorObjectRow.selected').count).eql(4);

  // display is set on the hidden object only, so its row is a "(mixed)" checkbox - not a text field, which
  // would write the string "false"/"true" into every object
  await t.expect(fieldOf('display')).eql('checkbox:mixed');
  const displayRow = Selector('#deckEditorSidebar .deckEditorObjectProperties .genericInput')
    .filter(node => node.querySelector('label').textContent == 'display');
  await t.click(displayRow.find('input'));
  await t.wait(700); // let the debounced faceTemplates commit fire
  const objects = JSON.parse(await faceObjects());
  await t
    .expect(objects.every(object => object.display === true)).ok() // booleans, not strings
    .expect(fieldOf('display')).eql('checkbox:common');

  // Shift+click makes the range the whole selection: an object picked up with ctrl before, but outside the
  // range, is dropped. Ctrl+shift+click is the additive version that keeps it.
  await t
    .click(objectRow.nth(0))
    .click(objectRow.nth(3), { modifiers: { ctrl: true } })
    .click(objectRow.nth(1), { modifiers: { shift: true } }) // range 2-4, so object 1 goes away
    .expect(Selector('#deckEditorTree .deckEditorObjectRow.selected').count).eql(3)
    .expect(objectRow.nth(0).hasClass('selected')).notOk()
    .click(objectRow.nth(0), { modifiers: { ctrl: true, shift: true } })
    .expect(Selector('#deckEditorTree .deckEditorObjectRow.selected').count).eql(4);

  // Inside the text field that is currently being typed in, shift+click is the field's own "extend the caret
  // selection" gesture: it must leave the object selection (and the focus) alone instead of rebuilding the tree.
  await t
    .click(objectRow.nth(1))
    .click(objectRow.nth(2), { modifiers: { ctrl: true } })
    .click(objectRow.nth(3), { modifiers: { ctrl: true } })
    .expect(Selector('#deckEditorTree .deckEditorObjectRow.selected').count).eql(3)
    .expect(shiftClickFocusedField(3)).ok() // the field keeps the focus...
    .expect(Selector('#deckEditorTree .deckEditorObjectRow.selected').count).eql(3); // ...and the selection stands

  // dragging one of the rows to a new position reorders the objects and carries the whole selection along
  // instead of dropping it
  await t
    .dragToElement(objectRow.nth(3), objectRow.nth(0))
    .expect(Selector('#deckEditorTree .deckEditorObjectRow.selected').count).eql(3)
    .pressKey('esc');
  await compareState(t, '101012d22e8e8d136d73d75bc4d4a5f7');
});

test('Line widget in edit mode', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState();
  await ClientFunction(prepareClient)();
  await setEditorState(null);
  await setName(t);
  await t
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-line')
    .expect(Selector('#editorModuleTopLeft.tune').exists).ok()
    // "Add stop" opens the menu of the three ways to add one; the first is a new
    // widget inheriting from an existing stop, which the Add button then creates
    .click('#editorModules .lineAddStop')
    .click(Selector('#editorModules .lineAddStopMenuEntry').nth(0))
    .click('#editorModules .lineAddStopConfirm')
    .click(Selector('#editorModules .lineShapePreset').withAttribute('aria-label', 'Shallow curve'));
  const lineID = await ClientFunction(() => document.querySelector('.widget.line').id.slice(2))();

  // the drop limit constrains exactly those drops, so it is rendered with the
  // matches - and stays out of the way while the line accepts nothing
  const dropLimitInput = Selector('#editorModules .propertyInput').withText('Drop limit');
  await t.expect(dropLimitInput.visible).notOk();

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

  // an empty field is "no limit", which the widget stores as -1
  const readDropLimit = ClientFunction(id => widgets.get(id).get('dropLimit'));
  await t
    .expect(dropLimitInput.visible).ok()
    .typeText(dropLimitInput.find('input[type=number]'), '3', { replace: true });
  const dropLimit = await readDropLimit(lineID);
  await t
    .expect(dropLimit).eql(3)
    .selectText(dropLimitInput.find('input[type=number]'))
    .pressKey('delete');
  const clearedDropLimit = await readDropLimit(lineID);
  await t.expect(clearedDropLimit).eql(-1);

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
  await compareState(t, 'f824693a7b67c17da3c862339274a48c');
});

// A stop does not have to be a child of the line, and one that is not gets
// placed through global coordinates - which read the CSS transforms out of the
// DOM. Moving the city the route is connected to moves the line's box in the
// same batch, so without a flush the stops are laid out in the frame the line
// had before the move and end up off the path by exactly that move.
test('Line stops that are not children of the line', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    cityA: { id: 'cityA', type: 'basic', x: 100, y: 300, width: 40, height: 40 },
    cityB: { id: 'cityB', type: 'basic', x: 600, y: 300, width: 40, height: 40 },
    // the cars start out exactly where the line puts them: on the straight path
    // from city to city, at 33% and 67% of its length
    car1:  { id: 'car1',  type: 'basic', x: 255, y: 308, width: 60, height: 24, movable: false },
    car2:  { id: 'car2',  type: 'basic', x: 425, y: 308, width: 60, height: 24, movable: false },
    // a third car in a frame of its own: it is placed through the holder's
    // transform instead of the room's, at 50% of the path
    holder: { id: 'holder', type: 'basic', x: 200, y: 100, width: 400, height: 400, movable: false },
    car3:  { id: 'car3',  type: 'basic', parent: 'holder', x: 140, y: 208, width: 60, height: 24, movable: false },
    route: {
      id: 'route', type: 'line', autoSpaceStops: false,
      lineStart: { x: 120, y: 320 }, lineEnd: { x: 620, y: 320 },
      connectStart: { line: 'cityA', position: 0.5 },
      connectEnd: { line: 'cityB', position: 0.5 },
      stops: [ { widget: 'car1', position: 0.33 }, { widget: 'car3', position: 0.5 }, { widget: 'car2', position: 0.67 } ]
    },
    // a second line between the same two cities, without stops of its own: it is
    // only here to flush the delta in the middle of a batch, the way every
    // connected line does
    route2: {
      id: 'route2', type: 'line',
      lineStart: { x: 120, y: 340 }, lineEnd: { x: 620, y: 340 },
      connectStart: { line: 'cityA', position: 0.5 },
      connectEnd: { line: 'cityB', position: 0.5 }
    }
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  // entering edit mode is what puts the engine on window for the checks below
  await t.click('#editButton');

  // every mouse event of a drag is one batch, so move the city as one: the delta
  // - and with it the line's new box - only reaches the DOM once it ends
  const moveCity = ClientFunction((dx, dy) => {
    const city = widgets.get('cityA');
    batchStart();
    return city.set('x', city.get('x')+dx)
      .then(_=>city.set('y', city.get('y')+dy))
      .then(_=>batchEnd());
  });

  // how far the stops sit from where the line's own layout puts them - the whole
  // point of a stop is that it rides on the path, so this has to stay 0
  const stopsOffPath = ClientFunction(() => {
    const line = widgets.get('route');
    return Math.max(...line.stopList().map(entry => {
      const stop = widgets.get(entry.widget);
      const p = line.stopCoordInParentFrame(stop, line.pointAtPosition(entry.position));
      return Math.max(
        Math.abs(Math.round(p.x - stop.get('width')/2) - stop.get('x')),
        Math.abs(Math.round(p.y - stop.get('height')/2) - stop.get('y'))
      );
    }));
  });

  // a routine can move the frame a stop lives in and re-lay out the line in the
  // same batch - then it is the holder's transform that is one event behind.
  // rotateStops is the cheapest property to re-lay out the stops with: it does
  // not touch the line's own geometry, so only the holder's frame goes stale.
  const moveHolderAndLayOutStops = ClientFunction((dx, dy, rotate) => {
    const holder = widgets.get('holder');
    batchStart();
    return holder.set('x', holder.get('x')+dx)
      .then(_=>holder.set('y', holder.get('y')+dy))
      .then(_=>widgets.get('route').set('rotateStops', rotate))
      .then(_=>batchEnd());
  });

  // the same, except the frame ends the batch where it started - with another
  // line flushing while it is displaced. Nothing about this line or the holder
  // has changed by the time the stops are laid out, but the DOM now holds the
  // displaced transform, so only asking the DOM catches it.
  const displaceHolderAndLayOutStops = ClientFunction((dx, dy, rotate) => {
    const holder = widgets.get('holder');
    batchStart();
    return holder.set('x', holder.get('x')+dx)
      .then(_=>holder.set('y', holder.get('y')+dy))
      .then(_=>widgets.get('route2').applyConnections())
      .then(_=>holder.set('x', holder.get('x')-dx))
      .then(_=>holder.set('y', holder.get('y')-dy))
      .then(_=>widgets.get('route').set('rotateStops', rotate))
      .then(_=>batchEnd());
  });

  // a stop can be the frame another stop is placed in, and then the transform
  // car3 is converted through is one the same pass has just written
  const holderBecomesAStop = ClientFunction(() => widgets.get('route').addStop('holder', 0.15));

  await t.expect(stopsOffPath()).eql(0);
  await moveCity(120, -90);
  await t.expect(stopsOffPath()).eql(0);
  await moveCity(-120, 90);
  await t.expect(stopsOffPath()).eql(0);
  await moveHolderAndLayOutStops(70, -40, false);
  await t.expect(stopsOffPath()).eql(0);
  await moveHolderAndLayOutStops(-70, 40, true);
  await t.expect(stopsOffPath()).eql(0);
  await displaceHolderAndLayOutStops(60, -30, false);
  await t.expect(stopsOffPath()).eql(0);
  await displaceHolderAndLayOutStops(-60, 30, true);
  await t.expect(stopsOffPath()).eql(0);
  await holderBecomesAStop();
  await t.expect(stopsOffPath()).eql(0);
  await moveCity(90, -60);
  await t.expect(stopsOffPath()).eql(0);
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

// drags a selection rectangle around the given widgets - the events go to the
// window, where the editor listens for them, so they need no element to start
// from. A rectangle around a single widget is treated like a click on it, which
// is why the callers put the widget being edited in the band as well.
const rubberBandOver = ClientFunction(selector => {
  const from = { x: Infinity, y: Infinity };
  const to = { x: -Infinity, y: -Infinity };
  document.querySelectorAll(selector).forEach(element=>{
    const rect = element.getBoundingClientRect();
    from.x = Math.min(from.x, rect.left - 20);
    from.y = Math.min(from.y, rect.top - 20);
    to.x = Math.max(to.x, rect.right + 20);
    to.y = Math.max(to.y, rect.bottom + 20);
  });
  const at = (type, point)=>document.body.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: point.x, clientY: point.y }));
  at('mousedown', from);
  at('mousemove', to);
  at('mouseup', to);
});

test('A routine parameter popup goes away with the widget it belongs to', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    button: { id: 'button', type: 'button', x: 100, y: 100, clickRoutine: [ { func: 'MOVE', from: 'holder1', to: 'holder2' } ] },
    holder1: { id: 'holder1', type: 'holder', x: 300, y: 100 },
    holder2: { id: 'holder2', type: 'holder', x: 500, y: 100 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const popup = Selector('.inline-popup');
  const fromChip = Selector('.routine-editor-operation [data-parameter=from]');
  const routineHeader = Selector('.events-editor-event-header').withText('clickRoutine');
  const openFromPopup = async _=>{
    await t.click('#w_button');
    if(await routineHeader.getAttribute('aria-expanded') == 'false')
      await t.click(routineHeader);
    await t.click(fromChip).expect(popup.exists).ok();
  };

  await t.click('#editButton').expect(propertiesModule.exists).ok();
  await openFromPopup();

  // The popup hangs off a chip of the routine of the widget being edited, so a
  // click that moves the editor on to another widget takes it along - without
  // this it stays on screen over an editor for a widget it has nothing to do
  // with. Its own "Pick in the room" is what makes a click in the room fill the
  // parameter instead, which is why nothing else ever closed it.
  await t
    .click('#w_holder2')
    .expect(popup.exists).notOk()
    .expect(Selector('#w_holder2').hasClass('selectedInEdit')).ok();

  // A rubber band is the other way to pick in the room, and the only one that
  // goes through the selection: it selects what it caught, and the picker puts
  // the widget it belongs to back afterwards - which is not the editor moving on
  // either. The property builder picks a single widget, so its picker is already
  // gone by the time that restore arrives.
  await openFromPopup();
  const propertySection = popup.find('.accordion-section').withAttribute('data-kind', 'property');
  await t
    .click(propertySection.find('h3'))
    .click(propertySection.find('.propertyExpandButton'))
    .click(propertySection.find('button[icon=colorize]'));
  await rubberBandOver('#w_button, #w_holder1');
  await t
    .expect(popup.exists).ok()
    .expect(propertySection.find('.popup-property-widget').value).eql('holder1')
    .expect(Selector('#w_button').hasClass('selectedInEdit')).ok();

  // with the picker armed the same click belongs to the popup, which stays open
  await t.click(popup.find('.popup-close'));
  await openFromPopup();
  await t
    .click(popup.find('button').withText('Pick in the room'))
    .click('#w_holder2')
    .expect(popup.exists).ok()
    .expect(popup.find('.widgetPickerEntry.selected').withText('holder2').exists).ok()
    .expect(Selector('#w_button').hasClass('selectedInEdit')).ok();

  // The route that reads as a pick least of all: the JSON editor, which selects
  // widgets in its own tree. Opening it also replaces the module the popup hangs
  // off, which takes the popup along by itself - either way nothing of the
  // editor for the other widget is left over the new one.
  const picking = Selector('body').hasClass('editorWidgetPicking');
  await t.click(popup.find('.popup-close'));
  await openFromPopup();
  await t
    .click(popup.find('button').withText('Pick in the room'))
    .expect(picking).ok()
    .click('#editorSidebar [icon=data_object]')
    .expect(popup.exists).notOk()
    .expect(picking).notOk()
    .click('.editorModule.data_object .selectionBar button[icon=account_tree]')
    .click(Selector('#jeTree .jeTreeWidget').find('.key').withExactText('holder2'))
    .expect(Selector('#w_holder2').hasClass('selectedInEdit')).ok();
  await setEditorState(null);
});

// An armed picker only explains the selection changes it makes itself - a click
// or a band in the room. Every other way to select another widget is the editor
// moving on, waiting picker or not: without that, arming the picker would leave
// the popup floating over whatever the editor moved on to, with the picker still
// armed for a widget that is not on screen any more. The sidebar has such a
// route of its own, so it does not even take another module: a widget attached
// to a line offers a way back to the line it rides on.
test('An armed picker does not keep a popup open when the sidebar moves the editor on', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    route: {
      id: 'route', type: 'line', lineStart: { x: 100, y: 300 }, lineEnd: { x: 600, y: 300 },
      stops: [ { widget: 'stop1', position: 0.5 } ]
    },
    stop1: {
      id: 'stop1', type: 'basic', parent: 'route', x: 340, y: 290, width: 40, height: 20,
      clickRoutine: [ { func: 'MOVE', from: 'holder1', to: 'holder2' } ]
    },
    holder1: { id: 'holder1', type: 'holder', x: 300, y: 100 },
    holder2: { id: 'holder2', type: 'holder', x: 500, y: 100 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const popup = Selector('.inline-popup');
  const picking = Selector('body').hasClass('editorWidgetPicking');
  const routineHeader = Selector('.events-editor-event-header').withText('clickRoutine');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    .click('#w_stop1');
  if(await routineHeader.getAttribute('aria-expanded') == 'false')
    await t.click(routineHeader);
  await t
    .click(Selector('.routine-editor-operation [data-parameter=from]'))
    .expect(popup.exists).ok()
    .click(popup.find('button').withText('Pick in the room'))
    .expect(picking).ok();

  // "Edit line route" in the widget header selects the line - a selection change
  // that never touches the room, with the widget the picker belongs to still
  // there. It is the editor moving on all the same.
  await t
    .click(Selector('.widgetHeaderLineButton'))
    .expect(Selector('#w_route').hasClass('selectedInEdit')).ok()
    .expect(popup.exists).notOk()
    .expect(picking).notOk();

  // Leaving edit mode is the most complete way of moving on, and it goes past
  // the module being closed: the editor is only hidden, so a popup left open
  // lives on inside it and an armed picker keeps the crosshair over the whole
  // page while playing. An armed picker also makes the popup ignore the click on
  // the edit button itself, so nothing else takes it along.
  await t.click('#w_stop1');
  if(await routineHeader.getAttribute('aria-expanded') == 'false')
    await t.click(routineHeader);
  await t
    .click(Selector('.routine-editor-operation [data-parameter=from]'))
    .expect(popup.exists).ok()
    .click(popup.find('button').withText('Pick in the room'))
    .expect(picking).ok()
    .click('#editorToolbar button[icon=close]')
    .expect(Selector('body').hasClass('edit')).notOk()
    .expect(popup.exists).notOk()
    .expect(picking).notOk();
  await setEditorState(null);
});

test('An editor popup does not outlive the widget it belongs to without a click either', async t => {
  await t.resizeWindow(1280, 800);
  const roomState = {
    button: { id: 'button', type: 'button', x: 100, y: 100, clickRoutine: [ { func: 'CANVAS', mode: 'change', color: '#1f5ca6' } ] },
    holder: { id: 'holder', type: 'holder', x: 500, y: 100 }
  };
  await setRoomState(roomState);
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const popup = Selector('.inline-popup');
  const colorChip = Selector('.routine-editor-operation [data-parameter=color]');
  const routineHeader = Selector('.events-editor-event-header').withText('clickRoutine');
  const routineColor = ClientFunction(_=>widgets.get('button').get('clickRoutine')[0].color);
  const picking = Selector('body').hasClass('editorWidgetPicking');
  const notes = Selector('#editorNotes');
  const openColorPopup = async _=>{
    await t.click('#w_button');
    if(await routineHeader.getAttribute('aria-expanded') == 'false')
      await t.click(routineHeader);
    await t.click(colorChip).expect(popup.exists).ok();
  };
  const armRoomPicker = async _=>{
    const propertySection = popup.find('.accordion-section').withAttribute('data-kind', 'property');
    await t
      .click(propertySection.find('h3'))
      .click(propertySection.find('.propertyExpandButton'))
      .click(propertySection.find('button[icon=colorize]'))
      .expect(picking).ok();
  };

  await t.click('#editButton').expect(propertiesModule.exists).ok();
  await openColorPopup();

  // The color, icon and sound pickers only write their parameter when the popup
  // goes away, so closing it applies what was picked - to the widget the popup
  // belongs to, exactly as a click outside the popup would. That widget is off
  // screen by then, so the editor says what it wrote where: without that, having
  // kept the pick and having thrown it away look exactly the same.
  await t
    .click(popup.find('.propertyColorChip[data-value="#3cb44b"]'))
    .click('#w_holder')
    .expect(popup.exists).notOk()
    .expect(routineColor()).eql('#3cb44b')
    .expect(notes.innerText).contains('CANVAS color set to #3cb44b on button');

  // The routes without any click: the widget being edited is removed, which is
  // what a delete, an undo and a dissolving pile all arrive as. An armed room
  // picker keeps the popup through the selection changes it causes itself, but
  // not through this one - the widget it would write to is gone.
  await openColorPopup();
  await armRoomPicker();
  await ClientFunction(_=>removeWidgetLocal('button'))();
  await t
    .expect(popup.exists).notOk()
    .expect(ClientFunction(_=>widgets.has('button'))()).notOk()
    .expect(picking).notOk()
    // the crosshair over the room is all there is to see of an armed picker, so
    // it ending on its own is said out loud as well
    .expect(notes.innerText).contains('picking in the room ended: button is gone');

  // The other route without a click: a new state from the server, which replaces
  // every widget in the room. It usually brings the same ids back (an undo, the
  // same game loaded again), so the widget the popup belongs to can only be told
  // apart from its replacement by identity - going by the id alone would leave
  // the popup floating over an editor that has nothing selected at all.
  await setRoomState(roomState);
  await t.expect(ClientFunction(_=>widgets.has('button'))()).ok();
  await openColorPopup();
  await armRoomPicker();
  await setRoomState(roomState);
  await t
    .expect(popup.exists).notOk()
    .expect(ClientFunction(_=>widgets.has('button'))()).ok()
    .expect(picking).notOk();
  await setEditorState(null);
});

test('A property info tip goes away with the widget it explains', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    button: { id: 'button', type: 'button', x: 100, y: 100 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const infoTip = Selector('#editor > .inline-popup');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    .click('#w_button')
    .click(Selector('#editorModules .collapsibleHeader').withText('CSS').find('.info-button'))
    .expect(infoTip.exists).ok();

  // An info tip hangs off a sidebar control just like the popups do. Its own
  // outside-click handler covers every route with a click in it, but not the
  // selection changing on its own - here the widget it explains is removed.
  await ClientFunction(_=>removeWidgetLocal('button'))();
  await t.expect(infoTip.exists).notOk();
  await setEditorState(null);
});

test('A long list of widget ids shrinks instead of pushing the apply button out of the popup', async t => {
  await t.resizeWindow(1280, 500);
  const roomState = {
    button: { id: 'button', type: 'button', x: 100, y: 100, clickRoutine: [ { func: 'MOVE', from: 'holder1', to: 'holder2' } ] }
  };
  // more holders than the list of ids can show, so it wants to be at its tallest
  for(let i=1; i<=30; ++i)
    roomState[`holder${i}`] = { id: `holder${i}`, type: 'holder', x: 300+i%6*60, y: 100+Math.floor(i/6)*60 };
  await setRoomState(roomState);
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const popup = Selector('.inline-popup');
  const routineHeader = Selector('.events-editor-event-header').withText('clickRoutine');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    .click('#w_button');
  if(await routineHeader.getAttribute('aria-expanded') == 'false')
    await t.click(routineHeader);
  await t
    .click(Selector('.routine-editor-operation [data-parameter=from]'))
    .expect(popup.exists).ok()
    .expect(popup.find('.widgetPickerList').exists).ok();

  // The button that applies the picked widgets is the last thing in the section,
  // so a list of ids that is taller than the popup has room for pushes it out of
  // sight - and a popup that scrolls says nothing about there being more below
  // it. The list scrolls anyway, so it is what gives way.
  const fit = await ClientFunction(_=>{
    const popup = document.querySelector('.inline-popup');
    const apply = popup.querySelector('button.primary'); // "Use these widgets"
    const popupRect = popup.getBoundingClientRect(), applyRect = apply.getBoundingClientRect();
    const list = popup.querySelector('.widgetPickerList');
    return {
      popupScrollsBy: popup.scrollHeight - popup.clientHeight,
      applyInPopup: applyRect.top >= popupRect.top && applyRect.bottom <= popupRect.bottom + 1,
      listScrolls: list.scrollHeight > list.clientHeight
    };
  })();
  await t.expect(fit).eql({ popupScrollsBy: 0, applyInPopup: true, listScrolls: true });
  await setEditorState(null);
});

// Two widgets that cannot be clicked and look like any other from the outside:
// one whose game switches pointer events off in its css, and one that is only
// invisible because an ancestor is - the class that hides it sits on the parent,
// so the widget itself carries no sign of why it cannot be seen.
// testcafe cannot press a function key, so the very event the bar's handler takes
// is dispatched by hand - what matters is whether it is taken at all
const pressFunctionKey = ClientFunction(key => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});

test('The stack list reaches widgets with no pointer events and names the ancestor that hides one', async t => {
  await t.resizeWindow(1280, 800);
  // the marker is the one widget of the five that can be hovered at all: the
  // testcafe cursor cannot be put on any of the others, which is the point
  await setRoomState({
    board:  { id: 'board',  type: 'basic', x: 0,   y: 0,   width: 1600, height: 1000, layer: -4 },
    hider:  { id: 'hider',  type: 'basic', x: 300, y: 200, width: 300,  height: 300, display: false },
    chip:   { id: 'chip',   type: 'basic', x: 40,  y: 40,  width: 120,  height: 120, parent: 'hider' },
    ghost:  { id: 'ghost',  type: 'basic', x: 300, y: 200, width: 300,  height: 300, z: 30, css: 'pointer-events: none' },
    marker: { id: 'marker', type: 'basic', x: 380, y: 280, width: 40,   height: 40,  z: 40 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const bar = Selector('#editorModuleTopLeft .selectionBar');
  const stackRows = bar.find('.selectionBarStackRow');
  const coords = bar.find('.selectionBarCoords');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    .hover('#w_marker')
    .click(bar.find('button[icon=layers]'))
    .hover('#w_marker')
    .expect(stackRows.count).eql(5)
    // the coordinates the panel this list replaces used to show are back in the
    // bar, following the pointer itself rather than where it came to rest
    .expect(coords.textContent).match(/^\d+, \d+$/)
    // the widget that is invisible because its parent is says which parent
    .expect(stackRows.withText('chip').textContent).contains('inside hider, hidden')
    // a widget that takes no pointer events is in the list rather than nowhere,
    // and clicking its row is the only way to select it at all
    .expect(stackRows.withText('ghost').exists).ok()
    // the keys jump from F3 to F6: F4 and F5 belong to the browser, and edit
    // mode is where F5 has to go on reloading the page
    .expect(stackRows.nth(2).find('.selectionBarStackKey').textContent).eql('F3')
    .expect(stackRows.nth(3).find('.selectionBarStackKey').textContent).eql('F6')
    .expect(pressFunctionKey('F5')).notOk()
    .expect(pressFunctionKey('F6')).ok()
    .expect(stackRows.nth(3).hasClass('selected')).ok()
    .click(stackRows.withText('ghost'))
    .expect(Selector('#w_ghost').hasClass('selectedInEdit')).ok()
    // ... and the readout is empty while the pointer is not in the room at all
    .expect(coords.textContent).eql('');
  await setEditorState(null);
});

// The stack of widgets under the pointer used to be eleven function-key rows that
// only existed while the JSON module was open. It is part of the selection bar
// now, which Edit Widgets mounts too - so a widget that lies underneath another
// one is reachable from the panel that edits widgets.
test('The selection bar reaches a widget that is covered by another one', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    board:   { id: 'board',   type: 'basic',  x: 0,   y: 0,   width: 1600, height: 1000, layer: -4, movableInEdit: false },
    point:   { id: 'point',   type: 'holder', x: 300, y: 200, width: 200,  height: 400, classes: 'transparent' },
    checker: { id: 'checker', type: 'basic',  x: 40,  y: 60,  width: 100,  height: 100, parent: 'point' }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const bar = Selector('#editorModuleTopLeft .selectionBar');
  const stackRows = bar.find('.selectionBarStackRow');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    // the list follows the pointer while it is over the room and freezes once it
    // is not, which is what makes its rows clickable at all
    .hover('#w_checker')
    .click(bar.find('button[icon=layers]'))
    .hover('#w_checker')
    .expect(stackRows.count).eql(3)
    .expect(stackRows.nth(0).textContent).contains('checker')
    .expect(stackRows.nth(1).textContent).contains('point')
    .expect(stackRows.nth(2).textContent).contains('board')
    // the way to a row leads across the room, so the list has to stand still
    // while the pointer travels to it - one that followed every pixel would be
    // down to the board, or to nothing at all, by the time it is clicked
    .hover(bar.find('.selectionBarStackHeader'))
    .expect(stackRows.count).eql(3)
    .click(stackRows.nth(2))
    .expect(Selector('#w_board').hasClass('selectedInEdit')).ok()
    // the breadcrumbs of the covered holder name the chain it hangs in
    .click(stackRows.nth(0))
    .expect(bar.find('.selectionBarCrumbs').textContent).contains('point')
    .click(bar.find('button[icon=layers]'));

  // The bar is built with the panel and outlives the selections it is used to
  // change: an open tree keeps the DOM it is in - and with it its scroll
  // position - instead of being thrown away and rebuilt on every pick.
  const markTree = ClientFunction(() => {
    const treeContainer = document.querySelector('#editorModuleTopLeft .selectionBarTree');
    treeContainer.dataset.kept = 'yes';
    return !!treeContainer.querySelector('#jeTree');
  });
  await t
    .click(bar.find('button[icon=account_tree]'))
    .expect(markTree()).ok()
    .click('#w_checker')
    .expect(Selector('#w_checker').hasClass('selectedInEdit')).ok()
    .expect(Selector('#editorModuleTopLeft .selectionBarTree[data-kept="yes"] #jeTree').exists).ok()
    .click(bar.find('button[icon=account_tree]'));

  // Alt+click drills down through the same stack without any panel at all, and
  // Alt+Shift+click walks back up
  await t
    .click('#w_checker')
    .expect(Selector('#w_checker').hasClass('selectedInEdit')).ok()
    .click('#w_checker', { modifiers: { alt: true } })
    .expect(Selector('#w_point').hasClass('selectedInEdit')).ok()
    .click('#w_checker', { modifiers: { alt: true } })
    .expect(Selector('#w_board').hasClass('selectedInEdit')).ok()
    .click('#w_checker', { modifiers: { alt: true, shift: true } })
    .expect(Selector('#w_point').hasClass('selectedInEdit')).ok()
    // a plain click ends the drill and takes the topmost widget again
    .click('#w_checker')
    .expect(Selector('#w_checker').hasClass('selectedInEdit')).ok();

  // back and forward walk the widgets that were selected, whichever way they were
  await t
    .click(bar.find('button[icon=arrow_back]'))
    .expect(Selector('#w_point').hasClass('selectedInEdit')).ok()
    .click(bar.find('button[icon=arrow_forward]'))
    .expect(Selector('#w_checker').hasClass('selectedInEdit')).ok();
  await setEditorState(null);
});

// The bar's mousemove and F-key listeners are on the window and never come off,
// and a module is not closed when the editor is - leaving edit mode only hides
// the panel. So both have to go quiet by hand: otherwise the F keys go on moving
// a selection nobody can see and a hit test of the whole document runs every
// frame for someone who is only playing the game.
test('The selection bar goes quiet while the game is played', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    board:   { id: 'board',   type: 'basic',  x: 0,   y: 0,   width: 1600, height: 1000, layer: -4, movableInEdit: false },
    point:   { id: 'point',   type: 'holder', x: 300, y: 200, width: 200,  height: 400, classes: 'transparent' },
    checker: { id: 'checker', type: 'basic',  x: 40,  y: 60,  width: 100,  height: 100, parent: 'point' }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const bar = Selector('#editorModuleTopLeft .selectionBar');
  const stackCount = bar.find('.selectionBarStackCount');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    .hover('#w_checker')
    .expect(stackCount.textContent).eql('3')
    .expect(pressFunctionKey('F3')).ok()
    .expect(Selector('#w_board').hasClass('selectedInEdit')).ok()

    // closing the editor: no scan, and F keys belong to the browser again
    .click('#editorToolbar button[icon=close]')
    .hover('#w_checker')
    .expect(stackCount.textContent).eql('')
    .expect(pressFunctionKey('F3')).notOk()
    .expect(pressFunctionKey('F1')).notOk()
    .expect(Selector('#w_checker').hasClass('selectedInEdit')).notOk()
    .expect(Selector('#w_board').hasClass('selectedInEdit')).ok()

    // and both come back with the editor
    .click('#editButton')
    .hover('#w_checker')
    .expect(stackCount.textContent).eql('3')
    .expect(pressFunctionKey('F1')).ok()
    .expect(Selector('#w_checker').hasClass('selectedInEdit')).ok();
  await setEditorState(null);
});

// A dropdown covers the module it hangs in, so it needs a way out that is not
// the mouse, and a way to walk it that is not the ten function keys the panel
// this replaces was built around. Escape is what closes every other popup in the
// editor - and main.js takes the same key to close the module, so an Escape that
// closed a dropdown has to stop there.
test('The keyboard walks an open dropdown and Escape closes it', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    board:   { id: 'board',   type: 'basic',  x: 0,   y: 0,   width: 1600, height: 1000, layer: -4, movableInEdit: false },
    point:   { id: 'point',   type: 'holder', x: 300, y: 200, width: 200,  height: 400, classes: 'transparent' },
    checker: { id: 'checker', type: 'basic',  x: 40,  y: 60,  width: 100,  height: 100, parent: 'point' }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const bar = Selector('#editorModuleTopLeft .selectionBar');
  const stackRows = bar.find('.selectionBarStackRow');
  const tree = Selector('#editorModuleTopLeft .selectionBarTree #jeTree');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    .hover('#w_checker')
    .click(bar.find('button[icon=layers]'))
    .hover('#w_checker')
    .expect(stackRows.count).eql(3)
    // off the room, so the list is frozen and no scan is pending
    .hover(bar.find('.selectionBarStackHeader'))

    // the arrow keys step through the list and wrap at its end, the way the
    // Alt+click drill through the same stack does
    .pressKey('down')
    .expect(stackRows.nth(0).hasClass('selectionBarKeyRow')).ok()
    // the row the keyboard is on is outlined in the room as well - the list
    // alone does not say which of a stack of look-alikes it means
    .expect(Selector('#w_checker').hasClass('selectionBarHover')).ok()
    .pressKey('down')
    .pressKey('down')
    .expect(stackRows.nth(2).hasClass('selectionBarKeyRow')).ok()
    .pressKey('down')
    .expect(stackRows.nth(0).hasClass('selectionBarKeyRow')).ok()
    .pressKey('up')
    .expect(stackRows.nth(2).hasClass('selectionBarKeyRow')).ok()
    // the pointer settling on the same spot scans it again - and a scan that
    // finds the same stack must leave the row somebody stepped to alone
    .hover('#w_checker')
    .expect(stackRows.nth(2).hasClass('selectionBarKeyRow')).ok()
    // ... and Enter picks the row they are on
    .pressKey('enter')
    .expect(Selector('#w_board').hasClass('selectedInEdit')).ok()

    // Escape closes the dropdown and nothing else, and takes the outline with it
    .pressKey('esc')
    .expect(bar.hasClass('stackVisible')).notOk()
    .expect(propertiesModule.exists).ok()
    .expect(Selector('#w_checker').hasClass('selectionBarHover')).notOk()

    // the same keys in the tree, which has branches to open and close as well.
    // It opens on the widget the editor is on - the keyboard cursor of a leaf
    // sits on its <li>, that of a branch on the expander inside it.
    .click(bar.find('button[icon=account_tree]'))
    .expect(tree.exists).ok()
    .expect(tree.find('li[data-id=board].selectionBarKeyRow').exists).ok()
    .pressKey('down')
    .expect(tree.find('li[data-id=point] > .selectionBarKeyRow').exists).ok()
    .pressKey('left')
    .expect(tree.find('li[data-id=point] > .jeTreeExpander-down').exists).notOk()
    .pressKey('right')
    .expect(tree.find('li[data-id=point] > .jeTreeExpander-down').exists).ok()
    // → steps into the branch it just opened, ← comes back out of it
    .pressKey('right')
    .expect(tree.find('li[data-id=checker].selectionBarKeyRow').exists).ok()
    .pressKey('left')
    .expect(tree.find('li[data-id=point] > .selectionBarKeyRow').exists).ok()
    .pressKey('enter')
    .expect(Selector('#w_point').hasClass('selectedInEdit')).ok()
    .pressKey('esc')
    .expect(tree.exists).notOk()
    .expect(propertiesModule.exists).ok()
    // the tree goes back to the JSON editor it is borrowed from
    .expect(Selector('#jeEditArea #jeTree').exists).ok()

    // and with no dropdown left to close, Escape closes the module again
    .pressKey('esc')
    .expect(propertiesModule.exists).notOk();
  await setEditorState(null);
});

// What the panel paints under an open dropdown. A widget preview is a real
// widget, so it carries the widget's own z-index ((layer + 10) * 100000 + z) -
// which, off the table, beats everything the module draws around it. The seat
// style presets came out on top of the dropdown that was covering them.
const coversDropdown = ClientFunction(selector => {
  const dropdown = document.querySelector(`#editorModuleTopLeft ${selector}`);
  const r = dropdown.getBoundingClientRect();
  const hits = [];
  for(let fy = 0.1; fy <= 0.91; fy += 0.1)
    for(let fx = 0.1; fx <= 0.91; fx += 0.1) {
      const top = document.elementFromPoint(r.left + r.width*fx, r.top + r.height*fy);
      const name = top && !dropdown.contains(top) ? String(top.className || top.tagName) : null;
      if(name && hits.indexOf(name) == -1)
        hits.push(name);
    }
  return hits.join(', ');
});

// Scrolls the presets up under the open dropdown - the bar sticks to the top of
// the panel while its content moves - and answers how much of them ends up
// behind it, so the check below cannot pass on a panel that never overlapped.
const presetsBehindDropdown = ClientFunction(selector => {
  const presets = document.querySelector('#editorModuleTopLeft .seatPresetRow');
  presets.scrollIntoView({ block: 'start' });
  const dropdown = document.querySelector(`#editorModuleTopLeft ${selector}`).getBoundingClientRect();
  const row = presets.getBoundingClientRect();
  return Math.min(dropdown.bottom, row.bottom) - Math.max(dropdown.top, row.top);
});

test('Widget previews stay in their box instead of covering the selection bar', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    board: { id: 'board', type: 'basic', x: 0,   y: 0,   width: 1600, height: 1000, layer: -4, movableInEdit: false },
    seat:  { id: 'seat',  type: 'seat',  x: 300, y: 200, width: 150,  height: 40, index: 1 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const bar = Selector('#editorModuleTopLeft .selectionBar');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    // the seat, whose editor draws the three style presets as live seat widgets
    .click('#w_seat')
    .expect(Selector('#editorModuleTopLeft .seatPresetRow .widgetSelectionButton').count).eql(3)
    // a stack under the pointer, so the list has rows to fill the dropdown with
    .hover('#w_seat')
    .click(bar.find('button[icon=layers]'))
    .hover('#w_seat')
    .expect(bar.find('.selectionBarStackRow').count).eql(2)
    // off the room, so the list stands still while the panel is scrolled
    .hover(bar.find('.selectionBarStackHeader'))
    .expect(presetsBehindDropdown('.selectionBarStackList')).gt(20)
    .expect(coversDropdown('.selectionBarStackList')).eql('')

    .click(bar.find('button[icon=account_tree]'))
    .expect(presetsBehindDropdown('.selectionBarTree')).gt(20)
    .expect(coversDropdown('.selectionBarTree')).eql('')
    .click(bar.find('button[icon=account_tree]'));
  await setEditorState(null);
});

// Cards go to the end of the list however they are stacked in the room, so a
// stack containing one is where paint order and the order the bar shows differ -
// and the drill has to walk the list, not the paint order, or the badge counts
// widgets in an order nothing on screen shows.
test('Alt+click drills in the order the stack list shows', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    deck:  { id: 'deck',  type: 'deck',  cardTypes: { a: {} }, faceTemplates: [ { objects: [] } ] },
    board: { id: 'board', type: 'basic', x: 0,   y: 0,   width: 1600, height: 1000, layer: -4 },
    card:  { id: 'card',  type: 'card',  deck: 'deck', cardType: 'a', x: 300, y: 200, z: 10 },
    cover: { id: 'cover', type: 'basic', x: 300, y: 200, width: 100,  height: 100, z: 20, classes: 'transparent' }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const bar = Selector('#editorModuleTopLeft .selectionBar');
  const stackRows = bar.find('.selectionBarStackRow');
  const drillBadge = Selector('#editorDrillBadge');
  const drillReadout = bar.find('.selectionBarDrill');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    .hover('#w_cover')
    .click(bar.find('button[icon=layers]'))
    .hover('#w_cover')
    // the card is under the cover in the room but last in the list
    .expect(stackRows.count).eql(3)
    .expect(stackRows.nth(0).textContent).contains('cover')
    .expect(stackRows.nth(1).textContent).contains('board')
    .expect(stackRows.nth(2).textContent).contains('card')

    .click('#w_cover')
    .expect(Selector('#w_cover').hasClass('selectedInEdit')).ok()
    .click('#w_cover', { modifiers: { alt: true } })
    .expect(Selector('#w_board').hasClass('selectedInEdit')).ok()
    .expect(drillBadge.textContent).contains('2/3')
    // the badge fades, so the bar keeps saying where the drill is - on the one
    // strip the dropdowns do not cover, and counting the same stack the open
    // list does rather than one from another spot
    .expect(drillReadout.textContent).eql('2/3')
    .expect(bar.find('.selectionBarStackHeader').textContent).contains('3 under the pointer')
    .click('#w_cover', { modifiers: { alt: true } })
    .expect(Selector('#w_card').hasClass('selectedInEdit')).ok()
    .expect(drillBadge.textContent).contains('3/3')
    .expect(drillReadout.textContent).eql('3/3')
    // a plain click is not a drill any more
    .click('#w_cover')
    .expect(drillReadout.textContent).eql('');
  await setEditorState(null);
});

// A real tap, the way a tablet sends one. TestCafe's own actions are mouse
// actions in a desktop browser, so the touch path has to be driven by hand.
// Desktop Firefox has neither the Touch nor the TouchEvent constructor, so the
// event is assembled from a plain one carrying the touch lists the handlers read
// - none of them cares what the event was constructed as.
const tapWidget = ClientFunction(id => {
  const target = document.querySelector(id);
  const rect = target.getBoundingClientRect();
  const touch = { identifier: 1, target, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 };
  const dispatch = (type, touches, changedTouches) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { touches, targetTouches: touches, changedTouches });
    target.dispatchEvent(event);
  };
  dispatch('touchstart', [ touch ], [ touch ]);
  dispatch('touchend', [], [ touch ]);
});

// A finger never hovers, and the room's own input handler calls preventDefault()
// on touchstart, so no mouse event follows a tap: the list this bar is built
// around stayed empty on iOS Safari, which left a tablet no way at all to the
// widget under the one it tapped - the Alt+click drill needs a mouse and a
// modifier key. The tap has to fill the list itself.
test('A tap fills the stack list, which is the only way to a covered widget on a tablet', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    board: { id: 'board', type: 'basic',  x: 0,    y: 0,   width: 1600, height: 1000, layer: -4, movableInEdit: false },
    lid:   { id: 'lid',   type: 'holder', x: 300,  y: 200, width: 300,  height: 300, classes: 'transparent' },
    chip:  { id: 'chip',  type: 'basic',  x: 60,   y: 60,  width: 120,  height: 120, parent: 'lid' },
    far:   { id: 'far',   type: 'basic',  x: 1100, y: 700, width: 100,  height: 100 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const bar = Selector('#editorModuleTopLeft .selectionBar');
  const stackRows = bar.find('.selectionBarStackRow');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    // a stack the mouse took, so a list that never changes again would still
    // have rows in it - the tap below has to replace them
    .hover('#w_far')
    .click(bar.find('button[icon=layers]'))
    .hover('#w_far')
    .expect(stackRows.count).eql(2)
    // and off the room, so nothing the mouse does can touch the list from here on
    .hover(bar.find('.selectionBarStackHeader'));

  await tapWidget('#w_chip');

  await t
    .expect(stackRows.count).eql(3)
    .expect(stackRows.nth(0).textContent).contains('chip')
    .expect(stackRows.nth(1).textContent).contains('lid')
    .expect(stackRows.nth(2).textContent).contains('board')
    .expect(bar.find('.selectionBarStackCount').textContent).eql('3')
    // nothing is "under the pointer" on a device that has none, and the keys and
    // modifiers the help line offers a mouse are not there either
    .expect(bar.find('.selectionBarStackHeader').textContent).eql('3 where you tapped, topmost first')
    .expect(bar.find('.selectionBarStackHelp').textContent).eql('Tap a row to select that widget.')
    // and the row of the widget underneath is reachable, which is the point
    .click(stackRows.nth(1))
    .expect(Selector('#w_lid').hasClass('selectedInEdit')).ok()
    // a laptop with a touchscreen is both, so the mouse taking the next stack
    // takes the wording back with it
    .hover('#w_far')
    .expect(bar.find('.selectionBarStackHeader').textContent).eql('2 under the pointer, topmost first')
    .click(bar.find('button[icon=layers]'));
  await setEditorState(null);
});

// Which columns of the stack list fit into the panel they are in. scrollWidth is
// no use for that: an ellipsized flex item reports it equal to clientWidth. What
// the ellipsis really reacts to is the box being even a fraction of a pixel
// narrower than the text - which is exactly what a proportional flex-shrink
// leaves, and it costs three characters - so the text is measured on a clone that
// may be as wide as it wants.
const stackRowFit = ClientFunction(() => {
  const isCut = el => {
    const clone = el.cloneNode(true);
    clone.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;width:max-content;max-width:none;min-width:0;white-space:nowrap';
    el.parentNode.appendChild(clone);
    const need = clone.getBoundingClientRect().width;
    clone.remove();
    return need > el.getBoundingClientRect().width + 0.01;
  };
  const list = document.querySelector('#editorModuleTopLeft .selectionBarStackList');
  const rowElements = list.querySelectorAll('.selectionBarStackRow');
  const rows = [];
  for(let i = 0; i < rowElements.length; i++)
    rows.push({
      id: rowElements[i].querySelector('.selectionBarStackId').textContent,
      idCut: isCut(rowElements[i].querySelector('.selectionBarStackId')),
      notesCut: isCut(rowElements[i].querySelector('.selectionBarStackNotes'))
    });
  return { rows, overflow: list.scrollWidth - list.clientWidth };
});

// A row is picked by its id, so a panel too narrow for the whole row has to take
// the notes off it rather than the id: "ba..." names no widget at all, while a
// cut note still reads as "there is something about this one" - and the row's
// tooltip carries the whole note anyway. An id longer than the row itself is the
// one that is cut, and even then it must not widen the list.
test('A narrow panel cuts the notes of a stack row, never the widget id', async t => {
  await t.resizeWindow(500, 900);
  await setRoomState({
    board:       { id: 'board', type: 'basic', x: 0, y: 0, width: 1600, height: 1000, layer: -4, movableInEdit: false },
    playerAid40: { id: 'playerAid40', type: 'holder', x: 300, y: 200, width: 300, height: 300, classes: 'transparent', layer: 6, movableInEdit: false },
    scoreCardForPlayerFour: { id: 'scoreCardForPlayerFour', type: 'basic', parent: 'playerAid40', x: 40, y: 40, width: 200, height: 200, layer: 10, movableInEdit: false, classes: 'transparent' },
    aVeryLongWidgetIdNoPanelWillEverShowInFull: { id: 'aVeryLongWidgetIdNoPanelWillEverShowInFull', type: 'basic', parent: 'playerAid40', x: 60, y: 60, width: 160, height: 160, layer: 11 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const bar = Selector('#editorModuleTopLeft .selectionBar');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    .hover('#w_aVeryLongWidgetIdNoPanelWillEverShowInFull')
    .click(bar.find('button[icon=layers]'))
    .hover('#w_aVeryLongWidgetIdNoPanelWillEverShowInFull')
    .expect(bar.find('.selectionBarStackRow').count).eql(4);

  const fit = await stackRowFit();
  // the panel has to be too narrow for these rows, or the test proves nothing
  await t.expect(fit.rows.filter(row => row.notesCut).length).gt(0, 'the notes give way first');
  await t.expect(fit.rows.filter(row => row.id.length < 30 && row.idCut).length).eql(0, 'no id that fits at all is cut');
  await t.expect(fit.overflow).lte(1, 'the id that fits nowhere is cut instead of widening the list');
  // and what a narrow row cannot show is still one hover away
  await t
    .expect(bar.find('.selectionBarStackRow').nth(3).getAttribute('title')).contains('board - on layer -4 · locked in edit mode')
    .click(bar.find('button[icon=layers]'));
  await setEditorState(null);
});

// Two modules that edit the selection are two bars, and the room tree is a single
// DOM node they take turns holding - so it has to be handed over rather than
// duplicated, and handed back when the module holding it is closed.
test('Two docked modules each get a selection bar and take turns holding the tree', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    widget: { id: 'widget', type: 'basic', x: 200, y: 200 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState({ modules: { 'Edit Widgets': 'editorModuleTopLeft', JSON: 'editorModuleBottomLeft' } });
  await setName(t);

  const propertiesBar = Selector('#editorModuleTopLeft .selectionBar');
  const jsonBar = Selector('#editorModuleBottomLeft .selectionBar');
  const treeInProperties = Selector('#editorModuleTopLeft .selectionBarTree #jeTree');
  const treeInJson = Selector('#editorModuleBottomLeft .selectionBarTree #jeTree');

  await t
    .click('#editButton')
    .expect(propertiesBar.exists).ok()
    .expect(jsonBar.exists).ok()
    // the tree is where it was last opened, and opening it in the other bar takes
    // it along instead of leaving an empty dropdown behind
    .click(propertiesBar.find('button[icon=account_tree]'))
    .expect(treeInProperties.exists).ok()
    .click(jsonBar.find('button[icon=account_tree]'))
    .expect(treeInJson.exists).ok()
    .expect(treeInProperties.exists).notOk()
    .expect(propertiesBar.find('button[icon=account_tree].active').exists).notOk()
    // closing the module that holds it gives it back to the JSON editor it belongs to
    .click('#editorSidebar button[icon=data_object]')
    .expect(jsonBar.exists).notOk()
    .expect(Selector('#jeEditArea #jeTree').exists).ok()
    // and the bar of the module that stayed open still works
    .click(propertiesBar.find('button[icon=account_tree]'))
    .expect(treeInProperties.exists).ok()
    // the tree works exactly like the list of widgets under the pointer: picking
    // a widget in it selects that widget and leaves the dropdown standing, and
    // only its own button closes it again. There is no pin.
    .expect(propertiesBar.find('button.selectionBarPin').exists).notOk()
    .click(treeInProperties.find('.jeTreeWidget').withText('widget'))
    .expect(Selector('#w_widget').hasClass('selectedInEdit')).ok()
    .expect(treeInProperties.exists).ok()
    .click(propertiesBar.find('button[icon=account_tree]'))
    .expect(treeInProperties.exists).notOk();
  await setEditorState(null);
});

// Everything the tree does is worth nothing if a branch cannot be folded away,
// and it could not: the filter marks every branch that holds a match so it stays
// open whatever its collapsed state is - and an empty filter matches everything.
// So a filter that had been typed and taken out again pinned the whole tree open
// for the rest of the session, with the arrow and the keys still flipping the
// glyph and nothing below it ever going away.
test('A branch of the tree still folds away after the filter box has been used', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    board:   { id: 'board',   type: 'basic',  x: 0,   y: 0,   width: 1600, height: 1000, layer: -4 },
    point:   { id: 'point',   type: 'holder', x: 300, y: 200, width: 200,  height: 400 },
    checker: { id: 'checker', type: 'basic',  x: 40,  y: 60,  width: 100,  height: 100, parent: 'point' }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const bar = Selector('#editorModuleTopLeft .selectionBar');
  const tree = Selector('#editorModuleTopLeft .selectionBarTree #jeTree');
  const checkerRow = tree.find('li[data-id=checker]');

  await t
    .click('#editButton')
    .click(bar.find('button[icon=account_tree]'))
    .expect(checkerRow.visible).ok()

    // type a filter and take it out again
    .typeText(tree.find('#jeWidgetSearchBox'), 'checker')
    .expect(tree.find('li[data-id=board]').visible).notOk()
    .selectText(tree.find('#jeWidgetSearchBox')).pressKey('delete')
    .expect(tree.find('li[data-id=board]').visible).ok()

    // the keys still fold the branch away, and the arrow still does too. Nothing
    // is selected here, so the keyboard starts above the first row.
    .pressKey('down')
    .pressKey('down')
    .expect(tree.find('li[data-id=point] > .selectionBarKeyRow').exists).ok()
    .pressKey('left')
    .expect(checkerRow.visible).notOk()
    .pressKey('right')
    .expect(checkerRow.visible).ok()
    .click(tree.find('li[data-id=point] > .jeTreeExpander'), { offsetX: 5 })
    .expect(checkerRow.visible).notOk();
  await setEditorState(null);
});

// The filter opens the branches that hold a match, but that has to stay a
// suggestion: a branch the user folds away has to go away, filter or no filter.
test('A branch folds away while the filter box still holds text', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    board:   { id: 'board',   type: 'basic',  x: 0,   y: 0,   width: 1600, height: 1000, layer: -4 },
    point:   { id: 'point',   type: 'holder', x: 300, y: 200, width: 200,  height: 400 },
    checker: { id: 'checker', type: 'basic',  x: 40,  y: 60,  width: 100,  height: 100, parent: 'point' },
    stack:   { id: 'stack',   type: 'pile',   x: 700, y: 200 },
    checkerB:{ id: 'checkerB',type: 'basic',  x: 700, y: 200, width: 100,  height: 100, parent: 'stack' }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const bar = Selector('#editorModuleTopLeft .selectionBar');
  const tree = Selector('#editorModuleTopLeft .selectionBarTree #jeTree');
  const checkerRow = tree.find('li[data-id=checker]');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    .click(bar.find('button[icon=account_tree]'))
    .typeText(tree.find('#jeWidgetSearchBox'), 'checker')
    .expect(tree.find('li[data-id=board]').visible).notOk()
    .expect(checkerRow.visible).ok()

    // a pile starts out collapsed - the filter opens it, and says so with its arrow
    .expect(tree.find('li[data-id=checkerB]').visible).ok()
    .expect(tree.find('li[data-id=stack] > .jeTreeExpander-down').exists).ok()

    // the arrow folds the branch away although the filter still stands
    .click(tree.find('li[data-id=point] > .jeTreeExpander'), { offsetX: 5 })
    .expect(checkerRow.visible).notOk()
    .click(tree.find('li[data-id=point] > .jeTreeExpander'), { offsetX: 5 })
    .expect(checkerRow.visible).ok()

    // and so does the arrow key. Nothing is selected here, so the keyboard
    // starts above the first row - which the filter has cut down to the branch.
    .pressKey('down')
    .expect(tree.find('li[data-id=point] > .selectionBarKeyRow').exists).ok()
    .pressKey('left')
    .expect(checkerRow.visible).notOk()
    .pressKey('right')
    .expect(checkerRow.visible).ok();
  await setEditorState(null);
});

// A dropdown covers the panel it hangs in, so a click on that panel is a click on
// something the dropdown is hiding. The room is the exception: the stack list is
// filled from there, and picking a widget must not take the list of what lies
// under it away.
test('Clicking the sidebar next to a dropdown closes it, clicking the room does not', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    board:   { id: 'board',   type: 'basic',  x: 0,   y: 0,   width: 1600, height: 1000, layer: -4 },
    checker: { id: 'checker', type: 'basic',  x: 300, y: 200, width: 100,  height: 100 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const bar = Selector('#editorModuleTopLeft .selectionBar');
  const tree = Selector('#editorModuleTopLeft .selectionBarTree #jeTree');

  await t
    .click('#editButton')
    .click(bar.find('button[icon=account_tree]'))
    .expect(tree.exists).ok()
    // a click inside the dropdown is not a click next to it
    .click(tree.find('#jeWidgetSearchBox'))
    .expect(tree.exists).ok()
    .click(propertiesModule, { offsetX: 100, offsetY: 500 })
    .expect(tree.exists).notOk()

    // the stack list goes the same way, but survives working in the room
    .hover('#w_checker')
    .click(bar.find('button[icon=layers]'))
    .expect(bar.hasClass('stackVisible')).ok()
    .click('#w_checker')
    .expect(bar.hasClass('stackVisible')).ok()
    .click(propertiesModule, { offsetX: 100, offsetY: 500 })
    .expect(bar.hasClass('stackVisible')).notOk();
  await setEditorState(null);
});

// The outline the selected widgets wear is about the selection, so its switch
// belongs on the bar that is about the selection - it used to be a button of the
// JSON editor's command pane, out of reach of everyone who never opens that. It
// also has to stay switched off when the editor moves on to another widget.
test('The selection bar switches the outline of the selected widgets off and on', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    one: { id: 'one', type: 'basic', x: 200, y: 200, width: 100, height: 100 },
    two: { id: 'two', type: 'basic', x: 400, y: 200, width: 100, height: 100 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const bar = Selector('#editorModuleTopLeft .selectionBar');
  const highlight = bar.find('button[icon=flashlight_on]');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    .click('#w_one')
    .expect(Selector('#w_one').hasClass('selectedInEdit')).ok()
    .expect(highlight.hasClass('active')).ok()
    .click(highlight)
    .expect(Selector('#w_one').hasClass('selectedInEdit')).notOk()
    .expect(highlight.hasClass('active')).notOk()
    // moving on to another widget must not switch it back on behind the user's back
    .click('#w_two')
    .expect(Selector('#w_two').hasClass('selectedInEdit')).notOk()
    .click(highlight)
    .expect(Selector('#w_two').hasClass('selectedInEdit')).ok()
    .expect(highlight.hasClass('active')).ok();
  await setEditorState(null);
});

// Holding a key that is not a modifier is not something pressKey() can do in
// every browser: Chrome is driven through the browser's own automation and holds
// the Tab down, Firefox is driven by events TestCafe builds itself and lets go of
// it again before the next key. So the chord is built here, out of plain
// KeyboardEvents - the window listener behind it sees no difference.
const pressTabChord = ClientFunction(key => {
  const send = (type, k) => document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
  send('keydown', 'Tab');
  send('keydown', key);
  send('keyup', 'Tab');
});

// The two arrows name Tab+Left and Tab+Right in their tooltip, and the gesture
// only ever existed inside the JSON text area - so in Edit Widgets, the module
// edit mode opens by default, they promised a shortcut that did nothing.
test('Tab and an arrow key walk the widget history outside the JSON editor', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    one: { id: 'one', type: 'basic', x: 200, y: 200, width: 100, height: 100 },
    two: { id: 'two', type: 'basic', x: 400, y: 200, width: 100, height: 100 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState(propertiesModuleOpen);
  await setName(t);

  const back = Selector('#editorModuleTopLeft .selectionBar button[icon=arrow_back]');

  await t
    .click('#editButton')
    .expect(propertiesModule.exists).ok()
    .click('#w_one')
    .expect(Selector('#w_one').hasClass('selectedInEdit')).ok()
    .click('#w_two')
    .expect(Selector('#w_two').hasClass('selectedInEdit')).ok()
    // two widgets in the history, so there is something to go back to
    .expect(back.hasAttribute('disabled')).notOk();
  await pressTabChord('ArrowLeft');
  await t.expect(Selector('#w_one').hasClass('selectedInEdit')).ok();
  await pressTabChord('ArrowRight');
  await t.expect(Selector('#w_two').hasClass('selectedInEdit')).ok();
  await setEditorState(null);
});

// Going back to a widget restores the scroll position and the cursor it was left
// with, which is no use if the keyboard has been left somewhere else by then: the
// JSON module blurs its text area on every selection change, so the arrows have
// to hand it back to what the user was working in.
const activeElementID = ClientFunction(() => document.activeElement && document.activeElement.id);

test('Back and forward give the keyboard back to the JSON editor', async t => {
  await t.resizeWindow(1280, 800);
  await setRoomState({
    one: { id: 'one', type: 'basic', x: 200, y: 200, width: 100, height: 100 },
    two: { id: 'two', type: 'basic', x: 400, y: 200, width: 100, height: 100 }
  });
  await ClientFunction(prepareClient)();
  await setEditorState({ modules: { JSON: 'editorModuleTopLeft' } });
  await setName(t);

  const bar = Selector('#editorModuleTopLeft .selectionBar');

  await t
    .click('#editButton')
    .expect(Selector('#editorModuleTopLeft.data_object').exists).ok()
    .click('#w_one')
    .expect(Selector('#w_one').hasClass('selectedInEdit')).ok()
    .click('#w_two')
    .expect(Selector('#w_two').hasClass('selectedInEdit')).ok()
    .expect(bar.find('button[icon=arrow_back]').hasAttribute('disabled')).notOk()
    .click('#jeText')
    .expect(activeElementID()).eql('jeText')
    .click(bar.find('button[icon=arrow_back]'))
    .expect(Selector('#w_one').hasClass('selectedInEdit')).ok()
    .expect(activeElementID()).eql('jeText')
    .click(bar.find('button[icon=arrow_forward]'))
    .expect(Selector('#w_two').hasClass('selectedInEdit')).ok()
    .expect(activeElementID()).eql('jeText');
  await setEditorState(null);
});
