// The single source of truth for how the visual routine editor presents each
// operation: the ways it can work, the optional parts of its sentence, its
// parameters (type, default, enum values, display overrides) and what
// variables/collections it defines for later operations. Everything else
// (chips, popups, defaults, examples) derives from this registry.
//
// An operation is described by two tables:
//
//   variants - the ways the operation can work, i.e. what it does at all. They
//     are listed in the order the drop-down offers them, which is the order of
//     the grammar catalog: the phrasing games write most often first. Which
//     one an operation is shown as is decided by match() - the first variant
//     whose match() fits it, with the one without a match() as the fallback,
//     wherever in the list it sits. Every sentence starts with the words that
//     say what the operation does ("Turn face down", "Move widgets from"); those
//     words are the drop-down that switches between the variants, so word every
//     template so that what tells the variants apart comes before the first
//     parameter. Picking another entry runs that variant's apply() and rewrites
//     the parameters that tell the variants apart together with the sentence, so
//     nobody has to know that "turn face down" means face 0 and "flip to the next
//     face" means faceCycle. fixed names the parameters a variant decides: they
//     are changed by picking another variant, never as an option of their own.
//
//   clauses - the optional parts of the sentence. A clause is shown while one of
//     its parameters is set and disappears with them, so a card only words what
//     the operation actually does. The "add option" button behind the sentence
//     offers the ones that are off, and every clause shown has the marker that
//     removes it again. Parameters no variant and no clause mentions become a
//     clause of their own, so nothing an operation supports is unreachable. A
//     clause can also replace words instead of adding them: whenOff is what the
//     sentence says while the option is off (SET reads "of the picked widgets"
//     until the collection option names a group of widgets), and active() decides
//     when a clause counts as in use where being set is not the same as being in
//     use (a collection explicitly set to DEFAULT is still the picked widgets).
//
//     offer: false keeps a clause out of that list without hiding it: what a
//     CALL hands back is always called result, so renaming it is not a choice
//     worth offering - but a game that did rename it still reads what it does
//     instead of turning the parameter into an unsupported one. The same on a
//     parameter (TIMER seconds, and every deprecated one) keeps the clause that
//     would otherwise be generated for it out of the list until a game has it.
//
//     label is the one phrase the list of options offers, and it names what the
//     option is about without saying what it can then say: CLICK offers "n times"
//     and "ignore something", not the two lines that spell out every mode it
//     knows. What exactly is ignored is the drop-down the option leaves behind in
//     the sentence, which is where a choice belongs (see parameterIsDropDown).
//
// What belongs in the sentence and what belongs in a clause follows one rule: a
// parameter whose default means "not in use" (SELECT type, SELECT max, SELECT
// source, GET variable, SORT key, TURN turn, RESET property) is a clause and
// stays out of the sentence until a game sets it, while a parameter whose
// default is a real quantity the operation applies (a count, an angle, a delay)
// stays in the sentence. So an operation with nothing but its defaults reads as
// the short sentence it is - "Count the picked widgets", "Pick widgets where
// cardType is ace" - and every word that is there is a word that matters.
//
// The words are English, never the engine's vocabulary: no operation name, no
// enum value and no raw null, 0 or 999999. An enum is worded through its
// display table ("ignoreClickRoutine" -> "but do not run their click routines"),
// and so is a yes/no parameter, whose two sides are two phrases rather than
// "true" and "false".
//
// Never offered: skip. The engine honors it on every operation, so a game that
// has one reads what it does (", skipped when gameOver") and carries the
// orange ! that names IF as what to write instead - but no list proposes adding
// one, because a deprecated option in the list of options reads as an invitation.
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
// string, property (the name of a widget property), json, keyValue (a list of
// name/value pairs, keyHint naming what one is), widgets (pick widgets in the
// room), collection (pick widgets or a collection name).
//
// scale is the number the stored value is divided by to get the one the editor
// says and takes: the engine counts a time in milliseconds, a game says two
// seconds, and neither side has to know about the other.
//
// specialOnly leaves the keypad of 0 to 10 out of a number popup where those are
// not the numbers the parameter takes: what a ROTATE angle can sensibly be is
// the list of angles, not the digits.
//
// display turns a stored value into the words the chip shows: a table keyed by
// the value, or a function of it where the words are computed (a volume as a
// percentage, a list of ids spelled out).
//
// menu makes a number parameter that is almost always one of a handful of values
// (a FLIP face is up or down) the same drop-down an enum gets: its special values
// worded through display, plus otherLabel - the entry that opens the full popup
// for the numbers the list does not offer.
//
// hint is the word a parameter shows while it has no value yet, in red: a fresh
// SET reads "Set property of the picked widgets to number or text" instead of
// asking what belongs in a "?" and answering it in a hover tip. It defaults to
// what the parameter takes (a widgets parameter to the kind of widget it wants),
// and a variant may word it differently through its own hints table - what an
// Increase changes is the number a property holds, not any property.
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
//
// Both questions - which variant, and what is ignored - are asked about values
// the engine may only work out while the routine runs: a ${...} may sit in any
// property of an operation, the ones that decide what it does included, because
// evaluateVariablesRecursively resolves them all before the operation runs. So
// they are not asked once but once per value such a reference may come out as
// (see undecidableReads), and where the answer changes with it the editor says
// so instead of guessing: the phrase the sentence starts with carries a "!"
// naming the reference, the parameter that decides stays in the sentence
// instead of counting as spoken for, nothing counts as ignored, and every entry
// of the drop-down says which reference picking it would write over.

// Most operations take either a single widget (holder/label/timer/from/canvas)
// or a collection - the engine checks the widget parameter first and never looks
// at collection once it is set (the `if(a.holder !== undefined)` branches in
// widget.js). Marking collection ignored there is the same situation as
// CANVAS canvas vs collection, just spelled out per operation.
function collectionReplacedBy(parameter) {
  return v=>v(parameter) != null ? { collection: `ignored because ${parameter} is set` } : {};
}

// The widgets an operation works on are the ones the operations before it picked
// unless a game says otherwise, so the sentence says so in plain words and the
// option is what names a group instead (the SET wording, used by every operation
// whose only target is a collection). A collection explicitly set to DEFAULT is
// still the picked widgets, so it is the value that decides, not the key - and a
// list of ids written into the operation is not a name to call anybody by.
function namedGroupClause(parameter='collection', whenOff=' the picked widgets') {
  return {
    id: parameter, label: 'a named group of widgets',
    active: v=>v(parameter) != 'DEFAULT',
    template: v=>Array.isArray(v(parameter)) ? ` {${parameter}}` : ` the widgets called {${parameter}}`,
    whenOff, add: { [parameter]: '' }
  };
}

// what a blank says when nothing more specific is worded for it: the kind of
// value the parameter takes, in the words the popup it opens uses
const parameterTypeHints = {
  number: 'number',
  string: 'text',
  property: 'property',
  widgets: 'widget',
  // a collection blank takes either: a list of widgets picked in the room or the
  // name of a group an earlier operation made, and the popup offers both
  collection: 'widget(s)/collection',
  json: 'number or text',
  keyValue: 'name and value',
  stringList: 'list of values',
  color: 'color',
  icon: 'icon'
};

// a value the engine works out while the routine runs: every string property of
// an operation goes through evaluateVariablesRecursively before the operation
// runs, so a ${...} may sit anywhere - including in the properties that decide
// what the operation does at all. The editor cannot know what it will be, so
// nothing may be decided from it as if it were the literal it is written as.
function isDynamicValue(value) {
  return typeof value == 'string' && /\$\{[^}]+\}/.test(value);
}

// text the operation really holds, as opposed to a string that only carries a
// reference: to JavaScript "${x}" is of type string, but what it stands for is
// whatever the routine works out, so a test for "is this text" has to say no
function isLiteralText(value) {
  return typeof value == 'string' && !isDynamicValue(value);
}

// a collection an operation READS and that is left at DEFAULT is whatever the
// operations before it picked, and that is what the sentence says instead of the
// name the engine uses for it - in every sentence with the same words, because
// four names for one thing ("the pick", "the picked widgets") is four things to
// a newcomer. A collection an operation WRITES keeps the name it stores (DEFAULT
// included): that name is what the operations after it have to type, so wording
// it away would hide the one thing the option is about.
const pickedWidgets = { 'DEFAULT': 'the picked widgets' };

// a holder is a place widgets are IN; a group of widgets is the widgets
// themselves, so the sentence says "2 widgets in h1" for the one and "2 of the
// picked widgets" for the other instead of calling a group a place ("in the
// pick"). Both stay one slot, so the chip still switches between them.
function holderPreposition(v) {
  return v('holder') != null ? ' in' : '';
}

function countedInHolderOrOfGroup(v) {
  return v('holder') != null ? ` ${widgetsCounted(v, 'count')}` : ' {count} of';
}

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
// The colors a sentence is written in are a system, and a system that only
// exists in a CSS comment is one nobody can learn: this is the key to it, opened
// from the header of every routine. Every color the sentences use is in it, the
// plain text color of everything that is none of the named kinds and the red of
// a blank included - each one shown in the color it stands for rather than
// described in a sentence of its own.
const routineColorLegendHTML = `
  <p>Every value in a sentence is colored by the kind of thing it is:</p>
  <dl class="routine-legend">
    <dt class="routine-editor-variant">Pick</dt>
    <dd>what the operation does - the words a sentence starts with</dd>
    <dt class="routine-editor-parameter-widget">card1</dt>
    <dd>one widget of the game, named by its id</dd>
    <dt class="routine-editor-parameter-collection">the picked widgets</dt>
    <dd>a group of widgets: the ones an earlier operation picked, or a group it gave a name to</dd>
    <dt class="routine-editor-parameter-variable">score</dt>
    <dd>a value the routine remembers, under the name it gave it</dd>
    <dt class="routine-editor-parameter-property">activeFace</dt>
    <dd>the name of a widget property</dd>
    <dt class="routine-editor-parameter-number">3</dt>
    <dd>a number</dd>
    <dt class="routine-editor-parameter-value">"Hello"</dt>
    <dd>everything else: a text, a setting picked from a list, or a value written as JSON</dd>
    <dt class="routine-editor-parameter-missing">number or text</dt>
    <dd>a blank the operation still needs - the word says what belongs there</dd>
  </dl>
`;

// A chip has padding on both sides, which puts a space between it and the comma
// or full stop right behind it ("to the position 300 , 200"). The punctuation
// belongs to the chip, so it is pulled back onto it.
function tightenPunctuation(html) {
  return html.replace(/(<\/span>)([,.;:!?)]+)/g, '$1<span class="routine-editor-punctuation">$2</span>');
}

// how many pairs a VAR remembers - which decides whether its sentence says the
// one it has or lists them
function varPairCount(v) {
  const variables = v('variables');
  return variables && typeof variables == 'object' && !Array.isArray(variables) ? Object.keys(variables).length : 0;
}

// the pairs of a VAR, worded the way the sentence words a single one
function variablePairWords(value) {
  if(!value || typeof value != 'object' || Array.isArray(value))
    return null;
  const entries = Object.entries(value);
  if(!entries.length)
    return 'nothing';
  return wordList(entries.map(([ key, entry ])=>`${key} to ${entry !== null && typeof entry == 'object' ? JSON.stringify(entry) : entry}`));
}

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
// over, and "up" and "down" is what they are called everywhere else. Which way
// round they are is the deck's own convention and the wiki states it for FLIP:
// "for 'normal' cards, 0 would be the back and 1 would be the front" - so face 0
// is face down and face 1 is face up, not the other way round
const faceWords = { '0': 'down', '1': 'up', 'null': 'unchanged' };

// the first two faces worded the way FLIP words them, where the face is a whole
// phrase of the sentence rather than the tail of "turn them face ..."
const flipFaceWords = { '0': 'face down', '1': 'face up' };

// whether a face is one of the two that have a word: every other one - the third
// face of a die, and a face the routine works out while it runs - is said as the
// number it is ("to face 4", "to face ${f}") rather than as a word it has none of
function isNamedFace(face) {
  return flipFaceWords[String(face)] !== undefined;
}

// "1 widgets" is not a sentence: the wording follows the number, while the chip
// stays in it either way so the number is still there to be changed
function widgetsCounted(v, parameter, singular = 'widget', plural = `${singular}s`) {
  return `{${parameter}} ${Math.abs(v(parameter)) == 1 ? singular : plural}`;
}

// the operations that take a count cut the list of widgets at it (slice(0,
// count)), so a negative number leaves that many alone instead of working on
// that many - which is what the sentence says rather than showing a minus sign
function countWords(value) {
  return typeof value == 'number' && value < 0 ? `all but ${-value}` : null;
}

// a count is in use while it is a real limit: "all" is what an operation does
// anyway, so the option that limits the number counts as switched off there
function countIsLimited(v) {
  return v('count') !== 'all';
}

// a yes/no parameter has no "true" in its sentence: both sides are the phrase
// that says what the operation then does
function yesNo(yes, no) {
  return { 'true': yes, 'false': no };
}

// a time is written in seconds wherever a game talks about one, while the engine
// stores milliseconds (AUDIO length, TIMER value): the sentence says seconds, the
// popup offers and takes seconds, and scale is what converts the two - so nobody
// counts zeroes to stop a sound after two seconds
const millisecondsPerSecond = 1000;
function secondsWords(value) {
  return typeof value == 'number' ? String(value/millisecondsPerSecond) : null;
}

