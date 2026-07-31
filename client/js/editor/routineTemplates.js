// Data model behind the beginner friendly routine builder that the Automations
// section of the Edit Widgets module renders (see issue #3078).
//
// A step card's sentence is composed, not looked up. Every operation gets:
//   * a small table of VARIANTS - the leading verb of the sentence. Picking a
//     different verb rewrites the parameters and the sentence together, so the
//     user never picks "the relation parameter", they pick another sentence.
//   * a list of optional CLAUSES - one phrase each, which only appears while
//     its parameter is set and vanishes together with it.
// Rendering picks the first matching variant. An operation that no variant
// matches, or that carries a parameter this table does not know, renders as a
// read only advanced card so nothing is ever lost or misrepresented.
//
// Every user facing string lives in routineBuilderStrings so the whole builder
// can be translated from a single table.

const routineBuilderStrings = {
  'ui.addAutomation': 'Add automation',
  'ui.addStep': 'Add step',
  'ui.customRoutine': 'Custom name...',
  'ui.customRoutinePrompt': 'Name of the new automation (without the "Routine" ending):',
  'ui.deleteRoutine': 'Remove this automation',
  'ui.editInJSON': 'Edit in JSON editor',
  'ui.emptyRoutine': 'No steps yet.',
  'ui.moveDown': 'Move down',
  'ui.moveUp': 'Move up',
  'ui.noteAdd': 'Add a note',
  'ui.notePlaceholder': 'Note for yourself',
  'ui.optionAdd': 'Add option',
  'ui.optionRemove': 'Remove this option',
  'ui.pickWidget': 'Select a widget',
  'ui.removeStep': 'Remove this step',
  'ui.stepCount': '{count} steps',
  'ui.stepCountOne': '1 step',
  'ui.unsupported': 'This step uses options the builder does not know yet. It runs unchanged - open the JSON editor to edit it.',
  'ui.useValue': 'a value',
  'ui.valueOfVariable': 'the saved value {name}',

  'pick.default': 'the picked widgets',
  'pick.named': 'the widgets called {name}',
  'pick.custom': 'another name...',
  'pick.holder': 'the holder',
  'pick.widget': 'the widget',
  'pick.customPrompt': 'Name of the group of widgets:',

  'category.cards': 'Cards and pieces',
  'category.pick': 'Picking and counting',
  'category.change': 'Changing things',
  'category.flow': 'Reusing routines',

  'routine.clickRoutine': 'When this is clicked',
  'routine.doubleClickRoutine': 'When this is double clicked',
  'routine.changeRoutine': 'When this changes',
  'routine.enterRoutine': 'When a widget is dropped into this',
  'routine.leaveRoutine': 'When a widget is taken out of this',
  'routine.globalUpdateRoutine': 'When anything in the game changes',
  'routine.custom': 'Reusable action: {name}',
  'routine.propertyChange': 'When {name} changes',

  'op.MOVE': 'Move cards',
  'op.FLIP': 'Flip cards',
  'op.SHUFFLE': 'Shuffle',
  'op.RECALL': 'Gather cards back',
  'op.SELECT': 'Pick widgets',
  'op.COUNT': 'Count widgets',
  'op.GET': 'Read a property',
  'op.SET': 'Change a property',
  'op.LABEL': 'Change a text',
  'op.CLICK': 'Click widgets',
  'op.CALL': 'Run another automation',

  'verb.MOVE.fromHolder': 'Move cards from a holder',
  'verb.MOVE.fromPick': 'Move the picked widgets',
  'variant.MOVE.fromHolder': 'Move {count} from {from} to {to}',
  'variant.MOVE.fromPick': 'Move {which} to {to}',
  'clause.MOVE.count': 'at most {count} of them',
  'clause.MOVE.face': 'and turn them to face {face}',
  'clause.MOVE.fillTo': 'but only until the target holds {fillTo}',

  'verb.FLIP.over': 'Flip over',
  'verb.FLIP.up': 'Turn face up',
  'verb.FLIP.down': 'Turn face down',
  'verb.FLIP.toFace': 'Turn to a specific face',
  'verb.FLIP.cycle': 'Cycle through the faces',
  'variant.FLIP.over': 'Flip {which} over',
  'variant.FLIP.up': 'Turn {which} face up',
  'variant.FLIP.down': 'Turn {which} face down',
  'variant.FLIP.toFace': 'Turn {which} to face {face}',
  'variant.FLIP.cycle': 'Cycle the face of {which} {faceCycle}',
  'clause.FLIP.count': 'but only the first {count}',
  'enum.FLIP.faceCycle.forward': 'forwards',
  'enum.FLIP.faceCycle.backward': 'backwards',
  'enum.FLIP.faceCycle.random': 'randomly',

  'variant.SHUFFLE.shuffle': 'Shuffle {which}',
  'clause.SHUFFLE.mode': 'the {mode} way',
  'clause.SHUFFLE.modeValue': 'repeated {modeValue} times',
  'enum.SHUFFLE.mode.overhand': 'overhand',
  'enum.SHUFFLE.mode.reverse': 'reversing',
  'enum.SHUFFLE.mode.riffle': 'riffle',
  'enum.SHUFFLE.mode.seeded': 'seeded random',
  'enum.SHUFFLE.mode.true random': 'truly random',

  'variant.RECALL.recall': 'Gather all cards back into {holder}',
  'clause.RECALL.owned': 'but leave the cards players own where they are',
  'clause.RECALL.inHolder': 'but only pick up cards lying loose on the table',
  'clause.RECALL.byDistance': 'taking the nearest cards first',
  'clause.RECALL.excludeCollection': 'except {excludeCollection}',

  'verb.SELECT.set': 'Pick widgets',
  'verb.SELECT.add': 'Add widgets to the pick',
  'verb.SELECT.remove': 'Remove widgets from the pick',
  'verb.SELECT.intersect': 'Narrow the pick down',
  'variant.SELECT.set': 'Pick {type} widgets',
  'variant.SELECT.add': 'Add {type} widgets to the pick',
  'variant.SELECT.remove': 'Remove {type} widgets from the pick',
  'variant.SELECT.intersect': 'Narrow the pick down to {type} widgets',
  'clause.SELECT.where': 'where {property} {relation} {value}',
  'clause.SELECT.source': 'out of {source}',
  'clause.SELECT.max': 'at most {max} of them',
  'clause.SELECT.random': 'chosen at random',
  'clause.SELECT.sortBy': 'sorted by {sortBy}',
  'clause.SELECT.collection': 'and call them {collection}',
  'enum.SELECT.relation.<': 'is less than',
  'enum.SELECT.relation.<=': 'is at most',
  'enum.SELECT.relation.==': 'is',
  'enum.SELECT.relation.===': 'is exactly',
  'enum.SELECT.relation.!=': 'is not',
  'enum.SELECT.relation.>=': 'is at least',
  'enum.SELECT.relation.>': 'is more than',
  'enum.SELECT.relation.in': 'is one of',

  'verb.COUNT.pick': 'Count the picked widgets',
  'verb.COUNT.holder': 'Count what is in a holder',
  'verb.COUNT.owner': 'Count what a player owns',
  'variant.COUNT.pick': 'Count {which} and remember it as {variable}',
  'variant.COUNT.holder': 'Count what is in {holder} and remember it as {variable}',
  'variant.COUNT.owner': 'Count the widgets owned by {owner} and remember it as {variable}',

  'verb.GET.first': 'Read the first one',
  'verb.GET.last': 'Read the last one',
  'verb.GET.sum': 'Add them up',
  'verb.GET.average': 'Average them',
  'verb.GET.median': 'Take the median',
  'verb.GET.min': 'Take the smallest',
  'verb.GET.max': 'Take the biggest',
  'verb.GET.array': 'Collect them all',
  'variant.GET.first': 'Read {property} of {which} and remember it as {variable}',
  'variant.GET.last': 'Read {property} of the last of {which} and remember it as {variable}',
  'variant.GET.sum': 'Add up {property} of {which} and remember it as {variable}',
  'variant.GET.average': 'Average {property} of {which} and remember it as {variable}',
  'variant.GET.median': 'Take the median {property} of {which} and remember it as {variable}',
  'variant.GET.min': 'Take the smallest {property} of {which} and remember it as {variable}',
  'variant.GET.max': 'Take the biggest {property} of {which} and remember it as {variable}',
  'variant.GET.array': 'Collect {property} of all of {which} and remember it as {variable}',
  'clause.GET.skipMissing': 'ignoring widgets that do not have it',

  'verb.SET.set': 'Set it',
  'verb.SET.inc': 'Increase it',
  'verb.SET.dec': 'Decrease it',
  'verb.SET.mul': 'Multiply it',
  'verb.SET.div': 'Divide it',
  'verb.SET.toggle': 'Switch it on or off',
  'verb.SET.append': 'Add text to it',
  'variant.SET.set': 'Set {property} of {which} to {value}',
  'variant.SET.inc': 'Increase {property} of {which} by {value}',
  'variant.SET.dec': 'Decrease {property} of {which} by {value}',
  'variant.SET.mul': 'Multiply {property} of {which} by {value}',
  'variant.SET.div': 'Divide {property} of {which} by {value}',
  'variant.SET.toggle': 'Switch {property} of {which} on or off',
  'variant.SET.append': 'Append {value} to {property} of {which}',

  'verb.LABEL.set': 'Set the text',
  'verb.LABEL.inc': 'Increase the number',
  'verb.LABEL.dec': 'Decrease the number',
  'verb.LABEL.append': 'Append text',
  'variant.LABEL.set': 'Set the text of {which} to {value}',
  'variant.LABEL.inc': 'Increase {which} by {value}',
  'variant.LABEL.dec': 'Decrease {which} by {value}',
  'variant.LABEL.append': 'Append {value} to the text of {which}',

  'variant.CLICK.click': 'Click {count} of {which}',
  'clause.CLICK.mode': 'and {mode}',
  'enum.CLICK.mode.respect': 'respect their settings',
  'enum.CLICK.mode.ignoreClickable': 'click them even if they are not clickable',
  'enum.CLICK.mode.ignoreClickRoutine': 'do not run their own click automation',
  'enum.CLICK.mode.ignoreAll': 'ignore both clickable and their own click automation',

  'variant.CALL.call': 'Run the automation {routine}',
  'clause.CALL.widget': 'of the widget {widget}',
  'clause.CALL.variable': 'and remember its result as {variable}',
  'clause.CALL.return': 'without waiting for a result'
};

