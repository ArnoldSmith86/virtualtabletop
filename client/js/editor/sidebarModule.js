class SidebarModule {
  constructor(icon, title, tooltip) {
    this.icon = icon;
    this.title = title;
    this.tooltip = tooltip;
  }

  click(e) {
    let target = e.ctrlKey ? $('#editorModuleBottomLeft') : $('#editorModuleTopLeft');
    if(e.button == 2)
      target = e.ctrlKey ? $('#editorModuleBottomRight') : $('#editorModuleTopRight');

    if(this.moduleDOM) {
      this.moduleDOM.dataset.currentlyLoaded = '';
      this.moduleDOM.classList.remove('active');
      this.moduleDOM.classList.remove(this.icon);
      this.buttonDOM.classList.remove('active');
      $('#editor').classList.remove(this.moduleDOM.id.replace('editorModule', 'has'));

      if(!$('#editorModules > .active')) {
        $('#editor').classList.remove('moduleActive');
        this.moduleDOM.parentNode.classList.remove('active');
      }

      this.onClose();
      this.moduleDOM.innerHTML = '';
      delete this.moduleDOM;
    } else {
      if(target.dataset.currentlyLoaded && target.dataset.currentlyLoaded != this.icon)
        $(`#editorSidebar button.active[icon="${target.dataset.currentlyLoaded}"]`).click();

      this.moduleDOM = target;
      this.moduleDOM.dataset.currentlyLoaded = this.icon;
      $('#editor').classList.add('moduleActive');
      this.moduleDOM.parentNode.classList.add('active');
      $('#editor').classList.add(this.moduleDOM.id.replace('editorModule', 'has'));
      target.classList.add('active');
      target.classList.add(this.icon);
      this.buttonDOM.classList.add('active');
      this.renderModule(target);
      this.onSelectionChanged(selectedWidgets, []);
    }

    setScale();
    e.preventDefault();
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
    this.buttonDOM.oncontextmenu = e=>this.click(e);
  }

  renderModule(target) {
  }
}
