// The rendering fixtures both halves of Layer F use: domsnapshot.js compares their computed
// DOM against a checked-in baseline, pixelsnapshot.js compares the pixels the two legacy-mode
// combinations produce for them. Shared so that the two layers cannot drift apart into
// answering the question for different boards.

// One of every widget type whose rendering is a function of the state alone. seat and timer are
// left out on purpose: a seat renders the player looking at it and a timer renders the clock,
// so neither can have a baseline.
export function widgetGallery() {
  return {
    deck:   { id: 'deck', type: 'deck', x: 20, y: 20, cardTypes: { plain: {} }, faceTemplates: [ { objects: [ { type: 'text', x: 5, y: 5, width: 90, height: 30, value: 'face' } ] } ] },
    card:   { id: 'card', type: 'card', deck: 'deck', cardType: 'plain', x: 200, y: 20 },
    basic:  { id: 'basic', type: 'basic', x: 400, y: 20, text: 'basic' },
    button: { id: 'button', type: 'button', x: 600, y: 20, text: 'button' },
    label:  { id: 'label', type: 'label', x: 800, y: 20, text: 'label', width: 200 },
    dice:   { id: 'dice', type: 'dice', x: 1050, y: 20 },
    spinner:{ id: 'spinner', type: 'spinner', x: 1250, y: 20 },
    canvas: { id: 'canvas', type: 'canvas', x: 20, y: 250, width: 200, height: 200 },
    line:   { id: 'line', type: 'line', x: 300, y: 250 },
    score:  { id: 'score', type: 'scoreboard', x: 800, y: 250 },
    holder: { id: 'holder', type: 'holder', x: 20, y: 550, width: 400, height: 180, stackOffsetX: 30 },
    inHand1:{ id: 'inHand1', type: 'card', deck: 'deck', cardType: 'plain', parent: 'holder' },
    inHand2:{ id: 'inHand2', type: 'card', deck: 'deck', cardType: 'plain', parent: 'holder' },
    pile:   { id: 'pile', type: 'pile', x: 600, y: 550 },
    inPile1:{ id: 'inPile1', type: 'card', deck: 'deck', cardType: 'plain', parent: 'pile' },
    inPile2:{ id: 'inPile2', type: 'card', deck: 'deck', cardType: 'plain', parent: 'pile' }
  };
}

// disableHolderImageWidget swaps the prototype a holder delegates its DOM methods to, so the
// image, the colour and the text either reach the element or do not. This is the fixture the
// mode exists for and the only place in the suite where its effect is visible at all.
export function holderImage() {
  return {
    decorated: { id: 'decorated', type: 'holder', x: 20, y: 20, width: 400, height: 200, color: '#336699', textColor: '#ffcc00', text: 'Discard', image: '/assets/1_1' },
    plain:     { id: 'plain', type: 'holder', x: 500, y: 20, width: 400, height: 200 }
  };
}

// useIframeForHtmlCards decides whether a card face html object becomes an iframe with a srcdoc
// or a div with sanitised, scoped markup. Same state, entirely different box model - which is
// exactly the kind of difference a state test cannot see.
export function htmlCard() {
  return {
    deck: { id: 'deck', type: 'deck', x: 20, y: 20, cardTypes: { plain: {} }, faceTemplates: [ {
      objects: [ { type: 'html', x: 0, y: 0, width: 103, height: 160, value: '<div class="inner">html face</div>', css: { 'inline': 'background:#eee', '.inner': 'color:#c00' } } ]
    } ] },
    card: { id: 'card', type: 'card', deck: 'deck', cardType: 'plain', x: 300, y: 20 }
  };
}
