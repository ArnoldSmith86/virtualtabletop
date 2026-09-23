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
