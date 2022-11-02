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
      sortBy: null
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    const players = widgetFilter(w => w.get('type') == 'seat' && w.get('player') != '').sort((a,b) => a.get('index') - b.get('index'));
    if(players.length)
      this.tableCreate(players)
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

  tableCreate(players) {

    // Construct player scores array, remember maximum number of scores.
    let pScores = [];
    let totals = [];
    let numRounds = 0;
    for (let i=0; i < players.length; i++) {
      const score = players[i].get('score');
      if(Array.isArray(score) && score.length > numRounds)
        numRounds = score.length;
    }
    for (let i=0; i < players.length; i++) {
      const score = players[i].get('score');
      if(Array.isArray(score)) {
        pScores[i] = [...score];
        totals[i] = score.reduce((partialSum, a) => partialSum + a, 0);
      } else {
        pScores[i] = [];
        totals[i] = Number.isInteger(score) ? parseInt(score) : 0;
      }
      pScores[i] = pScores[i].concat(Array(numRounds).fill('')).slice(0,numRounds);
      pScores[i].push(totals[i]);
      pScores[i].unshift(players[i].get('player'));
    }
    // Sort player scores if requested
    if(this.get('sortBy') == 'playerAsc')
      pScores.sort((a,b) => a[0]<b[0] ? -1 : 1);
    else if (this.get('sortBy') == 'playerDesc')
      pScores.sort((a,b) => a[0]<b[0] ? 1 : -1);
    else if (this.get('sortBy') == 'scoresAsc')
      pScores.sort((a,b) =>a[a.length-1] < b[b.length-1] ? -1 : 1);
    else if (this.get('sortBy') == 'scoresDesc')
      pScores.sort((a,b) => a[a.length-1] < b[b.length-1] ? 1 : -1);
    else if (this.get('sortBy') == 'seatAsc' || this.get('sortBy') == 'seatDesc')
      pScores.sort((a,b) => {
        const pa = players.filter(x=> x.get('player') == a[0])[0].get('index');
        const pb = players.filter(x=> x.get('player') == b[0])[0].get('index');
        if(pa < pb)
          return this.get('sortBy') == 'seatAsc' ? -1 : 1;
        else
          return this.get('sortBy') == 'seatAsc' ? 1 : -1;
      });

    // Get player colors if needed
    const colors = []; // Array of player colors
    if(this.get('usePlayerColors'))
      for (let i=0; i < pScores.length; i++) 
        colors.push(players.filter(x=> x.get('player') == pScores[i][0])[0].get('color'));

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
        for (let i=0; i<players.length; i++ )
          tr.cells[i+1].style.color = colors[i];
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
        if(this.get('usePlayerColors'))
            tr.cells[0].style.color = colors[i];
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

