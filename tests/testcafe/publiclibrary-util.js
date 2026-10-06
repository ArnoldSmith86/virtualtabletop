import { Selector, ClientFunction } from 'testcafe';

import { escapeID } from '../../client/js/domhelpers.js';
import { compareState, getStateObject, prepareClient, setName, waitForStableState } from './test-util.js';

const tabHasActive = ClientFunction((index) => {
  const btns = document.querySelectorAll('.libraryTypeTabs button');
  return btns[index] ? btns[index].classList.contains('active') : false;
});

const diag = ClientFunction(() => ({
  visibleOverlays: [...document.querySelectorAll('.overlay')].filter(o=>getComputedStyle(o).display!='none').map(o=>o.id),
  activeTab: [...document.querySelectorAll('.toolbarTab.active')].map(b=>b.id).join(),
  widgets: document.querySelectorAll('.widget').length,
  widgetIds: [...document.querySelectorAll('.widget')].slice(0,4).map(w=>w.id),
  loading: !!document.querySelector('#loadingRoomIndicator'),
  nav: performance.getEntriesByType('navigation').map(n=>n.type).join(),
  pageAge: Math.round(Date.now() - performance.timeOrigin),
  bodyClass: document.body.className
}));
async function dumpFailure(t, game) {
  try {
    console.log('DIAG', new Date().toISOString(), game, JSON.stringify(await diag()));
    console.log('DIAG console', JSON.stringify(await t.getBrowserConsoleMessages()).slice(0, 6000));
    const st = await getStateObject();
    console.log('DIAG server state widgets', Object.keys(st).length, Object.keys(st).slice(0,4).join(','));
  } catch(e) {
    console.log('DIAG failed', e);
  }
}

function publicLibraryTest(game, variant, md5, tests) {
  test(`Public library: ${game} (variant ${variant})`, async t => {
    try {
    await ClientFunction(prepareClient)();
    await ClientFunction(_=>++window.customRandomSeed)(); // game library overhaul removed the Math.random call for generating a new state ID
    const tabIndex = +(game.includes(' - '));
    // The initial state activates the game tab, and the empty reset can open the shelf.
    // Let both arrive before opening it ourselves or either can toggle it closed.
    await t
      .expect(Selector('#loadingRoomIndicator').exists).notOk()
      .expect(Selector('.widget').count).eql(0)
      .pressKey('esc')
      .click('#statesButton');
    if (!(await tabHasActive(tabIndex))) {
      await t.click(Selector('.libraryTypeTabs button').nth(tabIndex));
    }
    await t
      .click(Selector('.roomState h3').withExactText(game).parent().parent())
      .click(Selector(`.variantsList > div:nth-child(${variant+1}) > button`));
    await setName(t);
    await tests(t);
    await compareState(t, md5);
    } catch(e) {
      await dumpFailure(t, game);
      throw e;
    }
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
