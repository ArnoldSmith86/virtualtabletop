import fs from 'fs';
import path from 'path';

import { ClientFunction, Selector } from 'testcafe';
import { diff, diffString } from 'json-diff';

import { applyLegacy, prepareClient, setRoomState, setupTestEnvironment } from './test-util.js';
import { holderImage, htmlCard, widgetGallery } from './render-fixtures.js';

setupTestEnvironment();

// Layer F: the first assertion in this repository that a game renders the same.
//
// Everything else compares serialised state, and state equality does not imply visual
// equality: a CSS change, a class-name change or a DOM-vs-iframe swap can leave the state hash
// byte-identical while the table looks wrong. Two of the four legacy modes are primarily
// rendering concerns, so before this file nothing observed what they actually do.
//
// This is the deterministic half of the layer - the computed DOM rather than pixels. Per widget
// node it records the tag, the class list, the box in board units and a whitelist of computed
// style properties, and compares that against a recorded baseline. Pixel diffing can be layered
// on top later; a snapshot that needs no image tooling and cannot go flaky is worth having
// first.
//
// Every fixture is captured in both the modern and the legacy-all combination. A fixture that
// declares no rendering difference has to produce byte-identical trees in the two, which is the
// strongest form of "the flag does not change what the player sees" available - and the ones
// that do declare a difference name it, so the difference itself is the assertion.
//
// The two flagged fixtures are the two rendering changes this project has shipped: html card
// faces stopped being iframes in #2729 (2025-11-15) and holders started drawing their own
// image, icon and text in #2634 (2026-02-11). Replaying this probe against dated revisions says
// that the legacy-all rendering recorded here reproduces what every revision before those two
// rendered - which is the whole claim the modes make, asserted for the first time.

const snapshotDirectory = path.resolve() + '/tests/testcafe/dom-snapshots';
const TIERS = [ 'modern', 'legacy-all' ];

// Non-length properties only: a computed length is in screen pixels and would depend on the
// window size, while the box below is in board units and does not.
const STYLE_PROPERTIES = [ 'display', 'position', 'visibility', 'overflow', 'z-index', 'background-color', 'color', 'opacity', 'background-image', 'font-style', 'text-align' ];

const captureSnapshot = ClientFunction(styleProperties => {
  const scale = +getComputedStyle(document.documentElement).getPropertyValue('--scale') || 1;
  const surface = document.getElementById('topSurface');
  const origin = surface.getBoundingClientRect();
  const boardUnits = value => Math.round(value/scale);

  function describe(element) {
    const style = window.getComputedStyle(element);
    const rectangle = element.getBoundingClientRect();
    const node = {
      tag: element.tagName.toLowerCase(),
      id: element.id || '',
      // getAttribute rather than className: on an SVG element className is not a string
      classes: (element.getAttribute('class') || '').split(/\s+/).filter(name=>name).sort().join(' '),
      box: [ boardUnits(rectangle.left-origin.left), boardUnits(rectangle.top-origin.top), boardUnits(rectangle.width), boardUnits(rectangle.height) ],
      style: {},
      children: []
    };
    for(const property of styleProperties)
      // asset URLs are absolute and carry the host, so keep the part a change would be about
      node.style[property] = style.getPropertyValue(property).replace(/url\("?([^")]*)"?\)/g, (match, url)=>`url(${url.replace(/^.*\//, '')})`);
    for(let index=0; index<element.children.length; ++index)
      node.children.push(describe(element.children[index]));
    return node;
  }

  const nodes = [];
  for(let index=0; index<surface.children.length; ++index)
    nodes.push(describe(surface.children[index]));
  return nodes;
});

async function openRoom(t, combo, state) {
  await ClientFunction(prepareClient)();
  await t.click('#activeGameButton');
  // the same fixture is captured once per combination, and a state that is already in the room
  // creates no widget - so empty it first and let the second combination build its own
  await setRoomState({});
  // a widget reads its legacy modes in the constructor, so the modes have to be in place
  // before the state creates one
  await applyLegacy(combo);
  await setRoomState(state);
  await t.expect(Selector(`#w_${Object.keys(state)[0]}`).exists).ok('the room renders its widgets', { timeout: 30000 });
}

// A room that is still settling - a deferred layout, an asset that has not arrived - would
// record a baseline nobody can reproduce, so read until two consecutive captures agree.
async function settledSnapshot(t) {
  let previous = await captureSnapshot(STYLE_PROPERTIES);
  for(let wait=100; wait<2000; wait*=2) {
    await t.wait(wait);
    const snapshot = await captureSnapshot(STYLE_PROPERTIES);
    if(diff(previous, snapshot) === undefined)
      return snapshot;
    previous = snapshot;
  }
  return previous;
}

