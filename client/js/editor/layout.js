let toolbarButtons = null;
let dragToolbarButtons = null;
let editSidebarModules = null;
let auxiliarySidebarModules = null;
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

    new TutorialsButton(),
    new WikiButton()
    
  ]);

  renderDragToolbar(dragToolbarButtons = [
    new DragDragButton(),

    new ToolbarDivider(),

    new CloneDragButton(),
    new SpacingDragButton(),
    new RotateDragButton(),
    new ResizeDragButton(false),
    new ResizeDragButton(true),
    new MoveDragButton()
  ]);

  renderSidebar(editSidebarModules = [
    new PropertiesModule(),
    new JsonModule(),
    new AssetsModule()
  ], 'Edit');

  renderSidebar(auxiliarySidebarModules = [
    new UndoModule(),
    new TreeModule(),
    new DebugModule(),
    new ToolboxModule()
  ], 'Auxiliary');

  sidebarModules = [ ...editSidebarModules, ...auxiliarySidebarModules ];

  onMessage('meta', metaReceived);
  metaReceived(currentMetaData);

  openEditor();
}

function metaReceived(data) {
  for(const module of editSidebarModules)
    module.onMetaReceived(data);
  for(const button of toolbarButtons)
    button.onMetaReceived(data);
}

export function openEditor() {
  setJEroutineLogging(jeRoutineLogging = true);
  for(const module of editSidebarModules)
    module.onEditorOpen();
  for(const button of toolbarButtons)
    button.onEditorOpen();
}

function closeEditor() {
  setJEroutineLogging(jeRoutineLogging = false);

  for(const module of editSidebarModules)
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

function renderSidebar(modules, className) {
  const state = JSON.parse(localStorage.getItem('editorState') || '{"modules":{}}').modules;
  for(const module of modules) {
    module.renderButton($(`#editor${className}Sidebar`));
    if(state[module.title] && state[module.title] != 'editorModuleInOverlay' && $(`#editor${className}Module`))
      module.openInTarget($(`#editor${className}Module`));
  }

  editorModulesResizer();
}

function editorModulesResizer() {
  const editorState = JSON.parse(localStorage.getItem('editorState') || '{"modules":{}}');

  let mouseReference;
  let resizerReference;
  let percentage = editorState.modulesWidth || 50;
  $('#editorSidebar').style.setProperty('--modulesWidth', percentage + '%');

  function resize(e) {
    percentage = (1 - e.x / window.innerWidth) * 100;
    $('#editorSidebar').style.setProperty('--modulesWidth', percentage + '%');
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
  return {
    top: window.innerWidth/window.innerHeight > 1 || window.innerWidth < 700 ? $('#editorToolbar').getBoundingClientRect().bottom : window.innerHeight/2,
    right: (window.innerWidth/window.innerHeight > 1 && ($('#editor.moduleActive') || $('body.draggingEditorSidebarModule')) ? $('#editorSidebar') : $('#editorSidebar')).offsetLeft,
    left: 0,
    bottom: window.innerHeight
  };
}


export function scaleHasChanged(scale) {
  if(selectedWidgets.length && selectionModeActive)
    updateDragToolbar();

  if(!fullToolbarWidth)
    fullToolbarWidth = $('#editorToolbar > :last-child').getBoundingClientRect().right + 1;
  $('body').classList.toggle('compactEditorToolbar', window.innerWidth < fullToolbarWidth);
  document.documentElement.style.setProperty('--editToolbarHeight', $('#editorToolbar').getBoundingClientRect().bottom + 'px');
}

window.addEventListener('keydown', function(e) {
  if(!getEdit())
    return;

  if([ 'TEXTAREA', 'INPUT' ].indexOf(e.target.tagName) != -1 || e.target.isContentEditable)
    return;

  for(const button of toolbarButtons)
    button.onKeyDown(e);
});
