import { $, $a, div, removeFromDOM, asArray, escapeID } from '../domhelpers.js';
import { expressionNumber } from '../expression.js';
import { Widget } from './widget.js';

// The surfaces a score can be entered on. 'auto' asks the device - a finger
// gets the keypad, a keyboard gets the cell itself - and lets the player's own
// choice on this browser overrule that; the other values name one surface for
// everybody at the table.
const scoreEntryModes = [ 'auto', 'cell', 'keypad', 'type' ];

// The keypad, row by row: the digit block, with the corrections and the two
// operators a score sheet is added up with beside it. A key whose face is not
// what it types - the minus sign is drawn properly and types a hyphen - says so
// in 'value'.
const keypadKeys = [
  [ { text: '7' }, { text: '8' }, { text: '9' }, { icon: 'backspace', action: 'delete', title: 'Delete the last character' } ],
  [ { text: '4' }, { text: '5' }, { text: '6' }, { text: '+', title: 'Add' } ],
  [ { text: '1' }, { text: '2' }, { text: '3' }, { text: '\u2212', value: '-', title: 'Subtract, or a negative score' } ],
  [ { text: '.' }, { text: '0' }, { text: 'C', action: 'clear', title: 'Clear' }, { icon: 'check', action: 'enter', title: 'Enter the score' } ]
];

// What a key of a physical keyboard does on the open keypad, so that a player
// on a device with both does not have to aim for the buttons. Everything the
// keypad itself offers, and the comma that a numeric block types on a good many
// layouts; anything else is left to the room.
function keypadKeyFor(key) {
  if(/^[0-9+-]$/.test(key))
    return key;
  if(key == '.' || key == ',')
    return '.';
  return { Enter: 'enter', Escape: 'cancel', Backspace: 'delete', Delete: 'clear', c: 'clear', C: 'clear' }[key] || null;
}

export class Scoreboard extends Widget {
  constructor(object, surface) {
    super(object, surface);

    this.addDefaults({
      movable: true,
      width: 300,
      height: 200,
      layer: -1,
      typeClasses: 'widget scoreboard',
      playersInColumns: true,
      rounds: null,
      roundLabel: 'Round',
      totalsLabel: 'Totals',
      scoreProperty: 'score',
      scoreEntry: 'auto',
      firstColWidth: 50,
      verticalHeader: false,
      seats: null,
      showAllRounds: false,
      showAllSeats: false,
      showPlayerColors: true,
      showTotals: true,
      sortField: 'index',
      sortAscending: true,
      currentRound: null,
      autosizeColumns: true,
      borderRadius: 8,
      editPaneTitle: 'Set score'
    });

    // mousehandling.js calls click() without the event, so the cell a press
    // landed on is noted here and read when the click arrives. A press that
    // misses the table notes nothing, so it falls back to the edit pane instead
    // of reopening the cell that was pressed before it.
    for(const event of [ 'mousedown', 'touchstart' ])
      this.domElement.addEventListener(event, e=>this.pressedCellDOM = e.target.closest('td'));
  }

  applyRemove() {
    // the surfaces are anchored in #roomArea rather than inside the widget, so
    // removing the board does not take them with it
    this.closeEntrySurface();
    super.applyRemove();
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    const updateTableProps = [
      'showTotals',
      'scoreEntry',
      'clickable',
      'clickRoutine',
      'scoreProperty',
      'sortField',
      'totalsLabel',
      'roundLabel',
      'showPlayerColors',
      'currentRound',
      'playersInColumns',
      'seats',
      'showAllSeats',
      'sortAscending',
      'rounds',
      'showAllRounds',
      'verticalHeader'
    ]
    if(Object.keys(delta).some(k=>updateTableProps.includes(k)))
      this.updateTable();
  }

  classes(includeTemporary=true) {
    let className = super.classes(includeTemporary);

    if(this.get('autosizeColumns'))
      className += ' equalWidth';

    if(this.get('verticalHeader'))
      className += ' verticalHeader';

    return className;
  }

  classesProperties() {
    const p = super.classesProperties();
    p.push('autosizeColumns', 'verticalHeader');
    return p;
  }

  async click(mode='respect') {
    if(!await super.click(mode))
      await this.enterScore();
  }

