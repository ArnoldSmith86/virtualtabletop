import {
  DELTA_CONFIRM_ICON_MS,
  DELTA_CONFIRM_MESSAGE_MS,
  DELTA_CONFIRM_RELOAD_MS,
  DELTA_CONFIRM_RELOAD_WARN_MS,
  connectionClosed,
  connectionStatus,
  deltaConfirmed,
  deltaSent,
  monitorTick,
  resetDeltaMonitor,
  stateReceived
} from '../../client/js/deltamonitor.js';

const T = 1000000;

beforeEach(resetDeltaMonitor);

describe('escalation while deltas stay unconfirmed', function() {
  test('nothing is shown without pending deltas', function() {
    expect(connectionStatus(T)).toEqual({ pendingCount: 0, state: '', msUntilReload: 0, reload: false });
  });

  test('nothing is shown before the icon delay', function() {
    deltaSent(1, T);
    expect(connectionStatus(T + DELTA_CONFIRM_ICON_MS - 1).state).toBe('');
  });

  test('the icon appears, then the message, then the countdown', function() {
    deltaSent(1, T);
    expect(connectionStatus(T + DELTA_CONFIRM_ICON_MS)).toEqual({ pendingCount: 1, state: 'warn', msUntilReload: 0, reload: false });
    expect(connectionStatus(T + DELTA_CONFIRM_MESSAGE_MS)).toEqual({ pendingCount: 1, state: 'bad', msUntilReload: 0, reload: false });
    expect(connectionStatus(T + DELTA_CONFIRM_RELOAD_WARN_MS)).toEqual({
      pendingCount: 1,
      state: 'reload',
      msUntilReload: DELTA_CONFIRM_RELOAD_MS - DELTA_CONFIRM_RELOAD_WARN_MS,
      reload: false
    });
  });

  test('the countdown counts down', function() {
    deltaSent(1, T);
    expect(connectionStatus(T + DELTA_CONFIRM_RELOAD_MS - 3000).msUntilReload).toBe(3000);
  });

  test('the reload is requested after the reload delay', function() {
    deltaSent(1, T);
    expect(connectionStatus(T + DELTA_CONFIRM_RELOAD_MS - 1).reload).toBe(false);
    expect(connectionStatus(T + DELTA_CONFIRM_RELOAD_MS).reload).toBe(true);
  });

  test('the escalation follows the oldest unconfirmed delta and counts all of them', function() {
    deltaSent(1, T);
    deltaSent(2, T + 4000);
    expect(connectionStatus(T + DELTA_CONFIRM_MESSAGE_MS)).toEqual({ pendingCount: 2, state: 'bad', msUntilReload: 0, reload: false });
  });
});

describe('confirmations', function() {
  test('confirming the only delta clears the status', function() {
    deltaSent(1, T);
    deltaConfirmed(1);
    expect(connectionStatus(T + DELTA_CONFIRM_RELOAD_MS).reload).toBe(false);
    expect(connectionStatus(T + DELTA_CONFIRM_RELOAD_MS).state).toBe('');
  });

  test('confirming out of order de-escalates to the oldest remaining delta', function() {
    deltaSent(1, T);
    deltaSent(2, T + DELTA_CONFIRM_ICON_MS);
    expect(connectionStatus(T + DELTA_CONFIRM_MESSAGE_MS).state).toBe('bad');
    deltaConfirmed(1);
    expect(connectionStatus(T + DELTA_CONFIRM_MESSAGE_MS)).toEqual({ pendingCount: 1, state: 'warn', msUntilReload: 0, reload: false });
  });

  test('confirming an unknown id changes nothing', function() {
    deltaSent(1, T);
    deltaConfirmed(99);
    expect(connectionStatus(T + DELTA_CONFIRM_ICON_MS).pendingCount).toBe(1);
  });
});

