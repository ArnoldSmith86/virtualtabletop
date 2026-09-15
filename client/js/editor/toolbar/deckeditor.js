// Set when this button renders so the deck editor can keep the button's pressed state in sync no matter
// how it was opened or closed (this button, the properties module, Escape, a game switch).
let deckEditorToolbarButton = null;

class DeckEditorButton extends ToolbarToggleButton {
  constructor() {
    super('style', 'Deck editor', 'Open or close the deck editor to design a deck visually.');
    deckEditorToolbarButton = this;
  }

  // Toggle based on the deck editor's actual open state rather than this.active, so it stays correct even
  // when the editor was opened/closed by something other than this button.
  async click() {
    if(deckEditor.isOpen())
      await deckEditor.close();
    else
      await deckEditor.openBestDeck();
    this.syncState();
  }

  syncState() {
    if(this.domElement)
      this.setState(deckEditor.isOpen());
  }

  onEditorClose() {
    this.setState(false);
  }
}
