class DarkModeButton extends ToolbarToggleButton {
  constructor() {
    super('dark_mode', 'Toggle dark mode', 'Toggle between light and dark mode in the editor.');
  }

  toggle(state) {
    $('body').classList.toggle('darkMode', state);
  }
}
