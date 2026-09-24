import { jest } from '@jest/globals';
import { addWidget } from '../../client/js/serverstate.js';
import { Widget } from '../../client/js/widgets/widget.js';
import { setText } from '../../client/js/domhelpers.js';
import { removeWidget } from './client-util.js';

let Timer;
beforeAll(async () => {
  globalThis.Widget = Widget;
  globalThis.setText = setText;
  ({ Timer } = await import('../../client/js/widgets/timer.js'));
});

test('timer display gains hours at one hour and keeps the sign', () => {
  const timer = new Timer('hours-display');
  addWidget({ id: 'hours-display', type: 'timer' }, timer);

  for(const [ milliseconds, display ] of [
    [ 0, '0:00' ], [ 3599000, '59:59' ], [ 3600000, '1:00:00' ],
    [ 11587000, '3:13:07' ], [ -11587000, '-3:13:07' ]
  ]) {
    timer.applyDeltaToDOM({ milliseconds });
    expect(timer.domElement.textContent).toBe(display);
  }

  removeWidget(timer.id);
});

test('revealing a paused timer fits hour text after hidden layout could not be measured', () => {
  const timer = new Timer('hidden-hours-display');
  Object.defineProperty(timer.domElement, 'clientWidth', { get: () => timer.domElement.classList.contains('hidden') ? 0 : 74 });
  Object.defineProperty(timer.timeDisplay, 'scrollWidth', { get: () => timer.timeDisplay.textContent.length * (parseFloat(timer.timeDisplay.style.fontSize) || 23) * 0.6 });
  const computedStyle = jest.spyOn(globalThis, 'getComputedStyle').mockImplementation(element => element === timer.timeDisplay ? { fontSize: '23px' } : { paddingLeft: '0px', paddingRight: '3px' });
  try {
    addWidget({ id: timer.id, type: 'timer', milliseconds: 3600000, display: false }, timer);

    expect(timer.domElement.classList.contains('hidden')).toBe(true);
    expect(timer.timeDisplay.style.fontSize).toBe('');

    timer.applyDelta({ display: true });
    expect(timer.timeDisplay.textContent).toBe('1:00:00');
    expect(parseFloat(timer.timeDisplay.style.fontSize)).toBeLessThan(23);
    expect(timer.timeDisplay.scrollWidth).toBeLessThanOrEqual(71);
  } finally {
    computedStyle.mockRestore();
    removeWidget(timer.id);
  }
});
