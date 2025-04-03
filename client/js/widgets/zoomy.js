import { Widget } from './widget.js';

export class Zoomy extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      movable: false,
      layer: -2,
      typeClasses: 'widget zoomy',

      zoomedPlayers: [],

      zoomedX: 0,
      zoomedY: 0,
      zoomedZ: 0,
      zoomedScale: 2,
      zoomedRotation: 0
    });

    this.domElement.innerHTML = `
      <button class="zoomy-button">+</button>
    `;

    $('.zoomy-button', this.domElement).addEventListener('click', async () => {
      batchStart();
      if(this.get('zoomedPlayers').includes(playerName))
        await this.set('zoomedPlayers', this.get('zoomedPlayers').filter(player => player != playerName));
      else
        await this.set('zoomedPlayers', [...this.get('zoomedPlayers'), playerName]);
      batchEnd();
    });
  }

  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
    if(delta.z !== undefined || delta.zoomedZ !== undefined || delta.zoomedPlayers !== undefined)
      this.applyZ(true);
  }

  calculateZ() {
    const z = super.calculateZ();
    if(this.isZoomed())
      return z - this.get('z') + this.get('zoomedZ');
    return z;
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

  isZoomed() {
    return this.get('zoomedPlayers').includes(playerName);
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

  updateScale() {
    this.targetTransform = this.domElement.style.transform = this.cssTransform();
  }
}