// text the game shows or stores, in quotes: they are the difference between the
// number 1 and the digit 1, and between a word of the sentence and a word the
// player reads ('titled "Are you sure?"'). A value the routine works out while
// it runs is not text anybody typed, so it keeps its own wording.
function quotedText(value) {
  return typeof value == 'string' && value !== '' && !value.match(/\$\{/) ? `"${value}"` : null;
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

// The deprecated CANVAS canvas parameter replaces the collection, so every
// CANVAS sentence words whichever of the two the operation actually uses. It is
// an option that swaps words rather than one that adds them, which is also what
// gives it the marker that takes it out again: a game that arrived with a canvas
// is one minus away from the collection every new game writes.
// An INPUT whose cancel button has neither a text nor an icon has no cancel
// button at all (widget.js hides it when both are explicitly null), which is
// the only way to make a dialog a forced choice.
function inputCannotBeCanceled(v, isSet) {
  return isSet('cancelButtonText') && v('cancelButtonText') === null && isSet('cancelButtonIcon') && v('cancelButtonIcon') === null;
}

// the lines an INPUT is written with, which is a list only while the operation
// spells them out - a ${...} in their place is resolved when the routine runs
function inputFields(operation) {
  return Array.isArray(operation.fields) ? operation.fields : [];
}

const canvasTargetClause = {
  id: 'canvas', label: 'a single canvas widget', offer: false,
  template: ' {canvas}', whenOff: ' {collection}'
};

// skip is the one property the engine honors on every operation (widget.js
// skips the operation whenever it holds anything true), so it is part of no
// operation's table and part of all of them. It is deprecated in favour of IF
// and never offered - see the header comment - but a game that has one reads
// what it does, with the orange ! saying what to write instead.
const skipParameter = { type: 'json', default: null, offer: false, hint: 'condition', deprecated: `
  <pre>
  skip is deprecated - please use IF instead.

  It still works so old games keep running: the operation is skipped whenever this value is
  anything but an empty text, 0, false or null. An IF around the operation says the same thing
  where everybody can see it, and it can guard more than one operation at a time.
  </pre>
` };
const skipClause = { id: 'skip', label: 'skip it under a condition', offer: false, template: ', skipped when {skip}' };

// where a template holds a value: {name}, or {nameA,nameB} for a chip that
// stands for either of two parameters. A custom property may be named anything,
// so a placeholder is anything but the braces around it - the {{clause}} slots
// are taken out of a template before it is read for placeholders.
const templatePlaceholder = /\{([^{}]+)\}/g;

const routineOperationMetadata = {
  AUDIO: {
    description: 'Play a sound',
    variants: [
      {
        id: 'play', label: 'Play a sound', fixed: [ 'silence' ],
        apply: operation=>{ delete operation.silence; },
        template: 'Play the sound {source}'
      },
      {
        id: 'silence', label: 'Stop all sounds', fixed: [ 'silence' ],
        match: v=>v('silence'),
        apply: operation=>{ operation.silence = true; },
        template: 'Stop all sounds'
      }
    ],
    clauses: [
      { id: 'maxVolume', label: 'at a set volume', template: ' at {maxVolume} volume', add: { maxVolume: 0.5 } },
      { id: 'player', label: 'only for specified players', template: ' for {player}', add: { player: '' } },
      { id: 'count', label: 'n times', template: ', {count}' },
      { id: 'length', label: 'stop it early', add: { length: 1000 },
        template: v=>`, stopping after {length} second${v('length') == 1000 ? '' : 's'}` }
    ],
    parameters: {
      source: { type: 'sound', default: '', hint: 'sound file' },
      maxVolume: { type: 'number', default: 1.0, display: value=>typeof value == 'number' ? `${Math.round(value*100)}%` : null },
      length: { type: 'number', default: null, scale: millisecondsPerSecond, display: secondsWords },
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
      { id: 'widget', label: 'of another widget', template: ' of {widget}' },
      { id: 'arguments', label: 'pass values in', template: ', passing {arguments}' },
      { id: 'variable', label: 'name the result', template: ' and remember the result as {variable}' },
      // the widgets a routine hands back are always called result, so there is
      // nothing to decide: the option is not offered. A game that renames them
      // anyway still reads what it does, which is what offer: false is for.
      { id: 'collection', label: 'name its widgets', offer: false, template: ' and call its widgets {collection}' },
      // return does not decide whether the caller waits - it always waits. It
      // decides whether anything after the CALL still runs (widget.js sets
      // abortRoutine when it is false).
      { id: 'return', label: 'and do not finish this routine', template: ', {return}', add: { 'return': false } }
    ],
    parameters: {
      routine: { type: 'string', default: 'clickRoutine' },
      widget: { type: 'widgets', default: null, display: { 'null': 'this widget' } },
      variable: { type: 'string', default: 'result' },
      collection: { type: 'collection', default: 'result' },
      'return': { type: 'enum', values: [ true, false ], default: true, display: yesNo('and carry on with this routine', 'and do not finish this routine') },
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
        // the noun the collection brings with it is the only one the sentence
        // needs: "Clear the canvas the picked canvases" said it twice
        template: 'Clear{{canvas}}' },
      { id: 'set', label: 'Set the value of canvas fields', fixed: [ 'mode' ], match: v=>v('mode') == 'set',
        apply: operation=>{ operation.mode = 'set'; },
        template: 'Set the value of{{canvas}} to {value}' },
      { id: 'inc', label: 'Increase the value of canvas fields', fixed: [ 'mode' ], match: v=>v('mode') == 'inc',
        apply: operation=>{ operation.mode = 'inc'; },
        template: 'Increase the value of{{canvas}} by {value}' },
      { id: 'dec', label: 'Decrease the value of canvas fields', fixed: [ 'mode' ], match: v=>v('mode') == 'dec',
        apply: operation=>{ operation.mode = 'dec'; },
        template: 'Decrease the value of{{canvas}} by {value}' },
      { id: 'change', label: 'Recolor a value on a canvas', fixed: [ 'mode' ], match: v=>v('mode') == 'change',
        apply: operation=>{ operation.mode = 'change'; },
        template: 'Recolor the value {value} on{{canvas}} to {color}' },
      { id: 'setPixel', label: 'Set a single pixel', fixed: [ 'mode' ], match: v=>v('mode') == 'setPixel',
        apply: operation=>{ operation.mode = 'setPixel'; },
        template: 'Set one pixel of{{canvas}} at ({x}, {y}) to the value {value}' }
    ],
    clauses: [
      canvasTargetClause,
      { id: 'count', label: 'at most a certain number of them', template: v=>`, for ${widgetsCounted(v, 'count', 'canvas', 'canvases')}`, add: { count: 1 } }
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
      // the engine cuts the list at the count (slice(0, a.count || 999999)), so
      // no count means every canvas and a negative one leaves that many alone -
      // which is what the chip says instead of a bare number that reads like the
      // opposite. A count of 0 is the one ignored below, where it says why
      count: { type: 'number', default: null, display: value=>value === null || value === 0 ? 'all' : countWords(value) },
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
      { id: 'click', label: 'Click widgets', template: 'Click{{collection}}' }
    ],
    clauses: [
      namedGroupClause(),
      { id: 'count', label: 'n times', template: ', {count}' },
      // the option says that something is ignored, the drop-down behind it says
      // what - starting at the one the library uses most
      { id: 'mode', label: 'ignore something', template: ', {mode}', add: { mode: 'ignoreClickRoutine' } }
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
      { id: 'clone', label: 'Copy widgets', template: v=>`Make ${v('count') == 1 ? '{count} copy' : '{count} copies'} of{{source}}` }
    ],
    clauses: [
      namedGroupClause('source'),
      { id: 'offset', label: 'offset the copies', template: ', offset by {xOffset}, {yOffset}' },
      { id: 'properties', label: 'set properties on them', template: ', and set {properties} on them' },
      { id: 'recursive', label: 'including the widgets on them', template: ', {recursive}', add: { recursive: true } },
      { id: 'collection', label: 'name the copies', template: ' — call the copies {collection}' }
    ],
    parameters: {
      source: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      count: { type: 'number', default: 1 },
      xOffset: { type: 'number', default: 0 },
      yOffset: { type: 'number', default: 0 },
      properties: { type: 'json', default: {}, display: keyValueWords },
      recursive: { type: 'enum', values: [ true, false ], default: false, display: yesNo('including the widgets on them', 'without the widgets on them') },
      collection: { type: 'collection', default: 'DEFAULT' }
    },
    definesCollection: 'collection'
  },
  COUNT: {
    description: 'Count widgets',
    variants: [
      { id: 'collection', label: 'Count the widgets of a collection', fixed: [ 'holder' ],
        apply: operation=>{ delete operation.holder; },
        template: 'Count{{collection}}{{owner}}{{variable}}' },
      // the engine never looks at the collection once a holder is named, so
      // counting a holder is counting a holder - and the option to name a group
      // of widgets belongs to the other way of working, not to this one
      { id: 'holder', label: 'Count what is in a holder', fixed: [ 'collection' ], match: (v, isSet)=>isSet('holder'),
        apply: operation=>{ delete operation.collection; if(operation.holder === undefined) operation.holder = null; },
        template: 'Count what is in {holder}{{owner}}{{variable}}' }
    ],
    clauses: [
      Object.assign(namedGroupClause(), { variants: [ 'collection' ] }),
      { id: 'owner', label: 'owned by a player', template: ' owned by {owner}', add: { owner: '' } },
      { id: 'variable', label: 'name the result', template: ' and remember it as {variable}' }
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
      { id: 'delete', label: 'Delete widgets', template: 'Delete{{collection}}' }
    ],
    clauses: [
      namedGroupClause()
    ],
    parameters: {
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets }
    }
  },
  FLIP: {
    description: 'Turn widgets face up or down',
    // which face the widgets end up on is one thing the operation says, not four
    // ways of working: turning them to a face and cycling them onwards are the
    // two, and which face that is is a drop-down in the sentence
    variants: [
      // a face the routine works out is a face like any other: what tells the two
      // apart is whether the operation names one at all, which a ${...} does
      { id: 'turn', label: 'Turn widgets to a face', fixed: [ 'faceCycle' ], match: v=>typeof v('face') == 'number' || isDynamicValue(v('face')),
        apply: operation=>{ delete operation.faceCycle; if(typeof operation.face != 'number' && !isDynamicValue(operation.face)) operation.face = 0; },
        template: v=>`Turn{{count}}${holderPreposition(v)} {holder,collection} ${isNamedFace(v('face')) ? '{face}' : 'to face {face}'}` },
      { id: 'cycle', label: 'Cycle the face of widgets', fixed: [ 'face' ],
        apply: operation=>{ delete operation.face; },
        template: v=>`Cycle the face of{{count}}${holderPreposition(v)} {holder,collection} {faceCycle}` }
    ],
    // how many widgets are turned is a limit rather than a quantity the operation
    // applies - it turns everything it was given unless a game says otherwise,
    // and it is worded as the cap it is, the same as everywhere else
    clauses: [
      { id: 'count', label: 'at most a certain number of them',
        whenOff: v=>v('holder') != null ? ' all widgets' : '',
        active: countIsLimited, add: { count: 1 }, template: countedInHolderOrOfGroup }
    ],
    parameters: {
      count: { type: 'number', default: 'all', special: [ 'all' ], display: countWords },
      holder: { type: 'widgets', default: null, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      face: { type: 'number', default: null, special: [ 0, 1 ], menu: true, otherLabel: 'a specific face…', display: flipFaceWords },
      // cycling onwards is a direction, and a random face is not one - it is the
      // one entry of the three that needs the words saying what it does instead
      faceCycle: { type: 'enum', values: [ 'forward', 'backward', 'random' ], default: 'forward', display: { random: 'to a random face' } }
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
    // what a FOREACH repeats for is one of three things and each of them is its
    // own way of working, so each sentence names only its own: a range of numbers
    // is not something the entries of a list can be, and the other way round
    variants: [
      { id: 'collection', label: 'For each picked widget', fixed: [ 'in', 'range' ],
        apply: operation=>{ delete operation['in']; delete operation.range; },
        template: 'For each of {collection}, do the operations below' },
      { id: 'range', label: 'For each number of a range', fixed: [ 'in', 'collection' ],
        // the engine reads in before range, so an operation with both is the one
        // it acts as rather than the one it is listed as
        match: v=>v('range') != null && v('in') == null,
        apply: operation=>{ delete operation['in']; delete operation.collection; if(operation.range === undefined) operation.range = [ 1, 10, 1 ]; },
        template: 'For each number in the range {range}, do the operations below' },
      { id: 'list', label: 'For each entry of a list', fixed: [ 'range', 'collection' ], match: v=>v('in') != null,
        apply: operation=>{ delete operation.range; delete operation.collection; if(operation['in'] === undefined) operation['in'] = []; },
        template: 'For each entry in {in}, do the operations below' }
    ],
    parameters: {
      'in': { type: 'json', default: null, hint: 'object, array or text', display: listWords },
      range: { type: 'json', default: null, hint: 'range', display: rangeWords },
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
      { id: 'first', label: 'Read the value of the first widget', fixed: [ 'aggregation' ],
        apply: operation=>{ delete operation.aggregation; },
        template: 'Read the first {property} of{{collection}}{{skipMissing}}{{variable}}' },
      { id: 'last', label: 'Read the value of the last widget', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'last',
        apply: operation=>{ operation.aggregation = 'last'; },
        template: 'Read the last {property} of{{collection}}{{skipMissing}}{{variable}}' },
      { id: 'sum', label: 'Add the values up', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'sum',
        apply: operation=>{ operation.aggregation = 'sum'; },
        template: 'Add up {property} of{{collection}}{{skipMissing}}{{variable}}' },
      { id: 'average', label: 'Average the values', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'average',
        apply: operation=>{ operation.aggregation = 'average'; },
        template: 'Average {property} of{{collection}}{{skipMissing}}{{variable}}' },
      { id: 'median', label: 'Take the middle value', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'median',
        apply: operation=>{ operation.aggregation = 'median'; },
        template: 'Take the median {property} of{{collection}}{{skipMissing}}{{variable}}' },
      { id: 'min', label: 'Take the smallest value', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'min',
        apply: operation=>{ operation.aggregation = 'min'; },
        template: 'Take the smallest {property} of{{collection}}{{skipMissing}}{{variable}}' },
      { id: 'max', label: 'Take the biggest value', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'max',
        apply: operation=>{ operation.aggregation = 'max'; },
        template: 'Take the biggest {property} of{{collection}}{{skipMissing}}{{variable}}' },
      { id: 'array', label: 'Collect the values of all widgets', fixed: [ 'aggregation' ], match: v=>v('aggregation') == 'array',
        apply: operation=>{ operation.aggregation = 'array'; },
        template: 'Collect all {property} of{{collection}}{{skipMissing}}{{variable}}' }
    ],
    clauses: [
      Object.assign(namedGroupClause(), { label: 'from a named pick' }),
      { id: 'variable', label: 'name the result', template: ' and remember it as {variable}' },
      { id: 'skipMissing', label: 'ignoring widgets without it', template: ', {skipMissing}', add: { skipMissing: true } }
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
      { id: 'compare', label: 'Compare two values', fixed: [ 'condition' ],
        apply: operation=>{ delete operation.condition; },
        template: 'If {operand1} {relation} {operand2}' },
      { id: 'condition', label: 'Check a written condition', match: (v, isSet)=>isSet('condition'),
        apply: operation=>{ if(operation.condition === undefined) operation.condition = ''; },
        template: 'If this is true: {condition}' }
    ],
    parameters: {
      // the one blank of the editor that takes something written rather than
      // picked, so it shows the shape of what belongs there instead of the word
      // "condition", which says nothing to somebody who has not written one
      condition: { type: 'string', default: null, hint: 'a condition like ${count} > 3' },
      operand1: { type: 'string', default: null, hint: 'value' },
      relation: { type: 'enum', values: [ '==', '!=', '<', '<=', '>=', '>' ], default: '==', display: comparisonWords },
      operand2: { type: 'string', default: null, hint: 'value' }
    }
  },
  INPUT: {
    description: 'Ask the player to fill in a dialog',
    // an INPUT asks somebody something: who is asked, what the dialog is called
    // and what there is to fill in are three separate things, so each of them is
    // a part of the sentence that is there while the operation has it. A dialog
    // with no fields is the "Are you sure?" every second game asks, so the fields
    // are an option like the rest instead of a form the sentence claims is there.
    // who is asked is not an option but a way of working, because it changes
    // what the answers are: with a list of players every field comes back as an
    // object keyed by player name instead of as a plain value, so everything
    // reading those variables afterwards has to be written differently
    variants: [
      { id: 'player', label: 'Ask the player', fixed: [ 'player' ],
        apply: operation=>{ delete operation.player; },
        template: 'Ask the player{{header}}{{fields}}' },
      { id: 'named', label: 'Ask one particular player', fixed: [ 'player' ],
        match: (v, isSet)=>isSet('player') && v('player') !== null && !Array.isArray(v('player')),
        apply: operation=>{ operation.player = ''; },
        template: 'Ask the player called {player}{{header}}{{fields}}' },
      // what the list of players changes is not who answers but what an answer
      // is, so the entry that offers it says so
      { id: 'several', label: 'Ask several players at once - every answer becomes a list, one entry per player', fixed: [ 'player' ],
        match: v=>Array.isArray(v('player')),
        apply: operation=>{ operation.player = []; },
        template: 'Ask the players {player} at once{{header}}{{fields}}' }
    ],
    clauses: [
      { id: 'header', label: 'a title', template: ' {header}' },
      // the lines of the dialog are the list below the sentence, so the chip is
      // the summary of that list rather than a way to add one - and a dialog
      // with nothing to fill in yet says so there, not with a blank up here
      // and it carries no ⊖: taking it out empties the whole form, which is what
      // the remove button of each line is for - and nothing would offer it back
      // fields can also be a value the routine works out (the engine resolves the
      // whole operation before it reads them), and one that is not a list is only
      // in the sentence - there is no form below to edit it in
      { id: 'fields', label: 'things to fill in', offer: false, removable: false, template: ' to fill in {fields}',
        active: (v, isSet)=>Array.isArray(v('fields')) ? v('fields').length > 0 : isSet('fields') },
      { id: 'confirmButtonText', label: 'the confirm button', template: ', confirming with {confirmButtonText}' },
      { id: 'confirmButtonIcon', label: 'the confirm icon', template: ' and the icon {confirmButtonIcon}', add: { confirmButtonIcon: 'check' } },
      // the cancel button is gone once both of its two parameters are null,
      // which is a feature (a forced choice) hiding behind two nulls - so it is
      // one option that says so, and the two that word the button step aside
      // while it is on
      { id: 'noCancel', label: 'they have to answer', active: inputCannotBeCanceled,
        template: ', and they cannot cancel', add: { cancelButtonText: null, cancelButtonIcon: null },
        remove: { cancelButtonText: undefined, cancelButtonIcon: undefined } },
      { id: 'cancelButtonText', label: 'the cancel button', template: ', canceling with {cancelButtonText}',
        active: (v, isSet)=>isSet('cancelButtonText') && !inputCannotBeCanceled(v, isSet) },
      { id: 'cancelButtonIcon', label: 'the cancel icon', template: ' and the icon {cancelButtonIcon}', add: { cancelButtonIcon: 'close' },
        active: (v, isSet)=>isSet('cancelButtonIcon') && !inputCannotBeCanceled(v, isSet) },
      { id: 'block', label: 'holding everybody else up', template: ', {block}', add: { block: true } },
      { id: 'css', label: 'a style of its own', template: ', styled {css}' },
      // the engine rotates by it, but no game in the library does and the wiki
      // never mentions it: a game that has one still reads what it does
      { id: 'randomRotation', label: 'rotated randomly', offer: false, template: ', rotated by up to {randomRotation} degrees', add: { randomRotation: 5 } }
    ],
    // the two things every dialog is written with: what it says and what it asks
    newOperation: { func: 'INPUT', header: '', fields: [] },
    parameters: {
      // a name, or a list of them to ask several players at once - so the value
      // is worded rather than typed over: a list is a list, not a line of text
      player: { type: 'json', default: null, hint: 'player name', display: value=>Array.isArray(value) && value.length ? wordList(value) : null },
      fields: { type: 'json', default: [], hint: 'fields', display: value=>Array.isArray(value) && value.length ? `${value.length} field${value.length == 1 ? '' : 's'}` : null },
      confirmButtonText: { type: 'string', default: 'Go', display: quotedText },
      confirmButtonIcon: { type: 'icon', default: null },
      cancelButtonText: { type: 'string', default: 'Cancel', display: quotedText },
      cancelButtonIcon: { type: 'icon', default: null },
      header: { type: 'string', default: '', hint: 'title', display: quotedText },
      block: { type: 'enum', values: [ true, false ], default: false, display: yesNo('holding everybody else up until it is answered', 'letting everybody else carry on') },
      css: { type: 'string', default: '' },
      randomRotation: { type: 'number', default: 0 }
    },
    // what an INPUT hands on to the operations after it: every field writes what
    // was entered into the variable it names, and a field the player picks
    // widgets in also fills a collection (the same fields validate_gamefile.js reads)
    // fields can also be a value the routine works out, and what a dialog like
    // that asks is only known while it runs - so it defines nothing here
    definesVariables: operation=>inputFields(operation).map(field=>field && field.variable).filter(name=>typeof name == 'string'),
    definesCollection: operation=>inputFields(operation).filter(field=>field && field.type == 'choose').flatMap(field=>field.collection && typeof field.collection == 'object' ? Object.values(field.collection) : [ field.collection || 'DEFAULT' ]).filter(name=>typeof name == 'string')
  },
  LABEL: {
    description: 'Change the text of a label',
    variants: [
      { id: 'set', label: 'Set the text', fixed: [ 'mode' ], match: v=>v('mode') == 'set',
        apply: operation=>{ operation.mode = 'set'; },
        template: 'Set the text of {label,collection} to {value}' },
      { id: 'inc', label: 'Increase the text', fixed: [ 'mode' ], match: v=>v('mode') == 'inc',
        apply: operation=>{ operation.mode = 'inc'; },
        template: 'Increase the text of {label,collection} by {value}' },
      { id: 'dec', label: 'Decrease the text', fixed: [ 'mode' ], match: v=>v('mode') == 'dec',
        apply: operation=>{ operation.mode = 'dec'; },
        template: 'Decrease the text of {label,collection} by {value}' },
      { id: 'append', label: 'Append text', fixed: [ 'mode' ], match: v=>v('mode') == 'append',
        apply: operation=>{ operation.mode = 'append'; },
        template: 'Append {value} to the text of {label,collection}' }
    ],
    parameters: {
      // any widget with a text property can be labeled, not only a label, so the
      // picker opens on all of them the way every other widget parameter does
      label: { type: 'widgets', default: null },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      value: { type: 'string', default: 0 },
      mode: { type: 'enum', values: [ 'set', 'inc', 'dec', 'append' ], default: 'set' }
    },
    ignored: collectionReplacedBy('label')
  },
  MOVE: {
    description: 'Move widgets into a holder',
    // where the widgets come from is what tells the two ways apart, because it is
    // also what decides how many are moved: one out of a holder, all of the ones
    // an earlier operation picked. One slot switching between the two hid that -
    // picking a holder in it silently turned "all widgets" into "1 widget".
    // Topping a holder up is not a third way but an option of both.
    variants: [
      { id: 'from', label: 'Move widgets from a holder', fixed: [ 'collection' ], match: (v, isSet)=>isSet('from'),
        // the count this way of working starts with is written down rather than
        // left to the default: the engine reads "all" while from is still empty
        // (it dispatches on whether from holds a holder, not on whether it is
        // there), and the sentence may not say 1 where the engine means all
        apply: operation=>{ delete operation.collection; if(operation.from === undefined) { operation.from = null; operation.count = 1; } },
        template: v=>`Move ${v('fillTo') ? 'widgets' : widgetsCounted(v, 'count')} from {from} to {to}{{fillTo}}{{face}}` },
      { id: 'collection', label: 'Move the picked widgets', fixed: [ 'from' ],
        // a count of 1 is the default out of a holder and "all" for the picked
        // widgets, so switching drops it instead of carrying a number over into
        // a sentence where it now means something else
        apply: operation=>{ delete operation.from; delete operation.count; },
        template: 'Move{{count}}{{collection}} to {to}{{fillTo}}{{face}}' }
    ],
    clauses: [
      { id: 'count', label: 'at most a certain number of them', variants: [ 'collection' ],
        active: countIsLimited, add: { count: 1 }, template: ' {count} of' },
      Object.assign(namedGroupClause(), { variants: [ 'collection' ] }),
      { id: 'fillTo', label: 'top up to n', template: ' until it holds {fillTo}', add: { fillTo: 1 } },
      // the first two faces are what a game turns cards to; the ones after them
      // are numbered, and a number needs the word that says what it is
      { id: 'face', label: 'to a face', add: { face: 0 },
        template: v=>isNamedFace(v('face')) ? ' and turn them face {face}' : ' and turn them to face {face}' },
      // where in the holder they end up: within the stack (or spread) it holds,
      // or as one of the groups a holder that arranges piles lines up
      { id: 'position', label: 'at a place in the holder', template: ' and place them {position}', add: { position: 'pileTop' } }
    ],
    // the shape 88% of the library writes: so many widgets out of one holder
    newOperation: { func: 'MOVE', from: null, count: 1 },
    parameters: {
      fillTo: { type: 'number', default: null },
      // how many are moved is what the engine reads it as: one out of the holder
      // from names, all of the picked widgets while it names none (widget.js
      // dispatches on the value of from, not on whether it is there)
      count: { type: 'number', default: operation=>operation.from ? 1 : 'all', special: [ 'all' ], display: countWords },
      from: { type: 'widgets', default: null, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      to: { type: 'widgets', default: null, widgetType: 'holder' },
      face: { type: 'number', default: null, display: faceWords },
      position: { type: 'enum', values: [ 'pileBottom', 'pileTop', 'groupStart', 'groupEnd' ], default: null,
        display: { pileBottom: 'at the bottom of the pile', pileTop: 'on top of the pile', groupStart: 'in a new group before the others', groupEnd: 'in a new group after the others' } }
    },
    ignored: (v, isSet)=>{
      const ignored = collectionReplacedBy('from')(v);
      if(v('fillTo'))
        ignored.count = 'ignored because "top up to" is set';
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
      // z is a position, not the layer property a widget also has - so the option
      // says which of the two it is instead of leaving that to be guessed from
      // the letter
      { id: 'z', label: 'at the specified stacked (z) position', template: ' at the z position {z}', add: { z: 1 } },
      // the first two faces are what a game turns cards to; the ones after them
      // are numbered, and a number needs the word that says what it is
      { id: 'face', label: 'to a face', add: { face: 0 },
        template: v=>isNamedFace(v('face')) ? ' and turn them face {face}' : ' and turn them to face {face}' },
      { id: 'snapToGrid', label: 'ignoring the grid', template: ', {snapToGrid}', add: { snapToGrid: false } },
      { id: 'resetOwner', label: 'keeping their current owner', template: ', {resetOwner}', add: { resetOwner: false } }
    ],
    parameters: {
      count: { type: 'number', default: 1, special: [ 'all' ], display: countWords },
      from: { type: 'widgets', default: null, widgetType: 'holder' },
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
    // every option of a RECALL turns one of its defaults around, so each one is
    // named after what switching it on does rather than after the parameter it
    // sets: "the cards players hold" are gathered anyway, and the option is what
    // leaves them where they are
    clauses: [
      { id: 'owned', label: 'except the cards players hold', template: ', {owned}', add: { owned: false } },
      { id: 'inHolder', label: 'only the cards on the table', template: ', {inHolder}', add: { inHolder: false } },
      { id: 'byDistance', label: 'nearest cards first', template: ', {byDistance}', add: { byDistance: true } },
      { id: 'excludeCollection', label: 'leave some out', template: ', except {excludeCollection}' }
    ],
    parameters: {
      holder: { type: 'widgets', default: null, widgetType: 'holder' },
      owned: { type: 'enum', values: [ true, false ], default: true, display: yesNo('including the cards players hold', 'except the cards players hold') },
      inHolder: { type: 'enum', values: [ true, false ], default: true, display: yesNo('including the cards inside other holders', 'only the cards on the table') },
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
      { id: 'property', label: 'another property', template: ', using the values in {property}' }
    ],
    parameters: {
      property: { type: 'property', default: 'resetProperties' }
    }
  },
  ROTATE: {
    description: 'Rotate widgets',
    variants: [
      { id: 'add', label: 'Rotate widgets by an angle', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: v=>`Rotate${countedInHolderOrOfGroup(v)}${holderPreposition(v)} {holder,collection} by {angle} degrees` },
      { id: 'set', label: 'Set the rotation of widgets', fixed: [ 'mode' ], match: v=>v('mode') == 'set',
        apply: operation=>{ operation.mode = 'set'; },
        template: v=>`Set the rotation of${countedInHolderOrOfGroup(v)}${holderPreposition(v)} {holder,collection} to {angle} degrees` }
    ],
    parameters: {
      count: { type: 'number', default: 1, special: [ 'all' ], display: countWords },
      holder: { type: 'widgets', default: null, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      // an angle is picked from the ones games turn things by, all the way round:
      // the sixths a hex board is built on, the eighths everything else uses and
      // the twelfths in between - a keypad of 0 to 10 offers none of them
      angle: { type: 'number', default: 90, specialOnly: true, special: [ 0, 30, 45, 60, 90, 120, 135, 180, 225, 240, 270, 300, 315, 360 ] },
      mode: { type: 'enum', values: [ 'set', 'add' ], default: 'add' }
    },
    ignored: collectionReplacedBy('holder')
  },
  SCORE: {
    description: 'Change the score of seats',
    variants: [
      { id: 'set', label: 'Set the score', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: 'Set {property} of {seats} in {round} to {value}' },
      { id: 'inc', label: 'Add to the score', fixed: [ 'mode' ], match: v=>v('mode') == 'inc',
        apply: operation=>{ operation.mode = 'inc'; },
        template: 'Add {value} to {property} of {seats} in {round}' },
      { id: 'dec', label: 'Subtract from the score', fixed: [ 'mode' ], match: v=>v('mode') == 'dec',
        apply: operation=>{ operation.mode = 'dec'; },
        template: 'Subtract {value} from {property} of {seats} in {round}' }
    ],
    parameters: {
      property: { type: 'property', default: 'score' },
      seats: { type: 'widgets', default: null, display: { 'null': 'every seat' }, widgetType: 'seat' },
      // which round a score goes into is part of every SCORE rather than an
      // option: leaving it out adds one to the end of the list (widget.js reads
      // `a.round === null ? newScore.length + 1 : a.round`), which is a choice
      // like naming a round, so both are in the drop-down the sentence has
      round: { type: 'number', default: null, menu: true, specialOnly: true, special: [ null, 1, 2, 3, 4, 5 ], otherLabel: 'another round…',
        display: value=>value === null ? 'a new round' : (typeof value == 'number' ? `round ${value}` : null) },
      mode: { type: 'enum', values: [ 'set', 'inc', 'dec' ], default: 'set' },
      // a SCORE without a value does not do nothing: the engine fills in 0 for a
      // Set and 1 for an Add or a Subtract (`a.value = a.mode=='set' ? 0 : 1`),
      // so the sentence says the number that is going to be used rather than
      // leaving a blank where the one thing a score is about belongs
      value: { type: 'number', default: operation=>operation.mode == 'inc' || operation.mode == 'dec' ? 1 : 0 }
    }
  },
  SELECT: {
    description: 'Pick the widgets the next operations work on',
    variants: [
      { id: 'set', label: 'Select widgets', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: 'Pick{{max}}{{random}}{{type}}{{source}} where {property} {relation} {value}{{sortBy}}{{collection}}' },
      { id: 'add', label: 'Add widgets to a collection', fixed: [ 'mode' ], match: v=>v('mode') == 'add',
        apply: operation=>{ operation.mode = 'add'; },
        template: 'Add to the pick{{collection}}:{{max}}{{random}}{{type}}{{source}} where {property} {relation} {value}{{sortBy}}' },
      { id: 'remove', label: 'Remove widgets from a collection', fixed: [ 'mode' ], match: v=>v('mode') == 'remove',
        apply: operation=>{ operation.mode = 'remove'; },
        template: 'Remove from the pick{{collection}}:{{max}}{{random}}{{type}}{{source}} where {property} {relation} {value}{{sortBy}}' },
      { id: 'intersect', label: 'Narrow a collection down', fixed: [ 'mode' ], match: v=>v('mode') == 'intersect',
        apply: operation=>{ operation.mode = 'intersect'; },
        template: 'Narrow the pick{{collection}} down to{{max}}{{random}}{{type}}{{source}} where {property} {relation} {value}{{sortBy}}' }
    ],
    // the condition is not an option: the engine always filters by it, so a
    // SELECT that does not name one picks whatever has no parent - the widgets
    // lying on the table. That is also the shape 46% of the library uses, so it
    // is what a new SELECT starts as, with both halves left blank to fill in.
    newOperation: { func: 'SELECT', property: '', value: '' },
    clauses: [
      // a SELECT that names no type picks whatever matches, so the sentence says
      // "widgets" in plain words until a game narrows it down - the same shape as
      // the collection of a SET, and the type takes the place of the word
      { id: 'type', label: 'only one type', template: ' {type}', whenOff: ' widgets',
        active: v=>v('type') != 'all', add: { type: 'card' } },
      { id: 'source', label: 'from an earlier pick', template: ' from the pick called {source}' },
      { id: 'max', label: 'at most a certain number of them', template: ' at most {max}', add: { max: 1 } },
      { id: 'random', label: 'in random order', template: ' {random}', add: { random: true } },
      { id: 'sortBy', label: 'sorted by a property', template: ', sorted by {sortBy}', add: { sortBy: 'value' } },
      { id: 'collection', label: 'give this group a name', variants: [ 'set' ], template: ' — call them {collection}' },
      { id: 'collection', label: 'another pick', variants: [ 'add', 'remove', 'intersect' ], template: ' called {collection}' }
    ],
    parameters: {
      max: { type: 'number', default: 999999, special: [ 'all' ], display: { '999999': 'all' } },
      type: { type: 'enum', values: [ 'all', 'button', 'canvas', 'card', 'deck', 'dice', 'holder', 'label', 'pile', 'scoreboard', 'seat', 'spinner', 'timer' ], default: 'all', display: { 'all': 'widgets', 'button': 'buttons', 'canvas': 'canvases', 'card': 'cards', 'deck': 'decks', 'dice': 'dice', 'holder': 'holders', 'label': 'labels', 'pile': 'piles', 'scoreboard': 'scoreboards', 'seat': 'seats', 'spinner': 'spinners', 'timer': 'timers' } },
      source: { type: 'collection', default: 'all', display: { 'all': 'all widgets', 'DEFAULT': 'the picked widgets' } },
      property: { type: 'property', default: 'parent' },
      relation: { type: 'enum', values: [ '==', '!=', '<', '<=', '>=', '>', 'in' ], default: '==', display: comparisonWords },
      // the engine compares the property to this value with === , so what it is
      // matters as much as what it says: a value edited as text would turn the 0
      // of "activeFace is 0" into "0" and match nothing. It is written as JSON
      // for the same reason SET value is - and that is also what makes a list,
      // which "is one of" needs, something the sentence can hold at all.
      value: { type: 'json', default: null, display: { 'null': 'nothing' }, hint: 'value' },
      mode: { type: 'enum', values: [ 'set', 'add', 'remove', 'intersect' ], default: 'set' },
      collection: { type: 'collection', default: 'DEFAULT' },
      sortBy: { type: 'json', default: null, display: listWords },
      random: { type: 'enum', values: [ true, false ], default: false, display: yesNo('random', 'in their current order') }
    },
    definesCollection: 'collection'
  },
  SET: {
    description: 'Change a property of widgets',
    variants: [
      { id: 'set', label: 'Set a property', fixed: [ 'relation' ],
        apply: operation=>{ delete operation.relation; },
        template: 'Set {property} of{{collection}} to {value}' },
      // increasing and appending are the same relation to the engine: it adds
      // the value to what the property holds, which is arithmetic for a number
      // and text after text for a string. So the LITERAL value decides which of
      // the two sentences a stored operation reads as, and picking the other one
      // makes the value the kind that variant is about. A value the routine works
      // out while it runs decides nothing: "${x}" is a string to JavaScript, but
      // what it stands for is a number in a "+" SET far more often than not, so
      // it reads as the arithmetic one. Which of the two words it is not a guess
      // the card has to own up to either (wordingOnly, see variantState): both
      // write the same operation, so all that is at stake is the English.
      { id: 'add', label: 'Increase a property', fixed: [ 'relation' ], hints: { value: 'number' }, wordingOnly: [ 'value' ],
        match: v=>v('relation') == '+' && !isLiteralText(v('value')),
        apply: operation=>{ operation.relation = '+'; if(typeof operation.value != 'number' && !isDynamicValue(operation.value)) operation.value = 1; },
        template: 'Increase {property} of{{collection}} by {value}' },
      { id: 'subtract', label: 'Decrease a property', fixed: [ 'relation' ], hints: { value: 'number' },
        match: v=>v('relation') == '-',
        apply: operation=>{ operation.relation = '-'; if(typeof operation.value != 'number' && !isDynamicValue(operation.value)) operation.value = 1; },
        template: 'Decrease {property} of{{collection}} by {value}' },
      { id: 'multiply', label: 'Multiply a property', fixed: [ 'relation' ], hints: { value: 'number' },
        match: v=>v('relation') == '*',
        apply: operation=>{ operation.relation = '*'; if(typeof operation.value != 'number' && !isDynamicValue(operation.value)) operation.value = 1; },
        template: 'Multiply {property} of{{collection}} by {value}' },
      { id: 'divide', label: 'Divide a property', fixed: [ 'relation' ], hints: { value: 'number' },
        match: v=>v('relation') == '/',
        apply: operation=>{ operation.relation = '/'; if(typeof operation.value != 'number' && !isDynamicValue(operation.value)) operation.value = 1; },
        template: 'Divide {property} of{{collection}} by {value}' },
      { id: 'toggle', label: 'Switch a property on or off', fixed: [ 'relation', 'value' ], match: v=>v('relation') == '!',
        apply: operation=>{ operation.relation = '!'; delete operation.value; },
        template: 'Toggle {property} of{{collection}}' },
      { id: 'append', label: 'Append text to a property', fixed: [ 'relation' ], hints: { value: '"text"' }, wordingOnly: [ 'value' ],
        match: v=>v('relation') == '+' && isLiteralText(v('value')),
        apply: operation=>{ operation.relation = '+'; if(typeof operation.value != 'string') operation.value = ''; },
        template: 'Append {value} to {property} of{{collection}}' }
    ],
    clauses: [
      namedGroupClause()
    ],
    // "Set parent of the picked widgets to nothing" is what the raw defaults say,
    // and nobody adds a SET for that: a new one asks which property and which
    // value instead of starting from a value that has to be replaced twice
    newOperation: { func: 'SET', property: '', value: '' },
    parameters: {
      // every one of the seven verbs asks for the same thing in the same word:
      // what they all change is a property, whichever way they change it, so no
      // variant words this blank differently
      property: { type: 'property', default: 'parent' },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      relation: { type: 'enum', values: [ '=', '+', '-', '*', '/', '!' ], default: '=' },
      // text in quotes is the difference between the number 1 and the digit 1;
      // a value the routine remembers is worded as its name instead
      value: { type: 'json', default: null, hint: 'number or text', display: quotedText }
    },
    // ! is the one relation that takes a single operand (the current value)
    ignored: v=>v('relation') == '!' ? { value: 'ignored because ! only negates the current value' } : {}
  },
  SHUFFLE: {
    description: 'Shuffle widgets into another order',
    // shuffling is one thing an operation does, however it goes about it: the
    // technique is an option of the one sentence rather than five ways of
    // working, and what it needs (how often, which seed) comes with it
    variants: [
      { id: 'shuffle', label: 'Shuffle', template: 'Shuffle {holder,collection}{{mode}}' }
    ],
    clauses: [
      { id: 'mode', label: 'using a specific technique', active: v=>v('mode') != 'true random', add: { mode: 'overhand' },
        template: v=>{
          if(v('mode') == 'seeded')
            return ' {mode} with the seed {modeValue}';
          if(v('mode') == 'overhand' || v('mode') == 'riffle')
            return ` {mode}, {modeValue} time${v('modeValue') == 1 ? '' : 's'}`;
          return ' {mode}';
        } }
    ],
    parameters: {
      holder: { type: 'widgets', default: null, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      mode: { type: 'enum', values: [ 'true random', 'overhand', 'riffle', 'reverse', 'seeded' ], default: 'true random',
        display: { 'true random': 'at random', riffle: 'with a riffle', reverse: 'by reversing the order', seeded: 'the same way every time' } },
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
      { id: 'key', label: 'by a property', template: ' by {key}' },
      // only a holder that arranges piles has the groups this builds, so the
      // option says so rather than reading as something every sort can do
      { id: 'groupBy', label: 'into groups', template: ' and group them by {groupBy}' },
      { id: 'reverse', label: 'biggest first', template: ', {reverse}', add: { reverse: true } },
      { id: 'rearrange', label: 'without moving them', template: ', {rearrange}', add: { rearrange: false } },
      { id: 'locales', label: 'for a language', template: ', for the language {locales}', add: { locales: 'en' } },
      { id: 'options', label: 'how text compares', template: ', with the comparison options {options}' }
    ],
    parameters: {
      holder: { type: 'widgets', default: null, widgetType: 'holder' },
      collection: { type: 'collection', default: 'DEFAULT', display: pickedWidgets },
      key: { type: 'json', default: 'value', display: listWords },
      // one group per value this property has, in a holder that arranges piles
      groupBy: { type: 'property', default: null },
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
      // the groups are what a holder arranging piles lines up, so there are
      // none to build when the sort works on picked widgets instead
      else if(v('groupBy'))
        ignored.groupBy = 'ignored because only the widgets in a holder can be sorted into groups';
      return ignored;
    }
  },
  SWAPHANDS: {
    description: 'Pass the hands around the table',
    variants: [
      { id: 'swaphands', label: 'Swap the hands of the players', template: 'Pass every hand on to the next seat{{interval}}{{direction}}{{source}}' }
    ],
    clauses: [
      { id: 'interval', label: 'n seats along', template: ' but {interval} seats along' },
      { id: 'direction', label: 'which way round', template: ', {direction}' },
      { id: 'keepOrder', label: 'keeping the order of each hand', template: ', {keepOrder}', add: { keepOrder: true } },
      { id: 'source', label: 'among some of the seats', template: ', among {source}' }
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
      { id: 'toggle', label: 'Toggle a timer on/off', fixed: [ 'mode' ],
        apply: operation=>{ delete operation.mode; },
        template: v=>`Toggle on/off ${timerTarget(v)}` },
      { id: 'reset', label: 'Reset a timer', fixed: [ 'mode' ], match: v=>v('mode') == 'reset',
        apply: operation=>{ operation.mode = 'reset'; },
        template: v=>`Reset ${timerTarget(v)}` },
      { id: 'set', label: 'Set the time', fixed: [ 'mode' ], match: v=>v('mode') == 'set',
        apply: operation=>{ operation.mode = 'set'; },
        template: v=>`Set ${timerTarget(v)} to ${timerTime(v)}` },
      { id: 'inc', label: 'Add time', fixed: [ 'mode' ], match: v=>v('mode') == 'inc',
        apply: operation=>{ operation.mode = 'inc'; },
        template: v=>`Add ${timerTime(v)} to ${timerTarget(v)}` },
      { id: 'dec', label: 'Remove time', fixed: [ 'mode' ], match: v=>v('mode') == 'dec',
        apply: operation=>{ operation.mode = 'dec'; },
        template: v=>`Remove ${timerTime(v)} from ${timerTarget(v)}` }
    ],
    parameters: {
      timer: { type: 'widgets', default: null, widgetType: 'timer' },
      collection: { type: 'collection', default: 'DEFAULT', widgetType: 'timer', display: { 'DEFAULT': 'the picked timers' } },
      mode: { type: 'enum', values: [ 'pause', 'start', 'toggle', 'set', 'dec', 'inc', 'reset' ], default: 'toggle' },
      value: { type: 'number', default: 0, special: [ 'start', 'end' ], scale: millisecondsPerSecond, display: secondsWords, textHint: 'name of a timer property to read the time from' },
      // the engine takes seconds over value when it is set (setMilliseconds(a.seconds*1000 || a.value)),
      // so a game that has one keeps reading as the time it is - but a time is
      // said in seconds either way now, so there is nothing to choose here
      seconds: { type: 'number', default: 0, offer: false }
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
      { id: 'forward', label: 'Pass the turn on', fixed: [ 'turnCycle' ],
        apply: operation=>{ delete operation.turnCycle; },
        template: 'Pass the turn on{{turn}}' },
      { id: 'backward', label: 'Pass the turn backwards', fixed: [ 'turnCycle' ], match: v=>v('turnCycle') == 'backward',
        apply: operation=>{ operation.turnCycle = 'backward'; },
        template: 'Pass the turn back{{turn}}' },
      { id: 'random', label: 'Give the turn to a random seat', fixed: [ 'turnCycle' ], match: v=>v('turnCycle') == 'random',
        apply: operation=>{ operation.turnCycle = 'random'; },
        template: 'Give the turn to a random seat' },
      { id: 'position', label: 'Give the turn to a seat by its position', fixed: [ 'turnCycle' ], match: v=>v('turnCycle') == 'position',
        apply: operation=>{ operation.turnCycle = 'position'; },
        template: 'Give the turn to the seat at position {turn}' },
      { id: 'seat', label: 'Give the turn to a specific seat', fixed: [ 'turnCycle' ], match: v=>v('turnCycle') == 'seat',
        apply: operation=>{ operation.turnCycle = 'seat'; },
        template: 'Give the turn to the seat {turn}' }
    ],
    clauses: [
      { id: 'turn', label: 'n seats along', variants: [ 'forward', 'backward' ], template: v=>` by ${v('turn') == 1 ? '{turn} seat' : '{turn} seats'}` },
      { id: 'source', label: 'among some of the seats', template: ', among {source}' },
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
      { id: 'variable', label: 'name the result', template: ' and remember its name as {variable}' },
      { id: 'fileTypes', label: 'only some file types', template: ', accepting {fileTypes}' }
    ],
    parameters: {
      variable: { type: 'string', default: 'uploadedFileName' },
      fileTypes: { type: 'json', default: [ '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.json', '.mp3', '.wav', '.ogg', '.m4a' ], display: listWords }
    },
    definesVariable: 'variable'
  },
  VAR: {
    description: 'Remember values for later operations',
    // a VAR holding one pair is what three out of four of them are, and one pair
    // is a sentence: the same words a var statement uses, with the name and the
    // value as two chips rather than one chip holding the raw "total: 3". Several
    // pairs stay the list they are, edited as the rows the popup already has.
    variants: [
      { id: 'var', label: 'Set variables',
        template: v=>varPairCount(v) > 1 ? 'Set the variables {variables}' : 'Set the variable {variableName} to the value {variableValue}' }
    ],
    clauses: [
      // one more pair turns the sentence into the list, where the rows add and
      // remove them - so this is the one way in and the rows are the way back
      { id: 'anotherVariable', label: 'another variable', template: '', active: _=>false, add: { anotherVariable: true } }
    ],
    parameters: {
      // what a VAR holds is a list of pairs, so it is edited as one - a name and
      // a value per row - rather than as the object that list is stored as
      variables: { type: 'keyValue', default: {}, offer: false, hint: 'variables', display: variablePairWords, keyHint: 'variable' },
      // the two halves of a single pair: they are not properties of their own,
      // VarSetRoutineOperationEditor reads and writes them through variables
      variableName: { type: 'string', default: '', offer: false, hint: 'name', describedBy: 'variables' },
      variableValue: { type: 'json', default: null, offer: false, hint: 'value', describedBy: 'variables' }
    },
    // the sentence says all three, one way or the other, so none of them is a
    // part of it that is missing and could be added
    spokenFor: [ 'variables', 'variableName', 'variableValue' ],
    definesVariables: operation=>Object.keys(operation.variables || {})
  }
};

// The fields of an INPUT dialog: a form is a list of lines, and every line is
// described by the same two tables an operation is - the ways it can work and
// the optional parts of its sentence - so a field is edited with the same
// chips, drop-downs, options and popups, one level down.
//
// Three things the sentences say out loud that the JSON never did:
//
//   answer - what the variable holds once the player answered. A number field
//     remembers TEXT (widget.js reads dom.value unconverted, so ${rounds} + 1
//     is "31"), a switch remembers "on"/"off" where a tick box remembers
//     true/false, and a choose remembers one widget or a list of them
//     depending on how many it lets the player take.
//
//   the content key - the three display types keep what they show in text
//     while every other type keeps it in label. The sentence words both as
//     what the player reads, and the editor writes whichever key belongs to
//     the type, so nobody has to learn that there was a difference.
//
//   collects: false - the three display types ask nothing. They have no
//     variable and the sentence does not pretend otherwise.
//
// A field's variable is the one clause-like parameter that is not optional: a
// field without it collects an answer and throws it away, so it is part of
// every sentence that collects one, in red until it has a name - and the
// editor proposes one from the label as soon as the label is typed.
const inputFieldCSSClause = { id: 'css', label: 'a style of its own', template: ', styled {css}' };
const inputFieldCSSParameter = { type: 'string', default: '' };
const inputFieldLabelParameter = { type: 'string', default: '', hint: 'question', display: quotedText };
const inputFieldVariableParameter = { type: 'string', default: '', hint: 'name' };
const inputFieldRemembered = ', remembering the answer as {variable}';
// the value a field opens with is the same option nine times over, so it is
// worded once: a field that is in a state says which state it is already in
// ("already ticked", "already on", "already picked"), and every field that holds
// a value the player can overwrite says that it holds one to begin with
const inputFieldStartingValue = 'what it starts with';

// the three types that only show something, worded by what they show
function inputDisplayField(what, hint) {
  return {
    description: `Show ${what}`,
    collects: false,
    variants: [ { id: 'show', label: `Show ${what}`, template: `Show ${what}: {text}` } ],
    clauses: [ inputFieldCSSClause ],
    parameters: {
      text: { type: 'string', default: '', hint, display: quotedText },
      css: inputFieldCSSParameter
    }
  };
}

const routineInputFieldMetadata = {
  title: inputDisplayField('a heading', 'heading'),
  subtitle: inputDisplayField('a subheading', 'subheading'),
  text: inputDisplayField('a paragraph', 'paragraph'),
  checkbox: {
    description: 'A box the player ticks',
    answer: 'true or false',
    variants: [ { id: 'checkbox', label: 'Tick box', template: `Tick box {label}{{value}}${inputFieldRemembered}` } ],
    clauses: [
      { id: 'value', label: 'already ticked', template: ', starting {value}', add: { value: true } },
      inputFieldCSSClause
    ],
    parameters: {
      label: inputFieldLabelParameter,
      value: { type: 'enum', values: [ true, false ], default: false, display: yesNo('ticked', 'not ticked') },
      variable: inputFieldVariableParameter,
      css: inputFieldCSSParameter
    }
  },
  switch: {
    description: 'A switch the player flips',
    // the same control to look at as a tick box, and an answer nothing that
    // compares against true or false will ever match
    answer: 'the text "on" or the text "off"',
    variants: [ { id: 'switch', label: 'Toggle', template: `Toggle {label}{{value}}${inputFieldRemembered}` } ],
    clauses: [
      { id: 'value', label: 'already on', template: ', starting {value}', add: { value: 'on' } },
      inputFieldCSSClause
    ],
    parameters: {
      label: inputFieldLabelParameter,
      value: { type: 'enum', values: [ 'on', 'off' ], default: 'off', display: { 'on': 'on', 'off': 'off' } },
      variable: inputFieldVariableParameter,
      css: inputFieldCSSParameter
    }
  },
  string: {
    description: 'A line of text to type',
    answer: 'the text they typed',
    variants: [ { id: 'string', label: 'Ask for text', template: `Ask for text {label}{{value}}${inputFieldRemembered}{{regex}}` } ],
    clauses: [
      { id: 'value', label: inputFieldStartingValue, template: ', starting {value}', add: { value: '' } },
      // a pattern without a hint shows the raw pattern as the error message, so
      // switching the pattern on switches the message on with it
      { id: 'regex', label: 'only text matching a pattern', template: ', only accepting {regex}', add: { regex: '', regexHint: '' } },
      { id: 'regexHint', label: 'what to say when it does not match', template: ' and saying {regexHint} when it does not' },
      inputFieldCSSClause
    ],
    parameters: {
      label: inputFieldLabelParameter,
      value: { type: 'string', default: '', display: quotedText },
      regex: { type: 'string', default: '', hint: 'pattern' },
      regexHint: { type: 'string', default: '', hint: 'message', display: quotedText },
      variable: inputFieldVariableParameter,
      css: inputFieldCSSParameter
    }
  },
  number: {
    description: 'A number to type',
    // the trap that costs an evening: the engine stores what was typed, not the
    // number it looks like
    answer: 'the number as TEXT - use parseFloat before doing math with it',
    variants: [ { id: 'number', label: 'Ask for a number', template: `Ask for a number {label}{{value}}{{bounds}}${inputFieldRemembered}` } ],
    clauses: [
      { id: 'value', label: inputFieldStartingValue, template: ', starting {value}', add: { value: 0 } },
      { id: 'bounds', label: 'a smallest and a largest', add: { min: 1, max: 10 },
        template: v=>{
          if(v('min') != null && v('max') != null)
            return ', between {min} and {max}';
          return v('max') != null ? ', up to {max}' : ', at least {min}';
        } },
      inputFieldCSSClause
    ],
    parameters: {
      label: inputFieldLabelParameter,
      value: { type: 'number', default: 0 },
      min: { type: 'number', default: null },
      max: { type: 'number', default: null },
      variable: inputFieldVariableParameter,
      css: inputFieldCSSParameter
    }
  },
  slider: {
    description: 'A slider to drag',
    answer: 'the number it stopped at, or the entry of the list it stopped on',
    // two genuinely different controls: one slides between two numbers, the
    // other along a list of words and hands back the word
    variants: [
      { id: 'range', label: 'Slide between two numbers', fixed: [ 'values' ],
        apply: operation=>{ delete operation.values; },
        template: `Slide {label} from {min} to {max}{{step}}{{unit}}{{value}}${inputFieldRemembered}` },
      { id: 'values', label: 'Slide along a list', fixed: [ 'values' ], match: v=>Array.isArray(v('values')),
        apply: operation=>{ operation.values = []; delete operation.min; delete operation.max; delete operation.step; delete operation.unit; },
        template: `Slide {label} through {values}{{value}}${inputFieldRemembered}` }
    ],
    clauses: [
      { id: 'step', label: 'how far each notch is', template: ' in steps of {step}', add: { step: 1 } },
      { id: 'unit', label: 'what the number is measured in', template: ', showing {unit}', add: { unit: '%' } },
      { id: 'value', label: inputFieldStartingValue, template: ', starting at {value}' },
      inputFieldCSSClause
    ],
    parameters: {
      label: inputFieldLabelParameter,
      min: { type: 'number', default: 0 },
      max: { type: 'number', default: 10 },
      step: { type: 'number', default: 1 },
      unit: { type: 'string', default: '', display: quotedText },
      values: { type: 'stringList', default: null, hint: 'entries', display: listWords },
      value: { type: 'string', default: null },
      variable: inputFieldVariableParameter,
      css: inputFieldCSSParameter
    }
  },
  select: {
    description: 'A drop-down to pick one entry from',
    answer: 'the entry they picked',
    variants: [ { id: 'select', label: 'Ask them to pick one of', template: `Ask them to pick one of {options}{{value}}{{label}}${inputFieldRemembered}` } ],
    clauses: [
      { id: 'label', label: 'a question in front of it', template: ', asked as {label}' },
      { id: 'value', label: inputFieldStartingValue, template: ', starting at {value}' },
      inputFieldCSSClause
    ],
    parameters: {
      label: inputFieldLabelParameter,
      // an entry is the text it shows; an entry that stores something else than
      // it shows is the { value, text } pair the engine reads, kept as it is
      options: { type: 'stringList', default: [], hint: 'entries', entryHint: 'entry', display: selectOptionWords },
      value: { type: 'string', default: null },
      variable: inputFieldVariableParameter,
      css: inputFieldCSSParameter
    }
  },
  palette: {
    description: 'A row of colors to pick from',
    answer: 'the color they picked - nothing at all if none is preselected',
    variants: [ { id: 'palette', label: 'Ask them to pick a color from', template: `Ask them to pick a color from {colors}{{value}}{{label}}${inputFieldRemembered}` } ],
    clauses: [
      { id: 'label', label: 'a question in front of it', template: ', asked as {label}' },
      { id: 'value', label: inputFieldStartingValue, template: ', starting at {value}' },
      inputFieldCSSClause
    ],
    parameters: {
      label: inputFieldLabelParameter,
      colors: { type: 'stringList', default: [ '#000000' ], hint: 'colors', entryHint: 'color', display: listWords },
      value: { type: 'color', default: null },
      variable: inputFieldVariableParameter,
      css: inputFieldCSSParameter
    }
  },
  color: {
    description: 'Any color at all',
    answer: 'the color they picked',
    variants: [ { id: 'color', label: 'Ask them to pick any color', template: `Ask them to pick any color{{label}}{{value}}${inputFieldRemembered}` } ],
    clauses: [
      { id: 'label', label: 'a question in front of it', template: ', asked as {label}' },
      { id: 'value', label: inputFieldStartingValue, template: ', starting at {value}', add: { value: '#ff0000' } },
      inputFieldCSSClause
    ],
    parameters: {
      label: inputFieldLabelParameter,
      value: { type: 'color', default: '#ff0000' },
      variable: inputFieldVariableParameter,
      css: inputFieldCSSParameter
    }
  },
  choose: {
    description: 'Widgets of the game to pick',
    answer: 'one widget while it takes one, a list of widgets as soon as it takes more',
    // where the widgets come from is what tells the two ways apart - the engine
    // prefers holder over source and shows an empty picker if neither resolves
    variants: [
      { id: 'holder', label: 'Ask them to pick from a holder', fixed: [ 'holder', 'source' ], match: (v, isSet)=>isSet('holder'),
        apply: operation=>{ delete operation.source; if(operation.holder === undefined) operation.holder = null; },
        template: `Ask them to pick{{howMany}} of the widgets in {holder}${inputFieldRemembered}{{collection}}` },
      { id: 'source', label: 'Ask them to pick from a group of widgets', fixed: [ 'holder', 'source' ],
        apply: operation=>{ delete operation.holder; if(operation.source === undefined) operation.source = ''; },
        template: `Ask them to pick{{howMany}} of the widgets called {source}${inputFieldRemembered}{{collection}}` }
    ],
    clauses: [
      // how many they may take is also what the answer is: one widget while a
      // choose takes one, a list of them as soon as it takes more
      { id: 'howMany', label: 'how many they may take', whenOff: ' one',
        active: (v, isSet)=>isSet('min') || isSet('max'),
        template: v=>{
          if(v('min') != null && v('max') != null)
            return ' {min} to {max}';
          return v('max') != null ? ' up to {max}' : ' at least {min}';
        },
        add: { min: 1, max: 3 }, remove: { min: undefined, max: undefined } },
      { id: 'collection', label: 'a name for what they picked', template: ', and calling them {collection}',
        active: v=>v('collection') != 'DEFAULT', add: { collection: '' } },
      { id: 'scale', label: 'shown smaller or bigger', template: ', shown at {scale} size', add: { scale: 0.5 } },
      { id: 'propertyOverride', label: 'shown with other properties', template: ', displayed with {propertyOverride}', add: { propertyOverride: {} } },
      { id: 'mode', label: 'a side rather than the whole widget', template: ', letting them pick {mode}', add: { mode: 'faces' } },
      { id: 'faces', label: 'only some of the sides', template: ', out of {faces}', add: { faces: [ 0, 1 ] } },
      { id: 'value', label: 'already picked', template: ', starting with {value}' },
      { id: 'visibleChildWidgets', label: 'showing what is on them', offer: false, template: ', showing {visibleChildWidgets}' },
      inputFieldCSSClause
    ],
    parameters: {
      label: inputFieldLabelParameter,
      holder: { type: 'widgets', default: null, widgetType: 'holder' },
      source: { type: 'collection', default: '' },
      min: { type: 'number', default: null },
      // the engine reads a missing max as one, which is what the sentence says
      // while the option is off
      max: { type: 'number', default: null },
      collection: { type: 'collection', default: 'DEFAULT' },
      scale: { type: 'number', default: 1, display: value=>typeof value == 'number' ? `${Math.round(value*100)}%` : null },
      propertyOverride: { type: 'keyValue', default: {}, keyHint: 'property', display: keyValueWords },
      mode: { type: 'enum', values: [ 'faces' ], default: null, display: { 'faces': 'a side of them' } },
      faces: { type: 'stringList', default: null, hint: 'sides', entryHint: 'side', display: listWords },
      value: { type: 'widgets', default: null },
      visibleChildWidgets: { type: 'json', default: null },
      variable: inputFieldVariableParameter,
      css: inputFieldCSSParameter
    }
  }
};

// a select entry is the text it shows; one that stores something other than what
// it shows is the pair the engine reads and reads as that pair
function selectOptionWords(value) {
  if(!Array.isArray(value) || !value.length)
    return null;
  return wordList(value.map(option=>option && typeof option == 'object' ? (option.text || option.value || '') : option));
}

// ---------------------------------------------------------------------------
// The catalog of what a `var` statement can work out: every one of the 110
// operations compute.js knows, in the words the sentence says them with.
//
// One entry per operation:
//   word     - what the drop-down offers and what the chip in the sentence
//              shows. It is the operation itself, worded: "plus", "the length
//              of", "a whole number between".
//   template - where the operands go around that word. {operator} is the chip
//              the word sits in, {x}/{y}/{z} are the operands in the order
//              compute() receives them, and {variable} is the variable the
//              statement writes - only the operations that work ON it name it.
//   group    - the heading the drop-down lists it under.
//   note     - the thing about it that is invisible in the JSON and costs an
//              evening (the trig functions counting in degrees, division by
//              zero quietly yielding 0, indexOf answering -1).
//
// Two written shapes, and which one an operation uses is fixed by compute.js:
// infix (`var total = ${a} + ${b}`, the left operand lands in x) and prefix
// (`var n = randInt 1 6`, the operands are x, y, z in order). Both end up in
// the same slots, so the editor writes whichever spelling the file it opened
// used and only falls back to the operation's own when it is a new one.
//
// imperative marks the operations that work on the previous value of the
// variable rather than on an operand: pushing onto a list is not an equation,
// which is why "var hand = push ${card}" is the one shape people get wrong.
// Their template is the whole sentence rather than what follows "set ... to".
//
// Operands may only be a number, a quoted 'string', null/true/false, [], {} or
// a ${...} reference - a bare word is read as the operator, which is what most
// malformed var steps are. The editor quotes what is typed, so that cannot
// happen here.
const routineComputeGroups = [ 'Math', 'Compare and logic', 'Text', 'Lists', 'Random', 'Color', 'Other' ];

const nullResultNote = 'If this cannot be worked out the variable gets 0 - dividing by zero included.';

const routineComputeOperations = {
  // Math
  '+':  { word: 'plus', template: '{x} {operator} {y}', group: 'Math', note: 'The only operation that reads numeric text as a number - and the one that joins two texts together if either side really is text.' },
  '-':  { word: 'minus', template: '{x} {operator} {y}', group: 'Math', note: nullResultNote },
  '*':  { word: 'times', template: '{x} {operator} {y}', group: 'Math', note: nullResultNote },
  '/':  { word: 'divided by', template: '{x} {operator} {y}', group: 'Math', note: nullResultNote },
  '%':  { word: 'the remainder of', template: '{operator} {x} divided by {y}', group: 'Math', note: nullResultNote },
  '**': { word: 'to the power of', template: '{x} {operator} {y}', group: 'Math' },
  'pow': { word: 'to the power of', template: '{operator} {x} {y}', written: 'prefix', group: 'Math', note: 'The same as **, written the other way round.' },
  'min': { word: 'the smaller of', template: '{operator} {x} and {y}', written: 'prefix', group: 'Math' },
  'max': { word: 'the larger of', template: '{operator} {x} and {y}', written: 'prefix', group: 'Math' },
  'abs': { word: 'the size of', template: '{operator} {x} without its sign', written: 'prefix', group: 'Math' },
  'round': { word: 'rounded', template: '{x} {operator}', written: 'prefix', group: 'Math' },
  'floor': { word: 'rounded down', template: '{x} {operator}', written: 'prefix', group: 'Math' },
  'ceil': { word: 'rounded up', template: '{x} {operator}', written: 'prefix', group: 'Math' },
  'trunc': { word: 'the whole part of', template: '{operator} {x}', written: 'prefix', group: 'Math' },
  'sign': { word: 'the sign of', template: '{operator} {x}', written: 'prefix', group: 'Math', note: 'Answers -1, 0 or 1.' },
  'sqrt': { word: 'the square root of', template: '{operator} {x}', written: 'prefix', group: 'Math' },
  'cbrt': { word: 'the cube root of', template: '{operator} {x}', written: 'prefix', group: 'Math' },
  'exp': { word: 'e to the power of', template: '{operator} {x}', written: 'prefix', group: 'Math' },
  'log': { word: 'the natural log of', template: '{operator} {x}', written: 'prefix', group: 'Math' },
  'log2': { word: 'the log base 2 of', template: '{operator} {x}', written: 'prefix', group: 'Math' },
  'log10': { word: 'the log base 10 of', template: '{operator} {x}', written: 'prefix', group: 'Math' },
  'hypot': { word: 'the length of the line to', template: '{operator} {x}[, {y}]', written: 'prefix', group: 'Math' },
  'sin': { word: 'the sine of', template: '{operator} {x} degrees', written: 'prefix', group: 'Math', note: 'Angles are counted in degrees, not in radians.' },
  'cos': { word: 'the cosine of', template: '{operator} {x} degrees', written: 'prefix', group: 'Math', note: 'Angles are counted in degrees, not in radians.' },
  'tan': { word: 'the tangent of', template: '{operator} {x} degrees', written: 'prefix', group: 'Math', note: 'Angles are counted in degrees, not in radians.' },
  'asin': { word: 'the angle whose sine is', template: '{operator} {x}', written: 'prefix', group: 'Math', note: 'The answer is in degrees, not in radians.' },
  'acos': { word: 'the angle whose cosine is', template: '{operator} {x}', written: 'prefix', group: 'Math', note: 'The answer is in degrees, not in radians.' },
  'atan': { word: 'the angle whose tangent is', template: '{operator} {x}', written: 'prefix', group: 'Math', note: 'The answer is in degrees, not in radians.' },
  'atan2': { word: 'the angle to the point', template: '{operator} {y} across and {x} up', written: 'prefix', group: 'Math', note: 'The first operand is how far up, the second how far across - the other way round from a position. The answer is in degrees.' },
  'toFixed': { word: 'rounded to', template: '{x} {operator} {y} decimal places', group: 'Math', note: 'The answer is text, not a number.' },
  'parseFloat': { word: 'as a number', template: '{x} {operator}', written: 'prefix', group: 'Math', note: 'What turns the text an INPUT number field remembers into a number.' },
  'PI': { word: 'pi', template: '{operator}', written: 'prefix', group: 'Math' },
  'E': { word: "Euler's number e", template: '{operator}', written: 'prefix', group: 'Math' },
  'LN2': { word: 'the natural log of 2', template: '{operator}', written: 'prefix', group: 'Math' },
  'LN10': { word: 'the natural log of 10', template: '{operator}', written: 'prefix', group: 'Math' },
  'LOG2E': { word: 'the log base 2 of e', template: '{operator}', written: 'prefix', group: 'Math' },
  'LOG10E': { word: 'the log base 10 of e', template: '{operator}', written: 'prefix', group: 'Math' },
  'SQRT1_2': { word: 'the square root of a half', template: '{operator}', written: 'prefix', group: 'Math' },
  'SQRT2': { word: 'the square root of 2', template: '{operator}', written: 'prefix', group: 'Math' },

  // Compare and logic
  '==': { word: 'is', template: '{x} {operator} {y}', group: 'Compare and logic', note: 'Text and a number count as the same as long as they read the same, so "3" is 3.' },
  '!=': { word: 'is not', template: '{x} {operator} {y}', group: 'Compare and logic' },
  '===': { word: 'is exactly', template: '{x} {operator} {y}', group: 'Compare and logic', note: 'The same value AND the same kind of value, so "3" is not exactly 3.' },
  '!==': { word: 'is not exactly', template: '{x} {operator} {y}', group: 'Compare and logic' },
  '>': { word: 'is more than', template: '{x} {operator} {y}', group: 'Compare and logic' },
  '>=': { word: 'is at least', template: '{x} {operator} {y}', group: 'Compare and logic' },
  '<': { word: 'is less than', template: '{x} {operator} {y}', group: 'Compare and logic' },
  '<=': { word: 'is at most', template: '{x} {operator} {y}', group: 'Compare and logic' },
  '&&': { word: 'and', template: '{x} {operator} {y}', group: 'Compare and logic', note: 'Answers one of the two values rather than true or false, which only matters if it is stored rather than tested.' },
  '||': { word: 'or', template: '{x} {operator} {y}', group: 'Compare and logic', note: 'Answers one of the two values rather than true or false, which only matters if it is stored rather than tested.' },
  '!': { word: 'not', template: '{operator} {x}', written: 'prefix', group: 'Compare and logic' },

  // Text
  'charAt': { word: 'the character at position', template: '{operator} {y} of {x}', group: 'Text', note: 'The first character is at position 0.' },
  'concat': { word: 'joined with', template: '{x} {operator} {y}', group: 'Text' },
  'length': { word: 'the length of', template: '{operator} {x}', group: 'Text', note: 'Works on a list as well as on a text.' },
  'indexOf': { word: 'the position of', template: '{operator} {y} in {x}', group: 'Text', note: 'Answers -1 when it is not in there at all - and -1 counts as true in a condition.' },
  'lastIndexOf': { word: 'the last position of', template: '{operator} {y} in {x}', group: 'Text', note: 'Answers -1 when it is not in there at all.' },
  'substr': { word: 'the part starting at', template: 'of {x}, {operator} {y}[ for {z} characters]', group: 'Text' },
  'slice': { word: 'the part from', template: 'of {x}, {operator} {y}[ to {z}]', group: 'Text', note: 'The end is not included. Works on a list as well as on a text.' },
  'replaceAll': { word: 'with every', template: '{x} {operator} {y} replaced by {z}', group: 'Text' },
  'replace': { word: 'with the first', template: '{x} {operator} {y} replaced by {z}', group: 'Text' },
  'split': { word: 'split into a list by', template: '{x} {operator} {y}', group: 'Text' },
  'includes': { word: 'contains', template: '{x} {operator} {y}', group: 'Text' },
  'in': { word: 'is inside', template: '{x} {operator} {y}', group: 'Text' },
  'endsWith': { word: 'ends with', template: '{x} {operator} {y}', group: 'Text' },
  'startsWith': { word: 'starts with', template: '{x} {operator} {y}', group: 'Text' },
  'toUpperCase': { word: 'in capitals', template: '{x} {operator}', group: 'Text' },
  'toLowerCase': { word: 'in lower case', template: '{x} {operator}', group: 'Text' },
  'toLocaleUpperCase': { word: 'in capitals for a language', template: '{x} {operator}[, {y}]', group: 'Text' },
  'toLocaleLowerCase': { word: 'in lower case for a language', template: '{x} {operator}[, {y}]', group: 'Text' },
  'trim': { word: 'without the spaces around it', template: '{x} {operator}', group: 'Text' },
  'trimStart': { word: 'without the spaces in front', template: '{x} {operator}', group: 'Text' },
  'trimEnd': { word: 'without the spaces behind', template: '{x} {operator}', group: 'Text' },
  'charCodeAt': { word: 'the character code at position', template: '{operator} {y} of {x}', group: 'Text' },
  'codePointAt': { word: 'the character code point at position', template: '{operator} {y} of {x}', group: 'Text' },
  'padStart': { word: 'padded at the start to', template: '{x} {operator} {y} characters', group: 'Text' },
  'padEnd': { word: 'padded at the end to', template: '{x} {operator} {y} characters', group: 'Text' },
  'repeat': { word: 'repeated', template: '{x} {operator} {y} times', group: 'Text' },
  'localeCompare': { word: 'compared alphabetically with', template: '{x} {operator} {y}', group: 'Text' },
  'match': { word: 'matched against the pattern', template: '{x} {operator} {y}[ with the flags {z}]', group: 'Text', note: 'Answers nothing at all when nothing matches, which the variable then gets as 0.' },
  'search': { word: 'the position matching the pattern', template: 'in {x}, {operator} {y}', group: 'Text' },
  'from': { word: 'as a list of characters', template: '{x} {operator}', written: 'prefix', group: 'Text' },

  // Lists
  'getIndex': { word: 'entry number', template: '{operator} {y} of {x}', group: 'Lists', note: 'The same as writing ${x.$y}. The first entry is number 0.' },
  'isArray': { word: 'is a list', template: '{x} {operator}', written: 'prefix', group: 'Lists' },
  'shuffle': { word: 'shuffled', template: '{x} {operator}', written: 'prefix', group: 'Lists' },
  'join': { word: 'joined into text with', template: '{x} {operator} {y}', group: 'Lists' },
  'reverse': { word: 'reversed', template: '{x} {operator}', group: 'Lists' },
  'sort': { word: 'sorted as text', template: '{x} {operator}', group: 'Lists' },
  'numericSort': { word: 'sorted as numbers', template: '{x} {operator}', group: 'Lists' },
  'numericStringSort': { word: 'sorted naturally', template: '{x} {operator}', group: 'Lists', note: 'Naturally means 2 before 10, where sorting as text puts 10 first.' },
  'concatArray': { word: 'and', template: '{x} {operator} {y} joined into one list', group: 'Lists' },
  'sum': { word: 'added up', template: '{x} {operator}', written: 'prefix', group: 'Lists' },
  'push': { word: 'Add', template: '{operator} {x} to the end of the list {variable}', written: 'prefix', group: 'Lists', imperative: true },
  'unshift': { word: 'Add', template: '{operator} {x} to the start of the list {variable}', written: 'prefix', group: 'Lists', imperative: true },
  'insert': { word: 'Insert', template: '{operator} {x} into the list {variable} at position {y}', written: 'prefix', group: 'Lists', imperative: true },
  'remove': { word: 'Remove', template: '{operator}[ {y}] entries from the list {variable}, starting at position {x}', written: 'prefix', group: 'Lists', imperative: true },
  'setIndex': { word: 'Set entry number', template: '{operator} {x} of {variable} to {y}', written: 'prefix', group: 'Lists', imperative: true, note: 'The same as writing var {variable}.$x = ...' },
  'pop': { word: 'Take the last entry off', template: '{operator} {x} and remember it as {variable}', group: 'Lists', imperative: true },
  'shift': { word: 'Take the first entry off', template: '{operator} {x} and remember it as {variable}', group: 'Lists', imperative: true },

  // Random
  'randInt': { word: 'a whole number between', template: '{operator} {x} and {y}', written: 'prefix', group: 'Random', note: 'Both ends are included, so between 1 and 6 is a die.' },
  'randRange': { word: 'a number from', template: '{operator} {x} up to but not including {y}[, in steps of {z}]', written: 'prefix', group: 'Random' },
  'random': { word: 'a fraction between 0 and 1', template: '{operator}', written: 'prefix', group: 'Random' },

  // Color
  'colorContrast': { word: 'a color that reads well on', template: '{operator} {x}[, {y} as strongly]', written: 'prefix', group: 'Color', note: 'The strength runs from -1 to 1 and defaults to 1 - this is how a game picks black or white text for a background.' },
  'colorLuminance': { word: 'how bright', template: '{operator} {x} is, from 0 to 1', written: 'prefix', group: 'Color' },
  'colorToHex': { word: 'as a hex code', template: '{x} {operator}', written: 'prefix', group: 'Color', note: 'Answers #000000 wherever there is no browser to ask, so a routine running on the server quietly gets black.' },
  'colorToRGB': { word: 'as an rgb() value', template: '{x} {operator}', written: 'prefix', group: 'Color' },
  'colorContrastRatio': { word: 'the contrast between', template: '{operator} {x} and {y}', written: 'prefix', group: 'Color' },
  'colorCreateHue': { word: 'a new color unlike the ones already used', template: '{operator}', written: 'prefix', group: 'Color' },

  // Other
  'jsonStringify': { word: 'written out as JSON text', template: '{x} {operator}', written: 'prefix', group: 'Other' },
  'jsonParse': { word: 'read from JSON text', template: '{x} {operator}', written: 'prefix', group: 'Other' },
  'fetch': { word: 'the web page at', template: '{operator} {x}', written: 'prefix', group: 'Other', note: 'The one operation that waits for the network.' },
  // kept for compatibility with SET and the only operation exempt from the
  // "anything that cannot be worked out becomes 0" guard, so a game that has
  // one still reads what it does - it is never offered
  '=': { word: 'and then', template: '{x} {operator} {y}', group: 'Other', offer: false, note: 'Answers the second value. It exists for compatibility with SET and is the one operation that leaves a result of nothing alone instead of turning it into 0.' }
};

// a timer parameter names one timer, a collection stands for however many it
// holds - the sentence needs a different article for each
function timerTarget(v) {
  return v('timer') != null ? 'the timer {timer,collection}' : '{timer,collection}';
}

// TIMER reads the time from seconds, from value in milliseconds, or from the
// timer property value names. A time is a number of seconds wherever it is said,
// so the sentence says seconds for both numbers - the milliseconds value holds
// are what the editor converts, not what anybody types.
function timerTime(v) {
  if(typeof v('value') == 'string')
    return 'the time in {value}';
  const parameter = v('seconds') ? 'seconds' : 'value';
  const seconds = parameter == 'seconds' ? v('seconds') : (typeof v('value') == 'number' ? v('value')/millisecondsPerSecond : null);
  return `{${parameter}} second${seconds == 1 ? '' : 's'}`;
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

// The same card again after the widget was selected, deselected and selected
// again - like the JSON editor putting its cursor back where it was. The routine
// arrays are new objects then, so the place is remembered instead: which routine
// of which widget (routineKey) and which index in it.
const activeOperationByWidget = {};

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
    // which routine of the widget this level edits ("clickRoutine", or that plus
    // the path into a nested block), so the card worked on last can be found
    // again after the widget was selected anew
    this.routineKey = options.routineKey || '';
    this.widgetID = widget ? (typeof widget.get == 'function' ? widget.get('id') : widget.state.id) : null;
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
    this.restoreActiveOperation();
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
        return buttonDOM;
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
      }, (header && $('.routine-editor-operation-controls-top', header)) || buttonsDOM).classList.add('routine-editor-operation-delete');
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
    if(this.widgetID)
      activeOperationByWidget[this.widgetID] = { routineKey: this.routineKey, index };
    for(const active of $a('.routine-editor-operation-active'))
      active.classList.remove('routine-editor-operation-active');
    const card = this.directChildCards()[index];
    if(card)
      card.classList.add('routine-editor-operation-active');
  }

  isActiveOperation(index) {
    return Boolean(activeRoutineOperation) && activeRoutineOperation.routine === this.routine && activeRoutineOperation.index === index;
  }

  // selecting the widget again builds this level from a fresh routine array, so
  // the card that was worked on last is pointed at anew - which also makes it
  // the one the next added operation follows, exactly as before the widget was
  // left. A card that is gone (the routine got shorter meanwhile) is forgotten.
  restoreActiveOperation() {
    const remembered = this.widgetID && activeOperationByWidget[this.widgetID];
    if(!remembered || remembered.routineKey !== this.routineKey)
      return;
    if(remembered.index >= this.routine.length) {
      delete activeOperationByWidget[this.widgetID];
      return;
    }
    if(!activeRoutineOperation || activeRoutineOperation.routine !== this.routine || activeRoutineOperation.index !== remembered.index)
      activeRoutineOperation = { routine: this.routine, index: remembered.index };
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

  // what a chip opens: a setting whose answers are a handful of phrases is a
  // drop-down in the sentence (the same expander the phrase a sentence starts
  // with opens, one level down), everything else the popup of its own kind
  createPopup(parameterNames) {
    if(this.parameterIsDropDown(parameterNames)) {
      const spec = this.parameterSpec(parameterNames[0]);
      return new RoutineEnumMenu({ values: this.dropDownValues(spec), display: spec.display, otherLabel: spec.otherLabel });
    }
    return this.createFullPopup(parameterNames);
  }

  // the phrases a chip offers in its drop-down: what a setting can be, or - for a
  // number that is almost always one of a few (a FLIP face) - the values worded
  // next to the sentence, with everything else a popup away
  dropDownValues(spec) {
    if(spec && spec.type == 'enum' && Array.isArray(spec.values))
      return spec.values;
    if(spec && spec.menu && Array.isArray(spec.special))
      return spec.special;
    return null;
  }

  // a chip is a drop-down while its parameter is a setting AND holds one of the
  // phrases that setting knows: a value the routine works out while it runs is
  // none of them, and the list would have nothing to show it as
  parameterIsDropDown(parameterNames) {
    if(parameterNames.length != 1)
      return false;
    const values = this.dropDownValues(this.parameterSpec(parameterNames[0]));
    if(!values)
      return false;
    const value = this.parameterValue(parameterNames[0]);
    return values.some(known=>known === value);
  }

  createFullPopup(parameterNames) {
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
      // a scaled parameter's own display words the stored value, while everything
      // in the popup is already in the unit it shows - so the numbers it offers
      // say what they are without being converted a second time
      case 'number':     return new RoutineNumberPopup({ specialValues: spec.special, specialOnly: spec.specialOnly, scale: spec.scale, display: spec.scale ? null : spec.display, textHint: spec.textHint, widgetType: pickerOptions.widgetType });
      case 'enum':       return new RoutineEnumPopup({ values: spec.values, display: spec.display });
      case 'property':   return new RoutinePropertyNamePopup();
      case 'widgets':    return new RoutineWidgetIDPopup(pickerOptions);
      case 'collection': return new RoutineHoldersOrCollectionSourcePopup(pickerOptions);
      case 'json':       return new RoutineJSONPopup();
      case 'keyValue':   return new RoutineKeyValuePopup({ keyHint: spec.keyHint, suggestions: this.parameterKeySuggestions(parameterNames[0]) });
      case 'stringList': return new RoutineStringListPopup({ entryHint: spec.entryHint });
      case 'color':      return new RoutineColorPopup();
      case 'icon':       return new RoutineIconPopup();
      case 'sound':      return new RoutineSoundPopup();
      default:           return new RoutineStringPopup();
    }
  }

  // the names a list of pairs proposes: the variables the operations before this
  // one define, so a VAR that overwrites one of them picks the name instead of
  // spelling it out again
  parameterKeySuggestions(name) {
    const value = this.parameterValue(name);
    const taken = value && typeof value == 'object' ? Object.keys(value) : [];
    return (this.variables || []).filter(variable=>typeof variable == 'string' && taken.indexOf(variable) == -1);
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
      return this.parameterHint(property.split(',')[0]);

    const explicitlySet = this.operation && typeof this.operation == 'object' && typeof this.operation[resolved] != 'undefined';
    const value = explicitlySet ? this.operation[resolved] : this.getDefaults()[resolved];
    const words = this.displayedWords(resolved, value);
    if(words !== null)
      return words;
    // a parameter with no value yet is a blank to fill in, and it says what kind
    // of value belongs there instead of leaving a gap in the sentence
    if(this.parameterIsBlank(property))
      return this.parameterHint(resolved);
    // a value the routine remembers reads as its name: ${...} is the engine's
    // syntax for one, and everything else in the sentence is English - the
    // orange the chip is colored in already says it is a stored value
    if(typeof value == 'string' && value.match(/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/))
      return value.slice(2, -1);
    if(typeof value == 'object' && value !== null)
      return JSON.stringify(value);
    return value;
  }

  // whether the chip stands for a blank rather than for a value: an empty text,
  // an empty list, or a parameter left at a default that only means "not in
  // use". A wording of its own wins - a SELECT without a value looks for
  // "nothing" and a FOREACH over an empty list says so, they are not blank.
  parameterIsBlank(property) {
    const resolved = this.resolveParameter(property);
    if(resolved === null)
      return true;
    const explicitlySet = this.parameterIsSet(resolved);
    const value = explicitlySet ? this.operation[resolved] : this.getDefaults()[resolved];
    if(this.displayedWords(resolved, value) !== null)
      return false;
    // there is no widget called null: a way of working that names the parameter
    // to say it is the one it works with (COUNT holder, MOVE from) leaves a blank
    // to fill in, not the word null
    if(value === null && (this.parameterSpec(resolved) || {}).type == 'widgets')
      return true;
    return value === '' || Array.isArray(value) && !value.length || value === null && !explicitlySet;
  }

  // the one word a blank shows: what the parameter takes, worded by the variant
  // where the way it works says more (what an Increase changes is a value), by
  // the parameter itself where it has its own word, and otherwise by its type
  parameterHint(name) {
    const spec = this.parameterSpec(name) || {};
    const fromVariant = (this.currentVariant().hints || {})[name];
    return fromVariant || spec.hint || (spec.type == 'widgets' && spec.widgetType) || parameterTypeHints[spec.type] || 'value';
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
    const shown = variant || this.currentVariant();
    return this.resolveTemplate(shown.template)
      .replace(/\{\{([a-zA-Z0-9]+)\}\}/g, (_, id)=>{
        // an option that replaces words leaves its own wording behind - the one
        // this way of working has, where several of them share the same id
        const clause = (this.metadata.clauses || []).find(c=>c.id == id && (!c.variants || c.variants.indexOf(shown.id) != -1));
        return clause && clause.whenOff ? this.resolveTemplate(clause.whenOff) : '';
      })
      .replace(templatePlaceholder, (_, p)=>this.getDisplayedValue(p))
      .trim();
  }

  // the whole sentence as one template string, optional parts in [brackets] -
  // every parameter the operation supports is reachable through it, the one an
  // option swaps for another one (CANVAS canvas for its collection) included
  getTemplate() {
    return this.sentenceParts().map(part=>{
      const template = this.resolveTemplate(part.template);
      if(!part.clause)
        return template;
      const whenOff = this.resolveTemplate(part.clause.whenOff || '');
      return `[${template}]${this.templateParameters(whenOff).length ? whenOff : ''}`;
    }).join('');
  }

  // the ways this operation can work, in the order they are matched and offered
  variants() {
    return this.metadata.variants || [];
  }

  // the variant the operation is shown as: the first one whose match() fits it,
  // and otherwise the one that has no match() at all - the fallback is what an
  // operation is when nothing tells it apart, not the last entry of the list,
  // so the drop-down can offer the variants in the order people read them.
  // Together with it: the parameters that decide the answer but only get their
  // value while the routine runs, which is what makes the answer a guess.
  //
  // Finding those needs no table of its own: see undecidableReads.
  variantState() {
    const variants = this.variants();
    const dynamic = [];
    for(const variant of variants) {
      if(!variant.match)
        continue;
      const decided = this.undecidableReads((value, isSet)=>Boolean(variant.match(value, isSet)));
      // wordingOnly names the parameters a variant reads to tell itself from a
      // twin that writes the same operation in other words (SET's Increase and
      // Append are both relation "+"). A reference in one of those leaves the
      // reader with the right card - only the English of it could have gone the
      // other way - so it is not something the sentence has to own up to.
      for(const name of decided.undecidable)
        if((variant.wordingOnly || []).indexOf(name) == -1 && dynamic.indexOf(name) == -1)
          dynamic.push(name);
      if(decided.answer)
        return { variant, dynamic };
    }
    return { variant: variants.find(variant=>!variant.match) || variants[variants.length-1] || { id: 'default', label: this.func, template: String(this.func || '') }, dynamic };
  }

  // What a question about the values of an operation answers, and which of the
  // values it asked about make that answer a guess. Neither needs a table of its
  // own: the question is handed the accessors it reads the values through, so a
  // recording pair of them says what it looked at, and asking it again with the
  // values a ${...} may come out as says whether that would change its mind.
  //
  // Only then is the answer a guess: "is this parameter written down at all" and
  // "is it something rather than nothing" are answered by the reference being
  // there. What the editor cannot know is which of the values a reference will
  // come out as - and that covers the two traps a plain "is it a literal?" test
  // would miss, because any ${...} is a truthy string (so AUDIO would always
  // read as "stop all sounds") and it is always of type string (so a SET adding
  // a computed number would always read as appending text).
  undecidableReads(question) {
    const read = new Set();
    const ask = overrides=>question(name=>{
      read.add(name);
      return Object.prototype.hasOwnProperty.call(overrides, name) ? overrides[name] : this.parameterValue(name);
    }, name=>this.parameterIsSet(name));
    const answer = ask({});
    const answered = JSON.stringify(answer === undefined ? null : answer);
    const undecidable = [];
    const probed = new Set();
    // a question that stops early never read the rest, so what it reads can grow
    // while the values it did read are replaced by the ones they may come out as
    while([ ...read ].some(name=>!probed.has(name))) {
      for(const name of [ ...read ]) {
        if(probed.has(name))
          continue;
        probed.add(name);
        if(!this.parameterIsDynamic(name))
          continue;
        if(this.dynamicProbeValues(name).some(probe=>this.answersDifferently(ask, name, probe, answered)))
          undecidable.push(name);
      }
    }
    return { answer, undecidable };
  }

  answersDifferently(ask, name, probe, answered) {
    try {
      const other = ask({ [name]: probe });
      return JSON.stringify(other === undefined ? null : other) !== answered;
    } catch(e) {
      // a question that cannot be asked about this value says nothing about
      // whether the answer would change
      return false;
    }
  }

  // what a ${...} may come out as: the values the parameter declares where it
  // has a list of them, and otherwise one of each kind of value the engine can
  // hand back. Nothing at all is not among them - a reference is written to name
  // a value, and reading every one of them as possibly missing would turn every
  // "is there one" into a guess.
  dynamicProbeValues(name) {
    const spec = this.parameterSpec(name) || {};
    const declared = [ ...(Array.isArray(spec.values) ? spec.values : []), ...(Array.isArray(spec.special) ? spec.special : []) ];
    return declared.length ? declared : [ 0, 1, 'text', true, false, [] ];
  }

  currentVariant() {
    return this.variantState().variant;
  }

  // the parameters that decide what the operation does and are only worked out
  // while the routine runs - empty while the sentence says what it says for sure
  undeterminedBy() {
    return this.variantState().dynamic;
  }

  // whether the value of a parameter is one the engine works out while the
  // routine runs rather than one the editor can read
  parameterIsDynamic(name) {
    return isDynamicValue(this.parameterValue(name));
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
    return (withoutClauses.match(templatePlaceholder) || []).flatMap(m=>m.slice(1, -1).split(',')).filter(name=>name != 'func');
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

    // what a clause says while it is off is part of the sentence too, so the
    // parameter it words is not one nothing mentions
    // plus the ones the operation says are covered however its sentence reads
    // right now (a VAR words its one pair or lists them, never both)
    // a parameter a way of working decides is spoken for by the sentence that
    // way reads as - unless it holds a ${...}, because then the sentence is a
    // guess and the value it guessed from would be nowhere on the card. What
    // the editor cannot word it shows as it is written instead of hiding it.
    const fixed = (variant.fixed || []).filter(name=>!this.parameterIsDynamic(name));
    const spokenFor = new Set([ ...(this.metadata.spokenFor || []), ...this.templateParameters(variant.template), ...fixed, ...clauses.flatMap(clause=>[ ...this.templateParameters(clause.template), ...this.templateParameters(clause.whenOff || '') ]) ]);
    for(const name in this.metadata.parameters) {
      if(spokenFor.has(name) || Object.prototype.hasOwnProperty.call(ignored, name))
        continue;
      // a parameter nothing offers is still part of the sentence while a game
      // has it - what it is not is a suggestion: a deprecated one (CANVAS canvas)
      // would read as an invitation to use it, and one the editor writes itself
      // (TIMER seconds) as a second way of saying the same thing
      const spec = this.metadata.parameters[name];
      if((spec.offer === false || spec.deprecated) && !this.parameterIsSet(name))
        continue;
      clauses.push({ id: name, label: name, template: `, ${name} {${name}}`, generated: true, offer: spec.offer !== false && !spec.deprecated });
    }
    // the one option no operation declares and every operation has
    if(this.parameterIsSet('skip'))
      clauses.push(skipClause);
    // a custom property the operation does not know about is always part of the
    // sentence: the engine ignores it, but hiding it makes a typo impossible to
    // spot - and its x is how it is removed again
    for(const name of this.unsupportedProperties())
      clauses.push({ id: name, label: name, template: `, ${name} {${name}}`, generated: true, unsupported: true });
    return clauses;
  }

  // an option is in use while one of its parameters is set - unless the clause
  // itself knows better, because the value it is set to means the same as not
  // having it at all (a SET collection of DEFAULT is still the picked widgets)
  clauseIsActive(clause) {
    if(clause.active)
      return clause.active(name=>this.parameterValue(name), name=>this.parameterIsSet(name));
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
    // an option can also switch parameters its own words never name: an INPUT
    // that cannot be canceled is two nulls and no chip at all
    return Object.assign(values, clause.add || {});
  }

  clauseRemoveValues(clause) {
    if(clause.remove)
      return Object.assign({}, clause.remove);
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
    if(typeof this.metadata.ignored != 'function')
      return {};
    const decided = this.undecidableReads((value, isSet)=>this.metadata.ignored(value, isSet) || {});
    // what the engine skips depends on how other parameters are set, and where
    // that is worked out while the routine runs the editor cannot say it is
    // skipped: rather than hide parameters that may well be in use, they all
    // stay in the sentence (an AUDIO whose silence is worked out keeps the sound
    // it plays while that comes out as no)
    return decided.undecidable.length ? {} : decided.answer;
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
    return this.metadata.parameters[name] || (name == 'skip' ? skipParameter : undefined);
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
        const values = await this.editParameter(span, parameterNames, this.createPopup(parameterNames));
        if(values !== undefined) // undefined means the popup was dismissed
          this.onNewValue(values);
      });
    }
    return dom;
  }

  // the popup a chip edits its parameter in, and the hand-over to the full popup
  // when the drop-down of a setting is asked for something it cannot offer
  async editParameter(span, parameterNames, popup) {
    popup.setSource(span);
    popup.setOperationDetails(this.operation, parameterNames, this.widget, this.variables, this.collections);
    const values = await newRoutineValues(popup);
    if(values === routineFullPopupRequest)
      return this.editParameter(span, parameterNames, this.createFullPopup(parameterNames));
    return values;
  }

  // escapeHTML because parameter values come from untrusted room state
  renderParameterChip(spec) {
    const resolved = this.resolveParameter(spec);
    const rawValue = resolved !== null && this.operation && typeof this.operation[resolved] != 'undefined' ? this.operation[resolved] : (resolved !== null ? this.getDefaults()[resolved] : undefined);
    const category = this.classifyParameter(resolved, rawValue);
    const displayed = this.getDisplayedValue(spec);
    const missing = this.parameterIsBlank(spec) ? ' routine-editor-parameter-missing' : '';
    // a setting says so: it carries the same arrow as the phrase the sentence
    // starts with, because it opens the same kind of list of phrases
    const isMenu = this.parameterIsDropDown(spec.split(','));
    const menu = isMenu ? ' routine-editor-parameter-menu' : '';
    const arrow = isMenu ? '<span class="material-symbols">arrow_drop_down</span>' : '';
    const categoryNames = { func: 'operation', variable: 'variable', collection: 'group of widgets', widget: 'widget', property: 'widget property', number: 'number', value: 'value' };
    const title = `${categoryNames[category] || 'value'} - click to change ${spec.split(',').join(' / ')}`;
    return `<span class="routine-editor-operation-parameter routine-editor-parameter-${category}${missing}${menu}" data-parameter="${escapeHTML(spec)}" title="${escapeHTML(title)}">${escapeHTML(displayed)}${arrow}</span>`;
  }

  // the name of the operation, on a line of its own above the sentence: the
  // sentence itself avoids the engine's vocabulary, so this is the one place
  // that keeps the link to what the routine actually stores - and clicking it
  // is how the operation is exchanged for another one
  renderFunctionName(dom) {
    const line = div(dom, 'routine-editor-operation-func');
    const name = document.createElement('span');
    name.className = 'routine-editor-func-name';
    name.textContent = this.func || 'JSON';
    if(this.isKnownFunction()) {
      name.dataset.parameter = 'func';
      name.title = this.functionTitle();
    }
    line.append(name);
    const info = this.functionInfoButton();
    if(info) {
      info.classList.add('routine-editor-func-info');
      line.append(info);
    }
    return line;
  }

  functionTitle() {
    return `${this.func} - click to use another operation here`;
  }

  // whether the name above the sentence is one the editor knows - and with it,
  // whether clicking it offers the others
  isKnownFunction() {
    return Boolean(routineOperationMetadata[this.func]);
  }

  // what the "i" next to the name of an operation says: the wiki text for it,
  // under the same "raw name - what it does" title the parameter popups have
  functionInfoButton() {
    const description = (this.metadata || {}).description;
    return commonInfoButton(null, this.func, description ? `${this.func} - ${description}` : null);
  }

  renderTemplateText(template) {
    return this.resolveTemplate(template).replace(templatePlaceholder, (_, spec)=>this.renderParameterChip(spec));
  }

  // the phrase the sentence starts with. With more than one way to work it is
  // the drop-down that switches between them, so it carries the arrow that says
  // so; with only one it is simply the words the sentence begins with.
  renderVariantLead(lead) {
    const text = lead.replace(/\s+$/, '');
    const trailingSpace = lead.slice(text.length);
    if(!text)
      return lead;
    // the phrase is only what the operation really does while the values that
    // decide it are values: the ! behind it says so, the way a deprecated
    // parameter says so, and the words themselves stay what they are
    const guessed = this.undeterminedBy().length ? ' routine-editor-variant-undetermined' : '';
    if(this.variants().length < 2)
      return `<span class="routine-editor-variant${guessed}">${escapeHTML(text)}</span>${trailingSpace}`;
    const title = `${leadLabel(text)} - click to pick another way for ${this.func} to work`;
    return `<span class="routine-editor-variant routine-editor-variant-menu${guessed}" style="min-width: ${this.variantLeadWidth()}ch" title="${escapeHTML(title)}">${escapeHTML(text)}<span class="material-symbols">arrow_drop_down</span></span>${trailingSpace}`;
  }

  // the drop-down is a field, so it is as wide as the longest phrase it can hold
  // and the rest of the sentence stays where it is while another way to work is
  // picked. A phrase long enough to push the sentence half a card to the right
  // ("Give the turn to the seat at position") keeps its own width instead.
  variantLeadWidth() {
    const lengths = this.variants().map(variant=>this.variantLead(variant).trim().length);
    return Math.min(Math.max(...lengths), 20);
  }

  // an option and the marker that takes it out again. The marker stays with the
  // last value of the clause instead of standing on its own, so a sentence long
  // enough to wrap never breaks between them and starts a line with what looks
  // like a bullet point.
  renderClauseWithRemoveMarker(part) {
    const html = this.renderTemplateText(part.template);
    // an option nothing offers back is an option nobody may take out by
    // accident: the ⊖ on an INPUT's "3 fields" looked like every other one and
    // emptied the whole form, with no way to put it back (see removable below)
    if(part.clause.removable === false)
      return html;
    const marker = `<span class="material-symbols routine-editor-clause-remove" data-clause="${escapeHTML(part.clause.id)}" title="Take this option out of the sentence">do_not_disturb_on</span>`;
    const lastChip = html.lastIndexOf('<span class="routine-editor-operation-parameter');
    if(lastChip == -1)
      return html + marker;
    return `${html.slice(0, lastChip)}<span class="routine-editor-clause-end">${html.slice(lastChip)}${marker}</span>`;
  }

  // the sentence of the current variant, plus the options that are switched on -
  // each with the marker that removes it again - and the button offering the rest
  renderSentenceView(dom) {
    let html = '';
    for(const [ index, part ] of this.sentenceParts().entries()) {
      if(part.clause) {
        if(this.clauseIsActive(part.clause))
          html += `<span class="routine-editor-clause">${this.renderClauseWithRemoveMarker(part)}</span>`;
        else if(part.clause.whenOff)
          // an option that replaces words says what is there without it - which
          // may be another parameter (a CANVAS without the deprecated canvas
          // says which collection it draws on)
          html += this.renderTemplateText(part.clause.whenOff);
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
    if(this.clauses().some(clause=>!this.clauseIsActive(clause) && clause.offer !== false))
      html += `<span class="routine-editor-add-clause" title="Add one of the options this operation offers">add option</span>`;
    // once, on the whole sentence: a comma often starts the option behind the
    // one that ends with a chip, so the two are not in the same string
    dom.innerHTML = tightenPunctuation(html);

    const variantMenu = $('.routine-editor-variant-menu', dom);
    if(variantMenu)
      focusable(variantMenu, async _=>{
        const popup = new RoutineVariantMenu(routineOperationVariantChoices(this.operation), this.currentVariant().id, `What ${this.func || 'this operation'} does`);
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
        // the phrase alone, the way the drop-down of the sentence offers the ways
        // an operation can work: what an option says once it is switched on is
        // the sentence itself, and the sentence is one click away
        const popup = new RoutineClausePopup(this.clauses().filter(clause=>!this.clauseIsActive(clause) && clause.offer !== false).map(clause=>({
          label: clause.label,
          values: this.clauseAddValues(clause)
        })), null, null, `Add an option to ${this.func || 'this operation'}`);
        popup.setSource(addClause);
        popup.setOperationDetails(this.operation, [ 'func' ], this.widget, this.variables, this.collections);
        const values = await newRoutineValues(popup);
        if(values !== undefined)
          this.onNewValue(values);
      });
  }

  // a clickable "!" behind every chip whose parameter needs a word of warning:
  // orange for a deprecated one and red for a custom property the operation does
  // not support at all - and one behind the phrase the sentence starts with
  // while what the operation does is only decided when the routine runs
  renderParameterWarnings(dom) {
    const undetermined = this.undeterminedBy();
    const lead = $('.routine-editor-variant-undetermined', dom);
    if(lead && undetermined.length)
      lead.after(this.parameterWarningButton('undetermined', 'warning', this.undeterminedInfoHTML(undetermined), 'this is only what the operation does for one of the values it may work out - click for details'));
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

  parameterWarningButton(kind, icon, infoHTML, title) {
    const warning = infoButton(null, infoHTML);
    warning.classList.add('routine-editor-parameter-warning', kind);
    $('.material-symbols', warning).textContent = icon;
    warning.title = title || `${kind} - click for details`;
    return warning;
  }

  // what the "!" behind the phrase says: which values decide the operation, what
  // they are written as, and that the sentence reads them as one of the things
  // they may come out as - the value itself is in the sentence as well, so it
  // can be read and changed instead of only being hinted at
  undeterminedInfoHTML(names) {
    // one paragraph per line: the info popup makes a paragraph of every line of
    // a <pre>, so a sentence broken over two of them would be two paragraphs
    const many = names.length > 1;
    const written = names.map(name=>`${name} is written as ${JSON.stringify(this.parameterValue(name))}`).join(', ');
    return `
      <pre>
      What ${escapeHTML(this.func)} does is decided by ${escapeHTML(wordList(names))}, and ${many ? 'those values are' : 'that value is'} only worked out while the routine runs - ${escapeHTML(written)}.
      So this sentence is what the operation does for one of the values ${many ? 'they' : 'it'} may come out as, not what it does for sure.
      ${many ? 'The values are' : 'The value is'} part of the sentence as well, so ${many ? 'they' : 'it'} can be read and changed - and picking another way for this operation to work replaces ${many ? 'them' : 'it'} with a fixed value.
      </pre>
    `;
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
    const known = [ 'func', 'skip', ...Object.keys(this.metadata.parameters), ...this.subroutineProperties() ];
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
      // the place of this block in the widget: the routine it is in, the card it
      // belongs to and which of that card's blocks (see restoreActiveOperation)
      routineKey: this.routineEditor ? `${this.routineEditor.routineKey}/${this.routineEditor.routine.indexOf(this.operation)}/${property}` : '',
      attachRoutine: _=>{ this.operation[property] = routine; }
    };
    const routineEditor = new RoutineEditor(this.widget, routine, this.variables, this.collections, options);
    routineEditor.registerChangeListener(v=>{
      this.operation[property] = v;
      this.notifyChangeListeners(this.operation);
    });
    this.subroutineEditors[property] = routineEditor;
    // the constructor already rendered the block into domElement - rendering it a
    // second time here would do the whole nested subtree twice per level, which
    // is 2^depth renders for a deeply nested routine
    dom.append(routineEditor.domElement);
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
    // both blocks are named, because an unnamed one reads as "the rest of the
    // routine" rather than as what happens while the condition holds - the two
    // look the same on screen, and only the ELSE band told them apart
    const thenLabel = document.createElement('div');
    thenLabel.className = 'routine-editor-else';
    thenLabel.textContent = 'THEN';
    this.domElement.append(thenLabel);
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
    // each way of repeating asks for its own kind of value: a range is three
    // numbers, a list is what it holds - offering both under either one is what
    // let "for each entry" be filled in with a range
    if(parameterNames.length == 1 && (parameterNames[0] == 'range' || parameterNames[0] == 'in'))
      return new RoutineForeachSourcePopup({ range: parameterNames[0] == 'range' });
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

// One line of an INPUT dialog, edited exactly like an operation: the type is
// the name above the sentence (and the way to another kind of line), the words
// come from routineInputFieldMetadata, and every chip, drop-down and option
// works the way it does one level up.
class RoutineInputFieldEditor extends RoutineOperationEditor {
  constructor(type) {
    super(type);
    this.metadata = routineInputFieldMetadata[type] || {
      variants: [ { id: 'unknown', label: String(type), template: `a ${type} line - use the JSON button to edit it` } ],
      parameters: {}
    };
  }

  // the JSON of a field keeps what kind of line it is in type, not in func
  unsupportedProperties() {
    return super.unsupportedProperties().filter(name=>name != 'type');
  }

  isKnownFunction() {
    return Boolean(routineInputFieldMetadata[this.func]);
  }

  functionTitle() {
    return `${this.func} - click to use another kind of line here`;
  }

  // what the "i" of a line says is what the table knows about it: what it is
  // for, and - the thing the JSON never said - what the answer will be
  functionInfoButton() {
    if(!routineInputFieldMetadata[this.func])
      return undefined;
    const answer = this.metadata.answer ? `\n\nThe answer: ${this.metadata.answer}.` : '\n\nThis line only shows something - it collects no answer.';
    return infoButton(null, `<pre>${escapeHTML(this.metadata.description)}.${escapeHTML(answer)}</pre>`, null, null, `the ${this.func} line`);
  }

  createFullPopup(parameterNames) {
    if(parameterNames[0] == 'func')
      return new RoutineClausePopup(routineInputFieldChoices(), `
        The kinds of line a dialog can hold. Three of them only show something - a heading, a subheading, a paragraph - and every other one asks a question and remembers the answer under a name.
      `, 'the lines of a dialog', 'Add a line to this dialog');
    return super.createFullPopup(parameterNames);
  }

  onNewValue(values) {
    // another kind of line: what the old one said does not carry over, because
    // no two kinds keep it under the same keys
    if(typeof values.func == 'string' && values.func != this.func) {
      for(const key in this.operation)
        delete this.operation[key];
      Object.assign(this.operation, newInputField(values.func));
      this.notifyChangeListeners(this.operation);
      return;
    }
    delete values.func;
    // a line without a name throws the answer away, so naming what the player
    // is asked names what is remembered - until somebody says otherwise
    const asked = typeof values.label == 'string' ? values.label : '';
    if(asked && this.metadata.collects !== false && !this.operation.variable && !values.variable)
      values = Object.assign({}, values, { variable: inputFieldVariableName(asked) });
    super.onNewValue(values);
  }
}

// a name for what a line remembers, made out of what it asks: the words of the
// question in the shape a variable name has
function inputFieldVariableName(label) {
  const words = String(label).replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).slice(0, 3);
  if(!words.length || !words[0])
    return '';
  return words.map((word, index)=>index ? word.charAt(0).toUpperCase() + word.slice(1) : word.toLowerCase()).join('');
}

// a freshly added line is nothing but its kind - what it asks and what it
// remembers are the two blanks the sentence then shows in red
function newInputField(type) {
  return { type };
}

// the kinds of line the list offers, each as what it does plus the sentence it
// would read as
function routineInputFieldChoices() {
  return Object.keys(routineInputFieldMetadata).map(type=>{
    const editor = new RoutineInputFieldEditor(type);
    editor.setOperationDetails(null, newInputField(type), [], []);
    return { label: editor.metadata.description, sentence: editor.getExampleWithDefaults(), values: { func: type } };
  });
}

// The lines of an INPUT dialog as the list they are: one card per line with the
// controls an operation card has, and one button that adds another. It is the
// routine editor's list one level down rather than the routine editor itself -
// a line is not an operation, so it neither drags between routines nor nests.
class RoutineInputFieldsEditor {
  constructor(widget, fields, variables=[], collections=[]) {
    this.domElement = document.createElement('div');
    this.domElement.className = 'routine-editor routine-editor-fields';
    this.widget = widget;
    this.fields = fields;
    this.variables = variables;
    this.collections = collections;
    this.changeListeners = [];
    this.render();
  }

  notifyChangeListeners() {
    for(const listener of this.changeListeners)
      listener(this.fields);
  }

  registerChangeListener(listener) {
    this.changeListeners.push(listener);
  }

  fieldsChanged() {
    this.notifyChangeListeners();
    this.render();
  }

  render() {
    this.domElement.innerHTML = '';
    for(const [ index, field ] of this.fields.entries()) {
      const editor = new RoutineInputFieldEditor(field && typeof field == 'object' ? field.type : null);
      editor.setOperationDetails(this.widget, field, this.variables, this.collections);
      editor.registerChangeListener(v=>{
        this.fields[index] = v;
        this.fieldsChanged();
      });
      const fieldDOM = editor.render();
      fieldDOM.classList.add('routine-editor-field');

      const buttons = document.createElement('span');
      buttons.className = 'routine-editor-operation-buttons';
      const header = $('.routine-editor-operation-header', fieldDOM);
      const fieldButton = (icon, title, onClick, appendTo=buttons)=>{
        const buttonDOM = document.createElement('span');
        buttonDOM.className = 'material-symbols';
        buttonDOM.textContent = icon;
        buttonDOM.title = title;
        focusable(buttonDOM, onClick);
        appendTo.append(buttonDOM);
      };
      if(index > 0)
        fieldButton('arrow_upward', 'Move this line up', _=>{
          this.fields.splice(index-1, 0, this.fields.splice(index, 1)[0]);
          this.fieldsChanged();
        });
      if(index < this.fields.length-1)
        fieldButton('arrow_downward', 'Move this line down', _=>{
          this.fields.splice(index+1, 0, this.fields.splice(index, 1)[0]);
          this.fieldsChanged();
        });
      fieldButton('delete', 'Remove this line', _=>{
        this.fields.splice(index, 1);
        this.fieldsChanged();
      }, (header && $('.routine-editor-operation-controls-top', header)) || buttons);
      ((header && $('.routine-editor-operation-controls', header)) || fieldDOM).append(buttons);

      this.domElement.append(fieldDOM);
    }

    if(!this.fields.length)
      div(this.domElement, 'routine-editor-empty').textContent = 'Nothing to fill in yet - the dialog is a message with a button.';

    const addButton = button(this.domElement, 'add line', async _=>{
      const popup = new RoutineClausePopup(routineInputFieldChoices(), `
        The kinds of line a dialog can hold. Three of them only show something - a heading, a subheading, a paragraph - and every other one asks a question and remembers the answer under a name.
      `, 'the lines of a dialog', 'Add a line to this dialog');
      popup.setSource(addButton);
      popup.setOperationDetails({}, [ 'func' ], this.widget, this.variables, this.collections);
      const values = await newRoutineValues(popup);
      if(values !== undefined) {
        this.fields.push(newInputField(values.func));
        this.fieldsChanged();
      }
    });
    addButton.className = 'routine-editor-add-operation';

    return this.domElement;
  }
}

// An INPUT is the one operation whose interesting part is not its parameters:
// what it asks is a form, and a form is a list of lines below the sentence, the
// way an IF has its block below its condition.
class InputRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('INPUT');
  }

  render() {
    super.render();
    // fields may be a value the routine works out (${dialogFields}) rather than a
    // list written down here - the engine resolves the operation before it reads
    // them, so that is a legal INPUT and rendering it must not overwrite it with
    // an empty form. The sentence says what it is instead, and the list below
    // starts out empty without being written until a line is actually added.
    if(this.operation.fields !== undefined && !Array.isArray(this.operation.fields))
      return this.domElement;
    const fields = Array.isArray(this.operation.fields) ? this.operation.fields : [];
    this.fieldsEditor = new RoutineInputFieldsEditor(this.widget, fields, this.variables, this.collections);
    this.fieldsEditor.registerChangeListener(fields=>{
      this.operation.fields = fields;
      this.notifyChangeListeners(this.operation);
    });
    this.domElement.append(this.fieldsEditor.domElement);
    return this.domElement;
  }
}

// What a var statement is allowed to say, in the same grammar the engine parses
// it with (widget.js, the string branch of evaluateRoutine): an operand is a
// number, a quoted 'string', null/true/false, [] or {}, or a ${...} reference -
// and nothing else. A bare word in an operand slot is read as the operator,
// which is what most malformed var statements are.
const varIdentifierPattern = '(?:[a-zA-Z0-9_-]|\\\\u[0-9a-fA-F]{4})+';
const varOperandPattern = `(?:null|true|false|\\[\\]|\\{\\}|-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?|\\$\\{[^}]+\\}|'(?:[ !#-&(-\\[\\]-~]|\\\\u[0-9a-fA-F]{4})*')`;
const varTargetPattern = `\\$?${varIdentifierPattern}(?:\\.\\$?${varIdentifierPattern})?`;
const varOperatorPattern = `(?:${varIdentifierPattern}|[=+*/%<!>&|-]{1,3})`;

// the plain assignment 42% of the library's var statements are, worded as one
// more way of working out a value so that the sentence always has the same
// drop-down in the same place
const varPlainAssignment = { word: 'the value', template: '{operator} {x}' };

// { target, operator, operands, written } for a statement the sentence can say,
// null for one it cannot - a 🧮 dynamic operator, a trailing comment or the
// arithmetic the engine falls back to eval for. Those keep their raw text: how
// they are written decides which code path the engine takes.
function parseVarStatement(statement) {
  if(typeof statement != 'string')
    return null;
  const plain = statement.match(new RegExp(`^var (${varTargetPattern}) += +(${varOperandPattern}) *$`));
  if(plain)
    return { target: plain[1], operator: '', operands: [ plain[2] ], written: 'prefix' };
  const computed = statement.match(new RegExp(`^var (${varTargetPattern}) += +(?:(${varOperandPattern}) +)?(${varOperatorPattern})(?: +(${varOperandPattern}))?(?: +(${varOperandPattern}))?(?: +(${varOperandPattern}))? *$`));
  if(!computed || !routineComputeOperations[computed[3]])
    return null;
  const leading = computed[2];
  const trailing = [ computed[4], computed[5], computed[6] ];
  return {
    target: computed[1],
    operator: computed[3],
    // both spellings end up in the same operand slots (widget.js reads the
    // leading operand as x and the trailing ones as the rest), so which one a
    // file used is only remembered to write it back the way it arrived
    operands: leading !== undefined ? [ leading, trailing[0], trailing[1] ] : trailing,
    written: leading !== undefined ? 'infix' : 'prefix'
  };
}

// the words of an operand: a reference reads as the name it refers to and a
// quoted string as the text somebody typed, the way every other chip does
function decodeVarOperand(raw) {
  if(typeof raw != 'string')
    return null;
  const string = raw.match(/^'([\s\S]*)'$/);
  if(string)
    return string[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, hex)=>String.fromCharCode(parseInt(hex, 16)));
  // a value the routine remembers reads as its name, the way it does in every
  // other sentence - the color of the chip is what says it is a stored value
  const reference = raw.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  return reference ? reference[1] : raw;
}

