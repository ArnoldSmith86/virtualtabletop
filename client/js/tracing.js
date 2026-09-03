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

function collectClientDetails() {
  return {
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
}

let feedbackPreviousOverlay = null;
let feedbackPreviousActiveTab = null;
let feedbackThanksTimeout = null;

function isFeedbackOverlayOpen() {
  // 'flex' is the exact value showOverlay() sets when opening it; checking for that specific
  // value (rather than just != 'none') avoids two false positives: the untouched inline style
  // is '' (not 'none') before any overlay has ever been shown, and this self-heals correctly
  // if some other toolbar action opened a different overlay and hid this one along the way
  return $('#feedbackOverlay').style.display == 'flex';
}

function openFeedbackOverlay() {
  // tracing.js's onLoad callback (and so this click handler) is registered before main.js's,
  // so main.js's isLoading guard on .toolbarButton clicks never gets a chance to run for this
  // button - check it here directly instead
  if(isLoading)
    return;

  // while a forced overlay (connection lost, crash) is up, showOverlay() below would no-op,
  // so bail before touching tab state that closeFeedbackOverlay() would never restore
  if(isOverlayActive() == 'forced')
    return;

  // re-clicking the toolbar button while the overlay is already open should just close it,
  // not clobber the saved previous-overlay/tab state
  if(isFeedbackOverlayOpen()) {
    closeFeedbackOverlay();
    return;
  }

  // a stale success timer from a manually dismissed thanks screen must not close this new overlay
  clearTimeout(feedbackThanksTimeout);

  const details = collectClientDetails();

  // remember what was showing so we can return to it instead of just closing everything;
  // only elements explicitly shown by a previous showOverlay() call count (their inline
  // style is 'flex') - an untouched overlay's inline style is still '', not 'none'
  feedbackPreviousOverlay = [...$a('.overlay')].find(o=>o.id != 'feedbackOverlay' && o.style.display == 'flex');
  feedbackPreviousActiveTab = $('.toolbarTab.active');
  for(const tabButton of $a('.toolbarTab'))
    toggleClass(tabButton, 'active', false);

  // the textarea is deliberately not cleared here so an accidental close doesn't lose the draft
  $('#feedbackIncludeState').checked = true;
  $('#feedbackOverlay .feedbackError').style.display = 'none';
  $('#feedbackOverlay .feedbackThanks').style.display = 'none';
  showOverlay('feedbackOverlay');

  for(const closeButton of $a('#feedbackOverlay button[icon=close]'))
    closeButton.onclick = _=>closeFeedbackOverlay();

  const submitButton = $('#feedbackOverlay button[icon=check]');
  submitButton.disabled = false;
  submitButton.onclick = async function() {
    // guard against double submits (double-click, or clicking again during a slow request)
    if(submitButton.disabled)
      return;
    submitButton.disabled = true;
    try {
      // only send room-identifying details (URL, game state, etc.) when the player opts in
      const report = $('#feedbackIncludeState').checked ? details : { userAgent: details.userAgent };
      report.type = 'feedback';
      report.message = $('#feedbackOverlay textarea').value;
      const res = await fetch('clientError', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });
      const text = await res.text();
      if(res.ok && text.match(/^[a-z0-9]{8}$/)) {
        // show a short confirmation before returning to whatever was open before;
        // the button stays disabled so the thanks window can't produce a second report
        $('#feedbackOverlay textarea').value = '';
        const thanks = $('#feedbackOverlay .feedbackThanks');
        thanks.style.display = '';
        feedbackThanksTimeout = setTimeout(function() {
          thanks.style.display = 'none';
          if(isFeedbackOverlayOpen())
            closeFeedbackOverlay();
        }, 1500);
      } else {
        showFeedbackError("Submitting your feedback failed. Please report this on Discord or GitHub:\n\n" + text);
        submitButton.disabled = false;
      }
    } catch(e) {
      showFeedbackError("Submitting your feedback failed. Please report this on Discord or GitHub:\n\n" + e.message + "\n" + e.stack);
      submitButton.disabled = false;
    }
  };
}

function showFeedbackError(message) {
  // keep whatever the player already typed instead of overwriting it with the error
  const errorField = $('#feedbackOverlay .feedbackError');
  errorField.textContent = message;
  errorField.style.display = '';
}

function closeFeedbackOverlay() {
  clearTimeout(feedbackThanksTimeout);
  if(feedbackPreviousActiveTab)
    toggleClass(feedbackPreviousActiveTab, 'active', true);
  // no `forced` here: the previous overlay's display is already 'none', so a plain
  // showOverlay toggles it back on without leaving the whole overlay system stuck
  // in the crash-reporter-only "forced" state
  const previousID = feedbackPreviousOverlay && feedbackPreviousOverlay.id;
  if(previousID == 'statesOverlay')
    showStatesOverlay(previousID); // its normal open path also refreshes the filter layout
  else
    showOverlay(previousID);
}

// registered before main.js's window.onkeyup (tracing.js is concatenated earlier), so
// stopImmediatePropagation here pre-empts the generic Escape handling (which would just
// close everything via #activeGameButton instead of restoring the previous overlay/tab)
window.addEventListener('keyup', function(e) {
  if(e.key == 'Escape' && isFeedbackOverlayOpen()) {
    e.stopImmediatePropagation();
    closeFeedbackOverlay();
  }
});

onLoad(function() {
  on('#feedbackButton', 'click', openFeedbackOverlay);

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
      ...collectClientDetails()
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
