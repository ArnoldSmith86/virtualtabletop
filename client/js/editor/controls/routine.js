// The single source of truth for how the visual routine editor presents each
// operation: its summary template, its parameters (type, default, enum values,
// display overrides) and what variables/collections it defines for later
// operations. Everything else (chips, popups, defaults, examples) derives
// from this registry.
//
// Template syntax: {name} is a clickable parameter chip; {a,b} shows the first
// alternative that is explicitly set (or whose default is not null); segments
// in [square brackets] are hidden while all their parameters use defaults.
// A template can also be a function receiving an accessor for the effective
// parameter values, so the wording can follow the operation's mode.
//
// Parameter types decide which popup opens: number, enum (with values),
// string, json, widgets (pick widgets in the room), collection (pick widgets
// or a collection name).
const routineOperationMetadata = {
  AUDIO: {
    template: '{func}: play {source} at volume {maxVolume}[ to {player}][; {count} time(s)]',
    parameters: {
      source: { type: 'string', default: '' },
      maxVolume: { type: 'number', default: 1.0 },
      length: { type: 'number', default: null },
      player: { type: 'string', default: null, display: { 'null': 'everyone' } },
      silence: { type: 'enum', values: [ true, false ], default: false },
      count: { type: 'number', default: 1, special: [ 'loop' ] }
    }
  },
  CALL: {
    template: '{func} routine {routine} on {widget}[ and store result as {variable}][; arguments {arguments}]',
    parameters: {
      routine: { type: 'string', default: 'clickRoutine' },
      widget: { type: 'widgets', default: null, display: { 'null': 'this widget' } },
      variable: { type: 'string', default: 'result' },
      'return': { type: 'enum', values: [ true, false ], default: true },
      arguments: { type: 'json', default: {} }
    },
    definesVariable: 'variable',
    definesCollection: _=>[ 'result' ]
  },
  CANVAS: {
    template: '{func}: {mode} on {collection}[ using value {value}][ and color {color}]',
    parameters: {
      mode: { type: 'enum', values: [ 'set', 'inc', 'dec', 'change', 'reset', 'setPixel' ], default: 'reset' },
      collection: { type: 'collection', default: 'DEFAULT' },
      value: { type: 'number', default: 1 },
      color: { type: 'string', default: '#1F5CA6' },
      x: { type: 'number', default: 0 },
      y: { type: 'number', default: 0 }
    }
  },
  CLICK: {
    template: '{func} widgets in {collection}[ {count} time(s)][, mode {mode}]',
    parameters: {
      collection: { type: 'collection', default: 'DEFAULT' },
      count: { type: 'number', default: 1 },
      mode: { type: 'enum', values: [ 'respect', 'ignoreClickable', 'ignoreClickRoutine', 'ignoreAll' ], default: 'respect' }
    }
  },
  CLONE: {
    template: '{func} widgets in {source} {count} time(s)[; offset by ({xOffset}, {yOffset})][; store result into {collection}][; properties {properties}]',
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
    template: '{func} widgets[ owned by {owner}] in {holder,collection} and store as {variable}',
    parameters: {
      owner: { type: 'string', default: null, display: { 'null': 'anyone' } },
      holder: { type: 'widgets', default: null },
      collection: { type: 'collection', default: 'DEFAULT' },
      variable: { type: 'string', default: 'COUNT' }
    },
    definesVariable: 'variable'
  },
  DELAY: {
    template: '{func} for {milliseconds} milliseconds',
    parameters: {
      milliseconds: { type: 'number', default: 0 }
    }
  },
  DELETE: {
    template: '{func} widgets in {collection}',
    parameters: {
      collection: { type: 'collection', default: 'DEFAULT' }
    }
  },
  FLIP: {
    template: v=>v('faceCycle') == 'random' ? '{func} {count} widgets from {holder,collection} a {faceCycle} face' : '{func} {count} widgets from {holder,collection}; cycle {faceCycle} by {face}',
    parameters: {
      count: { type: 'number', default: 'all', special: [ 'all' ] },
      holder: { type: 'widgets', default: null, display: { 'null': '?' } },
      collection: { type: 'collection', default: 'DEFAULT' },
      face: { type: 'number', default: null, special: [ null ], display: { 'null': 'next' } },
      faceCycle: { type: 'enum', values: [ 'forward', 'backward', 'random' ], default: 'forward' }
    }
  },
  FOREACH: {
    template: '{func} {in,range,collection}',
    parameters: {
      'in': { type: 'json', default: null },
      range: { type: 'json', default: null },
      collection: { type: 'collection', default: 'DEFAULT' }
    }
  },
  GET: {
    template: v=>v('aggregation') == 'array' ? '{func} ({aggregation}) value of {property} in {collection} and store as {variable}' : '{func} ({aggregation}) of values of {property} in {collection} and store as {variable}',
    parameters: {
      property: { type: 'string', default: 'id' },
      collection: { type: 'collection', default: 'DEFAULT' },
      aggregation: { type: 'enum', values: [ 'first', 'last', 'array', 'average', 'median', 'min', 'max', 'sum' ], default: 'first' },
      variable: { type: 'string', default: operation=>typeof operation.property == 'string' ? operation.property : 'id' },
      skipMissing: { type: 'enum', values: [ true, false ], default: false }
    },
    definesVariable: 'variable'
  },
  IF: {
    template: '{func} {operand1} {relation} {operand2}', // overridden by IfRoutineOperationEditor
    parameters: {
      condition: { type: 'string', default: null },
      operand1: { type: 'string', default: null, display: { 'null': '?' } },
      relation: { type: 'enum', values: [ '==', '!=', '<', '<=', '>=', '>' ], default: '==' },
      operand2: { type: 'string', default: null, display: { 'null': '?' } }
    }
  },
  INPUT: {
    template: '{func}: show fields {fields}[; confirm with {confirmButtonText}][; cancel with {cancelButtonText}]',
    parameters: {
      fields: { type: 'json', default: [] },
      confirmButtonText: { type: 'string', default: 'Go' },
      confirmButtonIcon: { type: 'string', default: null },
      cancelButtonText: { type: 'string', default: 'Cancel' },
      cancelButtonIcon: { type: 'string', default: null },
      header: { type: 'string', default: '' }
    }
  },
  LABEL: {
    template: v=>v('label') != null ? '{func}: {mode} {value} to {label}' : '{func}: {mode} {value} to labels in {collection}',
    parameters: {
      label: { type: 'widgets', default: null },
      collection: { type: 'collection', default: 'DEFAULT' },
      value: { type: 'string', default: 0 },
      mode: { type: 'enum', values: [ 'set', 'inc', 'dec', 'append' ], default: 'set' }
    }
  },
  MOVE: {
    template: v=>v('fillTo') != null ? '{func} widgets from {from,collection} to {to}; fill up to {fillTo}[; flip them to face {face}]' : '{func} {count} widgets from {from,collection} to {to}[; flip them to face {face}]',
    parameters: {
      fillTo: { type: 'number', default: null },
      count: { type: 'number', default: operation=>operation.from ? 1 : 'all', special: [ 'all' ] },
      from: { type: 'widgets', default: null, display: { 'null': '?' } },
      collection: { type: 'collection', default: 'DEFAULT' },
      to: { type: 'widgets', default: null, display: { 'null': '?' } },
      face: { type: 'number', default: null, special: [ null ], display: { 'null': 'unchanged' } }
    }
  },
  MOVEXY: {
    template: '{func} {count} widgets from {from} to ({x}, {y})[; flip to face {face}]',
    parameters: {
      count: { type: 'number', default: 1, special: [ 'all' ] },
      from: { type: 'widgets', default: null, display: { 'null': '?' } },
      x: { type: 'number', default: 0 },
      y: { type: 'number', default: 0 },
      face: { type: 'number', default: null, special: [ null ], display: { 'null': 'unchanged' } },
      snapToGrid: { type: 'enum', values: [ true, false ], default: true },
      resetOwner: { type: 'enum', values: [ true, false ], default: true }
    }
  },
  RECALL: {
    template: '{func} cards that belong to {holder}[; include cards in hands {owned}][, only cards in holders {inHolder}][, excluding {excludeCollection}]',
    parameters: {
      holder: { type: 'widgets', default: null, display: { 'null': '?' } },
      owned: { type: 'enum', values: [ true, false ], default: true },
      inHolder: { type: 'enum', values: [ true, false ], default: true },
      excludeCollection: { type: 'collection', default: null },
      byDistance: { type: 'enum', values: [ true, false ], default: false }
    }
  },
  RESET: {
    template: '{func} widgets using property {property}',
    parameters: {
      property: { type: 'string', default: 'resetProperties' }
    }
  },
  ROTATE: {
    template: v=>v('mode') == 'set' ? '{func} {count} widgets in {holder,collection}; {mode} to {angle} degrees' : '{func} {count} widgets in {holder,collection}; {mode} {angle} degrees',
    parameters: {
      count: { type: 'number', default: 1, special: [ 'all' ] },
      holder: { type: 'widgets', default: null },
      collection: { type: 'collection', default: 'DEFAULT' },
      angle: { type: 'number', default: 90, special: [ 45, 60, 90, 135, 180 ] },
      mode: { type: 'enum', values: [ 'set', 'add' ], default: 'add' }
    }
  },
  SCORE: {
    template: '{func}: get {property} in {seats}[; for round {round}][; use as {mode}][ with multiplier {value}]',
    parameters: {
      property: { type: 'string', default: 'score' },
      seats: { type: 'widgets', default: null, display: { 'null': 'every seat' } },
      round: { type: 'number', default: null, special: [ null ], display: { 'null': 'new round' } },
      mode: { type: 'enum', values: [ 'set', 'inc', 'dec' ], default: 'set' },
      value: { type: 'number', default: null, special: [ null ] }
    }
  },
  SELECT: {
    template: v=>`{func} {max} {type} from {source}[ having {property} {relation} {value}] and {mode} ${ { set: 'as', add: 'to', remove: 'from', intersect: 'with' }[v('mode')] || 'as' } {collection}`,
    parameters: {
      max: { type: 'number', default: 999999, special: [ 'all' ], display: { '999999': 'all' } },
      type: { type: 'enum', values: [ 'all', 'button', 'canvas', 'card', 'deck', 'dice', 'holder', 'label', 'pile', 'scoreboard', 'seat', 'spinner', 'timer' ], default: 'all', display: { 'all': 'widgets', 'button': 'buttons', 'canvas': 'canvases', 'card': 'cards', 'deck': 'decks', 'dice': 'dice', 'holder': 'holders', 'label': 'labels', 'pile': 'piles', 'scoreboard': 'scoreboards', 'seat': 'seats', 'spinner': 'spinners', 'timer': 'timers' } },
      source: { type: 'collection', default: 'all', display: { 'all': 'all widgets' } },
      property: { type: 'string', default: 'parent' },
      relation: { type: 'enum', values: [ '==', '!=', '<', '<=', '>=', '>', 'in' ], default: '==' },
      value: { type: 'string', default: null },
      mode: { type: 'enum', values: [ 'set', 'add', 'remove', 'intersect' ], default: 'set' },
      collection: { type: 'collection', default: 'DEFAULT' },
      sortBy: { type: 'json', default: null },
      random: { type: 'enum', values: [ true, false ], default: false }
    },
    definesCollection: 'collection'
  },
  SET: {
    template: '{func} property {property} {relation} {value} for all widgets in {collection}',
    parameters: {
      property: { type: 'string', default: 'parent' },
      collection: { type: 'collection', default: 'DEFAULT' },
      relation: { type: 'enum', values: [ '=', '+', '-', '*', '/', '!' ], default: '=' },
      value: { type: 'json', default: null }
    }
  },
  SHUFFLE: {
    template: v=>{
      if(v('mode') == 'reverse')
        return '{func}: {mode} order of widgets in {holder,collection}';
      if(v('mode') == 'seeded')
        return '{func} {holder,collection}[; mode {mode} with value {modeValue}]';
      if(v('mode') == 'overhand' || v('mode') == 'riffle')
        return '{func} {holder,collection}[, mode {mode} {modeValue} times]';
      return '{func} {holder,collection}'; // true random
    },
    parameters: {
      holder: { type: 'widgets', default: null, display: { 'null': '?' } },
      collection: { type: 'collection', default: 'DEFAULT' },
      mode: { type: 'enum', values: [ 'true random', 'overhand', 'riffle', 'reverse', 'seeded' ], default: 'true random' },
      modeValue: { type: 'number', default: 1 }
    }
  },
  SORT: {
    template: '{func} {holder,collection} by {key}[; reverse {reverse}]',
    parameters: {
      holder: { type: 'widgets', default: null },
      collection: { type: 'collection', default: 'DEFAULT' },
      key: { type: 'json', default: 'value' },
      reverse: { type: 'enum', values: [ true, false ], default: false },
      rearrange: { type: 'enum', values: [ true, false ], default: true },
      locales: { type: 'json', default: null },
      options: { type: 'json', default: null }
    }
  },
  SWAPHANDS: {
    template: '{func} hands among players in {source}[, interval {interval}][, direction {direction}]',
    parameters: {
      source: { type: 'collection', default: 'all', display: { 'all': 'all seats' } },
      interval: { type: 'number', default: 1 },
      direction: { type: 'enum', values: [ 'forward', 'backward', 'random' ], default: 'forward' }
    }
  },
  TIMER: {
    template: v=>{
      const target = v('timer') != null ? '{timer,collection}' : 'timers in {collection}';
      const valuePart = typeof v('value') == 'string' ? 'value set in {value}' : (v('seconds') ? '{seconds} seconds' : '{value} milliseconds');
      if(v('mode') == 'set')
        return `{func}: for ${target} {mode} time to ${valuePart}`;
      if(v('mode') == 'inc' || v('mode') == 'dec')
        return `{func}: for ${target} {mode} time by ${valuePart}`;
      return `{func}: {mode} ${target}`; // pause/start/toggle/reset ignore the value
    },
    parameters: {
      timer: { type: 'widgets', default: null },
      collection: { type: 'collection', default: 'DEFAULT' },
      mode: { type: 'enum', values: [ 'pause', 'start', 'toggle', 'set', 'dec', 'inc', 'reset' ], default: 'toggle' },
      value: { type: 'number', default: 0 },
      seconds: { type: 'number', default: 0 }
    }
  },
  TURN: {
    template: v=>{
      if(v('turnCycle') == 'random')
        return '{func} choose a {turnCycle} seat';
      if(v('turnCycle') == 'position')
        return '{func} to seat in {turnCycle}: {turn}';
      if(v('turnCycle') == 'seat')
        return '{func} to {turnCycle} with id {turn}';
      return '{func} {turnCycle} by {turn}'; // forward / backward
    },
    parameters: {
      turn: { type: 'string', default: 1 },
      turnCycle: { type: 'enum', values: [ 'forward', 'backward', 'random', 'position', 'seat' ], default: 'forward' },
      source: { type: 'collection', default: 'all', display: { 'all': 'all seats' } },
      collection: { type: 'collection', default: 'TURN' }
    },
    definesCollection: 'collection'
  },
  UPLOAD: {
    template: '{func} a file and store as {variable}',
    parameters: {
      variable: { type: 'string', default: 'uploadedFileName' },
      fileTypes: { type: 'json', default: [ '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.json', '.mp3', '.wav', '.ogg', '.m4a' ] }
    },
    definesVariable: 'variable'
  },
  VAR: {
    template: '{func}: set variables {variables}',
    parameters: {
      variables: { type: 'json', default: {} }
    },
    definesVariables: operation=>Object.keys(operation.variables || {})
  }
};

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

