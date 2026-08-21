// A running timer is written by one client only so that its shared millisecond count moves on once
// per interval no matter how many people watch it. That client is the one whose player started the
// timer, so that the timer's routines keep running for that player. Anybody else steps in only once
// the value has stood still for a whole interval plus this grace period - a tab that its browser has
// frozen or throttled stops writing without disconnecting - and a timer nobody in the room started
// goes to the primary session straight away. For the moment two clients write, both derive the same
// number from the same wall clock, so the count stays true - but each of them runs the timer's
// routines for the tick it writes.
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

    // the wall clock base exists from the start, so that the value can be derived before the first
    // update anchors it
    this.anchorTicking(this.get('milliseconds'));
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
      this.renderMilliseconds(delta.milliseconds);

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

    // a timer that stops or starts puts the writing up for election again, and a start goes to the
    // client whose own change it is - the one whose player started the timer
    if(delta.paused !== undefined) {
      this.startedTicking = delta.paused === false && this.locallyPausedTo === false;
      this.startedWhileHere = delta.paused === false;
      delete this.locallyPausedTo;
    }

    if(delta.paused !== undefined || delta.precision !== undefined || delta.countdown !== undefined) {
      this.stopTimer();
      this.updateTicking();
    }
  }

  applyInitialDelta(delta) {
    super.applyInitialDelta(delta);
    // a timer that was already running when this client got the room was started by nobody who is
    // here, so there is no client to leave the writing to
    delete this.startedWhileHere;
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

  // what one interval adds to the value - a countdown subtracts it
  intervalStep() {
    return this.getPrecision()*(this.get('countdown') ? -1 : 1);
  }

  millisecondsAt(now) {
    return this.tickMilliseconds + Math.max(this.intervalsSince(now), 0)*this.intervalStep();
  }

  async onPropertyChange(property, oldValue, newValue) {
    await super.onPropertyChange(property, oldValue, newValue);

    if(property == 'milliseconds') {
      const end = timeToMS(this.get('end'));
      await this.set('alert', end !== null && ((this.get('countdown') && newValue<=end) || (!this.get('countdown') && newValue>=end)));
    }
  }

  // below an hour the value reads as it always has, m:ss with unbounded minutes; from an hour on it
  // gets an hours field, so that a timer somebody left running says 1:00:00 instead of 60:00
  renderMilliseconds(milliseconds) {
    const s = Math.floor(Math.abs(milliseconds)/1000);
    const pad = value => String(value).padStart(2, '0');
    const time = s < 3600 ? `${Math.floor(s/60)}:${pad(s%60)}` : `${Math.floor(s/3600)}:${pad(Math.floor(s/60)%60)}:${pad(s%60)}`;
    setText(this.domElement, `${milliseconds < 0 ? '-' : ''}${time}`);
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
    if(!this.writesTicks(now)) {
      // leaving the writing to somebody else does not keep this client from showing the time: the
      // value comes from the wall clock, so a stalled writer freezes nobody's display. A timer
      // something watches does not catch up, though, so the clock would run its display ahead of the
      // value it is going to take - that one shows what it was last told.
      if(!this.valueIsWatched())
        this.renderMilliseconds(this.millisecondsAt(now));
      return;
    }

    if(this.valueIsWatched()) {
      // a routine can be watching for an exact value - a countdown that changes the turn at
      // "milliseconds == 100" has to be given that value - so a timer something watches moves on by
      // one interval per tick however many intervals its browser skipped. The ones it skipped are
      // time the timer did not count, as they have always been, rather than values it jumps over.
      // The base moves on by exactly the interval that was taken, so that the jitter of the
      // browser's callbacks - which are never early, only late - can not drop a tick. It may trail
      // the clock by two whole intervals before it is pulled along, which is far beyond that jitter
      // and keeps a tab that has just woken up from racing through the backlog.
      this.tickTime = Math.max(this.tickTime, now - 2*this.getPrecision()) + this.getPrecision();
      // measured from the value the timer actually holds, not from the base the wall clock is
      // derived from: taking over from another client means carrying on from what it last wrote
      await this.writeTick(this.get('milliseconds') + this.intervalStep());
    } else {
      // nothing in the room can tell which values it passed through, so it lands straight on the
      // time that really passed instead of falling behind by every interval the browser skipped
      this.tickTime += intervals*this.getPrecision();
      await this.writeTick(this.tickMilliseconds + intervals*this.intervalStep());
    }
  }

  // whether anything in the room is given every value the timer passes through: a routine on the
  // timer itself, or another widget listening for updates
  valueIsWatched() {
    return Array.isArray(this.get('millisecondsChangeRoutine')) || Array.isArray(this.get('changeRoutine'))
        || (StateManaged.globalUpdateListeners.milliseconds || []).length > 0
        || (StateManaged.globalUpdateListeners['*'] || []).length > 0;
  }

  // Which client writes the timer. The one whose player started it does, so that the timer's
  // routines keep running for that player.
  writesTicks(now) {
    if(this.startedTicking)
      return true;

    const grace = this.getPrecision() + timerTakeoverGrace;
    const silence = now - this.lastMillisecondsUpdate;
    // a timer that was started while this client was in the room belongs to the client that started
    // it, and as long as that one keeps writing nobody else does
    if(this.startedWhileHere && silence < grace)
      return false;
    // a timer nobody here started - one that was already running when this client got the room - and
    // one whose writer has fallen silent go to the primary session, so that exactly one client takes
    // them over. The rest of the room waits out a second grace period, which only ever elapses if
    // the primary session is itself the one that stalled.
    return isPrimarySession() || silence >= 2*grace;
  }

  // Consecutive ticks share one undo entry instead of filling the protocol one second at a time. A
  // tick that writes nothing - for the moment two clients write, the other one got there first -
  // must not leave that cause behind for whatever the player does next.
  async writeTick(milliseconds) {
    // a widget of this id that is not this one is a copy the editor renders - a drag preview builds
    // itself as a widget of its own - and nothing it derives may be written to the room
    if(widgets.get(this.id) !== this)
      return;
    this.tickMilliseconds = milliseconds;
    if(milliseconds === this.get('milliseconds'))
      return;
    this.tickedMilliseconds = milliseconds;
    setDeltaCause('timer ticked');
    await this.set('milliseconds', milliseconds);
  }

  async setPaused(mode) {
    const paused = mode == 'pause' || mode == 'reset' ? true : mode == 'start' ? false : !this.get('paused');

    // Starting a timer here makes this the client that writes it, so that its routines run for the
    // player who started it rather than for whoever the room's oldest connection belongs to. The
    // claim is noted for applyDeltaToDOM to pick up rather than made here, because the change comes
    // back either from inside set() or, for a routine, only when its batch of changes ends - a
    // change that is already the current value sends nothing, so it must not leave a claim behind.
    if(this.get('paused') !== paused)
      this.locallyPausedTo = paused;
    await this.set('paused', paused);
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