// and back: what was typed becomes an operand the engine can read. A bare word
// would be read as the operator, so anything that is not already an operand is
// quoted - with the characters the engine's strings cannot hold escaped the way
// it escapes them.
function encodeVarOperand(text) {
  const trimmed = String(text == null ? '' : text).trim();
  if(trimmed === '')
    return undefined;
  if(new RegExp(`^${varOperandPattern}$`).test(trimmed))
    return trimmed;
  return `'${trimmed.replace(/[^ !#-&(-\[\]-~]/g, c=>`\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}'`;
}

// the statement the sentence stands for. A slot before a filled one cannot just
// disappear - it is what puts the ones after it in the right place - so it is
// written as null, which is what the engine reads a missing operand as anyway.
function writeVarStatement(target, operator, operands, written) {
  const parts = [ operands[0], operands[1], operands[2] ];
  while(parts.length && parts[parts.length-1] === undefined)
    parts.pop();
  const filled = parts.map(part=>part === undefined ? 'null' : part);
  if(!operator)
    return `var ${target} = ${filled.length ? filled[0] : 'null'}`;
  const spec = routineComputeOperations[operator] || {};
  const spelling = written || spec.written || 'infix';
  if(spelling == 'infix' && filled.length)
    return `var ${target} = ${[ filled[0], operator, ...filled.slice(1) ].join(' ')}`;
  return `var ${target} = ${[ operator, ...filled ].join(' ')}`;
}

