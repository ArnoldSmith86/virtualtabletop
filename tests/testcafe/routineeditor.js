// Deep TestCafe coverage for the expanded-widget routine editor (from PR #3034):
// builds a clickRoutine entirely through UI clicks/typing (never by pasting JSON
// directly into the game file) and verifies both the resulting widget JSON and
// that the built automation actually runs.
//
// The editor words every operation as a sentence: the phrase it starts with is
// the way the operation works (its variant), the optional parts of the sentence
// are its options (clauses) and every blank in it is a parameter chip.
import { ClientFunction, Selector } from 'testcafe';

import { getWidgets, prepareClient, setName, setRoomState, setupTestEnvironment, waitForWidgets } from './test-util.js';

setupTestEnvironment();

const popups = Selector('.inline-popup');
// popups stack (a parameter popup can open an info popup on top of it), so every
// helper below acts on the top-most one instead of whichever comes first in the DOM
const popup = popups.nth(-1);

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// an entry of one of the editor's menus (the ways an operation can work, the
// options it offers, the phrases a setting can say). A variant entry appends a
// note about what picking it would replace, so the label is matched at its start
function menuEntry(label) {
  return popup.find('.popup-menu-entry-label').withText(new RegExp(`^${escapeRegExp(label)}(replaces|$)`));
}

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

// opens the "add operation" popup at the given routine level and picks the
// operation by the raw name the list shows above every example sentence
async function addOperation(t, addButtonSelector, funcName) {
  await t.click(addButtonSelector);
  await t.click(popup.find('.popup-operation-func').withExactText(funcName));
}

// the sentence and the warnings of an operation, excluding its nested routine
// editors (those are siblings of the header, not part of it)
function opBody(opSelector) {
  return opSelector.child('.routine-editor-operation-header').child('.routine-editor-operation-body');
}

function paramChip(opSelector, name) {
  return opBody(opSelector).find(`[data-parameter="${name}"]`);
}

// the ⊖ that takes an option back out of the sentence
function clauseRemove(opSelector, clauseID) {
  return opBody(opSelector).find(`.routine-editor-clause-remove[data-clause="${clauseID}"]`);
}

function dragHandle(opSelector) {
  return opSelector.child('.routine-editor-operation-header').find('.routine-editor-drag-handle');
}

function opButton(opSelector, title) {
  return opSelector.child('.routine-editor-operation-header').find(`[title="${title}"]`);
}

// picks another way for the operation to work, from the drop-down the sentence
// starts with
async function pickVariant(t, opSelector, label) {
  await t.click(opBody(opSelector).find('.routine-editor-variant-menu'));
  await t.click(menuEntry(label));
}

// switches one of the operation's options on, which puts its phrase into the sentence
async function addClause(t, opSelector, label) {
  await t.click(opBody(opSelector).find('.routine-editor-add-clause'));
  await t.click(menuEntry(label));
}

async function setStringParam(t, chip, value) {
  await t.click(chip);
  await t.typeText(popup.find('.popup-value-input'), value, { replace: true }).pressKey('tab');
}

async function setJsonParam(t, chip, jsonText) {
  await t.click(chip);
  await t.typeText(popup.find('textarea'), jsonText, { replace: true }).pressKey('tab');
}

// the number popup offers the numbers a parameter usually takes as buttons,
// worded the way the sentence words them (a CLICK count reads "3 times")
async function setNumberValue(t, chip, label) {
  await t.click(chip);
  await t.click(popup.find('.accordion-content.open button').withExactText(String(label)));
}

// a setting is a drop-down of the phrases it can say, worded the way the
// sentence words them
async function setSetting(t, chip, label) {
  await t.click(chip);
  await t.click(menuEntry(label));
}

async function openSection(t, title) {
  await t.click(popup.find('.accordion-section h3').withText(title));
}

