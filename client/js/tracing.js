import { onLoad } from './domhelpers.js';

export let tracingEnabled = false;

function enableTracing() {
  sendTraceEvent('enable');
  tracingEnabled = true;

  const originalRandom = Math.random;
  Math.random = function() {
    const number = originalRandom();
    sendTraceEvent('random', { number, stack: Error().stack });
    return number;
  };

  alert('Tracing is now enabled for this room.\nPress F9 again whenever a bug occurs.');
}

function sendTraceEvent(type, payload) {
  toServer('trace', { time: +new Date, deltaID: getDeltaID(), type, payload });
}

function sendUserTraceEvent() {
  const starttime = +new Date;
  const description = prompt('What just happened?');
  sendTraceEvent('user report', { starttime, description });
}

onLoad(function() {
  window.addEventListener('keydown', function(e) {
    if(!jeEnabled && e.key == 'F9') {
      if(e.ctrlKey)
        selectFile('TEXT').then(loadTraceFile);
      else if(!tracingEnabled)
        enableTracing();
      else
        sendUserTraceEvent();
    }
  });

  onMessage('tracing', _=>tracingEnabled=true);

  window.onerror = function(msg, url, line, col, err) {
    sendTraceEvent('error', { msg, url, line, col, err });
    location.reload();
  }
});
