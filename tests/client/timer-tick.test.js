import { jest } from '@jest/globals';

import { widgets, addWidget } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';
import { setText, timeToMS } from '../../client/js/domhelpers.js';

import { removeWidget } from './client-util.js';

// timer.js relies on the concatenated global scope of the shipped bundle rather than on imports,
// so expose the identifiers it references before importing it.
let Timer;
let isPrimary = true;
beforeAll(async () => {
  globalThis.Widget = Widget;
  globalThis.widgets = widgets;
  globalThis.setText = setText;
  globalThis.timeToMS = timeToMS;
  globalThis.getSVG = url => url;
  globalThis.isPrimarySession = () => isPrimary;
  globalThis.setDeltaCause = () => {};
  globalThis.getMaxZ = () => 0;
  globalThis.updateMaxZ = () => {};
  globalThis.playerName = 'jestPlayer';
  ({ Timer } = await import('../../client/js/widgets/timer.js'));
});

beforeEach(() => {
  isPrimary = true;
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
    isPrimary = false;
    const timer = createTimer({ id: 'late', paused: false });
    const started = Date.now();

    // the client that owns the ticking is 30ms late with every update
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
      timer = createTimer({ id: 'watched', paused: false });
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

    test('it takes over once the updates stop coming in', async () => {
      await jest.advanceTimersByTimeAsync(4000);
      expect(timer.get('milliseconds')).toBe(7000);

      await jest.advanceTimersByTimeAsync(1000);
      expect(timer.get('milliseconds')).toBe(8000);
    });
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
