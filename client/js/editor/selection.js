let selectedWidgets = [];

export function editClick(widget) {
  const previousSelectedWidgets = [...selectedWidgets];
  selectedWidgets = [ widget ];

  for(const button of toolbarButtons)
    button.onSelectionChanged(selectedWidgets, previousSelectedWidgets);
  for(const module of sidebarModules)
    module.onSelectionChanged(selectedWidgets, previousSelectedWidgets);
}

export function editorReceiveDelta(delta) {
  for(const module of sidebarModules)
    module.onDeltaReceived(delta);
}

function receiveStateFromServer(state) {
  for(const module of sidebarModules) {
    module.onSelectionChanged(selectedWidgets, []);
    module.onStateReceived(state);
  }
  selectedWidgets = [];
}

function registerSelectionEventHandlers() {
  onMessage('state', receiveStateFromServer);
}