describe('a closed websocket', function() {
  test('suppresses the escalation and the reload, leaving recovery to the reconnect loop', function() {
    deltaSent(1, T);
    connectionClosed();
    expect(connectionStatus(T + DELTA_CONFIRM_RELOAD_MS)).toEqual({ pendingCount: 0, state: '', msUntilReload: 0, reload: false });
    expect(monitorTick(T + DELTA_CONFIRM_RELOAD_MS).reload).toBe(false);
  });
});

describe('a fresh state from the server', function() {
  test('clears the pending deltas', function() {
    deltaSent(1, T);
    stateReceived(T + DELTA_CONFIRM_ICON_MS);
    expect(connectionStatus(T + DELTA_CONFIRM_RELOAD_MS).state).toBe('');
  });

  test('does not report lost changes when there was nothing pending', function() {
    expect(stateReceived(T)).toBe(false);
  });

  test('does not report lost changes for a delta that may still be in flight', function() {
    deltaSent(1, T);
    expect(stateReceived(T + DELTA_CONFIRM_ICON_MS - 1)).toBe(false);
  });

  test('reports lost changes for a delta that went unconfirmed for a while', function() {
    deltaSent(1, T);
    expect(stateReceived(T + DELTA_CONFIRM_ICON_MS)).toBe(true);
  });

  test('reports lost changes for any pending delta after a reconnect', function() {
    deltaSent(1, T);
    connectionClosed();
    expect(stateReceived(T + 100)).toBe(true);
  });

  test('ends the disconnected state so the escalation works again', function() {
    connectionClosed();
    stateReceived(T);
    deltaSent(1, T);
    expect(connectionStatus(T + DELTA_CONFIRM_MESSAGE_MS).state).toBe('bad');
  });
});

describe('a suspended tab', function() {
  // the monitor interval ticks every 500ms; a much larger gap means the tab was frozen
  function tickUntil(from, ms) {
    let status = null;
    for(let t = 500; t <= ms; t += 500)
      status = monitorTick(from + t);
    return status;
  }

  test('does not count the suspended time against the server', function() {
    monitorTick(T);
    deltaSent(1, T + 400);
    monitorTick(T + 500);
    // the tab is frozen for a minute right after the delta was sent
    expect(monitorTick(T + 60500)).toBe(null);
    // the delta is only as old as it was before the freeze, so the escalation starts over
    expect(tickUntil(T + 60500, DELTA_CONFIRM_ICON_MS - 500).state).toBe('');
    expect(tickUntil(T + 60500 + DELTA_CONFIRM_ICON_MS - 500, 500).state).toBe('warn');
  });

  test('gets the full countdown instead of an instant reload', function() {
    monitorTick(T);
    deltaSent(1, T);
    expect(monitorTick(T + 120000)).toBe(null);
    const beforeReload = tickUntil(T + 120000, DELTA_CONFIRM_RELOAD_MS - 500);
    expect(beforeReload).toEqual({ pendingCount: 1, state: 'reload', msUntilReload: 500, reload: false });
    expect(monitorTick(T + 120000 + DELTA_CONFIRM_RELOAD_MS).reload).toBe(true);
  });

  test('keeps the time a connection was already unresponsive before the suspension', function() {
    monitorTick(T);
    deltaSent(1, T);
    expect(tickUntil(T, DELTA_CONFIRM_RELOAD_WARN_MS).state).toBe('reload');
    expect(monitorTick(T + 300000)).toBe(null);
    expect(tickUntil(T + 300000, DELTA_CONFIRM_RELOAD_MS - DELTA_CONFIRM_RELOAD_WARN_MS).reload).toBe(true);
  });

  test('does not mistake regular ticks for a suspension', function() {
    monitorTick(T);
    deltaSent(1, T);
    for(let tick = 500; tick < DELTA_CONFIRM_RELOAD_MS; tick += 500)
      expect(monitorTick(T + tick)).not.toBe(null);
    expect(monitorTick(T + DELTA_CONFIRM_RELOAD_MS).reload).toBe(true);
  });
});
