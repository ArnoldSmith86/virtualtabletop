class SidebarModule {
  constructor(icon, title, tooltip) {
    this.icon = icon;
    this.title = title;
    this.tooltip = tooltip;
  }

  click() {
    const target = $('#editorModule');

    if($('#editorSidebar button.active') && $('#editorSidebar button.active') != this.domElement)
      $('#editorSidebar button.active').click();

    if(this.activeIn) {
      $('#editor').classList.remove('moduleActive');
      this.activeIn.classList.remove('active');
      this.domElement.classList.remove('active');
      delete this.activeIn;
    } else {
      this.activeIn = target;
      $('#editor').classList.add('moduleActive');
      target.classList.add('active');
      this.domElement.classList.add('active');
      this.renderModule(target);
    }

    setScale();
  }

  renderButton(target) {
    const tooltip = document.createElement('span');
    tooltip.innerText = this.tooltip;

    this.domElement = document.createElement('button');
    this.domElement.innerText = this.title;
    this.domElement.setAttribute('icon', this.icon);
    this.domElement.append(tooltip);
    target.append(this.domElement);
    this.domElement.onclick = e=>this.click(e);
  }
}
