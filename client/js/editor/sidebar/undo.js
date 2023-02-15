class UndoModule extends SidebarModule {
  constructor() {
    super('undo', 'Undo', 'Undo changes from editing or playing.');
  }

  renderModule(target) {
    target.innerText = 'Undo module not implemented yet.';
  }
}
