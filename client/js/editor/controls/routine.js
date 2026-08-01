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
//     so the last one is the fallback. Every sentence starts with the words that
//     say what the operation does ("Turn face up", "Move widgets from"); those
//     words are the drop-down that switches between the variants, so word every
//     template so that what tells the variants apart comes before the first
//     parameter. Picking another entry runs that variant's apply() and rewrites
//     the parameters that tell the variants apart together with the sentence, so
//     nobody has to know that "turn face up" means face 0 and "flip to the next
//     face" means faceCycle. fixed names the parameters a variant decides: they
//     are changed by picking another variant, never as an option of their own.
//
//   clauses - the optional parts of the sentence. A clause is shown while one of
//     its parameters is set and disappears with them, so a card only words what
//     the operation actually does. The "add option" button behind the sentence
//     offers the ones that are off, and every clause shown has an x that removes
//     it again. Parameters no variant and no clause mentions become a clause of
//     their own, so nothing an operation supports is unreachable.
//
// What belongs in the sentence and what belongs in a clause follows one rule: a
// parameter whose default means "not in use" (SELECT max, SELECT source, GET
// variable, SORT key, TURN turn, RESET property) is a clause and stays out of
// the sentence until a game sets it, while a parameter whose default is a real
// quantity the operation applies (a count of widgets, an angle, a delay) stays
// in the sentence. So an operation with nothing but its defaults reads as the
// short sentence it is - "Count the picked widgets", "Pick widgets where
// cardType is ace" - and every word that is there is a word that matters.
//
// The words are English, never the engine's vocabulary: no operation name, no
// enum value and no raw null, 0 or 999999. An enum is worded through its
// display table ("ignoreClickRoutine" -> "but do not run their click routines"),
// and so is a yes/no parameter, whose two sides are two phrases rather than
// "true" and "false".
//
// Not worded at all: skip. The engine still honours it on every operation, but
// it is deprecated and no new game should use one, so the sentence does not
// offer it. Games that have one keep it as the custom property it looks like
// until there is a way to show it that does not read as an invitation.
//
// description is the one generic line that says what the operation is for. It is
// what the list of operations offers ("Play a sound", "Run another routine"),
// because a sentence full of the values of an operation that does not exist yet
// describes the example rather than the operation.
//
// newOperation is the JSON a freshly added operation starts as, where the raw
// defaults are not the shape people actually write (SELECT, SET). Everything
// else starts as nothing but its func.
//
// Template syntax: the words before the first parameter are the variant's lead,
// rendered as the drop-down described above; {name} is a clickable parameter
// chip; {a,b} shows the first alternative that is explicitly set (or whose
// default is not null); {{clause}} is where that clause goes if it is switched
// on (clauses without a place of their own follow the sentence). A template can
// also be a function receiving an accessor for the effective parameter values,
// so the wording can follow values that do not warrant a variant of their own.
//
// Parameter types decide which popup opens: number, enum (with values),
// string, property (the name of a widget property), json, widgets (pick widgets
// in the room), collection (pick widgets or a collection name).
//
// display turns a stored value into the words the chip shows: a table keyed by
// the value, or a function of it where the words are computed (a volume as a
// percentage, a list of ids spelled out).
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

// a collection left at DEFAULT is whatever the operations before it picked, and
// that is what the sentence says instead of the name the engine uses for it.
// "the pick" is the same thing worded for the slots that already say "in".
const pickedWidgets = { 'DEFAULT': 'the picked widgets' };
const thePick = { 'DEFAULT': 'the pick' };

