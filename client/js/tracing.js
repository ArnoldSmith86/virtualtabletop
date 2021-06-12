let tracingEnabled = false;
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
}

function loadTraceFile(file) {
  loadedTrace = JSON.parse(file.content);
  preventReconnect();
  connection.close();
  loadStateAtIndex(15);
  $('body').classList.add('trace');
  $('#traceInput').min = 0;
  $('#traceInput').max = loadedTrace.length-1;
  $('#traceInput').value = 0;
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
