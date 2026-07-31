let toolbarButtons = null;
let dragToolbarButtons = null;
let sidebarModules = null;

let fullToolbarWidth = 0;

function initializeEditor(currentMetaData) {
  registerSelectionEventHandlers();

  renderToolbar(toolbarButtons = [
    new NewButton(),
    new SaveButton(),
    new DarkModeButton(),
    new FullscreenButton(),
    new GridButton(),
    new CloseButton(),

    new ToolbarDivider(),

    new UndoButton(),
    new SelectModeButton(),
    new ZoomOutButton(),
    new ToggleDisplayButton(),
    new SeatViewButton(),

    new ToolbarDivider(),

    new AddButton(),
    new DeleteButton(),

    new ToolbarDivider(),

    new AlignToLeftButton(),
    new AlignToCenterButton(),
    new AlignToRightButton(),
    new AlignToTopButton(),
    new AlignToMiddleButton(),
    new AlignToBottomButton(),
    new HorizontalDistributeButton(),
    new VerticalDistributeButton(),
    new LayerOrderButton(),

    new ToolbarDivider(),

    new GroupButton(),

    new ToolbarDivider(),

    new DeckEditorButton(),

    new ToolbarDivider(),

    new TutorialsButton(),
    new WikiButton()
    
  ]);

  renderDragToolbar(dragToolbarButtons = [
    new DragDragButton(),
    new SettingsDragButton(),

    new ToolbarDivider(),

    new CloneDragButton(),
    new SpacingDragButton(),
    new RotateDragButton(),
    new ResizeDragButton(false),
    new ResizeDragButton(true),
    new MoveDragButton()
  ]);

  renderSidebar(sidebarModules = [
    new PropertiesModule(),
    new UndoModule(),
    new JsonModule(),
    new WidgetsModule(),
    new DebugModule(),
    new AssetsModule(),
    new ToolboxModule(),
    new GameSettingsModule()
  ]);

  onMessage('meta', metaReceived);
  metaReceived(currentMetaData);

  openEditor();
}

function metaReceived(data) {
  for(const module of sidebarModules)
    module.onMetaReceived(data);
  for(const button of toolbarButtons)
    button.onMetaReceived(data);
}

export function openEditor() {
  for(const module of sidebarModules)
    module.onEditorOpen();
  for(const button of toolbarButtons)
    button.onEditorOpen();
}

function closeEditor() {
  setJEroutineLogging(jeRoutineLogging = false);

  deckEditor.close();

  for(const module of sidebarModules)
    module.onEditorClose();
  for(const button of toolbarButtons)
    button.onEditorClose();

  $('#activeGameButton').click();
  setScale();
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
  const state = JSON.parse(localStorage.getItem('editorState') || '{"modules":{}}').modules;
  for(const module of modules) {
    module.renderButton($('#editorSidebar'));
    if(state[module.title] && state[module.title] != 'editorModuleInOverlay' && $(`#${state[module.title]}`))
      module.openInTarget($(`#${state[module.title]}`));
  }

  editorModulesResizer();
}

function editorModulesResizer() {
  const editorState = JSON.parse(localStorage.getItem('editorState') || '{"modules":{}}');

  let mouseReference;
  let resizerReference;
  let percentage = editorState.modulesWidth || 50;
  // On the root element (not #editorModules) so the deck editor can mirror the module panel's width.
  document.documentElement.style.setProperty('--modulesWidth', percentage + '%');

  function resize(e) {
    percentage = (1 - e.x / window.innerWidth) * 100;
    document.documentElement.style.setProperty('--modulesWidth', percentage + '%');
    setScale();
  }

  $('#editorModulesResizer').onmousedown = function(e) {
    mouseReference = e.x;
    resizerReference = $('#jeTree').offsetHeight;
    document.addEventListener('mousemove', resize, false);
    $('body').classList.add('editorModulesResizing');
  }

  document.addEventListener('mouseup', function() {
    const editorState = JSON.parse(localStorage.getItem('editorState') || '{"modules":{}}');
    editorState.modulesWidth = percentage;
    localStorage.setItem('editorState', JSON.stringify(editorState));

    document.removeEventListener('mousemove', resize, false);
    $('body').classList.remove('editorModulesResizing');
  });
}

function hint(html) {
  const div = document.createElement('div');
  div.className = 'hintUI';
  div.innerHTML = `<button icon=help></button><span>${html}</span>`;
  $('button', div).onclick = e=>div.classList.toggle('active');
  return div;
}

export function getAvailableRoomRectangle() {
  // The deck editor's "Card view" toggle turns its card stage into a window onto the room, so while it is off
  // the room is fitted into exactly that window instead of into the whole (mostly covered) play area.
  if(deckEditor.isOpen() && deckEditor.roomVisible) {
    const stage = $('#deckEditorMain').getBoundingClientRect();
    return { top: stage.top, right: stage.right, left: stage.left, bottom: stage.bottom };
  }
  return {
    top: window.innerWidth/window.innerHeight > 1 || window.innerWidth < 700 ? $('#editorToolbar').getBoundingClientRect().bottom : window.innerHeight/2,
    right: (window.innerWidth/window.innerHeight > 1 && ($('#editor.moduleActive') || $('body.draggingEditorSidebarModule')) ? $('#editorModules') : $('#editorSidebar')).offsetLeft,
    left: 0,
    bottom: window.innerHeight
  };
}


export function scaleHasChanged(scale) {
  if(selectedWidgets.length && selectionModeActive)
    updateDragToolbar();

  // The deck editor spans the play area, so module panel open/close and the modules resizer change its size.
  if(deckEditor.isOpen()) {
    deckEditor.renderMain();
    deckEditor.updateDragToolbar();
  }

  if(!fullToolbarWidth)
    fullToolbarWidth = $('#editorToolbar > :last-child').getBoundingClientRect().right + 1;
  $('body').classList.toggle('compactEditorToolbar', window.innerWidth < fullToolbarWidth);
  document.documentElement.style.setProperty('--editToolbarHeight', $('#editorToolbar').getBoundingClientRect().bottom + 'px');
}

window.addEventListener('keydown', function(e) {
  if(!getEdit() || deckEditor.isOpen())
    return;

  if([ 'TEXTAREA', 'INPUT' ].indexOf(e.target.tagName) != -1 || e.target.isContentEditable)
    return;

  for(const button of toolbarButtons)
    button.onKeyDown(e);
});
