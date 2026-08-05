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

// the default module opens itself, so it has to be closable without knowing that
// the sidebar button toggles
test('A module is closed again through the button in its header', async t => {
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
    .click('#editorModuleTopLeft h1 .moduleCloseButton')
    .expect(Selector('#editorModuleTopLeft.tune').exists).notOk()
    .expect(Selector('#editor.moduleActive').exists).notOk()
    .expect(Selector('#editorSidebar button[icon=tune].active').exists).notOk();
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
  await compareState(t, 'a8da89943cf6f6fbc9b77ddaab41dc06');
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
  await compareState(t, '3e20074150f78219095df84abeeb74dc');
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
  await compareState(t, '0fe0eb8554cd82ec74d0c2c99513dffa');
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
  await compareState(t, 'a2c9165768e325ccd6c8452f2194d314');
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
  await compareState(t, '6e41185d918e1b8dfe69610ff6f74e77');
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
  await compareState(t, 'd35bd7362c7e87ea9ecb29895cc8d0b9');
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
