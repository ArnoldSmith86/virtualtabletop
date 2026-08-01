// The single source of truth for how the visual routine editor presents each
// operation: the ways it can work, the optional parts of its sentence, its
// parameters (type, default, enum values, display overrides) and what
// variables/collections it defines for later operations. Everything else
// (chips, popups, defaults, examples) derives from this registry.
//
// An operation is described by two tables:
//
//   variants - the ways the operation can work, i.e. what it does at all. The
//     first variant whose match() fits the operation is the one it is shown as,
//     so the last one is the fallback. Picking another variant in the operation
//     chip's popup runs its apply() and rewrites the parameters that tell the
//     variants apart together with the sentence, so nobody has to know that
//     "turn face up" means face 0 and "flip to the next face" means faceCycle.
//     fixed names the parameters a variant decides: they are changed by picking
//     another variant, never as an option of their own.
//
//   clauses - the optional parts of the sentence. A clause is shown while one of
//     its parameters is set and disappears with them, so a card only words what
//     the operation actually does. The "add option" button behind the sentence
//     offers the ones that are off, and every clause shown has an x that removes
//     it again. Parameters no variant and no clause mentions become a clause of
//     their own, so nothing an operation supports is unreachable.
//
// Template syntax: {name} is a clickable parameter chip; {a,b} shows the first
// alternative that is explicitly set (or whose default is not null); {{clause}}
// is where that clause goes if it is switched on (clauses without a place of
// their own follow the sentence). A template can also be a function receiving an
// accessor for the effective parameter values, so the wording can follow values
// that do not warrant a variant of their own.
//
// Parameter types decide which popup opens: number, enum (with values),
// string, property (the name of a widget property), json, widgets (pick widgets
// in the room), collection (pick widgets or a collection name).
//
// widgetType presets the picker's type filter for parameters that almost always
// name a widget of one type (SHUFFLE holder is a holder, TIMER timer a timer).
// It is only the initial value of the filter dropdown - the type can be changed
// to any other one (or to "any type") in the picker.
//
// deprecated holds the explanation for a parameter the engine still supports but
// that should not be used in new games: its chip gets an orange "!" info button
// in both the sentence and the list view.
//
// ignored names the parameters the engine skips because of how another one is
// set - or because their value means the same as leaving them unset (a MOVEXY z
// of 0 keeps the current z). It receives an accessor for the effective values and
// one telling whether the operation sets the parameter at all. The named
// parameters get a red "!" in the list view and are kept out of the summary: a
// variant should not word them into its sentence in the mode that ignores them
// (that is what the variants are for), and they are never offered as an option
// either.

// Most operations take either a single widget (holder/label/timer/from/canvas)
// or a collection - the engine checks the widget parameter first and never looks
// at collection once it is set (the `if(a.holder !== undefined)` branches in
// widget.js). Marking collection ignored there is the same situation as
// CANVAS canvas vs collection, just spelled out per operation.
function collectionReplacedBy(parameter) {
  return v=>v(parameter) != null ? { collection: `ignored because ${parameter} is set` } : {};
}

// the comparisons of IF and SELECT in words: "is more than" says what ">" does
// to somebody who has never written a condition, and the operations still store
// the operators the engine reads
const comparisonWords = {
  '==': 'is',
  '!=': 'is not',
  '<': 'is less than',
  '<=': 'is at most',
  '>=': 'is at least',
  '>': 'is more than',
  'in': 'is one of'
};

// the deprecated CANVAS canvas parameter replaces the collection, so every
// CANVAS sentence words whichever of the two the operation actually uses
function canvasTarget(v) {
  return v('canvas') != null ? '{canvas}' : '{collection}';
}

