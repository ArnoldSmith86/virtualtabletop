class GridButton extends PersistentToolbarToggleButton {
  constructor() {
    super('grid_4x4', 'Grid', 'Toggle grid lines.');
  }

  toggle(state) {
    $('body').classList.toggle('gridLines', state);
    document.querySelectorAll('#majorGridLinesV1, #majorGridLinesV2, #majorGridLinesH1, #majorGridLinesH2').forEach(el => {
      el.classList.toggle('majorLinesHidden', !state);
    });
  }
}