  // A click that landed on a score cell opens the surface the board asks for;
  // one that did not - a hotkey, a CLICK operation, a press on a header - has no
  // cell to start from and falls back to the pane, which brings its own.
  async enterScore() {
    const cell = this.pressedCell();
    const mode = cell ? this.scoreEntryMode() : 'cell';
    if(mode == 'cell')
      await this.showScorePane(cell);
    else
      this.openEntrySurface(mode, cell);
  }

  // Whether a click on a cell starts entering a score: a board that is not
  // clickable is a printed table, and one with a clickRoutine has its own
  // answer to a click.
  cellEntryEnabled() {
    return !!this.get('clickable') && !Array.isArray(this.get('clickRoutine'));
  }

  // Whether the table offers the round after the last one that has been scored
  // as an extra row. Only a board whose cells are entered into needs one - the
  // edit pane offers that round in its round list, so a board that asks for it
  // keeps the table it has always had.
  nextRoundOffered() {
    return this.cellEntryEnabled() && this.get('scoreEntry') != 'cell';
  }

  // Which surface a cell opens. A board that names one gets it everywhere;
  // 'auto' hands the decision to the device the player is holding, and to the
  // player, who can switch surfaces from the surface itself.
  scoreEntryMode() {
    const mode = this.get('scoreEntry');
    if(scoreEntryModes.includes(mode) && mode != 'auto')
      return mode;
    return this.playerScoreEntry() || (typeof matchMedia == 'function' && matchMedia('(pointer: coarse)').matches ? 'keypad' : 'type');
  }

  // The surface this player last switched to, on this browser. It only applies
  // where the board left the choice open, so it never overrules a game that
  // deliberately picked one.
  playerScoreEntry() {
    try {
      const pinned = localStorage.getItem('scoreEntry');
      return pinned == 'keypad' || pinned == 'type' ? pinned : null;
    } catch(e) {
      return null; // a browser that refuses storage still gets the device's answer
    }
  }

  pinPlayerScoreEntry(mode) {
    try {
      localStorage.setItem('scoreEntry', mode);
    } catch(e) {}
  }

  async showScorePane(cell) {
    const address = cell && this.cellAddress(cell);
    const scoreProperty = this.get('scoreProperty');
    const seats = this.getIncludedSeats();
    const seatsArray = Array.isArray(seats)? seats : [];
    let players = [];
    if(Array.isArray(seats))
      players = seats.map(function(s) { return { value: s.get('id'), text: s.get('player') || '-', selected: s.get('player') == playerName }; });
    else { // Teams
      for (const team in seats) {
        players = players.concat(seats[team].map(function(s) { return { value: s.get('id'), text: `${s.get('player') || '-'} (${team})`, selected: s.get('player') == playerName } }));
        seatsArray.push(...seats[team]);
      }
    }

    let rounds = this.getRounds(seats, scoreProperty, 1).map(function(r, i) { return { text: r, value: i+1 }; });
    const everyPlayerFilledLatestRound = !seatsArray.map(s=>(s.get(scoreProperty) || []).length != rounds.length - 1).reduce((a,b)=>a||b, false);

    if(this.totalsOnly)
      rounds = [{text: this.get('totalsLabel'), value: 0}];

    if(!players.length || !rounds.length)
      return;

    try {
      const result = await this.showInputOverlay({
        header: this.get('editPaneTitle'),
        fields: [
          {
            type: 'select',
            label: 'Player',
            options: players,
            variable: 'player',
            value: address ? address.seat.get('id') : null
          },
          {
            type: 'select',
            label: this.get('roundLabel'),
            options: rounds,
            variable: 'round',
            value: address ? address.round : (everyPlayerFilledLatestRound ? rounds.length : rounds.length - 1)
          },
          {
            type: 'number',
            label: 'Value',
            variable: 'score',
            value: address ? this.cellText(address) : undefined
          }
        ]
      });
      await this.setCellScore({ seat: widgets.get(result.variables.player), round: this.totalsOnly ? 0 : +result.variables.round }, +result.variables.score);
    } catch(e) {
      console.log('The input overlay for the scoreboard failed to load.', e);
    }
  }