const routineOperationMetadata = {
  AUDIO: {
    variants: [
      {
        id: 'silence', label: 'Stop all sounds', fixed: [ 'silence' ],
        match: v=>v('silence'),
        apply: operation=>{ operation.silence = true; },
        template: '{func} stop all sounds'
      },
      {
        id: 'play', label: 'Play a sound', fixed: [ 'silence' ],
        apply: operation=>{ delete operation.silence; },
        template: '{func} play {source} at volume {maxVolume}'
      }
    ],
    clauses: [
      { id: 'player', label: 'only for one player', template: ' for {player}', add: { player: '' } },
      { id: 'count', label: 'play it more than once', template: ', {count} time(s)' },
      { id: 'length', label: 'stop after a while', template: ', stopping after {length} milliseconds', add: { length: 1000 } }
    ],
    parameters: {
      source: { type: 'string', default: '' },
      maxVolume: { type: 'number', default: 1.0 },
      length: { type: 'number', default: null },
      player: { type: 'string', default: null, display: { 'null': 'everyone' } },
      silence: { type: 'enum', values: [ true, false ], default: false },
      count: { type: 'number', default: 1, special: [ 'loop' ] }
    },
    ignored: v=>{
      // silence only resets the audio context, it never plays anything
      if(v('silence'))
        return { source: 'ignored because silence stops the audio instead of playing it', maxVolume: 'ignored because silence stops the audio instead of playing it', length: 'ignored because silence stops the audio instead of playing it', count: 'ignored because silence stops the audio instead of playing it' };
      return v('length') != null ? { count: 'ignored because a length is set' } : {};
    }
  },
  CALL: {
    variants: [
      { id: 'call', label: 'Run another routine', template: '{func} run the routine {routine} of {widget}' }
    ],
    clauses: [
      { id: 'variable', label: 'store the value it returns', template: ' and store the result as {variable}' },
      { id: 'collection', label: 'store the widgets it selected', template: ' and store its widgets as {collection}' },
      { id: 'return', label: 'do not wait for a result', template: ', wait for a result: {return}', add: { 'return': false } },
      { id: 'arguments', label: 'pass values into the routine', template: ', with the arguments {arguments}' }
    ],
    parameters: {
      routine: { type: 'string', default: 'clickRoutine' },
      widget: { type: 'widgets', default: null, display: { 'null': 'this widget' } },
      variable: { type: 'string', default: 'result' },
      collection: { type: 'collection', default: 'result' },
      'return': { type: 'enum', values: [ true, false ], default: true },
      arguments: { type: 'json', default: {} }
    },
    definesVariable: 'variable',
    definesCollection: 'collection'
  },
  CANVAS: {
    variants: [
      { id: 'reset', label: 'Reset a canvas', fixed: [ 'mode' ], match: v=>v('mode') == 'reset',
        apply: operation=>{ operation.mode = 'reset'; },
        template: v=>`{func} reset ${canvasTarget(v)}` },
      { id: 'set', label: 'Set the value of canvas fields', fixed: [ 'mode' ], match: v=>v('mode') == 'set',
        apply: operation=>{ operation.mode = 'set'; },
        template: v=>`{func} set the value of ${canvasTarget(v)} to {value}` },
      { id: 'inc', label: 'Increase the value of canvas fields', fixed: [ 'mode' ], match: v=>v('mode') == 'inc',
        apply: operation=>{ operation.mode = 'inc'; },
        template: v=>`{func} increase the value of ${canvasTarget(v)} by {value}` },
      { id: 'dec', label: 'Decrease the value of canvas fields', fixed: [ 'mode' ], match: v=>v('mode') == 'dec',
        apply: operation=>{ operation.mode = 'dec'; },
        template: v=>`{func} decrease the value of ${canvasTarget(v)} by {value}` },
      { id: 'change', label: 'Recolor a value on a canvas', fixed: [ 'mode' ], match: v=>v('mode') == 'change',
        apply: operation=>{ operation.mode = 'change'; },
        template: v=>`{func} change the color of value {value} on ${canvasTarget(v)} to {color}` },
      { id: 'setPixel', label: 'Set a single pixel', fixed: [ 'mode' ], match: v=>v('mode') == 'setPixel',
        apply: operation=>{ operation.mode = 'setPixel'; },
        template: v=>`{func} set the pixel ({x}, {y}) of ${canvasTarget(v)} to value {value}` }
    ],
    clauses: [
      { id: 'count', label: 'only some of the widgets', template: ', for {count} widgets', add: { count: 1 } }
    ],
    parameters: {
      mode: { type: 'enum', values: [ 'set', 'inc', 'dec', 'change', 'reset', 'setPixel' ], default: 'reset' },
      collection: { type: 'collection', default: 'DEFAULT', widgetType: 'canvas' },
      canvas: { type: 'widgets', default: null, widgetType: 'canvas', deprecated: `
        <pre>
        canvas is deprecated - please use collection instead.

        It still works so old games keep running, but it silently replaces whatever collection says.
        As collection also accepts a list of widget ids, everything canvas can do can be expressed
        with collection - and only collection works with the collections earlier operations define.
        </pre>
      ` },
      count: { type: 'number', default: null, display: { 'null': 'all' } },
      value: { type: 'number', default: 1 },
      color: { type: 'color', default: '#1F5CA6' },
      x: { type: 'number', default: 0 },
      y: { type: 'number', default: 0 }
    },
    ignored: (v, isSet)=>{
      const ignored = v('canvas') != null ? { collection: 'ignored because the deprecated canvas parameter replaces it' } : {};
      if(v('mode') != 'setPixel')
        ignored.x = ignored.y = 'ignored because only mode setPixel uses coordinates';
      if(v('mode') != 'change')
        ignored.color = 'ignored because only mode change sets a color';
      if(v('mode') == 'reset')
        ignored.value = 'ignored because reset clears the canvas regardless of the value';
      if(isSet('count') && !v('count'))
        ignored.count = 'ignored because 0 means all widgets, just like leaving it unset';
      return ignored;
    }
  },
  CLICK: {
    variants: [
      { id: 'click', label: 'Click widgets', template: '{func} click the widgets in {collection}' }
    ],
    clauses: [
      { id: 'count', label: 'click them more than once', template: ', {count} time(s)' },
      { id: 'mode', label: 'ignore clickable or click routines', template: ', {mode}' }
    ],
    parameters: {
      collection: { type: 'collection', default: 'DEFAULT' },
      count: { type: 'number', default: 1 },
      mode: { type: 'enum', values: [ 'respect', 'ignoreClickable', 'ignoreClickRoutine', 'ignoreAll' ], default: 'respect' }
    }
  },
  CLONE: {
    variants: [
      { id: 'clone', label: 'Copy widgets', template: '{func} copy the widgets in {source} {count} time(s)' }
    ],
    clauses: [
      { id: 'offset', label: 'place the copies elsewhere', template: ', offset by ({xOffset}, {yOffset})' },
      { id: 'properties', label: 'change properties of the copies', template: ', with the properties {properties}' },
      { id: 'recursive', label: 'copy the widgets inside as well', template: ', copy their content too: {recursive}', add: { recursive: true } },
      { id: 'collection', label: 'remember the copies', template: '; store the copies as {collection}' }
    ],
    parameters: {
      source: { type: 'collection', default: 'DEFAULT' },
      count: { type: 'number', default: 1 },
      xOffset: { type: 'number', default: 0 },
      yOffset: { type: 'number', default: 0 },
      properties: { type: 'json', default: {} },
      recursive: { type: 'enum', values: [ true, false ], default: false },
      collection: { type: 'collection', default: 'DEFAULT' }
    },
    definesCollection: 'collection'
  },
  COUNT: {
    variants: [
      { id: 'holder', label: 'Count what is in a holder', match: (v, isSet)=>isSet('holder'),
        apply: operation=>{ if(operation.holder === undefined) operation.holder = null; },
        template: '{func} count the widgets in {holder}{{owner}} and store the number as {variable}' },
      { id: 'collection', label: 'Count the widgets of a collection', fixed: [ 'holder' ],
        apply: operation=>{ delete operation.holder; },
        template: '{func} count the widgets in {collection}{{owner}} and store the number as {variable}' }
    ],
    clauses: [
      { id: 'owner', label: 'only what one player owns', template: ' owned by {owner}', add: { owner: '' } }
    ],
    parameters: {
      owner: { type: 'string', default: null, display: { 'null': 'anyone' } },
      holder: { type: 'widgets', default: null, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT' },
      variable: { type: 'string', default: 'COUNT' }
    },
    definesVariable: 'variable',
    ignored: collectionReplacedBy('holder')
  },
  DELAY: {
    variants: [
      { id: 'delay', label: 'Wait', template: '{func} wait for {milliseconds} milliseconds' }
    ],
    parameters: {
      milliseconds: { type: 'number', default: 0 }
    }
  },
  DELETE: {
    variants: [
      { id: 'delete', label: 'Delete widgets', template: '{func} delete the widgets in {collection}' }
    ],
    parameters: {
      collection: { type: 'collection', default: 'DEFAULT' }
    }
  },
  FLIP: {
    variants: [
      { id: 'up', label: 'Turn face up', fixed: [ 'face', 'faceCycle' ], match: v=>v('face') === 0,
        apply: operation=>{ delete operation.faceCycle; operation.face = 0; },
        template: '{func} turn {count} widgets in {holder,collection} face up' },
      { id: 'down', label: 'Turn face down', fixed: [ 'face', 'faceCycle' ], match: v=>v('face') === 1,
        apply: operation=>{ delete operation.faceCycle; operation.face = 1; },
        template: '{func} turn {count} widgets in {holder,collection} face down' },
      { id: 'toFace', label: 'Turn to a specific face', fixed: [ 'faceCycle' ], match: v=>typeof v('face') == 'number',
        apply: operation=>{ delete operation.faceCycle; if(typeof operation.face != 'number' || operation.face < 2) operation.face = 2; },
        template: '{func} turn {count} widgets in {holder,collection} to face {face}' },
      { id: 'cycle', label: 'Flip to the next face', fixed: [ 'face' ],
        apply: operation=>{ delete operation.face; },
        template: '{func} turn {count} widgets in {holder,collection} to the {faceCycle} face' }
    ],
    parameters: {
      count: { type: 'number', default: 'all', special: [ 'all' ] },
      holder: { type: 'widgets', default: null, display: { 'null': '?' }, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT' },
      face: { type: 'number', default: null, display: { 'null': 'next' } },
      faceCycle: { type: 'enum', values: [ 'forward', 'backward', 'random' ], default: 'forward', display: { forward: 'next', backward: 'previous', random: 'random' } }
    },
    ignored: v=>{
      const ignored = collectionReplacedBy('holder')(v);
      if(v('face') != null)
        ignored.faceCycle = 'ignored because a target face is set';
      else if(v('faceCycle') == 'random')
        ignored.face = 'ignored because faceCycle picks a random face';
      return ignored;
    }
  },
  FOREACH: {
    variants: [
      { id: 'list', label: 'For each entry of a list', match: v=>v('in') != null,
        apply: operation=>{ delete operation.range; delete operation.collection; if(operation['in'] === undefined) operation['in'] = []; },
        template: '{func} for each entry of {in,range,collection}' },
      { id: 'range', label: 'For each number of a range', match: v=>v('range') != null,
        apply: operation=>{ delete operation['in']; delete operation.collection; if(operation.range === undefined) operation.range = [ 1, 10, 1 ]; },
        template: '{func} for each number of {in,range,collection}' },
      { id: 'collection', label: 'For each widget of a collection',
        apply: operation=>{ delete operation['in']; delete operation.range; },
        template: '{func} for each widget of {in,range,collection}' }
    ],
    parameters: {
      'in': { type: 'json', default: null },
      range: { type: 'json', default: null },
      collection: { type: 'collection', default: 'DEFAULT' }
    },
    // the engine takes the first source that is set: in, then range, then collection
    ignored: v=>{
      if(v('in'))
        return { range: 'ignored because in is set', collection: 'ignored because in is set' };
      if(v('range'))
        return { collection: 'ignored because range is set' };
      return {};
    }
  },
  GET: {
    variants: [
      { id: 'first', label: 'Read the value of the first widget', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'first',
        apply: operation=>{ operation.aggregation = 'first'; },
        template: '{func} read {property} of the first widget in {collection} and store it as {variable}' },
      { id: 'last', label: 'Read the value of the last widget', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'last',
        apply: operation=>{ operation.aggregation = 'last'; },
        template: '{func} read {property} of the last widget in {collection} and store it as {variable}' },
      { id: 'array', label: 'Collect the values of all widgets', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'array',
        apply: operation=>{ operation.aggregation = 'array'; },
        template: '{func} collect {property} of all widgets in {collection} and store it as {variable}' },
      { id: 'combine', label: 'Combine the values (sum, average, ...)',
        apply: operation=>{ if([ 'average', 'median', 'min', 'max', 'sum' ].indexOf(operation.aggregation) == -1) operation.aggregation = 'sum'; },
        template: '{func} store the {aggregation} of {property} of the widgets in {collection} as {variable}' }
    ],
    clauses: [
      { id: 'skipMissing', label: 'skip widgets without the property', template: ', skipping widgets that do not have it: {skipMissing}', add: { skipMissing: true } }
    ],
    parameters: {
      property: { type: 'property', default: 'id' },
      collection: { type: 'collection', default: 'DEFAULT' },
      aggregation: { type: 'enum', values: [ 'first', 'last', 'array', 'average', 'median', 'min', 'max', 'sum' ], default: 'first' },
      variable: { type: 'string', default: operation=>typeof operation.property == 'string' ? operation.property : 'id' },
      skipMissing: { type: 'enum', values: [ true, false ], default: false }
    },
    definesVariable: 'variable',
    // missing values count as 0 in a sum, and an all-missing collection sums to 0 either way
    ignored: v=>v('aggregation') == 'sum' ? { skipMissing: 'ignored because missing values do not change a sum' } : {}
  },
  IF: {
    variants: [
      { id: 'condition', label: 'Check a written condition', match: (v, isSet)=>isSet('condition'),
        apply: operation=>{ if(operation.condition === undefined) operation.condition = ''; },
        template: '{func} if {condition}' },
      { id: 'compare', label: 'Compare two values', fixed: [ 'condition' ],
        apply: operation=>{ delete operation.condition; },
        template: '{func} if {operand1} {relation} {operand2}' }
    ],
    parameters: {
      condition: { type: 'string', default: null },
      operand1: { type: 'string', default: null, display: { 'null': '?' } },
      relation: { type: 'enum', values: [ '==', '!=', '<', '<=', '>=', '>' ], default: '==', display: comparisonWords },
      operand2: { type: 'string', default: null, display: { 'null': '?' } }
    }
  },
  INPUT: {
    variants: [
      { id: 'input', label: 'Ask the player', template: '{func} ask the player, showing the fields {fields}' }
    ],
    clauses: [
      { id: 'header', label: 'give the dialog a title', template: ', titled {header}' },
      { id: 'confirmButtonText', label: 'rename the confirm button', template: ', confirming with {confirmButtonText}' },
      { id: 'confirmButtonIcon', label: 'add an icon to the confirm button', template: ' and the icon {confirmButtonIcon}', add: { confirmButtonIcon: 'check' } },
      { id: 'cancelButtonText', label: 'rename the cancel button', template: ', cancelling with {cancelButtonText}' },
      { id: 'cancelButtonIcon', label: 'add an icon to the cancel button', template: ' and the icon {cancelButtonIcon}', add: { cancelButtonIcon: 'close' } },
      { id: 'css', label: 'style the dialog', template: ', styled {css}' },
      { id: 'randomRotation', label: 'rotate the dialog randomly', template: ', rotated by up to {randomRotation} degrees', add: { randomRotation: 5 } }
    ],
    parameters: {
      fields: { type: 'json', default: [] },
      confirmButtonText: { type: 'string', default: 'Go' },
      confirmButtonIcon: { type: 'icon', default: null },
      cancelButtonText: { type: 'string', default: 'Cancel' },
      cancelButtonIcon: { type: 'icon', default: null },
      header: { type: 'string', default: '' },
      css: { type: 'string', default: '' },
      randomRotation: { type: 'number', default: 0 }
    }
  },
  LABEL: {
    variants: [
      { id: 'set', label: 'Set the text', fixed: [ 'mode' ], match: v=>v('mode') == 'set',
        apply: operation=>{ operation.mode = 'set'; },
        template: '{func} set the text of {label,collection} to {value}' },
      { id: 'inc', label: 'Increase the number', fixed: [ 'mode' ], match: v=>v('mode') == 'inc',
        apply: operation=>{ operation.mode = 'inc'; },
        template: '{func} increase the number in {label,collection} by {value}' },
      { id: 'dec', label: 'Decrease the number', fixed: [ 'mode' ], match: v=>v('mode') == 'dec',
        apply: operation=>{ operation.mode = 'dec'; },
        template: '{func} decrease the number in {label,collection} by {value}' },
      { id: 'append', label: 'Append text', fixed: [ 'mode' ], match: v=>v('mode') == 'append',
        apply: operation=>{ operation.mode = 'append'; },
        template: '{func} append {value} to the text of {label,collection}' }
    ],
    parameters: {
      label: { type: 'widgets', default: null, widgetType: 'label' },
      collection: { type: 'collection', default: 'DEFAULT' },
      value: { type: 'string', default: 0 },
      mode: { type: 'enum', values: [ 'set', 'inc', 'dec', 'append' ], default: 'set' }
    },
    ignored: collectionReplacedBy('label')
  },
  MOVE: {
    variants: [
      { id: 'fillTo', label: 'Fill a holder up', match: v=>v('fillTo'),
        apply: operation=>{ delete operation.count; if(!operation.fillTo) operation.fillTo = 1; },
        template: '{func} move widgets from {from,collection} to {to} until it holds {fillTo}' },
      { id: 'move', label: 'Move widgets', fixed: [ 'fillTo' ],
        apply: operation=>{ delete operation.fillTo; },
        template: '{func} move {count} widgets from {from,collection} to {to}' }
    ],
    clauses: [
      { id: 'face', label: 'turn them to a face', template: ' and turn them to face {face}', add: { face: 0 } }
    ],
    parameters: {
      fillTo: { type: 'number', default: null },
      count: { type: 'number', default: operation=>operation.from ? 1 : 'all', special: [ 'all' ] },
      from: { type: 'widgets', default: null, display: { 'null': '?' }, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT' },
      to: { type: 'widgets', default: null, display: { 'null': '?' }, widgetType: 'holder' },
      face: { type: 'number', default: null, display: { 'null': 'unchanged' } }
    },
    ignored: (v, isSet)=>{
      const ignored = collectionReplacedBy('from')(v);
      if(v('fillTo'))
        ignored.count = 'ignored because "fill up to" is set';
      else if(isSet('fillTo'))
        ignored.fillTo = 'ignored because 0 means the same as leaving it unset';
      return ignored;
    }
  },
  MOVEXY: {
    variants: [
      { id: 'movexy', label: 'Move widgets to a position', template: '{func} move {count} widgets from {from} to ({x}, {y})' }
    ],
    clauses: [
      { id: 'z', label: 'put them on a layer', template: ' on layer {z}', add: { z: 1 } },
      { id: 'face', label: 'turn them to a face', template: ' and turn them to face {face}', add: { face: 0 } },
      { id: 'snapToGrid', label: 'ignore the grid', template: ', snapping to the grid: {snapToGrid}', add: { snapToGrid: false } },
      { id: 'resetOwner', label: 'keep their owner', template: ', resetting their owner: {resetOwner}', add: { resetOwner: false } }
    ],
    parameters: {
      count: { type: 'number', default: 1, special: [ 'all' ] },
      from: { type: 'widgets', default: null, display: { 'null': '?' }, widgetType: 'holder' },
      x: { type: 'number', default: 0 },
      y: { type: 'number', default: 0 },
      z: { type: 'number', default: null, display: { 'null': 'unchanged' } },
      face: { type: 'number', default: null, display: { 'null': 'unchanged' } },
      snapToGrid: { type: 'enum', values: [ true, false ], default: true },
      resetOwner: { type: 'enum', values: [ true, false ], default: true }
    },
    ignored: (v, isSet)=>isSet('z') && !v('z') ? { z: 'ignored because 0 keeps the current z, just like leaving it unset' } : {}
  },
  RECALL: {
    variants: [
      { id: 'recall', label: 'Recall cards', template: '{func} bring the cards that belong to {holder} back into it' }
    ],
    clauses: [
      { id: 'owned', label: 'leave the cards players hold', template: ', taking the cards players own: {owned}', add: { owned: false } },
      { id: 'inHolder', label: 'only cards lying on the table', template: ', taking the cards inside holders: {inHolder}', add: { inHolder: false } },
      { id: 'byDistance', label: 'nearest cards first', template: ', nearest cards first: {byDistance}', add: { byDistance: true } },
      { id: 'excludeCollection', label: 'leave some cards where they are', template: ', except the widgets in {excludeCollection}' }
    ],
    parameters: {
      holder: { type: 'widgets', default: null, display: { 'null': '?' }, widgetType: 'holder' },
      owned: { type: 'enum', values: [ true, false ], default: true },
      inHolder: { type: 'enum', values: [ true, false ], default: true },
      excludeCollection: { type: 'collection', default: null },
      byDistance: { type: 'enum', values: [ true, false ], default: false }
    }
  },
  RESET: {
    variants: [
      { id: 'reset', label: 'Reset widgets', template: '{func} reset the widgets using their property {property}' }
    ],
    parameters: {
      property: { type: 'property', default: 'resetProperties' }
    }
  },
  ROTATE: {
    variants: [
      { id: 'set', label: 'Turn widgets to an angle', fixed: [ 'mode' ], match: v=>v('mode') == 'set',
        apply: operation=>{ operation.mode = 'set'; },
        template: '{func} turn {count} widgets in {holder,collection} to {angle} degrees' },
      { id: 'add', label: 'Turn widgets by an angle', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: '{func} turn {count} widgets in {holder,collection} by {angle} degrees' }
    ],
    parameters: {
      count: { type: 'number', default: 1, special: [ 'all' ] },
      holder: { type: 'widgets', default: null, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT' },
      angle: { type: 'number', default: 90, special: [ 45, 60, 90, 135, 180 ] },
      mode: { type: 'enum', values: [ 'set', 'add' ], default: 'add' }
    },
    ignored: collectionReplacedBy('holder')
  },
  SCORE: {
    variants: [
      { id: 'inc', label: 'Add to the score', fixed: [ 'mode' ], match: v=>v('mode') == 'inc',
        apply: operation=>{ operation.mode = 'inc'; },
        template: '{func} add {value} to the {property} of {seats}{{round}}' },
      { id: 'dec', label: 'Subtract from the score', fixed: [ 'mode' ], match: v=>v('mode') == 'dec',
        apply: operation=>{ operation.mode = 'dec'; },
        template: '{func} subtract {value} from the {property} of {seats}{{round}}' },
      { id: 'set', label: 'Set the score', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: '{func} set the {property} of {seats}{{round}} to {value}' }
    ],
    clauses: [
      { id: 'round', label: 'a round of its own', template: ' in round {round}', add: { round: 1 } }
    ],
    parameters: {
      property: { type: 'property', default: 'score' },
      seats: { type: 'widgets', default: null, display: { 'null': 'every seat' }, widgetType: 'seat' },
      round: { type: 'number', default: null, display: { 'null': 'a new round' } },
      mode: { type: 'enum', values: [ 'set', 'inc', 'dec' ], default: 'set' },
      value: { type: 'number', default: null }
    }
  },
  SELECT: {
    variants: [
      { id: 'add', label: 'Add widgets to a collection', fixed: [ 'mode' ], match: v=>v('mode') == 'add',
        apply: operation=>{ operation.mode = 'add'; },
        template: '{func} select {max} {type} from {source}{{where}}{{random}}{{sortBy}} and add them to {collection}' },
      { id: 'remove', label: 'Remove widgets from a collection', fixed: [ 'mode' ], match: v=>v('mode') == 'remove',
        apply: operation=>{ operation.mode = 'remove'; },
        template: '{func} select {max} {type} from {source}{{where}}{{random}}{{sortBy}} and remove them from {collection}' },
      { id: 'intersect', label: 'Narrow a collection down', fixed: [ 'mode' ], match: v=>v('mode') == 'intersect',
        apply: operation=>{ operation.mode = 'intersect'; },
        template: '{func} select {max} {type} from {source}{{where}}{{random}}{{sortBy}} and keep only those also in {collection}' },
      { id: 'set', label: 'Select widgets', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: '{func} select {max} {type} from {source}{{where}}{{random}}{{sortBy}} and call them {collection}' }
    ],
    clauses: [
      { id: 'where', label: 'only widgets with a certain property', template: ' where {property} {relation} {value}' },
      { id: 'random', label: 'pick them at random', template: ', at random: {random}', add: { random: true } },
      { id: 'sortBy', label: 'sort them', template: ', sorted by {sortBy}', add: { sortBy: 'value' } }
    ],
    parameters: {
      max: { type: 'number', default: 999999, special: [ 'all' ], display: { '999999': 'all' } },
      type: { type: 'enum', values: [ 'all', 'button', 'canvas', 'card', 'deck', 'dice', 'holder', 'label', 'pile', 'scoreboard', 'seat', 'spinner', 'timer' ], default: 'all', display: { 'all': 'widgets', 'button': 'buttons', 'canvas': 'canvases', 'card': 'cards', 'deck': 'decks', 'dice': 'dice', 'holder': 'holders', 'label': 'labels', 'pile': 'piles', 'scoreboard': 'scoreboards', 'seat': 'seats', 'spinner': 'spinners', 'timer': 'timers' } },
      source: { type: 'collection', default: 'all', display: { 'all': 'all widgets' } },
      property: { type: 'property', default: 'parent' },
      relation: { type: 'enum', values: [ '==', '!=', '<', '<=', '>=', '>', 'in' ], default: '==', display: comparisonWords },
      value: { type: 'string', default: null },
      mode: { type: 'enum', values: [ 'set', 'add', 'remove', 'intersect' ], default: 'set' },
      collection: { type: 'collection', default: 'DEFAULT' },
      sortBy: { type: 'json', default: null },
      random: { type: 'enum', values: [ true, false ], default: false }
    },
    definesCollection: 'collection'
  },
  SET: {
    variants: [
      { id: 'add', label: 'Increase a property', fixed: [ 'relation' ], match: v=>v('relation') == '+',
        apply: operation=>{ operation.relation = '+'; },
        template: '{func} increase the property {property} of the widgets in {collection} by {value}' },
      { id: 'subtract', label: 'Decrease a property', fixed: [ 'relation' ], match: v=>v('relation') == '-',
        apply: operation=>{ operation.relation = '-'; },
        template: '{func} decrease the property {property} of the widgets in {collection} by {value}' },
      { id: 'multiply', label: 'Multiply a property', fixed: [ 'relation' ], match: v=>v('relation') == '*',
        apply: operation=>{ operation.relation = '*'; },
        template: '{func} multiply the property {property} of the widgets in {collection} by {value}' },
      { id: 'divide', label: 'Divide a property', fixed: [ 'relation' ], match: v=>v('relation') == '/',
        apply: operation=>{ operation.relation = '/'; },
        template: '{func} divide the property {property} of the widgets in {collection} by {value}' },
      { id: 'toggle', label: 'Switch a property on or off', fixed: [ 'relation' ], match: v=>v('relation') == '!',
        apply: operation=>{ operation.relation = '!'; },
        template: '{func} switch the property {property} of the widgets in {collection} on or off' },
      { id: 'set', label: 'Set a property', fixed: [ 'relation' ],
        apply: operation=>{ delete operation.relation; },
        template: '{func} set the property {property} of the widgets in {collection} to {value}' }
    ],
    parameters: {
      property: { type: 'property', default: 'parent' },
      collection: { type: 'collection', default: 'DEFAULT' },
      relation: { type: 'enum', values: [ '=', '+', '-', '*', '/', '!' ], default: '=' },
      value: { type: 'json', default: null }
    },
    // ! is the one relation that takes a single operand (the current value)
    ignored: v=>v('relation') == '!' ? { value: 'ignored because ! only negates the current value' } : {}
  },
  SHUFFLE: {
    variants: [
      { id: 'reverse', label: 'Reverse the order', fixed: [ 'mode' ], match: v=>v('mode') == 'reverse',
        apply: operation=>{ operation.mode = 'reverse'; },
        template: '{func} reverse the order of the widgets in {holder,collection}' },
      { id: 'overhand', label: 'Shuffle overhand', fixed: [ 'mode' ], match: v=>v('mode') == 'overhand',
        apply: operation=>{ operation.mode = 'overhand'; },
        template: '{func} shuffle {holder,collection} overhand {modeValue} times' },
      { id: 'riffle', label: 'Riffle shuffle', fixed: [ 'mode' ], match: v=>v('mode') == 'riffle',
        apply: operation=>{ operation.mode = 'riffle'; },
        template: '{func} riffle shuffle {holder,collection} {modeValue} times' },
      { id: 'seeded', label: 'Shuffle the same way every time', fixed: [ 'mode' ], match: v=>v('mode') == 'seeded',
        apply: operation=>{ operation.mode = 'seeded'; },
        template: '{func} shuffle {holder,collection} with the seed {modeValue}' },
      { id: 'random', label: 'Shuffle', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: '{func} shuffle {holder,collection}' }
    ],
    parameters: {
      holder: { type: 'widgets', default: null, display: { 'null': '?' }, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT' },
      mode: { type: 'enum', values: [ 'true random', 'overhand', 'riffle', 'reverse', 'seeded' ], default: 'true random' },
      modeValue: { type: 'number', default: 1 }
    },
    ignored: v=>{
      const ignored = collectionReplacedBy('holder')(v);
      // modeValue is the seed for seeded and the number of iterations for riffle/overhand
      if([ 'seeded', 'riffle', 'overhand' ].indexOf(v('mode')) == -1)
        ignored.modeValue = `ignored because mode ${v('mode')} takes no value`;
      return ignored;
    }
  },
  SORT: {
    variants: [
      { id: 'sort', label: 'Sort widgets', template: '{func} sort the widgets in {holder,collection} by {key}' }
    ],
    clauses: [
      { id: 'reverse', label: 'sort the other way round', template: ', in reverse: {reverse}', add: { reverse: true } },
      { id: 'rearrange', label: 'keep them where they are', template: ', moving them into the new order: {rearrange}', add: { rearrange: false } },
      { id: 'locales', label: 'sort text for a language', template: ', for the language {locales}', add: { locales: 'en' } },
      { id: 'options', label: 'fine-tune the text comparison', template: ', with the comparison options {options}' }
    ],
    parameters: {
      holder: { type: 'widgets', default: null, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT' },
      key: { type: 'json', default: 'value' },
      reverse: { type: 'enum', values: [ true, false ], default: false },
      rearrange: { type: 'enum', values: [ true, false ], default: true },
      locales: { type: 'json', default: null },
      options: { type: 'json', default: null }
    },
    ignored: v=>{
      const ignored = collectionReplacedBy('holder')(v);
      // sorting a holder always rearranges its children
      if(v('holder') != null)
        ignored.rearrange = 'ignored because sorting a holder always rearranges it';
      return ignored;
    }
  },
  SWAPHANDS: {
    variants: [
      { id: 'swaphands', label: 'Swap the hands of the players', template: '{func} swap the hands of the players in {source}' }
    ],
    clauses: [
      { id: 'interval', label: 'pass them further than one seat', template: ', {interval} seats onwards' },
      { id: 'direction', label: 'pass them the other way', template: ', {direction}' }
    ],
    parameters: {
      source: { type: 'collection', default: 'all', display: { 'all': 'all seats' }, widgetType: 'seat' },
      interval: { type: 'number', default: 1 },
      direction: { type: 'enum', values: [ 'forward', 'backward', 'random' ], default: 'forward' }
    }
  },
  TIMER: {
    variants: [
      { id: 'start', label: 'Start a timer', fixed: [ 'mode' ], match: v=>v('mode') == 'start',
        apply: operation=>{ operation.mode = 'start'; },
        template: '{func} start {timer,collection}' },
      { id: 'pause', label: 'Pause a timer', fixed: [ 'mode' ], match: v=>v('mode') == 'pause',
        apply: operation=>{ operation.mode = 'pause'; },
        template: '{func} pause {timer,collection}' },
      { id: 'reset', label: 'Reset a timer', fixed: [ 'mode' ], match: v=>v('mode') == 'reset',
        apply: operation=>{ operation.mode = 'reset'; },
        template: '{func} reset {timer,collection}' },
      { id: 'set', label: 'Set the time', fixed: [ 'mode' ], match: v=>v('mode') == 'set',
        apply: operation=>{ operation.mode = 'set'; },
        template: v=>`{func} set the time of {timer,collection} to ${timerTime(v)}` },
      { id: 'inc', label: 'Add time', fixed: [ 'mode' ], match: v=>v('mode') == 'inc',
        apply: operation=>{ operation.mode = 'inc'; },
        template: v=>`{func} add ${timerTime(v)} to the time of {timer,collection}` },
      { id: 'dec', label: 'Take time away', fixed: [ 'mode' ], match: v=>v('mode') == 'dec',
        apply: operation=>{ operation.mode = 'dec'; },
        template: v=>`{func} take ${timerTime(v)} off the time of {timer,collection}` },
      { id: 'toggle', label: 'Start or pause a timer', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: '{func} start {timer,collection} if it is paused, pause it if it is running' }
    ],
    parameters: {
      timer: { type: 'widgets', default: null, widgetType: 'timer' },
      collection: { type: 'collection', default: 'DEFAULT', widgetType: 'timer' },
      mode: { type: 'enum', values: [ 'pause', 'start', 'toggle', 'set', 'dec', 'inc', 'reset' ], default: 'toggle' },
      value: { type: 'number', default: 0, special: [ 'start', 'end' ], textHint: 'name of a timer property to read the time from' },
      seconds: { type: 'number', default: 0 }
    },
    ignored: (v, isSet)=>{
      const ignored = collectionReplacedBy('timer')(v);
      if([ 'pause', 'start', 'toggle', 'reset' ].indexOf(v('mode')) != -1) {
        ignored.value = 'ignored for this mode';
        ignored.seconds = 'ignored for this mode';
      } else if(v('seconds')) {
        ignored.value = 'ignored because seconds is set';
      } else if(isSet('seconds')) {
        ignored.seconds = 'ignored because 0 seconds falls back to value';
      }
      return ignored;
    }
  },
  TURN: {
    variants: [
      { id: 'random', label: 'Give the turn to a random seat', fixed: [ 'turnCycle' ], match: v=>v('turnCycle') == 'random',
        apply: operation=>{ operation.turnCycle = 'random'; },
        template: '{func} give the turn to a random seat' },
      { id: 'position', label: 'Give the turn to a seat by its position', fixed: [ 'turnCycle' ], match: v=>v('turnCycle') == 'position',
        apply: operation=>{ operation.turnCycle = 'position'; },
        template: '{func} give the turn to the seat at position {turn}' },
      { id: 'seat', label: 'Give the turn to a specific seat', fixed: [ 'turnCycle' ], match: v=>v('turnCycle') == 'seat',
        apply: operation=>{ operation.turnCycle = 'seat'; },
        template: '{func} give the turn to the seat {turn}' },
      { id: 'backward', label: 'Pass the turn backwards', fixed: [ 'turnCycle' ], match: v=>v('turnCycle') == 'backward',
        apply: operation=>{ operation.turnCycle = 'backward'; },
        template: '{func} pass the turn back by {turn} seat(s)' },
      { id: 'forward', label: 'Pass the turn on', fixed: [ 'turnCycle' ],
        apply: operation=>{ delete operation.turnCycle; },
        template: '{func} pass the turn on by {turn} seat(s)' }
    ],
    clauses: [
      { id: 'source', label: 'only some of the seats', template: ', among the seats in {source}' },
      { id: 'collection', label: 'remember the seat', template: '; store the seat as {collection}' }
    ],
    parameters: {
      turn: { type: 'number', default: 1, special: [ 'first', 'last' ], textHint: 'id of a seat (used with turnCycle seat)', widgetType: 'seat' },
      turnCycle: { type: 'enum', values: [ 'forward', 'backward', 'random', 'position', 'seat' ], default: 'forward' },
      source: { type: 'collection', default: 'all', display: { 'all': 'all seats' }, widgetType: 'seat' },
      collection: { type: 'collection', default: 'TURN' }
    },
    definesCollection: 'collection',
    // random shuffles the seats before picking, so every value picks a random one
    ignored: v=>v('turnCycle') == 'random' ? { turn: 'ignored because a random seat is picked regardless of the value' } : {}
  },
  UPLOAD: {
    variants: [
      { id: 'upload', label: 'Ask the player for a file', template: '{func} ask the player for a file and store its name as {variable}' }
    ],
    clauses: [
      { id: 'fileTypes', label: 'only accept some file types', template: ', accepting {fileTypes}' }
    ],
    parameters: {
      variable: { type: 'string', default: 'uploadedFileName' },
      fileTypes: { type: 'json', default: [ '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.json', '.mp3', '.wav', '.ogg', '.m4a' ] }
    },
    definesVariable: 'variable'
  },
  VAR: {
    variants: [
      { id: 'var', label: 'Set variables', template: '{func} set the variables {variables}' }
    ],
    parameters: {
      variables: { type: 'json', default: {} }
    },
    definesVariables: operation=>Object.keys(operation.variables || {})
  }
};

// TIMER reads the time from seconds, from value in milliseconds, or from the
// timer property value names - the sentence says which one it uses
function timerTime(v) {
  if(typeof v('value') == 'string')
    return 'the time in {value}';
  return v('seconds') ? '{seconds} seconds' : '{value} milliseconds';
}

// how predefined variables are displayed in the operation summaries
const predefinedVariableLabels = {
  '${playerName}': 'player clicking the widget',
  '${playerColor}': "clicking player's color",
  '${seatID}': "clicking player's seat",
  '${seatIndex}': "clicking player's seat index",
  '${thisID}': 'this widget',
  '${mouseCoords}': 'mouse position',
  '${activePlayers}': 'all player names',
  '${activeColors}': 'all player colors',
  '${activeSeats}': 'occupied seat ids'
};

// per-operation UI state (folded blocks, revealed default parameters), keyed by
// the operation object so it survives re-renders as long as the routine is not
// replaced from the outside
const routineEditorUIState = new WeakMap();

function operationUIState(operation) {
  if(typeof operation != 'object' || operation === null)
    return {};
  if(!routineEditorUIState.has(operation))
    routineEditorUIState.set(operation, {});
  return routineEditorUIState.get(operation);
}

// The drag currently in progress, as { editor, indices }. It is module level so
// a drop can move operations between routine levels: into a nested IF/FOREACH
// block, back out into the parent routine or into a sibling block.
let activeRoutineDrag = null;

// every routine editor registers its container here so a point on the screen
// can be resolved to the routine level that owns it
const routineEditorsByElement = new WeakMap();

function routineEditorAtPoint(x, y) {
  let element = document.elementFromPoint(x, y);
  while(element) {
    if(routineEditorsByElement.has(element))
      return routineEditorsByElement.get(element);
    element = element.parentElement;
  }
  return null;
}

function routineDropTargetAtPoint(x, y) {
  const editor = routineEditorAtPoint(x, y);
  return editor && editor.acceptsActiveDrag() ? editor.dropTargetAtPoint(x, y) : null;
}

// highlights where the dragged operations would land: a line at the edge of the
// hovered card, or the whole block when it has no cards to aim at
function showRoutineDropIndicator(target) {
  const shown = activeRoutineDrag && activeRoutineDrag.indicator;
  if(shown && target && shown.card === target.card && shown.editor === target.editor && shown.after === target.after)
    return;
  clearRoutineDropIndicator();
  if(!target || !activeRoutineDrag)
    return;
  if(target.card)
    target.card.classList.add(target.after ? 'routine-editor-drop-after' : 'routine-editor-drop-before');
  else
    target.editor.domElement.classList.add('routine-editor-drop-into');
  activeRoutineDrag.indicator = target;
}

function clearRoutineDropIndicator() {
  const shown = activeRoutineDrag && activeRoutineDrag.indicator;
  if(!shown)
    return;
  if(shown.card)
    shown.card.classList.remove('routine-editor-drop-before', 'routine-editor-drop-after');
  else
    shown.editor.domElement.classList.remove('routine-editor-drop-into');
  activeRoutineDrag.indicator = null;
}

// the drop listeners live on the document, so a drag is resolved once no matter
// how many nested routine editors the event would bubble through
function routineDragOver(e) {
  const target = routineDropTargetAtPoint(e.clientX, e.clientY);
  showRoutineDropIndicator(target);
  if(!target)
    return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function routineDrop(e) {
  const target = routineDropTargetAtPoint(e.clientX, e.clientY);
  clearRoutineDropIndicator();
  if(target) {
    e.preventDefault();
    target.editor.performDrag(target.index, target.after);
  }
  endRoutineDrag();
}

function beginRoutineDrag(editor, indices, cards) {
  activeRoutineDrag = { editor, indices, cards, indicator: null };
  for(const card of cards)
    card.classList.add('routine-editor-operation-dragging');
  document.addEventListener('dragover', routineDragOver);
  document.addEventListener('drop', routineDrop);
}

function endRoutineDrag() {
  clearRoutineDropIndicator();
  for(const card of (activeRoutineDrag && activeRoutineDrag.cards) || [])
    card.classList.remove('routine-editor-operation-dragging');
  document.removeEventListener('dragover', routineDragOver);
  document.removeEventListener('drop', routineDrop);
  activeRoutineDrag = null;
}

class RoutineEditor {
  constructor(widget, routine, variables=[], collections=[], options={}) {
    this.domElement = document.createElement('div');
    this.domElement.classList.add('routine-editor');
    this.widget = widget;
    this.variables = variables;
    this.collections = collections;
    this.emptyHint = options.emptyHint || 'No operations yet.';
    // set for nested routines: hoists an operation out of this block into the parent
    this.onHoist = options.onHoist || null;
    // set for nested routines: writes this level's array back into its operation.
    // An empty block is not part of the operation JSON (see renderSubroutine), so
    // operations dropped into one would land in an array nothing else can see.
    this.attachRoutine = options.attachRoutine || null;
    // the routine editor one level up, so a cross-level drag can re-render (and
    // save) from the top instead of from a level that no longer owns the operation
    this.parentEditor = options.parentEditor || null;
    this.changeListeners = [];
    // indices (into this level's routine) of the operations selected for a
    // multi-drag; reset whenever the routine changes structurally (see setRoutine)
    this.selectedIndices = new Set();
    routineEditorsByElement.set(this.domElement, this);
    // drag-and-drop reordering lives on the stable container so it survives the
    // per-operation DOM swaps the sentence/list view toggle does
    this.setupDragAndDrop();
    // the caller clones at the widget-state boundary; nested editors share references
    this.setRoutine(routine);
  }

  notifyChangeListeners() {
    for(const listener of this.changeListeners)
      listener(this.routine);
  }

  // replace the routine with a fresh copy from the outside (e.g. another player
  // edited it); a no-op if it matches what this editor already shows so that
  // server echoes of our own edits don't reset the UI state
  onPropertyChange(routine) {
    if(JSON.stringify(routine) === JSON.stringify(this.routine))
      return;
    this.setRoutine(JSON.parse(JSON.stringify(routine)));
  }

  registerChangeListener(listener) {
    this.changeListeners.push(listener);
  }

  // the outermost routine editor: the only level that can safely re-render after
  // operations moved between two routine levels
  rootEditor() {
    let editor = this;
    while(editor.parentEditor)
      editor = editor.parentEditor;
    return editor;
  }

  // called by nested editors and chips after they mutated the routine in place
  routineChanged() {
    this.notifyChangeListeners();
    this.setRoutine(this.routine);
  }

  setRoutine(routine) {
    this.routine = routine;
    this.operations = [];
    // a structural change invalidates the transient Ctrl-selection (index based)
    this.selectedIndices = new Set();
    let variables = [ ...this.variables ];
    let collections = [ ...this.collections ];
    for(const [ index, operation ] of this.routine.entries()) {
      const editor = editorForOperation(operation);
      editor.setOperationDetails(this.widget, operation, variables, collections);
      this.operations.push(editor);
      editor.registerChangeListener(v=>{
        this.routine[index] = v;
        this.routineChanged();
      });
      // let a container operation (IF/FOREACH) hoist an operation out of its
      // nested block into this routine, right after the container itself
      editor.hoistIntoParent = op=>{
        const at = this.routine.indexOf(editor.operation);
        this.routine.splice((at < 0 ? this.routine.length-1 : at) + 1, 0, op);
        this.routineChanged();
      };
      editor.routineEditor = this;

      variables = [ ...new Set([ ...variables, ...editor.getDefinedVariables() ]) ];
      collections = [ ...new Set([ ...collections, ...editor.getDefinedCollections() ]) ];
      // in-place collections (arrays of widget ids) used in the routine become suggestions too
      if(operation && typeof operation == 'object')
        for(const key of [ 'collection', 'source', 'excludeCollection' ])
          if(Array.isArray(operation[key]))
            collections.push([ ...operation[key] ]);
      collections = collections.filter((c, i)=>collections.findIndex(x=>JSON.stringify(x) == JSON.stringify(c)) == i);
    }
    this.render();
  }

  render() {
    this.domElement.innerHTML = '';
    for(const [ index, operation ] of this.operations.entries()) {
      const operationDOM = operation.render();
      if(this.selectedIndices.has(index))
        operationDOM.classList.add('routine-editor-operation-selected');

      const buttonsDOM = document.createElement('span');
      buttonsDOM.className = 'routine-editor-operation-buttons';

      // a grip that starts a drag; Ctrl-clicking (long pressing on touch) cards
      // selects several to move at once
      const dragHandle = document.createElement('span');
      dragHandle.className = 'material-symbols routine-editor-drag-handle';
      dragHandle.textContent = 'drag_indicator';
      dragHandle.title = 'Drag into another position or into an IF/FOREACH block (Ctrl+click or long press operations to move several at once)';
      dragHandle.draggable = true;
      dragHandle.addEventListener('dragstart', e=>this.onOperationDragStart(e, dragHandle));
      dragHandle.addEventListener('dragend', _=>endRoutineDrag());
      dragHandle.addEventListener('pointerdown', e=>this.onDragHandlePointerDown(e, dragHandle));
      buttonsDOM.append(dragHandle);
      const operationButton = (icon, title, onClick, glyphClass='material-symbols')=>{
        const buttonDOM = document.createElement('span');
        buttonDOM.className = glyphClass;
        buttonDOM.textContent = icon;
        buttonDOM.title = title;
        buttonDOM.addEventListener('click', e=>{
          e.stopPropagation();
          onClick();
        });
        buttonsDOM.append(buttonDOM);
      };
      // the block property an adjacent operation would nest this one into
      const blockOf = op=>op && typeof op == 'object' ? ({ IF: 'thenRoutine', FOREACH: 'loopRoutine' })[op.func] : undefined;
      const moveInto = (adjOp, prop, toStart)=>{
        if(!Array.isArray(adjOp[prop]))
          adjOp[prop] = [];
        const op = this.routine.splice(index, 1)[0];
        if(toStart)
          adjOp[prop].unshift(op);
        else
          adjOp[prop].push(op);
        this.routineChanged();
      };
      if(index > 0)
        operationButton('arrow_upward', 'Move this operation up', _=>{
          this.routine.splice(index-1, 0, this.routine.splice(index, 1)[0]);
          this.routineChanged();
        });
      if(index < this.operations.length-1)
        operationButton('arrow_downward', 'Move this operation down', _=>{
          this.routine.splice(index+1, 0, this.routine.splice(index, 1)[0]);
          this.routineChanged();
        });
      // ↰ / ↲ nest this operation into an adjacent IF/FOREACH block
      const prevBlock = blockOf(this.routine[index-1]);
      if(prevBlock)
        operationButton('↰', `Move into the ${this.routine[index-1].func} block above`, _=>moveInto(this.routine[index-1], prevBlock, false), 'routine-editor-block-arrow');
      const nextBlock = blockOf(this.routine[index+1]);
      if(nextBlock)
        operationButton('↲', `Move into the ${this.routine[index+1].func} block below`, _=>moveInto(this.routine[index+1], nextBlock, true), 'routine-editor-block-arrow');
      // ↱ move this operation out of the current block into the parent routine
      if(this.onHoist)
        operationButton('↱', 'Move out of this block', _=>{
          const op = this.routine.splice(index, 1)[0];
          this.onHoist(op);
        }, 'routine-editor-block-arrow');
      operationButton('delete', 'Remove this operation', _=>{
        this.routine.splice(index, 1);
        this.routineChanged();
      });
      ($('.routine-editor-operation-header', operationDOM) || operationDOM).append(buttonsDOM);

      this.domElement.append(operationDOM);
    }

    if(!this.operations.length) {
      const emptyHint = document.createElement('div');
      emptyHint.className = 'routine-editor-empty';
      emptyHint.textContent = this.emptyHint;
      this.domElement.append(emptyHint);
    }

    const addButton = button(this.domElement, 'add operation', async _=>{
      const popup = new RoutineOperationPopup();
      popup.setSource(addButton);
      popup.setOperationDetails({}, [ 'func' ], this.widget, this.variables, this.collections);
      const values = await newRoutineValues(popup);
      if(values !== undefined) {
        this.routine.push(typeof values == 'string' ? values : JSON.parse(JSON.stringify(values)));
        this.routineChanged();
      }
    });
    addButton.className = 'routine-editor-add-operation';

    return this.domElement;
  }

  // the operation cards that belong to THIS routine level (nested editors keep
  // their own cards in their own container), in routine order
  directChildCards() {
    return [ ...this.domElement.children ].filter(c=>c.classList && c.classList.contains('routine-editor-operation'));
  }

  // the direct-child operation card the event happened in, or null
  cardFromEvent(e) {
    let el = e.target;
    while(el && el.parentElement !== this.domElement)
      el = el.parentElement;
    return el && el.classList && el.classList.contains('routine-editor-operation') ? el : null;
  }

  // toggles a card of this level in and out of the multi-selection
  toggleSelection(card) {
    const index = this.directChildCards().indexOf(card);
    if(index < 0)
      return;
    if(this.selectedIndices.has(index))
      this.selectedIndices.delete(index);
    else
      this.selectedIndices.add(index);
    card.classList.toggle('routine-editor-operation-selected', this.selectedIndices.has(index));
  }

  // the card of THIS level the event happened in, or null when a nested level
  // owns it (events from nested cards bubble up here too)
  ownCardFromEvent(e) {
    const card = this.cardFromEvent(e);
    return card && e.target.closest('.routine-editor-operation') === card ? card : null;
  }

  setupDragAndDrop() {
    // Ctrl/Cmd-click a card to add it to the multi-selection (chips and buttons
    // stopPropagation their own clicks, so this only fires on the card body)
    this.domElement.addEventListener('click', e=>{
      if(this.suppressClick) {
        // the click that ends a long press must not also open a parameter popup
        this.suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if(!(e.ctrlKey || e.metaKey))
        return;
      const card = this.ownCardFromEvent(e);
      if(!card)
        return;
      e.preventDefault();
      e.stopPropagation(); // a Ctrl+click on a chip selects instead of editing it
      this.toggleSelection(card);
    }, true);

    // touch has no Ctrl key, so a long press on a card toggles the selection
    this.domElement.addEventListener('pointerdown', e=>{
      if(e.pointerType == 'mouse' || e.target.closest('.routine-editor-drag-handle'))
        return;
      const card = this.ownCardFromEvent(e);
      if(!card)
        return;
      const startX = e.clientX, startY = e.clientY;
      const timer = setTimeout(_=>{
        cancel();
        this.suppressClick = true;
        this.toggleSelection(card);
      }, 500);
      const move = ev=>{
        if(Math.abs(ev.clientX-startX) > 10 || Math.abs(ev.clientY-startY) > 10)
          cancel();
      };
      const cancel = _=>{
        clearTimeout(timer);
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', cancel);
        document.removeEventListener('pointercancel', cancel);
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', cancel);
      document.addEventListener('pointercancel', cancel);
    });
  }

  onOperationDragStart(e, handle) {
    if(!this.beginDrag(handle))
      return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'routine-operation'); // Firefox needs data to start a drag
    try { e.dataTransfer.setDragImage(handle.closest('.routine-editor-operation'), 12, 12); } catch(err) {}
  }

  // the browser does not turn a touch into a native drag, so follow the pointer
  // ourselves and drop where it is released
  onDragHandlePointerDown(e, handle) {
    if(e.pointerType == 'mouse' || !this.beginDrag(handle))
      return;
    e.preventDefault();
    try { handle.setPointerCapture(e.pointerId); } catch(err) {}
    const move = ev=>{
      ev.preventDefault();
      showRoutineDropIndicator(routineDropTargetAtPoint(ev.clientX, ev.clientY));
    };
    const up = ev=>{
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      const target = ev.type == 'pointerup' ? routineDropTargetAtPoint(ev.clientX, ev.clientY) : null;
      clearRoutineDropIndicator();
      if(target)
        target.editor.performDrag(target.index, target.after);
      endRoutineDrag();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  // start dragging the card the handle belongs to; a selected card takes the
  // whole selection along, an unselected one moves alone
  beginDrag(handle) {
    const cards = this.directChildCards();
    const index = cards.indexOf(handle.closest('.routine-editor-operation'));
    if(index < 0)
      return false;
    const indices = (this.selectedIndices.has(index) ? [ ...this.selectedIndices ] : [ index ]).sort((a, b)=>a-b);
    beginRoutineDrag(this, indices, indices.map(i=>cards[i]).filter(Boolean));
    return true;
  }

  // a block nested inside one of the dragged operations cannot receive them:
  // that would detach the routine from the widget
  acceptsActiveDrag() {
    if(!activeRoutineDrag)
      return false;
    const containsThisRoutine = operation=>{
      if(!operation || typeof operation != 'object')
        return false;
      for(const key of [ 'thenRoutine', 'elseRoutine', 'loopRoutine' ])
        if(Array.isArray(operation[key]) && (operation[key] === this.routine || operation[key].some(containsThisRoutine)))
          return true;
      return false;
    };
    return !activeRoutineDrag.indices.some(i=>containsThisRoutine(activeRoutineDrag.editor.routine[i]));
  }

  // where a drop at this point would land in THIS routine: the hovered card and
  // whether it goes after it; empty space below the cards appends at the end
  dropTargetAtPoint(x, y) {
    const cards = this.directChildCards();
    let element = document.elementFromPoint(x, y);
    while(element && element.parentElement !== this.domElement)
      element = element.parentElement;
    const card = element && element.classList && element.classList.contains('routine-editor-operation') ? element : null;
    if(!card)
      return { editor: this, card: cards[cards.length-1] || null, index: cards.length-1, after: true };
    const rect = card.getBoundingClientRect();
    return { editor: this, card, index: cards.indexOf(card), after: y > rect.top + rect.height/2 };
  }

  // move the dragged operations to before/after targetIndex of this routine. They
  // are addressed by index so that duplicate primitive operations (comments, var
  // statements) stay put, and they may come from another routine level.
  performDrag(targetIndex, after, drag = activeRoutineDrag) {
    if(!drag || !drag.indices.length)
      return;
    const source = drag.editor;
    if(source === this) {
      const moveSet = new Set(drag.indices);
      if(moveSet.has(targetIndex) || targetIndex < 0)
        return; // dropped onto one of the operations being moved: nothing to do
      const moving = drag.indices.map(i=>this.routine[i]);
      const result = [];
      for(let i = 0; i < this.routine.length; i++) {
        if(moveSet.has(i))
          continue;
        if(i === targetIndex && !after)
          result.push(...moving);
        result.push(this.routine[i]);
        if(i === targetIndex && after)
          result.push(...moving);
      }
      // keep the array reference: nested editors and change listeners hold onto it
      this.routine.length = 0;
      this.routine.push(...result);
      this.routineChanged();
      return;
    }
    const moving = drag.indices.map(i=>source.routine[i]);
    for(const i of [ ...drag.indices ].sort((a, b)=>b-a))
      source.routine.splice(i, 1);
    this.routine.splice(targetIndex < 0 ? this.routine.length : targetIndex + (after ? 1 : 0), 0, ...moving);
    if(this.attachRoutine)
      this.attachRoutine();
    source.selectedIndices = new Set();
    // two levels changed, so only the outermost editor can re-render consistently
    this.rootEditor().routineChanged();
  }
}

class RoutineOperationEditor {
  constructor(func) {
    this.func = func;
    this.metadata = routineOperationMetadata[func] || { variants: [ { id: 'default', label: func, template: '{func}' } ], parameters: {} };
    this.changeListeners = [];
    this.subroutineEditors = {};
  }

  classifyParameter(parameterName, value) {
    if(parameterName == 'func')
      return 'func';
    if(typeof value == 'string' && value.match(/\$\{[^}]+\}/))
      return 'variable';
    if(parameterName == 'variable')
      return 'variable';
    const spec = this.parameterSpec(parameterName);
    if(spec && spec.type == 'collection')
      return 'collection';
    if(spec && spec.type == 'widgets')
      return 'widget';
    if(typeof value == 'number')
      return 'number';
    return 'value';
  }

  createPopup(parameterNames) {
    const spec = this.parameterSpec(parameterNames[parameterNames.length-1]);
    // a chip can stand for alternative parameters ({holder,collection}), so the
    // type preset of any of them applies to the picker the chip opens
    const typedSpec = parameterNames.map(name=>this.parameterSpec(name)).find(s=>s && s.widgetType);
    const pickerOptions = { widgetType: typedSpec && typedSpec.widgetType };
    if(parameterNames[0] == 'func')
      return new RoutineOperationPopup();
    // a custom property has no declared type, so edit it as raw JSON - that also
    // keeps the "use default" button, which is the way to remove it again
    if(!spec && this.unsupportedProperties().indexOf(parameterNames[0]) != -1)
      return new RoutineJSONPopup();
    if(parameterNames.length > 1 && spec && spec.type == 'collection')
      return new RoutineHoldersOrCollectionSourcePopup(pickerOptions);
    switch(spec && spec.type) {
      case 'number':     return new RoutineNumberPopup({ specialValues: spec.special, textHint: spec.textHint, widgetType: pickerOptions.widgetType });
      case 'enum':       return new RoutineEnumPopup({ values: spec.values, display: spec.display });
      case 'property':   return new RoutinePropertyNamePopup();
      case 'widgets':    return new RoutineWidgetIDPopup(pickerOptions);
      case 'collection': return new RoutineHoldersOrCollectionSourcePopup(pickerOptions);
      case 'json':       return new RoutineJSONPopup();
      case 'color':      return new RoutineColorPopup();
      case 'icon':       return new RoutineIconPopup();
      default:           return new RoutineStringPopup();
    }
  }

  getDefaults() {
    const defaults = { func: this.func };
    for(const name in this.metadata.parameters) {
      const d = this.metadata.parameters[name].default;
      defaults[name] = typeof d == 'function' ? d(this.operation || {}) : d;
    }
    return defaults;
  }

  getDefinedCollections() {
    if(typeof this.metadata.definesCollection == 'string') {
      const value = this.operation && this.operation[this.metadata.definesCollection];
      return [ value != null ? value : this.getDefaults()[this.metadata.definesCollection] ];
    }
    if(typeof this.metadata.definesCollection == 'function')
      return this.metadata.definesCollection(this.operation || {});
    return [];
  }

  getDefinedVariables() {
    if(typeof this.metadata.definesVariable == 'string') {
      const value = this.operation && this.operation[this.metadata.definesVariable];
      return [ value != null ? value : this.getDefaults()[this.metadata.definesVariable] ];
    }
    if(typeof this.metadata.definesVariables == 'function')
      return this.metadata.definesVariables(this.operation || {});
    return [];
  }

  getDisplayedValue(property) {
    const resolved = this.resolveParameter(property);
    if(resolved === null)
      return '?';

    const explicitlySet = this.operation && typeof this.operation == 'object' && typeof this.operation[resolved] != 'undefined';
    const value = explicitlySet ? this.operation[resolved] : this.getDefaults()[resolved];
    const spec = this.parameterSpec(resolved);
    if(spec && spec.display && spec.display[value] != null)
      return spec.display[value];
    if(typeof value == 'string' && predefinedVariableLabels[value])
      return predefinedVariableLabels[value];
    if(value === null && !explicitlySet)
      return 'unset'; // a null default just means the parameter is not used
    if(typeof value == 'object' && value !== null)
      return JSON.stringify(value);
    return value;
  }

  // the sentence with the values the operation currently has, used to offer the
  // operations and their variants in a popup. Optional parts stay out: an
  // example is what the operation says once it is added, not everything it could.
  getExampleWithDefaults(variant, funcText) {
    return this.resolveTemplate((variant || this.currentVariant()).template)
      .replace(/\{\{[a-zA-Z0-9]+\}\}/g, '')
      .replace(/\{([a-zA-Z0-9,]+)\}/g, (_, p)=>p == 'func' && funcText !== undefined ? funcText : this.getDisplayedValue(p))
      .trim();
  }

  // the whole sentence as one template string, optional parts in [brackets] -
  // every parameter the operation supports is reachable through it
  getTemplate() {
    return this.sentenceParts().map(part=>part.clause ? `[${part.template}]` : part.template).join('');
  }

  // the ways this operation can work, in the order they are matched and offered
  variants() {
    return this.metadata.variants || [];
  }

  // the variant the operation is shown as: the first one that fits it, with the
  // last one as the fallback so an operation always has a sentence
  currentVariant() {
    const variants = this.variants();
    const matching = variants.find(variant=>!variant.match || variant.match(name=>this.parameterValue(name), name=>this.parameterIsSet(name)));
    return matching || variants[variants.length-1] || { id: 'default', label: this.func, template: '{func}' };
  }

  // templates may be functions of the effective parameter values, so that
  // wording which does not warrant a variant of its own can still follow them
  resolveTemplate(template) {
    return typeof template == 'function' ? template(name=>this.parameterValue(name)) : template;
  }

  // the parameters a template edits - the places it reserves for a clause
  // ({{clause}}) are not among them, they only say where the clause goes
  templateParameters(template) {
    const withoutClauses = this.resolveTemplate(template).replace(/\{\{[a-zA-Z0-9]+\}\}/g, '');
    return (withoutClauses.match(/\{([a-zA-Z0-9,]+)\}/g) || []).flatMap(m=>m.slice(1, -1).split(',')).filter(name=>name != 'func');
  }

  // the optional parts of the sentence for the current variant: the ones the
  // metadata words, plus one per parameter neither the variant nor a clause
  // mentions so nothing the operation supports becomes unreachable. Parameters
  // the engine ignores get no clause - offering them would suggest they work.
  clauses() {
    const variant = this.currentVariant();
    const ignored = this.ignoredParameters();
    const usable = clause=>this.templateParameters(clause.template).every(name=>!Object.prototype.hasOwnProperty.call(ignored, name));
    const clauses = (this.metadata.clauses || []).filter(clause=>(!clause.variants || clause.variants.indexOf(variant.id) != -1) && usable(clause));

    const spokenFor = new Set([ ...this.templateParameters(variant.template), ...(variant.fixed || []), ...clauses.flatMap(clause=>this.templateParameters(clause.template)) ]);
    for(const name in this.metadata.parameters)
      if(!spokenFor.has(name) && !Object.prototype.hasOwnProperty.call(ignored, name))
        clauses.push({ id: name, label: name, template: `, ${name} {${name}}`, generated: true });
    return clauses;
  }

  clauseIsActive(clause) {
    return this.templateParameters(clause.template).some(name=>this.parameterIsSet(name));
  }

  // the sentence in the order it is rendered: the variant, cut at the places it
  // reserves for a clause ({{clauseID}}), and the clauses without a place of
  // their own behind it
  sentenceParts() {
    const clauses = this.clauses();
    const placed = [];
    const parts = [];
    let rest = this.resolveTemplate(this.currentVariant().template);
    let match;
    while((match = rest.match(/\{\{([a-zA-Z0-9]+)\}\}/))) {
      parts.push({ template: rest.slice(0, match.index) });
      const clause = clauses.find(c=>c.id == match[1]);
      if(clause) {
        parts.push({ template: clause.template, clause });
        placed.push(clause);
      }
      rest = rest.slice(match.index + match[0].length);
    }
    parts.push({ template: rest });
    for(const clause of clauses)
      if(placed.indexOf(clause) == -1)
        parts.push({ template: clause.template, clause });
    return parts;
  }

  // switching an option on sets its parameters to a value that shows what it
  // does - the default where it says something, a usable value where the
  // default only means "not in use"
  clauseAddValues(clause) {
    const values = {};
    for(const name of this.templateParameters(clause.template)) {
      if(clause.add && typeof clause.add[name] != 'undefined') {
        values[name] = clause.add[name];
        continue;
      }
      const fromDefault = this.getDefaults()[name];
      if(fromDefault !== null && typeof fromDefault != 'undefined') {
        values[name] = fromDefault;
        continue;
      }
      const spec = this.parameterSpec(name) || {};
      const empty = { number: 0, enum: (spec.values || [])[0], collection: 'DEFAULT', widgets: null, json: null };
      values[name] = typeof empty[spec.type] != 'undefined' ? empty[spec.type] : '';
    }
    return values;
  }

  clauseRemoveValues(clause) {
    const values = {};
    for(const name of this.templateParameters(clause.template))
      values[name] = undefined;
    return values;
  }

  // the value the parameter effectively has: the explicitly set one or its default
  parameterValue(name) {
    if(this.parameterIsSet(name))
      return this.operation[name];
    return this.getDefaults()[name];
  }

  // whether the operation names the parameter itself instead of falling back to
  // its default - the difference matters for values that mean "unset" (a MOVEXY
  // z of 0 keeps the current z, so it deserves the ignored warning)
  parameterIsSet(name) {
    return Boolean(this.operation) && typeof this.operation == 'object' && typeof this.operation[name] != 'undefined';
  }

  // { parameterName: reason } for parameters the engine currently ignores because
  // of how other parameters are set (e.g. MOVE count when fillTo is set)
  ignoredParameters() {
    if(typeof this.metadata.ignored == 'function')
      return this.metadata.ignored(name=>this.parameterValue(name), name=>this.parameterIsSet(name)) || {};
    return {};
  }

  notifyChangeListeners(value) {
    for(const listener of this.changeListeners)
      listener(value);
  }

  onNewValue(values) {
    if(typeof values == 'string') {
      this.notifyChangeListeners(values);
    } else {
      Object.assign(this.operation, values);
      for(const key in this.operation)
        if(this.operation[key] === undefined)
          delete this.operation[key];
      this.notifyChangeListeners(this.operation);
    }
  }

  parameterSpec(name) {
    return this.metadata.parameters[name];
  }

  registerChangeListener(listener) {
    this.changeListeners.push(listener);
  }

  render() {
    const dom = document.createElement('div');
    this.domElement = dom;
    dom.classList.add('routine-editor-operation');
    const uiState = operationUIState(this.operation);
    if(uiState.listView)
      dom.classList.add('list-view');

    // the header holds the summary and, appended by the routine editor, the
    // move/delete buttons: laid out side by side they can never overlap
    const header = div(dom, 'routine-editor-operation-header');
    const body = div(header, 'routine-editor-operation-body');

    if(uiState.listView)
      this.renderListView(body);
    else
      this.renderSentenceView(body);

    this.renderParameterWarnings(body);

    if(this.isExpandable())
      ($('.routine-editor-parameter-row', body) || body).prepend(this.renderViewToggle());

    // in the expanded view, a button next to the summary shows the raw JSON
    if(uiState.listView && this.operation && typeof this.operation == 'object') {
      const jsonButton = document.createElement('span');
      jsonButton.className = 'material-symbols routine-editor-operation-json';
      jsonButton.textContent = 'data_object';
      jsonButton.title = 'Edit this operation as JSON';
      jsonButton.addEventListener('click', async e=>{
        e.stopPropagation();
        const popup = new RoutineFullOperationJSONPopup();
        popup.setSource(jsonButton);
        popup.setOperationDetails(this.operation, [ 'json' ], this.widget, this.variables, this.collections);
        const values = await newRoutineValues(popup);
        if(values !== undefined)
          this.onNewValue(values);
      });
      header.append(jsonButton);
    }

    for(const span of $a('span[data-parameter]', dom)) {
      span.addEventListener('click', async e=>{
        e.stopPropagation();
        const parameterNames = span.dataset.parameter.split(',');
        const popup = this.createPopup(parameterNames);
        popup.setSource(span);
        popup.setOperationDetails(this.operation, parameterNames, this.widget, this.variables, this.collections);
        const values = await newRoutineValues(popup);
        if(values !== undefined) // undefined means the popup was dismissed
          this.onNewValue(values);
      });
    }
    return dom;
  }

  // escapeHTML because parameter values come from untrusted room state
  renderParameterChip(spec) {
    const resolved = this.resolveParameter(spec);
    const rawValue = resolved !== null && this.operation && typeof this.operation[resolved] != 'undefined' ? this.operation[resolved] : (resolved !== null ? this.getDefaults()[resolved] : undefined);
    const category = this.classifyParameter(resolved, rawValue);
    const displayed = this.getDisplayedValue(spec);
    const missing = displayed === '?' ? ' routine-editor-parameter-missing' : '';
    const categoryNames = { func: 'operation', variable: 'variable', collection: 'collection', widget: 'widget', number: 'number', value: 'value' };
    // the operation chip is also where the ways it can work are picked, so its
    // tooltip names the one the sentence shows instead of repeating "func"
    const title = category == 'func'
      ? `${this.func || 'operation'}${this.variants().length > 1 ? ` - ${this.currentVariant().label}` : ''} - click to change the operation or how it works`
      : `${categoryNames[category] || 'value'} - click to change ${spec.split(',').join(' / ')}`;
    return `<span class="routine-editor-operation-parameter routine-editor-parameter-${category}${missing}" data-parameter="${spec}" title="${escapeHTML(title)}">${escapeHTML(displayed)}</span>`;
  }

  renderTemplateText(template) {
    return this.resolveTemplate(template).replace(/\{([a-zA-Z0-9,]+)\}/g, (_, spec)=>this.renderParameterChip(spec));
  }

  // the sentence of the current variant, plus the options that are switched on -
  // each with the x that removes it again - and the button offering the rest
  renderSentenceView(dom) {
    let html = '';
    for(const part of this.sentenceParts()) {
      if(!part.clause) {
        html += this.renderTemplateText(part.template);
      } else if(this.clauseIsActive(part.clause)) {
        html += `<span class="routine-editor-clause">${this.renderTemplateText(part.template)}<span class="material-symbols routine-editor-clause-remove" data-clause="${escapeHTML(part.clause.id)}" title="Remove this option">close</span></span>`;
      }
    }
    if(this.clauses().some(clause=>!this.clauseIsActive(clause)))
      html += `<span class="routine-editor-add-clause" title="Add one of the options this operation offers">+ option</span>`;
    dom.innerHTML = html;

    for(const remove of $a('.routine-editor-clause-remove', dom))
      remove.addEventListener('click', e=>{
        e.stopPropagation();
        const clause = this.clauses().find(c=>c.id == remove.dataset.clause);
        if(clause)
          this.onNewValue(this.clauseRemoveValues(clause));
      });

    const addClause = $('.routine-editor-add-clause', dom);
    if(addClause)
      addClause.addEventListener('click', async e=>{
        e.stopPropagation();
        const popup = new RoutineClausePopup(this.clauses().filter(clause=>!this.clauseIsActive(clause)).map(clause=>({
          label: clause.label,
          sentence: this.renderClauseExample(clause),
          values: this.clauseAddValues(clause)
        })));
        popup.setSource(addClause);
        popup.setOperationDetails(this.operation, [ 'func' ], this.widget, this.variables, this.collections);
        const values = await newRoutineValues(popup);
        if(values !== undefined)
          this.onNewValue(values);
      });
  }

  // what the option would read as once it is switched on, for the menu offering it
  renderClauseExample(clause) {
    const values = this.clauseAddValues(clause);
    return this.resolveTemplate(clause.template).replace(/\{([a-zA-Z0-9,]+)\}/g, (_, spec)=>{
      const name = spec.split(',').find(p=>typeof values[p] != 'undefined') || spec.split(',')[0];
      const value = values[name];
      const display = (this.parameterSpec(name) || {}).display;
      if(display && display[value] != null)
        return display[value];
      return value === null || value === '' ? '?' : (typeof value == 'object' ? JSON.stringify(value) : value);
    }).trim().replace(/^[,;]\s*/, '');
  }

  // one line per declared parameter, including the ones the operation does not define
  renderListView(dom) {
    const ignored = this.ignoredParameters();
    let html = `<div class="routine-editor-parameter-row">${this.renderParameterChip('func')}</div>`;
    for(const name in this.metadata.parameters) {
      const isIgnored = Object.prototype.hasOwnProperty.call(ignored, name);
      html += `<div class="routine-editor-parameter-row${isIgnored ? ' routine-editor-parameter-ignored' : ''}"><span class="routine-editor-parameter-name">${escapeHTML(name)}</span>${this.renderParameterChip(name)}</div>`;
    }
    // custom properties the operation does not know about are listed last: the
    // engine ignores them, but hiding them makes a typo impossible to spot
    for(const name of this.unsupportedProperties())
      html += `<div class="routine-editor-parameter-row routine-editor-parameter-unsupported"><span class="routine-editor-parameter-name">${escapeHTML(name)}</span>${this.renderParameterChip(name)}</div>`;
    dom.innerHTML = html;
    // the wiki information the parameter popup offers is right here as well, so
    // the expanded view explains itself without opening one: the operation text
    // next to the operation, and each parameter's own description next to it
    for(const row of $a('.routine-editor-parameter-row', dom)) {
      const nameDOM = $('.routine-editor-parameter-name', row);
      const info = nameDOM ? commonParameterInfoButton(null, this.func, nameDOM.textContent) : commonInfoButton(null, this.func);
      if(!info)
        continue;
      info.classList.add('routine-editor-parameter-info');
      // deliberately no title: a browser tooltip repeating "information about
      // <parameter>" only reads like the information it is not - the popup the
      // button opens on click is where the actual explanation is
      if(nameDOM)
        nameDOM.after(info);
      else
        row.append(info);
    }
    // a red "!" at the end of every ignored line explains why it has no effect
    for(const row of $a('.routine-editor-parameter-row.routine-editor-parameter-ignored', dom)) {
      const name = $('.routine-editor-parameter-name', row).textContent;
      const warning = document.createElement('span');
      warning.className = 'material-symbols routine-editor-parameter-ignored-warning';
      warning.textContent = 'error';
      warning.title = ignored[name];
      row.append(warning);
    }
  }

  // a clickable "!" behind every chip whose parameter needs a word of warning:
  // orange for a deprecated one (in both views, because a deprecated parameter
  // that is set must not be hidden behind the sentence/list toggle) and red for
  // a custom property the operation does not support at all
  renderParameterWarnings(dom) {
    for(const span of $a('span[data-parameter]', dom)) {
      const name = span.dataset.parameter;
      const spec = this.parameterSpec(this.resolveParameter(name));
      if(spec && spec.deprecated)
        span.after(this.parameterWarningButton('deprecated', 'warning', spec.deprecated));
      else if(!spec && this.unsupportedProperties().indexOf(name) != -1)
        span.after(this.parameterWarningButton('unsupported', 'error', `
          <pre>
          ${escapeHTML(this.func)} does not support the property ${escapeHTML(name)}.

          The engine ignores it - it is most likely a typo or a leftover from an older
          version of the game. Click the value and use "use default" to remove it.
          </pre>
        `));
    }
  }

  parameterWarningButton(kind, icon, infoHTML) {
    const warning = infoButton(null, infoHTML);
    warning.classList.add('routine-editor-parameter-warning', kind);
    $('.material-symbols', warning).textContent = icon;
    warning.title = `${kind} - click for details`;
    return warning;
  }

  // nested routines are rendered by the operation editor itself, so they are
  // neither parameters nor unsupported custom properties
  subroutineProperties() {
    return [];
  }

  // properties of the operation JSON that its func does not declare
  unsupportedProperties() {
    if(!this.operation || typeof this.operation != 'object')
      return [];
    const known = [ 'func', ...Object.keys(this.metadata.parameters), ...this.subroutineProperties() ];
    return Object.keys(this.operation).filter(name=>known.indexOf(name) == -1);
  }

  // operations with parameters can expand from the sentence to the list view
  isExpandable() {
    return Object.keys(this.metadata.parameters).length > 0;
  }

  renderViewToggle() {
    const uiState = operationUIState(this.operation);
    const toggle = document.createElement('span');
    toggle.className = 'material-symbols routine-editor-view-toggle';
    toggle.textContent = uiState.listView ? 'expand_more' : 'chevron_right';
    toggle.title = 'Toggle between the sentence and the parameter list view';
    toggle.addEventListener('click', e=>{
      e.stopPropagation();
      uiState.listView = !uiState.listView;
      const oldDom = this.domElement;
      const newDom = this.render();
      // keep the move/delete buttons the routine editor appended to the old node
      // (own header only - nested operations have their own button clusters)
      const oldHeader = [ ...oldDom.children ].find(c=>c.classList.contains('routine-editor-operation-header'));
      const buttons = oldHeader && [ ...oldHeader.children ].find(c=>c.classList.contains('routine-editor-operation-buttons'));
      if(buttons)
        [ ...newDom.children ].find(c=>c.classList.contains('routine-editor-operation-header')).append(buttons);
      // the routine editor still counts this operation as selected, so the new
      // card has to look selected too - otherwise a later drag silently moves it
      newDom.classList.toggle('routine-editor-operation-selected', oldDom.classList.contains('routine-editor-operation-selected'));
      oldDom.replaceWith(newDom);
    });
    return toggle;
  }

  renderSubroutine(dom, property, options={}) {
    // only assign the array to the operation when something actually changes
    const routine = Array.isArray(this.operation[property]) ? this.operation[property] : [];
    // hoisting out of a nested block means removing from here and asking the
    // parent routine (via the container editor) to re-insert after the container
    options = {
      ...options,
      onHoist: op=>this.hoistIntoParent && this.hoistIntoParent(op),
      parentEditor: this.routineEditor,
      attachRoutine: _=>{ this.operation[property] = routine; }
    };
    const routineEditor = new RoutineEditor(this.widget, routine, this.variables, this.collections, options);
    routineEditor.registerChangeListener(v=>{
      this.operation[property] = v;
      this.notifyChangeListeners(this.operation);
    });
    this.subroutineEditors[property] = routineEditor;
    dom.append(routineEditor.render());
  }

  resolveParameter(property) {
    if(property.match(/,/)) {
      for(const p of property.split(',')) {
        if((this.operation && typeof this.operation[p] != 'undefined') || this.getDefaults()[p] !== null)
          return p;
      }
      return null;
    }
    return property;
  }

  setOperationDetails(widget, operation, variables, collections) {
    this.widget = widget;
    this.operation = operation;
    this.variables = variables;
    this.collections = collections;
  }
}

class IfRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('IF');
  }

  ignoredParameters() {
    // a custom condition overrides the operand comparison
    if(this.operation && typeof this.operation.condition != 'undefined')
      return { operand1: 'ignored because a custom condition is set', relation: 'ignored because a custom condition is set', operand2: 'ignored because a custom condition is set' };
    return {};
  }

  subroutineProperties() {
    return [ 'thenRoutine', 'elseRoutine' ];
  }

  render() {
    super.render();
    this.renderSubroutine(this.domElement, 'thenRoutine', { emptyHint: 'Add operations to run when the condition is true' });
    if(Array.isArray(this.operation.elseRoutine)) {
      const elseLabel = document.createElement('div');
      elseLabel.className = 'routine-editor-else';
      elseLabel.textContent = 'ELSE';
      this.domElement.append(elseLabel);
      this.renderSubroutine(this.domElement, 'elseRoutine', { emptyHint: 'Add operations to run when the condition is false' });
    } else {
      const addElse = button(this.domElement, 'add ELSE', _=>{
        this.operation.elseRoutine = [];
        this.notifyChangeListeners(this.operation);
      });
      addElse.className = 'routine-editor-add-operation routine-editor-add-else';
    }
    return this.domElement;
  }
}

class ForeachRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('FOREACH');
  }

  createPopup(parameterNames) {
    if(parameterNames.length > 1)
      return new RoutineForeachSourcePopup();
    return super.createPopup(parameterNames);
  }

  subroutineProperties() {
    return [ 'loopRoutine' ];
  }

  render() {
    super.render();
    this.renderSubroutine(this.domElement, 'loopRoutine', { emptyHint: 'Add operations to run for each iteration' });
    return this.domElement;
  }
}

class VarStringRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('var');
  }

  currentVariant() {
    // fall back to raw editing for statements the simple form cannot represent
    return this.isSimple()
      ? { id: 'simple', label: 'var', template: 'variable {variable} gets value {expression}' }
      : { id: 'raw', label: 'var', template: '{statement}' };
  }

  createPopup(parameterNames) {
    return new RoutineStringPopup();
  }

  getDefinedVariables() {
    const match = typeof this.operation == 'string' && this.operation.match(/^var (\S+) = /);
    return match ? [ match[1] ] : [];
  }

  getDisplayedValue(property) {
    const match = typeof this.operation == 'string' && this.operation.match(/^var (\S+) = (.*)$/);
    if(property == 'variable')
      return match ? match[1] : 'variable';
    if(property == 'expression')
      return match ? match[2] : 'expression';
    return this.operation;
  }

  getExampleWithDefaults() {
    return 'variable x gets value 1';
  }

  isSimple() {
    return typeof this.operation == 'string' && !!this.operation.match(/^var (\S+) = (.*)$/);
  }

  onNewValue(values) {
    // the operation is a string like "var x = 1", so rebuild it instead of assigning object keys
    if(typeof values.statement == 'string') {
      this.notifyChangeListeners(values.statement);
      return;
    }
    const variable = typeof values.variable == 'string' && values.variable !== '' ? values.variable : this.getDisplayedValue('variable');
    const expression = typeof values.expression == 'string' && values.expression !== '' ? values.expression : this.getDisplayedValue('expression');
    this.notifyChangeListeners(`var ${variable} = ${expression}`);
  }
}

class CommentRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('//');
  }

  currentVariant() {
    return { id: 'comment', label: '//', template: '// {comment}' };
  }

  createPopup(parameterNames) {
    return new RoutineStringPopup();
  }

  getDisplayedValue(property) {
    return typeof this.operation == 'string' ? this.operation.replace(/^\/\/\s?/, '') : '';
  }

  getExampleWithDefaults() {
    return '// comment';
  }

  onNewValue(values) {
    this.notifyChangeListeners(`// ${values.comment != null ? values.comment : ''}`);
  }
}

class UnknownRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super(null);
  }

  currentVariant() {
    return { id: 'json', label: 'unknown operation', template: '{json}' };
  }

  createPopup(parameterNames) {
    return new RoutineFullOperationJSONPopup();
  }

  getDisplayedValue(property) {
    return JSON.stringify(this.operation);
  }

  // the whole operation is unknown, so singling out properties makes no sense
  unsupportedProperties() {
    return [];
  }

  onNewValue(values) {
    // the popup edits the entire operation, so replace it instead of merging keys
    this.notifyChangeListeners(values);
  }
}

