// Deep TestCafe coverage for the expanded-widget routine editor (from PR #3034):
// builds a clickRoutine entirely through UI clicks/typing (never by pasting JSON
// directly into the game file) and verifies both the resulting widget JSON and
// that the built automation actually runs.
import { ClientFunction, Selector } from 'testcafe';

import { getWidgets, prepareClient, setName, setRoomState, setupTestEnvironment, waitForWidgets } from './test-util.js';

setupTestEnvironment();

const popups = Selector('.inline-popup');
// popups stack (a parameter popup can open an info popup on top of it), so every
// helper below acts on the top-most one instead of whichever comes first in the DOM
const popup = popups.nth(-1);

async function openEditModeAndAddButton(t) {
  await t
    .resizeWindow(1280, 900)
    .click('#editButton')
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-button');
}

// selects the newly added button and opens its properties panel with the
// click-event automation expanded, ready for the routine editor to be driven
async function openClickAutomation(t) {
  const button = await waitForWidgets(widgets => Object.values(widgets).find(w => w.type == 'button' && w.text == 'DEAL'));
  await t.click('#editorSidebar [icon=tune]');
  await t.click(Selector('.events-editor-label').withText('click'));
  return button.id;
}

function topRoutineEditor() {
  return Selector('.events-editor-event-content').child('.routine-editor');
}

function topOperations() {
  return topRoutineEditor().child('.routine-editor-operation');
}

// opens the "add operation" popup at the given scope, switches to "All Operations"
// (Common Actions only lists a handful of presets) and picks the operation whose
// example sentence starts with the given function name (or exact text for var/comment)
async function addOperation(t, addButtonSelector, funcNameOrText) {
  await t.click(addButtonSelector);
  await t.click(popup.find('.accordion-section h3').withText('All Operations'));
  const regex = /^[A-Z]/.test(funcNameOrText) ? new RegExp('^' + funcNameOrText + '\\b') : funcNameOrText;
  await t.click(popup.find('.accordion-content.open button').withText(regex));
}

// the summary/parameter rows of an operation, excluding its nested routine
// editors (those are siblings of the header, not part of it)
function opBody(opSelector) {
  return opSelector.child('.routine-editor-operation-header').child('.routine-editor-operation-body');
}

async function toListView(t, opSelector) {
  const toggle = opBody(opSelector).find('.routine-editor-view-toggle');
  if(await toggle.exists)
    await t.click(toggle);
}

function paramChip(opSelector, name) {
  return opBody(opSelector).find(`span[data-parameter="${name}"]`);
}

function dragHandle(opSelector) {
  return opSelector.child('.routine-editor-operation-header').child('.routine-editor-operation-buttons').child('.routine-editor-drag-handle');
}

function opButton(opSelector, title) {
  return opSelector.child('.routine-editor-operation-header').child('.routine-editor-operation-buttons').find(`[title="${title}"]`);
}

async function setStringParam(t, chip, value) {
  await t.click(chip);
  await t.typeText(popup.find('input[type=text]'), value, { replace: true }).pressKey('tab');
}

async function setJsonParam(t, chip, jsonText) {
  await t.click(chip);
  await t.typeText(popup.find('textarea'), jsonText, { replace: true }).pressKey('tab');
}

async function setNumberValue(t, chip, value) {
  await t.click(chip);
  await t.typeText(popup.find('input[type=number]'), String(value), { replace: true }).pressKey('tab');
}

async function setEnumParam(t, chip, value) {
  await t.click(chip);
  await t.click(popup.find('.accordion-content.open button').withExactText(String(value)));
}

async function setPredefinedCollection(t, chip, name) {
  await t.click(chip);
  await t.click(popup.find('.accordion-section h3').withText('Predefined Collections'));
  await t.click(popup.find('.accordion-content.open button').withExactText(name));
}

async function setPredefinedVariable(t, chip, name) {
  await t.click(chip);
  await t.click(popup.find('.accordion-section h3').withText('Predefined Variables'));
  await t.click(popup.find('.accordion-content.open button').withExactText(name));
}

async function setWidgetPropertyReference(t, chip, propertyName) {
  await t.click(chip);
  await t.click(popup.find('.accordion-section h3').withText('Widget Properties'));
  await t.click(popup.find('.accordion-content.open button').withExactText(propertyName));
}