  // The cell the press that led to this click landed on, read once: the press
  // noted it on the way down, and a click no press of ours preceded - a hotkey,
  // a CLICK operation - finds nothing here. A cell of a table that has been
  // rebuilt since is not one of ours any more either.
  pressedCell() {
    const cell = this.pressedCellDOM;
    this.pressedCellDOM = null;
    return cell && this.tableDOM && this.tableDOM.contains(cell) && this.cellAddress(cell) ? cell : null;
  }

  // The seat and the round a cell holds the score of. Round 0 is the single
  // score of a board that has no rounds at all. Anything else - a header, a
  // computed total, a team column - has no address and cannot be written to.
  cellAddress(cell) {
    if(!cell || !cell.classList.contains('scoreCell') || !widgets.has(cell.dataset.seat))
      return null;
    return { seat: widgets.get(cell.dataset.seat), round: +cell.dataset.round || 0 };
  }

  // Cells are addressed by the seat and the round whose score they show, so
  // that a click finds its way back to the seat property it writes - and so
  // that a game can style a single row or column from its own CSS.
  addressCell(cell, seat, round, enterable) {
    if(!cell || !seat)
      return;
    cell.dataset.seat = seat.get('id');
    if(round)
      cell.dataset.round = round;
    else
      cell.dataset.total = '';
    // the totals column is computed - unless the board has no rounds at all, in
    // which case it is the one score each seat has
    if(enterable && (round || this.totalsOnly && !this.displayedRounds.length))
      cell.classList.add('scoreCell');
  }

  cellFor(seatID, round) {
    if(!this.tableDOM)
      return null;
    for(const cell of $a('td.scoreCell', this.tableDOM))
      if(cell.dataset.seat == seatID && (+cell.dataset.round || 0) == round)
        return cell;
    return null;
  }

  // What is in a cell, as text: the empty string for a round nobody has scored.
  cellText(address) {
    const score = address.seat.get(this.get('scoreProperty'));
    const value = address.round ? (Array.isArray(score) ? score[address.round-1] : undefined) : score;
    return value === undefined || value === null ? '' : String(value);
  }

  // The name of a round as the table shows it, for a surface that says which
  // cell it is entering.
  roundName(round) {
    if(!round)
      return this.get('totalsLabel');
    const name = Array.isArray(this.get('rounds')) ? (this.displayedRounds || [])[round-1] : '';
    return name ? String(name) : `${this.get('roundLabel')} ${round}`;
  }

  // Every surface writes the score through here, which is the line the edit
  // pane has always used: the score stays a property of the seat.
  async setCellScore(address, value) {
    const scoreProperty = this.get('scoreProperty');
    let scores = value;
    if(address.round) {
      const score = address.seat.get(scoreProperty);
      scores = Array.isArray(score) ? [...score] : [];
      // a round nobody has scored yet would be left as a hole in the array,
      // which reads back as undefined instead of as an empty cell
      for(let i=0; i < address.round; i++)
        if(scores[i] === undefined)
          scores[i] = '';
      scores[address.round-1] = value;
    }
    batchStart();
    try {
      setDeltaCause(`${playerName} scored ${address.seat.get('id')}`);
      await address.seat.set(scoreProperty, scores);
    } finally {
      batchEnd();
    }
  }

  // What a player typed, as the value to write: a number - including the
  // arithmetic expressions that dragLimit and the grid conditions already speak
  // ("10+15+8-5") - or the empty string for an entry left empty, which is the
  // erased cell the table renders for a round nobody has scored. Text that is
  // not a score at all is null and is not written anywhere.
  parseScore(text) {
    text = String(text === undefined || text === null ? '' : text).trim();
    return text === '' ? '' : expressionNumber(text, _=>null, null);
  }

  // --- the surfaces a score is entered on ----------------------------------

  openEntrySurface(mode, cell, text) {
    const address = cell && this.cellAddress(cell);
    if(!address)
      return;
    this.closeEntrySurface();
    if(mode == 'keypad')
      this.openKeypad(cell, address, text || '');
    else
      this.openCellInput(cell, address, text !== undefined ? text : this.cellText(address));
  }

  closeEntrySurface() {
    const surface = this.entrySurface;
    this.entrySurface = null;
    if(!surface)
      return;
    if(surface.cleanup)
      surface.cleanup();
    if(surface.dom)
      removeFromDOM(surface.dom);
    surface.cell.classList.remove('entering');
    if(surface.input && surface.cell.contains(surface.input)) {
      removeFromDOM(surface.input);
      surface.cell.innerText = surface.shown;
    }
  }

