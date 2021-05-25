let tracingEnabled = false;

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

window.addEventListener('keydown', function(e) {
  if(e.key == 'F9') {
    if(!tracingEnabled)
      enableTracing();
    else
      sendUserTraceEvent();
  }
});

onLoad(function() {
  onMessage('tracing', _=>tracingEnabled=true);
});

window.onerror = function(msg, url, line, col, err) {
  sendTraceEvent('error', { msg, url, line, col, err });
  location.reload();
}
