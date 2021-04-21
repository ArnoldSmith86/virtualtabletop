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

      seconds: 0,
      paused: true,
      countdown: false
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.seconds !== undefined) {
      const s = Math.abs(delta.seconds);
      this.domElement.textContent = `${delta.seconds < 0 ? '-' : ''}${Math.floor(s/60)}:${Math.floor(s%60)}`.replace(/:(\d)$/, ':0$1');
    }
    if(delta.paused !== undefined && delta.paused && this.interval)
      clearInterval(this.interval);
  }

  async click() {
    this.togglePaused();
  }

  getImage() {
    if(!Object.keys(this.p('svgReplaces')).length)
      return this.p('image');

    const replaces = {};
    for(const key in this.p('svgReplaces'))
      replaces[key] = this.p(this.p('svgReplaces')[key]);
    return getSVG(this.p('image'), replaces, _=>this.domElement.style.cssText = this.css());
  }

  onPropertyChange(property, oldValue, newValue) {
    super.onPropertyChange(property, oldValue, newValue);
    if(property == 'paused') {
      if(this.p('paused') && this.interval)
        clearInterval(this.interval);
      if(!this.p('paused'))
        this.interval = setInterval(_=>this.tick(), 1000);
    }
  }

  tick() {
    this.p('seconds', this.p('seconds') + (this.p('countdown') ? -1 : 1));
  }

  togglePaused(paused) {
    this.p('paused', paused === undefined ? !this.p('paused') : paused);
  }
}