  // The table is thrown away and rebuilt on every score change, including the
  // one the player just entered - so the open surface is put back on the cell
  // it was on, with what has been typed into it so far.
  reopenEntrySurface(surface) {
    const cell = this.cellFor(surface.seatID, surface.round);
    if(cell)
      this.openEntrySurface(surface.mode, cell, surface.text);
  }

  // A fixed-size overlay beside the cell rather than inside it: the keypad
  // stays thumb-sized whatever the board is scaled to, and #roomArea keeps it
  // within the board.
  anchorToCell(dom, cell) {
    const area = $('#roomArea');
    if(!area)
      return;
    area.appendChild(dom);
    const room = area.getBoundingClientRect();
    const target = cell.getBoundingClientRect();
    const box = dom.getBoundingClientRect();
    let top = target.bottom - room.top + 6;
    if(top + box.height > room.height)
      top = target.top - room.top - box.height - 6;
    const left = target.left - room.left + target.width/2 - box.width/2;
    dom.style.left = `${Math.max(4, Math.min(left, room.width - box.width - 4))}px`;
    dom.style.top = `${Math.max(4, Math.min(top, room.height - box.height - 4))}px`;
  }

  // The button that switches to the other surface. It is offered only where the
  // board left the choice to the device, and what it chooses is remembered for
  // this browser.
  addSurfaceSwitch(parent, mode, cell, text) {
    if(this.get('scoreEntry') != 'auto')
      return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scoreEntrySwitch';
    button.setAttribute('icon', mode == 'keypad' ? 'dialpad' : 'keyboard');
    button.title = mode == 'keypad' ? 'Use the keypad on this device' : 'Type with the keyboard on this device';
    // the press must not blur the cell being typed into before the click arrives
    button.addEventListener('mousedown', e=>e.preventDefault());
    button.addEventListener('click', _=>{
      this.pinPlayerScoreEntry(mode);
      this.openEntrySurface(mode, cell, text);
    });
    parent.appendChild(button);
  }

  openKeypad(cell, address, text) {
    const pad = div(null, 'scoreboardKeypad');
    const header = div(pad, 'scoreboardKeypadHeader');
    const title = div(header, 'scoreboardKeypadTitle');
    title.textContent = `${address.seat.get('player') || '-'} · ${this.roundName(address.round)}`;
    this.addSurfaceSwitch(header, 'type', cell, text);
    // closing belongs with the title of the pad rather than among the keys,
    // where a cross reads as an operator next to the ones that are
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'scoreEntryClose';
    close.setAttribute('icon', 'close');
    close.title = 'Close without entering a score';
    close.addEventListener('click', _=>this.keypadPress('cancel'));
    header.appendChild(close);

    const display = div(pad, 'scoreboardKeypadValue');
    display.textContent = text;
    display.dataset.current = this.cellText(address);

    const keys = div(pad, 'scoreboardKeypadKeys');
    for(const row of keypadKeys) {
      for(const key of row) {
        const button = document.createElement('button');
        button.type = 'button';
        if(key.icon)
          button.setAttribute('icon', key.icon);
        else
          button.textContent = key.text;
        if(key.title)
          button.title = key.title;
        if(key.action)
          button.classList.add(key.action);
        button.addEventListener('click', _=>this.keypadPress(key.action || key.value || key.text));
        keys.appendChild(button);
      }
    }

    const surface = this.entrySurface = { mode: 'keypad', seatID: address.seat.get('id'), round: address.round, text, cell, dom: pad, display };
    cell.classList.add('entering');
    const outside = e=>{
      if(!pad.contains(e.target) && this.entrySurface === surface)
        this.closeEntrySurface();
    };
    for(const event of [ 'mousedown', 'touchstart' ])
      document.addEventListener(event, outside);
    // a key the keypad answers to is consumed here, so that it types into the
    // pad instead of reaching the hotkeys of the room behind it
    const typed = e=>{
      const key = this.entrySurface === surface && !e.ctrlKey && !e.metaKey && !e.altKey && keypadKeyFor(e.key);
      if(!key)
        return;
      e.preventDefault();
      e.stopPropagation();
      this.keypadPress(key);
    };
    document.addEventListener('keydown', typed);
    surface.cleanup = _=>{
      document.removeEventListener('keydown', typed);
      for(const event of [ 'mousedown', 'touchstart' ])
        document.removeEventListener(event, outside);
    };

    this.anchorToCell(pad, cell);
  }

