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

function collectClientDetails() {
  return {
    undoProtocol,
    delta,
    mouseStatus,
    mouseTarget,
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

function isFeedbackOverlayOpen() {
  // 'flex' is the exact value showOverlay() sets when opening it; checking for that specific
  // value (rather than just != 'none') avoids two false positives: the untouched inline style
  // is '' (not 'none') before any overlay has ever been shown, and this self-heals correctly
  // if some other toolbar action opened a different overlay and hid this one along the way
  return $('#feedbackOverlay').style.display == 'flex';
}

function openFeedbackOverlay() {
  // re-clicking the toolbar button while the overlay is already open should just close it,
  // not clobber the saved previous-overlay/tab and wipe out whatever the player had typed
  if(isFeedbackOverlayOpen()) {
    closeFeedbackOverlay();
    return;
  }

  const details = collectClientDetails();

  // remember what was showing so we can return to it instead of just closing everything;
  // only elements explicitly shown by a previous showOverlay() call count (their inline
  // style is 'flex'/'grid') - an untouched overlay's inline style is still '', not 'none'
  feedbackPreviousOverlay = [...$a('.overlay')].find(o=>o.id != 'feedbackOverlay' && (o.style.display == 'flex' || o.style.display == 'grid'));
  feedbackPreviousActiveTab = $('.toolbarTab.active');
  for(const tabButton of $a('.toolbarTab'))
    toggleClass(tabButton, 'active', false);

  $('#feedbackOverlay textarea').value = '';
  $('#feedbackIncludeState').checked = true;
  $('#feedbackOverlay .feedbackError').style.display = 'none';
  showOverlay('feedbackOverlay');

  for(const closeButton of $a('#feedbackOverlay button[icon=close]'))
    closeButton.onclick = _=>closeFeedbackOverlay();

  $('#feedbackOverlay button[icon=check]').onclick = async function() {
    // only send room-identifying details (URL, game state, etc.) when the player opts in
    const report = $('#feedbackIncludeState').checked ? details : { userAgent: details.userAgent };
    report.message = $('#feedbackOverlay textarea').value;
    try {
      const res = await fetch('clientError', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });
      const text = await res.text();
      if(text.match(/^[a-z0-9]{8}$/))
        closeFeedbackOverlay();
      else
        showFeedbackError("Submitting your feedback failed. Please report this on Discord or GitHub:\n\n" + text);
    } catch(e) {
      showFeedbackError("Submitting your feedback failed. Please report this on Discord or GitHub:\n\n" + e.message + "\n" + e.stack);
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
  if(feedbackPreviousActiveTab)
    toggleClass(feedbackPreviousActiveTab, 'active', true);
  // no `forced` here: the previous overlay's display is already 'none', so a plain
  // showOverlay toggles it back on without leaving the whole overlay system stuck
  // in the crash-reporter-only "forced" state
  showOverlay(feedbackPreviousOverlay && feedbackPreviousOverlay.id);
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

  const errorHandler = function(error) {
    const details = {
      error: String(error.message) + '\n' + String(error.stack),
      ...collectClientDetails()
    };
    preventReconnect();
    connection.close();
    $('#clientErrorOverlay textarea').value = '';
    $('#clientErrorStack').textContent = details.error;
    showOverlay('clientErrorOverlay');
    $('#clientErrorOverlay button').addEventListener('click', async function() {
      try {
        details.message = $('#clientErrorOverlay textarea').value;
        const res = await fetch('clientError', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(details)
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
