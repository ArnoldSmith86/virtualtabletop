let tracingActiveIndex = 0;
let loadedTrace = null;
let loadedTraceName = '';
let traceStartTime = 0;

function loadStateAtIndex(index) {
  index = Math.max(0, Math.min(loadedTrace.length-1, index));
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
  // the same notification a state from the server carries: every widget was just replaced, and
  // the editor keeps hold of the ones that were selected until it is told
  editorReceiveState(state);
  jeDisplayTrace(index);

  tracingActiveIndex = index;
  if(+$('#traceInput').value != index)
    $('#traceInput').value = index;
  $('#traceSummary').textContent = `record ${index} / ${loadedTrace.length-1}`;
  $('#traceDetail').textContent = traceRecordDescription(index);
}

// One line saying what the record on screen is, who it came from and how far into the recording it
// happened - the JSON pane next to it says the same thing in the wire vocabulary of the protocol.
function traceRecordDescription(index) {
  const record = loadedTrace[index] || {};
  const what = record.func == 'delta' && record.args && record.args.c ? `delta - ${record.args.c}`
             : record.func || record.type || (record.initialState ? 'initial state' : '');
  const who = record.player || record.exceptPlayer || '';
  const when = record.servertime && traceStartTime ? `+${((record.servertime-traceStartTime)/1000).toFixed(1)} s` : '';
  return [ loadedTraceName, what, who, when ].filter(part=>part).join(' · ');
}

// The trace commands and the record itself are shown in the JSON editor, which only lays out
// correctly once it is docked into a sidebar module - undocked, its three panes overlap and the
// command pane collapses to nothing behind the room. So a recording is opened the way CTRL+J opens
// the editor: enter edit mode, then activate the JSON module.
async function openTraceEditor() {
  if(!getEdit())
    await toggleEditMode();
  if(!$('#editorSidebar button[icon=data_object].active'))
    $('#editorSidebar button[icon=data_object]').click();
}

export async function loadTraceFile(file) {
  let records;
  try {
    records = JSON.parse(file.content);
  } catch(e) {}
  // a recording is the list of everything that went over the socket, opened by the state the room
  // was in when it started - checked here so that picking the wrong file says so instead of
  // failing as a raw parse error, and so that it leaves a recording that is already open alone
  if(!Array.isArray(records) || !records.length || !records[0].initialState)
    throw new Error(`${file.name} is not a VirtualTabletop trace recording.`);

  loadedTrace = records;
  loadedTraceName = file.name;
  traceStartTime = (loadedTrace.find(record=>record.servertime) || {}).servertime || 0;
  closeConnection();

  $('body').classList.add('trace');
  $('#traceInput').min = 0;
  $('#traceInput').max = loadedTrace.length-1;
  $('#traceInput').value = 0;

  // opening a second recording replaces the first: its commands would be listed twice otherwise
  for(let i=jeCommands.length-1; i>=0; --i)
    if(jeCommands[i].id.match(/^je_trace/))
      jeCommands.splice(i, 1);

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
        setPlayerName(p);
        for(const [ id, widget ] of widgets)
          widget.updateOwner();
      }
    });
  }
  jeCommands.push({
    id: 'je_traceBackToTrace',
    name: 'Back to Trace',
    context: '.*',
    // also listed when nothing is selected: clicking past the widgets is how the JSON pane ends up
    // empty, and this is the only way back to the record without moving the scrubber
    onEmpty: true,
    call: async function() {
      loadStateAtIndex(tracingActiveIndex);
    }
  });
  // the commands are listed in alphabetical order, so the ones that walk the recording share a name
  // that keeps them together and in the order they step in
  jeCommands.push({
    id: 'je_tracePreviousDelta',
    name: 'Step back to previous delta',
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
    name: 'Step forward to next delta',
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
      name: `Step ${offset < 0 ? 'back' : 'forward'} ${Math.abs(offset)} ${Math.abs(offset) == 1 ? 'record' : 'records'}`,
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

  await openTraceEditor();
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
  jeSet(jeStateBefore = JSON.stringify(jeStateNow, null, '  '));
  jeGetContext();
  jeShowCommands();
}

function updateTraceInput(e) {
  loadStateAtIndex(+e.target.value);
}

function initializeTraceViewer() {
  on('#traceInput', 'input', updateTraceInput);
  // nothing on screen belongs to the room any more - the socket was closed to keep the recording
  // from being overwritten by it - so leaving the viewer means loading the room again
  on('#traceClose', 'click', _=>location.reload());
}