  async keypadPress(key) {
    const surface = this.entrySurface;
    if(!surface || surface.mode != 'keypad')
      return;
    if(key == 'cancel')
      return this.closeEntrySurface();
    if(key == 'enter') {
      const value = this.parseScore(surface.text);
      const seat = widgets.get(surface.seatID);
      const address = seat && { seat, round: surface.round };
      this.closeEntrySurface();
      if(value !== null && address && String(value) !== this.cellText(address))
        await this.setCellScore(address, value);
      return;
    }
    surface.text = this.keypadText(surface.text, key);
    surface.display.textContent = surface.text;
  }

  // What a key does to what has been typed so far. Operators do not stack, and
  // only the minus sign opens an entry - that is a negative score - so the pad
  // cannot produce anything expressionNumber refuses to read.
  keypadText(text, key) {
    if(key == 'clear')
      return '';
    if(key == 'delete')
      return text.slice(0, -1);
    if(key == '+' || key == '-') {
      const base = text.replace(/[-+]$/, '');
      return base === '' && key == '+' ? base : base + key;
    }
    if(text.length >= 12)
      return text;
    if(key == '.')
      return /\.\d*$/.test(text) ? text : text + '.';
    return text + key;
  }

  openCellInput(cell, address, text) {
    const input = document.createElement('input');
    input.className = 'scoreCellInput';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.size = 1; // an input is 20 characters wide by default, which would widen the column
    input.value = text;

    const surface = this.entrySurface = { mode: 'type', seatID: address.seat.get('id'), round: address.round, text, cell, input, shown: cell.innerText };
    cell.classList.add('entering');
    cell.innerText = '';
    cell.appendChild(input);

    const switchBar = div(null, 'scoreEntrySwitchBar');
    this.addSurfaceSwitch(switchBar, 'keypad', cell, '');
    if(switchBar.firstChild) {
      surface.dom = switchBar;
      this.anchorToCell(switchBar, cell);
    }

    input.addEventListener('input', _=>surface.text = input.value);
    input.addEventListener('blur', _=>this.commitCellInput(surface, null));
    input.addEventListener('keydown', e=>{
      if(e.key == 'Enter')
        this.commitCellInput(surface, 'nextSeat');
      else if(e.key == 'Tab')
        this.commitCellInput(surface, e.shiftKey ? 'previousRound' : 'nextRound');
      else if(e.key != 'Escape')
        return;
      else
        this.closeEntrySurface();
      e.preventDefault();
    });

    input.focus();
    input.select();
  }

  // Enter goes on to the next player in the same round, Tab to the next round
  // of the same player - the way a score sheet is filled in.
  async commitCellInput(surface, move) {
    const seat = widgets.get(surface.seatID);
    if(this.entrySurface !== surface)
      return;
    if(!seat)
      return this.closeEntrySurface();
    const address = { seat, round: surface.round };
    const value = this.parseScore(surface.text);
    const next = move && this.neighbourCell(surface, move);
    this.closeEntrySurface();
    if(value !== null && String(value) !== this.cellText(address))
      await this.setCellScore(address, value);
    if(next) {
      const cell = this.cellFor(next.seatID, next.round);
      if(cell)
        this.openEntrySurface('type', cell, '');
    }
  }

  neighbourCell(surface, move) {
    const seats = this.getIncludedSeats();
    const index = Array.isArray(seats) ? seats.findIndex(s=>s.get('id') == surface.seatID) : -1;
    if(index == -1 || !surface.round)
      return null;
    if(move == 'nextRound')
      return { seatID: surface.seatID, round: surface.round + 1 };
    if(move == 'previousRound')
      return { seatID: surface.seatID, round: surface.round - 1 };
    if(index + 1 < seats.length)
      return { seatID: seats[index+1].get('id'), round: surface.round };
    return { seatID: seats[0].get('id'), round: surface.round + 1 };
  }

  css() {
    let css = super.css();

    css += '; --firstColWidth:' + this.get('firstColWidth') + 'px';
    css += '; --columns:' + this.numCols;

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('firstColWidth');
    return p;
  }

