import { Widget } from './widget.js';

export class Zoomy extends Widget {
  constructor(id) {
    super(id);

    this.isBig = false;
    this.addDefaults({
      movable: false,
      layer: -2,
      typeClasses: 'widget zoomy',

      zoomedX: 0,
      zoomedY: 0,
      zoomedScale: 2,
      zoomedRotation: 0
    });

    this.domElement.innerHTML = `
      <button class="zoomy-button">+</button>
    `;

    $('.zoomy-button', this.domElement).addEventListener('click', () => {
      this.isBig = !this.isBig;
      this.updateScale();
    });
  }

  cssTransform() {
    const x        = this.isBig ? this.get('zoomedX'       ) : this.get('x'       );
    const y        = this.isBig ? this.get('zoomedY'       ) : this.get('y'       );
    const scale    = this.isBig ? this.get('zoomedScale'   ) : this.get('scale'   );
    const rotation = this.isBig ? this.get('zoomedRotation') : this.get('rotation');

    let transform = `translate(${x}px, ${y}px)`;

    if(rotation)
      transform += ` rotate(${rotation}deg)`;
    if(scale != 1)
      transform += ` scale(${scale})`;

    return transform;
  }

  cssTransformProperties() {
    const properties = super.cssTransformProperties();

    properties.push('zoomedX', 'zoomedY', 'zoomedScale', 'zoomedRotation');

    return properties;
  }

  set(property, value) {
    if(this.isBig && $('body').classList.contains('edit')) {
      if(property == 'x')
        this.set('zoomedX', value);
      else if(property == 'y')
        this.set('zoomedY', value);
      else if(property == 'scale')
        this.set('zoomedScale', value);
      else if(property == 'rotation')
        this.set('zoomedRotation', value);
      else
        super.set(property, value);
    } else {
      super.set(property, value);
    }
  }

  updateScale() {
    this.targetTransform = this.domElement.style.transform = this.cssTransform();
  }
}