async function setFullOperationJSON(t, opSelector, jsonText) {
  await t.click(opSelector.child('.routine-editor-operation-header').child('.routine-editor-operation-json'));
  await t.typeText(popup.find('textarea'), jsonText, { replace: true }).pressKey('tab');
}

// waits for the routine to reach the expected shape and asserts it, so a failure
// shows the actual routine instead of a bare timeout
async function expectRoutine(t, widgetID, expected) {
  try {
    await waitForWidgets(widgets => widgets[widgetID] && JSON.stringify(widgets[widgetID].clickRoutine) == JSON.stringify(expected));
  } catch(e) {
    // fall through to the assertion below, which reports the difference
  }
  const widgets = await getWidgets();
  await t.expect(widgets[widgetID].clickRoutine).eql(expected);
}

async function readJsonEditorWidget(t) {
  await t.click('#editorSidebar [icon=data_object]');
  const raw = await Selector('#jeText').textContent;
  // the JSON editor renders indentation with U+00A0 (non-breaking space); swap to ASCII before parsing
  return JSON.parse(raw.replace(/ /g, ' '));
}

test('build a clickRoutine entirely through the routine editor UI and verify the JSON', async t => {
  await ClientFunction(prepareClient)();
  await setName(t);
  await openEditModeAndAddButton(t);
  const widgetID = await openClickAutomation(t);

  // --- operation 1: SET - simple string/enum/json/collection params ---
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'SET');
  let op = topOperations().nth(-1);
  await toListView(t, op);
  await setStringParam(t, paramChip(op, 'property'), 'clicks');
  await setEnumParam(t, paramChip(op, 'relation'), '+');
  await setJsonParam(t, paramChip(op, 'value'), '1');
  await setPredefinedCollection(t, paramChip(op, 'collection'), 'thisButton');

  // --- operation 2: a "var" statement - string params on a non-expandable operation ---
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'variable x gets value 1');
  op = topOperations().nth(-1);
  await setStringParam(t, paramChip(op, 'variable'), 'greeting');
  await setStringParam(t, paramChip(op, 'expression'), "'hi'");

  // --- operation 3: IF - nested thenRoutine/elseRoutine blocks, a predefined variable ---
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'IF');
  op = topOperations().nth(-1);
  await toListView(t, op);
  await setPredefinedVariable(t, paramChip(op, 'operand1'), 'playerName');
  await setStringParam(t, paramChip(op, 'operand2'), 'TestCafe');

  const thenEditor = op.child('.routine-editor').nth(0);
  await addOperation(t, thenEditor.child('.routine-editor-add-operation'), 'SET');
  let thenOp = thenEditor.child('.routine-editor-operation').nth(-1);
  await toListView(t, thenOp);
  await setStringParam(t, paramChip(thenOp, 'property'), 'text');
  await setJsonParam(t, paramChip(thenOp, 'value'), '"CLICKED"');
  await setPredefinedCollection(t, paramChip(thenOp, 'collection'), 'thisButton');

  await t.click(op.child('.routine-editor-add-else'));
  const elseEditor = op.child('.routine-editor').nth(1);
  await addOperation(t, elseEditor.child('.routine-editor-add-operation'), 'SET');
  let elseOp = elseEditor.child('.routine-editor-operation').nth(-1);
  await toListView(t, elseOp);
  await setStringParam(t, paramChip(elseOp, 'property'), 'text');
  await setJsonParam(t, paramChip(elseOp, 'value'), '"NOPE"');
  await setPredefinedCollection(t, paramChip(elseOp, 'collection'), 'thisButton');

  // --- operation 4: FOREACH - nested loopRoutine block via the Range popup ---
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'FOREACH');
  op = topOperations().nth(-1);
  await t.click(paramChip(op, 'in,range,collection'));
  await t.typeText(popup.find('input[type=number]').nth(0), '1', { replace: true });
  await t.typeText(popup.find('input[type=number]').nth(1), '3', { replace: true });
  await t.typeText(popup.find('input[type=number]').nth(2), '1', { replace: true });
  await t.click(popup.find('button').withExactText('use range'));

  const loopEditor = op.child('.routine-editor').nth(0);
  await addOperation(t, loopEditor.child('.routine-editor-add-operation'), 'DELAY');
  const delayOp = loopEditor.child('.routine-editor-operation').nth(-1);
  await toListView(t, delayOp);
  await setNumberValue(t, paramChip(delayOp, 'milliseconds'), 250);

  // --- operation 5: CLICK - built entirely via the JSON-shortcut on the expanded operation ---
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'CLICK');
  op = topOperations().nth(-1);
  await toListView(t, op);
  await setFullOperationJSON(t, op, JSON.stringify({ func: 'CLICK', collection: 'thisButton', count: 2, mode: 'ignoreClickable' }));

  // --- operation 6: SELECT - dropdown/select param plus a boolean toggle (extra, list-view-only param) ---
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'SELECT');
  op = topOperations().nth(-1);
  await toListView(t, op);
  await setEnumParam(t, paramChip(op, 'type'), 'card');
  await setEnumParam(t, paramChip(op, 'random'), 'true');

  // --- operation 7: GET - a compute/expression field referencing a widget property ---
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'GET');
  op = topOperations().nth(-1);
  await toListView(t, op);
  await setWidgetPropertyReference(t, paramChip(op, 'property'), 'text');
  await setStringParam(t, paramChip(op, 'variable'), 'currentText');

  const expectedRoutine = [
    { func: 'SET', property: 'clicks', relation: '+', value: 1, collection: 'thisButton' },
    'var greeting = \'hi\'',
    {
      func: 'IF', operand1: '${playerName}', operand2: 'TestCafe',
      thenRoutine: [ { func: 'SET', property: 'text', value: 'CLICKED', collection: 'thisButton' } ],
      elseRoutine: [ { func: 'SET', property: 'text', value: 'NOPE', collection: 'thisButton' } ]
    },
    { func: 'FOREACH', range: [ 1, 3, 1 ], loopRoutine: [ { func: 'DELAY', milliseconds: 250 } ] },
    { func: 'CLICK', collection: 'thisButton', count: 2, mode: 'ignoreClickable' },
    { func: 'SELECT', type: 'card', random: true },
    { func: 'GET', property: '${PROPERTY text}', variable: 'currentText' }
  ];

  // verify via the room state (what the game actually stores)...
  const finalWidget = await waitForWidgets(widgets => widgets[widgetID] && widgets[widgetID].clickRoutine && widgets[widgetID].clickRoutine.length == expectedRoutine.length && widgets[widgetID]);
  await t.expect(finalWidget.clickRoutine).eql(expectedRoutine);

  // ...and via the JSON editor, per the requirement to read back through #editorSidebar [icon=data_object]
  const jsonEditorWidget = await readJsonEditorWidget(t);
  await t.expect(jsonEditorWidget.clickRoutine).eql(expectedRoutine);
});

