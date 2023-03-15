let toolbarButtons = null;
let dragToolbarButtons = null;
let sidebarModules = null;

function initializeEditor() {
  registerSelectionEventHandlers();

  renderToolbar(toolbarButtons = [
    new NewButton(),
    new SaveButton(),
    new DarkModeButton(),
    new FullscreenButton(),
    new CloseButton(),

    new ToolbarDivider(),

    new SelectModeButton(),

    new ToolbarDivider(),

    new DeleteButton(),
    new AlignToLeftButton(),
    new AlignToCenterButton(),
    new AlignToRightButton(),
    new AlignToTopButton(),
    new AlignToMiddleButton(),
    new AlignToBottomButton(),
    new HorizontalDistributeButton(),
    new VerticalDistributeButton(),
    new LayerOrderButton()
  ]);

  renderDragToolbar(dragToolbarButtons = [
    new DragDragButton(),

    new ToolbarDivider(),

    new CloneDragButton(),
    new SpacingDragButton(),
    new RotateDragButton(),
    new MoveDragButton()
  ]);

  renderSidebar(sidebarModules = [
    new PropertiesModule(),
    new UndoModule(),
    new JsonModule(),
    new TreeModule(),
    new DebugModule()
  ]);
}

function renderToolbar(buttons) {
  for(const button of buttons)
    button.render($('#editorToolbar'));
}

function renderDragToolbar(buttons) {
  for(const button of buttons)
    button.render($('#editorDragToolbar'));
}

function renderSidebar(modules) {
  for(const module of modules)
    module.renderButton($('#editorSidebar'));
}

export function getAvailableRoomRectangle() {
  return {
    top: window.innerWidth/window.innerHeight > 1 || window.innerWidth < 700 ? 36 : window.innerHeight/2,
    right: (window.innerWidth/window.innerHeight > 1 && ($('#editor.moduleActive') || $('body.draggingEditorSidebarModule')) ? $('#editorModules') : $('#editorSidebar')).offsetLeft,
    left: 0,
    bottom: window.innerHeight
  };
}


window.addEventListener('keydown', function(e) {
  if(!getEdit())
    return;
  for(const button of toolbarButtons)
    button.onKeyDown(e);
});
