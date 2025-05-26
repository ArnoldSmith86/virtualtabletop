class GameSettingsModule extends SidebarModule {
  constructor() {
    super('settings', 'Game Settings', 'Settings like legacy modes for the current game.');
  }

  addCheckbox(text, name, target) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = name;
    checkbox.id = name;
    checkbox.checked = legacyMode(name);
    checkbox.addEventListener('change', e=>{
      legacyMode(name, e.target.checked);
    });
    target.append(checkbox);
    target.append(document.createTextNode(text));
    target.append(document.createElement('br'));
  }

  onMetaReceivedWhileActive(meta) {
    this.renderModule(this.moduleDOM);
  }

  onStateReceivedWhileActive(state) {
    this.renderModule(this.moduleDOM);
  }

  renderModule(target) {
    target.innerHTML = '';
    this.addHeader('Game Settings');

    this.addSubHeader('Legacy Modes');
    this.addCheckbox('Convert numeric var parameters to numbers', 'convertNumericVarParametersToNumbers', target);
    this.addCheckbox('Use one as default for var parameters', 'useOneAsDefaultForVarParameters', target);
  }
}