// one of the values/groups the routine has, from the section that lists them
async function pickRoutineValue(t, chip, sectionTitle, kind, name) {
  await t.click(chip);
  await openSection(t, sectionTitle);
  await t.click(popup.find(`.accordion-content.open button[data-kind="${kind}"]`).withExactText(name));
}

// "Property <name> of <widget>" - the builder that writes a ${PROPERTY ...} reference
async function setWidgetPropertyReference(t, chip, propertyName) {
  await t.click(chip);
  await openSection(t, 'A property of a widget in the room');
  await t.typeText(popup.find('.popup-property-name'), propertyName, { replace: true });
  await t.click(popup.find('.accordion-content.open button').withExactText('use property'));
}

async function setFullOperationJSON(t, opSelector, jsonText) {
  await t.click(opSelector.child('.routine-editor-operation-header').find('.routine-editor-operation-json'));
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

// the overlapping area of the top-most popup and the play area, in pixels
const popupOverlapWithRoom = ClientFunction(() => {
  const popups = document.querySelectorAll('.inline-popup');
  const popup = popups[popups.length-1].getBoundingClientRect();
  const room = document.querySelector('#roomArea').getBoundingClientRect();
  return Math.max(0, Math.min(popup.right, room.right) - Math.max(popup.left, room.left))
       * Math.max(0, Math.min(popup.bottom, room.bottom) - Math.max(popup.top, room.top));
});

const popupIsOnScreen = ClientFunction(() => {
  const popups = document.querySelectorAll('.inline-popup');
  const popup = popups[popups.length-1].getBoundingClientRect();
  return popup.left >= 0 && popup.top >= 0 && popup.right <= window.innerWidth && popup.bottom <= window.innerHeight;
});

async function readJsonEditorWidget(t) {
  await t.click('#editorSidebar [icon=data_object]');
  const raw = await Selector('#jeText').textContent;
  // the JSON editor renders indentation with U+00A0 (non-breaking space); swap to ASCII before parsing
  return JSON.parse(raw.replace(/ /g, ' '));
}

test('build a clickRoutine entirely through the routine editor UI and verify the JSON', async t => {
  await ClientFunction(prepareClient)();
  await setName(t);
  await openEditModeAndAddButton(t);
  const widgetID = await openClickAutomation(t);
  const addOperationButton = topRoutineEditor().child('.routine-editor-add-operation');

  // --- operation 1: SET - another way of working, a property name, an option ---
  await addOperation(t, addOperationButton, 'SET');
  let op = topOperations().nth(-1);
  await pickVariant(t, op, 'Increase');
  await setStringParam(t, paramChip(op, 'property'), 'clicks');
  await addClause(t, op, 'a named group of widgets');
  await pickRoutineValue(t, paramChip(op, 'collection'), 'Groups of widgets the routine has', 'collection', 'thisButton');

  // --- operation 2: a "var" statement - the name and the value of a computed value ---
  await addOperation(t, addOperationButton, 'var');
  op = topOperations().nth(-1);
  await setStringParam(t, paramChip(op, 'variable'), 'greeting');
  await setStringParam(t, paramChip(op, 'x'), "'hi'");

  // --- operation 3: IF - a predefined value, nested thenRoutine/elseRoutine blocks ---
  await addOperation(t, addOperationButton, 'IF');
  op = topOperations().nth(-1);
  await pickRoutineValue(t, paramChip(op, 'operand1'), 'Values the routine has', 'variable', 'playerName');
  await setStringParam(t, paramChip(op, 'operand2'), 'TestCafe');

  const thenEditor = op.child('.routine-editor').nth(0);
  await addOperation(t, thenEditor.child('.routine-editor-add-operation'), 'SET');
  const thenOp = thenEditor.child('.routine-editor-operation').nth(-1);
  await setStringParam(t, paramChip(thenOp, 'property'), 'text');
  await setJsonParam(t, paramChip(thenOp, 'value'), '"CLICKED"');

  await t.click(op.child('.routine-editor-add-else'));
  const elseEditor = op.child('.routine-editor').nth(1);
  await addOperation(t, elseEditor.child('.routine-editor-add-operation'), 'SET');
  const elseOp = elseEditor.child('.routine-editor-operation').nth(-1);
  await setStringParam(t, paramChip(elseOp, 'property'), 'text');
  await setJsonParam(t, paramChip(elseOp, 'value'), '"NOPE"');

  // --- operation 4: FOREACH - the range way of repeating, with a nested block ---
  await addOperation(t, addOperationButton, 'FOREACH');
  op = topOperations().nth(-1);
  await pickVariant(t, op, 'For each number in the range');
  await t.click(paramChip(op, 'range'));
  await t.typeText(popup.find('input[type=number]').nth(0), '1', { replace: true });
  await t.typeText(popup.find('input[type=number]').nth(1), '3', { replace: true });
  await t.typeText(popup.find('input[type=number]').nth(2), '1', { replace: true });
  await t.click(popup.find('button').withExactText('use range'));

  const loopEditor = op.child('.routine-editor').nth(0);
  await addOperation(t, loopEditor.child('.routine-editor-add-operation'), 'DELAY');
  const delayOp = loopEditor.child('.routine-editor-operation').nth(-1);
  await setNumberValue(t, paramChip(delayOp, 'milliseconds'), 5);

  // --- operation 5: CLICK - built entirely via the JSON shortcut of the card ---
  await addOperation(t, addOperationButton, 'CLICK');
  op = topOperations().nth(-1);
  await setFullOperationJSON(t, op, JSON.stringify({ func: 'CLICK', collection: 'thisButton', count: 2, mode: 'ignoreClickable' }));

  // --- operation 6: SELECT - a setting drop-down and a named result group ---
  await addOperation(t, addOperationButton, 'SELECT');
  op = topOperations().nth(-1);
  await setStringParam(t, paramChip(op, 'property'), 'type');
  await setSetting(t, paramChip(op, 'relation'), 'is not');
  await setJsonParam(t, paramChip(op, 'value'), '"card"');
  await addClause(t, op, 'give this group a name');
  await setStringParam(t, paramChip(op, 'collection'), 'notCards');

  // --- operation 7: GET - a widget-property reference and a named result ---
  await addOperation(t, addOperationButton, 'GET');
  op = topOperations().nth(-1);
  await setWidgetPropertyReference(t, paramChip(op, 'property'), 'text');
  await addClause(t, op, 'name the result');
  await setStringParam(t, paramChip(op, 'variable'), 'currentText');

  const expectedRoutine = [
    { func: 'SET', property: 'clicks', value: 1, relation: '+', collection: 'thisButton' },
    'var greeting = \'hi\'',
    {
      func: 'IF', operand1: '${playerName}', operand2: 'TestCafe',
      thenRoutine: [ { func: 'SET', property: 'text', value: 'CLICKED' } ],
      elseRoutine: [ { func: 'SET', property: 'text', value: 'NOPE' } ]
    },
    { func: 'FOREACH', range: [ 1, 3, 1 ], loopRoutine: [ { func: 'DELAY', milliseconds: 5 } ] },
    { func: 'CLICK', collection: 'thisButton', count: 2, mode: 'ignoreClickable' },
    { func: 'SELECT', property: 'type', value: 'card', relation: '!=', collection: 'notCards' },
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

  // build "increase the clicks property by 1" entirely through UI clicks/typing
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'SET');
  const op = topOperations().nth(-1);
  await pickVariant(t, op, 'Increase');
  await setStringParam(t, paramChip(op, 'property'), 'clicks');
  await addClause(t, op, 'a named group of widgets');
  await pickRoutineValue(t, paramChip(op, 'collection'), 'Groups of widgets the routine has', 'collection', 'thisButton');
  await expectRoutine(t, widgetID, [ { func: 'SET', property: 'clicks', value: 1, relation: '+', collection: 'thisButton' } ]);

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

  // the close button dismisses a popup without applying a change
  await t.click(paramChip(op, 'property'));
  await t.expect(popup.exists).ok();
  await t.click(popup.find('.popup-close'));
  await t.expect(popup.exists).notOk();
  // an empty parameter says what belongs there instead of showing a value
  await t.expect(paramChip(op, 'property').textContent).eql('property');

  // explicitly set a parameter, then use its popup's "use default" button to clear it
  await setStringParam(t, paramChip(op, 'property'), 'clicks');
  await t.expect(paramChip(op, 'property').textContent).eql('clicks');
  await t.click(paramChip(op, 'property'));
  await t.click(popup.find('.popup-use-default'));
  await t.expect(popup.exists).notOk();
  // the parameter is gone from the operation now, so the chip shows the default
  // the engine falls back to instead of the blank a freshly added SET has
  await t.expect(paramChip(op, 'property').textContent).eql('parent');

  // escape closes only the top-most popup: open a parameter popup, then its info popup on top
  await t.click(paramChip(op, 'value'));
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

  // ↗ nests the DELAY into the IF block above it
  await t.click(opButton(topOperations().nth(1), 'Move into the IF block above'));
  await expectRoutine(t, widgetID, [ { func: 'IF', thenRoutine: [ { func: 'DELAY' } ] }, { func: 'FOREACH' } ]);

  // ↤ moves it back out, right after the block it came from
  const nestedOperation = topOperations().nth(0).child('.routine-editor').child('.routine-editor-operation');
  await t.click(opButton(nestedOperation, 'Move out of this block'));
  await expectRoutine(t, widgetID, [ { func: 'IF', thenRoutine: [] }, { func: 'DELAY' }, { func: 'FOREACH' } ]);

  // ↘ nests it into the FOREACH block below it
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

// the phrase a sentence starts with is a way of working, and picking another one
// has to rewrite the parameters that tell the ways apart - all of them together,
// because a leftover from the way before would keep deciding what the engine does
test('the variant menu rewrites the parameters that tell the ways of working apart', async t => {
  await ClientFunction(prepareClient)();
  await setName(t);
  await openEditModeAndAddButton(t);
  const widgetID = await openClickAutomation(t);

  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'SET');
  const op = topOperations().nth(-1);
  await setStringParam(t, paramChip(op, 'property'), 'score');
  await setJsonParam(t, paramChip(op, 'value'), '2');
  await expectRoutine(t, widgetID, [ { func: 'SET', property: 'score', value: 2 } ]);

  // the value the creator entered survives a change of the way it is used...
  await pickVariant(t, op, 'Increase');
  await expectRoutine(t, widgetID, [ { func: 'SET', property: 'score', value: 2, relation: '+' } ]);
  await t.expect(opBody(op).innerText).contains('score of the picked widgets by 2');

  // ...but a way that has no value of its own drops it instead of keeping a
  // number around that the engine would still read
  await pickVariant(t, op, 'Toggle');
  await expectRoutine(t, widgetID, [ { func: 'SET', property: 'score', relation: '!' } ]);
  await t.expect(paramChip(op, 'value').exists).notOk();

  // and back to the plain assignment, which is the one without a relation at all
  await pickVariant(t, op, 'Set');
  await expectRoutine(t, widgetID, [ { func: 'SET', property: 'score' } ]);
  await t.expect(opBody(op).find('.routine-editor-variant-menu').innerText).contains('Set');
});

// an option is only in the sentence while it is in use: adding one writes the
// parameters it words, and the ⊖ behind it has to take exactly those out again
test('options are added to and taken back out of the sentence', async t => {
  await ClientFunction(prepareClient)();
  await setName(t);
  await openEditModeAndAddButton(t);
  const widgetID = await openClickAutomation(t);

  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'CLICK');
  const op = topOperations().nth(-1);
  await expectRoutine(t, widgetID, [ { func: 'CLICK' } ]);

  await addClause(t, op, 'n times');
  await expectRoutine(t, widgetID, [ { func: 'CLICK', count: 1 } ]);
  await setNumberValue(t, paramChip(op, 'count'), '3 times');
  await expectRoutine(t, widgetID, [ { func: 'CLICK', count: 3 } ]);

  // a second option, whose value is picked from the phrases the setting can say
  await addClause(t, op, 'ignore something');
  await setSetting(t, paramChip(op, 'mode'), 'even the ones that are not clickable');
  await expectRoutine(t, widgetID, [ { func: 'CLICK', count: 3, mode: 'ignoreClickable' } ]);

  // the ⊖ of an option removes only that option's parameter
  await t.click(clauseRemove(op, 'count'));
  await expectRoutine(t, widgetID, [ { func: 'CLICK', mode: 'ignoreClickable' } ]);
  await t.expect(paramChip(op, 'count').exists).notOk();
  await t.click(clauseRemove(op, 'mode'));
  await expectRoutine(t, widgetID, [ { func: 'CLICK' } ]);
  await t.expect(opBody(op).innerText).contains('Click the picked widgets');
});

// the three kinds of "!" the editor puts into a sentence
test('parameter warnings: a deprecated parameter, a typo and a value the routine works out', async t => {
  await ClientFunction(prepareClient)();
  await setName(t);
  await openEditModeAndAddButton(t);
  const widgetID = await openClickAutomation(t);

  // a deprecated parameter is never offered but is shown while a game has it
  // (orange), and a custom property the operation does not declare gets a red
  // one plus a phrase of its own at the end so a typo cannot hide
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'CANVAS');
  const canvasOperation = topOperations().nth(-1);
  await setFullOperationJSON(t, canvasOperation, JSON.stringify({ func: 'CANVAS', mode: 'set', canvas: 'myCanvas', collor: 'red' }));
  await expectRoutine(t, widgetID, [ { func: 'CANVAS', mode: 'set', canvas: 'myCanvas', collor: 'red' } ]);
  await t.expect(opBody(canvasOperation).find('.routine-editor-parameter-warning.deprecated').count).eql(1);
  await t.expect(opBody(canvasOperation).find('.routine-editor-parameter-warning.unsupported').count).eql(1);
  await t.expect(paramChip(canvasOperation, 'collor').textContent).eql('red');

  // the ⊖ of the typo removes it again, and the deprecated one stays
  await t.click(clauseRemove(canvasOperation, 'collor'));
  await expectRoutine(t, widgetID, [ { func: 'CANVAS', mode: 'set', canvas: 'myCanvas' } ]);
  await t.expect(opBody(canvasOperation).find('.routine-editor-parameter-warning.unsupported').count).eql(0);
  await t.expect(opBody(canvasOperation).find('.routine-editor-parameter-warning.deprecated').count).eql(1);

  // a value the routine only works out while it runs decides what the operation
  // does: the sentence says one of the things it may come out as, and the "!"
  // behind the phrase says so instead of the editor pretending to know
  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'SET');
  const setOperation = topOperations().nth(-1);
  await setFullOperationJSON(t, setOperation, JSON.stringify({ func: 'SET', property: 'score', relation: '${myRelation}', value: 2 }));
  await expectRoutine(t, widgetID, [
    { func: 'CANVAS', mode: 'set', canvas: 'myCanvas' },
    { func: 'SET', property: 'score', relation: '${myRelation}', value: 2 }
  ]);
  await t.expect(opBody(setOperation).find('.routine-editor-variant-undetermined').count).eql(1);
  await t.expect(opBody(setOperation).find('.routine-editor-parameter-warning.undetermined').count).eql(1);
  // the value that decides it stays a chip of its own instead of being hidden as decided
  await t.expect(paramChip(setOperation, 'relation').textContent).eql('myRelation');
  // and every way of working says which reference picking it would write over
  await t.click(opBody(setOperation).find('.routine-editor-variant-menu'));
  await t.expect(popup.find('.popup-menu-entry-replaces').nth(0).textContent).eql('replaces relation ${myRelation}');
});