// the parts of a sentence in [brackets] belong to an operand an operation can do
// without (the strength of a colorContrast, the end of a slice), so they are
// only there while that operand is
function varSentenceTemplate(template, hasOperand) {
  return template.replace(/\[([^\]]*)\]/g, (_, part)=>{
    const slots = (part.match(/\{([xyz])\}/g) || []).map(slot=>slot.slice(1, -1));
    return slots.length && slots.every(slot=>!hasOperand(slot)) ? '' : part;
  });
}

// the ways a var statement can work out its value, for the list that offers them
function routineComputeChoices() {
  const choices = [ { operator: '', word: varPlainAssignment.word, group: 'A value of its own', description: 'the value as it is, without working anything out' } ];
  for(const group of routineComputeGroups)
    for(const operator in routineComputeOperations)
      if(routineComputeOperations[operator].group == group && routineComputeOperations[operator].offer !== false)
        choices.push({ operator, word: routineComputeOperations[operator].word, group, description: routineComputeOperations[operator].note || '' });
  return choices;
}

// A `var` statement, worded as what it works out. The plain assignment 42% of
// the library writes is one of the ways rather than a special case, so the
// sentence always has the same drop-down in the same place - and behind it the
// 110 operations compute.js knows, each with the words it is said in.
class VarStringRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('var');
  }

  parsed() {
    return parseVarStatement(this.operation);
  }

  computeSpec() {
    const parsed = this.parsed();
    if(!parsed)
      return null;
    return parsed.operator ? routineComputeOperations[parsed.operator] : varPlainAssignment;
  }

  currentVariant() {
    const parsed = this.parsed();
    const spec = this.computeSpec();
    // a statement the sentence cannot say keeps its raw text: a 🧮 operator, a
    // trailing comment and the arithmetic the engine falls back to eval for all
    // stop being what they are as soon as they are rewritten
    if(!parsed || !spec)
      return { id: 'raw', label: 'var', template: '{statement}' };
    const hasOperand = slot=>parsed.operands[[ 'x', 'y', 'z' ].indexOf(slot)] !== undefined;
    const phrase = varSentenceTemplate(spec.template, hasOperand);
    return {
      id: parsed.operator || 'value',
      label: 'var',
      template: spec.imperative ? phrase : `Set the variable {variable} to ${phrase}`
    };
  }

  // the operation is a drop-down of phrases like every other setting, only that
  // its list is long enough to need a search box of its own
  createPopup(parameterNames) {
    if(parameterNames[0] == 'operator')
      return new RoutineComputeOperationPopup(routineComputeChoices(), (this.parsed() || {}).operator);
    return new RoutineStringPopup();
  }

  createFullPopup(parameterNames) {
    return this.createPopup(parameterNames);
  }

  // a popup edits one part of a statement, so it is handed that part rather
  // than the string the whole statement is
  async editParameter(span, parameterNames, popup) {
    const name = parameterNames[0];
    const current = {};
    // an operand is edited as what it is written as, not as the name the chip
    // shows it under: typing a bare word means a text, and ${score} means the
    // value the routine remembers - the difference has to stay visible here
    if([ 'x', 'y', 'z' ].indexOf(name) != -1)
      current[name] = this.rawOperand(name);
    else if(!this.parameterIsBlank(name))
      current[name] = this.getDisplayedValue(name);
    popup.setSource(span);
    popup.setOperationDetails(current, parameterNames, this.widget, this.variables, this.collections);
    const values = await newRoutineValues(popup);
    if(values === routineFullPopupRequest)
      return this.editParameter(span, parameterNames, this.createFullPopup(parameterNames));
    return values;
  }

  classifyParameter(name) {
    if(name == 'variable')
      return 'variable';
    if(name == 'operator')
      return 'func';
    const raw = this.rawOperand(name);
    if(typeof raw == 'string' && raw.match(/^\$\{PROPERTY /))
      return 'property';
    if(typeof raw == 'string' && raw.match(/^\$\{/))
      return 'variable';
    if(typeof raw == 'string' && raw.match(/^-?[0-9]/))
      return 'number';
    return 'value';
  }

  // the operation is picked from a list of phrases, so its chip carries the
  // arrow that says so - the operands are values and open a value popup
  parameterIsDropDown(parameterNames) {
    return parameterNames.length == 1 && parameterNames[0] == 'operator';
  }

  rawOperand(name) {
    const parsed = this.parsed();
    const slot = [ 'x', 'y', 'z' ].indexOf(name);
    return parsed && slot != -1 ? parsed.operands[slot] : undefined;
  }

  getDefinedVariables() {
    const parsed = this.parsed();
    if(parsed)
      return [ parsed.target.replace(/^\$/, '').split('.')[0] ];
    const match = typeof this.operation == 'string' && this.operation.match(/^var \$?([^\s.]+)/);
    return match ? [ match[1] ] : [];
  }

  getDisplayedValue(property) {
    if(property == 'statement')
      return String(this.operation);
    const parsed = this.parsed();
    if(property == 'variable')
      return parsed ? parsed.target : 'variable';
    if(property == 'operator') {
      const spec = this.computeSpec();
      return spec ? spec.word : 'operation';
    }
    const raw = this.rawOperand(property);
    return raw === undefined ? 'value' : decodeVarOperand(raw);
  }

  // a slot with nothing in it says what belongs there, in red, like every other
  // blank in the editor
  parameterIsBlank(property) {
    if([ 'x', 'y', 'z' ].indexOf(property) != -1)
      return this.rawOperand(property) === undefined;
    return property == 'variable' && !this.parsed();
  }

  getExampleWithDefaults() {
    return 'Set the variable x to the value 1';
  }

  // what the "i" of a var statement says: the words of the operation it uses,
  // and the thing about it that the JSON never said
  functionInfoButton() {
    const parsed = this.parsed();
    const spec = parsed && parsed.operator && routineComputeOperations[parsed.operator];
    if(!spec)
      return commonInfoButton(null, 'var');
    return infoButton(null, `<pre>${escapeHTML(`${parsed.operator} - ${spec.word}.${spec.note ? `\n\n${spec.note}` : ''}\n\nSee [var] for how a var statement is written.`)}</pre>`, null, null, `var ${parsed.operator}`);
  }

  onNewValue(values) {
    // the operation is a string like "var x = 1", so rebuild it instead of
    // assigning object keys
    if(typeof values.statement == 'string') {
      this.notifyChangeListeners(values.statement);
      return;
    }
    const parsed = this.parsed() || { target: 'x', operator: '', operands: [], written: null };
    const has = name=>Object.prototype.hasOwnProperty.call(values, name);
    const target = has('variable') && String(values.variable || '').trim() ? String(values.variable).trim() : parsed.target;
    const operator = has('operator') ? values.operator : parsed.operator;
    const operands = [ parsed.operands[0], parsed.operands[1], parsed.operands[2] ];
    for(const [ slot, name ] of [ 'x', 'y', 'z' ].entries())
      if(has(name))
        operands[slot] = encodeVarOperand(values[name]);
    // a plain assignment holds its value in the first slot, so switching to it
    // keeps what was worked out with rather than starting over
    this.notifyChangeListeners(writeVarStatement(target, operator, operands, has('operator') ? null : parsed.written));
  }
}

// The VAR whose sentence says the one pair it has: variableName and variableValue
// are not properties the engine knows, they are the two halves of the first (and
// usually only) entry of variables, so everything a chip needs - what it shows,
// whether it is a blank, what a popup starts with and what an answer writes -
// goes through that object.
class VarSetRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('VAR');
  }

  pairs() {
    const variables = this.operation && this.operation.variables;
    return variables && typeof variables == 'object' && !Array.isArray(variables) ? Object.entries(variables) : [];
  }

  isPairHalf(name) {
    return name == 'variableName' || name == 'variableValue';
  }

  classifyParameter(name, value) {
    // the name of a remembered value is one, whatever it is called here
    if(name == 'variableName')
      return 'variable';
    return super.classifyParameter(name, value);
  }

  getDisplayedValue(property) {
    if(!this.isPairHalf(property))
      return super.getDisplayedValue(property);
    const pair = this.pairs()[0];
    if(!pair)
      return this.parameterHint(property);
    if(property == 'variableName')
      return pair[0];
    return pair[1] !== null && typeof pair[1] == 'object' ? JSON.stringify(pair[1]) : String(pair[1]);
  }

  parameterIsBlank(property) {
    if(this.isPairHalf(property))
      return !this.pairs().length;
    return super.parameterIsBlank(property);
  }

  async editParameter(span, parameterNames, popup) {
    const name = parameterNames[0];
    if(!this.isPairHalf(name))
      return super.editParameter(span, parameterNames, popup);
    const pair = this.pairs()[0];
    const current = pair ? { [name]: name == 'variableName' ? pair[0] : pair[1] } : {};
    popup.setSource(span);
    popup.setOperationDetails(current, parameterNames, this.widget, this.variables, this.collections);
    const values = await newRoutineValues(popup);
    if(values === routineFullPopupRequest)
      return this.editParameter(span, parameterNames, this.createFullPopup(parameterNames));
    return values;
  }

  onNewValue(values) {
    const has = name=>Object.prototype.hasOwnProperty.call(values, name);
    if(!has('variableName') && !has('variableValue') && !has('anotherVariable'))
      return super.onNewValue(values);
    const pairs = this.pairs();
    const variables = {};
    for(const [ index, [ key, value ] ] of pairs.entries()) {
      const name = index === 0 && has('variableName') && String(values.variableName || '').trim() ? String(values.variableName).trim() : key;
      variables[name] = index === 0 && has('variableValue') ? values.variableValue : value;
    }
    if(!pairs.length)
      variables[has('variableName') && String(values.variableName || '').trim() ? String(values.variableName).trim() : 'variable'] = has('variableValue') ? values.variableValue : '';
    // one more pair, with a name to fill in: the list the rows edit
    if(has('anotherVariable')) {
      let name = 'variable';
      for(let index = 2; typeof variables[name] != 'undefined'; index++)
        name = `variable${index}`;
      variables[name] = '';
    }
    this.operation.variables = variables;
    this.notifyChangeListeners(this.operation);
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

  // the whole operation is unknown, so singling out properties makes no sense -
  // its own skip included, which the raw JSON already shows
  clauses() {
    return [];
  }

  unsupportedProperties() {
    return [];
  }

  onNewValue(values) {
    // the popup edits the entire operation, so replace it instead of merging
    // keys - the ones it cleared are the ones the new JSON no longer has
    if(values && typeof values == 'object')
      for(const key in values)
        if(values[key] === undefined)
          delete values[key];
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
    if(operation.func == 'INPUT')
      return new InputRoutineOperationEditor();
    if(operation.func == 'VAR')
      return new VarSetRoutineOperationEditor();
    return new RoutineOperationEditor(operation.func);
  }
  return new UnknownRoutineOperationEditor();
}

