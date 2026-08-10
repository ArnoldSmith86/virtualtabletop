class Seat extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      typeClasses: 'widget seat',
      width: 150,
      height: 40,
      movable: false,

      index: 1,
      turn: false,
      skipTurn: false,
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
      setText(this.domElement, displayedText);
    }

    this.updateScoreboards(delta)
    if(delta.player !== undefined)
      this.updateLinkedWidgets();
  }

  applyInitialDelta(delta) {
    super.applyInitialDelta(delta);
    this.updateLinkedWidgets();
  }

  children() {
    if(this.get('hand') && this.get('player') && widgets.has(this.get('hand')))
      return widgetFilter(w=>w.get('parent')==this.get('hand')&&w.get('owner')==this.get('player'));
    return [];
  }

  classes(includeTemporary=true) {
    let className = super.classes(includeTemporary);

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
      await this.set('player', playerName);
      await this.set('color', playerColor);
    } else {
      await this.set('player', null);
      await this.set('color', this.get('colorEmpty'));
    }
  }

  updateAfterShuffle() {
    if(this.get('hand') && widgets.has(this.get('hand')))
      widgets.get(this.get('hand')).updateAfterShuffle();
  }

  updateScoreboards(delta) {
    const seatID = this.get('id');
    const scoreboard = widgetFilter(w => w.get('type') == 'scoreboard');
    const deltaProps = Object.keys(delta);
    for(const board of scoreboard) {
      const boardProps = board.seatProperties(seatID);
      if(boardProps.some(p=>deltaProps.includes(p)))
        board.updateTable();
    }
  }

  updateLinkedWidgets() {
    widgetFilter(w=>w.get('onlyVisibleForSeat') || w.get('linkedToSeat') || w.get('showInactiveFaceToSeat') || w.get('type') == 'seat').forEach(wc=>wc.updateOwner());
  }
}
