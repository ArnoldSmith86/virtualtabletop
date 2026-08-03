import { Selector, ClientFunction } from 'testcafe';

import { escapeID } from '../../client/js/domhelpers.js';
import { compareState, prepareClient, setName, waitForStableState } from './test-util.js';

const tabHasActive = ClientFunction((index) => {
  const btns = document.querySelectorAll('.libraryTypeTabs button');
  return btns[index] ? btns[index].classList.contains('active') : false;
});

function publicLibraryTest(game, variant, md5, tests) {
  test(`Public library: ${game} (variant ${variant})`, async t => {
    await ClientFunction(prepareClient)();
    await ClientFunction(_=>++window.customRandomSeed)(); // game library overhaul removed the Math.random call for generating a new state ID
    const tabIndex = +(game.includes(' - '));
    await t.pressKey('esc').click('#statesButton');
    if (!(await tabHasActive(tabIndex))) {
      await t.click(Selector('.libraryTypeTabs button').nth(tabIndex));
    }
    await t
      .click(Selector('.roomState h3').withExactText(game).parent().parent())
      .click(Selector(`.variantsList > div:nth-child(${variant+1}) > button`));
    await setName(t);
    await tests(t);
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
          await waitForStableState();

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
            // wait for the game to finish reacting to the drop first - a rejected
            // drop is only sent back once the game has evaluated it, so asserting
            // right away would pass even if the piece was wrongly accepted
            await waitForStableState();
            await t
              .expect(Selector(`#w_${escapeID(to)}`).find(`#w_${escapeID(from)}`).exists)
              .eql(sticks, `dragging ${from} onto ${to} should ${sticks ? '' : 'not '}have been accepted`);
          }
        }
  });
}
