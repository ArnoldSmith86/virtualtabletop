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
      this.onClose();
      this.moduleDOM.innerHTML = '';
      delete this.moduleDOM;
    } else {
      this.moduleDOM = target;
      $('#editor').classList.add('moduleActive');
      target.classList.add('active');
      target.classList.add(this.icon);
      this.buttonDOM.classList.add('active');
      this.renderModule(target);
      this.onSelectionChanged(selectedWidgets, []);
    }

    setScale();
  }

  onClose() {
  }

  onDeltaReceived(delta) {
    if(this.moduleDOM)
      this.onDeltaReceivedWhileActive(delta);
  }

  onDeltaReceivedWhileActive(delta) {
  }

  onSelectionChanged(newSelection, oldSelection) {
    if(this.moduleDOM)
      this.onSelectionChangedWhileActive(newSelection, oldSelection);
  }

  onSelectionChangedWhileActive(newSelection, oldSelection) {
  }

  onStateReceived(state) {
    if(this.moduleDOM)
      this.onStateReceivedWhileActive(state);
  }

  onStateReceivedWhileActive(state) {
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

  renderModule(target) {
  }
}
