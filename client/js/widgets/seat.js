import { playerColor, playerName } from "../overlays/players";

class Seat extends Widget {
  constructor(id) {
    super(id);

    this.addDefaults({
      typeClasses: 'widget seat',
      clickable: true,
      width: 36,
      height: 36,

      index: 1,
      turn: 0,
      player: "",
      inactive: true,
      display: "index",
      displayFallback: "index",

      color: "#999999",
      layer: 1,
      text: '1'
    });
  }

  //taken from button. I don't know how to deal with this.
  applyDeltaToDOM(delta) {
    super.applyDeltaToDOM(delta);
   if(delta.text !== undefined)
      setText(this.domElement, delta.text);
  }

  //from timer alert and paused
  classes() {
    let className = super.classes();

    if (this.get('player')!="")
      className += ' seated';
    if (this.get('turn')==this.get('index'))
      className += ' turn';

    return className;
  }

  //inactive should go into widgets
  classesProperties() {
    const p = super.classesProperties();
    p.push( 'player', 'turn');
    return p;
  }


  async click(mode='respect') {
    if(!await super.click(mode))
      this.setPlayer();
  }

  //need to add a condition here to change the turn if the turn is in a seat that is empty
  setPlayer() {
    if (this.get('player') == "") {
      var display = this.get('display')||"index"
      this.set('player', playerName);
      this.set('color', playerColor);
      this.set('text',this.get(display))
    } else {
      var display = this.get('displayFallback')||"index"
      this.set('player', "");
      this.set('color', "#999999");
      this.set('text',this.get(display))
    };
  }

  css() {
    let css = super.css();

    if(this.get('color'))
      css += '; --color:' + this.get('color');
    if(this.get('glow'))
      css += '; --shadow:' + '0px 0px 20px 5px var(--color)';

    return css;
  }

  cssProperties() {
    const p = super.cssProperties();
    p.push('color');
    p.push('glow')
    return p;
  }

}