  get(property) {
    if(property != '_totals')
      return super.get(property)
    else {
      // First get total score for each relevant seat
      const totals = [];
      const seats = this.getIncludedSeats();
      if(Array.isArray(seats)) {// Getting seat totals
        for (const seat of seats) {
          const score = seat.get(this.get('scoreProperty'));
          const index = seat.get('index');
          totals[index] = this.getTotal(score);
        }
        return totals
      } else if (typeof seats == 'object') { // Getting team totals
        const teamTotals = [null];
        for (const team in seats) {
          const seatsInTeam = widgetFilter(w => w.get('type') == 'seat' && seats[team].includes(w));
          const seatsScores = seats[team].map(w => w.get(this.get('scoreProperty')));
          const seatsTotals = asArray(seatsScores).map( s => this.getTotal(s) );
          teamTotals.push(this.getTotal(seatsTotals));
        }
        return teamTotals;
      }
      return null; // Neither array nor object, return null.
    }
  }

  readOnlyProperties() {
    return new Set([...super.readOnlyProperties(), '_totals']);
  }

  // Return a modified array or object, structured as with the 'seats' property,
  // including the seat widgets (not just the seat ids) to actually be used.
  // The returned array will be sorted as requested by the widget. For teams, players
  // will be sorted by player name within each team, and the teams will be sorted as
  // shown in the scoreboard (i.e., as given in the scoreboard's property).
  getIncludedSeats() {
    const showTotals = this.get('showTotals');
    const scoreProperty = this.get('scoreProperty');
    let sortField = this.get('sortField');

    let seats = this.get('seats');
    if(typeof seats == 'string') // Allow "seats": "Seat1"
      seats = asArray(seats);
    if(Array.isArray(seats) || seats === null) { // Scoreboard just using seats
      const seatList = [...widgetFilter(w => w.get('type') == 'seat' && (this.get('showAllSeats') || w.get('player')) && (!seats || seats.includes(w.get('id'))))];
      // Sort player scores as requested
      if(sortField == 'total' && !showTotals) // Use default sort if no totals
        sortField = 'index';
      if(sortField == 'total')
        seatList.sort((a,b) => this.getTotal(a.get(scoreProperty)) - this.getTotal(b.get(scoreProperty)))
      else
        seatList.sort((a,b) => {
          const pa = a.get(sortField);
          const pb = b.get(sortField);
          return pa < pb ? -1 : pa > pb ? 1 : 0; // These need not be numeric
        });
      if(!this.get('sortAscending'))
        seatList.reverse();
      return seatList;
    } else if(typeof seats == 'object') { // Scoreboard using teams
      const teamList = {};
      for (const team in seats) {
        teamList[team] = [... widgetFilter(w => w.get('type') == 'seat' && (this.get('showAllSeats') || w.get('player')) && asArray(seats[team]).includes(w.get('id')))];
        teamList[team].sort((a,b) => a.get('index') - b.get('index'));
        if (!this.get('sortAscending'))
          teamList[team].reverse()
      }
      return teamList;
    } else // 'seats' property is not array or object, return null to do nothing further
      return null;
  }

  // Compute number of scoring rounds to show and create round names table
  getRounds(seats, scoreProperty, addEmptyRounds=0) {
    let rounds = this.get('rounds'); // User-supplied round names
    let numRounds=0;
    this.totalsOnly = true;
    const arrayOfSeats = Array.isArray(seats) ? seats : Object.keys(seats).reduce((union,key) => union.concat(seats[key]), []);
    for (let i=0; i < arrayOfSeats.length; i++) {
      const score = arrayOfSeats[i].get(scoreProperty);
      if(Array.isArray(score) && score.length > numRounds)
        numRounds = score.length;
      if(Array.isArray(score))
        this.totalsOnly = false;
    }
    if(this.get('showAllRounds') && Array.isArray(rounds))
      numRounds = Math.max(rounds.length, numRounds);
    else if (!this.totalsOnly)
      numRounds += addEmptyRounds;

    if(Array.isArray(rounds))
      rounds = rounds.concat(Array(numRounds).fill('')).slice(0,numRounds);
    else
      rounds = [...Array(numRounds).keys()].map(i => i+1);
    return rounds;
  }

  getTotal(x) {
    return asArray(x).reduce((partialSum, a) => partialSum + (parseFloat(a) || 0), 0)
  }

