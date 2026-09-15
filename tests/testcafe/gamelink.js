import { ClientFunction, Selector } from 'testcafe';

import { publicGameURL, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

const getLocation = ClientFunction(_=>document.location.href);
const forgetLibraryTypeTab = ClientFunction(_=>localStorage.removeItem('libraryTypeTab'));

// Not the shared testcafe-testing room: adding a game from the public library stars it in the
// room it lands in, and that star stays there for every test that runs afterwards.
const roomName = 'testcafe-gamelink';

// The game name is filled in after the room name is, so waiting for it also means the room name
// typed afterwards is not overwritten by the answer of the details request. That request is what
// makes the server read the public library, which takes a while when it is cold.
async function waitForLinkPage(t, gameName) {
  await t.expect(Selector('#welcomeGameName').innerText).eql(gameName, { timeout: 20000 });
}

// The button catches whatever its handler throws and only shows it as its own label, so the room
// it ends up in and the game details it opens are what tell success from failure.
async function createRoomFromLink(t, gameName) {
  await t
    .typeText('#welcomeJoinRoom', roomName, { replace: true })
    .click('#welcomePlayButton')
    .expect(getLocation()).contains(`/${roomName}`, { timeout: 20000 })
    .expect(Selector('#stateDetailsOverlay').visible).ok({ timeout: 20000 })
    .expect(Selector('#stateDetailsOverlay [data-field=name]').innerText).eql(gameName);
}

// The page every shared game URL leads to. Its Create room button runs the only code path that
// joins a room and adds a game to it in one go, so nothing else in the suite covers it.
test('The Create room button of a game link joins a room and adds the game', async t => {
  await t.navigateTo(publicGameURL('Dots'));
  await waitForLinkPage(t, 'Dots');
  await createRoomFromLink(t, 'Dots');
});

// A tutorial link runs one statement more than a game link does - on yet another name the
// welcome overlay expects the bundle to provide - so it can break without the game link noticing.
test('The Create room button of a tutorial link opens the library on the Tutorials tab', async t => {
  const tutorialName = '100 Tutorials Overview';
  await t.navigateTo(publicGameURL(tutorialName, 'tutorial'));

  // which tab the library opens on is remembered across page loads, so a leftover 'Tutorials'
  // would make the assertion at the end pass without the handler ever having set it
  await forgetLibraryTypeTab();

  await waitForLinkPage(t, tutorialName);
  await t
    .expect(Selector('#welcomeGameType').innerText).eql('tutorial')
    .expect(Selector('#welcomeGameTypeHint').innerText).eql('check it out');

  await createRoomFromLink(t, tutorialName);
  await t.expect(Selector('#filterByType').value).eql('Tutorials', { timeout: 10000 });
});
