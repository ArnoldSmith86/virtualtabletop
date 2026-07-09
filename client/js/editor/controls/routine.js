class RoutineEditor {
  constructor(widget, routine, variables=[], collections=[]) {
    this.domElement = document.createElement('div');
    this.domElement.classList.add('routine-editor');
    this.widget = widget;
    this.variables = variables;
    this.collections = collections;
    this.onPropertyChange(routine);
    this.changeListeners = [];
  }

  notifyChangeListeners(value) {
    for(const listener of this.changeListeners) {
      listener(value);
    }
  }

  onPropertyChange(routine) {
    // TODO: handle property change instead of just replacing the routine
    this.routine = JSON.parse(JSON.stringify(routine));
    this.operations = [];
    let variables = JSON.parse(JSON.stringify(this.variables));
    let collections = JSON.parse(JSON.stringify(this.collections));
    for(const [index, operation] of this.routine.entries()) {
      const routineOperationEditor = getMatchingRoutineOperationEditor(operation);
      routineOperationEditor.setOperationDetails(this.widget, operation, variables, collections);
      this.operations.push(routineOperationEditor);
      routineOperationEditor.registerChangeListener(v=>{
        this.routine[index] = v;
        this.notifyChangeListeners(this.routine);
      });

      // add variables of operation to variables
      variables = [...new Set([...variables, ...routineOperationEditor.getDefinedVariables()])];
      // add collections of operation to collections
      collections = [...new Set([...collections, ...routineOperationEditor.getDefinedCollections()])];
      // in-place collections (arrays of widget ids) used in the routine become suggestions too
      if(operation && typeof operation == 'object')
        for(const key of [ 'collection', 'source', 'excludeCollection' ])
          if(Array.isArray(operation[key]))
            collections.push([ ...operation[key] ]);
      collections = collections.filter((c, i)=>collections.findIndex(x=>JSON.stringify(x) == JSON.stringify(c)) == i);
    }
    this.render();
  }

  registerChangeListener(listener) {
    this.changeListeners.push(listener);
  }

  render() {
    this.domElement.innerHTML = '';
    for(const [ index, operation ] of this.operations.entries()) {
      const operationDOM = operation.render();

      const removeButton = document.createElement('span');
      removeButton.className = 'material-symbols routine-editor-operation-remove';
      removeButton.textContent = 'delete';
      removeButton.title = 'Remove this operation';
      removeButton.addEventListener('click', e=>{
        e.stopPropagation();
        this.routine.splice(index, 1);
        this.notifyChangeListeners(this.routine);
        this.onPropertyChange(this.routine);
      });
      operationDOM.append(removeButton);

      this.domElement.append(operationDOM);
    }

    const addButton = button(this.domElement, 'add operation', async _=>{
      const popup = new RoutineOperationPopup();
      popup.setSource(addButton);
      popup.setOperationDetails({}, [ 'func' ], this.widget, this.variables, this.collections);
      const values = await newRoutineValues(popup);
      if(values !== undefined) {
        this.routine.push(typeof values == 'string' ? values : JSON.parse(JSON.stringify(values)));
        this.notifyChangeListeners(this.routine);
        this.onPropertyChange(this.routine);
      }
    });
    addButton.className = 'routine-editor-add-operation';

    return this.domElement;
  }
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

class RoutineOperationEditor {
  constructor(template, popups) {
    this.changeListeners = [];
    this.template = template;
    this.popups = popups;
  }

  classifyParameter(parameterName, value) {
    if(parameterName == 'func')
      return 'func';
    if(typeof value == 'string' && value.match(/\$\{[^}]+\}/))
      return 'variable';
    if(parameterName == 'variable')
      return 'variable';
    if([ 'collection', 'source', 'excludeCollection' ].indexOf(parameterName) != -1)
      return 'collection';
    if([ 'from', 'to', 'holder', 'widget', 'timer', 'label', 'canvas', 'seats' ].indexOf(parameterName) != -1)
      return 'widget';
    if(typeof value == 'number')
      return 'number';
    return 'value';
  }

  getDefaults() {
    return {};
  }

  getDefinedCollections() {
    return [];
  }

  getDefinedVariables() {
    return [];
  }

  getDisplayMap() {
    return {};
  }

  getDisplayedValue(property) {
    const resolved = this.resolveParameter(property);
    if(resolved === null)
      return '?';

    const value = this.operation && typeof this.operation[resolved] != 'undefined' ? this.operation[resolved] : this.getDefaults()[resolved];
    if(this.getDisplayMap()[resolved]) {
      const displayValue = this.getDisplayMap()[resolved][value];
      if(displayValue != null)
        return displayValue;
    }
    if(typeof value == 'string' && predefinedVariableLabels[value])
      return predefinedVariableLabels[value];
    return value;
  }

  getExampleWithDefaults() {
    return this.template.replace(/\[[^\]]*\]/g, '').replace(/\{([a-zA-Z0-9,]+)\}/g, (_, p)=>this.getDisplayedValue(p));
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
      this.notifyChangeListeners(JSON.parse(JSON.stringify(this.operation)));
    }
  }

  registerChangeListener(listener) {
    this.changeListeners.push(listener);
  }

  render() {
    const dom = document.createElement('div');
    this.domElement = dom;
    dom.classList.add('routine-editor-operation');

    // escapeHTML because parameter values come from untrusted room state
    let popupIndex = 0;
    const parameterSpan = (spec)=>{
      const index = popupIndex++;
      const resolved = this.resolveParameter(spec);
      const rawValue = resolved !== null && this.operation && typeof this.operation[resolved] != 'undefined' ? this.operation[resolved] : (resolved !== null ? this.getDefaults()[resolved] : undefined);
      const category = this.classifyParameter(resolved, rawValue);
      return `<span class="routine-editor-operation-parameter routine-editor-parameter-${category}" data-parameter="${spec}" data-popup-index="${index}">${escapeHTML(this.getDisplayedValue(spec))}</span>`;
    };

    // segments in square brackets only show details when one of their parameters is explicitly set
    let hasHiddenSegment = false;
    let html = '';
    for(const segment of this.template.split(/(\[[^\]]*\])/)) {
      const optional = segment.charAt(0) == '[';
      const text = optional ? segment.slice(1, -1) : segment;
      const explicitlySet = (text.match(/\{([a-zA-Z0-9,]+)\}/g) || []).some(spec=>
        spec.slice(1, -1).split(',').some(p=>this.operation && typeof this.operation == 'object' && typeof this.operation[p] != 'undefined'));
      const rendered = text.replace(/\{([a-zA-Z0-9,]+)\}/g, (_, spec)=>parameterSpan(spec));
      if(optional && !explicitlySet) {
        html += `<span class="routine-editor-operation-optional">${rendered}</span>`;
        hasHiddenSegment = true;
      } else {
        html += rendered;
      }
    }
    dom.innerHTML = html;

    if(hasHiddenSegment) {
      const more = document.createElement('span');
      more.className = 'material-symbols routine-editor-operation-more';
      more.textContent = 'more_horiz';
      more.title = 'Show parameters that use their default values';
      more.addEventListener('click', e=>{
        e.stopPropagation();
        dom.classList.toggle('show-details');
      });
      dom.append(more);
    }

    for(const span of $a('span[data-popup-index]', dom)) {
      span.addEventListener('click', async e=>{
        e.stopPropagation();
        const popup = this.popups[+span.dataset.popupIndex];
        popup.setSource(span);
        popup.setOperationDetails(this.operation, span.dataset.parameter.split(','), this.widget, this.variables, this.collections);
        const values = await newRoutineValues(popup);
        if(values !== undefined) // undefined means the popup was dismissed
          this.onNewValue(values);
      });
    }
    return dom;
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

  renderFoldToggle() {
    const toggle = document.createElement('span');
    toggle.className = 'material-symbols routine-editor-fold-toggle';
    toggle.textContent = 'unfold_less';
    toggle.title = 'Fold or unfold the nested routines';
    toggle.addEventListener('click', e=>{
      e.stopPropagation();
      const folded = this.domElement.classList.toggle('folded');
      toggle.textContent = folded ? 'unfold_more' : 'unfold_less';
    });
    this.domElement.append(toggle);
  }

  renderSubroutine(dom, property) {
    const routineEditor = new RoutineEditor(this.widget, this.operation[property], this.variables, this.collections);
    routineEditor.registerChangeListener(v=>{
      this.operation[property] = v;
      this.notifyChangeListeners(this.operation);
    });
    dom.append(routineEditor.render());
  }

  setOperationDetails(widget, operation, variables, collections) {
    this.widget = widget;
    this.operation = JSON.parse(JSON.stringify(operation));
    this.variables = variables;
    this.collections = collections;
  }
}

class CountRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} widgets[ owned by {owner}] in {holder,collection} and store as {variable}', [
      new RoutineOperationPopup(),
      new RoutineStringPopup(),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineStringPopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'COUNT',
      owner: null,
      holder: null,
      collection: 'DEFAULT',
      variable: 'COUNT'
    };
  }

  getDefinedVariables() {
    return [ this.operation.variable != null ? this.operation.variable : this.getDefaults().variable ];
  }

  getDisplayMap() {
    return {
      owner: { 'null': 'anyone' }
    };
  }

  isMatching(operation) {
    return operation && operation.func == this.getDefaults().func;
  }
}

class IfRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {condition,operand1,relation,operand2}:', [
      new RoutineOperationPopup(),
      new RoutineIfConditionPopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'IF',
      condition: null,
      operand1: null,
      relation: "==",
      operand2: null
    };
  }

  isMatching(operation) {
    return operation && operation.func == 'IF';
  }

  render() {
    super.render();
    this.renderFoldToggle();
    if(Array.isArray(this.operation.thenRoutine))
      this.renderSubroutine(this.domElement, 'thenRoutine');
    if(Array.isArray(this.operation.elseRoutine)) {
      const elseLabel = document.createElement('div');
      elseLabel.className = 'routine-editor-else';
      elseLabel.textContent = 'ELSE';
      this.domElement.append(elseLabel);
      this.renderSubroutine(this.domElement, 'elseRoutine');
    }
    return this.domElement;
  }
}

class ForeachRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {in,range,collection}:', [
      new RoutineOperationPopup(),
      new RoutineForeachSourcePopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'FOREACH',
      in: null,
      range: null,
      collection: 'DEFAULT'
    };
  }

  isMatching(operation) {
    return operation && operation.func == 'FOREACH';
  }

  render() {
    super.render();
    this.renderFoldToggle();
    if(Array.isArray(this.operation.loopRoutine))
      this.renderSubroutine(this.domElement, 'loopRoutine');
    return this.domElement;
  }
}

class MoveRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {fillTo,count} widgets from {from,collection} to {to}[, flipping them to face {face}]', [
      new RoutineOperationPopup(),
      new RoutineNumberPopup({ specialValues: [ 'all' ] }),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineNumberPopup({ specialValues: [ null ] })
    ]);
  }

  getDefaults() {
    return {
      func: 'MOVE',
      count: this.operation && this.operation.from ? 1 : 'all',
      fillTo: null,
      from: null,
      collection: 'DEFAULT',
      to: null,
      face: null
    };
  }

  getDisplayMap() {
    return {
      to: { 'null': '?' },
      face: { 'null': 'unchanged' }
    };
  }

  isMatching(operation) {
    return operation && operation.func == this.getDefaults().func;
  }
}

class SelectRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {max} {type} from {source}[ having {property} {relation} {value}] and {mode} {collection}', [
      new RoutineOperationPopup(),
      new RoutineNumberPopup({ specialValues: [ 'all' ] }),
      new RoutineEnumPopup({ values: [ 'all', 'button', 'canvas', 'card', 'deck', 'dice', 'holder', 'label', 'pile', 'scoreboard', 'seat', 'spinner', 'timer' ] }),
      new RoutineHoldersOrCollectionSourcePopup({ specialValues: [ 'all' ] }),
      new RoutineEnumPopup({ values: [ 'x', 'y' ] }),
      new RoutineEnumPopup({ values: [ '==', '!=', '<', '<=', '>=', '>', 'in' ] }),
      new RoutineStringPopup(),
      new RoutineEnumPopup({ values: [ 'set', 'add', 'remove', 'intersect' ] }),
      new RoutineHoldersOrCollectionSourcePopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'SELECT',
      max: 999999,
      type: 'widgets',
      source: 'all',
      property: 'parent',
      relation: '==',
      value: null,
      mode: 'set',
      collection: 'DEFAULT'
    };
  }

  getDefinedCollections() {
    return [ this.operation.collection != null ? this.operation.collection : 'DEFAULT' ];
  }

  getDisplayMap() {
    return {
      max: { '999999': 'all' },
      source: { 'all': 'all widgets' },
      type: { 'all': 'widgets', 'button': 'buttons', 'canvas': 'canvases', 'card': 'cards', 'deck': 'decks', 'dice': 'dice', 'holder': 'holders', 'label': 'labels', 'pile': 'piles', 'scoreboard': 'scoreboards', 'seat': 'seats', 'spinner': 'spinners', 'timer': 'timers' },
      mode: { 'set': 'store in', 'add': 'add to', 'remove': 'remove from', 'intersect': 'intersect with' }
    };
  }

  isMatching(operation) {
    return operation && operation.func == 'SELECT';
  }
}

class AudioRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {source} at volume {maxVolume}[ to {player}][, {count} time(s)]', [
      new RoutineOperationPopup(),
      new RoutineStringPopup(),
      new RoutineNumberPopup(),
      new RoutineStringPopup(),
      new RoutineNumberPopup({ specialValues: [ 'loop' ] })
    ]);
  }

  getDefaults() {
    return {
      func: 'AUDIO',
      source: '',
      maxVolume: 1.0,
      length: null,
      player: null,
      silence: false,
      count: 1
    };
  }

  classifyParameter(parameterName, value) {
    if(parameterName == 'source')
      return 'value'; // a url, not a collection
    return super.classifyParameter(parameterName, value);
  }

  getDisplayMap() {
    return {
      player: { 'null': 'everyone' }
    };
  }

  isMatching(operation) {
    return operation && operation.func == 'AUDIO';
  }
}

class CallRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {routine} on {widget}[, store result as {variable}][, arguments {arguments}]', [
      new RoutineOperationPopup(),
      new RoutineStringPopup(),
      new RoutineWidgetIDPopup(),
      new RoutineStringPopup(),
      new RoutineJSONPopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'CALL',
      routine: 'clickRoutine',
      widget: null,
      'return': true,
      arguments: {},
      variable: 'result',
      collection: 'result'
    };
  }

  getDefinedVariables() {
    return [ this.operation.variable != null ? this.operation.variable : 'result' ];
  }

  getDefinedCollections() {
    return [ this.operation.collection != null ? this.operation.collection : 'result' ];
  }

  getDisplayMap() {
    return {
      widget: { 'null': 'this widget' }
    };
  }

  getDisplayedValue(property) {
    const value = super.getDisplayedValue(property);
    return property == 'arguments' ? JSON.stringify(value) : value;
  }

  isMatching(operation) {
    return operation && operation.func == 'CALL';
  }
}

class CanvasRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {mode} on {collection}[ using value {value}][ and color {color}]', [
      new RoutineOperationPopup(),
      new RoutineEnumPopup({ values: [ 'set', 'inc', 'dec', 'change', 'reset', 'setPixel' ] }),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineNumberPopup(),
      new RoutineStringPopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'CANVAS',
      collection: 'DEFAULT',
      mode: 'reset',
      x: 0,
      y: 0,
      value: 1,
      color: '#1F5CA6'
    };
  }

  isMatching(operation) {
    return operation && operation.func == 'CANVAS';
  }
}

class ClickRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} widgets in {collection}[, {count} time(s)][, mode {mode}]', [
      new RoutineOperationPopup(),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineNumberPopup(),
      new RoutineEnumPopup({ values: [ 'respect', 'ignoreClickable', 'ignoreClickRoutine', 'ignoreAll' ] })
    ]);
  }

  getDefaults() {
    return {
      func: 'CLICK',
      collection: 'DEFAULT',
      count: 1,
      mode: 'respect'
    };
  }

  isMatching(operation) {
    return operation && operation.func == 'CLICK';
  }
}

class CloneRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {count} time(s) from {source}[ offset by ({xOffset}, {yOffset})] into {collection}[, properties {properties}]', [
      new RoutineOperationPopup(),
      new RoutineNumberPopup(),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineNumberPopup(),
      new RoutineNumberPopup(),
      new RoutineStringPopup(),
      new RoutineJSONPopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'CLONE',
      source: 'DEFAULT',
      count: 1,
      xOffset: 0,
      yOffset: 0,
      properties: {},
      recursive: false,
      collection: 'DEFAULT'
    };
  }

  getDefinedCollections() {
    return [ this.operation.collection != null ? this.operation.collection : 'DEFAULT' ];
  }

  getDisplayedValue(property) {
    const value = super.getDisplayedValue(property);
    return property == 'properties' ? JSON.stringify(value) : value;
  }

  isMatching(operation) {
    return operation && operation.func == 'CLONE';
  }
}

class DelayRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} for {milliseconds} milliseconds', [
      new RoutineOperationPopup(),
      new RoutineNumberPopup()
    ]);
  }

  getDefaults() {
    return { func: 'DELAY', milliseconds: 0 };
  }

  isMatching(operation) {
    return operation && operation.func == 'DELAY';
  }
}

class DeleteRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} widgets in {collection}', [
      new RoutineOperationPopup(),
      new RoutineHoldersOrCollectionSourcePopup()
    ]);
  }

  getDefaults() {
    return { func: 'DELETE', collection: 'DEFAULT' };
  }

  isMatching(operation) {
    return operation && operation.func == 'DELETE';
  }
}

class FlipRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {count} widgets from {holder,collection}[ to face {face}][, faceCycle {faceCycle}]', [
      new RoutineOperationPopup(),
      new RoutineNumberPopup({ specialValues: [ 'all' ] }),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineNumberPopup({ specialValues: [ null ] }),
      new RoutineEnumPopup({ values: [ 'forward', 'backward', 'random' ] })
    ]);
  }

  getDefaults() {
    return {
      func: 'FLIP',
      count: 'all',
      face: null,
      faceCycle: 'forward',
      holder: null,
      collection: 'DEFAULT'
    };
  }

  getDisplayMap() {
    return {
      face: { 'null': 'next' }
    };
  }

  isMatching(operation) {
    return operation && operation.func == 'FLIP';
  }
}

class GetRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {property} of {collection} ({aggregation}) and store as {variable}', [
      new RoutineOperationPopup(),
      new RoutineStringPopup(),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineEnumPopup({ values: [ 'first', 'last', 'array', 'average', 'median', 'min', 'max', 'sum' ] }),
      new RoutineStringPopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'GET',
      variable: 'id',
      collection: 'DEFAULT',
      property: 'id',
      aggregation: 'first',
      skipMissing: false
    };
  }

  getDefinedVariables() {
    return [ this.operation.variable != null ? this.operation.variable : 'id' ];
  }

  isMatching(operation) {
    return operation && operation.func == 'GET';
  }
}

class InputRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} fields {fields}[, confirm {confirmButtonText}][, cancel {cancelButtonText}]', [
      new RoutineOperationPopup(),
      new RoutineJSONPopup(),
      new RoutineStringPopup(),
      new RoutineStringPopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'INPUT',
      cancelButtonIcon: null,
      cancelButtonText: 'Cancel',
      confirmButtonIcon: null,
      confirmButtonText: 'Go',
      fields: [],
      header: ''
    };
  }

  getDisplayedValue(property) {
    const value = super.getDisplayedValue(property);
    return property == 'fields' ? JSON.stringify(value) : value;
  }

  isMatching(operation) {
    return operation && operation.func == 'INPUT';
  }
}

class LabelRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {label,collection} to {value}[, mode {mode}]', [
      new RoutineOperationPopup(),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineStringPopup(),
      new RoutineEnumPopup({ values: [ 'set', 'inc', 'dec', 'append' ] })
    ]);
  }

  getDefaults() {
    return {
      func: 'LABEL',
      value: 0,
      mode: 'set',
      label: null,
      collection: 'DEFAULT'
    };
  }

  isMatching(operation) {
    return operation && operation.func == 'LABEL';
  }
}

class MovexyRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {count} widgets from {from} to ({x}, {y})[, flipping to face {face}]', [
      new RoutineOperationPopup(),
      new RoutineNumberPopup({ specialValues: [ 'all' ] }),
      new RoutineWidgetIDPopup(),
      new RoutineNumberPopup(),
      new RoutineNumberPopup(),
      new RoutineNumberPopup({ specialValues: [ null ] })
    ]);
  }

  getDefaults() {
    return {
      func: 'MOVEXY',
      count: 1,
      face: null,
      from: null,
      x: 0,
      y: 0,
      snapToGrid: true,
      resetOwner: true
    };
  }

  getDisplayMap() {
    return { face: { 'null': 'unchanged' }, from: { 'null': '?' } };
  }

  isMatching(operation) {
    return operation && operation.func == 'MOVEXY';
  }
}

class RecallRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} cards into {holder}[, owned {owned}][, inHolder {inHolder}][, excluding {excludeCollection}]', [
      new RoutineOperationPopup(),
      new RoutineWidgetIDPopup(),
      new RoutineEnumPopup({ values: [ true, false ] }),
      new RoutineEnumPopup({ values: [ true, false ] }),
      new RoutineStringPopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'RECALL',
      owned: true,
      inHolder: true,
      holder: null,
      excludeCollection: null,
      byDistance: false
    };
  }

  getDisplayMap() {
    return { holder: { 'null': '?' } };
  }

  isMatching(operation) {
    return operation && operation.func == 'RECALL';
  }
}

class ResetRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} widgets using property {property}', [
      new RoutineOperationPopup(),
      new RoutineStringPopup()
    ]);
  }

  getDefaults() {
    return { func: 'RESET', property: 'resetProperties' };
  }

  isMatching(operation) {
    return operation && operation.func == 'RESET';
  }
}

class RotateRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {count} widgets in {holder,collection} by {angle} degrees[, mode {mode}]', [
      new RoutineOperationPopup(),
      new RoutineNumberPopup({ specialValues: [ 'all' ] }),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineNumberPopup({ specialValues: [ 45, 60, 90, 135, 180 ] }),
      new RoutineEnumPopup({ values: [ 'set', 'add' ] })
    ]);
  }

  getDefaults() {
    return {
      func: 'ROTATE',
      count: 1,
      angle: 90,
      mode: 'add',
      holder: null,
      collection: 'DEFAULT'
    };
  }

  isMatching(operation) {
    return operation && operation.func == 'ROTATE';
  }
}

class ScoreRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {property} in {seats}[, round {round}], mode {mode}, value {value}', [
      new RoutineOperationPopup(),
      new RoutineStringPopup(),
      new RoutineWidgetIDPopup(),
      new RoutineNumberPopup({ specialValues: [ null ] }),
      new RoutineEnumPopup({ values: [ 'set', 'inc', 'dec' ] }),
      new RoutineNumberPopup({ specialValues: [ null ] })
    ]);
  }

  getDefaults() {
    return {
      func: 'SCORE',
      mode: 'set',
      property: 'score',
      seats: null,
      round: null,
      value: null
    };
  }

  getDisplayMap() {
    return {
      seats: { 'null': 'every seat' },
      round: { 'null': 'new round' }
    };
  }

  isMatching(operation) {
    return operation && operation.func == 'SCORE';
  }
}

class SetRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {property} of {collection} {relation} {value}', [
      new RoutineOperationPopup(),
      new RoutineStringPopup(),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineEnumPopup({ values: [ '=', '+', '-', '*', '/', '!' ] }),
      new RoutineJSONPopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'SET',
      collection: 'DEFAULT',
      property: 'parent',
      relation: '=',
      value: null
    };
  }

  getDisplayedValue(property) {
    const value = super.getDisplayedValue(property);
    return (property == 'value' && typeof value == 'object' && value !== null) ? JSON.stringify(value) : value;
  }

  isMatching(operation) {
    return operation && operation.func == 'SET';
  }
}

class ShuffleRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {holder,collection}[, mode {mode}][, modeValue {modeValue}]', [
      new RoutineOperationPopup(),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineEnumPopup({ values: [ 'true random', 'overhand', 'riffle', 'reverse', 'seeded' ] }),
      new RoutineNumberPopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'SHUFFLE',
      holder: null,
      collection: 'DEFAULT',
      mode: 'true random',
      modeValue: 1
    };
  }

  isMatching(operation) {
    return operation && operation.func == 'SHUFFLE';
  }
}

class SortRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {holder,collection} by {key}[, reverse {reverse}]', [
      new RoutineOperationPopup(),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineJSONPopup(),
      new RoutineEnumPopup({ values: [ true, false ] })
    ]);
  }

  getDefaults() {
    return {
      func: 'SORT',
      key: 'value',
      reverse: false,
      rearrange: true,
      locales: null,
      options: null,
      holder: null,
      collection: 'DEFAULT'
    };
  }

  getDisplayedValue(property) {
    const value = super.getDisplayedValue(property);
    return (property == 'key' && typeof value == 'object' && value !== null) ? JSON.stringify(value) : value;
  }

  isMatching(operation) {
    return operation && operation.func == 'SORT';
  }
}

class SwaphandsRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} hands among {source}[, interval {interval}][, direction {direction}]', [
      new RoutineOperationPopup(),
      new RoutineHoldersOrCollectionSourcePopup({ specialValues: [ 'all' ] }),
      new RoutineNumberPopup(),
      new RoutineEnumPopup({ values: [ 'forward', 'backward', 'random' ] })
    ]);
  }

  getDefaults() {
    return {
      func: 'SWAPHANDS',
      interval: 1,
      direction: 'forward',
      source: 'all'
    };
  }

  getDisplayMap() {
    return { source: { 'all': 'all seats' } };
  }

  isMatching(operation) {
    return operation && operation.func == 'SWAPHANDS';
  }
}

class TimerRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {timer,collection}, mode {mode}[, value {value}][, seconds {seconds}]', [
      new RoutineOperationPopup(),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineEnumPopup({ values: [ 'pause', 'start', 'toggle', 'set', 'dec', 'inc', 'reset' ] }),
      new RoutineNumberPopup(),
      new RoutineNumberPopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'TIMER',
      value: 0,
      seconds: 0,
      mode: 'toggle',
      timer: null,
      collection: 'DEFAULT'
    };
  }

  isMatching(operation) {
    return operation && operation.func == 'TIMER';
  }
}

class TurnRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} to {turn}, cycle {turnCycle}[, among {source}][, store as {collection}]', [
      new RoutineOperationPopup(),
      new RoutineStringPopup(),
      new RoutineEnumPopup({ values: [ 'forward', 'backward', 'random', 'position', 'seat' ] }),
      new RoutineHoldersOrCollectionSourcePopup({ specialValues: [ 'all' ] }),
      new RoutineStringPopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'TURN',
      turn: 1,
      turnCycle: 'forward',
      source: 'all',
      collection: 'TURN'
    };
  }

  getDefinedCollections() {
    return [ this.operation.collection != null ? this.operation.collection : 'TURN' ];
  }

  getDisplayMap() {
    return { source: { 'all': 'all seats' } };
  }

  isMatching(operation) {
    return operation && operation.func == 'TURN';
  }
}

class UploadRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} a file and store as {variable}', [
      new RoutineOperationPopup(),
      new RoutineStringPopup()
    ]);
  }

  getDefaults() {
    return {
      func: 'UPLOAD',
      variable: 'uploadedFileName',
      fileTypes: [ '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.json', '.mp3', '.wav', '.ogg', '.m4a' ]
    };
  }

  getDefinedVariables() {
    return [ this.operation.variable != null ? this.operation.variable : 'uploadedFileName' ];
  }

  isMatching(operation) {
    return operation && operation.func == 'UPLOAD';
  }
}

class VarRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {variables}', [
      new RoutineOperationPopup(),
      new RoutineJSONPopup()
    ]);
  }

  getDefaults() {
    return { func: 'VAR', variables: {} };
  }

  getDefinedVariables() {
    return Object.keys(this.operation.variables || {});
  }

  getDisplayedValue(property) {
    const value = super.getDisplayedValue(property);
    return property == 'variables' ? JSON.stringify(value) : value;
  }

  isMatching(operation) {
    return operation && operation.func == 'VAR';
  }
}

class VarStringRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('var {variable} = {expression}', [
      new RoutineStringPopup(),
      new RoutineStringPopup()
    ]);
  }

  getDefinedVariables() {
    return [ this.operation.replace(/^var ([^ ]+) .*$/, '$1') ];
  }

  getDisplayedValue(property) {
    if(property == 'variable')
      return this.operation ? this.operation.replace(/^var ([^ ]+) .*$/, '$1') : 'variable';
    if(property == 'expression')
      return this.operation ? this.operation.replace(/^.* = (.*)$/, '$1') : 'expression';
  }

  onNewValue(values) {
    // the operation is a string like "var x = 1", so rebuild it instead of assigning object keys
    const variable = typeof values.variable == 'string' && values.variable !== '' ? values.variable : this.getDisplayedValue('variable');
    const expression = typeof values.expression == 'string' && values.expression !== '' ? values.expression : this.getDisplayedValue('expression');
    this.operation = `var ${variable} = ${expression}`;
    this.notifyChangeListeners(this.operation);
  }

  isMatching(operation) {
    return typeof operation == 'string' && operation.match(/^var /);
  }
}

class UnknownRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{json}', [
      new RoutineFullOperationJSONPopup()
    ]);
  }

  getDisplayedValue(property) {
    return JSON.stringify(this.operation);
  }

  onNewValue(values) {
    // the popup edits the entire operation, so replace it instead of merging keys
    this.notifyChangeListeners(values);
  }

  isMatching(operation) {
    return true;
  }
}

function routineOperationTypes() {
  return [
    new MoveRoutineOperationEditor(),
    new VarStringRoutineOperationEditor(),
    new CountRoutineOperationEditor(),
    new SelectRoutineOperationEditor(),
    new ForeachRoutineOperationEditor(),
    new IfRoutineOperationEditor(),
    new AudioRoutineOperationEditor(),
    new CallRoutineOperationEditor(),
    new CanvasRoutineOperationEditor(),
    new ClickRoutineOperationEditor(),
    new CloneRoutineOperationEditor(),
    new DelayRoutineOperationEditor(),
    new DeleteRoutineOperationEditor(),
    new FlipRoutineOperationEditor(),
    new GetRoutineOperationEditor(),
    new InputRoutineOperationEditor(),
    new LabelRoutineOperationEditor(),
    new MovexyRoutineOperationEditor(),
    new RecallRoutineOperationEditor(),
    new ResetRoutineOperationEditor(),
    new RotateRoutineOperationEditor(),
    new ScoreRoutineOperationEditor(),
    new SetRoutineOperationEditor(),
    new ShuffleRoutineOperationEditor(),
    new SortRoutineOperationEditor(),
    new SwaphandsRoutineOperationEditor(),
    new TimerRoutineOperationEditor(),
    new TurnRoutineOperationEditor(),
    new UploadRoutineOperationEditor(),
    new VarRoutineOperationEditor(),
    new UnknownRoutineOperationEditor()
  ];
}

function getMatchingRoutineOperationEditor(operation) {
  for(const type of routineOperationTypes()) {
    if(type.isMatching(operation))
      return new type.constructor();
  }
  return new UnknownRoutineOperationEditor();
}