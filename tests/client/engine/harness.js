// Layer A: run a routine against a real widget graph in jsdom and read the result back as a
// plain object. No browser, no server, no md5 - so a test costs a few lines instead of a
// TestCafe fixture, and a failure names the property that regressed.
//
// See tests/client/engine/matrix.js for running the same expectations under every legacy-mode
// combination.

import { compute_ops } from '../../../client/js/compute.js';
import { dropTargets, getMaxZ, resetMaxZ, updateMaxZ } from '../../../client/js/main.js';
import { addWidget, widgets } from '../../../client/js/serverstate.js';
import { legacyMode } from '../../../client/js/legacymodes.js';
import { fullLegacyCombination } from '../../../client/js/legacymoderegistry.js';
import { Widget } from '../../../client/js/widgets/widget.js';
import { Label } from '../../../client/js/widgets/label.js';

// widget.js and color.js reach legacyMode() as a global because the room bundle concatenates
// every client module into one scope. jsdom has no bundle, so wire it up once.
globalThis.legacyMode = legacyMode;
globalThis.compute_ops = compute_ops;
// statemanaged.js resolves an inheritFrom chain through the widget map, and removing a widget
// takes it out of the drop target map - both are bundle globals there
globalThis.widgets = widgets;
globalThis.dropTargets = dropTargets;
globalThis.getMaxZ = getMaxZ;
globalThis.resetMaxZ = resetMaxZ;
globalThis.updateMaxZ = updateMaxZ;
// same for the routine logger the JSON editor installs
globalThis.jeRoutineLogging = false;

// jsdom has no CSS layout and no DOMMatrix/DOMPoint, which the geometry helpers use to turn a
// widget's transform into coordinates. Operations that move widgets go through them, so the
// harness supplies identity-only versions: structure (parent, ordering, properties) stays
// faithful, coordinates do not - assert the former, never the latter.
class HarnessDOMPoint {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    Object.assign(this, { x, y, z, w });
  }
}
class HarnessDOMMatrix {
  constructor() {
    Object.assign(this, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, is2D: true });
  }
  multiplySelf() { return this; }
  preMultiplySelf() { return this; }
  translateSelf() { return this; }
  inverse() { return new HarnessDOMMatrix(); }
  transformPoint(point) { return new HarnessDOMPoint(point.x, point.y, point.z, point.w); }
}
globalThis.DOMPoint = globalThis.DOMPoint || HarnessDOMPoint;
globalThis.DOMMatrix = globalThis.DOMMatrix || HarnessDOMMatrix;

// Only the widget modules that carry their own imports can be loaded outside the bundle;
// everything else falls back to the base class, which is what the routine operations act on
// anyway. Behaviour that lives in a subclass belongs in a TestCafe fixture.
const widgetClasses = { widget: Widget, label: Label };

export function setLegacyModes(modes) {
  for(const [ name, value ] of Object.entries(fullLegacyCombination(modes)))
    legacyMode(name, value);
}

// Instantiate a state - an object of widget definitions keyed by id, like a save file without
// _meta. Widgets are added parents-first so children find their parent.
export function setupRoom(state, { legacy = {} } = {}) {
  removeAllWidgets();
  setLegacyModes(legacy);

  const definitions = Object.entries(state).map(([ id, definition ]) => Object.assign({ id }, definition));
  const added = new Set();
  while(added.size < definitions.length) {
    const before = added.size;
    for(const definition of definitions) {
      if(added.has(definition.id) || definition.parent && !added.has(definition.parent))
        continue;
      const widgetClass = widgetClasses[definition.type] || Widget;
      addWidget(definition, new widgetClass(definition.id));
      added.add(definition.id);
    }
    if(added.size == before)
      throw Error(`Widgets ${definitions.filter(d=>!added.has(d.id)).map(d=>d.id).join(', ')} have a missing or circular parent.`);
  }
}

export function removeAllWidgets() {
  for(const id of [ ...widgets.keys() ]) {
    widgets.get(id).applyRemove();
    widgets.delete(id);
    dropTargets.delete(id);
  }
}

// The state as a plain object: every widget's own properties, with the inherited defaults
// left out so an assertion reads like the save file it came from.
export function serializeState() {
  const state = {};
  for(const [ id, widget ] of widgets)
    state[id] = JSON.parse(JSON.stringify(widget.state));
  return state;
}

// Run a routine (an array of operations, or a property name of the trigger widget) and return
// { state, variables, collection }. The trigger widget defaults to 'trigger', which
// routineState() adds for you.
export async function runRoutine(state, routine, { legacy = {}, trigger = 'trigger', variables = {}, collections = {} } = {}) {
  setupRoom(state, { legacy });
  const widget = widgets.get(trigger);
  if(!widget)
    throw Error(`The state has no widget '${trigger}' to run the routine on.`);

  const result = await widget.evaluateRoutine(routine, variables, collections);
  return Object.assign({ state: serializeState() }, result);
}

// A state with a trigger widget plus whatever the test needs. Keeps the boilerplate out of
// the individual cases.
export function routineState(widgetDefinitions = {}) {
  return Object.assign({ trigger: { type: 'button' } }, widgetDefinitions);
}

// The values a routine wrote into its variables, made observable without a SET: the routine
// gets one appended operation that copies them onto the trigger widget.
export async function runRoutineCapturingVariables(state, routine, names, options = {}) {
  const captured = {};
  for(const name of names)
    captured[name] = `\${${name}}`;
  const result = await runRoutine(state, [ ...routine, {
    func: 'SET', collection: 'thisButton', property: 'captured', value: captured
  } ], options);
  return Object.assign(result, { captured: result.state[options.trigger || 'trigger'].captured });
}
