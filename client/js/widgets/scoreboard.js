import { $, $a, removeFromDOM, asArray, escapeID } from '../domhelpers.js';
import { Widget } from './widget.js';

class ScoreBoard extends Widget {
  constructor(object, surface) {
    super(object, surface);

    this.addDefaults({
      movable: true,
      layer: -1,
      typeClasses: 'widget scoreboard',
      usePlayerColors: true,
      playersInColumns: true,
      rounds: null,
      sortField: 'player',
      sortOrder: 'ascending'
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    const filledSeats = widgetFilter(w => w.get('type') == 'seat' && w.get('player') != '').sort((a,b) => a.get('player') < b.get('player') ? -1 : 1);
    if(filledSeats.length)
      this.tableCreate(filledSeats)
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

  tableCreate(filledSeats) {

    // Construct player scores array, remember maximum number of scores.
    let pScores = [];
    let totals = [];
    let numRounds = 0;
    for (let i=0; i < filledSeats.length; i++) {
      const score = filledSeats[i].get('score');
      if(Array.isArray(score) && score.length > numRounds)
        numRounds = score.length;
    }
    for (let i=0; i < filledSeats.length; i++) {
      const score = filledSeats[i].get('score');
      if(Array.isArray(score)) {
        pScores[i] = score.map( s => isNaN(parseFloat(s)) ? 0 : parseFloat(s));
        totals[i] = pScores[i].reduce((partialSum, a) => partialSum + a, 0);
      } else {
        pScores[i] = [];
        totals[i] = parseFloat(score);
        if (isNaN(parseFloat(totals[i])))
          totals[i] = 0;
      }
      pScores[i] = pScores[i].concat(Array(numRounds).fill('')).slice(0,numRounds);
      pScores[i].push(totals[i]);
      pScores[i].unshift(filledSeats[i].get('player'));
    }
    // Sort player scores if requested
    if(this.get('sortField') == 'total')
      pScores.sort((a,b) =>a[a.length-1] < b[b.length-1] ? -1 : 1);
    else if(this.get('sortField')) {
      const fld = this.get('sortField');
      pScores.sort((a,b) => {
        const pa = filledSeats.filter(x=> x.get('player') == a[0])[0].get(fld);
        const pb = filledSeats.filter(x=> x.get('player') == b[0])[0].get(fld);
        return pa < pb ? -1 : 1;
      });
    }
    if(this.get('sortOrder') == 'descending')
      pScores = pScores.reverse();

    // Get player colors if needed
    const colors = []; // Array of player colors
    if(this.get('usePlayerColors'))
      for (let i=0; i < pScores.length; i++) 
        colors.push(filledSeats.filter(x=> x.get('player') == pScores[i][0])[0].get('color'));

    // Create round name headers
    let rounds = this.get('rounds');
    if(Array.isArray(rounds)) 
      rounds = rounds.concat(Array(numRounds).fill('')).slice(0,numRounds);
    else
      rounds = [...Array(numRounds).keys()].map(i => i+1);
    rounds.push('Totals');
    rounds.unshift('Round');

    // Finally, build the table
    let tbl = document.createElement('table');
    if(this.get('playersInColumns')) {
      const names = pScores.map(x => x[0]);
      names.unshift('Round');
      tbl.innerHTML += '<thead></thead>';
      const tr = this.addRowToTable($('thead', tbl), names, 'th');
      if(this.get('usePlayerColors'))
        for (let i=0; i<filledSeats.length; i++ ) {
          tr.cells[i+1].style.backgroundColor = colors[i];
          tr.cells[i+1].style.color = 'white';
          tr.cells[i+1].style.textShadow = '1px 1px 1px #000';
        }
      tbl.innerHTML += '<tbody></tbody>';
      for( let i=1; i < pScores[0].length; i++ ) {
        const pRow = pScores.map(x => x[i]);
        pRow.unshift(rounds[i]);
        const tr = this.addRowToTable($('tbody',tbl), pRow, 'td');
        tr.cells[0].outerHTML = `<th>${tr.cells[0].innerHTML}</th>`;
        if(i == pScores[0].length - 1)
          for(let j=0; j <= pScores.length; j++)
            tr.cells[j].classList.add('totalsLine');
      }
    } else {
      this.addRowToTable(tbl, rounds, 'th');
      for( let i=0; i < pScores.length; i++) {
        const tr = this.addRowToTable(tbl, pScores[i], 'td');
        tr.cells[0].outerHTML = `<th>${tr.cells[0].innerHTML}</th>`;
        if(this.get('usePlayerColors')) {
          tr.cells[0].style.backgroundColor = colors[i];
          tr.cells[0].style.color = 'white';
          tr.cells[0].style.textShadow = '1px 1px 1px #000';
        }
      }
    }

    const myDom = this.domElement;
    myDom.innerHTML = '';
    myDom.appendChild(tbl);
    myDom.style.width = (tbl.offsetWidth +20)+'px';
    myDom.style.height = (tbl.offsetHeight + 20)+ 'px';
  }
  
/*
  cssProperties() {
    const p = super.cssProperties();
    p.push('format');
    return p;
  }

  css() {
    let css = super.css();

    return css;
  }
*/

  classes() {
    let className = super.classes();

    if(this.get('format')=='turns')
      className += ' turns';

    return className;
  }

  classesProperties() {
    const p = super.classesProperties();
    p.push('format');
    return p;
  }

/*  applyRemove() {
  }\*/
}