function routineBuilderText(key, replacements) {
  let text = routineBuilderStrings[key];
  if(text === undefined)
    return key;
  for(const name in replacements || {})
    text = text.split(`{${name}}`).join(replacements[name]);
  return text;
}

// widget types offered by the "which kind of widget" chips
const routineBuilderWidgetTypes = [ 'all', 'basic', 'button', 'canvas', 'card', 'deck', 'dice', 'holder', 'label', 'line', 'pile', 'scoreboard', 'seat', 'spinner', 'timer' ];

// The eleven operations agreed for the first version. They cover 77% of all
// operations used by the games in library/.
const routineBuilderOperations = {
  MOVE: {
    template: { func: 'MOVE', from: '', to: '', count: 1 },
    variants: [
      {
        id: 'fromHolder',
        match: op=>op.from !== undefined,
        apply: op=>{ delete op.collection; if(op.from === undefined) op.from = ''; if(op.to === undefined) op.to = ''; },
        fields: [
          { name: 'count', key: 'count', kind: 'countOrAll', fallback: 1 },
          { name: 'from', key: 'from', kind: 'widget', typeFilter: 'holder' },
          { name: 'to', key: 'to', kind: 'widget', typeFilter: 'holder' }
        ]
      },
      {
        id: 'fromPick',
        match: op=>op.from === undefined,
        apply: op=>{ delete op.from; delete op.count; if(op.to === undefined) op.to = ''; },
        fields: [
          { name: 'which', key: 'collection', kind: 'pick' },
          { name: 'to', key: 'to', kind: 'widget', typeFilter: 'holder' }
        ]
      }
    ],
    clauses: [
      { id: 'count', variants: [ 'fromPick' ], fields: [ { name: 'count', key: 'count', kind: 'countOrAll', fallback: 1 } ] },
      { id: 'face', fields: [ { name: 'face', key: 'face', kind: 'number', fallback: 0 } ] },
      { id: 'fillTo', fields: [ { name: 'fillTo', key: 'fillTo', kind: 'number', fallback: 1 } ] }
    ]
  },

  FLIP: {
    template: { func: 'FLIP', face: 0 },
    keys: [ 'face', 'faceCycle' ],
    variants: [
      { id: 'cycle', match: op=>op.faceCycle !== undefined && op.faceCycle !== null,
        apply: op=>{ delete op.face; op.faceCycle = op.faceCycle || 'forward'; },
        fields: [ { name: 'which', key: '', kind: 'holderOrPick' }, { name: 'faceCycle', key: 'faceCycle', kind: 'enum', values: [ 'forward', 'backward', 'random' ], fallback: 'forward' } ] },
      { id: 'up', match: op=>op.face === 0, apply: op=>{ delete op.faceCycle; op.face = 0; },
        fields: [ { name: 'which', key: '', kind: 'holderOrPick' } ] },
      { id: 'down', match: op=>op.face === 1, apply: op=>{ delete op.faceCycle; op.face = 1; },
        fields: [ { name: 'which', key: '', kind: 'holderOrPick' } ] },
      { id: 'toFace', match: op=>typeof op.face === 'number', apply: op=>{ delete op.faceCycle; op.face = 2; },
        fields: [ { name: 'which', key: '', kind: 'holderOrPick' }, { name: 'face', key: 'face', kind: 'number', fallback: 0 } ] },
      { id: 'over', match: op=>op.face === undefined || op.face === null, apply: op=>{ delete op.faceCycle; delete op.face; },
        fields: [ { name: 'which', key: '', kind: 'holderOrPick' } ] }
    ],
    clauses: [
      { id: 'count', fields: [ { name: 'count', key: 'count', kind: 'countOrAll', fallback: 1 } ] }
    ]
  },

  SHUFFLE: {
    template: { func: 'SHUFFLE' },
    variants: [
      { id: 'shuffle', match: _=>true, apply: _=>{},
        fields: [ { name: 'which', key: '', kind: 'holderOrPick' } ] }
    ],
    clauses: [
      { id: 'mode', fields: [ { name: 'mode', key: 'mode', kind: 'enum', values: [ 'overhand', 'reverse', 'riffle', 'seeded', 'true random' ], fallback: 'overhand' } ] },
      { id: 'modeValue', fields: [ { name: 'modeValue', key: 'modeValue', kind: 'number', fallback: 1 } ] }
    ]
  },

  RECALL: {
    template: { func: 'RECALL', holder: '' },
    variants: [
      { id: 'recall', match: _=>true, apply: op=>{ if(op.holder === undefined) op.holder = ''; },
        fields: [ { name: 'holder', key: 'holder', kind: 'widget', typeFilter: 'holder' } ] }
    ],
    clauses: [
      { id: 'owned', key: 'owned', isSet: op=>op.owned === false, add: op=>{ op.owned = false; }, fields: [] },
      { id: 'inHolder', key: 'inHolder', isSet: op=>op.inHolder === false, add: op=>{ op.inHolder = false; }, fields: [] },
      { id: 'byDistance', key: 'byDistance', isSet: op=>op.byDistance === true, add: op=>{ op.byDistance = true; }, fields: [] },
      { id: 'excludeCollection', fields: [ { name: 'excludeCollection', key: 'excludeCollection', kind: 'pick' } ] }
    ]
  },

  SELECT: {
    template: { func: 'SELECT', type: 'all', property: 'id', value: '' },
    keys: [ 'mode' ],
    variants: [
      { id: 'set', match: op=>op.mode === undefined || op.mode === 'set', apply: op=>{ delete op.mode; }, fields: [ { name: 'type', key: 'type', kind: 'widgetType', fallback: 'all' } ] },
      { id: 'add', match: op=>op.mode === 'add', apply: op=>{ op.mode = 'add'; }, fields: [ { name: 'type', key: 'type', kind: 'widgetType', fallback: 'all' } ] },
      { id: 'remove', match: op=>op.mode === 'remove', apply: op=>{ op.mode = 'remove'; }, fields: [ { name: 'type', key: 'type', kind: 'widgetType', fallback: 'all' } ] },
      { id: 'intersect', match: op=>op.mode === 'intersect', apply: op=>{ op.mode = 'intersect'; }, fields: [ { name: 'type', key: 'type', kind: 'widgetType', fallback: 'all' } ] }
    ],
    clauses: [
      { id: 'where', key: 'property',
        isSet: op=>op.property !== undefined,
        add: op=>{ op.property = 'id'; if(op.value === undefined) op.value = ''; },
        remove: op=>{ delete op.property; delete op.relation; delete op.value; },
        fields: [
          { name: 'property', key: 'property', kind: 'property', fallback: 'id' },
          { name: 'relation', key: 'relation', kind: 'enum', values: [ '<', '<=', '==', '===', '!=', '>=', '>', 'in' ], fallback: '==' },
          { name: 'value', key: 'value', kind: 'value', fallback: '' }
        ] },
      { id: 'source', fields: [ { name: 'source', key: 'source', kind: 'pick', fallback: 'DEFAULT' } ] },
      { id: 'max', fields: [ { name: 'max', key: 'max', kind: 'number', fallback: 1 } ] },
      { id: 'random', key: 'random', isSet: op=>op.random === true, add: op=>{ op.random = true; }, fields: [] },
      { id: 'sortBy', fields: [ { name: 'sortBy', key: 'sortBy', kind: 'property', fallback: 'value' } ] },
      { id: 'collection', fields: [ { name: 'collection', key: 'collection', kind: 'text', fallback: 'myPick' } ] }
    ]
  },

  COUNT: {
    template: { func: 'COUNT' },
    variants: [
      { id: 'holder', match: op=>op.holder !== undefined, apply: op=>{ delete op.owner; delete op.collection; if(op.holder === undefined) op.holder = ''; },
        fields: [ { name: 'holder', key: 'holder', kind: 'widget', typeFilter: 'holder' }, { name: 'variable', key: 'variable', kind: 'variable', fallback: 'COUNT' } ] },
      { id: 'owner', match: op=>op.owner !== undefined && op.owner !== null, apply: op=>{ delete op.holder; delete op.collection; op.owner = ''; },
        fields: [ { name: 'owner', key: 'owner', kind: 'text', fallback: '' }, { name: 'variable', key: 'variable', kind: 'variable', fallback: 'COUNT' } ] },
      { id: 'pick', match: _=>true, apply: op=>{ delete op.holder; delete op.owner; },
        fields: [ { name: 'which', key: 'collection', kind: 'pick' }, { name: 'variable', key: 'variable', kind: 'variable', fallback: 'COUNT' } ] }
    ],
    clauses: []
  },

  GET: {
    template: { func: 'GET', property: 'id', variable: 'value' },
    keys: [ 'aggregation' ],
    variants: [ 'first', 'last', 'sum', 'average', 'median', 'min', 'max', 'array' ].map(aggregation=>({
      id: aggregation,
      match: op=>(op.aggregation || 'first') === aggregation,
      apply: op=>{ if(aggregation === 'first') delete op.aggregation; else op.aggregation = aggregation; },
      fields: [
        { name: 'property', key: 'property', kind: 'property', fallback: 'id' },
        { name: 'which', key: 'collection', kind: 'pick' },
        { name: 'variable', key: 'variable', kind: 'variable', fallback: op=>op.property || 'id' }
      ]
    })),
    clauses: [
      { id: 'skipMissing', key: 'skipMissing', isSet: op=>op.skipMissing === true, add: op=>{ op.skipMissing = true; }, fields: [] }
    ]
  },

  SET: {
    template: { func: 'SET', property: 'value', value: 1 },
    keys: [ 'relation' ],
    variants: [
      { id: 'toggle', match: op=>op.relation === '!', apply: op=>{ op.relation = '!'; delete op.value; },
        fields: [ { name: 'property', key: 'property', kind: 'property', fallback: 'value' }, { name: 'which', key: 'collection', kind: 'pick' } ] },
      { id: 'inc', match: op=>op.relation === '+' && typeof op.value !== 'string', apply: op=>{ op.relation = '+'; op.value = 1; },
        fields: routineBuilderSetFields() },
      { id: 'append', match: op=>op.relation === '+', apply: op=>{ op.relation = '+'; op.value = ''; },
        fields: routineBuilderSetFields() },
      { id: 'dec', match: op=>op.relation === '-', apply: op=>{ op.relation = '-'; if(typeof op.value !== 'number') op.value = 1; },
        fields: routineBuilderSetFields() },
      { id: 'mul', match: op=>op.relation === '*', apply: op=>{ op.relation = '*'; if(typeof op.value !== 'number') op.value = 2; },
        fields: routineBuilderSetFields() },
      { id: 'div', match: op=>op.relation === '/', apply: op=>{ op.relation = '/'; if(typeof op.value !== 'number') op.value = 2; },
        fields: routineBuilderSetFields() },
      // "==" is accepted by the engine and treated like "=", so it renders as Set
      { id: 'set', match: op=>op.relation === undefined || op.relation === '=' || op.relation === '==', apply: op=>{ delete op.relation; if(op.value === undefined) op.value = ''; },
        fields: routineBuilderSetFields() }
    ],
    clauses: []
  },

  LABEL: {
    template: { func: 'LABEL', value: '' },
    keys: [ 'mode' ],
    variants: [
      { id: 'inc', match: op=>op.mode === 'inc', apply: op=>{ op.mode = 'inc'; if(typeof op.value !== 'number') op.value = 1; }, fields: routineBuilderLabelFields() },
      { id: 'dec', match: op=>op.mode === 'dec', apply: op=>{ op.mode = 'dec'; if(typeof op.value !== 'number') op.value = 1; }, fields: routineBuilderLabelFields() },
      { id: 'append', match: op=>op.mode === 'append', apply: op=>{ op.mode = 'append'; if(typeof op.value !== 'string') op.value = ''; }, fields: routineBuilderLabelFields() },
      { id: 'set', match: op=>op.mode === undefined || op.mode === 'set', apply: op=>{ delete op.mode; if(op.value === undefined) op.value = ''; }, fields: routineBuilderLabelFields() }
    ],
    clauses: []
  },

  CLICK: {
    template: { func: 'CLICK' },
    variants: [
      { id: 'click', match: _=>true, apply: _=>{},
        fields: [ { name: 'count', key: 'count', kind: 'number', fallback: 1 }, { name: 'which', key: 'collection', kind: 'pick' } ] }
    ],
    clauses: [
      { id: 'mode', fields: [ { name: 'mode', key: 'mode', kind: 'enum', values: [ 'respect', 'ignoreClickable', 'ignoreClickRoutine', 'ignoreAll' ], fallback: 'ignoreClickRoutine' } ] }
    ]
  },

  CALL: {
    template: { func: 'CALL', routine: '' },
    variants: [
      { id: 'call', match: _=>true, apply: op=>{ if(op.routine === undefined) op.routine = ''; },
        fields: [ { name: 'routine', key: 'routine', kind: 'text', fallback: 'clickRoutine' } ] }
    ],
    clauses: [
      { id: 'widget', fields: [ { name: 'widget', key: 'widget', kind: 'widget' } ] },
      { id: 'variable', fields: [ { name: 'variable', key: 'variable', kind: 'variable', fallback: 'result' } ] },
      { id: 'return', key: 'return', isSet: op=>op.return === false, add: op=>{ op.return = false; }, fields: [] }
    ]
  }
};