// the editor only knows the parameters it declares itself, so anything the engine
// reads but the editor forgot is offered to the creator as a typo to delete
test('parameters the engine reads are not flagged as unsupported', async t => {
  await ClientFunction(prepareClient)();
  await setName(t);
  await openEditModeAndAddButton(t);
  const widgetID = await openClickAutomation(t);

  const operations = [
    { func: 'MOVEXY', json: { func: 'MOVEXY', from: 'someHolder', z: 5 } },
    { func: 'CALL', json: { func: 'CALL', routine: 'clickRoutine', collection: 'callResult' } },
    { func: 'CANVAS', json: { func: 'CANVAS', mode: 'set', count: 3 } },
    { func: 'INPUT', json: { func: 'INPUT', css: 'color: red', randomRotation: 10 } }
  ];
  for(const operation of operations) {
    await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), operation.func);
    const op = topOperations().nth(-1);
    await setFullOperationJSON(t, op, JSON.stringify(operation.json));
    await t.expect(opBody(op).find('.routine-editor-parameter-warning.unsupported').count).eql(0, `${operation.func} flags a parameter the engine reads`);
  }
  await expectRoutine(t, widgetID, operations.map(o=>o.json));
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
    await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'var');
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

// the multi-selection is index based, so anything that changes the routine has to
// drop it - a selection that outlives the operations it pointed at would move a
// card the creator never picked
test('a Ctrl+selection is dropped as soon as the routine changes', async t => {
  await ClientFunction(prepareClient)();
  await setName(t);
  await openEditModeAndAddButton(t);
  const widgetID = await openClickAutomation(t);

  for(const func of [ 'DELAY', 'CLICK', 'SELECT' ])
    await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), func);

  await t.click(opBody(topOperations().nth(0)), { modifiers: { ctrl: true } });
  await t.click(opBody(topOperations().nth(1)), { modifiers: { ctrl: true } });
  await t.expect(topRoutineEditor().child('.routine-editor-operation-selected').count).eql(2);

  // an edit anywhere in the routine renumbers what the selection pointed at
  await setNumberValue(t, paramChip(topOperations().nth(0), 'milliseconds'), 5);
  await expectRoutine(t, widgetID, [ { func: 'DELAY', milliseconds: 5 }, { func: 'CLICK' }, { func: 'SELECT', property: '', value: '' } ]);
  await t.expect(topRoutineEditor().child('.routine-editor-operation-selected').count).eql(0);
});