function editorForOperation(operation) {
  if(typeof operation == 'string' && operation.match(/^var /))
    return new VarStringRoutineOperationEditor();
  if(typeof operation == 'string' && operation.match(/^\s*(\/\/|$)/))
    return new CommentRoutineOperationEditor();
  if(operation && typeof operation == 'object' && routineOperationMetadata[operation.func]) {
    if(operation.func == 'IF')
      return new IfRoutineOperationEditor();
    if(operation.func == 'FOREACH')
      return new ForeachRoutineOperationEditor();
    return new RoutineOperationEditor(operation.func);
  }
  return new UnknownRoutineOperationEditor();
}

// pre-filled simple versions of common operations, offered first when adding one
const simpleRoutineOperationExamples = [
  { example: 'MOVE cards from a to b', newOperation: { func: 'MOVE', count: 1, from: null, to: null } },
  { example: 'FLIP the top card of a holder', newOperation: { func: 'FLIP', count: 1, holder: null } },
  { example: 'SHUFFLE a holder', newOperation: { func: 'SHUFFLE', holder: null } },
  { example: 'RECALL all cards to their holder', newOperation: { func: 'RECALL', holder: null } },
  { example: 'SELECT widgets into a collection', newOperation: { func: 'SELECT' } },
  { example: 'TURN moves to the next player', newOperation: { func: 'TURN' } }
];