function routineBuilderSetFields() {
  return [
    { name: 'property', key: 'property', kind: 'property', fallback: 'value' },
    { name: 'which', key: 'collection', kind: 'pick' },
    { name: 'value', key: 'value', kind: 'value', fallback: '' }
  ];
}

function routineBuilderLabelFields() {
  return [
    { name: 'which', key: '', kind: 'labelOrPick' },
    { name: 'value', key: 'value', kind: 'value', fallback: '' }
  ];
}

// Operations offered by the "Add step" menu, grouped by what the user wants to
// do rather than alphabetically.
const routineBuilderCategories = [
  { id: 'cards', funcs: [ 'MOVE', 'FLIP', 'SHUFFLE', 'RECALL' ] },
  { id: 'pick', funcs: [ 'SELECT', 'COUNT', 'GET' ] },
  { id: 'change', funcs: [ 'SET', 'LABEL', 'CLICK' ] },
  { id: 'flow', funcs: [ 'CALL' ] }
];

// Chips of these kinds swap between a widget ID parameter and a collection
// name, so they own two keys instead of one.
const routineBuilderDualKeys = {
  holderOrPick: { id: 'holder', collection: 'collection', idLabel: 'pick.holder', typeFilter: 'holder' },
  labelOrPick: { id: 'label', collection: 'collection', idLabel: 'pick.widget', typeFilter: '' }
};

