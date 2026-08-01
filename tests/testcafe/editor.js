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
    .click('#editorSidebar [icon=tune]')
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

  const pileTemplate = ClientFunction(() => JSON.stringify((widgets.get('deck').get('cardDefaults') || {}).onPileCreation || null));

  // the handle is the only part of a pile the cards do not cover
  await t
    .click('#editButton')
    .click('#editorSidebar [icon=tune]')
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

test('A deck that overrides the pile template says so while the pile mirrors into it', async t => {
  await setRoomState({
    deck:  { id: 'deck', type: 'deck', cardTypes: { a: { onPileCreation: { text: 'fixed' } } }, faceTemplates: [ { objects: [] } ] },
    pile:  { id: 'pile', type: 'pile', x: 300, y: 200, width: 103, height: 160 },
    card1: { id: 'card1', type: 'card', deck: 'deck', cardType: 'a', parent: 'pile' },
    card2: { id: 'card2', type: 'card', deck: 'deck', cardType: 'a', parent: 'pile' }
  });
  await ClientFunction(prepareClient)();
  await setName(t);

  // cardDefaults is the last place a card looks for onPileCreation, so a card
  // type that sets it wins over everything the mirroring writes there - the
  // warning has to be visible in the mode that does the mirroring, which is
  // also the default one
  await t
    .click('#editButton')
    .click('#editorSidebar [icon=tune]')
    .click(Selector('#w_pile .handle'))
    .expect(Selector('.pileTemplateMode').innerText).contains('pile template')
    .expect(Selector('.pileTemplateMode .pileHelp.warning').innerText).contains('onPileCreation');
});

test('Loading another game with a widget still selected does not break the client', async t => {
  await setRoomState({
    deck: { id: 'deck', type: 'deck', cardTypes: { a: {} }, faceTemplates: [ { objects: [] } ] },
    card: { id: 'card', type: 'card', deck: 'deck', cardType: 'a', x: 100, y: 100 }
  });
  await ClientFunction(prepareClient)();
  await setName(t);
  await ClientFunction(() => {
    window.stateLoadErrors = [];
    window.addEventListener('error', event => window.stateLoadErrors.push(String(event.error || event.message)));
  })();

  await t
    .click('#editButton')
    .click('#editorSidebar [icon=tune]')
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
  await setRoomState({
    block: { id: 'block', type: 'basic', x: 100, y: 100 },
    seat1: { id: 'seat1', type: 'seat', x: 100, y: 400, index: 1 },
    seat2: { id: 'seat2', type: 'seat', x: 300, y: 400, index: 2 },
    board: { id: 'board', type: 'scoreboard', x: 600, y: 100 }
  });
  await ClientFunction(prepareClient)();
  await setName(t);

  const value = ClientFunction((id, property) => JSON.stringify(widgets.get(id).get(property)));

  // where a widget ends up in the stacking order belongs to Position, and the
  // factor it is drawn at to Size
  await t
    .click('#editButton')
    .click('#editorSidebar [icon=tune]')
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
