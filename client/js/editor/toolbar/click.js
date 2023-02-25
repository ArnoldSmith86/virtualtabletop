class ClickButton extends ToolbarButton {
  constructor() {
    super('ads_click', 'Click the selected widget as if in play mode.');
  }

  async click() {
    setJEroutineLogging(jeRoutineLogging = true);
    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} clicked ${selectedWidgets.length == 1 ? selectedWidgets[0].id : selectedWidgets.length + ' widgets'} in editor`);
    for(const widget of selectedWidgets)
      await widget.click();
    setJEroutineLogging(jeRoutineLogging = false);
    batchEnd();
  }
}
