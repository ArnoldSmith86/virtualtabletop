// Keeps track of the deltas the server has not confirmed yet and decides how loudly to complain
// about it. Free of DOM access and timers so the escalation can be tested with an injected clock.

export const DELTA_CONFIRM_ICON_MS = 5000;
export const DELTA_CONFIRM_MESSAGE_MS = 10000;
export const DELTA_CONFIRM_RELOAD_WARN_MS = 20000;
export const DELTA_CONFIRM_RELOAD_MS = 30000;

// a gap between two monitor ticks that is far larger than the tick interval means the tab was
// suspended (device sleep, frozen background tab)
const SUSPENSION_GAP_MS = 2000;

let pendingDeltas = [];
let disconnected = false;
let lastTick = null;

export function resetDeltaMonitor() {
  pendingDeltas = [];
  disconnected = false;
  lastTick = null;
}

export function deltaSent(id, now = Date.now()) {
  pendingDeltas.push({ id, sentAt: now });
}

export function deltaConfirmed(id) {
  pendingDeltas = pendingDeltas.filter(p=>p.id != id);
}

export function connectionClosed() {
  disconnected = true;
}

// A fresh state from the server makes all unconfirmed deltas moot. Returns true if the player
// should be told that changes were reverted: always after a reconnect (where even a delta sent
// moments ago never reached the server), otherwise only after DELTA_CONFIRM_ICON_MS, because a
// normal state broadcast can legitimately overtake a delta that is still in flight.
export function stateReceived(now = Date.now()) {
  const changesLost = !!pendingDeltas.length && (disconnected || now - pendingDeltas[0].sentAt >= DELTA_CONFIRM_ICON_MS);
  pendingDeltas = [];
  disconnected = false;
  return changesLost;
}

export function connectionStatus(now = Date.now()) {
  // while the websocket is known-closed, the reconnect loop with its "Reconnecting..." status
  // handles recovery - the escalation below only targets zombie connections that stay open
  if(disconnected || !pendingDeltas.length)
    return { pendingCount: 0, state: '', msUntilReload: 0, reload: false };

  const oldestAge = now - pendingDeltas[0].sentAt;
  const pendingCount = pendingDeltas.length;
  if(oldestAge >= DELTA_CONFIRM_RELOAD_MS)
    return { pendingCount, state: 'reload', msUntilReload: 0, reload: true };
  if(oldestAge >= DELTA_CONFIRM_RELOAD_WARN_MS)
    return { pendingCount, state: 'reload', msUntilReload: DELTA_CONFIRM_RELOAD_MS - oldestAge, reload: false };
  if(oldestAge >= DELTA_CONFIRM_MESSAGE_MS)
    return { pendingCount, state: 'bad', msUntilReload: 0, reload: false };
  if(oldestAge >= DELTA_CONFIRM_ICON_MS)
    return { pendingCount, state: 'warn', msUntilReload: 0, reload: false };
  return { pendingCount: 0, state: '', msUntilReload: 0, reload: false };
}

// Called from the monitor interval. Returns null when the tab just resumed from a suspension: the
// suspended time is not counted against the server and the escalation is skipped for one tick so
// that confirmations which arrived while the tab was frozen get a chance to be processed first.
export function monitorTick(now = Date.now()) {
  const gap = lastTick === null ? 0 : now - lastTick;
  lastTick = now;
  if(gap >= SUSPENSION_GAP_MS) {
    for(const pending of pendingDeltas)
      pending.sentAt = Math.min(now, pending.sentAt + gap);
    return null;
  }
  return connectionStatus(now);
}
