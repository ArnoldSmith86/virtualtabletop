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
      image: '',
      svgReplaces: {},

      showIcon: 'bottom right',
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

    for(const property of Object.values(this.get('svgReplaces') || {}))
      if(delta[property] !== undefined)
        this.domElement.style.cssText = mapAssetURLs(this.css());
  }

  calculateZ() {
    const z = super.calculateZ();
    if(this.isZoomed())
      return z - ((this.get('layer') + 10) * 100000) + ((this.get('zoomedLayer') + 10) * 100000);
    return z;
  }

  classes(includeTemporary = true) {
    let className = super.classes(includeTemporary);

    const showIconValue = this.get('showIcon');
    if (showIconValue) {
      className += ' showIcon';
      const parts = showIconValue.trim().toLowerCase().split(/\s+/);
      let vertical = 'bottom';
      let horizontal = 'right';

      for (const part of parts) {
        if (['top', 'middle', 'bottom'].includes(part)) vertical = part;
        else if (['left', 'center', 'right'].includes(part)) horizontal = part;
      }

      className += ' ' + horizontal + ' ' + vertical;
    }

    if(this.isZoomed())
      className += ' zoomed';
    if(this.get('lockChildren'))
      className += ' lockChildren';
    if(this.get('image'))
      className += ' hasImage';

    return className;
  }

  classesProperties() {
    const properties = super.classesProperties();

    properties.push('showIcon', 'zoomedPlayers', 'lockChildren', 'image');

    return properties;
  }

  async click(mode='respect') {
    if(!await super.click(mode))
      await this.setZoomed(!this.isZoomed());
  }

  css() {
    let css = super.css();

    if(this.get('image'))
      css += '; background-image: url("' + this.getImage() + '")';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('image', 'svgReplaces');
    return p;
  }

  getImage() {
    if(!Object.keys(this.get('svgReplaces') || {}).length)
      return this.get('image');

    const replaces = {};
    for(const key in this.get('svgReplaces'))
      replaces[key] = this.get(this.get('svgReplaces')[key]);
    return getSVG(this.get('image'), replaces, _=>this.domElement.style.cssText = this.css());
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
    const selfScale = Number(this.get('zoomedScale'));
    const trigger = (selfScale >= 0.5 && zoomed) || (selfScale < 0.5 && !zoomed);
  
    if(trigger && Array.isArray(this.get('groupedWith')))
      for(const groupedWith of this.get('groupedWith'))
        if(groupedWith !== this.id && widgets.has(groupedWith)) {
          const other = widgets.get(groupedWith);
          if(other.get('type') === 'zoomy') {
            const invert = Number(other.get('zoomedScale')) < 0.5;
            const targetZoom = invert ? true : false;
            if(other.isZoomed() !== targetZoom)
              if(other.get('allPlayers'))
                await other.set('zoomedPlayers', targetZoom ? 'all' : []);
              else {
                const current = asArray(other.get('zoomedPlayers'));
                const updated = targetZoom ? [...current, playerName] : current.filter(p => p !== playerName);
                await other.set('zoomedPlayers', updated);
              }
          }
        }
  
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

  async move(coordGlobal, localAnchor) {
    if (this.isZoomed()) {
      const newCoord = this.dragCorner(coordGlobal, localAnchor);
      await this.set('zoomedX', newCoord.x);
      await this.set('zoomedY', newCoord.y);
      await this.snapToGrid();
    } else {
      await super.move(coordGlobal, localAnchor);
    }
  }

  updateScale() {
    this.targetTransform = this.domElement.style.transform = this.cssTransform();
  }

  updateOwner() {
    super.updateOwner();
    this.domElement.style.transform = this.cssTransform();
  }
}
