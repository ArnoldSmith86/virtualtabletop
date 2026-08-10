class TutorialsButton extends ToolbarButton {
  constructor() {
    super('school', 'View tutorials', 'Open tutorials in a new window.');
  }
  
  click() {
    window.open("https://virtualtabletop.io/Tutorials#tutorials", "_blank");
  }
}
