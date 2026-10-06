import { Selector, ClientFunction } from 'testcafe';

import { escapeID } from '../../client/js/domhelpers.js';
import { compareState, prepareClient, setName, waitForStableState } from './test-util.js';

const tabHasActive = ClientFunction((index) => {
  const btns = document.querySelectorAll('.libraryTypeTabs button');
  return btns[index] ? btns[index].classList.contains('active') : false;
});

const diag = ClientFunction(() => ({
  win: [innerWidth, innerHeight, devicePixelRatio],
  ua: navigator.userAgent,
  overlay: document.querySelector('#statesButton').dataset.overlay,
  visibleOverlays: [...document.querySelectorAll('.overlay')].filter(o=>getComputedStyle(o).display!='none').map(o=>o.id),
  detailsId: document.querySelector('#stateDetailsOverlay').dataset.id,
  detailsTitle: document.querySelector('#mainDetails h1') && document.querySelector('#mainDetails h1').innerText,
  widgets: document.querySelectorAll('.widget').length,
  widgetIds: [...document.querySelectorAll('.widget')].slice(0,6).map(w=>w.id),
  loading: !!document.querySelector('#loadingRoomIndicator'),
  scroll: [...document.querySelectorAll('#statesOverlay, #statesOverlay *')].filter(e=>e.scrollTop).map(e=>(e.id||e.className)+':'+e.scrollTop),
  active: document.activeElement && (document.activeElement.id || document.activeElement.className)
}));
async function logDiag(game, step) { console.log('DIAG', game, step, JSON.stringify(await diag())); }

function publicLibraryTest(game, variant, md5, tests) {
  test(`Public library: ${game} (variant ${variant})`, async t => {
    await ClientFunction(prepareClient)();
    await ClientFunction(_=>++window.customRandomSeed)(); // game library overhaul removed the Math.random call for generating a new state ID
    const tabIndex = +(game.includes(' - '));
    await t.pressKey('esc').click('#statesButton');
    if (!(await tabHasActive(tabIndex))) {
      await t.click(Selector('.libraryTypeTabs button').nth(tabIndex));
    }
    const tile = Selector('.roomState h3').withExactText(game).parent().parent();
    console.log('DIAG', game, 'tile', JSON.stringify(await tile.boundingClientRect), await tile.getAttribute('data-id'));
    await t.click(tile);
    await logDiag(game, 'afterTile');
    await t.click(Selector(`.variantsList > div:nth-child(${variant+1}) > button`));
    await logDiag(game, 'afterVariant');
    await setName(t);
    await logDiag(game, 'afterSetName');
    try {
      await tests(t);
    } catch(e) {
      await logDiag(game, 'failed');
      throw e;
    }
    await compareState(t, md5);
  });
}

export function publicLibraryButtons(game, variant, md5, tests) {
  publicLibraryTest(game, variant, md5, async t => {
      for(const b of tests)
        if(typeof b == "string") {
          if(b.charAt(0) == '#') {
            await t.click(b);
          } else {
            await t.click(`#w_${escapeID(b)}`);
          }
        } else {
          // A drag usually depends on the state the previous interaction left behind
          // (whose turn it is, which squares are legal targets, ...), so let the game
          // finish evaluating that one before dropping the next piece - otherwise the
          // drop can be rejected and the test fails with an unrelated-looking hash.
          const stateBeforeDrag = await waitForStableState();

          const { from, to, sticks } = b;
          // dragged at full speed on purpose: that is the coarse pointer sampling
          // under which a drop used to be resolved against the square the piece had
          // already been dragged away from
          await t.dragToElement(`#w_${escapeID(from)}`, `#w_${escapeID(to)}`, { speed:1 });

          // Some games reject a drop and send the piece back. Where the test knows
          // whether the drop is supposed to be accepted, check it right here so a
          // wrong result is reported at the drag that caused it instead of surfacing
          // as an unrelated-looking state hash mismatch at the end of the test.
          if(sticks !== undefined) {
            // wait for the drag to reach the server and for the game to finish
            // reacting to it - a rejected drop is only sent back once the game has
            // evaluated it, so asserting right away would pass even if the piece was
            // wrongly accepted (and 'stable' before the drop has even arrived says
            // nothing at all)
            await waitForStableState({ differentFrom: stateBeforeDrag });
            await t
              .expect(Selector(`#w_${escapeID(to)}`).find(`#w_${escapeID(from)}`).exists)
              .eql(sticks, `dragging ${from} onto ${to} should ${sticks ? '' : 'not '}have been accepted`);
          }
        }
  });
}