// a list of ids reads as a list of ids, not as JSON
function wordList(entries) {
  const words = entries.map(entry=>entry !== null && typeof entry == 'object' ? JSON.stringify(entry) : String(entry));
  if(words.length < 3)
    return words.join(' and ');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length-1]}`;
}

// and so does a list of values a parameter takes as JSON (FOREACH in, SORT key,
// UPLOAD fileTypes) - only a list of objects stays JSON, there are no words for it
function listWords(value) {
  if(!Array.isArray(value) || value.some(entry=>entry !== null && typeof entry == 'object'))
    return null;
  return value.length ? wordList(value) : 'nothing';
}

// a FOREACH range is a start, an end and a step, and a single number is the end
// of a range starting at 1 - which is not something a list of numbers says
function rangeWords(value) {
  if(!Array.isArray(value))
    return value === null || typeof value == 'object' ? null : `1 to ${value}`;
  const [ start, end, step ] = value.length == 1 ? [ 1, value[0] ] : value;
  return `${start} to ${end}${step !== undefined ? ` in steps of ${step}` : ''}`;
}

// the values an operation passes on (CALL arguments, CLONE properties, VAR
// variables) are pairs, and pairs read as pairs
function keyValueWords(value) {
  if(!value || typeof value != 'object' || Array.isArray(value))
    return null;
  const entries = Object.entries(value);
  if(!entries.length)
    return 'nothing';
  const words = entries.slice(0, 3).map(([ key, entry ])=>`${key}: ${entry !== null && typeof entry == 'object' ? JSON.stringify(entry) : entry}`);
  // a long list of pairs is a list, not a sentence - the popup shows all of them
  if(entries.length > words.length)
    words.push(`and ${entries.length - words.length} more`);
  return words.join(', ');
}

// the first two faces of a card are the ones a game means when it turns cards
// over, and "up" and "down" is what they are called everywhere else
const faceWords = { '0': 'up', '1': 'down', 'null': 'unchanged' };

// "1 widgets" is not a sentence: the wording follows the number, while the chip
// stays in it either way so the number is still there to be changed
function widgetsCounted(v, parameter) {
  return `{${parameter}} widget${v(parameter) == 1 ? '' : 's'}`;
}

// a yes/no parameter has no "true" in its sentence: both sides are the phrase
// that says what the operation then does
function yesNo(yes, no) {
  return { 'true': yes, 'false': no };
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
    description: 'Play a sound',
    variants: [
      {
        id: 'silence', label: 'Stop all sounds', fixed: [ 'silence' ],
        match: v=>v('silence'),
        apply: operation=>{ operation.silence = true; },
        template: 'Stop all sounds'
      },
      {
        id: 'play', label: 'Play a sound', fixed: [ 'silence' ],
        apply: operation=>{ delete operation.silence; },
        template: 'Play the sound {source}'
      }
    ],
    clauses: [
      { id: 'maxVolume', label: 'play it quieter', template: ' at {maxVolume} volume', add: { maxVolume: 0.5 } },
      { id: 'player', label: 'only for one player', template: ' for {player}', add: { player: '' } },
      { id: 'count', label: 'play it more than once', template: ', {count}' },
      { id: 'length', label: 'stop after a while', template: ', stopping after {length} milliseconds', add: { length: 1000 } }
    ],
    parameters: {
      source: { type: 'string', default: '' },
      maxVolume: { type: 'number', default: 1.0, display: value=>typeof value == 'number' ? `${Math.round(value*100)}%` : null },
      length: { type: 'number', default: null },
      player: { type: 'string', default: null, display: { 'null': 'everyone' } },
      silence: { type: 'enum', values: [ true, false ], default: false },
      count: { type: 'number', default: 1, special: [ 'loop' ], display: value=>value == 'loop' ? 'over and over' : (value == 1 ? 'once' : `${value} times`) }
    },
    ignored: v=>{
      // silence only resets the audio context, it never plays anything
      if(v('silence'))
        return { source: 'ignored because silence stops the audio instead of playing it', maxVolume: 'ignored because silence stops the audio instead of playing it', length: 'ignored because silence stops the audio instead of playing it', count: 'ignored because silence stops the audio instead of playing it' };
      return v('length') != null ? { count: 'ignored because a length is set' } : {};
    }
  },
  CALL: {
    description: 'Run another routine',
    variants: [
      { id: 'call', label: 'Run another routine', template: 'Run the routine {routine}' }
    ],
    clauses: [
      { id: 'widget', label: 'a routine of another widget', template: ' of {widget}' },
      { id: 'arguments', label: 'pass values into the routine', template: ', passing {arguments}' },
      { id: 'variable', label: 'store the value it returns', template: ' and remember the result as {variable}' },
      { id: 'collection', label: 'store the widgets it selected', template: ' and remember its widgets as {collection}' },
      { id: 'return', label: 'do not wait for a result', template: ', {return}', add: { 'return': false } }
    ],
    parameters: {
      routine: { type: 'string', default: 'clickRoutine' },
      widget: { type: 'widgets', default: null, display: { 'null': 'this widget' } },
      variable: { type: 'string', default: 'result' },
      collection: { type: 'collection', default: 'result' },
      'return': { type: 'enum', values: [ true, false ], default: true, display: yesNo('waiting for it to finish', 'without waiting for it to finish') },
      arguments: { type: 'json', default: {}, display: keyValueWords }
    },
    definesVariable: 'variable',
    definesCollection: 'collection'
  },
  CANVAS: {
    description: 'Draw on a canvas',
    variants: [
      { id: 'reset', label: 'Reset a canvas', fixed: [ 'mode' ], match: v=>v('mode') == 'reset',
        apply: operation=>{ operation.mode = 'reset'; },
        template: v=>`Clear the canvas ${canvasTarget(v)}` },
      { id: 'set', label: 'Set the value of canvas fields', fixed: [ 'mode' ], match: v=>v('mode') == 'set',
        apply: operation=>{ operation.mode = 'set'; },
        template: v=>`Set the value of ${canvasTarget(v)} to {value}` },
      { id: 'inc', label: 'Increase the value of canvas fields', fixed: [ 'mode' ], match: v=>v('mode') == 'inc',
        apply: operation=>{ operation.mode = 'inc'; },
        template: v=>`Increase the value of ${canvasTarget(v)} by {value}` },
      { id: 'dec', label: 'Decrease the value of canvas fields', fixed: [ 'mode' ], match: v=>v('mode') == 'dec',
        apply: operation=>{ operation.mode = 'dec'; },
        template: v=>`Decrease the value of ${canvasTarget(v)} by {value}` },
      { id: 'change', label: 'Recolor a value on a canvas', fixed: [ 'mode' ], match: v=>v('mode') == 'change',
        apply: operation=>{ operation.mode = 'change'; },
        template: v=>`Recolor the value {value} on ${canvasTarget(v)} to {color}` },
      { id: 'setPixel', label: 'Set a single pixel', fixed: [ 'mode' ], match: v=>v('mode') == 'setPixel',
        apply: operation=>{ operation.mode = 'setPixel'; },
        template: v=>`Set one pixel of ${canvasTarget(v)} at ({x}, {y}) to the value {value}` }
    ],
    clauses: [
      { id: 'count', label: 'only some of the widgets', template: ', for {count} widgets', add: { count: 1 } }
    ],
    parameters: {
      mode: { type: 'enum', values: [ 'set', 'inc', 'dec', 'change', 'reset', 'setPixel' ], default: 'reset' },
      collection: { type: 'collection', default: 'DEFAULT', widgetType: 'canvas', display: { 'DEFAULT': 'the picked canvases' } },
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
    description: 'Click widgets as if a player had',
    variants: [
      { id: 'click', label: 'Click widgets', template: 'Click {collection}' }
    ],
    clauses: [
      { id: 'count', label: 'click them more than once', template: ', {count}' },
      { id: 'mode', label: 'ignore clickable or click routines', template: ', {mode}' }
    ],
    parameters: {
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      count: { type: 'number', default: 1, display: value=>value == 1 ? 'once' : `${value} times` },
      mode: { type: 'enum', values: [ 'respect', 'ignoreClickable', 'ignoreClickRoutine', 'ignoreAll' ], default: 'respect', display: {
        respect: 'only the ones that are clickable',
        ignoreClickable: 'even the ones that are not clickable',
        ignoreClickRoutine: 'but do not run their click routines',
        ignoreAll: 'even the ones that are not clickable, and without running their click routines'
      } }
    }
  },
  CLONE: {
    description: 'Make copies of widgets',
    variants: [
      { id: 'clone', label: 'Copy widgets', template: v=>`Make ${v('count') == 1 ? '{count} copy' : '{count} copies'} of {source}` }
    ],
    clauses: [
      { id: 'offset', label: 'place the copies elsewhere', template: ', offset by {xOffset}, {yOffset}' },
      { id: 'properties', label: 'change properties of the copies', template: ', and set {properties} on them' },
      { id: 'recursive', label: 'copy the widgets inside as well', template: ', {recursive}', add: { recursive: true } },
      { id: 'collection', label: 'remember the copies', template: ' — call the copies {collection}' }
    ],
    parameters: {
      source: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      count: { type: 'number', default: 1 },
      xOffset: { type: 'number', default: 0 },
      yOffset: { type: 'number', default: 0 },
      properties: { type: 'json', default: {}, display: keyValueWords },
      recursive: { type: 'enum', values: [ true, false ], default: false, display: yesNo('including the widgets on them', 'without the widgets on them') },
      collection: { type: 'collection', default: 'DEFAULT', display: thePick }
    },
    definesCollection: 'collection'
  },
  COUNT: {
    description: 'Count widgets',
    variants: [
      { id: 'holder', label: 'Count what is in a holder', match: (v, isSet)=>isSet('holder'),
        apply: operation=>{ if(operation.holder === undefined) operation.holder = null; },
        template: 'Count what is in {holder}{{owner}}{{variable}}' },
      { id: 'collection', label: 'Count the widgets of a collection', fixed: [ 'holder' ],
        apply: operation=>{ delete operation.holder; },
        template: 'Count {collection}{{owner}}{{variable}}' }
    ],
    clauses: [
      { id: 'owner', label: 'only what one player owns', template: ' owned by {owner}', add: { owner: '' } },
      { id: 'variable', label: 'store the number under another name', template: ' and remember it as {variable}' }
    ],
    parameters: {
      owner: { type: 'string', default: null, display: { 'null': 'anyone' } },
      holder: { type: 'widgets', default: null, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      variable: { type: 'string', default: 'COUNT' }
    },
    definesVariable: 'variable',
    ignored: collectionReplacedBy('holder')
  },
  DELAY: {
    description: 'Insert a pause before continuing',
    variants: [
      { id: 'delay', label: 'Wait', template: 'Wait for {milliseconds} milliseconds' }
    ],
    parameters: {
      milliseconds: { type: 'number', default: 0 }
    }
  },
  DELETE: {
    description: 'Delete widgets',
    variants: [
      { id: 'delete', label: 'Delete widgets', template: 'Delete {collection}' }
    ],
    parameters: {
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets }
    }
  },
  FLIP: {
    description: 'Turn widgets face up or down',
    variants: [
      { id: 'up', label: 'Turn face up', fixed: [ 'face', 'faceCycle' ], match: v=>v('face') === 0,
        apply: operation=>{ delete operation.faceCycle; operation.face = 0; },
        template: v=>`Turn face up ${widgetsCounted(v, 'count')} in {holder,collection}` },
      { id: 'down', label: 'Turn face down', fixed: [ 'face', 'faceCycle' ], match: v=>v('face') === 1,
        apply: operation=>{ delete operation.faceCycle; operation.face = 1; },
        template: v=>`Turn face down ${widgetsCounted(v, 'count')} in {holder,collection}` },
      { id: 'toFace', label: 'Turn to a specific face', fixed: [ 'faceCycle' ], match: v=>typeof v('face') == 'number',
        apply: operation=>{ delete operation.faceCycle; if(typeof operation.face != 'number' || operation.face < 2) operation.face = 2; },
        template: v=>`Turn to the face {face}, ${widgetsCounted(v, 'count')} in {holder,collection}` },
      { id: 'cycle', label: 'Flip to the next face', fixed: [ 'face' ],
        apply: operation=>{ delete operation.face; },
        template: v=>`Flip ${widgetsCounted(v, 'count')} in {holder,collection} to {faceCycle}` }
    ],
    parameters: {
      count: { type: 'number', default: 'all', special: [ 'all' ] },
      holder: { type: 'widgets', default: null, display: { 'null': '?' }, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT', display: thePick },
      face: { type: 'number', default: null, display: { 'null': 'next' } },
      faceCycle: { type: 'enum', values: [ 'forward', 'backward', 'random' ], default: 'forward', display: { forward: 'the next face', backward: 'the previous face', random: 'a random face' } }
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
    description: 'Repeat operations for each entry',
    variants: [
      { id: 'list', label: 'For each entry of a list', match: v=>v('in') != null,
        apply: operation=>{ delete operation.range; delete operation.collection; if(operation['in'] === undefined) operation['in'] = []; },
        template: 'For each entry of {in,range,collection}' },
      { id: 'range', label: 'For each number of a range', match: v=>v('range') != null,
        apply: operation=>{ delete operation['in']; delete operation.collection; if(operation.range === undefined) operation.range = [ 1, 10, 1 ]; },
        template: 'For each number of {in,range,collection}' },
      { id: 'collection', label: 'For each widget of a collection',
        apply: operation=>{ delete operation['in']; delete operation.range; },
        template: 'For each widget of {in,range,collection}' }
    ],
    parameters: {
      'in': { type: 'json', default: null, display: listWords },
      range: { type: 'json', default: null, display: rangeWords },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets }
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
    description: 'Read a property of widgets',
    variants: [
      { id: 'last', label: 'Read the value of the last widget', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'last',
        apply: operation=>{ operation.aggregation = 'last'; },
        template: 'Read the last {property} of {collection}{{variable}}' },
      { id: 'array', label: 'Collect the values of all widgets', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'array',
        apply: operation=>{ operation.aggregation = 'array'; },
        template: 'Collect all {property} of {collection}{{variable}}' },
      { id: 'sum', label: 'Add the values up', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'sum',
        apply: operation=>{ operation.aggregation = 'sum'; },
        template: 'Add up {property} of {collection}{{variable}}' },
      { id: 'average', label: 'Average the values', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'average',
        apply: operation=>{ operation.aggregation = 'average'; },
        template: 'Average {property} of {collection}{{variable}}' },
      { id: 'median', label: 'Take the middle value', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'median',
        apply: operation=>{ operation.aggregation = 'median'; },
        template: 'Take the median {property} of {collection}{{variable}}' },
      { id: 'min', label: 'Take the smallest value', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'min',
        apply: operation=>{ operation.aggregation = 'min'; },
        template: 'Take the smallest {property} of {collection}{{variable}}' },
      { id: 'max', label: 'Take the biggest value', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'max',
        apply: operation=>{ operation.aggregation = 'max'; },
        template: 'Take the biggest {property} of {collection}{{variable}}' },
      { id: 'first', label: 'Read the value of the first widget', fixed: [ 'aggregation' ],
        apply: operation=>{ delete operation.aggregation; },
        template: 'Read {property} of {collection}{{variable}}' }
    ],
    clauses: [
      { id: 'variable', label: 'store the value under another name', template: ' and remember it as {variable}' },
      { id: 'skipMissing', label: 'skip widgets without the property', template: ', {skipMissing}', add: { skipMissing: true } }
    ],
    parameters: {
      property: { type: 'property', default: 'id' },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      aggregation: { type: 'enum', values: [ 'first', 'last', 'array', 'average', 'median', 'min', 'max', 'sum' ], default: 'first' },
      variable: { type: 'string', default: operation=>typeof operation.property == 'string' ? operation.property : 'id' },
      skipMissing: { type: 'enum', values: [ true, false ], default: false, display: yesNo('ignoring the widgets that do not have it', 'counting the widgets that do not have it') }
    },
    definesVariable: 'variable',
    // missing values count as 0 in a sum, and an all-missing collection sums to 0 either way
    ignored: v=>v('aggregation') == 'sum' ? { skipMissing: 'ignored because missing values do not change a sum' } : {}
  },
  IF: {
    description: 'Run operations only under a condition',
    variants: [
      { id: 'condition', label: 'Check a written condition', match: (v, isSet)=>isSet('condition'),
        apply: operation=>{ if(operation.condition === undefined) operation.condition = ''; },
        template: 'If this is true: {condition}' },
      { id: 'compare', label: 'Compare two values', fixed: [ 'condition' ],
        apply: operation=>{ delete operation.condition; },
        template: 'If {operand1} {relation} {operand2}' }
    ],
    parameters: {
      condition: { type: 'string', default: null },
      operand1: { type: 'string', default: null, display: { 'null': '?' } },
      relation: { type: 'enum', values: [ '==', '!=', '<', '<=', '>=', '>' ], default: '==', display: comparisonWords },
      operand2: { type: 'string', default: null, display: { 'null': '?' } }
    }
  },
  INPUT: {
    description: 'Ask the player to fill in a dialog',
    variants: [
      { id: 'input', label: 'Ask the player', template: 'Ask the player to fill in {fields}' }
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
      fields: { type: 'json', default: [], display: value=>Array.isArray(value) ? `${value.length} field${value.length == 1 ? '' : 's'}` : null },
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
    description: 'Change the text of a label',
    variants: [
      { id: 'set', label: 'Set the text', fixed: [ 'mode' ], match: v=>v('mode') == 'set',
        apply: operation=>{ operation.mode = 'set'; },
        template: 'Set the text of {label,collection} to {value}' },
      { id: 'inc', label: 'Increase the number', fixed: [ 'mode' ], match: v=>v('mode') == 'inc',
        apply: operation=>{ operation.mode = 'inc'; },
        template: 'Increase the number in {label,collection} by {value}' },
      { id: 'dec', label: 'Decrease the number', fixed: [ 'mode' ], match: v=>v('mode') == 'dec',
        apply: operation=>{ operation.mode = 'dec'; },
        template: 'Decrease the number in {label,collection} by {value}' },
      { id: 'append', label: 'Append text', fixed: [ 'mode' ], match: v=>v('mode') == 'append',
        apply: operation=>{ operation.mode = 'append'; },
        template: 'Append {value} to the text of {label,collection}' }
    ],
    parameters: {
      label: { type: 'widgets', default: null, widgetType: 'label' },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      value: { type: 'string', default: 0 },
      mode: { type: 'enum', values: [ 'set', 'inc', 'dec', 'append' ], default: 'set' }
    },
    ignored: collectionReplacedBy('label')
  },
  MOVE: {
    description: 'Move widgets into a holder',
    variants: [
      { id: 'fillTo', label: 'Fill a holder up', match: v=>v('fillTo'),
        apply: operation=>{ delete operation.count; if(!operation.fillTo) operation.fillTo = 1; },
        template: 'Top up {to} from {from,collection} until it holds {fillTo}' },
      { id: 'move', label: 'Move widgets', fixed: [ 'fillTo' ],
        apply: operation=>{ delete operation.fillTo; },
        template: v=>`Move ${widgetsCounted(v, 'count')} from {from,collection} to {to}` }
    ],
    clauses: [
      { id: 'face', label: 'turn them to a face', template: ' and turn them face {face}', add: { face: 0 } }
    ],
    parameters: {
      fillTo: { type: 'number', default: null },
      count: { type: 'number', default: operation=>operation.from ? 1 : 'all', special: [ 'all' ] },
      from: { type: 'widgets', default: null, display: { 'null': '?' }, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      to: { type: 'widgets', default: null, display: { 'null': '?' }, widgetType: 'holder' },
      face: { type: 'number', default: null, display: faceWords }
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
    description: 'Move widgets to a position',
    variants: [
      { id: 'movexy', label: 'Move widgets to a position', template: v=>`Move ${widgetsCounted(v, 'count')} from {from} to the position {x}, {y}` }
    ],
    clauses: [
      { id: 'z', label: 'put them on a layer', template: ' on layer {z}', add: { z: 1 } },
      { id: 'face', label: 'turn them to a face', template: ' and turn them face {face}', add: { face: 0 } },
      { id: 'snapToGrid', label: 'ignore the grid', template: ', {snapToGrid}', add: { snapToGrid: false } },
      { id: 'resetOwner', label: 'keep their owner', template: ', {resetOwner}', add: { resetOwner: false } }
    ],
    parameters: {
      count: { type: 'number', default: 1, special: [ 'all' ] },
      from: { type: 'widgets', default: null, display: { 'null': '?' }, widgetType: 'holder' },
      x: { type: 'number', default: 0 },
      y: { type: 'number', default: 0 },
      z: { type: 'number', default: null, display: { 'null': 'unchanged' } },
      face: { type: 'number', default: null, display: faceWords },
      snapToGrid: { type: 'enum', values: [ true, false ], default: true, display: yesNo('snapping them to the grid', 'ignoring the grid') },
      resetOwner: { type: 'enum', values: [ true, false ], default: true, display: yesNo('clearing their owner', 'keeping their current owner') }
    },
    ignored: (v, isSet)=>isSet('z') && !v('z') ? { z: 'ignored because 0 keeps the current z, just like leaving it unset' } : {}
  },
  RECALL: {
    description: 'Gather cards back into a holder',
    variants: [
      { id: 'recall', label: 'Recall cards', template: 'Gather all the cards back into {holder}' }
    ],
    clauses: [
      { id: 'owned', label: 'leave the cards players hold', template: ', {owned}', add: { owned: false } },
      { id: 'inHolder', label: 'only cards lying on the table', template: ', {inHolder}', add: { inHolder: false } },
      { id: 'byDistance', label: 'nearest cards first', template: ', {byDistance}', add: { byDistance: true } },
      { id: 'excludeCollection', label: 'leave some cards where they are', template: ', except {excludeCollection}' }
    ],
    parameters: {
      holder: { type: 'widgets', default: null, display: { 'null': '?' }, widgetType: 'holder' },
      owned: { type: 'enum', values: [ true, false ], default: true, display: yesNo('including the cards players hold', 'except the cards players hold') },
      inHolder: { type: 'enum', values: [ true, false ], default: true, display: yesNo('including the cards inside other holders', 'only the cards lying on the table') },
      excludeCollection: { type: 'collection', default: null, display: pickedWidgets },
      byDistance: { type: 'enum', values: [ true, false ], default: false, display: yesNo('nearest cards first', 'in their current order') }
    }
  },
  RESET: {
    description: 'Reset widgets to their starting state',
    variants: [
      { id: 'reset', label: 'Reset widgets', template: 'Reset every widget to its saved starting state{{property}}' }
    ],
    clauses: [
      { id: 'property', label: 'read another property than resetProperties', template: ', using the values in {property}' }
    ],
    parameters: {
      property: { type: 'property', default: 'resetProperties' }
    }
  },
  ROTATE: {
    description: 'Rotate widgets',
    variants: [
      { id: 'set', label: 'Turn widgets to an angle', fixed: [ 'mode' ], match: v=>v('mode') == 'set',
        apply: operation=>{ operation.mode = 'set'; },
        template: v=>`Turn ${widgetsCounted(v, 'count')} in {holder,collection} to {angle} degrees` },
      { id: 'add', label: 'Turn widgets by an angle', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: v=>`Rotate ${widgetsCounted(v, 'count')} in {holder,collection} by {angle} degrees` }
    ],
    parameters: {
      count: { type: 'number', default: 1, special: [ 'all' ] },
      holder: { type: 'widgets', default: null, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT', display: thePick },
      angle: { type: 'number', default: 90, special: [ 45, 60, 90, 135, 180 ] },
      mode: { type: 'enum', values: [ 'set', 'add' ], default: 'add' }
    },
    ignored: collectionReplacedBy('holder')
  },
  SCORE: {
    description: 'Change the score of seats',
    variants: [
      { id: 'inc', label: 'Add to the score', fixed: [ 'mode' ], match: v=>v('mode') == 'inc',
        apply: operation=>{ operation.mode = 'inc'; },
        template: 'Add {value} to {property} of {seats}{{round}}' },
      { id: 'dec', label: 'Subtract from the score', fixed: [ 'mode' ], match: v=>v('mode') == 'dec',
        apply: operation=>{ operation.mode = 'dec'; },
        template: 'Subtract {value} from {property} of {seats}{{round}}' },
      { id: 'set', label: 'Set the score', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: 'Set {property} of {seats}{{round}} to {value}' }
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
    description: 'Pick the widgets the next operations work on',
    variants: [
      { id: 'add', label: 'Add widgets to a collection', fixed: [ 'mode' ], match: v=>v('mode') == 'add',
        apply: operation=>{ operation.mode = 'add'; },
        template: 'Add to the pick{{collection}}:{{max}}{{random}} {type}{{source}} where {property} {relation} {value}{{sortBy}}' },
      { id: 'remove', label: 'Remove widgets from a collection', fixed: [ 'mode' ], match: v=>v('mode') == 'remove',
        apply: operation=>{ operation.mode = 'remove'; },
        template: 'Remove from the pick{{collection}}:{{max}}{{random}} {type}{{source}} where {property} {relation} {value}{{sortBy}}' },
      { id: 'intersect', label: 'Narrow a collection down', fixed: [ 'mode' ], match: v=>v('mode') == 'intersect',
        apply: operation=>{ operation.mode = 'intersect'; },
        template: 'Narrow the pick{{collection}} down to{{max}}{{random}} {type}{{source}} where {property} {relation} {value}{{sortBy}}' },
      { id: 'set', label: 'Select widgets', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: 'Pick{{max}}{{random}} {type}{{source}} where {property} {relation} {value}{{sortBy}}{{collection}}' }
    ],
    // the condition is not an option: the engine always filters by it, so a
    // SELECT that does not name one picks whatever has no parent - the widgets
    // lying on the table. That is also the shape 46% of the library uses, so it
    // is what a new SELECT starts as, with both halves left blank to fill in.
    newOperation: { func: 'SELECT', property: '', value: '' },
    clauses: [
      { id: 'max', label: 'only some of them', template: ' at most {max}', add: { max: 1 } },
      { id: 'random', label: 'pick them at random', template: ' {random}', add: { random: true } },
      { id: 'source', label: 'only among some widgets', template: ' from {source}' },
      { id: 'sortBy', label: 'sort them', template: ', sorted by {sortBy}', add: { sortBy: 'value' } },
      { id: 'collection', label: 'name the pick', variants: [ 'set' ], template: ' — call them {collection}' },
      { id: 'collection', label: 'use another pick', variants: [ 'add', 'remove', 'intersect' ], template: ' {collection}' }
    ],
    parameters: {
      max: { type: 'number', default: 999999, special: [ 'all' ], display: { '999999': 'all' } },
      type: { type: 'enum', values: [ 'all', 'button', 'canvas', 'card', 'deck', 'dice', 'holder', 'label', 'pile', 'scoreboard', 'seat', 'spinner', 'timer' ], default: 'all', display: { 'all': 'widgets', 'button': 'buttons', 'canvas': 'canvases', 'card': 'cards', 'deck': 'decks', 'dice': 'dice', 'holder': 'holders', 'label': 'labels', 'pile': 'piles', 'scoreboard': 'scoreboards', 'seat': 'seats', 'spinner': 'spinners', 'timer': 'timers' } },
      source: { type: 'collection', default: 'all', display: { 'all': 'all widgets', 'DEFAULT': 'the picked widgets' } },
      property: { type: 'property', default: 'parent' },
      relation: { type: 'enum', values: [ '==', '!=', '<', '<=', '>=', '>', 'in' ], default: '==', display: comparisonWords },
      value: { type: 'string', default: null, display: { 'null': 'nothing' } },
      mode: { type: 'enum', values: [ 'set', 'add', 'remove', 'intersect' ], default: 'set' },
      collection: { type: 'collection', default: 'DEFAULT', display: thePick },
      sortBy: { type: 'json', default: null, display: listWords },
      random: { type: 'enum', values: [ true, false ], default: false, display: yesNo('random', 'in their current order') }
    },
    definesCollection: 'collection'
  },
  SET: {
    description: 'Change a property of widgets',
    variants: [
      { id: 'add', label: 'Increase a property', fixed: [ 'relation' ], match: v=>v('relation') == '+',
        apply: operation=>{ operation.relation = '+'; },
        template: 'Increase {property} of {collection} by {value}' },
      { id: 'subtract', label: 'Decrease a property', fixed: [ 'relation' ], match: v=>v('relation') == '-',
        apply: operation=>{ operation.relation = '-'; },
        template: 'Decrease {property} of {collection} by {value}' },
      { id: 'multiply', label: 'Multiply a property', fixed: [ 'relation' ], match: v=>v('relation') == '*',
        apply: operation=>{ operation.relation = '*'; },
        template: 'Multiply {property} of {collection} by {value}' },
      { id: 'divide', label: 'Divide a property', fixed: [ 'relation' ], match: v=>v('relation') == '/',
        apply: operation=>{ operation.relation = '/'; },
        template: 'Divide {property} of {collection} by {value}' },
      { id: 'toggle', label: 'Switch a property on or off', fixed: [ 'relation' ], match: v=>v('relation') == '!',
        apply: operation=>{ operation.relation = '!'; },
        template: 'Switch {property} of {collection} on or off' },
      { id: 'set', label: 'Set a property', fixed: [ 'relation' ],
        apply: operation=>{ delete operation.relation; },
        template: 'Set {property} of {collection} to {value}' }
    ],
    // "Set parent of the picked widgets to nothing" is what the raw defaults say,
    // and nobody adds a SET for that: a new one asks which property and which
    // value instead of starting from a value that has to be replaced twice
    newOperation: { func: 'SET', property: '', value: '' },
    parameters: {
      property: { type: 'property', default: 'parent' },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      relation: { type: 'enum', values: [ '=', '+', '-', '*', '/', '!' ], default: '=' },
      value: { type: 'json', default: null }
    },
    // ! is the one relation that takes a single operand (the current value)
    ignored: v=>v('relation') == '!' ? { value: 'ignored because ! only negates the current value' } : {}
  },
  SHUFFLE: {
    description: 'Shuffle widgets into another order',
    variants: [
      { id: 'reverse', label: 'Reverse the order', fixed: [ 'mode' ], match: v=>v('mode') == 'reverse',
        apply: operation=>{ operation.mode = 'reverse'; },
        template: 'Reverse the order of {holder,collection}' },
      { id: 'overhand', label: 'Shuffle overhand', fixed: [ 'mode' ], match: v=>v('mode') == 'overhand',
        apply: operation=>{ operation.mode = 'overhand'; },
        template: 'Shuffle overhand {holder,collection}, {modeValue} times' },
      { id: 'riffle', label: 'Riffle shuffle', fixed: [ 'mode' ], match: v=>v('mode') == 'riffle',
        apply: operation=>{ operation.mode = 'riffle'; },
        template: 'Riffle shuffle {holder,collection}, {modeValue} times' },
      { id: 'seeded', label: 'Shuffle the same way every time', fixed: [ 'mode' ], match: v=>v('mode') == 'seeded',
        apply: operation=>{ operation.mode = 'seeded'; },
        template: 'Shuffle the same way every time: {holder,collection} with the seed {modeValue}' },
      { id: 'random', label: 'Shuffle', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: 'Shuffle {holder,collection}' }
    ],
    parameters: {
      holder: { type: 'widgets', default: null, display: { 'null': '?' }, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
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
    description: 'Sort widgets by a property',
    variants: [
      { id: 'sort', label: 'Sort widgets', template: 'Sort {holder,collection}{{key}}' }
    ],
    clauses: [
      { id: 'key', label: 'sort by another property', template: ' by {key}' },
      { id: 'reverse', label: 'sort the other way round', template: ', {reverse}', add: { reverse: true } },
      { id: 'rearrange', label: 'keep them where they are', template: ', {rearrange}', add: { rearrange: false } },
      { id: 'locales', label: 'sort text for a language', template: ', for the language {locales}', add: { locales: 'en' } },
      { id: 'options', label: 'fine-tune the text comparison', template: ', with the comparison options {options}' }
    ],
    parameters: {
      holder: { type: 'widgets', default: null, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      key: { type: 'json', default: 'value', display: listWords },
      reverse: { type: 'enum', values: [ true, false ], default: false, display: yesNo('biggest first', 'smallest first') },
      rearrange: { type: 'enum', values: [ true, false ], default: true, display: yesNo('moving them into the new order', 'without moving them') },
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
    description: 'Pass the hands around the table',
    variants: [
      { id: 'swaphands', label: 'Swap the hands of the players', template: 'Pass every hand on to the next seat{{interval}}{{direction}}{{source}}' }
    ],
    clauses: [
      { id: 'interval', label: 'pass them further than one seat', template: ' but {interval} seats along' },
      { id: 'direction', label: 'pass them the other way', template: ', {direction}' },
      { id: 'keepOrder', label: "keep the order of each hand", template: ', {keepOrder}', add: { keepOrder: true } },
      { id: 'source', label: 'only some of the seats', template: ', among {source}' }
    ],
    parameters: {
      source: { type: 'collection', default: 'all', display: { 'all': 'all seats', 'DEFAULT': 'the picked seats' }, widgetType: 'seat' },
      interval: { type: 'number', default: 1 },
      keepOrder: { type: 'enum', values: [ true, false ], default: false, display: yesNo('keeping the order of each hand', 'in the order the widgets were created') },
      direction: { type: 'enum', values: [ 'forward', 'backward', 'random' ], default: 'forward', display: { forward: 'in the seating order', backward: 'against the seating order', random: 'to a random other seat' } }
    }
  },
  TIMER: {
    description: 'Start, pause or set a timer',
    variants: [
      { id: 'start', label: 'Start a timer', fixed: [ 'mode' ], match: v=>v('mode') == 'start',
        apply: operation=>{ operation.mode = 'start'; },
        template: v=>`Start ${timerTarget(v)}` },
      { id: 'pause', label: 'Pause a timer', fixed: [ 'mode' ], match: v=>v('mode') == 'pause',
        apply: operation=>{ operation.mode = 'pause'; },
        template: v=>`Pause ${timerTarget(v)}` },
      { id: 'reset', label: 'Reset a timer', fixed: [ 'mode' ], match: v=>v('mode') == 'reset',
        apply: operation=>{ operation.mode = 'reset'; },
        template: v=>`Reset ${timerTarget(v)}` },
      { id: 'set', label: 'Set the time', fixed: [ 'mode' ], match: v=>v('mode') == 'set',
        apply: operation=>{ operation.mode = 'set'; },
        template: v=>`Set ${timerTarget(v)} to ${timerTime(v)}` },
      { id: 'inc', label: 'Add time', fixed: [ 'mode' ], match: v=>v('mode') == 'inc',
        apply: operation=>{ operation.mode = 'inc'; },
        template: v=>`Add ${timerTime(v)} to ${timerTarget(v)}` },
      { id: 'dec', label: 'Take time away', fixed: [ 'mode' ], match: v=>v('mode') == 'dec',
        apply: operation=>{ operation.mode = 'dec'; },
        template: v=>`Take ${timerTime(v)} off ${timerTarget(v)}` },
      { id: 'toggle', label: 'Start or pause a timer', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: v=>`Start or pause ${timerTarget(v)}` }
    ],
    parameters: {
      timer: { type: 'widgets', default: null, widgetType: 'timer' },
      collection: { type: 'collection', default: 'DEFAULT', widgetType: 'timer', display: { 'DEFAULT': 'the picked timers' } },
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
    description: 'Give the turn to a seat',
    variants: [
      { id: 'random', label: 'Give the turn to a random seat', fixed: [ 'turnCycle' ], match: v=>v('turnCycle') == 'random',
        apply: operation=>{ operation.turnCycle = 'random'; },
        template: 'Give the turn to a random seat' },
      { id: 'position', label: 'Give the turn to a seat by its position', fixed: [ 'turnCycle' ], match: v=>v('turnCycle') == 'position',
        apply: operation=>{ operation.turnCycle = 'position'; },
        template: 'Give the turn to the seat at position {turn}' },
      { id: 'seat', label: 'Give the turn to a specific seat', fixed: [ 'turnCycle' ], match: v=>v('turnCycle') == 'seat',
        apply: operation=>{ operation.turnCycle = 'seat'; },
        template: 'Give the turn to the seat {turn}' },
      { id: 'backward', label: 'Pass the turn backwards', fixed: [ 'turnCycle' ], match: v=>v('turnCycle') == 'backward',
        apply: operation=>{ operation.turnCycle = 'backward'; },
        template: 'Pass the turn back{{turn}}' },
      { id: 'forward', label: 'Pass the turn on', fixed: [ 'turnCycle' ],
        apply: operation=>{ delete operation.turnCycle; },
        template: 'Pass the turn on{{turn}}' }
    ],
    clauses: [
      { id: 'turn', label: 'skip a few seats', variants: [ 'forward', 'backward' ], template: v=>` by ${v('turn') == 1 ? '{turn} seat' : '{turn} seats'}` },
      { id: 'source', label: 'only some of the seats', template: ', among {source}' },
      { id: 'collection', label: 'remember the seat', template: ' and remember the seat as {collection}' }
    ],
    parameters: {
      turn: { type: 'number', default: 1, special: [ 'first', 'last' ], textHint: 'id of a seat (used with turnCycle seat)', widgetType: 'seat' },
      turnCycle: { type: 'enum', values: [ 'forward', 'backward', 'random', 'position', 'seat' ], default: 'forward' },
      source: { type: 'collection', default: 'all', display: { 'all': 'all seats', 'DEFAULT': 'the picked seats' }, widgetType: 'seat' },
      collection: { type: 'collection', default: 'TURN' }
    },
    definesCollection: 'collection',
    // random shuffles the seats before picking, so every value picks a random one
    ignored: v=>v('turnCycle') == 'random' ? { turn: 'ignored because a random seat is picked regardless of the value' } : {}
  },
  UPLOAD: {
    description: 'Ask the player for a file',
    variants: [
      { id: 'upload', label: 'Ask the player for a file', template: 'Ask the player for a file{{variable}}' }
    ],
    clauses: [
      { id: 'variable', label: 'store the name under another name', template: ' and remember its name as {variable}' },
      { id: 'fileTypes', label: 'only accept some file types', template: ', accepting {fileTypes}' }
    ],
    parameters: {
      variable: { type: 'string', default: 'uploadedFileName' },
      fileTypes: { type: 'json', default: [ '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.json', '.mp3', '.wav', '.ogg', '.m4a' ], display: listWords }
    },
    definesVariable: 'variable'
  },
  VAR: {
    description: 'Remember values for later operations',
    variants: [
      { id: 'var', label: 'Set variables', template: 'Remember {variables}' }
    ],
    parameters: {
      variables: { type: 'json', default: {}, display: keyValueWords }
    },
    definesVariables: operation=>Object.keys(operation.variables || {})
  }
};

// a timer parameter names one timer, a collection stands for however many it
// holds - the sentence needs a different article for each
function timerTarget(v) {
  return v('timer') != null ? 'the timer {timer,collection}' : '{timer,collection}';
}

// TIMER reads the time from seconds, from value in milliseconds, or from the
// timer property value names - the sentence says which one it uses
function timerTime(v) {
  if(typeof v('value') == 'string')
    return 'the time in {value}';
  return v('seconds') ? '{seconds} seconds' : '{value} milliseconds';
}

// the words a sentence starts with: everything before its first parameter. They
// are what tells the ways an operation can work apart, so they are what the
// drop-down at the start of the sentence offers.
function templateLead(template) {
  return String(template).match(/^[^{]*/)[0];
}

// the same phrase as a menu entry: capitalized, without the punctuation that
// only joins it to the rest of the sentence
function leadLabel(lead) {
  const trimmed = lead.replace(/[\s,:;]+$/, '');
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
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

// The drag currently in progress, as { editor, indices }. It is module level so
// a drop can move operations between routine levels: into a nested IF/FOREACH
// block, back out into the parent routine or into a sibling block.
let activeRoutineDrag = null;

// The card that was worked on last: it is where the next operation is added, so
// a routine is built by clicking the operation it should follow instead of
// adding at the end and dragging it up. Only one card in the whole editor is the
// active one, however many nested routines there are, and it is remembered as
// the routine array it is in plus its index - the arrays survive the re-render
// every edit triggers, the editors and their DOM do not.
let activeRoutineOperation = null;

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
      if(this.isActiveOperation(index))
        operationDOM.classList.add('routine-editor-operation-active');

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
      // every control of a card is always there: an icon that appears under the
      // pointer and disappears again is harder to aim at than one that stays
      const operationButton = (icon, title, onClick, appendTo=buttonsDOM)=>{
        const buttonDOM = document.createElement('span');
        buttonDOM.className = 'material-symbols';
        buttonDOM.textContent = icon;
        buttonDOM.title = title;
        focusable(buttonDOM, onClick);
        appendTo.append(buttonDOM);
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
      // nest this operation into an adjacent IF/FOREACH block, or take it out of
      // the block it is in - icons from the same font as the buttons next to
      // them, so the row stays optically even
      const prevBlock = blockOf(this.routine[index-1]);
      if(prevBlock)
        operationButton('north_east', `Move into the ${this.routine[index-1].func} block above`, _=>moveInto(this.routine[index-1], prevBlock, false));
      const nextBlock = blockOf(this.routine[index+1]);
      if(nextBlock)
        operationButton('south_east', `Move into the ${this.routine[index+1].func} block below`, _=>moveInto(this.routine[index+1], nextBlock, true));
      if(this.onHoist)
        operationButton('format_indent_decrease', 'Move out of this block', _=>{
          const op = this.routine.splice(index, 1)[0];
          this.onHoist(op);
        });
      // deleting the operation belongs with editing its JSON rather than with
      // the arrows that only move it around, so it shares their row
      const header = $('.routine-editor-operation-header', operationDOM);
      const controls = header && $('.routine-editor-operation-controls', header);
      operationButton('delete', 'Remove this operation', _=>{
        this.routine.splice(index, 1);
        this.routineChanged();
      }, (header && $('.routine-editor-operation-controls-top', header)) || buttonsDOM);
      (controls || header || operationDOM).append(buttonsDOM);

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
        // right after the card that was worked on last, so a routine is built in
        // the order it runs; at the end when that card is the last one anyway
        const at = activeRoutineOperation && activeRoutineOperation.routine === this.routine ? Math.min(activeRoutineOperation.index+1, this.routine.length) : this.routine.length;
        this.routine.splice(at, 0, typeof values == 'string' ? values : JSON.parse(JSON.stringify(values)));
        this.setActiveOperation(at); // the new operation is where the next one follows
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

  // the card the next operation is added after; the one that was active before
  // gives the highlight up, wherever in the editor it is
  setActiveOperation(index) {
    if(index < 0)
      return;
    activeRoutineOperation = { routine: this.routine, index };
    for(const active of $a('.routine-editor-operation-active'))
      active.classList.remove('routine-editor-operation-active');
    const card = this.directChildCards()[index];
    if(card)
      card.classList.add('routine-editor-operation-active');
  }

  isActiveOperation(index) {
    return Boolean(activeRoutineOperation) && activeRoutineOperation.routine === this.routine && activeRoutineOperation.index === index;
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
      if(!(e.ctrlKey || e.metaKey)) {
        // a plain click anywhere on a card makes it the one the next operation
        // is added after; the click itself goes on to whatever it was aimed at
        const clicked = this.ownCardFromEvent(e);
        if(clicked)
          this.setActiveOperation(this.directChildCards().indexOf(clicked));
        return;
      }
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
    this.metadata = routineOperationMetadata[func] || { variants: [ { id: 'default', label: func, template: String(func || '') } ], parameters: {} };
    this.changeListeners = [];
    this.subroutineEditors = {};
  }

  classifyParameter(parameterName, value) {
    if(parameterName == 'func')
      return 'func';
    const spec = this.parameterSpec(parameterName);
    // a property is its own kind of value: the name of one (GET property) as
    // well as a reference reading one (${PROPERTY score OF card1})
    if((spec && spec.type == 'property') || (typeof value == 'string' && value.match(/^\$\{PROPERTY /)))
      return 'property';
    if(typeof value == 'string' && value.match(/\$\{[^}]+\}/))
      return 'variable';
    if(parameterName == 'variable')
      return 'variable';
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
    const words = this.displayedWords(resolved, value);
    if(words !== null)
      return words;
    // an empty value is a blank to fill in, and a blank reads as one instead of
    // as a gap in the sentence
    if(value === '')
      return '?';
    // a value the routine remembers reads as its name: ${...} is the engine's
    // syntax for one, and everything else in the sentence is English - the
    // orange the chip is colored in already says it is a stored value
    if(typeof value == 'string' && value.match(/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/))
      return value.slice(2, -1);
    if(value === null && !explicitlySet)
      return 'unset'; // a null default just means the parameter is not used
    if(typeof value == 'object' && value !== null)
      return JSON.stringify(value);
    return value;
  }

  // the words a value is shown as, or null where the value speaks for itself:
  // the parameter's display table, its display function, or - for the parameters
  // naming widgets - a list of ids spelled out instead of dumped as JSON
  displayedWords(name, value) {
    const spec = this.parameterSpec(name);
    const display = spec && spec.display;
    if(typeof display == 'function')
      return display(value);
    if(display && display[value] != null)
      return display[value];
    if(typeof value == 'string' && predefinedVariableLabels[value])
      return predefinedVariableLabels[value];
    if(Array.isArray(value) && value.length && spec && (spec.type == 'collection' || spec.type == 'widgets'))
      return wordList(value);
    return null;
  }

  // the sentence with the values the operation currently has, used to offer the
  // operations and their variants in a popup. Optional parts stay out: an
  // example is what the operation says once it is added, not everything it could.
  getExampleWithDefaults(variant) {
    return this.resolveTemplate((variant || this.currentVariant()).template)
      .replace(/\{\{[a-zA-Z0-9]+\}\}/g, '')
      .replace(/\{([a-zA-Z0-9,]+)\}/g, (_, p)=>this.getDisplayedValue(p))
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
    return matching || variants[variants.length-1] || { id: 'default', label: this.func, template: String(this.func || '') };
  }

  // the words the sentence starts with - the phrase the drop-down offers
  variantLead(variant) {
    return templateLead(this.resolveTemplate((variant || this.currentVariant()).template));
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
    // a custom property the operation does not know about is always part of the
    // sentence: the engine ignores it, but hiding it makes a typo impossible to
    // spot - and its x is how it is removed again
    for(const name of this.unsupportedProperties())
      clauses.push({ id: name, label: name, template: `, ${name} {${name}}`, generated: true, unsupported: true });
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

    // the header holds the summary and, appended by the routine editor, the
    // move/delete buttons: laid out side by side they can never overlap
    const header = div(dom, 'routine-editor-operation-header');
    const body = div(header, 'routine-editor-operation-body');

    this.renderFunctionName(body);
    this.renderSentenceView(div(body, 'routine-editor-sentence'));

    this.renderParameterWarnings(body);

    // the controls of the card, in two rows next to the sentence: what changes
    // the operation itself (its JSON, deleting it) on top, what moves it around
    // below, on the line the sentence is on
    const controls = div(header, 'routine-editor-operation-controls');
    const topRow = div(controls, 'routine-editor-operation-controls-top');

    // the escape hatch for everything the sentence cannot say: the raw JSON of
    // the whole operation, in the corner opposite the move/delete buttons
    if(this.operation && typeof this.operation == 'object') {
      const jsonButton = document.createElement('span');
      jsonButton.className = 'material-symbols routine-editor-operation-json';
      jsonButton.textContent = 'data_object';
      jsonButton.title = 'Edit this operation as JSON';
      focusable(jsonButton, async _=>{
        const popup = new RoutineFullOperationJSONPopup();
        popup.setSource(jsonButton);
        popup.setOperationDetails(this.operation, [ 'json' ], this.widget, this.variables, this.collections);
        const values = await newRoutineValues(popup);
        if(values !== undefined)
          this.onNewValue(values);
      });
      topRow.append(jsonButton);
    }

    for(const span of $a('span[data-parameter]', dom)) {
      focusable(span, async _=>{
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
    const categoryNames = { func: 'operation', variable: 'variable', collection: 'group of widgets', widget: 'widget', property: 'widget property', number: 'number', value: 'value' };
    const title = `${categoryNames[category] || 'value'} - click to change ${spec.split(',').join(' / ')}`;
    return `<span class="routine-editor-operation-parameter routine-editor-parameter-${category}${missing}" data-parameter="${spec}" title="${escapeHTML(title)}">${escapeHTML(displayed)}</span>`;
  }

  // the name of the operation, on a line of its own above the sentence: the
  // sentence itself avoids the engine's vocabulary, so this is the one place
  // that keeps the link to what the routine actually stores - and clicking it
  // is how the operation is exchanged for another one
  renderFunctionName(dom) {
    const line = div(dom, 'routine-editor-operation-func');
    const known = Boolean(routineOperationMetadata[this.func]);
    const name = document.createElement('span');
    name.className = 'routine-editor-func-name';
    name.textContent = this.func || 'JSON';
    if(known) {
      name.dataset.parameter = 'func';
      name.title = `${this.func} - click to use another operation here`;
    }
    line.append(name);
    const info = commonInfoButton(null, this.func);
    if(info) {
      info.classList.add('routine-editor-func-info');
      line.append(info);
    }
    return line;
  }

  renderTemplateText(template) {
    return this.resolveTemplate(template).replace(/\{([a-zA-Z0-9,]+)\}/g, (_, spec)=>this.renderParameterChip(spec));
  }

  // the phrase the sentence starts with. With more than one way to work it is
  // the drop-down that switches between them, so it carries the arrow that says
  // so; with only one it is simply the words the sentence begins with.
  renderVariantLead(lead) {
    const text = lead.replace(/\s+$/, '');
    const trailingSpace = lead.slice(text.length);
    if(!text)
      return lead;
    if(this.variants().length < 2)
      return `<span class="routine-editor-variant">${escapeHTML(text)}</span>${trailingSpace}`;
    const title = `${leadLabel(text)} - click to pick another way for ${this.func} to work`;
    return `<span class="routine-editor-variant routine-editor-variant-menu" style="min-width: ${this.variantLeadWidth()}ch" title="${escapeHTML(title)}">${escapeHTML(text)}<span class="material-symbols">arrow_drop_down</span></span>${trailingSpace}`;
  }

  // the drop-down is a field, so it is as wide as the longest phrase it can hold
  // and the rest of the sentence stays where it is while another way to work is
  // picked. A phrase long enough to push the sentence half a card to the right
  // ("Give the turn to the seat at position") keeps its own width instead.
  variantLeadWidth() {
    const lengths = this.variants().map(variant=>this.variantLead(variant).trim().length);
    return Math.min(Math.max(...lengths), 20);
  }

  // the sentence of the current variant, plus the options that are switched on -
  // each with the x that removes it again - and the button offering the rest
  renderSentenceView(dom) {
    let html = '';
    for(const [ index, part ] of this.sentenceParts().entries()) {
      if(part.clause) {
        if(this.clauseIsActive(part.clause))
          html += `<span class="routine-editor-clause">${this.renderTemplateText(part.template)}<span class="material-symbols routine-editor-clause-remove" data-clause="${escapeHTML(part.clause.id)}" title="Remove this option">close</span></span>`;
        continue;
      }
      let template = this.resolveTemplate(part.template);
      if(index === 0) {
        const lead = templateLead(template);
        html += this.renderVariantLead(lead);
        template = template.slice(lead.length);
      }
      html += this.renderTemplateText(template);
    }
    if(this.clauses().some(clause=>!this.clauseIsActive(clause)))
      html += `<span class="routine-editor-add-clause" title="Add one of the options this operation offers">add option</span>`;
    dom.innerHTML = html;

    const variantMenu = $('.routine-editor-variant-menu', dom);
    if(variantMenu)
      focusable(variantMenu, async _=>{
        const popup = new RoutineVariantMenu(routineOperationVariantChoices(this.operation), this.currentVariant().id);
        popup.setSource(variantMenu);
        const values = await newRoutineValues(popup);
        if(values !== undefined)
          this.onNewValue(values);
      });

    for(const remove of $a('.routine-editor-clause-remove', dom))
      focusable(remove, _=>{
        const clause = this.clauses().find(c=>c.id == remove.dataset.clause);
        if(clause)
          this.onNewValue(this.clauseRemoveValues(clause));
      });

    const addClause = $('.routine-editor-add-clause', dom);
    if(addClause)
      focusable(addClause, async _=>{
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
      const words = this.displayedWords(name, value);
      if(words !== null)
        return words;
      return value === null || value === '' ? '?' : (typeof value == 'object' ? JSON.stringify(value) : value);
    }).trim().replace(/^[,;]\s*/, '');
  }

  // a clickable "!" behind every chip whose parameter needs a word of warning:
  // orange for a deprecated one and red for a custom property the operation does
  // not support at all
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
      const addElse = button(this.domElement, 'add else', _=>{
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
      ? { id: 'simple', label: 'var', template: 'Variable {variable} gets the value {expression}' }
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
    return 'Variable x gets the value 1';
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
    // the // line above the sentence already says what this is, so the sentence
    // is nothing but the note itself
    return { id: 'comment', label: '//', template: '{comment}' };
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

// the choices offered when adding an operation or switching its type: every
// operation there is, each with the generic line saying what it is for and the
// sentence it would read as once it is added
function routineOperationExamples() {
  const examples = [];
  for(const func in routineOperationMetadata) {
    const metadata = routineOperationMetadata[func];
    const newOperation = metadata.newOperation ? JSON.parse(JSON.stringify(metadata.newOperation)) : { func };
    const editor = editorForOperation(newOperation);
    editor.setOperationDetails(null, newOperation, [], []);
    examples.push({ func, description: metadata.description || func, example: editor.getExampleWithDefaults(), newOperation });
  }
  examples.push({ func: 'var', description: 'Work out a value and remember it', example: 'Variable x gets the value 1', newOperation: 'var x = 1' });
  examples.push({ func: '//', description: 'Add a note for whoever reads the routine', example: 'A note for whoever reads the routine', newOperation: '// comment' });
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

// the ways the operation can work, each worded as the phrase its sentence would
// start with - that is what the drop-down at the start of the sentence offers.
// Operations with only one way to work (DELAY, INPUT, ...) have nothing to
// choose here, so their phrase is plain text instead of a drop-down.
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
    return { id: variant.id, lead: leadLabel(editor.variantLead(variant)), label: variant.label, example: editor.getExampleWithDefaults(variant), values: operationVariantValues(operation, variant) };
  });
}
