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
      sortField: 'player',
      sortAscending: true,
      scoreProperty: 'score',
      includeAllSeats: false,
      addTotals: true,
      seats: null,
      showAllRounds: false,
      roundLabel: 'Round',
      currentRound: null
    });
  }

  applyDeltaToDOM(delta) {
    if(delta) // Don't call super unless this is a real delta to the scoreboard rather than from a seat
      super.applyDeltaToDOM(delta);
    let includedSeats = widgetFilter(w => w.get('type') == 'seat' && (this.get('includeAllSeats') || w.get('player') != '') && (!this.get('seats') || this.get('seats').includes(w.get('id'))));
    includedSeats.sort((a,b) => a.get('player') < b.get('player') ? -1 : 1);
    this.tableCreate(includedSeats)
  }
  
  applyInitiaDelta() {
  }

  addRowToTable(parent, values, cellType = 'td') {
    const tr = parent.insertRow();
    const v = asArray(values);
    tr.innerHTML = Array(values.length).fill(`<${cellType}></${cellType}>`).join('');
    for (let i=0; i < values.length; i++)
      $a(cellType, tr)[i].innerText = values[i];
    return tr;
  }

  tableCreate(includedSeats) {
    const addTotals = this.get('addTotals');
    const scoreProperty = this.get('scoreProperty');
    const sortField = this.get('sortField');
    const usePlayerColors = this.get('usePlayerColors');

    let pScores = []; // Array of scores. pScores[i][0] is player name, last is total (or last score if addTotals is false)
    let numRounds = 0; // Number of rounds to display
    let rounds = this.get('rounds'); // User-supplied round names

    // Compute number of scoring rounds to show
    for (let i=0; i < includedSeats.length; i++) {
      const score = includedSeats[i].get(scoreProperty);
      if(Array.isArray(score) && score.length > numRounds)
        numRounds = score.length;
    }
    if(this.get('showAllRounds') && Array.isArray(rounds))
      numRounds = Math.max(rounds.length, numRounds);

    // Fill player score array, totals array
    for (let i=0; i < includedSeats.length; i++) {
      const score = includedSeats[i].get(scoreProperty);
      let total;
      if(Array.isArray(score)) {
        pScores[i] = score.map( s => isNaN(parseFloat(s)) ? 0 : parseFloat(s));
        total = pScores[i].reduce((partialSum, a) => partialSum + a, 0);
      } else {
        pScores[i] = [];
        total = parseFloat(score);
        if(isNaN(total))
          total = 0;
      }
      pScores[i] = pScores[i].concat(Array(numRounds).fill('')).slice(0,numRounds);
      if(addTotals)
        pScores[i].push(total);
      pScores[i].unshift(includedSeats[i].get('player'));
    }
    
    // Sort player scores if requested
    if(sortField == 'total') {
      if(addTotals)
        pScores.sort((a,b) =>a[a.length-1] < b[b.length-1] ? -1 : 1)
    } else if(sortField) {
      pScores.sort((a,b) => {
        const pa = includedSeats.filter(x=> x.get('player') == a[0])[0].get(sortField);
        const pb = includedSeats.filter(x=> x.get('player') == b[0])[0].get(sortField);
        return pa < pb ? -1 : 1;
      });
    }
    if(!this.get('sortAscending'))
      pScores = pScores.reverse();

    // Get player colors if needed
    const colors = []; // Array of player colors
    if(usePlayerColors)
      for (let i=0; i < includedSeats.length; i++) 
        colors.push(includedSeats.filter(x=> x.get('player') == pScores[i][0])[0].get('color'));

    // Fill empty player names with 'None'
    for (let i=0; i < includedSeats.length; i++)
      if(pScores[i][0]=='')
        pScores[i][0] = 'None';

    // Create round name headers
    if(Array.isArray(rounds)) 
      rounds = rounds.concat(Array(numRounds).fill('')).slice(0,numRounds);
    else
      rounds = [...Array(numRounds).keys()].map(i => i+1);
    if(addTotals)
      rounds.push('Totals');
    rounds.unshift(this.get('roundLabel'));

    // Finally, build the table
    let tbl = document.createElement('table');
    tbl.style.height = (this.get('height') - 8) + 'px';
    tbl.style.width = (this.get('width') - 8) + 'px';
    let numRows;
    let numCols;
    let currentRound = parseInt(this.get('currentRound'));

    if (isNaN(currentRound) || currentRound <1 || currentRound > numRounds)
      currentRound = null;
    
    if(this.get('playersInColumns')) {
      // Compute total number of rows and columns in table
      numCols = includedSeats.length + 1;
      numRows = numRounds + 1 + (addTotals ? 1 : 0);

      // Add header row
      const names = pScores.map(x => x[0]);
      names.unshift(this.get('roundLabel'));
      tbl.innerHTML += '<tbody></tbody>';
      const tr = this.addRowToTable($('tbody', tbl), names, 'td');
      if(usePlayerColors)
        for (let c=0; c<includedSeats.length; c++ ) {
          tr.cells[c+1].style.backgroundColor = colors[c];
          tr.cells[c+1].style.color = 'white';
        }
      // Add remaining rows
      for( let r=1; r < numRows; r++ ) {
        const pRow = pScores.map(x => x[r]);
        pRow.unshift(rounds[r]);
        const tr = this.addRowToTable($('tbody',tbl), pRow, 'td');
        tr.cells[0].classList.add('firstCol');
        if(r == currentRound)
          for(let c=1; c < numCols; c++)
            tr.cells[c].classList.add('currentRound');
      }
      if(addTotals)
          for(let c=0; c < numCols; c++)
            tbl.rows[numRows-1].cells[c].classList.add('totalsLine');
    } else { // Players are in rows
      // Compute total number of rows and columns in table
      numCols = numRounds + 1 + (addTotals ? 1 : 0);
      numRows = includedSeats.length + 1;

      // First row contains round names
      const tr = this.addRowToTable(tbl, rounds, 'td');
      for (let c=0; c < numCols; c++)
        tr.cells[c].classList.add('firstRow');
      // Remaining rows are one row per player.
      for( let r=0; r < includedSeats.length; r++) {
        const tr = this.addRowToTable(tbl, pScores[r], 'td');
        tr.cells[0].classList.add('firstCol');
        if(usePlayerColors) {
          tr.cells[0].style.backgroundColor = colors[r];
          tr.cells[0].style.color = 'white';
        }
      }
      for(let r=1; r < numRows; r++) {
        if(currentRound)
          tbl.rows[r].cells[currentRound].classList.add('currentRound');
        if(addTotals)
          tbl.rows[r].cells[numCols-1].classList.add('totalsLine');
      }
    }

    // Make top row, left column non-scrollable
    for (let r=0; r<numRows; r++) 
      tbl.rows[r].cells[0].classList.add('firstCol');
    for (let c=0; c< numCols; c++)
      tbl.rows[0].cells[c].classList.add('firstRow');

    const myDom = this.domElement;
    myDom.innerHTML = '';
    myDom.appendChild(tbl);
  }
  
}