// the number popup used to offer "null" next to the numbers although "use default"
// already clears a parameter, and a picker that wants a widget clicked in the room
// must not be placed on top of the room
test('the number popup offers 0 instead of null and widget pickers keep off the play area', async t => {
  await ClientFunction(prepareClient)();
  await setName(t);
  await openEditModeAndAddButton(t);
  const widgetID = await openClickAutomation(t);

  await addOperation(t, topRoutineEditor().child('.routine-editor-add-operation'), 'MOVEXY');
  const op = topOperations().nth(-1);
  await addClause(t, op, 'at the specified stacked (z) position');

  await t.click(paramChip(op, 'z'));
  await t.expect(popup.find('button').withExactText('0').exists).ok();
  await t.expect(popup.find('button').withExactText('null').exists).notOk();
  await t.click(popup.find('button').withExactText('0'));
  await expectRoutine(t, widgetID, [ { func: 'MOVEXY', z: 0 } ]);

  // the widget picker offers "pick in the room", so it has to leave the room
  // visible - on a portrait window, where the room is a wide strip below the
  // editor, that means placing the popup above it instead of next to the chip
  await t.resizeWindow(520, 900);
  await t.click(paramChip(op, 'from'));
  await t.expect(popup.find('button').withText(/pick in the room/i).exists).ok();
  await t.expect(await popupOverlapWithRoom()).eql(0);
  await t.expect(await popupIsOnScreen()).ok();
});
