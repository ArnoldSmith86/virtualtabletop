import { Selector, ClientFunction } from 'testcafe';

import { escapeID } from '../../client/js/domhelpers.js';
import { compareState, prepareClient, setName } from './test-util.js';

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
          await t.dragToElement(b[0](), b[1](), { speed:0.5 });
        }
  });
}
