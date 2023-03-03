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

    this.updateLinkedWidgets(delta.player !== undefined);
  }

  applyInitialDelta(delta) {
    super.applyInitialDelta(delta);
    this.updateLinkedWidgets(true);
  }

  childrenFilter(children, acceptPiles) {
    return children.filter(w=>{
      if(acceptPiles && w.get('type') == 'pile')
        return true;

      return compareDropTarget(w, this, true);
    });
  }

  childrenTarget() {
    if (widgets.get(this.get("hand"))) {
      let children = widgets.get(this.get("hand")).children().filter(c=>!c.get('owner') || c.get('owner')==this.get("player"));
      
      //this needs to be improoved so that it can support holders with multiple piles. (allignChildren = false)
      if(children.length == 1 && children[0].get('type') == 'pile')
        children = this.childrenFilter(children[0].children(), false);
      return children
    } else {
      return []
    }
    
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

  updateLinkedWidgets(playerChanged) {
    const scoreboard = widgetFilter(w => w.get('type') == 'scoreboard');
    for(const board of scoreboard)
      board.updateTable();

    if(playerChanged)
      widgetFilter(w=>w.get('onlyVisibleForSeat') || w.get('linkedToSeat') || w.get('type') == 'seat').forEach(wc=>wc.updateOwner());
  }
}