// Value a chip shows: the parameter when it is set, otherwise the default the
// engine would apply, so a sentence never reads "undefined".
const routineBuilderKindFallbacks = { pick: 'DEFAULT', widget: '', text: '', property: '', variable: '', value: '', number: 0, countOrAll: 'all' };

function routineBuilderFieldValue(field, operation) {
  const value = field.key ? operation[field.key] : undefined;
  if(value !== undefined)
    return value;
  if(field.fallback !== undefined)
    return typeof field.fallback === 'function' ? field.fallback(operation) : field.fallback;
  return routineBuilderKindFallbacks[field.kind];
}

function routineBuilderClauseFields(clause) {
  return clause.fields || [];
}

function routineBuilderClauseKeys(clause) {
  const keys = clause.key ? [ clause.key ] : [];
  for(const field of routineBuilderClauseFields(clause))
    if(keys.indexOf(field.key) == -1)
      keys.push(field.key);
  return keys;
}

function routineBuilderClauseIsSet(clause, operation) {
  if(clause.isSet)
    return clause.isSet(operation);
  return routineBuilderClauseKeys(clause).some(key=>operation[key] !== undefined);
}

function routineBuilderVariantClauses(template, variant) {
  return template.clauses.filter(clause=>!clause.variants || clause.variants.indexOf(variant.id) != -1);
}

