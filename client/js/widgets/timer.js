export class Timer extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 74,
      height: 30,

      typeClasses: 'widget timer',
      layer: -1,
      movable: false,
      clickable: true,

      milliseconds: 0,
      precision: 1000,
      paused: true,
      alert: false,
      countdown: false,
      start: 0,
      end: null
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.milliseconds !== undefined) {
      const s = Math.floor(Math.abs(this.get('milliseconds'))/1000);
      setText(this.domElement, `${this.get('milliseconds') < 0 ? '-' : ''}${Math.floor(s/60)}:${Math.floor(s%60)}`.replace(/:(\d)$/, ':0$1'));
    }

    if(this.interval && (delta.paused !== undefined || delta.precision !== undefined)) {
      this.stopTimer();
      if(!this.get('paused'))
        this.startTimer();
    }
  }

  applyInitialDelta(delta) {
    super.applyInitialDelta(delta);
    if(delta.paused === false && activePlayers.length == 1)
      this.startTimer();
  }

  applyRemove() {
    super.applyRemove();
    if(this.interval) {
      console.log('remove clear');
      this.stopTimer();
    }
  }

  classes() {
    let className = super.classes();

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
    if(!Object.keys(this.get('svgReplaces')).length)
      return this.get('image');

    const replaces = {};
    for(const key in this.get('svgReplaces'))
      replaces[key] = this.get(this.get('svgReplaces')[key]);
    return getSVG(this.get('image'), replaces, _=>this.domElement.style.cssText = this.css());
  }

  async onPropertyChange(property, oldValue, newValue) {
    await super.onPropertyChange(property, oldValue, newValue);

    if(property == 'milliseconds')
      await this.set('alert', this.get('end') !== null && ((this.get('countdown') && newValue<=this.get('end')) || (!this.get('countdown') && newValue>=this.get('end'))));

    if(property == 'paused' && newValue !== true) {
      this.stopTimer();
      this.startTimer();
    }
  }

  async setMilliseconds(value, mode) {
    let ms = this.get('start');

    if(typeof this.get(value) == 'number')
      value = this.get(value);
    else if(typeof value != 'number')
      value = 0;

    if(mode == 'inc' || mode == 'dec')
      ms = this.get('milliseconds') + (mode == 'dec' ? -1 : 1) * value;
    else if(mode == 'set')
      ms = value;

    await this.set('milliseconds', parseInt(ms));
  }

  async tick() {
    await this.set('milliseconds', this.get('milliseconds') + this.getPrecision()*(this.get('countdown') ? -1 : 1));
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
    this.interval = setInterval(_=>this.tick(), this.getPrecision());
  }

  stopTimer() {
    clearInterval(this.interval);
    delete this.interval;
  }
}
