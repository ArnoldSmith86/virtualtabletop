import fs from 'fs';

import { ClientFunction, Selector } from 'testcafe';

import { setupTestEnvironment } from './test-util.js';
import { openRoom } from './interaction-util.js';
import { holderImage, htmlCard, widgetGallery } from './render-fixtures.js';
import { comparePixels, decodePNG } from './png-util.js';

setupTestEnvironment();

// Layer F, the pixel half.
//
// domsnapshot.js records tag, classes, box and a whitelist of computed styles and compares that
// against a checked-in baseline. It cannot see a colour that is not in the whitelist, a font
// that failed to load, a widget drawn on top of another one, or anything a canvas paints.
//
// The obvious way to add pixels - check in a golden PNG per fixture - is the way the plan warns
// about, and it is worse here than usual: the baseline would be recorded on one machine and
// compared on a GitHub runner whose Chrome version, fonts and GPU stack all move without notice,
// so the job would go red for reasons that have nothing to do with this project and get switched
// off within a month.
//
// So the comparison is between two screenshots taken in the *same* run, of the *same* board, in
// the two legacy-mode combinations. That answers the question this project actually has - "does
// a legacy mode change what the player sees?" - as an image assertion rather than a state one,
// and it is deterministic by construction: same browser, same window, same fonts, seconds apart.
// Nothing to record, nothing to drift.
//
// It runs in the direction the fixture declares. The widget gallery must come out pixel
// identical, which is the strongest statement available that no mode reaches the rendering of a
// widget it is not about. The two rendering modes must come out different, with the difference
// large enough to be a real one - and that is the first assertion in the repository that
// useIframeForHtmlCards and disableHolderImageWidget change anything a player can see at all.

const TIERS = [ 'modern', 'legacy-all' ];

// Anti-aliasing and subpixel text rendering move a channel by a few units between two paints of
// the same board, so a pixel counts as different only past that.
const TOLERANCE = 8;


const hideCursor = ClientFunction(_=>{
  // the other player's pointer is drawn from a timer and would land in a screenshot
  const pointer = document.getElementById('clientPointer');
  if(pointer)
    pointer.style.display = 'none';
});

async function capture(t, name) {
  const path = await t.takeElementScreenshot('#topSurface', `pixelsnapshot/${name}.png`);
  return decodePNG(fs.readFileSync(path));
}

// A board that is still settling - a deferred layout, an asset that has not arrived, the
// creation animation - would make the comparison about the timing rather than about the flag,
// so shoot until two consecutive frames are the same image.
async function settledCapture(t, name) {
  let previous = await capture(t, `${name}-0`);
  for(let attempt=1; attempt<5; ++attempt) {
    await t.wait(200*attempt);
    const image = await capture(t, `${name}-${attempt}`);
    if(comparePixels(previous, image, { tolerance: TOLERANCE }).differing === 0)
      return image;
    previous = image;
  }
  return previous;
}

// A fixture that is supposed to render differently names how much: enough that a stray
// anti-aliased edge cannot satisfy it, and low enough that it does not encode today's exact
// rendering. The numbers are roughly a quarter of what the difference measures today.
const FIXTURES = [
  { name: 'widget-gallery', state: widgetGallery, identical: true },
  // the holder draws its colour, its image and its text, which is most of its area
  { name: 'holder-image', state: holderImage, minimumDifference: 10000 },
  // the iframe and the div lay the same content out in different boxes, so the difference is
  // the edges of that content rather than a filled area
  { name: 'html-card', state: htmlCard, minimumDifference: 200 }
];

for(const fixture of FIXTURES) {
  test(`Pixel snapshot: ${fixture.name}`, async t => {
    const images = {};
    for(const combo of TIERS) {
      await openRoom(t, combo, fixture.state());
      await hideCursor();
      images[combo] = await settledCapture(t, `${fixture.name}.${combo}`);
    }

    const result = comparePixels(images.modern, images['legacy-all'], { tolerance: TOLERANCE });
    if(fixture.identical)
      await t.expect(result.differing).eql(0, `${fixture.name} renders identically with every legacy mode on and off - ${result.message}`);
    else
      await t.expect(result.differing).gte(fixture.minimumDifference, `${fixture.name} is supposed to render differently in the two combinations - ${result.message}`);
  });
}

// The comparison above is only worth anything if two shots of the same board are the same
// image. If they are not, every result in this file is noise, so it is asserted rather than
// assumed - and it is the check that would catch an animation or a timer creeping into a
// fixture.
test('Two captures of the same board are the same image', async t => {
  await openRoom(t, 'modern', widgetGallery());
  await hideCursor();
  await t.expect(Selector('#w_card').exists).ok();

  const first = await settledCapture(t, 'determinism');
  await t.wait(500);
  const second = await capture(t, 'determinism-again');

  const result = comparePixels(first, second, { tolerance: TOLERANCE });
  await t.expect(result.differing).eql(0, `the same board rendered twice - ${result.message}`);
});
