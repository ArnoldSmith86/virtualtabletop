import { Selector, ClientFunction } from 'testcafe';
import fetch from 'node-fetch';
import crypto from 'crypto';

const server = 'http://localhost:8272';

async function emptyRoomState() {
  await fetch(`${server}/state/testcafe-testing`, {
    method: 'PUT',
    headers: {
      'Content-Type':'application/json'
    },
    body: '{}'
  });
}

function prepareClient() {
  // non random random
  let seed = 1;
  Math.random = function() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  // remove base element because it causes popups on form submit
  document.querySelector('base').parentNode.removeChild(document.querySelector('base'));
}

function publicLibraryTest(game, variant, md5, tests) {
  test.after(async t => {
    await t
      .click('#statesButton')
      .hover('.roomState')
      .click('.edit')
      .click('p > .remove')
      .expect(Selector('#statesOverlay').visible).ok();
  })(`Public library: ${game} (variant ${variant})`, async t => {
    await ClientFunction(prepareClient)();
    await t
      .click(Selector('td.name').withExactText(game).prevSibling().child())
      .hover('.roomState')
      .click(Selector('button.play').nth(variant))
      .click('#playersButton')
      .typeText('.myPlayerEntry > .playerName', 'TestCafe', { replace: true })
      .click('#playersButton');
    await tests(t);
    await t
      .expect(await getState()).eql(md5);
  });
}

async function getState() {
  // wait for 500ms
  await new Promise(resolve => setTimeout(resolve, 500));

  const response = await fetch(`${server}/state/testcafe-testing`);
  const text = await response.text();
  return crypto.createHash('md5').update(text).digest('hex');
}

fixture('virtualtabletop.io').page(`${server}/testcafe-testing`).beforeEach(emptyRoomState).after(emptyRoomState);

/*publicLibraryTest('Blue', 0, '8cf30e7dbcb33dc01fbbc0d7b5dac039', async t => {
  await t
    .click('#fcc3fa2c-c091-41bc-8737-54d8b9d3a929')
    .click('#d3ab9f5f-daa4-4d81-8004-50a9c90af88e_incrementButton')
    .click('#d3ab9f5f-daa4-4d81-8004-50a9c90af88e_incrementButton')
    .click('#d3ab9f5f-daa4-4d81-8004-50a9c90af88e_decrementButton')
    .click('#fdc25f83-ed33-4845-a97c-ff35fa8a094f_shuffleButton')
    .click('#buttonInputGo')
    .click('#fcc3fa2c-c091-41bc-8737-54d8b9d3a929')
    .click('[id="9n2q"]');
});

publicLibraryTest('FreeCell', 0, '211966a4a048e27a0e0113ead659042b', async t => {
  await t
    .click('#reset')
    .click('#jemz')
    .click('#reset');
});

publicLibraryTest('Rummy Tiles', 0, 'e0073d6f0d8f48d268aefc44139b4492', async t => {
  await t
    .click('#startMix')
    .click('#draw14');
});*/

publicLibraryTest('Undercover', 1, '019088481e33f1632ab3872991ed4f56', async t => {
  await t
    .click('#Reset')
    .click('[id="Spy Master Button"]');
});

/*publicLibraryTest('Functions - RANDOM', 0, 'bfd121b54d8ab0fced83cc0bcc09032d', async t => {
  await t
    .click('[id="9fhb"]')
    .click('#yqji')
    .click('#oeh9');
});

publicLibraryTest('Functions - SORT', 1, 'dd047343b667795ad6d3f366aa2ae2fd', async t => {
  await t
    .click('[id="ingw"]')
    .click('[id="k131"]')
    .click('[id="cnfu"]')
    .click('[id="i6yz"]')
    .click('[id="z394"]')
    .click('[id="0v3h"]')
    .click('[id="1h8o"]')
    .click('[id="v5ra"]')
    .click('[id="ingw-copy001"]')
    .click('[id="k131-copy001"]')
    .click('[id="cnfu-copy001"]')
    .click('[id="i6yz-copy001"]')
    .click('[id="z394-copy001"]')
    .click('[id="0v3h-copy001"]');
});

publicLibraryTest('Master Button', 0, '8249f5f20ad44bc0ac468e4f0bbcacd5', async t => {
  await t
    .click('[id="masterbutton"]')
    .click('[id="redbutton"]')
    .click('[id="orangebutton"]')
    .click('[id="yellowbutton"]')
    .click('[id="greenbutton"]')
    .click('[id="bluebutton"]')
    .click('[id="indigobutton"]')
    .click('[id="violetbutton"]')
    .click('[id="fae4"]')
    .click('[id="vbx5"]');
});*/
