import { ClientFunction, Selector } from 'testcafe';

import { publicGameURL, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

const getLocation = ClientFunction(_=>document.location.href);

// Not the shared testcafe-testing room: adding a game from the public library stars it in the
// room it lands in, and that star stays there for every test that runs afterwards.
const roomName = 'testcafe-gamelink';

// The page every shared game URL leads to. Its Create room button runs the only code path that
// joins a room and adds a game to it in one go, so nothing else in the suite covers it.
test('The Create room button of a game link joins a room and adds the game', async t => {
  await t.navigateTo(publicGameURL('Dots'));

  await t
    .expect(Selector('#welcomeGameName').innerText).eql('Dots')
    .typeText('#welcomeJoinRoom', roomName, { replace: true })
    .click('#welcomePlayButton');

  // the button catches whatever its handler throws and only shows it as its own label, so the
  // room it ends up in and the game details it opens are what tell success from failure
  await t
    .expect(getLocation()).contains(`/${roomName}`)
    .expect(Selector('#stateDetailsOverlay').visible).ok()
    .expect(Selector('#stateDetailsOverlay [data-field=name]').innerText).eql('Dots');
});
