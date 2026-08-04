import { ClientFunction, Selector } from 'testcafe';

import { getMeta, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// What the client is laying the board out for. --roomWidth/--roomHeight and --scale are only
// ever set by setScale, and #roomArea is sized from all three, so a stale rendered aspect ratio
// means the re-layout did not run. None of this depends on the window size.
const boardLayout = ClientFunction(() => {
  const rect = document.querySelector('#roomArea').getBoundingClientRect();
  return {
    roomWidth: document.documentElement.style.getPropertyValue('--roomWidth'),
    roomHeight: document.documentElement.style.getPropertyValue('--roomHeight'),
    renderedAspect: (rect.width/rect.height).toFixed(3)
  };
});

// Load a game into the room the way the API and the game list do it: as a state, with the board
// size in its game settings. The client applies the state message and the meta message that
// follows it - either one of them can be the first to bring in the new board size, and the
// re-layout has to happen exactly once either way.
async function loadGameWithBoardSize(boardSize) {
  const version = (await getMeta()).version;
  await setRoomState({
    _meta: { version, gameSettings: boardSize ? { boardSize } : {} },
    boardSizeLabel: { id: 'boardSizeLabel', type: 'label', x: 100, y: 100, text: 'board size test' }
  });
}

const defaultBoard  = { roomWidth: '1600px', roomHeight: '1000px', renderedAspect: '1.600' };
const portraitBoard = { roomWidth: '1000px', roomHeight: '1600px', renderedAspect: '0.625' };

// How wide one game tile in the shelf ends up. The overlays are children of #roomArea, so what
// they have to work with is the rendered board, not the window - --columns comes out of the
// container queries in states.css and the grid divides the shelf's width by it.
const shelfTiles = ClientFunction(() => {
  const columns = +getComputedStyle(document.querySelector('#statesOverlay')).getPropertyValue('--columns');
  return { columns, tileWidth: document.querySelector('#roomArea').getBoundingClientRect().width/columns };
});

test('Loading a game with its own board size re-lays out a client that is already in the room', async t => {
  await loadGameWithBoardSize(null);
  await ClientFunction(prepareClient)();
  await t.expect(boardLayout()).eql(defaultBoard);

  await loadGameWithBoardSize({ width: 1000, height: 1600 });
  await t.expect(boardLayout()).eql(portraitBoard);

  // and back, for a game that does not ask for a board size of its own
  await loadGameWithBoardSize(null);
  await t.expect(boardLayout()).eql(defaultBoard);
});

test('A client joining later plays on the same board as the one that was already there', async t => {
  await loadGameWithBoardSize({ width: 1000, height: 1600 });
  await ClientFunction(prepareClient)();
  await t.expect(boardLayout()).eql(portraitBoard);

  await t.navigateTo('./testcafe-testing');
  await t.expect(boardLayout()).eql(portraitBoard);

  await loadGameWithBoardSize(null);
});

test('An unusable board size in a game file is normalized instead of being stored as it is', async t => {
  await loadGameWithBoardSize({ width: 50, height: 1e9 });
  await ClientFunction(prepareClient)();

  // what everybody renders and what is stored in the game file have to be the same board
  await t.expect(boardLayout()).eql({ roomWidth: '100px', roomHeight: '10000px', renderedAspect: '0.010' });
  await t.expect((await getMeta()).gameSettings.boardSize).eql({ width: 100, height: 10000 });

  await loadGameWithBoardSize(null);
});

// A portrait board leaves the game shelf a fraction of the width the window has, so it has to
// drop columns to keep the tiles the size they are on the default board. Off the window - which
// is what a media query measures - it kept every one of them and squeezed unreadable thumbnails
// into the space of three.
test('The game shelf sizes its tiles from the board, not from the window', async t => {
  await t.resizeWindow(1280, 800);
  await loadGameWithBoardSize(null);
  await ClientFunction(prepareClient)();
  await t.click('#statesButton');
  const onDefaultBoard = await shelfTiles();

  await loadGameWithBoardSize({ width: 1000, height: 1600 });
  const onPortraitBoard = await shelfTiles();

  await t
    .expect(onPortraitBoard.columns).lt(onDefaultBoard.columns)
    .expect(onPortraitBoard.tileWidth).gt(onDefaultBoard.tileWidth*0.75);

  await loadGameWithBoardSize(null);
});

// The confirmation names concrete dimensions, so it may only be shown while the board really is
// on them - with a second editor in the room, somebody else's board size would otherwise leave
// this panel affirming a size nobody is playing on anymore.
test('The Apply confirmation goes away when somebody else changes the board size', async t => {
  await loadGameWithBoardSize(null);
  await ClientFunction(prepareClient)();
  await setName(t);

  const confirmation = Selector('.boardSizeMessage.success');
  await t
    .click('#editButton')
    .click('#editorSidebar [icon=settings]')
    .typeText('#boardHeight', '1600', { replace: true })
    .click('.boardSizeActions button[icon=check]')
    .expect(confirmation.innerText).contains('1600 × 1600')
    .expect(boardLayout()).eql({ roomWidth: '1600px', roomHeight: '1600px', renderedAspect: '1.000' });

  // the same thing another editor applying a different size looks like from here
  await loadGameWithBoardSize({ width: 1200, height: 1200 });
  await t
    .expect(Selector('#boardHeight').value).eql('1200')
    .expect(confirmation.exists).notOk();

  // and it does not come back when that other editor switches back
  await loadGameWithBoardSize({ width: 1600, height: 1600 });
  await t
    .expect(Selector('#boardHeight').value).eql('1600')
    .expect(confirmation.exists).notOk();

  await loadGameWithBoardSize(null);
});
