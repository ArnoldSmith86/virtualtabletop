export class Timer extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      width: 74,
      height: 36,

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
      const s = Math.floor(Math.abs(delta.milliseconds)/1000);
      setText(this.domElement, `${delta.milliseconds < 0 ? '-' : ''}${Math.floor(s/60)}:${Math.floor(s%60)}`.replace(/:(\d)$/, ':0$1'));
    }

    if(delta.paused !== undefined && delta.paused && this.interval)
      clearInterval(this.interval);
  }

  classes() {
    let className = super.classes();

    if(this.get('alert'))
      className += ' alert';

    return className;
  }

  classesProperties() {
    const p = super.classesProperties();
    p.push('alert');
    return p;
  }

  async click() {
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

    if(property == 'paused') {
      if(this.get('paused') && this.interval)
        clearInterval(this.interval);
      if(!this.get('paused'))
        this.interval = setInterval(_=>this.tick(), this.getPrecision());
    }
  }

  async setMilliseconds(milliseconds, mode) {
    let ms = this.get('start');

    if(typeof (this.get(milliseconds))=="number")
      var milliseconds = this.get(milliseconds);
    else if (typeof (milliseconds)!="number")
      milliseconds = 0;

    if(mode == 'inc' || mode == 'dec')
      ms = this.get('milliseconds') + (mode == 'dec' ? -1 : 1) * milliseconds;
    else if(mode == 'set')
      ms = milliseconds;

    await this.set('milliseconds', parseInt(ms));
  }

  async tick() {
    await this.set('milliseconds', this.get('milliseconds') + this.getPrecision()*(this.get('countdown') ? -1 : 1));
  }

  async setPaused(mode) {
    if(mode == 'pause'||mode == 'reset')
      await this.set('paused',  true);
    else if(mode == 'start')
      await this.set('paused',  false);
    else
      await this.set('paused',  !this.get('paused'));
  }
}