  seatProperties(seatID) {
    const seats = this.get('seats');
    if((typeof seats == 'string' && seats != seatID))
      return [];
    if(Array.isArray(seats) && !(seats.includes(seatID)))
      return [];
    if(seats != null && typeof seats == 'object' && !(Object.keys(seats).some(team=>asArray(seats[team]).includes(seatID))))
      return [];
    const props = ['player', this.get('scoreProperty')];
    let sortField = this.get('sortField');
    if(sortField == 'total') {
      if(this.get('showTotals'))
        sortField = null;
      else
        sortField = 'index';
    }
    if(sortField)
      props.push(sortField);
    if(this.get('showPlayerColors'))
      props.push('color');
    return props;
  }

  addRowToTable(parent, values, isFirst) {
    const tr = parent.insertRow();
    const v = asArray(values);
    tr.innerHTML = Array(values.length).fill('<td></td>').join('');
    for (let i=0; i < values.length; i++) {
      if(isFirst && this.get('verticalHeader')) {
        const div = document.createElement('div');
        div.innerText = values[i];
        $a('td', tr)[i].appendChild(div);
      } else {
        $a('td', tr)[i].innerText = values[i];
      }
    }
    return tr;
  }

  updateTable() {
    /* This routine creates the HTML table for display in the scoreboard. It is
     * complicated by the fact that the `seats` property can be either an array of
     * seat IDs or an object whose keys are team names and each of whose values is an
     * array of seat IDs.
     * There are two major sections: the first computes the pScores array, which contains
     * the array of scores, either for seats or for teams. The second section uses the
     * pScores array to construct the HTML table.
     * There are lots of other things going on, to get the totals line, round names, etc
     * correct.
     */

    const seats = this.getIncludedSeats();
    // an open entry surface is anchored to a cell of the table that is about to
    // be thrown away, so it is put back on the rebuilt one further down
    const reopen = this.entrySurface;
    this.closeEntrySurface();
    // First, empty the table
    if(!this.tableDOM) {
      this.tableDOM = document.createElement('table');
      const intermediateDiv = document.createElement('div');
      intermediateDiv.className = 'scoreboardIntermediate';
      this.domElement.appendChild(intermediateDiv);
      intermediateDiv.appendChild(this.tableDOM);
    } else {
      this.tableDOM.innerHTML = '';
    }

    // Just return if no seats were specified.
    // We choose here to regard a result of [] or {} as a valid set of seats/teams with no entries.
    if(seats===null)
      return

    const showTotals = this.get('showTotals');
    const scoreProperty = this.get('scoreProperty');
    let sortField = this.get('sortField');

    // Compute number of scoring rounds to show and create round names table.
    // A board that scores are entered into carries one round more than has been
    // scored, the same round the edit pane offers - otherwise there would be no
    // cell to click for the round about to be played.
    const enterable = this.cellEntryEnabled();
    const rounds = this.getRounds(seats, scoreProperty, this.nextRoundOffered() ? 1 : 0);
    let numRounds = rounds.length;
    this.displayedRounds = [...rounds];
    if(showTotals)
      rounds.push(this.get('totalsLabel'));
    rounds.unshift(this.get('roundLabel'));

    // Fill scores array. pScores[i][0] is player name or team name, last is total
    // (or last score if showTotals is false)
    let pScores = [];
    if(Array.isArray(seats)) { // Show individual seats
      // Fill player score array, totals array. This will work properly for totals-only.
      for (let i=0; i < seats.length; i++) {
        const score = seats[i].get(scoreProperty);
        pScores[i] = Array.isArray(score) ? [...score] : [];
        pScores[i] = pScores[i].concat(Array(numRounds).fill('')).slice(0,numRounds);
        // Add totals if requested, and player name.
        if(showTotals)
          pScores[i].push(this.getTotal(score)); // Use 'score' instead of 'pScores[i]' here b/c of scalars.
        pScores[i].unshift(seats[i].get('player') || '-');
      }

    } else if(typeof seats == 'object') { // Display team scores
      let i = 0;
      for (const team in seats) {
        if (this.totalsOnly) {
          pScores[i] = [this.getTotal(seats[team].map(w => w.get(scoreProperty)))];
        } else {
          // Get array of (arrays of) seat scores.
          const seatScores = seats[team].map(w =>  asArray(w.get(scoreProperty)));

          // Make all score arrays for this team the same length, then add them element-by-element
          const n = seatScores.reduce((max, xs) => Math.max(max, xs.length), 0);
          pScores[i] = Array(n).fill(0).map((_,i) => this.getTotal(seatScores.map(xs => xs[i])));
          pScores[i] = pScores[i].concat(Array(numRounds).fill('')).slice(0,numRounds);

          // Add totals and team name
          if(showTotals)
            pScores[i].push(this.getTotal(pScores[i].slice(0,n)));
        }
        pScores[i].unshift(team || '-');
        i++
      }
    } else { // Should never happen.
      console.log('Internal error: invalid seats in updateTable');
      return
    }

    let numCols;
    let numRows;
    // Do not use player colors if team scores are being shown.
    let showPlayerColors = this.get('showPlayerColors') && Array.isArray(seats);

    let currentRound = parseInt(this.get('currentRound'));
    if (isNaN(currentRound) || currentRound < 1 || currentRound > numRounds)
      currentRound = null;

    if(this.get('playersInColumns')) { // Scores are in columns
      // Compute total number of rows and columns in table
      numCols = pScores.length + 1;
      numRows = numRounds + 1 + (showTotals ? 1 : 0);

      // Add header row
      const names = pScores.map(x => x[0]);
      names.unshift(this.get('roundLabel'));
      this.tableDOM.innerHTML += '<tbody></tbody>';
      const tr = this.addRowToTable($('tbody', this.tableDOM), names, true);
      const defaultColor = window.getComputedStyle(tr.cells[0]).getPropertyValue('background-color');
      // Get player colors if needed
      if(showPlayerColors)
        for (let c=0; c<pScores.length; c++ ) {
          const bgColor = pScores[c][0]=='-' ? defaultColor : seats.filter(x=> x.get('player') == pScores[c][0])[0].get('color');
          tr.cells[c+1].style.backgroundColor = bgColor;
          tr.cells[c+1].style.color = contrastAnyColor(bgColor, 1);
        }
      // Add remaining rows
      for( let r=1; r < numRows; r++ ) {
        const pRow = pScores.map(x => x[r]);
        pRow.unshift(rounds[r]);
        const tr = this.addRowToTable($('tbody',this.tableDOM), pRow);
        if(Array.isArray(seats))
          for(let c=0; c < seats.length; c++)
            this.addressCell(tr.cells[c+1], seats[c], r <= numRounds ? r : 0, enterable);
        if(r == currentRound)
          for(let c=1; c < numCols; c++)
            tr.cells[c].classList.add('currentRound');
      }
      if(showTotals)
        for(let c=0; c < numCols; c++)
          this.tableDOM.rows[numRows-1].cells[c].classList.add('totalsLine');
    } else { // Scores are in rows
      // Compute total number of rows and columns in table
      numCols = numRounds + 1 + (showTotals ? 1 : 0);
      numRows = pScores.length + 1;

      // First row contains round names
      const tr = this.addRowToTable(this.tableDOM, rounds, true);
      const defaultColor = window.getComputedStyle(tr.cells[0]).getPropertyValue('background-color');
      // Remaining rows are one row per player.
      for( let r=0; r < pScores.length; r++) {
        const tr = this.addRowToTable(this.tableDOM, pScores[r]);
        if(Array.isArray(seats))
          for(let c=1; c < numCols; c++)
            this.addressCell(tr.cells[c], seats[r], c <= numRounds ? c : 0, enterable);
        if(showPlayerColors) {
          const bgColor = pScores[r][0]=='-' ? defaultColor : seats.filter(x=> x.get('player') == pScores[r][0])[0].get('color');
          tr.cells[0].style.backgroundColor = bgColor;
          tr.cells[0].style.color = contrastAnyColor(bgColor, 1);
        }
      }
      for(let r=1; r < numRows; r++) {
        if(currentRound)
          this.tableDOM.rows[r].cells[currentRound].classList.add('currentRound');
        if(showTotals)
          this.tableDOM.rows[r].cells[numCols-1].classList.add('totalsLine');
      }
    }
    this.numCols = numCols;
    this.domElement.style.cssText = mapAssetURLs(this.css());
    if(reopen)
      this.reopenEntrySurface(reopen);
  }
}
