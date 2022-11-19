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
      roundLabel: 'Round'
    });
  }

  applyDeltaToDOM(delta) {
    if(delta) // Don't call super unless this is a real delta to the scoreboard rather than from a seat
      super.applyDeltaToDOM(delta);
    const includedSeats = widgetFilter(w => w.get('type') == 'seat' && (this.get('includeAllSeats') || w.get('player') != '') && (!this.get('seats') || this.get('seats').includes(w.get('id')))).sort((a,b) => a.get('player') < b.get('player') ? -1 : 1);
    if(includedSeats.length)
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

    // Construct player scores array, remember maximum number of scores.
    let pScores = [];
    let totals = [];
    let numRounds = 0;
    let rounds = this.get('rounds');

    for (let i=0; i < includedSeats.length; i++) {
      const score = includedSeats[i].get(scoreProperty);
      if(Array.isArray(score) && score.length > numRounds)
        numRounds = score.length;
    }
    if(this.get('showAllRounds') && Array.isArray(rounds))
      numRounds = Math.max(rounds.length, numRounds);

    for (let i=0; i < includedSeats.length; i++) {
      const score = includedSeats[i].get(scoreProperty);
      if(Array.isArray(score)) {
        pScores[i] = score.map( s => isNaN(parseFloat(s)) ? 0 : parseFloat(s));
        totals[i] = pScores[i].reduce((partialSum, a) => partialSum + a, 0);
      } else {
        pScores[i] = [];
        totals[i] = parseFloat(score);
        if(isNaN(totals[i]))
          totals[i] = 0;
      }
      pScores[i] = pScores[i].concat(Array(numRounds).fill('')).slice(0,numRounds);
      if(addTotals)
        pScores[i].push(totals[i]);
      pScores[i].unshift(includedSeats[i].get('player'));
    }
    // Sort player scores if requested
    if(sortField == 'total')
      if(addTotals)
        pScores.sort((a,b) =>a[a.length-1] < b[b.length-1] ? -1 : 1);
    else if(sortField) {
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
      for (let i=0; i < pScores.length; i++) 
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
    rounds.unshift('Round');

    // Finally, build the table
    let tbl = document.createElement('table');
    tbl.style.height = (this.get('height') - 8) + 'px';
    tbl.style.width = (this.get('width') - 8) + 'px';
    let numRows;
    let numCols;
    if(this.get('playersInColumns')) {
      const names = pScores.map(x => x[0]);
      names.unshift(this.get('roundLabel'));
      tbl.innerHTML += '<tbody></tbody>';
      const tr = this.addRowToTable($('tbody', tbl), names, 'td');
      if(usePlayerColors)
        for (let i=0; i<includedSeats.length; i++ ) {
          tr.cells[i+1].style.backgroundColor = colors[i];
          tr.cells[i+1].style.color = 'white';
          tr.cells[i+1].style.textShadow = '1px 1px 1px #000';
        }
      for( let i=1; i < pScores[0].length; i++ ) {
        const pRow = pScores.map(x => x[i]);
        pRow.unshift(rounds[i]);
        const tr = this.addRowToTable($('tbody',tbl), pRow, 'td');
        tr.cells[0].classList.add('firstCol');
      }
      numCols = includedSeats.length + 1;
      numRows = numRounds + 1 + (addTotals ? 1 : 0);
      if(addTotals)
          for(let j=0; j < numCols; j++)
            tbl.rows[numRows-1].cells[j].classList.add('totalsLine');
    } else {
      this.addRowToTable(tbl, rounds, 'td');
      for( let i=0; i < pScores.length; i++) {
        const tr = this.addRowToTable(tbl, pScores[i], 'td');
        tr.cells[0].classList.add('firstCol');
        if(i==0)
          for (let j=0; j<= includedSeats.length; j++)
            tr.cells[i].classList.add('firstRow');
        if(usePlayerColors) {
          tr.cells[0].style.backgroundColor = colors[i];
          tr.cells[0].style.color = 'white';
          tr.cells[0].style.textShadow = '1px 1px 1px #000';
        }
      }
      numCols = numRounds + 1 + (addTotals ? 1 : 0);
      numRows = includedSeats.length + 1;
      if(addTotals)
          for(let j=0; j < numRows; j++)
            tbl.rows[j].cells[numCols-1].classList.add('totalsLine');
    }

    // Make top row, left column non-scrollable
    for (let i=0; i<numRows; i++) 
      tbl.rows[i].cells[0].classList.add('firstCol');
    for (let i=0; i< numCols; i++)
      tbl.rows[0].cells[i].classList.add('firstRow');

    const myDom = this.domElement;
    myDom.innerHTML = '';
    myDom.appendChild(tbl);
  }
  
}