// A fixture that renders identically in every combination keeps one baseline: the equality of
// the trees is asserted separately, so a second copy would only be review noise.
//
// The browser is part of the name because a computed style and a rounded box are browser
// specific: Firefox rounds a subpixel box differently and spells a shorthand differently, so its
// tree is a second baseline rather than a failure against Chrome's. Only Chrome's is recorded so
// far - a Firefox baseline has to be recorded on a machine that can run Firefox, and until one
// is checked in the CI matrix keeps this file in Chrome. pixelsnapshot.js is the part of Layer F
// that needs no baseline at all, which is why that one does run in both.
function goldenFile(t, fixture, combo) {
  const browser = t.browser.name.toLowerCase().replace(/[^a-z]/g, '');
  return `${snapshotDirectory}/${fixture.identicalAcrossTiers ? fixture.name : `${fixture.name}.${combo}`}.${browser}.json`;
}

// Baselines are JSON and diffed with json-diff, so a failure reads as the node and property
// that changed. Run with WRITE_DOM_SNAPSHOTS=1 to re-record them after an intended change.
async function compareToBaseline(t, fixture, combo, snapshot) {
  const file = goldenFile(t, fixture, combo);
  const name = fixture.name;
  if(process.env.WRITE_DOM_SNAPSHOTS) {
    fs.mkdirSync(snapshotDirectory, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`recorded DOM baseline ${path.relative(path.resolve(), file)}`);
  }

  // Recording a missing baseline on the fly and then comparing against it would always pass -
  // and the checked-in reference is the entire value of this file, so a renamed fixture or a
  // baseline lost in a merge has to go red rather than certify whatever it happens to see.
  await t.expect(fs.existsSync(file)).ok(`no DOM baseline for ${name} in combination ${combo} (${path.relative(path.resolve(), file)}) - re-record on ${t.browser.name} with WRITE_DOM_SNAPSHOTS=1`);

  const baseline = JSON.parse(fs.readFileSync(file, 'utf8'));
  const difference = diff(baseline, snapshot);
  if(difference)
    console.log(diffString(baseline, snapshot));
  await t.expect(difference === undefined).ok(`${name} renders as recorded in combination ${combo}`);
}

function findNodes(snapshot, predicate, found = []) {
  for(const node of snapshot) {
    if(predicate(node))
      found.push(node);
    findNodes(node.children, predicate, found);
  }
  return found;
}

const hasClass = className => node => node.classes.split(' ').indexOf(className) != -1;

const FIXTURES = [
  {
    name: 'widget-gallery',
    state: widgetGallery,
    // no legacy mode is supposed to reach any of these, so the two trees have to be identical
    identicalAcrossTiers: true
  },
  {
    name: 'holder-image',
    state: holderImage,
    identicalAcrossTiers: false,
    check: async (t, snapshots) => {
      const decorated = combo => findNodes(snapshots[combo], node=>node.id == 'w_decorated')[0];
      await t.expect(hasClass('hasImage')(decorated('modern'))).ok('the holder is an image widget in the modern combination');
      await t.expect(hasClass('hasImage')(decorated('legacy-all'))).notOk('the holder is a plain widget in the legacy combination');
      await t.expect(findNodes([ decorated('modern') ], hasClass('holderTextOnly')).length).eql(1, 'the modern holder renders its text');
      await t.expect(findNodes([ decorated('legacy-all') ], hasClass('holderTextOnly')).length).eql(0, 'the legacy holder renders no text');
      await t.expect(decorated('modern').style['background-color']).notEql(decorated('legacy-all').style['background-color'], 'the color property only reaches the element in the modern combination');
    }
  },
  {
    name: 'html-card',
    state: htmlCard,
    identicalAcrossTiers: false,
    check: async (t, snapshots) => {
      const faceObject = combo => findNodes(snapshots[combo], hasClass('cardFaceObject'))[0];
      await t.expect(faceObject('modern').tag).eql('div', 'a html face object is a div in the modern combination');
      await t.expect(faceObject('legacy-all').tag).eql('iframe', 'a html face object is an iframe in the legacy combination');
      // the div path scopes the object's css to a generated class, the iframe path does not
      await t.expect(faceObject('modern').classes).contains('html-object-card-0-0', 'the modern path scopes the object css');
      await t.expect(faceObject('legacy-all').children.length).eql(0, 'the iframe carries its content in srcdoc, not in the DOM');
    }
  }
];

for(const fixture of FIXTURES) {
  test(`DOM snapshot: ${fixture.name}`, async t => {
    const snapshots = {};
    for(const combo of TIERS) {
      await openRoom(t, combo, fixture.state());
      snapshots[combo] = await settledSnapshot(t);
      await compareToBaseline(t, fixture, combo, snapshots[combo]);
    }

    if(fixture.identicalAcrossTiers) {
      const difference = diff(snapshots.modern, snapshots['legacy-all']);
      if(difference)
        console.log(diffString(snapshots.modern, snapshots['legacy-all']));
      await t.expect(difference === undefined).ok(`${fixture.name} renders identically with every legacy mode on and off`);
    } else {
      await fixture.check(t, snapshots);
    }
  });
}
