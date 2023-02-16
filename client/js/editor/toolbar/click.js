class ClickButton extends ToolbarButton {
  constructor() {
    super('ads_click', 'Click the selected widget as if in play mode.');
  }

  async click() {
    setJEroutineLogging(jeRoutineLogging = true);
    for(const widget of selectedWidgets)
      await widget.click();
    setJEroutineLogging(jeRoutineLogging = false);
  }
}
