import { $, $a, removeFromDOM, asArray, escapeID } from '../domhelpers.js';
import { Widget } from './widget.js';

class ScoreBoard extends Widget {
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
      let seats = this.getIncludedSeats();
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
    let usePlayerColors = this.get('usePlayerColors');
    const colors = []; // Array of player colors

    // Compute number of scoring rounds to show
    let rounds = this.get('rounds'); // User-supplied round names
    let includedSeats = seats; // Array of all relevant seats
    if(typeof(seats)=='object') // Array of all seats for team use
      includedSeats = Object.keys(seats).reduce((union,key) => union.concat(seats[key]), []);

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
        pScores.sort((a,b) =>a[a.length-1] < b[b.length-1] ? -1 : 1)
      else
        pScores.sort((a,b) => {
          const pa = includedSeats.filter(x=> x.get('player') == a[0])[0].get(sortField);
          const pb = includedSeats.filter(x=> x.get('player') == b[0])[0].get(sortField);
          return pa < pb ? -1 : 1;
        });
      if(!this.get('sortAscending'))
        pScores = pScores.reverse();

      // Get player colors if needed
      if(usePlayerColors)
        for (let i=0; i < seats.length; i++)
          colors.push(seats.filter(x=> x.get('player') == pScores[i][0])[0].get('color'));
    } else if(typeof seats == 'object') { // Display team scores
      usePlayerColors = false; // No predefined colors for teams
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


    // Fill empty player names with 'None'
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

    this.tableDOM.style.height = this.get('height') + 'px';
    this.tableDOM.style.width = this.get('width')+ 'px';
    let numRows;
    let numCols;
    let currentRound = parseInt(this.get('currentRound'));

    if (isNaN(currentRound) || currentRound <1 || currentRound > numRounds)
      currentRound = null;

    if(this.get('playersInColumns')) {
      // Compute total number of rows and columns in table
      numCols = pScores.length + 1;
      numRows = numRounds + 1 + (showTotals ? 1 : 0);

      // Add header row
      const names = pScores.map(x => x[0]);
      names.unshift(this.get('roundLabel'));
      this.tableDOM.innerHTML += '<tbody></tbody>';
      const tr = this.addRowToTable($('tbody', this.tableDOM), names, 'td');
      if(usePlayerColors)
        for (let c=0; c<pScores.length; c++ ) {
          tr.cells[c+1].style.backgroundColor = colors[c];
          tr.cells[c+1].style.color = 'white';
        }
      // Add remaining rows
      for( let r=1; r < numRows; r++ ) {
        const pRow = pScores.map(x => x[r]);
        pRow.unshift(rounds[r]);
        const tr = this.addRowToTable($('tbody',this.tableDOM), pRow, 'td');
        tr.cells[0].classList.add('firstCol');
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
      for (let c=0; c < numCols; c++)
        tr.cells[c].classList.add('firstRow');
      // Remaining rows are one row per player.
      for( let r=0; r < pScores.length; r++) {
        const tr = this.addRowToTable(this.tableDOM, pScores[r], 'td');
        tr.cells[0].classList.add('firstCol');
        if(usePlayerColors) {
          tr.cells[0].style.backgroundColor = colors[r];
          tr.cells[0].style.color = 'white';
        }
      }
      for(let r=1; r < numRows; r++) {
        if(currentRound)
          this.tableDOM.rows[r].cells[currentRound].classList.add('currentRound');
        if(showTotals)
          this.tableDOM.rows[r].cells[numCols-1].classList.add('totalsLine');
      }
    }

    // Make top row, left column non-scrollable
    for (let r=0; r<numRows; r++)
      this.tableDOM.rows[r].cells[0].classList.add('firstCol');
    for (let c=0; c< numCols; c++)
      this.tableDOM.rows[0].cells[c].classList.add('firstRow');
  }

}