test('a button automation built purely through the UI actually runs when clicked', async t => {
  await ClientFunction(prepareClient)();
  await setName(t);
  await openEditModeAndAddButton(t);
  const widgetID = await openClickAutomation(t);

  // build "increment the clicks property by 1" entirely through UI clicks/typing
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'SET');
  const op = topOperations().nth(-1);
  await toListView(t, op);
  await setStringParam(t, paramChip(op, 'property'), 'clicks');
  await setEnumParam(t, paramChip(op, 'relation'), '+');
  await setJsonParam(t, paramChip(op, 'value'), '1');
  await setPredefinedCollection(t, paramChip(op, 'collection'), 'thisButton');

  await waitForWidgets(widgets => widgets[widgetID] && Array.isArray(widgets[widgetID].clickRoutine) && widgets[widgetID].clickRoutine.length == 1);

  // leave edit mode and click the real widget - this must not be the same as
  // editing the routine, it has to run through the normal play-mode click handler
  await t.click('#editorToolbar [icon=close]');
  await t.click(`#w_${widgetID}`);
  let widget = await waitForWidgets(widgets => widgets[widgetID].clicks == 1 && widgets[widgetID]);
  await t.expect(widget.clicks).eql(1);

  await t.click(`#w_${widgetID}`);
  widget = await waitForWidgets(widgets => widgets[widgetID].clicks == 2 && widgets[widgetID]);
  await t.expect(widget.clicks).eql(2);
});

