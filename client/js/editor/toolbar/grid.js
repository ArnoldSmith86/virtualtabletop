class GridButton extends PersistentToolbarToggleButton {
  constructor() {
    super('grid_4x4', 'Grid', 'Toggle grid lines.');
  }

  toggle(state) {
    $('body').classList.toggle('gridLines25', state);
  }
}