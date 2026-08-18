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
// container queries in states.css and the tiles divide the board's width by it.
const shelfTiles = ClientFunction(() => {
  const columns = +getComputedStyle(document.querySelector('#statesOverlay')).getPropertyValue('--columns');
  return { columns, tileWidth: document.querySelector('.roomState.visible').getBoundingClientRect().width };
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

// Where the widget a preview in the add widget overlay just added ended up. The previews are
// real widgets at coordinates picked for a 1600x1000 board, so on any other board they are drawn
// scaled and centered - and the widget they add has to follow them there.
const addedWidgetBox = ClientFunction(type => {
  const added = widgetFilter(w => w.get('type') == type && !w.get('parent'))[0];
  return added && {
    x: added.get('x'),
    y: added.get('y'),
    right: added.get('x')+added.get('width'),
    bottom: added.get('y')+added.get('height')
  };
});

// The overlay is populated once, when edit mode is opened, but the board size can change after
// that - the game settings apply to everybody in the room right away. The composite previews
// (deck, chips, timer, counter, line, ring) used to work out where to add at that populate time,
// so after such a change they kept adding at the coordinates of the board that is gone: on a
// 1000px wide board the ring landed at x=1420, entirely off the table.
test('A preview in the add widget overlay adds its widget where the preview is shown', async t => {
  await loadGameWithBoardSize(null);
  await ClientFunction(prepareClient)();
  await setName(t);
  await t.click('#editButton').expect(Selector('#editorToolbar > div > [icon=add]').exists).ok();

  await loadGameWithBoardSize({ width: 1000, height: 1600 });
  await t
    .expect(boardLayout()).eql(portraitBoard)
    .click('#editorToolbar > div > [icon=add]')
    .click('#add-2D-chips')
    .expect(addedWidgetBox('holder')).eql({ x: 573, y: 675, right: 654, bottom: 756 });

  await loadGameWithBoardSize(null);
});

// What the editor sidebar is currently wide - 128px with its button labels, 36px without them.
const editSidebarWidth = ClientFunction(() => getComputedStyle(document.body).getPropertyValue('--editSidebarWidth').trim());

// A portrait board leaves the game shelf a fraction of the width the window has, so it has to
// drop columns to keep the tiles the size they are on the default board. Off the window - which
// is what a media query measures - it kept every one of them and squeezed unreadable thumbnails
// into the space of three.
// The last three tests in this file resize the window on purpose - they come last because the
// size they set stays with the browser afterwards.
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

// The editor sidebar trades its button labels for board width, so whether it can afford them
// depends on the board: this window is too narrow for the default board to keep them, but a
// portrait board runs out of height long before it runs out of width and has them to spare.
test('The editor sidebar keeps its labels while the board is not short of the space', async t => {
  await t.resizeWindow(1280, 800);
  await loadGameWithBoardSize(null);
  await ClientFunction(prepareClient)();
  await t
    .click('#editButton')
    .expect(editSidebarWidth()).eql('36px');

  await loadGameWithBoardSize({ width: 1000, height: 1600 });
  await t.expect(editSidebarWidth()).eql('128px');

  await loadGameWithBoardSize(null);
});

// Whether the game details are a sidebar of the shelf or an overlay of their own is a container
// query on the board, so setSidebar() has to decide it from the board too. While it still measured
// the window, every window that was bigger than its board - 1460x920 on a default board, any
// desktop window on a portrait one - moved the details into the shelf, where the CSS never gave
// them a display: clicking a game did nothing at all, with no way on to the PLAY button.
test('Clicking a game in the shelf opens its details on every board and window size', async t => {
  const detailsPlayButton = Selector('#stateDetailsOverlay .variantsList > div > button');

  for(const [ window, boardSize ] of [ [ [ 1460, 920 ], null ], [ [ 1920, 1080 ], { width: 1000, height: 1600 } ] ]) {
    await t.resizeWindow(...window);
    await loadGameWithBoardSize(boardSize);
    await t.navigateTo('./testcafe-testing');
    await ClientFunction(prepareClient)();
    await t
      .click('#statesButton')
      .click(Selector('.roomState.visible'))
      .expect(Selector('#stateDetailsOverlay').visible).ok()
      .expect(detailsPlayButton.visible).ok();
  }

  await loadGameWithBoardSize(null);
});
