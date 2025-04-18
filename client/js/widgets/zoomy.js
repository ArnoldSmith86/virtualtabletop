import { Widget } from './widget.js';

export class Zoomy extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      typeClasses: 'widget zoomy',

      x: 100,
      y: 100,
      width: 800,
      height: 800,
      scale: 0.5,
      layer: -1,
      movable: false,

      animatePropertyChange: [
        {
          property: 'zoomedPlayers',
          duration: 500
        }
      ],
      hidePlayerCursors: true,
      dropTarget: {},

      defaultStyle: true,
      zoomedPlayers: [],
      groupedWith: [],
      allPlayers: false,

      zoomedX: 400,
      zoomedY: 100,
      zoomedLayer: -0.5,
      zoomedScale: 1,
      zoomedRotation: 0,

      zoomedMovable: false,
      lockChildren: false
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.layer !== undefined || delta.zoomedLayer !== undefined || delta.zoomedPlayers !== undefined)
      this.applyZ(true);
  }

  calculateZ() {
    const z = super.calculateZ();
    if(this.isZoomed())
      return z - ((this.get('layer') + 10) * 100000) + ((this.get('zoomedLayer') + 10) * 100000);
    return z;
  }

  classes(includeTemporary = true) {
    let className = super.classes(includeTemporary);

    if(this.get('defaultStyle'))
      className += ' defaultStyle';
    if(this.isZoomed())
      className += ' zoomed';
    if(this.get('lockChildren'))
      className += ' lockChildren';

    return className;
  }

  classesProperties() {
    const properties = super.classesProperties();

    properties.push('defaultStyle', 'zoomedPlayers', 'lockChildren');

    return properties;
  }

  async click(mode='respect') {
    if(!await super.click(mode))
      await this.setZoomed(!this.isZoomed());
  }

  cssTransform() {
    const x        = this.isZoomed() ? this.get('zoomedX'       ) : this.get('x'       );
    const y        = this.isZoomed() ? this.get('zoomedY'       ) : this.get('y'       );
    const scale    = this.isZoomed() ? this.get('zoomedScale'   ) : this.get('scale'   );
    const rotation = this.isZoomed() ? this.get('zoomedRotation') : this.get('rotation');

    let transform = `translate(${x}px, ${y}px)`;

    if(rotation)
      transform += ` rotate(${rotation}deg)`;
    if(scale != 1)
      transform += ` scale(${scale})`;

    return transform;
  }

  cssTransformProperties() {
    const properties = super.cssTransformProperties();

    properties.push('zoomedPlayers', 'zoomedX', 'zoomedY', 'zoomedScale', 'zoomedRotation');

    return properties;
  }

  get(property) {
    if(property == 'movable' && this.isZoomed())
      return this.get('zoomedMovable');
    return super.get(property);
  }

  isZoomed() {
    return this.get('zoomedPlayers') == 'all' || this.get('zoomedPlayers').includes(playerName);
  }

  async set(property, value) {
    if(this.isZoomed() && $('body').classList.contains('edit')) {
      if(property == 'x')
        await this.set('zoomedX', value);
      else if(property == 'y')
        await this.set('zoomedY', value);
      else if(property == 'scale')
        await this.set('zoomedScale', value);
      else if(property == 'rotation')
        await this.set('zoomedRotation', value);
      else
        await super.set(property, value);
    } else {
      await super.set(property, value);
    }
  }

  async setZoomed(zoomed) {
    if(zoomed && Array.isArray(this.get('groupedWith')))
      for(const groupedWith of this.get('groupedWith'))
        if(groupedWith != this.id && widgets.has(groupedWith) && widgets.get(groupedWith).get('type') == 'zoomy' && widgets.get(groupedWith).isZoomed())
          await widgets.get(groupedWith).setZoomed(false);
    if(zoomed && this.get('allPlayers'))
      await this.set('zoomedPlayers', 'all');
    else if(!zoomed && this.get('allPlayers'))
      await this.set('zoomedPlayers', []);
    else if(!Array.isArray(this.get('zoomedPlayers')))
      await this.set('zoomedPlayers', []);
    else if(zoomed)
      await this.set('zoomedPlayers', [...this.get('zoomedPlayers'), playerName]);
    else
      await this.set('zoomedPlayers', [...this.get('zoomedPlayers').filter(player => player != playerName)]);
  }

  updateScale() {
    this.targetTransform = this.domElement.style.transform = this.cssTransform();
  }

  updateOwner() {
    super.updateOwner();
    this.domElement.style.transform = this.cssTransform();
  }
}