// The kinds of thing an operation does, for the list that offers them grouped
// instead of alphabetically. Every operation belongs to exactly one group and
// the groups are worded as what somebody is looking for ("I want to move
// something"), not as the part of the engine they belong to.
const routineOperationGroups = [
  { title: 'Pick widgets and work out values', funcs: [ 'SELECT', 'COUNT', 'GET', 'VAR', 'var' ] },
  { title: 'Move and order widgets', funcs: [ 'MOVE', 'MOVEXY', 'RECALL', 'SWAPHANDS', 'SHUFFLE', 'SORT' ] },
  { title: 'Add, change and remove widgets', funcs: [ 'SET', 'FLIP', 'ROTATE', 'LABEL', 'CANVAS', 'CLONE', 'DELETE', 'RESET' ] },
  { title: 'The game and its players', funcs: [ 'SCORE', 'TURN', 'TIMER' ] },
  { title: 'Talk to the players', funcs: [ 'AUDIO', 'INPUT', 'UPLOAD' ] },
  { title: 'Steer the routine', funcs: [ 'IF', 'FOREACH', 'CALL', 'CLICK', 'DELAY', '//' ] }
];

// the group an operation is in, so an operation added to the engine without
// being sorted into one is still offered rather than dropped from the list
function routineOperationGroup(func) {
  const group = routineOperationGroups.find(group=>group.funcs.indexOf(func) != -1);
  return group ? group.title : 'Other operations';
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
  examples.push({ func: 'var', description: 'Work out a value and remember it', example: 'Set the variable x to the value 1', newOperation: 'var x = 1' });
  // "//" alone is punctuation rather than a name, so the list says what it is
  examples.push({ func: '//', label: '// Comment', description: 'Add a note for whoever reads the routine', example: 'A note for whoever reads the routine', newOperation: '// comment' });
  for(const example of examples)
    example.group = routineOperationGroup(example.func);
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

// picking a way of working rewrites the parameters that tell the ways apart, and
// one of them may hold a ${...} the game works out while the routine runs - a
// reference nothing in the room writes a second time. Whichever entry is picked
// (the one the sentence already reads as included, because that one is a guess
// too), that reference is gone, so the entry says what it replaces instead of
// swallowing it without a word.
function variantChoiceReplacements(operation, values) {
  if(!operation || typeof operation != 'object')
    return [];
  return Object.keys(operation).filter(name=>isDynamicValue(operation[name]) && values[name] !== operation[name]).map(name=>`${name} ${operation[name]}`);
}

// the ways the operation can work, each worded as the phrase its sentence would
// start with - that is what the drop-down at the start of the sentence offers.
// Operations with only one way to work (DELAY, INPUT, ...) have nothing to
// choose here, so their phrase is plain text instead of a drop-down.
function routineOperationVariantChoices(operation) {
  const metadata = routineOperationMetadata[operation && operation.func];
  if(!metadata || (metadata.variants || []).length < 2)
    return [];
  const choices = metadata.variants.map(variant=>{
    const preview = Object.assign({}, operation);
    if(variant.apply)
      variant.apply(preview);
    const editor = editorForOperation(preview);
    editor.setOperationDetails(null, preview, [], []);
    const values = operationVariantValues(operation, variant);
    return { id: variant.id, lead: leadLabel(editor.variantLead(variant)), label: variant.label, example: editor.getExampleWithDefaults(variant), values, replaces: variantChoiceReplacements(operation, values) };
  });
  // two ways of working whose sentences start with the same word (MOVE says
  // "Move" either way) are told apart by what they are called instead: the same
  // phrase twice is a list that offers no choice
  const shared = choices.filter(choice=>choices.filter(other=>other.lead == choice.lead).length > 1);
  for(const choice of shared)
    choice.lead = choice.label;
  return choices;
}