test('routine editor popups: close button, escape closes only the top-most, and "use default" resets a parameter', async t => {
  await ClientFunction(prepareClient)();
  await setName(t);
  await openEditModeAndAddButton(t);
  await openClickAutomation(t);

  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'SET');
  const op = topOperations().nth(-1);
  await toListView(t, op);

  // the close button dismisses a popup without applying a change
  await t.click(paramChip(op, 'property'));
  await t.expect(popup.exists).ok();
  await t.click(popup.find('.popup-close'));
  await t.expect(popup.exists).notOk();
  await t.expect(paramChip(op, 'property').textContent).eql('parent'); // still the default

  // explicitly set a parameter, then use its popup's "use default" button to clear it
  await setStringParam(t, paramChip(op, 'property'), 'clicks');
  await t.expect(paramChip(op, 'property').textContent).eql('clicks');
  await t.click(paramChip(op, 'property'));
  await t.click(popup.find('.popup-use-default'));
  await t.expect(popup.exists).notOk();
  await t.expect(paramChip(op, 'property').textContent).eql('parent');

  // escape closes only the top-most popup: open a parameter popup, then its info popup on top
  await t.click(paramChip(op, 'collection'));
  await t.expect(popups.count).eql(1);
  await t.click(popup.find('.info-button').nth(0));
  await t.expect(popups.count).eql(2);
  await t.pressKey('esc');
  await t.expect(popups.count).eql(1);
  await t.pressKey('esc');
  await t.expect(popups.count).eql(0);
});

// the buttons on every operation card splice the routine array by index, which is
// exactly where an off-by-one silently reorders or drops a creator's operation
test('operation buttons move, nest, hoist and delete operations', async t => {
  await ClientFunction(prepareClient)();
  await setName(t);
  await openEditModeAndAddButton(t);
  const widgetID = await openClickAutomation(t);

  for(const func of [ 'IF', 'DELAY', 'FOREACH' ])
    await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), func);
  await expectRoutine(t, widgetID, [ { func: 'IF' }, { func: 'DELAY' }, { func: 'FOREACH' } ]);

  // ↰ nests the DELAY into the IF block above it
  await t.click(opButton(topOperations().nth(1), 'Move into the IF block above'));
  await expectRoutine(t, widgetID, [ { func: 'IF', thenRoutine: [ { func: 'DELAY' } ] }, { func: 'FOREACH' } ]);

  // ↱ moves it back out, right after the block it came from
  const nestedOperation = topOperations().nth(0).child('.routine-editor').child('.routine-editor-operation');
  await t.click(nestedOperation.child('.routine-editor-operation-header').find('[title="Move out of this block"]'));
  await expectRoutine(t, widgetID, [ { func: 'IF', thenRoutine: [] }, { func: 'DELAY' }, { func: 'FOREACH' } ]);

  // ↲ nests it into the FOREACH block below it
  await t.click(opButton(topOperations().nth(1), 'Move into the FOREACH block below'));
  await expectRoutine(t, widgetID, [ { func: 'IF', thenRoutine: [] }, { func: 'FOREACH', loopRoutine: [ { func: 'DELAY' } ] } ]);

  // the up/down arrows reorder within the level, carrying the nested block along
  await t.click(opButton(topOperations().nth(1), 'Move this operation up'));
  await expectRoutine(t, widgetID, [ { func: 'FOREACH', loopRoutine: [ { func: 'DELAY' } ] }, { func: 'IF', thenRoutine: [] } ]);
  await t.click(opButton(topOperations().nth(0), 'Move this operation down'));
  await expectRoutine(t, widgetID, [ { func: 'IF', thenRoutine: [] }, { func: 'FOREACH', loopRoutine: [ { func: 'DELAY' } ] } ]);

  await t.click(opButton(topOperations().nth(0), 'Remove this operation'));
  await expectRoutine(t, widgetID, [ { func: 'FOREACH', loopRoutine: [ { func: 'DELAY' } ] } ]);
});

