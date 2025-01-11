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

  getCollectionsOfOperation(operation) {
    if(!operation)
      return [];

    if(operation.func == 'SELECT')
      return [ operation.collection ?? 'DEFAULT' ];

    return [];
  }

  getVariablesOfOperation(operation) {
    if(!operation)
      return [];

    if(typeof operation == 'string') {
      const match = operation.match(/^var ((?:[a-zA-Z0-9_-]|\\\\u[0-9a-fA-F]{4})+) /);
      if(match)
        return [ match[1] ];
    }

    if(operation.func == 'COUNT')
      return [ operation.variable ?? 'COUNT' ];

    if(operation.func == 'GET')
      return [ operation.variable ?? operation.property ?? 'id' ];

    return [];
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
      const routineOperationEditor = new RoutineOperationEditor(this.widget, operation, variables, collections);
      this.operations.push(routineOperationEditor);
      routineOperationEditor.registerChangeListener(v=>{
        this.routine[index] = v;
        this.notifyChangeListeners(this.routine);
      });

      // add variables of operation to variables
      variables = [...new Set([...variables, ...this.getVariablesOfOperation(operation)])];
      // add collections of operation to collections
      collections = [...new Set([...collections, ...this.getCollectionsOfOperation(operation)])];
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
  constructor(widget, operation, variables, collections) {
    this.widget = widget;
    this.operation = JSON.parse(JSON.stringify(operation));
    this.variables = variables;
    this.collections = collections;
    this.changeListeners = [];
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
    dom.classList.add('routine-editor-operation');
    dom.innerHTML = this.operation.func || this.operation;
    if(this.operation.func == 'MOVE') {
      const template = '➡️ MOVE {count:number} widgets from {from:string} to {to:string}';
      dom.innerHTML = template.replace(/\{([a-zA-Z]+):([a-zA-Z]+)\}/g, (match , p1, p2)=>`<span class="routine-editor-operation-parameter">${this.operation[p1]}</span>`);
      $('span', dom).addEventListener('click', async _=>{
        const value = await newRoutineValue(new RoutineNumberPopup($('span', dom), this.operation.func, 'count', this.widget, this.variables, this.collections, { specialValues: [ 'all' ] }));
        this.operation.count = value;
        this.notifyChangeListeners(this.operation);
      });
      $('span', dom).style.cursor = 'pointer';
    }
    for(const [key, value] of Object.entries(this.operation)) {
      if(key.match(/Routine$/)) {
        const routineEditor = new RoutineEditor(this.widget, value, this.variables, this.collections);
        routineEditor.registerChangeListener(v=>{
          this.operation[key] = v;
          this.notifyChangeListeners(this.operation);
        });
        dom.append(routineEditor.render());
      }
    }
    return dom;
  }
}