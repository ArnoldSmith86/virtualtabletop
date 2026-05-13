import { Widget } from './widget.js';
import { playerName, playerColor } from '../overlays/widget.js';

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
      glowColor: null,
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

    if(this.get('glowColor'))
      css += '; --glowColor:' + this.get('glowColor');

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('color');
    p.push('glowColor');
    return p;
  }

  async setPlayer() {

    const seatColors = ["#000000","#dddddd","#f44336","#f06292","#9c27b0","#3f51b5","#1976d2","#00bcd4",
      "#009688","#4caf50","#8bc34a","#cddc39","#ffeb3b","#ffc107","#ff9800","#bf360c","#795548","#607d8b"];
    const defaultColorOption = seatColors.includes(playerColor) ? playerColor : '#dddddd';
    const seatOverlayEmpty = {
      func: 'INPUT',
      header: 'Enter your name and choice of player color.',
      fields: [
        {type: 'string', label: 'Your Name:', variable: 'name', value: playerName},
        {type: 'palette', label: 'Your Color:', colors: seatColors, variable: 'color', value: defaultColorOption}
      ],
    };
    const seatOverlaySelf = {
      func: 'INPUT',
      header: 'Enter your name and choice of player color.',
      fields: [
        {type: 'string', label: 'Your Name:', variable: 'name', value: playerName},
        {type: 'palette', label: 'Your Color:', colors: seatColors, variable: 'color', value: defaultColorOption},
        {type: 'subtitle', text: 'All done?', css: 'background-color: var(--VTTblue);color:white'},
        {type: 'checkbox', label: 'Stand up from seat', variable: 'leaveSeat', value: false},
      ],
    };
    const seatOverlayOther = {
      func: 'INPUT',
      header: 'Do you want to remove ' + this.get('player') + ' from this seat?',
      cancelButtonText: 'Cancel',
      confirmButtonText: 'Remove',
      fields: []
    };

    try {
      const player = this.get('player');
      const overlay = player == '' ? seatOverlayEmpty : player == playerName ? seatOverlaySelf : seatOverlayOther;
    
      const seatChoices = await this.showInputOverlay(overlay);
    
      if (seatChoices) {
        const { name, color, leaveSeat } = seatChoices.variables;
        if (overlay == seatOverlayOther || leaveSeat) {
          this.set('player', null);
          this.set('color', this.get('colorEmpty'));
        } else {
          this.set('player', name);
          this.set('color', color);
          this.set('glowColor', contrastAnyColor(color, 0.3));
          localStorage.setItem('playerName', name);
          localStorage.setItem('playerColor', color);
          playerName = name;
          playerColor = color;
          // The playerOverlay div is not updating with the new color
        }
      }
    } catch(e) {
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
