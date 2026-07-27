import { ClientFunction } from 'testcafe';

import { prepareClient, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// updateToolbarLayout in main.js picks the toolbar layout by measuring instead of by media
// queries, so whatever the window size is, all buttons stay available: either they fit into
// the toolbar or the toolbar can be scrolled to them.
const toolbarLayout = ClientFunction(() => {
  const toolbar = document.querySelector('#toolbar');
  const toolbarRect = toolbar.getBoundingClientRect();
  let buttons = 0;
  const outside = [];
  for(const child of toolbar.children) {
    if(!child.getClientRects().length)
      continue;
    if(child.tagName == 'BUTTON' && child.id != 'hideToolbarButton') // that one only exists in the aspectTooGood layout
      ++buttons;
    const rect = child.getBoundingClientRect();
    if(rect.right > toolbarRect.right + 1 || rect.bottom > toolbarRect.bottom + 1)
      outside.push(child.id || child.className);
  }
  return {
    buttons,
    outside: outside.join(', '),
    overflow: document.body.classList.contains('toolbarOverflow'),
    scrollable: toolbar.scrollWidth > toolbar.clientWidth + 1 || toolbar.scrollHeight > toolbar.clientHeight + 1
  };
});

const scrollToolbarToEnd = ClientFunction(() => {
  const toolbar = document.querySelector('#toolbar');
  toolbar.scrollLeft = toolbar.scrollWidth;
  toolbar.scrollTop = toolbar.scrollHeight;
});

// everything that decides the layout - toolbarScrollBack/Forward are left out on purpose, they
// only reflect the current scroll position
const toolbarClasses = ClientFunction(() => {
  const layoutClasses = /^(toolbarCompact\d|toolbarOverflow|wideToolbar|horizontalToolbar|aspectTooGood)$/;
  return document.body.className.split(/\s+/).filter(c => c.match(layoutClasses)).sort().join(' ');
});

const toolbarState = ClientFunction(() => {
  const toolbar = document.querySelector('#toolbar');
  const overlays = [];
  for(const overlay of document.querySelectorAll('.overlay'))
    if(getComputedStyle(overlay).display != 'none')
      overlays.push(overlay.id);
  return { position: toolbar.scrollLeft + toolbar.scrollTop, overlays: overlays.join(', ') };
});

test('The toolbar keeps all buttons reachable at every window size', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();

  for(const [ width, height ] of [ [ 1280, 800 ], [ 1000, 400 ], [ 800, 600 ], [ 640, 480 ], [ 500, 300 ] ]) {
    const size = `${width}x${height}`;
    await t.resizeWindow(width, height).wait(300);

    const layout = await toolbarLayout();
    await t.expect(layout.buttons).eql(9, `${size}: not all toolbar buttons are displayed`);
    if(layout.overflow) {
      await t.expect(layout.scrollable).ok(`${size}: the toolbar overflows but cannot be scrolled`);
      await scrollToolbarToEnd();
      await t.expect((await toolbarLayout()).outside).eql('', `${size}: buttons stay outside of the toolbar after scrolling to its end`);
    } else {
      await t.expect(layout.outside).eql('', `${size}: buttons reach outside of the toolbar`);
    }
  }

  await t.resizeWindow(1280, 800);
});

// the layout is measured, so it has to be a function of the window size alone - if the state of a
// previous pass (like the scroll arrows taking space of their own) influenced the measurement, the
// same window size would end up with different layouts depending on how it was reached
test('The toolbar layout does not depend on the direction the window was resized in', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();

  const widths = [ 360, 380, 400, 420, 440 ];
  const growing = {};
  await t.resizeWindow(340, 300).wait(300);
  for(const width of widths) {
    await t.resizeWindow(width, 300).wait(300);
    growing[width] = await toolbarClasses();
  }
  for(const width of [ ...widths ].reverse()) {
    await t.resizeWindow(width, 300).wait(300);
    await t.expect(await toolbarClasses()).eql(growing[width], `${width}x300: the layout differs between growing and shrinking the window`);
  }

  await t.resizeWindow(1280, 800);
});

test('Clicking a toolbar scroll arrow scrolls instead of pressing the button underneath it', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();

  await t.resizeWindow(500, 300).wait(300);
  await t.expect((await toolbarLayout()).overflow).ok('500x300: the toolbar is expected to overflow');

  await scrollToolbarToEnd();
  await t.wait(300);
  const before = await toolbarState();
  await t.expect(before.position).gt(0, 'the toolbar did not scroll to its end');

  // the back arrow is at the top left of the toolbar in every layout - clicking it has to scroll
  // and must not reach whatever scrolled underneath it
  await t.click('#toolbar', { offsetX: 12, offsetY: 12 }).wait(500);
  const after = await toolbarState();
  await t.expect(after.position).lt(before.position, 'clicking the back arrow did not scroll the toolbar');
  await t.expect(after.overlays).eql(before.overlays, 'clicking the back arrow pressed the button underneath it');

  await t.resizeWindow(1280, 800);
});
