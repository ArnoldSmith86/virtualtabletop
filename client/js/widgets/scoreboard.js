import { $, $a, removeFromDOM, asArray, escapeID } from '../domhelpers.js';
import { Widget } from './widget.js';

class Scoreboard extends Widget {
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
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    const updateTableProps = [
      'showTotals',
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
    if(!await super.click(mode)) {
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
            },
            {
              type: 'select',
              label: this.get('roundLabel'),
              options: rounds,
              variable: 'round',
              value: everyPlayerFilledLatestRound ? rounds.length : rounds.length - 1
            },
            {
              type: 'number',
              label: 'Value',
              variable: 'score'
            }
          ]
        });
        const seat = widgets.get(result.variables.player);
        let scores = seat.get(scoreProperty);
        if(!this.totalsOnly) {
          scores = [...scores];
          scores[result.variables.round-1] = +result.variables.score;
        } else
          scores = +result.variables.score;
        await seat.set(scoreProperty, scores);
      } catch(e) {
        console.log('The input overlay for the scoreboard failed to load.', e);
      }
    }
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

    // Compute number of scoring rounds to show and create round names table
    let rounds = this.getRounds(seats, scoreProperty);
    let numRounds = rounds.length;
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
    this.domElement.style.setProperty('--firstColWidth', '50px');
    this.domElement.style.setProperty('--columns', numCols);
  }
}
