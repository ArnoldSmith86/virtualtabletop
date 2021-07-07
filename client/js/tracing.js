import { onLoad } from './domhelpers.js';

let tracingEnabled = false;
let tracingActiveIndex = 0;
let loadedTrace = null;

function enableTracing() {
  sendTraceEvent('enable');
  tracingEnabled = true;
  alert('Tracing is now enabled until everyone leaves the room.\nPress F9 again whenever a bug occurs.');
}

function sendTraceEvent(type, payload) {
  toServer('trace', { time: +new Date, deltaID, type, payload });
}

function sendUserTraceEvent() {
  const starttime = +new Date;
  const description = prompt('What just happened?');
  sendTraceEvent('user report', { starttime, description });
}

function loadStateAtIndex(index) {
  let state = JSON.parse(JSON.stringify(loadedTrace[0].initialState));
  for(let i=1; i<=index; ++i) {
    if(loadedTrace[i].func == 'state') {
      state = JSON.parse(JSON.stringify(loadedTrace[i].args));
    }
    if(loadedTrace[i].func == 'delta') {
      for(const widgetID in loadedTrace[i].args.s) {
        if(loadedTrace[i].args.s[widgetID] === null) {
          delete state[widgetID];
        } else {
          if(!state[widgetID])
            state[widgetID] = {};
          for(const property in loadedTrace[i].args.s[widgetID]) {
            if(loadedTrace[i].args.s[widgetID][property] === null)
              delete state[widgetID][property];
            else
              state[widgetID][property] = loadedTrace[i].args.s[widgetID][property];
          }
        }
      }
    }
  }
  receiveStateFromServer(state);
  jeDisplayTrace(index);

  tracingActiveIndex = index;
  if(+$('#traceInput').value != index)
    $('#traceInput').value = index;
}

function loadTraceFile(file) {
  loadedTrace = JSON.parse(file.content);
  preventReconnect();
  connection.close();

  $('body').classList.add('trace');
  $('#traceInput').min = 0;
  $('#traceInput').max = loadedTrace.length-1;
  $('#traceInput').value = 0;

  const reportingPlayers = {};
  for(const i in loadedTrace) {
    if(loadedTrace[i].exceptPlayer)
      reportingPlayers[loadedTrace[i].exceptPlayer] = true;
    if(loadedTrace[i].type == 'user report') {
      jeCommands.push({
        id: `je_trace${i}`,
        name: `${i} - user report: ${loadedTrace[i].payload.description}`,
        context: '^Trace',
        call: async function() {
          loadStateAtIndex(+i);
        }
      });
    }
  }
  for(const p in reportingPlayers) {
    jeCommands.push({
      id: `je_tracePlayer${p}`,
      name: `Player ${p}`,
      context: '^Trace',
      call: async function() {
        playerName = p;
        for(const [ id, widget ] of widgets)
          widget.updateOwner();
      }
    });
  }
  jeCommands.push({
    id: 'je_traceBackToTrace',
    name: 'Back to Trace',
    context: '.*',
    call: async function() {
      loadStateAtIndex(tracingActiveIndex);
    }
  });
  jeCommands.push({
    id: 'je_tracePreviousDelta',
    name: 'Previous delta',
    context: '^Trace',
    call: async function() {
      for(let i=+$('#traceInput').value-1; i>=0; --i) {
        if(loadedTrace[i].func == 'delta') {
          loadStateAtIndex(i);
          break;
        }
      }
    }
  });
  jeCommands.push({
    id: 'je_traceNextDelta',
    name: 'Next delta',
    context: '^Trace',
    call: async function() {
      for(let i=+$('#traceInput').value+1; i<loadedTrace.length; ++i) {
        if(loadedTrace[i].func == 'delta') {
          loadStateAtIndex(i);
          break;
        }
      }
    }
  });
  for(const offset of [ -100, -10, -1, 1, 10, 100 ]) {
    jeCommands.push({
      id: `je_traceIndex${offset}`,
      name: `Index ${offset < 0 ? '-' : '+'} ${Math.abs(offset)}`,
      context: '^Trace',
      call: async function() {
        loadStateAtIndex(+$('#traceInput').value+offset);
      }
    });
  }
  jeCommands.push({
    id: 'je_traceReplayMove',
    name: 'Replay move',
    context: '^Trace',
    call: async function() {
      replayMoveFromTrace();
    }
  });

  jeToggle();
  loadStateAtIndex(0);
  showOverlay();
}

function replayMoveFromTrace() {
  const startTime = loadedTrace[tracingActiveIndex].servertime;
  const startPlayer = loadedTrace[tracingActiveIndex].player;
  for(let i=tracingActiveIndex; i<loadedTrace.length; ++i) {
    if(loadedTrace[i].type == 'moveStart' && startPlayer == loadedTrace[i].player)
      setTimeout(_=>widgets.get(loadedTrace[i].payload.id).moveStart(), loadedTrace[i].servertime-startTime);
    if(loadedTrace[i].type == 'move' && startPlayer == loadedTrace[i].player)
      setTimeout(_=>widgets.get(loadedTrace[i].payload.id).move(loadedTrace[i].payload.newX + widgets.get(loadedTrace[i].payload.id).get('width')/2, loadedTrace[i].payload.newY + widgets.get(loadedTrace[i].payload.id).get('height')/2), loadedTrace[i].servertime-startTime);
    if(loadedTrace[i].type == 'moveEnd' && startPlayer == loadedTrace[i].player) {
      setTimeout(_=>widgets.get(loadedTrace[i].payload.id).moveEnd(), loadedTrace[i].servertime-startTime);
      break;
    }
  }
}

function jeDisplayTrace(index) {
  jeMode = 'trace';
  jeWidget = null;
  jeStateNow = Object.assign({ index }, loadedTrace[index]);
  jeSet(jeStateBefore = JSON.stringify(jeStateNow, null, '  '), true);
  jeGetContext();
  jeShowCommands();
}

function updateTraceInput(e) {
  loadStateAtIndex(+e.target.value);
}

window.addEventListener('keydown', function(e) {
  if(e.key == 'F9') {
    if(e.ctrlKey)
      selectFile('TEXT').then(loadTraceFile);
    else if(!tracingEnabled)
      enableTracing();
    else
      sendUserTraceEvent();
  }
});

onLoad(function() {
  onMessage('tracing', _=>tracingEnabled=true);
  on('#traceInput', 'input', updateTraceInput);
});

window.onerror = function(msg, url, line, col, err) {
  sendTraceEvent('error', { msg, url, line, col, err });
  location.reload();
}

export { tracingEnabled };
