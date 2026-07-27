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