function routineBuilderFieldKeys(field) {
  return routineBuilderDualKeys[field.kind] ? Object.values(routineBuilderDualKeys[field.kind]) : [ field.key ];
}

// Returns { template, variant } when the operation can be rendered as a
// sentence, null when it has to fall back to the read only advanced card. An
// operation carrying a parameter this table does not know is deliberately not
// supported: the card would otherwise show a sentence that leaves out part of
// what the step actually does.
function routineBuilderMatch(operation) {
  if(typeof operation != 'object' || operation === null || Array.isArray(operation))
    return null;
  const template = routineBuilderOperations[operation.func];
  if(!template)
    return null;
  const variant = template.variants.find(candidate=>candidate.match(operation));
  if(!variant)
    return null;

  const known = { func: 1, comment: 1, note: 1 };
  for(const key of template.keys || [])
    known[key] = 1;
  for(const field of variant.fields)
    for(const key of routineBuilderFieldKeys(field))
      known[key] = 1;
  for(const clause of routineBuilderVariantClauses(template, variant))
    for(const key of routineBuilderClauseKeys(clause))
      known[key] = 1;

  for(const key in operation)
    if(!known[key])
      return null;

  return { template, variant };
}

function routineBuilderSupports(operation) {
  return routineBuilderMatch(operation) !== null;
}

