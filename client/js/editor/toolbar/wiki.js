class WikiButton extends ToolbarButton {
  constructor() {
    super('help', 'View wiki', 'Open GitHub wiki page in a new window.');
  }
  
  click() {
    window.open("https://github.com/ArnoldSmith86/virtualtabletop/wiki", "_blank");
  }
}
