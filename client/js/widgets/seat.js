class Seat extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      typeClasses: 'widget seat',
      clickable: true,
      width: 42,
      height: 42,
      movable: false,

      index: 1,
      turn: false,
      player: '',
      display: '',
      displayEmpty: '',
      displayTurn: true,
      hideWhenUnused: false,

      color: '#999999',
      colorEmpty: '#999999',
      layer: 1,
      text: '1'
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.text !== undefined)
      setText(this.domElement, delta.text);
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
    if(this.get('turn') && this.get('displayTurn'))
      className += ' turn';
    if(this.get('hideWhenUnused') && !this.get('player') && widgetFilter(w=>w.get('type') == 'seat' && w.get('player') == playerName).length)
      className += ' foreign';

    return className;
  }

  //inactive should go into widgets
  classesProperties() {
    const p = super.classesProperties();
    p.push('hideWhenUnused', 'player', 'turn', 'displayTurn');
    return p;
  }

  async click(mode='respect') {
    if(!await super.click(mode))
      await this.setPlayer();
  }

  css() {
    let css = super.css();

    if(this.get('color'))
      css += '; --color:' + this.get('color');

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('color');
    return p;
  }

  //need to add a condition here to change the turn if the turn is in a seat that is empty
  async setPlayer() {
    if(this.get('player') == '') {
      var display = this.get('display') || this.get('index')
      if(this.get('display') == 'playerName')
        var display = playerName
      await this.set('player', playerName);
      await this.set('color', playerColor);
      await this.set('text', display)
    } else {
      await this.set('player', '');
      await this.set('color', this.get('colorEmpty') || '#999999');
      await this.set('text', this.get('displayEmpty') || this.get('index'));
    }
  }

  updateLinkedWidgets() {
    for(const seat of widgetFilter(w=>w.get('type') == 'seat')) {
      const inProperty = p=>toArray(p).indexOf(seat.id) != -1;
      widgetFilter(w=>inProperty(w.get('linkedToSeat')) || inProperty(w.get('onlyVisibleForSeat'))).forEach(wc=>wc.updateOwner());
      seat.updateOwner();
    }
  }
}