// Builds a new operation object for the "Add step" menu.
function routineBuilderNewOperation(func) {
  const template = routineBuilderOperations[func];
  return template ? JSON.parse(JSON.stringify(template.template)) : { func };
}

// The names of the values that earlier steps of the same routine remember, so a
// value chip can offer them instead of making the user type ${...} by hand.
// Names arriving from outside (arguments of a CALL into this routine) cannot be
// known statically, which is why typing a name stays a first class path.
function routineBuilderVariables(routine, index) {
  const names = [];
  const add = name=>{
    if(typeof name === 'string' && name && names.indexOf(name) == -1)
      names.push(name);
  };

  for(const operation of (Array.isArray(routine) ? routine : []).slice(0, index)) {
    if(typeof operation === 'string') {
      const match = operation.match(/^\s*var\s+([a-zA-Z_$][\w$]*)\s+=/);
      if(match)
        add(match[1]);
      continue;
    }
    if(typeof operation != 'object' || operation === null)
      continue;

    if(operation.func == 'COUNT')
      add(operation.variable || 'COUNT');
    if(operation.func == 'GET')
      add(operation.variable || operation.property || 'id');
    if(operation.func == 'CALL' && operation.return !== false)
      add(operation.variable || 'result');
    if(operation.func == 'UPLOAD')
      add(operation.variable || 'uploadedFileName');
    if(operation.func == 'VAR')
      for(const name in operation.variables || {})
        add(name);
    if(operation.func == 'INPUT')
      for(const field of operation.fields || [])
        if(field && typeof field === 'object')
          add(field.variable || field.label);
  }

  return names;
}