// the choices offered when adding an operation or switching its type
function routineOperationExamples() {
  const examples = [];
  for(const func in routineOperationMetadata) {
    const editor = editorForOperation({ func });
    editor.setOperationDetails(null, { func }, [], []);
    examples.push({ example: editor.getExampleWithDefaults(), newOperation: { func } });
  }
  examples.push({ example: 'variable x gets value 1', newOperation: 'var x = 1' });
  examples.push({ example: '// comment', newOperation: '// comment' });
  return examples;
}

// what picking the variant does to the operation, as the { parameter: value }
// update the chip popups report back (undefined removes a parameter)
function operationVariantValues(operation, variant) {
  const updated = Object.assign({}, operation);
  if(variant.apply)
    variant.apply(updated);
  const values = {};
  for(const key in operation)
    values[key] = undefined;
  for(const key in updated)
    values[key] = updated[key];
  return values;
}

// the ways the operation can work, each with the sentence it would read as -
// what the operation chip offers besides the other operations. Operations with
// only one way to work (DELAY, INPUT, ...) have nothing to choose here.
function routineOperationVariantChoices(operation) {
  const metadata = routineOperationMetadata[operation && operation.func];
  if(!metadata || (metadata.variants || []).length < 2)
    return [];
  return metadata.variants.map(variant=>{
    const preview = Object.assign({}, operation);
    if(variant.apply)
      variant.apply(preview);
    const editor = editorForOperation(preview);
    editor.setOperationDetails(null, preview, [], []);
    return { id: variant.id, label: variant.label, example: editor.getExampleWithDefaults(variant, ''), values: operationVariantValues(operation, variant) };
  });
}
