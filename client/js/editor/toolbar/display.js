class ToggleDisplayButton extends PersistentToolbarToggleButton {
    constructor() {
      super('visibility', 'Toggle display of hidden widgets', 'Widgets that have "display":false will be alternately hidden and shown in the room.');
    }
  
    toggle(state) {
      $('body').classList.toggle('showHiddenWidgets', state);
    }
  }