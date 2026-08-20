// A running timer is written by one client only so that its shared millisecond count moves on once
// per interval no matter how many people watch it. Normally that is the primary session, but a tab
// that its browser has frozen or throttled stops writing without disconnecting, so every other
// client takes over once the value has not moved for a whole interval plus this grace period.
const timerTakeoverGrace = 3000;

export class Timer extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 74,
      height: 30,

      typeClasses: 'widget timer',
      layer: -1,
      movable: false,

      milliseconds: 0,
      precision: 1000,
      paused: true,
      alert: false,
      countdown: false,
      start: 0,
      end: null
    });
  }

  // the value the elapsed time is measured from and the moment it was current. The last update
  // this client saw doubles as the sign of life of whoever is writing the timer.
  anchorTicking(milliseconds) {
    this.tickTime = this.lastMillisecondsUpdate = Date.now();
    this.tickMilliseconds = milliseconds;
    delete this.tickedMilliseconds;
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.milliseconds !== undefined) {
      const s = Math.floor(Math.abs(delta.milliseconds)/1000);
      setText(this.domElement, `${delta.milliseconds < 0 ? '-' : ''}${Math.floor(s/60)}:${Math.floor(s%60)}`.replace(/:(\d)$/, ':0$1'));

      if(delta.milliseconds !== this.tickedMilliseconds) {
        const now = Date.now();
        this.lastMillisecondsUpdate = now;
        // an update that says what this client would have written itself leaves its base alone, so
        // that the part of the interval that has not elapsed yet survives; anything else - a routine
        // adding time, another client with a clock of its own - becomes the new base
        if(delta.milliseconds !== this.millisecondsAt(now))
          this.anchorTicking(delta.milliseconds);
      }
    }

    if(delta.paused !== undefined || delta.precision !== undefined || delta.countdown !== undefined) {
      this.stopTimer();
      this.updateTicking();
    }
  }

  applyInitialDelta(delta) {
    super.applyInitialDelta(delta);
    this.updateTicking();
  }

  applyRemove() {
    super.applyRemove();
    this.stopTimer();
  }

  classes(includeTemporary=true) {
    let className = super.classes(includeTemporary);

    if(this.get('alert'))
      className += ' alert';
    if(this.get('paused'))
      className += ' paused';

    return className;
  }

  classesProperties() {
    const p = super.classesProperties();
    p.push('alert');
    p.push('paused');
    return p;
  }

  async click(mode='respect') {
    if(!await super.click(mode))
      await this.setPaused();
  }

  getPrecision() {
    return Math.max(this.get('precision'), 100);
  }

  getImage() {
    if(!Object.keys(this.get('svgReplaces') || {}).length)
      return this.get('image');

    const replaces = {};
    for(const key in this.get('svgReplaces'))
      replaces[key] = this.get(this.get('svgReplaces')[key]);
    return getSVG(this.get('image'), replaces, _=>this.domElement.style.cssText = this.css());
  }

  // whole intervals that have passed since the base, and the value they add up to - deriving it
  // from the wall clock instead of adding one interval per tick is what keeps a throttled or
  // suspended tab from falling behind: however many intervals its browser skipped, the next tick
  // lands on the time that really passed
  intervalsSince(now) {
    return Math.floor((now - this.tickTime)/this.getPrecision());
  }

  millisecondsAt(now) {
    return this.tickMilliseconds + Math.max(this.intervalsSince(now), 0)*this.getPrecision()*(this.get('countdown') ? -1 : 1);
  }

  async onPropertyChange(property, oldValue, newValue) {
    await super.onPropertyChange(property, oldValue, newValue);

    if(property == 'milliseconds') {
      const end = timeToMS(this.get('end'));
      await this.set('alert', end !== null && ((this.get('countdown') && newValue<=end) || (!this.get('countdown') && newValue>=end)));
    }
  }

  async setMilliseconds(value, mode) {
    let ms = timeToMS(this.get('start'));

    value = timeToMS(value);
    const propertyValue = timeToMS(this.get(value));
    if(typeof propertyValue == 'number')
      value = propertyValue;
    else if(typeof value != 'number')
      value = 0;

    if(mode == 'inc' || mode == 'dec')
      ms = this.get('milliseconds') + (mode == 'dec' ? -1 : 1) * value;
    else if(mode == 'set')
      ms = value;

    await this.set('milliseconds', parseInt(ms));
  }

  async tick() {
    const now = Date.now();
    const intervals = this.intervalsSince(now);
    if(intervals < 1)
      return;
    // lastMillisecondsUpdate only moves for values somebody else wrote, so a client that had to
    // take over keeps the timer running until the one that should be writing shows up again
    if(!isPrimarySession() && now - this.lastMillisecondsUpdate < this.getPrecision() + timerTakeoverGrace)
      return;

    this.tickedMilliseconds = this.millisecondsAt(now);
    this.tickTime += intervals*this.getPrecision();
    this.tickMilliseconds = this.tickedMilliseconds;
    await this.set('milliseconds', this.tickedMilliseconds);
  }

  async setPaused(mode) {
    if(mode == 'pause' || mode == 'reset')
      await this.set('paused',  true);
    else if(mode == 'start')
      await this.set('paused',  false);
    else
      await this.set('paused',  !this.get('paused'));
  }

  startTimer() {
    // a preview of a widget outside the room (the editor renders those) must not write state
    if(this.isReadonlyCopy)
      return;
    this.anchorTicking(this.get('milliseconds'));
    // checking at least once a second keeps a takeover from a stalled client from being delayed by
    // a long precision - the value itself only ever moves in whole intervals
    this.interval = setInterval(_=>this.tick(), Math.min(this.getPrecision(), 1000));
  }

  stopTimer() {
    clearInterval(this.interval);
    delete this.interval;
  }

  updateTicking() {
    if(this.get('paused'))
      this.stopTimer();
    else if(!this.interval)
      this.startTimer();
  }
}