// the three kinds of "!" the editor puts behind a parameter
test('parameter warnings: deprecated, unsupported custom property and ignored parameters', async t => {
  await ClientFunction(prepareClient)();
  await setName(t);
  await openEditModeAndAddButton(t);
  const widgetID = await openClickAutomation(t);

  // CANVAS.canvas is deprecated: an orange "!" in the list view...
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'CANVAS');
  const canvasOperation = topOperations().nth(-1);
  await toListView(t, canvasOperation);
  await t.expect(opBody(canvasOperation).find('.routine-editor-parameter-warning.deprecated').count).eql(1);

  // ...and a custom property the operation does not declare gets a red one, plus
  // its own row at the end of the list so a typo cannot hide
  await setFullOperationJSON(t, canvasOperation, JSON.stringify({ func: 'CANVAS', mode: 'set', collor: 'red' }));
  await expectRoutine(t, widgetID, [ { func: 'CANVAS', mode: 'set', collor: 'red' } ]);
  await t.expect(opBody(canvasOperation).find('.routine-editor-parameter-unsupported').count).eql(1);
  await t.expect(opBody(canvasOperation).find('.routine-editor-parameter-warning.unsupported').count).eql(1);

  // "use default" on the unsupported row removes the property again
  await t.click(paramChip(canvasOperation, 'collor'));
  await t.click(popup.find('.popup-use-default'));
  await expectRoutine(t, widgetID, [ { func: 'CANVAS', mode: 'set' } ]);
  await t.expect(opBody(canvasOperation).find('.routine-editor-parameter-unsupported').count).eql(0);

  // a custom IF condition makes the operand parameters ignored: red "!" on every
  // ignored row in the list view, and no operand chips in the summary
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'IF');
  const ifOperation = topOperations().nth(-1);
  await toListView(t, ifOperation);
  await setStringParam(t, paramChip(ifOperation, 'condition'), 'true');
  await expectRoutine(t, widgetID, [ { func: 'CANVAS', mode: 'set' }, { func: 'IF', condition: 'true' } ]);
  await t.expect(opBody(ifOperation).find('.routine-editor-parameter-ignored').count).eql(3);
  await t.expect(opBody(ifOperation).find('.routine-editor-parameter-ignored-warning').count).eql(3);
  await toListView(t, ifOperation); // back to the sentence view
  await t.expect(opBody(ifOperation).innerText).contains('IF true');
  await t.expect(opBody(ifOperation).find('span[data-parameter="operand1"]').exists).notOk();
});

// dragging moves operations by index between routine levels - the same splice
// arithmetic as the buttons above, but reachable with a single gesture. Every drop
// aims at an "add operation" button: that is the one spot inside a routine level
// which is not an operation card, so the drop always appends to that level and the
// expected result never depends on which half of a card the cursor ended up in.
test('drag and drop: into a nested block, with a Ctrl+click multi-selection, and back out', async t => {
  await ClientFunction(prepareClient)();
  await setName(t);
  await openEditModeAndAddButton(t);
  const widgetID = await openClickAutomation(t);

  for(const name of [ 'a', 'b', 'c' ]) {
    await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'variable x gets value 1');
    await setStringParam(t, paramChip(topOperations().nth(-1), 'variable'), name);
  }
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'IF');
  await expectRoutine(t, widgetID, [ 'var a = 1', 'var b = 1', 'var c = 1', { func: 'IF' } ]);

  // dropping into the still empty THEN block attaches the block to the operation
  let blockAddOperation = topOperations().nth(3).child('.routine-editor').child('.routine-editor-add-operation');
  await t.hover(blockAddOperation); // scroll the block into view before the drag starts
  await t.dragToElement(dragHandle(topOperations().nth(0)), blockAddOperation);
  await expectRoutine(t, widgetID, [ 'var b = 1', 'var c = 1', { func: 'IF', thenRoutine: [ 'var a = 1' ] } ]);

  // a Ctrl+click multi-selection moves as one, keeping the operations in order
  await t.click(opBody(topOperations().nth(0)), { modifiers: { ctrl: true } });
  await t.click(opBody(topOperations().nth(1)), { modifiers: { ctrl: true } });
  await t.expect(topRoutineEditor().child('.routine-editor-operation-selected').count).eql(2);
  blockAddOperation = topOperations().nth(2).child('.routine-editor').child('.routine-editor-add-operation');
  await t.dragToElement(dragHandle(topOperations().nth(0)), blockAddOperation);
  await expectRoutine(t, widgetID, [ { func: 'IF', thenRoutine: [ 'var a = 1', 'var b = 1', 'var c = 1' ] } ]);

  // and dragging one back out of the block appends it to the top level
  const nestedOperation = topOperations().nth(0).child('.routine-editor').child('.routine-editor-operation').nth(0);
  await t.dragToElement(dragHandle(nestedOperation), topRoutineEditor().child('.routine-editor-add-operation'));
  await expectRoutine(t, widgetID, [ { func: 'IF', thenRoutine: [ 'var b = 1', 'var c = 1' ] }, 'var a = 1' ]);
});
