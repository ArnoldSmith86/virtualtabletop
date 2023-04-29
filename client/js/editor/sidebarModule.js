class SidebarModule {
  constructor(icon, title, tooltip) {
    this.icon = icon;
    this.title = title;
    this.tooltip = tooltip;
  }

  addHeader(text, target) {
    const h = document.createElement('h1');
    h.innerText = text;
    (target || this.moduleDOM).append(h);
  }

  addSubHeader(text, target) {
    const h = document.createElement('h2');
    h.innerText = text;
    (target || this.moduleDOM).append(h);
  }

  click(e) {
    let target = e.ctrlKey ? $('#editorModuleBottomLeft') : $('#editorModuleTopLeft');
    if(e.button == 2)
      target = e.ctrlKey ? $('#editorModuleBottomRight') : $('#editorModuleTopRight');

    if(e.shiftKey)
      target = $('#editorModuleInOverlay');

    this.openInTarget(target);
    e.preventDefault();
  }

  dragStart() {
    $('body').classList.add('draggingEditorSidebarModule');

    for(const module of $a('#editorModules > div, #editorModuleInOverlay')) {
      module.ondragenter = module.ondragover = e=>this.dragEnter(e);
      module.ondragleave = e=>this.dragLeave(e);
      module.ondrop = e=>this.drop(e);
    }

    setScale();
  }

  dragEnd() {
    $('body').classList.remove('draggingEditorSidebarModule');

    for(const module of $a('#editorModules > div, #editorModuleInOverlay'))
      module.ondrop = null;

    setScale();
  }

  dragEnter(e) {
    e.currentTarget.classList.add('dragHighlight');
    e.preventDefault();
  }

  dragLeave(e) {
    e.currentTarget.classList.remove('dragHighlight');
  }

  drop(e) {
    e.currentTarget.classList.remove('dragHighlight');
    this.openInTarget(e.currentTarget);
  }

  onClose() {
  }

  onDeltaReceived(delta) {
    if(this.moduleDOM)
      this.onDeltaReceivedWhileActive(delta);
  }

  onDeltaReceivedWhileActive(delta) {
  }

  onEditorClose() {
    if(this.moduleDOM && this.moduleDOM.id == 'editorModuleInOverlay')
      this.openInTarget();
  }

  onEditorOpen() {
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

  openInTarget(target) {
    if(this.moduleDOM) {
      this.moduleDOM.dataset.currentlyLoaded = '';
      this.moduleDOM.classList.remove('active');
      this.moduleDOM.classList.remove(this.icon);
      this.buttonDOM.classList.remove('active');

      if(this.moduleDOM.id != 'editorModuleInOverlay') {
        $('#editor').classList.remove(this.moduleDOM.id.replace('editorModule', 'has'));

        if(!$('#editorModules > .active')) {
          $('#editor').classList.remove('moduleActive');
          this.moduleDOM.parentNode.classList.remove('active');
        }
      } else {
        showOverlay();
      }

      this.onClose();
      this.moduleDOM.innerHTML = '';
      delete this.moduleDOM;
      this.saveToLocalStorage(null);
    } else {
      if(target.dataset.currentlyLoaded && target.dataset.currentlyLoaded != this.icon)
        $(`#editorSidebar button.active[icon="${target.dataset.currentlyLoaded}"]`).click();

      this.moduleDOM = target;
      this.moduleDOM.dataset.currentlyLoaded = this.icon;

      if(this.moduleDOM.id != 'editorModuleInOverlay') {
        $('#editor').classList.add('moduleActive');
        this.moduleDOM.parentNode.classList.add('active');
        $('#editor').classList.add(this.moduleDOM.id.replace('editorModule', 'has'));
      } else {
        showOverlay('editorModuleOverlay');
      }

      target.classList.add('active');
      target.classList.add(this.icon);
      this.buttonDOM.classList.add('active');
      this.renderModule(target);
      this.onSelectionChanged(selectedWidgets, []);
      this.saveToLocalStorage(target);
    }

    setScale();
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

    this.buttonDOM.draggable = true;
    this.buttonDOM.ondragstart = e=>this.dragStart(e);
    this.buttonDOM.ondragend = e=>this.dragEnd(e);
  }

  renderModule(target) {
  }

  saveToLocalStorage(target) {
    const editorState = JSON.parse(localStorage.getItem('editorState') || '{"modules":{}}');
    if(target)
      editorState.modules[this.title] = target.id
    else
      delete editorState.modules[this.title];
    localStorage.setItem('editorState', JSON.stringify(editorState));
  }
}
