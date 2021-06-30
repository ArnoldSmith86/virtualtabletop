class Seat extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      typeClasses: 'widget seat',
      clickable: true,
      width: 36,
      height: 36,
      movable: false,

      index: 1,
      turn: false,
      player: '',
      display: '',
      displayEmpty: '',
      displayTurn: true,

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
      for(const w of widgetFilter(w=>w.get('type') == 'seat'))
        w.linkedWidgets().forEach(wc=>wc.updateOwner());
  }

  classes() {
    let className = super.classes();

    if(this.get('player') != '')
      className += ' seated';
    if(this.get('turn') && this.get('displayTurn'))
      className += ' turn';

    return className;
  }

  //inactive should go into widgets
  classesProperties() {
    const p = super.classesProperties();
    p.push('player', 'turn', 'displayTurn');
    return p;
  }

  async click(mode='respect') {
    if(!await super.click(mode))
      await this.setPlayer();
  }

  linkedWidgets() {
    return widgetFilter(w=>Array.isArray(w.get('onlyVisibleForSeat')) && w.get('onlyVisibleForSeat').indexOf(this.get('id')) != -1 || w.get('onlyVisibleForSeat') == this.get('id'));
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

}
