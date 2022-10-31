import { Widget } from './widget.js';

class ScoreBoard extends Widget {
  constructor(object, surface) {
    super(object, surface);

    this.addDefaults({
      movable: true,
      layer: -1,
      typeClasses: 'widget scoreboard',
      usePlayerColors: true,
      rounds: null
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

  tableCreate(players) {
    const tbl = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    const rounds = this.get('rounds');
    const useRounds = Array.isArray(rounds);

    tbl.appendChild(thead);
    tbl.appendChild(tbody);

    // Put player names in header
    if(useRounds) {
      const th = document.createElement('th');
      th.textContent = 'Round';
      thead.appendChild(th);
    }
    for (let i = 0; i < players.length; i++) {
      const th = document.createElement('th');
      th.textContent = players[i].get('player');
      if(this.get('usePlayerColors')) {
        th.style.backgroundColor = players[i].get('color');
        th.style.color = 'white';
      } else
        th.style.color = 'black';
      thead.appendChild(th);
    }

    // Compute transposed scores array
    let pScores = [];
    let totals = [];
    for (let i=0; i < players.length; i++) {
      const score = players[i].get('score');
      if(Array.isArray(score)) {
        pScores[i] = score;
        totals[i] = score.reduce((partialSum, a) => partialSum + a, 0);
      } else {
        pScores[i] = [];
        totals[i] = Number.isInteger(score) ? parseInt(score) : 0;
      }
    }
      
    pScores = pScores[0].map((_, colIndex) => pScores.map(row => row[colIndex]));

    // Fill in table rows
    for (let j = 0; j < pScores.length; j++) {
      const tr = document.createElement('tr');
      if(useRounds) {
        const th = document.createElement('th');
        th.textContent = rounds[j];
        tr.appendChild(th)
      }
      for (let i = 0; i < players.length; i++) {
        const td = tr.insertCell();
        td.textContent=pScores[j][i] || '';
      }
      tbody.appendChild(tr);
    }

    // Append totals row
    const tr = document.createElement('tr');
    if(useRounds) {
      const th = document.createElement('th');
      th.textContent = 'Totals';
      tr.appendChild(th)
    }
    for (let i=0; i < players.length; i++) {
      const td = tr.insertCell();
      td.textContent = totals[i];
      td.classList.add('totalsLine');
    }
    tbody.appendChild(tr);

    
    // Put table into DOM
    const here = this.domElement;
    here.innerHTML = '';
    here.appendChild(tbl);
    here.style.width = (tbl.offsetWidth +20)+'px';
    here.style.height = (tbl.offsetHeight + 20)+ 'px';
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

