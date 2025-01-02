class RoutineEditor {
  constructor(routine) {
    this.domElement = document.createElement('div');
    this.domElement.classList.add('routine-editor');
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
    for(const [index, operation] of this.routine.entries()) {
      const routineOperationEditor = new RoutineOperationEditor(operation);
      this.operations.push(routineOperationEditor);
      routineOperationEditor.registerChangeListener(v=>{
        this.routine[index] = v;
        this.notifyChangeListeners(this.routine);
      });
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
  constructor(operation) {
    this.operation = JSON.parse(JSON.stringify(operation));
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
    if(this.operation.func == 'MOVE' && typeof this.operation.count == 'number') {
      const count = document.createElement('input');
      count.type = 'number';
      count.value = this.operation.count;
      count.addEventListener('change', _=>{
        this.operation.count = +count.value;
        this.notifyChangeListeners(this.operation);
      });
      dom.append(count);
    }
    for(const [key, value] of Object.entries(this.operation)) {
      if(key.match(/Routine$/)) {
        dom.append(new RoutineEditor(value).render());
      }
    }
    return dom;
  }
}