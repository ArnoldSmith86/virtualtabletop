class DarkModeButton extends ToolbarButton {
  constructor() {
    super('dark_mode', 'Toggle between light and dark mode in the editor.');
  }

  async click() {
    $('body').classList.toggle('darkMode');
  }
}
