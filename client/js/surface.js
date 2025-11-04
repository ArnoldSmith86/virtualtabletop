// representing a DOM element that can contain widgets
class Surface {
  constructor(domElement) {
    this.widgets = new Map();
    this.domElement = domElement;
    
    this.deferredCards = {};
    this.deferredChildren = {};

    this.delta = { s: {} };
    this.deltaChanged = false;
    this.batchDepth = 0;
    this.undoProtocol = [];

    this.maxZ = {};
    this.dropTargets = new Map();
    this.globalUpdateListeners = {};
    this.inheritFromMapping = {};
    this.isInGlobalUpdateRoutine = false;
  }

  addWidget(widget) {
    return addWidget(this, widget);
  }

  async addWidgetLocal(widget) {
    return await addWidgetLocal(this, widget);
  }

  batchEnd() {
    return batchEnd(this);
  }

  batchStart() {
    return batchStart(this);
  }

  generateUniqueWidgetID() {
    return generateUniqueWidgetID(this);
  }

  getMaxZ(layer) {
    return getMaxZ(this, layer);
  }

  removeWidget(widgetID) {
    return removeWidget(this, widgetID);
  }
  
  async removeWidgetLocal(widgetID, keepChildren) {
    return await removeWidgetLocal(this, widgetID, keepChildren);
  }

  async resetMaxZ(layer) {
    return await resetMaxZ(this, layer);
  }

  sendPropertyUpdate(widgetID, property, value) {
    return sendPropertyUpdate(this, widgetID, property, value);
  }

  updateMaxZ(layer, z) {
    updateMaxZ(this, layer, z);
  }

  async updateWidgetId(widget, oldID) {
    return await updateWidgetId(this, widget, oldID);
  }

  widgetFilter(callback) {
    return widgetFilter(this, callback);
  }
}

// FIX REFERENCES TODO
// - widgets
// - deferredCards
// - deferredChildren
// - generateUniqueWidgetID
// - widgetFilter
// - updateWidgetId


// CHECK
// - StateManaged.globalUpdateListeners
// - StateManaged.inheritFromMapping
// - delta management (just do per surface?) - sendPropertyUpdate, sendDelta, batchStart, batchEnd