import { jest } from '@jest/globals';

import { batchEnd, batchStart, widgets, addWidget } from '../../client/js/serverstate.js';
import { StateManaged } from '../../client/js/statemanaged.js';
import { Widget } from '../../client/js/widgets/widget.js';
import { setText, timeToMS } from '../../client/js/domhelpers.js';

import { removeWidget } from './client-util.js';

// timer.js relies on the concatenated global scope of the shipped bundle rather than on imports,
// so expose the identifiers it references before importing it.
let Timer;
let isPrimary = true;
let deltaCauses = [];
beforeAll(async () => {
  globalThis.Widget = Widget;
  globalThis.widgets = widgets;
  globalThis.StateManaged = StateManaged;
  globalThis.setText = setText;
  globalThis.timeToMS = timeToMS;
  globalThis.getSVG = url => url;
  globalThis.isPrimarySession = () => isPrimary;
  globalThis.setDeltaCause = cause => deltaCauses.push(cause);
  globalThis.getMaxZ = () => 0;
  globalThis.updateMaxZ = () => {};
  globalThis.playerName = 'jestPlayer';
  globalThis.jeRoutineLogging = false;
  ({ Timer } = await import('../../client/js/widgets/timer.js'));
});

beforeEach(() => {
  isPrimary = true;
  deltaCauses = [];
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function createTimer(definition) {
  const timer = new Timer(definition.id);
  addWidget({ type: 'timer', ...definition }, timer);
  return timer;
}

describe('Timer ticking', () => {
  test('a running timer advances by one interval per interval', async () => {
    const timer = createTimer({ id: 'running', paused: false });
    await jest.advanceTimersByTimeAsync(3000);
    expect(timer.get('milliseconds')).toBe(3000);
    removeWidget('running');
  });

  test('a paused timer does not advance and starts on unpausing', async () => {
    const timer = createTimer({ id: 'paused' });
    await jest.advanceTimersByTimeAsync(3000);
    expect(timer.get('milliseconds')).toBe(0);

    await timer.setPaused('start');
    await jest.advanceTimersByTimeAsync(2000);
    expect(timer.get('milliseconds')).toBe(2000);
    removeWidget('paused');
  });

  test('a countdown counts down in its own precision', async () => {
    const timer = createTimer({ id: 'countdown', paused: false, countdown: true, precision: 500, milliseconds: 5000 });
    await jest.advanceTimersByTimeAsync(2000);
    expect(timer.get('milliseconds')).toBe(3000);
    removeWidget('countdown');
  });

  test('a tab that was frozen catches up with the time that really passed', async () => {
    const timer = createTimer({ id: 'frozen', paused: false });
    await jest.advanceTimersByTimeAsync(1000);
    expect(timer.get('milliseconds')).toBe(1000);

    // the browser stopped running the interval for half a minute
    jest.setSystemTime(Date.now() + 30000);
    await jest.advanceTimersByTimeAsync(1000);
    expect(timer.get('milliseconds')).toBe(32000);
    removeWidget('frozen');
  });

  test('time a routine adds while the timer runs is kept', async () => {
    const timer = createTimer({ id: 'incremented', paused: false });
    await jest.advanceTimersByTimeAsync(2000);
    await timer.setMilliseconds(60000, 'inc');
    expect(timer.get('milliseconds')).toBe(62000);

    await jest.advanceTimersByTimeAsync(2000);
    expect(timer.get('milliseconds')).toBe(64000);
    removeWidget('incremented');
  });

  test('a removed timer stops ticking', async () => {
    const timer = createTimer({ id: 'removed', paused: false });
    await jest.advanceTimersByTimeAsync(1000);
    removeWidget('removed');
    await jest.advanceTimersByTimeAsync(3000);
    expect(timer.get('milliseconds')).toBe(1000);
  });

  test('a widget preview outside the room never ticks', async () => {
    const preview = new Timer('preview');
    preview.isReadonlyCopy = true;
    preview.startTimer();
    expect(preview.interval).toBe(undefined);
  });

  test('updates that arrive late do not push the value behind the clock', async () => {
    const timer = createTimer({ id: 'late' });
    const started = Date.now();
    // another client in the room started it and owns the ticking, 30ms late with every update
    timer.applyDelta({ paused: false });

    await jest.advanceTimersByTimeAsync(1030);
    timer.applyDelta({ milliseconds: 1000 });
    for(const milliseconds of [ 2000, 3000 ]) {
      await jest.advanceTimersByTimeAsync(1000);
      timer.applyDelta({ milliseconds });
    }

    // ... and then stops, so this client has to finish the count itself
    await jest.advanceTimersByTimeAsync(4970);
    expect(timer.get('milliseconds')).toBe(Date.now() - started);
    removeWidget('late');
  });

  describe('with another client ticking', () => {
    let timer;
    beforeEach(async () => {
      isPrimary = false;
      timer = createTimer({ id: 'watched' });
      timer.applyDelta({ paused: false });
      // three seconds of updates from the client that owns the ticking
      for(let milliseconds = 1000; milliseconds <= 3000; milliseconds += 1000) {
        await jest.advanceTimersByTimeAsync(1000);
        timer.applyDelta({ milliseconds });
      }
    });

    afterEach(() => removeWidget('watched'));

    test('a client that is not the primary session leaves the value alone', async () => {
      const written = jest.spyOn(timer, 'set');
      await jest.advanceTimersByTimeAsync(1000);
      expect(written).not.toHaveBeenCalled();
      expect(timer.get('milliseconds')).toBe(3000);
      written.mockRestore();
    });

    test('its display follows the clock while it waits for the updates to come back', async () => {
      const written = jest.spyOn(timer, 'set');
      await jest.advanceTimersByTimeAsync(2000);
      expect(written).not.toHaveBeenCalled();
      expect(timer.get('milliseconds')).toBe(3000);
      expect(timer.domElement.textContent).toBe('0:05');
      written.mockRestore();
    });

    test('it leaves the first turn at a stalled writer to the primary session', async () => {
      const written = jest.spyOn(timer, 'set');
      await jest.advanceTimersByTimeAsync(5000);
      expect(written).not.toHaveBeenCalled();
      written.mockRestore();
    });

    test('it takes over once even the primary session stops writing', async () => {
      await jest.advanceTimersByTimeAsync(8000);
      expect(timer.get('milliseconds')).toBe(11000);

      await jest.advanceTimersByTimeAsync(1000);
      expect(timer.get('milliseconds')).toBe(12000);
    });

    test('the primary session takes over after one grace period', async () => {
      isPrimary = true;
      await jest.advanceTimersByTimeAsync(4000);
      expect(timer.get('milliseconds')).toBe(7000);
    });
  });

  describe('the client that started it', () => {
    test('writes the timer even when it is not the primary session', async () => {
      isPrimary = false;
      const timer = createTimer({ id: 'starter' });
      await timer.setPaused('start');

      await jest.advanceTimersByTimeAsync(3000);
      expect(timer.get('milliseconds')).toBe(3000);
      removeWidget('starter');
    });

    test('claims the writing for a start that a routine only sends when it ends', async () => {
      isPrimary = false;
      const timer = createTimer({ id: 'batched' });

      // a routine collects its changes and sends them in one delta once it has run
      batchStart();
      await timer.setPaused('start');
      batchEnd();

      await jest.advanceTimersByTimeAsync(2000);
      expect(timer.get('milliseconds')).toBe(2000);
      removeWidget('batched');
    });

    test('hands the writing back once somebody else restarts the timer', async () => {
      isPrimary = false;
      const timer = createTimer({ id: 'handed' });
      await timer.setPaused('start');
      await jest.advanceTimersByTimeAsync(2000);
      expect(timer.get('milliseconds')).toBe(2000);

      // another client resets and restarts it in one routine, so its delta carries the start only -
      // the claim still moves to that client
      timer.applyDelta({ paused: false, milliseconds: 0 });

      const written = jest.spyOn(timer, 'set');
      await jest.advanceTimersByTimeAsync(3000);
      expect(written).not.toHaveBeenCalled();
      written.mockRestore();
      removeWidget('handed');
    });
  });

  test('a timer a routine watches passes on every value instead of jumping', async () => {
    const timer = createTimer({ id: 'routine', paused: false, millisecondsChangeRoutine: [] });
    await jest.advanceTimersByTimeAsync(1000);
    const written = jest.spyOn(timer, 'set');

    // the browser stopped running the interval for half a minute
    jest.setSystemTime(Date.now() + 30000);
    await jest.advanceTimersByTimeAsync(3000);

    expect(written.mock.calls.filter(c=>c[0] == 'milliseconds').map(c=>c[1])).toEqual([ 2000, 3000, 4000 ]);
    expect(timer.get('milliseconds')).toBe(4000);
    written.mockRestore();
    removeWidget('routine');
  });

  test('a timer a routine watches carries on from the value it was last told', async () => {
    const timer = createTimer({ id: 'carried', millisecondsChangeRoutine: [] });
    timer.applyDelta({ paused: false });
    // three seconds of updates from the client that was writing it
    for(let milliseconds = 1000; milliseconds <= 3000; milliseconds += 1000) {
      await jest.advanceTimersByTimeAsync(1000);
      timer.applyDelta({ milliseconds });
    }

    // ... and then it stops, so this client takes the writing over
    await jest.advanceTimersByTimeAsync(4200);
    expect(timer.get('milliseconds')).toBe(4000);
    removeWidget('carried');
  });

  test('a timer a routine watches never shows a time it will not reach', async () => {
    isPrimary = false;
    const timer = createTimer({ id: 'shown', millisecondsChangeRoutine: [] });
    timer.applyDelta({ paused: false });
    await jest.advanceTimersByTimeAsync(1000);
    timer.applyDelta({ milliseconds: 1000 });

    // the client that writes it is throttled, so the value stays where it is until it gets there
    await jest.advanceTimersByTimeAsync(2000);
    expect(timer.domElement.textContent).toBe('0:01');
    removeWidget('shown');
  });

  test('a tick that another client got to first leaves no cause behind', async () => {
    const timer = createTimer({ id: 'overlap', paused: false });
    await jest.advanceTimersByTimeAsync(1000);
    expect(deltaCauses).toEqual([ 'timer ticked' ]);

    // during the moment two clients write, the other one wrote this value already
    timer.applyDelta({ milliseconds: 2000 });
    deltaCauses = [];
    const written = jest.spyOn(timer, 'set');
    await timer.writeTick(2000);

    expect(written).not.toHaveBeenCalled();
    expect(deltaCauses).toEqual([]);
    written.mockRestore();
    removeWidget('overlap');
  });

  describe('the value it displays', () => {
    let timer;
    beforeEach(() => timer = createTimer({ id: 'displayed' }));
    afterEach(() => removeWidget('displayed'));

    function shown(milliseconds) {
      timer.renderMilliseconds(milliseconds);
      return timer.domElement.textContent;
    }

    test('reads as minutes and seconds below an hour', () => {
      expect(shown(0)).toBe('0:00');
      expect(shown(5000)).toBe('0:05');
      expect(shown(65000)).toBe('1:05');
      expect(shown(3599000)).toBe('59:59');
    });

    test('gains an hours field from an hour on', () => {
      expect(shown(3600000)).toBe('1:00:00');
      expect(shown(3661000)).toBe('1:01:01');
      // a tab that slept for three hours
      expect(shown(11587000)).toBe('3:13:07');
    });

    test('keeps the minus sign of a countdown that ran past its end', () => {
      expect(shown(-65000)).toBe('-1:05');
      expect(shown(-11587000)).toBe('-3:13:07');
    });
  });
});
