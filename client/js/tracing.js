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

// what ends up in an error handler is not necessarily an Error object: the browser reports
// script errors from other origins and problems like ResizeObserver loops without one, and
// `throw 'oops'` or Promise.reject() hand over whatever value was used
export function describeError(error, fallback) {
  // even reading a property can throw: a rejection reason may be a proxy or have getters
  try {
    if(error && (error.message !== undefined || error.stack !== undefined))
      return [ error.message, error.stack ].filter(part=>part !== undefined).map(stringifyValue).join('\n');
  } catch(e) {}
  return fallback + (error === undefined || error === null ? '' : '\n' + stringifyValue(error));
}

// some error events don't mean that the client is broken: a ResizeObserver loop is simply retried
// on the next frame and a cross-origin 'Script error.' usually comes from a browser extension.
// both are reported without an Error object, which is what tells them apart from a real crash.
export function isNonFatalError(msg, error) {
  return !error && /^(ResizeObserver loop|Script error\.?$)/.test(`${msg}`);
}

// a rejection reason is often a plain object like { status: 500 } - String() would turn that
// into a useless [object Object], while JSON.stringify fails on cyclic values and BigInt
function stringifyValue(value) {
  try {
    if(typeof value == 'object') {
      const json = JSON.stringify(value);
      if(json !== undefined)
        return json;
    }
  } catch(e) {}
  try {
    return String(value);
  } catch(e) {
    return `[${typeof value} that could not be converted to text]`;
  }
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

  const showClientError = function(text) {
    $('#clientErrorStack').textContent = text;
    showOverlay('clientErrorOverlay');
  }

  // the status line asks the user to copy the technical details, so make sure they are visible
  const askForManualReport = function() {
    $('#clientErrorStatus').style.display = '';
    $('#clientErrorOverlay details').open = true;
  }

  const reportError = function(description) {
    // close the connection before collecting the context: if that throws, the user still ends up
    // with a terminal overlay over a terminated session instead of a still running one
    preventReconnect();
    connection.close();

    const details = {
      error: description,
      undoProtocol,
      delta,
      mouseStatus: Object.fromEntries(Object.entries(mouseStatus).map(([id, ms]) => [id, {...ms, moveTarget: ms.moveTarget ? ms.moveTarget.get('id') : null, dragChain: undefined}])),
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

    const button = $('#clientErrorOverlay button');
    // what the user typed is the most valuable part of the report - keep the textarea intact
    // and put the reason for the failure into the technical details instead
    const submitFailed = function(reason) {
      button.disabled = false;
      button.textContent = 'Try again';
      askForManualReport();
      $('#clientErrorStack').textContent = `${details.error}\n\nSubmitting the report failed:\n${reason}`;
    }

    $('#clientErrorOverlay textarea').value = '';
    showClientError(details.error);
    button.addEventListener('click', async function() {
      button.disabled = true;
      button.textContent = 'Submitting…';
      $('#clientErrorStatus').style.display = 'none';
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
          submitFailed(text);
      } catch(e) {
        submitFailed(describeError(e, 'Unknown error'));
      }
    });
  }

  let errorReported = false;
  const errorHandler = function(error, fallback) {
    if(errorReported)
      return; // the first error is the one that broke things - later ones are usually just fallout
    errorReported = true;
    let description = fallback;
    try {
      description = describeError(error, fallback);
      reportError(description);
    } catch(e) {
      // collecting the context failed, e.g. because the error happened before the room was set
      // up - show the error itself anyway instead of leaving the user with a frozen page. there
      // is nothing to submit in that case, so ask for a manual report and offer a plain reload.
      $('#clientErrorQuestion').style.display = 'none';
      $('#clientErrorInput').style.display = 'none';
      askForManualReport();
      const button = $('#clientErrorOverlay button');
      button.textContent = 'Reload';
      button.addEventListener('click', _=>window.location.reload());
      showClientError(`${description}\n\nThe error reporter itself failed:\n${describeError(e, 'Unknown error')}`);
    }
  }

  window.onerror = function(msg, url, line, col, err) {
    // tearing the session down over a non-fatal event would be worse than ignoring it, which is
    // what happened anyway before this handler learned to survive a missing Error object
    if(isNonFatalError(msg, err))
      return;
    // when the browser has no real location it passes the document URL with line and column 0 -
    // reporting 'at <page>:0:0' would just look like a truncation bug, so leave the line out
    errorHandler(err, `${msg}` + (url && line ? `\n    at ${url}:${line}:${col}` : ''));
  };
  window.addEventListener("unhandledrejection", function(promiseRejectionEvent) {
    errorHandler(promiseRejectionEvent.reason, 'Unhandled promise rejection');
  });
});
