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

function openFeedbackOverlay() {
  const details = collectClientDetails();

  // remember what was showing so we can return to it instead of just closing everything
  feedbackPreviousOverlay = [...$a('.overlay')].find(o=>o.id != 'feedbackOverlay' && o.style.display != 'none');
  feedbackPreviousActiveTab = $('.toolbarTab.active');
  for(const tabButton of $a('.toolbarTab'))
    toggleClass(tabButton, 'active', false);

  $('#feedbackOverlay textarea').value = '';
  $('#feedbackIncludeState').checked = true;
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
        $('#feedbackOverlay textarea').value = "Submitting your feedback failed. Please report this on Discord or GitHub:\n\n" + text;
    } catch(e) {
      $('#feedbackOverlay textarea').value = "Submitting your feedback failed. Please report this on Discord or GitHub:\n\n" + e.message + "\n" + e.stack;
    }
  };
}

function closeFeedbackOverlay() {
  if(feedbackPreviousActiveTab)
    toggleClass(feedbackPreviousActiveTab, 'active', true);
  showOverlay(feedbackPreviousOverlay && feedbackPreviousOverlay.id, true);
}

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
