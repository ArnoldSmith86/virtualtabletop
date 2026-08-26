import { getStateObject } from './test-util.js';
import { stateWhen } from './interaction-util.js';

// The probe game the holder-event fixtures drive, shared by holderevents.js (what the engine
// does now) and enterleave.js (what the legacyHolderEnterLeaveEvents mode restores, plus the
// combinations that need more than two holders).
//
// How the trace works: every routine appends one entry to a log widget, and each entry carries
// the properties of the widget the event is about, read at that moment. The holders write
// distinguishable marks through onEnter/onLeave, so an entry saying `mark=null` means "this
// routine ran before the property half of the event", and `parent=handB` means "the parent was
// already written when this routine ran".

export const CARD = 'card1';

// The fields an entry records. Coordinates are only meaningful where the case makes them
// deterministic - a routine that fires in the middle of a drag sees wherever the pointer was -
// so they are opt-in per holder.
export const DEFAULT_FIELDS = [ 'parent', 'mark', 'owner' ];

function observation(fields, id) {
  return fields.map(property=>`${property}=\${PROPERTY ${property} OF ${id}}`).join(' ');
}

// One trace entry, appended to the log widget's `trace` property. Reading the log through
// ${PROPERTY trace OF log} rather than a variable is what makes it accumulate across the
// separate routine invocations the engine makes.
export function traceRoutine(tag, fields, id = CARD) {
  return [
    { func: 'SELECT', property: 'id', value: 'log', collection: 'log' },
    { func: 'SET', collection: 'log', property: 'trace', value: `\${PROPERTY trace OF log}${tag}[${observation(fields, id)}];` }
  ];
}

// A trace that names the widget the event was about instead of watching a fixed one - what the
// pile cases need, where the event can be about a card or about the pile holding it.
export function traceChildRoutine(tag, fields = DEFAULT_FIELDS) {
  return [
    { func: 'GET', collection: 'child', property: 'id', variable: 'childID' },
    ...fields.map(property => ({ func: 'GET', collection: 'child', property, variable: `f_${property}` })),
    { func: 'SELECT', property: 'id', value: 'log', collection: 'log' },
    { func: 'SET', collection: 'log', property: 'trace',
      value: `\${PROPERTY trace OF log}${tag} \${childID}[${fields.map(p=>`${p}=\${f_${p}}`).join(' ')}];` }
  ];
}

export function holder(id, properties = {}, { enterFields = DEFAULT_FIELDS, leaveFields = DEFAULT_FIELDS, watchChild = false } = {}) {
  return Object.assign({
    id, type: 'holder', width: 350, height: 250,
    onEnter: { mark: `enter-${id}` },
    onLeave: { mark: `leave-${id}` },
    enterRoutine: watchChild ? traceChildRoutine(`enter ${id}`, enterFields) : traceRoutine(`enter ${id}`, enterFields),
    leaveRoutine: watchChild ? traceChildRoutine(`leave ${id}`, leaveFields) : traceRoutine(`leave ${id}`, leaveFields)
  }, properties);
}

// Two holders far enough apart that a drag between them leaves the first one's box, a card on
// the table, a log widget and a button for the routine-driven cases.
export function fixtureState(overrides = {}, holderOptions = {}) {
  const state = {
    deck:  { id: 'deck', type: 'deck', cardTypes: { plain: {} }, x: 1450, y: 20 },
    card1: { id: CARD, type: 'card', deck: 'deck', cardType: 'plain', x: 700, y: 60 },
    log:   { id: 'log', type: 'basic', x: 700, y: 900, width: 80, height: 80, trace: '' },
    go:    { id: 'go', type: 'button', x: 700, y: 420, width: 100, height: 60, text: 'go' },
    handA: holder('handA', { x: 80,   y: 650 }, holderOptions),
    handB: holder('handB', { x: 1150, y: 650 }, holderOptions)
  };
  for(const [ id, properties ] of Object.entries(overrides))
    state[id] = state[id] ? Object.assign(state[id], properties) : Object.assign({ id }, properties);
  return state;
}

// A second card of the same deck, for the cases that need two.
export function card(id, properties = {}) {
  return Object.assign({ id, type: 'card', deck: 'deck', cardType: 'plain' }, properties);
}

// Read the log until it holds as many entries as the case expects, then give the engine a
// moment to add one more: a case that fires three routines where the test expects two has to go
// red rather than pass on a snapshot taken between them.
export async function readTrace(t, expectedLength) {
  const entries = state=>String((state.log||{}).trace||'').split(';').filter(entry=>entry);
  const state = await stateWhen(s=>entries(s).length >= expectedLength);
  await t.wait(400);
  return entries(await getStateObject());
}

export async function expectTrace(t, expected, message) {
  await t.expect(await readTrace(t, expected.length)).eql(expected, message);
}

export async function clickGo(t) {
  await t.click('#w_go');
}