// The collection names an earlier step filled, offered by the "which widgets"
// chips.
function routineBuilderCollections(routine, index) {
  const names = [ 'DEFAULT' ];
  for(const operation of (Array.isArray(routine) ? routine : []).slice(0, index)) {
    if(typeof operation != 'object' || operation === null)
      continue;
    const name = operation.collection;
    if(typeof name === 'string' && name && names.indexOf(name) == -1)
      names.push(name);
  }
  return names;
}

// Routine properties every widget understands, offered by the "Add automation"
// menu and listed in this order.
const routineBuilderStandardRoutines = [ 'clickRoutine', 'doubleClickRoutine', 'changeRoutine', 'enterRoutine', 'leaveRoutine', 'globalUpdateRoutine' ];

function routineBuilderRoutineOrder(property) {
  const index = routineBuilderStandardRoutines.indexOf(property);
  return index == -1 ? routineBuilderStandardRoutines.length : index;
}

// Human readable heading for a routine property of a widget.
function routineBuilderRoutineLabel(property) {
  if(routineBuilderStrings[`routine.${property}`])
    return routineBuilderText(`routine.${property}`);
  const propertyChange = property.match(/^(.+)ChangeRoutine$/);
  if(propertyChange)
    return routineBuilderText('routine.propertyChange', { name: propertyChange[1] });
  return routineBuilderText('routine.custom', { name: property.replace(/Routine$/, '') });
}
