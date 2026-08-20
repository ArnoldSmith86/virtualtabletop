// Real Holder and Pile classes inside jsdom.
//
// imagewidget.js and holder.js are not modules: the shipped bundle concatenates every client
// file into one scope, so their classes are plain globals with no export. Evaluating them the
// same way the bundle does is what makes a holder testable in Layer A at all - the alternative
// is one TestCafe fixture per assertion, and holder events have far too many combinations for
// that to be affordable.
//
// What the room provides and jsdom does not is stubbed here: rendering (icons, SVG, text
// fitting) does nothing, while everything that decides *structure* - drop target matching,
// the widget map, adding and removing widgets - is the real implementation, because that is
// what the tests are about.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { asArray, mapAssetURLs } from '../../../client/js/domhelpers.js';
import { compareDropTarget, dropTargets, exceedsDropLimit, getMaxZ, getSVG, resetMaxZ, showOverlay, shuffleWidgets, sortWidgets, updateMaxZ } from '../../../client/js/main.js';
import { addWidget, batchEnd, batchStart, flushDelta, widgetFilter, widgets } from '../../../client/js/serverstate.js';
import { legacyMode } from '../../../client/js/legacymodes.js';
import { Widget } from '../../../client/js/widgets/widget.js';
import { Label } from '../../../client/js/widgets/label.js';

let widgetClasses = null;
let generatedIDs = 0;

// Generated ids appear in assertions (a pile a drop created is somebody's parent), so the
// counter restarts with every room rather than counting up across a whole file.
export function resetGeneratedIDs() {
  generatedIDs = 0;
}

// jsdom replaces the global URL with its own, which fs does not accept as a path - so the
// directory is resolved once, through Node's own url module
const widgetsDirectory = join(dirname(fileURLToPath(import.meta.url)), '../../../client/js/widgets');

function bundleSource(file) {
  return readFileSync(join(widgetsDirectory, file), 'utf8');
}

function bundleClass(file, name) {
  return new Function(`${bundleSource(file)}\nreturn ${name};`)();
}

function classForType(type) {
  return widgetClasses[type] || Widget;
}

// The two serverstate functions the widget code reaches for as globals. addWidgetLocal is how
// updatePiles() creates a pile; removeWidgetLocal is how DELETE and a pile that has shrunk to
// one card take a widget out again - and taking it out is a parent change, which is exactly
// what the enter/leave pipeline reacts to.
async function addWidgetLocal(definition) {
  const id = definition.id || `generated-${++generatedIDs}`;
  addWidget(Object.assign({}, definition, { id }), new (classForType(definition.type))(id));
  return id;
}

async function removeWidgetLocal(widgetID, keepChildren) {
  const widget = widgets.get(widgetID);
  if(!widget || widget.inRemovalQueue)
    return;

  const toRemove = [];
  (function collect(id) {
    if(!keepChildren)
      for(const [ childID, child ] of widgets)
        if(!child.inRemovalQueue && child.get('parent') == id)
          collect(childID);
    widgets.get(id).inRemovalQueue = true;
    toRemove.push(widgets.get(id));
  })(widgetID);

  for(const w of toRemove) {
    w.isBeingRemoved = true;
    await w.onPropertyChange('parent', w.get('parent'), null);
    w.applyRemove();
    widgets.delete(w.get('id'));
    dropTargets.delete(w.get('id'));
  }
}

// Everything the bundle declares and jsdom does not have. Called once; the classes are cached
// because re-evaluating them would give every fixture a different Holder prototype.
export async function bundleWidgetClasses() {
  if(widgetClasses)
    return widgetClasses;

  Object.assign(globalThis, {
    Widget,
    legacyMode,
    widgets,
    widgetFilter,
    dropTargets,
    compareDropTarget,
    exceedsDropLimit,
    getMaxZ,
    resetMaxZ,
    updateMaxZ,
    showOverlay,
    shuffleWidgets,
    sortWidgets,
    getSVG,
    batchStart,
    batchEnd,
    flushDelta,
    asArray,
    mapAssetURLs,
    addWidgetLocal,
    removeWidgetLocal,
    playerName: 'jestPlayer',
    tracingEnabled: false,
    jeRoutineLogging: false,
    sendTraceEvent: () => {},
    setDeltaCause: () => {},
    setText: () => {},
    setTextAndAdjustFontSize: () => {},
    generateSymbolsDiv: () => document.createElement('div'),
    getIconDetails: () => null,
    getValidDropTargets: () => [],
    $: () => null
  });

  globalThis.ImageWidget = bundleClass('imagewidget.js', 'ImageWidget');
  // updatePiles() in widget.js reads pile.js's defaultPileSnapRange, which the bundle shares as
  // one scope but an imported module keeps private. Take it from the source so it cannot drift.
  globalThis.defaultPileSnapRange = Number(bundleSource('pile.js').match(/defaultPileSnapRange = (\d+)/)[1]);
  const { Pile } = await import('../../../client/js/widgets/pile.js');
  widgetClasses = {
    widget: Widget,
    label: Label,
    holder: bundleClass('holder.js', 'Holder'),
    pile: Pile
  };
  return widgetClasses;
}