class RoutineEditor {
  constructor(widget, routine, variables=[], collections=[]) {
    this.domElement = document.createElement('div');
    this.domElement.classList.add('routine-editor');
    this.widget = widget;
    this.variables = variables;
    this.collections = collections;
    this.changeListeners = [];
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

  // called by nested editors and chips after they mutated the routine in place
  routineChanged() {
    this.notifyChangeListeners();
    this.setRoutine(this.routine);
  }

  setRoutine(routine) {
    this.routine = routine;
    this.operations = [];
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

      const buttonsDOM = document.createElement('span');
      buttonsDOM.className = 'routine-editor-operation-buttons';
      const operationButton = (icon, title, onClick)=>{
        const buttonDOM = document.createElement('span');
        buttonDOM.className = 'material-symbols';
        buttonDOM.textContent = icon;
        buttonDOM.title = title;
        buttonDOM.addEventListener('click', e=>{
          e.stopPropagation();
          onClick();
        });
        buttonsDOM.append(buttonDOM);
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
      operationButton('delete', 'Remove this operation', _=>{
        this.routine.splice(index, 1);
        this.routineChanged();
      });
      operationDOM.append(buttonsDOM);

      this.domElement.append(operationDOM);
    }

    if(!this.operations.length) {
      const emptyHint = document.createElement('div');
      emptyHint.className = 'routine-editor-empty';
      emptyHint.textContent = 'No operations yet.';
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
}

class RoutineOperationEditor {
  constructor(func) {
    this.func = func;
    this.metadata = routineOperationMetadata[func] || { template: '{func}', parameters: {} };
    this.changeListeners = [];
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
    if(parameterNames[0] == 'func')
      return new RoutineOperationPopup();
    if(parameterNames.length > 1 && spec && spec.type == 'collection')
      return new RoutineHoldersOrCollectionSourcePopup();
    switch(spec && spec.type) {
      case 'number':     return new RoutineNumberPopup({ specialValues: spec.special });
      case 'enum':       return new RoutineEnumPopup({ values: spec.values });
      case 'widgets':    return new RoutineWidgetIDPopup();
      case 'collection': return new RoutineHoldersOrCollectionSourcePopup();
      case 'json':       return new RoutineJSONPopup();
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

  getExampleWithDefaults() {
    return this.getTemplate().replace(/\[[^\]]*\]/g, '').replace(/\{([a-zA-Z0-9,]+)\}/g, (_, p)=>this.getDisplayedValue(p));
  }

  getTemplate() {
    // templates can be functions of the effective parameter values so the
    // sentence can change its wording with the mode of the operation
    let template = this.metadata.template;
    if(typeof template == 'function')
      template = template(name=>this.parameterValue(name));
    return this.withExtraParameters(template);
  }

  // the value the parameter effectively has: the explicitly set one or its default
  parameterValue(name) {
    if(this.operation && typeof this.operation == 'object' && typeof this.operation[name] != 'undefined')
      return this.operation[name];
    return this.getDefaults()[name];
  }

  // parameters the handwritten template does not mention still get a chip in an
  // optional segment so every option the operation supports stays editable
  withExtraParameters(template) {
    const referenced = (template.match(/\{([a-zA-Z0-9,]+)\}/g) || []).flatMap(m=>m.slice(1, -1).split(','));
    let result = template;
    for(const name in this.metadata.parameters)
      if(referenced.indexOf(name) == -1)
        result += `[, ${name} {${name}}]`;
    return result;
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

    if(uiState.listView)
      this.renderListView(dom);
    else
      this.renderSentenceView(dom);

    if(this.isExpandable())
      ($('.routine-editor-parameter-row', dom) || dom).prepend(this.renderViewToggle());

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
    return `<span class="routine-editor-operation-parameter routine-editor-parameter-${category}${missing}" data-parameter="${spec}" title="${categoryNames[category] || 'value'} - click to change ${spec.split(',').join(' / ')}">${escapeHTML(displayed)}</span>`;
  }

  // the compact summary; segments in square brackets are hidden while all
  // their parameters use defaults - the list view shows every parameter
  renderSentenceView(dom) {
    let html = '';
    for(const segment of this.getTemplate().split(/(\[[^\]]*\])/)) {
      const optional = segment.charAt(0) == '[';
      const text = optional ? segment.slice(1, -1) : segment;
      const explicitlySet = (text.match(/\{([a-zA-Z0-9,]+)\}/g) || []).some(spec=>
        spec.slice(1, -1).split(',').some(p=>this.operation && typeof this.operation == 'object' && typeof this.operation[p] != 'undefined'));
      if(optional && !explicitlySet)
        continue;
      html += text.replace(/\{([a-zA-Z0-9,]+)\}/g, (_, spec)=>this.renderParameterChip(spec));
    }
    dom.innerHTML = html;
  }

  // one line per declared parameter, including the ones the operation does not define
  renderListView(dom) {
    let html = `<div class="routine-editor-parameter-row">${this.renderParameterChip('func')}</div>`;
    for(const name in this.metadata.parameters)
      html += `<div class="routine-editor-parameter-row"><span class="routine-editor-parameter-name">${escapeHTML(name)}</span>${this.renderParameterChip(name)}</div>`;
    dom.innerHTML = html;
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
      // (direct children only - nested operations have their own button clusters)
      const buttons = [ ...oldDom.children ].find(c=>c.classList.contains('routine-editor-operation-buttons'));
      if(buttons)
        newDom.append(buttons);
      oldDom.replaceWith(newDom);
    });
    return toggle;
  }

  renderSubroutine(dom, property) {
    // only assign the array to the operation when something actually changes
    const routine = Array.isArray(this.operation[property]) ? this.operation[property] : [];
    const routineEditor = new RoutineEditor(this.widget, routine, this.variables, this.collections);
    routineEditor.registerChangeListener(v=>{
      this.operation[property] = v;
      this.notifyChangeListeners(this.operation);
    });
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

  getTemplate() {
    // a custom condition replaces the operand comparison (and makes it ignored,
    // so the operand parameters get no extra chips in that case)
    if(this.operation && typeof this.operation.condition != 'undefined')
      return '{func} {condition}';
    return this.withExtraParameters('{func} {operand1} {relation} {operand2}');
  }

  render() {
    super.render();
    this.renderSubroutine(this.domElement, 'thenRoutine');
    if(Array.isArray(this.operation.elseRoutine)) {
      const elseLabel = document.createElement('div');
      elseLabel.className = 'routine-editor-else';
      elseLabel.textContent = 'ELSE';
      this.domElement.append(elseLabel);
      this.renderSubroutine(this.domElement, 'elseRoutine');
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

  render() {
    super.render();
    this.renderSubroutine(this.domElement, 'loopRoutine');
    return this.domElement;
  }
}

class VarStringRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('var');
  }

  getTemplate() {
    // fall back to raw editing for statements the simple form cannot represent
    return this.isSimple() ? 'variable {variable} gets value {expression}' : '{statement}';
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

  getTemplate() {
    return '// {comment}';
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

  getTemplate() {
    return '{json}';
  }

  createPopup(parameterNames) {
    return new RoutineFullOperationJSONPopup();
  }

  getDisplayedValue(property) {
    return JSON.stringify(this.operation);
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
  { example: 'MOVE 1 card from a to b', newOperation: { func: 'MOVE', count: 1, from: null, to: null } },
  { example: 'MOVE all cards from a to b', newOperation: { func: 'MOVE', count: 'all', from: null, to: null } },
  { example: 'FLIP the top card of a holder', newOperation: { func: 'FLIP', count: 1, holder: null } },
  { example: 'SHUFFLE a holder', newOperation: { func: 'SHUFFLE', holder: null } },
  { example: 'RECALL all cards to their holder', newOperation: { func: 'RECALL', holder: null } },
  { example: 'AUDIO plays a sound', newOperation: { func: 'AUDIO', source: '' } },
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
