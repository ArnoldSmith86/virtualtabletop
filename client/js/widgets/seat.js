class Seat extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      typeClasses: 'widget seat',
      clickable: true,
      width: 150,
      height: 40,
      movable: false,

      index: 1,
      turn: false,
      player: '',
      display: 'playerName',
      displayEmpty: 'click to sit',
      hideTurn: false,
      hideWhenUnused: false,
      hand: 'hand',

      color: '#999999',
      colorEmpty: '#999999',
      layer: -1,
      borderRadius: 5
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.index !== undefined || delta.player !== undefined || delta.display !== undefined || delta.displayEmpty !== undefined) {
      const display = this.get('player') != '' ? this.get('display') : this.get('displayEmpty');
      let displayedText = String(display || '')
      displayedText = displayedText.replaceAll('seatIndex',this.get('index'))
      displayedText = displayedText.replaceAll('playerName',this.get('player'))
      setText(this.domInner, displayedText);
      this.domBox.setAttribute('data-text', displayedText);
    }
    if(delta.player !== undefined)
      this.updateLinkedWidgets();
  }

  applyInitialDelta(delta) {
    super.applyInitialDelta(delta);
    this.updateLinkedWidgets();
  }

  classes() {
    let className = super.classes();

    if(this.get('player') != '')
      className += ' seated';
    if(this.get('turn') && !this.get('hideTurn'))
      className += ' turn';
    if(this.get('hideWhenUnused') && !this.get('player') && widgetFilter(w=>w.get('type') == 'seat' && w.get('player') == playerName).length)
      className += ' foreign';

    return className;
  }

  classesProperties() {
    const p = super.classesProperties();
    p.push('hideWhenUnused', 'player', 'turn', 'hideTurn');
    return p;
  }

  async click(mode='respect') {
    if(!await super.click(mode))
      await this.setPlayer();
  }

  cssBox() {
    let css = super.cssBox();

    if(this.get('color'))
      css += '; --color:' + this.get('color');

    return css;
  }

  cssBoxProperties() {
    const p = super.cssBoxProperties();
    p.push('color');
    return p;
  }

  //need to add a condition here to change the turn if the turn is in a seat that is empty
  async setPlayer() {
    if(this.get('player') == '') {
      await this.set('player', playerName);
      await this.set('color', playerColor);
    } else {
      await this.set('player', null);
      await this.set('color', this.get('colorEmpty'));
    }
  }

  updateLinkedWidgets() {
    for(const seat of widgetFilter(w=>w.get('type') == 'seat')) {
      const inProperty = p=>asArray(p).indexOf(seat.id) != -1;
      widgetFilter(w=>inProperty(w.get('linkedToSeat')) || inProperty(w.get('onlyVisibleForSeat'))).forEach(wc=>wc.updateOwner());
      seat.updateOwner();
    }
  }
}
