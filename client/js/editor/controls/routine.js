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
    }
    this.render();
  }

  registerChangeListener(listener) {
    this.changeListeners.push(listener);
  }

  render() {
    this.domElement.innerHTML = '';
    for(const operation of this.operations) {
      this.domElement.append(operation.render());
    }
    return this.domElement;
  }
}

class RoutineOperationEditor {
  constructor(template, popups) {
    this.changeListeners = [];
    this.template = template;
    this.popups = popups;
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
    if(property.match(/,/)) {
      for(const p of property.split(',')) {
        if(typeof this.operation[p] != 'undefined' || this.getDefaults()[p] !== null)
          return this.getDisplayedValue(p);
      }
      return '?';
    }

    const value = this.operation[property] ?? this.getDefaults()[property];
    if(this.getDisplayMap()[property])
      return this.getDisplayMap()[property][value] ?? value;
    return value;
  }

  notifyChangeListeners(value) {
    for(const listener of this.changeListeners) {
      listener(value);
    }
  }

  registerChangeListener(listener) {
    this.changeListeners.push(listener);
  }

  render() {
    const dom = document.createElement('div');
    this.domElement = dom;
    dom.classList.add('routine-editor-operation');
    dom.innerHTML = this.operation.func || this.operation;

    dom.innerHTML = this.template.replace(/\{([a-zA-Z0-9,]+)\}/g, (match, p)=>`<span class="routine-editor-operation-parameter" data-parameter="${p}">${this.getDisplayedValue(p)}</span>`);
    for(const [ index, span ] of [...$a('span', dom)].entries()) {
      span.addEventListener('click', async _=>{
        this.popups[index].setSource(span);
        this.popups[index].setOperationDetails(this.operation, span.dataset.parameter.split(','), this.widget, this.variables, this.collections);
        const newValues = await newRoutineValues(this.popups[index]);
        Object.assign(this.operation, newValues);
        this.notifyChangeListeners(this.operation);
      });
      span.style.cursor = 'pointer';
    }
    return dom;
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
    super('{func} widgets owned by {owner} in {holder,collection} and store as {variable}', [
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
    return [ this.operation.variable ?? this.getDefaults().variable ];
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
    if(Array.isArray(this.operation.thenRoutine) && this.operation.thenRoutine.length > 0)
      this.renderSubroutine(this.domElement, 'thenRoutine');
    if(Array.isArray(this.operation.elseRoutine) && this.operation.elseRoutine.length > 0) {
      this.domElement.append('ELSE');
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
    this.renderSubroutine(this.domElement, 'loopRoutine');
    return this.domElement;
  }
}

class MoveRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {fillTo,count} widgets from {from,collection} to {to}, flipping them to face {face}', [
      new RoutineOperationPopup(),
      new RoutineNumberPopup({ specialValues: [ 'all' ] }),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineHoldersOrCollectionSourcePopup(),
      new RoutineNumberPopup()
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
      to: { 'null': '?' }
    };
  }

  isMatching(operation) {
    return operation && operation.func == this.getDefaults().func;
  }
}

class SelectRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{func} {max} {type} from {source} having {property} {relation} {value}, {mode} {collection}', [
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
    return [ this.operation.collection ?? 'DEFAULT' ];
  }

  getDisplayMap() {
    return {
      max: { '999999': 'all' },
      source: { 'all': 'all widgets' },
      type: { 'all': 'widgets', 'button': 'buttons', 'canvas': 'canvases', 'card': 'cards', 'deck': 'decks', 'dice': 'dice', 'holder': 'holders', 'label': 'labels', 'pile': 'piles', 'scoreboard': 'scoreboards', 'seat': 'seats', 'spinner': 'spinners', 'timer': 'timers' },
      mode: { 'set': 'set as', 'add': 'add to', 'remove': 'remove from', 'intersect': 'intersect with' }
    };
  }

  isMatching(operation) {
    return operation && operation.func == 'SELECT';
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
      return this.operation.replace(/^var ([^ ]+) .*$/, '$1');
    if(property == 'expression')
      return this.operation.replace(/^.* = (.*)$/, '$1');
  }

  isMatching(operation) {
    return typeof operation == 'string' && operation.match(/^var /);
  }
}

class UnknownRoutineOperationEditor extends RoutineOperationEditor {
  constructor() {
    super('{json}', [
      new RoutineStringPopup()
    ]);
  }

  getDisplayedValue(property) {
    return JSON.stringify(this.operation);
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