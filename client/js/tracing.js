import { onLoad } from './domhelpers.js';

export let tracingEnabled = false;

function enableTracing() {
  sendTraceEvent('enable');
  tracingEnabled = true;

  alert('Tracing is now enabled for this room.\nPress F9 again whenever a bug occurs.');
}

function traceRandom(number) {
  if(tracingEnabled)
    sendTraceEvent('random', { number, stack: Error().stack });
  return number;
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
        selectFile('TEXT').then(loadTraceFile).catch(e=>{
          if(e.message !== 'File selection cancelled.')
            alert(`Error: ${e.toString()}`);
        });
      else if(!tracingEnabled)
        enableTracing();
      else
        sendUserTraceEvent();
    }
  });

  onMessage('tracing', _=>tracingEnabled=true);

  const errorHandler = function(error) {
    const details = {
      error: String(error.message) + '\n' + String(error.stack),
      undoProtocol,
      delta,
      mouseStatus: Object.fromEntries(Object.entries(mouseStatus).map(([id, ms]) => [id, {...ms, moveTarget: ms.moveTarget ? ms.moveTarget.get('id') : null}])),
      mouseTarget: mouseTarget && mouseTarget.id ? unescapeID(mouseTarget.id.slice(2)) : null,
      jeLoggingData: typeof jeLoggingRoutineGetData == 'function' ? jeLoggingRoutineGetData() : null,
      lastExecutedOperation,
      bodyClass: $('body').className,
      activeOverlay: [...$a('.overlay')].filter(o=>o.style.display!='none').map(o=>o.id),
      jsonEditor: $('#jeText') && $('#jeText').innerText,
      activeButtons: [...$a('button.active')].map(b=>b.getAttribute('icon') || b.id),
      widgetsState: [...widgets.keys()].map(id=>widgets.get(id).state),
      url: location.href,
      userAgent: navigator.userAgent,
      playerName,
      html: document.documentElement.outerHTML
    };
    preventReconnect();
    connection.close();
    $('#clientErrorOverlay textarea').value = '';
    $('#clientErrorStack').textContent = details.error;
    showOverlay('clientErrorOverlay');
    $('#clientErrorOverlay button').addEventListener('click', async function() {
      try {
        details.message = $('#clientErrorOverlay textarea').value;
        const ancestors = [];
        const body = JSON.stringify(details, function(key, value) {
          if(typeof value != 'object' || value === null)
            return value;
          while(ancestors.length && ancestors[ancestors.length-1] != this)
            ancestors.pop();
          if(ancestors.includes(value))
            return '[cyclic]';
          ancestors.push(value);
          return value;
        });
        const res = await fetch('clientError', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body
        });
        const text = await res.text();
        if(text.match(/^[a-z0-9]{8}$/))
          window.location.reload();
        else
          $('#clientErrorOverlay textarea').value = "Submitting the error failed. Please report this on Discord or GitHub:\n\n" + details.error + "\n\n" + text;
      } catch(e) {
        $('#clientErrorOverlay textarea').value = "Submitting the error failed. Please report this on Discord or GitHub:\n\n" + details.error + "\n\n" + e.message + "\n" + e.stack;
      }
    });
  }
  window.onerror = function(msg, url, line, col, err) {
    errorHandler(err);
  };
  window.addEventListener("unhandledrejection", function(promiseRejectionEvent) {
    errorHandler(promiseRejectionEvent.reason);
  });
});
