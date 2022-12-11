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
      usePlayerColors: true,
      playersInColumns: true,
      rounds: null,
      sortField: 'index',
      sortAscending: true,
      scoreProperty: 'score',
      includeAllSeats: false,
      showTotals: true,
      seats: null,
      showAllRounds: false,
      roundLabel: 'Round',
      currentRound: null
    });
  }

  applyDeltaToDOM(delta) {
    if(delta) // Don't call super unless this is a real delta to the scoreboard rather than from a seat
      super.applyDeltaToDOM(delta);
    const seats = this.getIncludedSeats();
    if(seats !== null)
      this.tableCreate(seats)
  }

  get(property) {
    if(property != '_totals')
      return super.get(property)
    else if(!this.get('showTotals'))
      return [];
    else {
      // First get total score for each relevant seat
      const totals = [];
      const seats = this.getIncludedSeats();
      if(Array.isArray(seats)) {// Getting seat totals
        for (const seat of seats) {
          const score = seat.get(this.get('scoreProperty'));
          const index = seat.get('index');
          totals[index] = this.getTotal(asArray(score).map(s => parseFloat(s)));
          if(isNaN(totals[index]))
            totals[index] = 0;
        }
        return totals
      } else if (typeof seats == 'object') { // Getting team totals
        const teamTotals = [null];
        for (const team in seats) {
          const seatsInTeam = widgetFilter(w => w.get('type') == 'seat' && seats[team].includes(w));
          const seatsScores = asArray(seats[team].map(w => w.get(this.get('scoreProperty'))));
          const seatsTotals = seatsScores.map( s => this.getTotal(asArray(s)) );
          teamTotals.push(this.getTotal(seatsTotals));
        }
        return teamTotals;
      } else // Neither, ignore request
        return null;
    }
  }

  // Return a modified 'seat' array or object including the seat widgets (not just the seat ids) to actually be used.
  getIncludedSeats() {
    const seats = this.get('seats');
    if(Array.isArray(seats) || seats === null) // Scoreboard just using seats
       return [...widgetFilter(w => w.get('type') == 'seat' && (this.get('includeAllSeats') || w.get('player')) && (!seats || seats.includes(w.get('id'))))]
    else if(seats !== null && typeof seats == 'object') { // Scoreboard using teams
      const newSeats = {};
      for (const team in seats) {
        newSeats[team] = asArray(seats[team]);
        newSeats[team] = [... widgetFilter(w => w.get('type') == 'seat' && (this.get('includeAllSeats') || w.get('player')) && newSeats[team].includes(w.get('id')))];
      }
      return newSeats;
    } else // 'seats' property is not array or object, ignore it.
      return null;
  }

  getTotal(array) {
    let sum = array.reduce((partialSum, a) => partialSum + parseFloat(a), 0);
    if(isNaN(sum))
      sum = 0
    return sum;
  }

  addRowToTable(parent, values, cellType = 'td') {
    const tr = parent.insertRow();
    const v = asArray(values);
    tr.innerHTML = Array(values.length).fill(`<${cellType}></${cellType}>`).join('');
    for (let i=0; i < values.length; i++)
      $a(cellType, tr)[i].innerText = values[i];
    return tr;
  }

  // Compute desired text color from luminance of background
  // See https://stackoverflow.com/questions/3942878
  getFgColor(bgColor) {
    const red = parseInt(bgColor.slice(1,3),16);
    const green = parseInt(bgColor.slice(3,5),16);
    const blue = parseInt(bgColor.slice(5,7),16);
    return red*0.299 + green*0.587 + blue*0.114 > 186 ? "#000000" : "#ffffff";
  }

  tableCreate(seats) {
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
    const showTotals = this.get('showTotals');
    const scoreProperty = this.get('scoreProperty');
    let sortField = this.get('sortField');

    // Compute number of scoring rounds to show
    let rounds = this.get('rounds'); // User-supplied round names
    let includedSeats = seats; // Array of all relevant seats
    if(typeof(seats)=='object') // Array of all seats for team use
      includedSeats = Object.keys(seats).reduce((union,key) => union.concat(seats[key]), []);

    // Do not use player colors if team scores are being shown.
    let usePlayerColors = this.get('usePlayerColors') && Array.isArray(seats);

    let numRounds=0;
    for (let i=0; i < includedSeats.length; i++) {
      const score = includedSeats[i].get(scoreProperty);
      if(Array.isArray(score) && score.length > numRounds)
        numRounds = score.length;
    }
    if(this.get('showAllRounds') && Array.isArray(rounds))
      numRounds = Math.max(rounds.length, numRounds);

    let pScores = []; // Array of scores. pScores[i][0] is player name or team name, last is total (or last score if showTotals is false)
    if(Array.isArray(seats)) { // Show individual seats
      // Fill player score array, totals array
      for (let i=0; i < seats.length; i++) {
        const score = seats[i].get(scoreProperty);
        let total;
        if(Array.isArray(score)) {
          pScores[i] = score.map( s => isNaN(parseFloat(s)) ? 0 : parseFloat(s));
          total = this.getTotal(pScores[i]);
        } else {
          pScores[i] = [];
          total = parseFloat(score);
          if(isNaN(total))
            total = 0;
        }
        pScores[i] = pScores[i].concat(Array(numRounds).fill('')).slice(0,numRounds);
        if(showTotals)
          pScores[i].push(total);
        pScores[i].unshift(seats[i].get('player'));
      }

      // Sort player scores as requested
      if(sortField == 'total' && !showTotals) // Use default sort if no totals
        sortField = 'index';
      if(sortField == 'total')
        pScores.sort((a,b) => a[a.length-1] - b[b.length-1])
      else
        pScores.sort((a,b) => {
          const pa = includedSeats.filter(x=> x.get('player') == a[0])[0].get(sortField);
          const pb = includedSeats.filter(x=> x.get('player') == b[0])[0].get(sortField);
          return pa < pb ? -1 : pa > pb ? 1 : 0; // These need not be numeric
        });
      if(!this.get('sortAscending'))
        pScores = pScores.reverse();

    } else if(typeof seats == 'object') { // Display team scores
      let i = 0;
      for (const team in seats) {
        // Get array of (arrays of) seat scores.
        const seatScores = seats[team].map(w =>  asArray(w.get(scoreProperty)));

        // Make all score arrays for this the same length, then add them element-by-element
        const n = seatScores.reduce((max, xs) => Math.max(max, xs.length), 0);
        pScores[i] = Array(n).fill(0).map((_,i) => this.getTotal(seatScores.map(xs => xs[i] || 0)));
        pScores[i] = pScores[i].concat(Array(numRounds).fill('')).slice(0,numRounds);

        // Add totals and team name
        if(showTotals)
          pScores[i].push(this.getTotal(pScores[i]));
        pScores[i].unshift(team);
        i++
      }
    } else // 'seats' property is not null, array, or object, ignore it.
      return null;


    // Fill empty player/team names with 'None'
    for (let i=0; i < pScores.length; i++)
      if(pScores[i][0]=='')
        pScores[i][0] = 'None';

    // Create round name headers
    if(Array.isArray(rounds))
      rounds = rounds.concat(Array(numRounds).fill('')).slice(0,numRounds);
    else
      rounds = [...Array(numRounds).keys()].map(i => i+1);
    if(showTotals)
      rounds.push('Totals');
    rounds.unshift(this.get('roundLabel'));

    // Finally, build the table
    if(!this.tableDOM) {
      this.tableDOM = document.createElement('table');
      this.domElement.appendChild(this.tableDOM);
    } else {
      this.tableDOM.innerHTML = '';
    }

    let numRows;
    let numCols;

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
      const tr = this.addRowToTable($('tbody', this.tableDOM), names, 'td');
      const defaultColor = window.getComputedStyle(tr.cells[0]).getPropertyValue('background-color');
      // Get player colors if needed
      if(usePlayerColors)
        for (let c=0; c<pScores.length; c++ ) {
          const bgColor = pScores[c][0]=='None' ? defaultColor : seats.filter(x=> x.get('player') == pScores[c][0])[0].get('color');
          tr.cells[c+1].style.backgroundColor = bgColor;
          tr.cells[c+1].style.color = this.getFgColor(bgColor);
        }
      // Add remaining rows
      for( let r=1; r < numRows; r++ ) {
        const pRow = pScores.map(x => x[r]);
        pRow.unshift(rounds[r]);
        const tr = this.addRowToTable($('tbody',this.tableDOM), pRow, 'td');
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
      const tr = this.addRowToTable(this.tableDOM, rounds, 'td');
      const defaultColor = window.getComputedStyle(tr.cells[0]).getPropertyValue('background-color');
      // Remaining rows are one row per player.
      for( let r=0; r < pScores.length; r++) {
        const tr = this.addRowToTable(this.tableDOM, pScores[r], 'td');
        if(usePlayerColors) {
          const bgColor = pScores[r][0]=='None' ? defaultColor : seats.filter(x=> x.get('player') == pScores[r][0])[0].get('color');
          tr.cells[0].style.backgroundColor = bgColor;
          tr.cells[0].style.color = this.getFgColor(bgColor);
        }
      }
      for(let r=1; r < numRows; r++) {
        if(currentRound)
          this.tableDOM.rows[r].cells[currentRound].classList.add('currentRound');
        if(showTotals)
          this.tableDOM.rows[r].cells[numCols-1].classList.add('totalsLine');
      }
    }
  }
}

