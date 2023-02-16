class SidebarModule {
  constructor(icon, title, tooltip) {
    this.icon = icon;
    this.title = title;
    this.tooltip = tooltip;
  }

  click() {
    const target = $('#editorModule');

    if($('#editorSidebar button.active') && $('#editorSidebar button.active') != this.buttonDOM)
      $('#editorSidebar button.active').click();

    if(this.moduleDOM) {
      $('#editor').classList.remove('moduleActive');
      this.moduleDOM.classList.remove('active');
      this.buttonDOM.classList.remove('active');
      delete this.moduleDOM;
    } else {
      this.moduleDOM = target;
      $('#editor').classList.add('moduleActive');
      target.classList.add('active');
      this.buttonDOM.classList.add('active');
      if(this.renderModule)
        this.renderModule(target);
      if(this.onSelectionChangedWhileActive)
        this.onSelectionChangedWhileActive(selectedWidgets, []);
    }

    setScale();
  }

  onDeltaReceived(delta) {
    if(this.moduleDOM && this.onDeltaReceivedWhileActive)
      this.onDeltaReceivedWhileActive(delta);
  }

  onSelectionChanged(newSelection, oldSelection) {
    if(this.moduleDOM && this.onSelectionChangedWhileActive)
      this.onSelectionChangedWhileActive(newSelection, oldSelection);
  }

  onStateReceived(state) {
    if(this.moduleDOM && this.onStateReceivedWhileActive)
      this.onStateReceivedWhileActive(state);
  }

  renderButton(target) {
    const tooltip = document.createElement('span');
    tooltip.innerText = this.tooltip;

    this.buttonDOM = document.createElement('button');
    this.buttonDOM.innerText = this.title;
    this.buttonDOM.setAttribute('icon', this.icon);
    this.buttonDOM.append(tooltip);
    target.append(this.buttonDOM);
    this.buttonDOM.onclick = e=>this.click(e);
  }
}
