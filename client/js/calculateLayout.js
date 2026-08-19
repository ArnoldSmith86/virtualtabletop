// Mirrors --toolbarSize in layout.css and the width the wide toolbar needs.
const TOOLBAR_SIZE = 44;
const WIDE_TOOLBAR_SIZE = 200;
// the window width below which edit mode stops keeping the module panel beside the room
const NARROW_WINDOW_SIZE = 1000;
// Mirror editor/sidebar.css and editor/toolbar.css: the width of the editor sidebar with its
// button labels and the height of the editor toolbar above the room.
const EDIT_SIDEBAR_WIDTH = 128;
const EDIT_TOOLBAR_HEIGHT = 36;

export const DEFAULT_VIEWPORT = { targetWidth: 1600, targetHeight: 1000 };
export const MIN_BOARD_SIZE = 100;
export const MAX_BOARD_SIZE = 10000;

// The size the board is laid out for. Games can override it through
// _meta.gameSettings.boardSize, so this is mutated in place and everything
// that needs the current board dimensions reads from this object.
export const viewportConfig = { ...DEFAULT_VIEWPORT };

function boardDimension(value, fallback) {
  const number = Math.round(Number(value));
  if(!number || !isFinite(number))
    return fallback;
  return Math.max(MIN_BOARD_SIZE, Math.min(MAX_BOARD_SIZE, number));
}

// boardSize comes straight from the game file / another client, so anything that
// isn't a usable board size falls back to the default 1600x1000. The server runs
// the same function on everything it stores, so what is saved to disk and what
// everybody renders can't drift apart.
export function normalizeBoardSize(boardSize) {
  if(!boardSize || typeof boardSize != 'object')
    return null;
  return {
    width:  boardDimension(boardSize.width,  DEFAULT_VIEWPORT.targetWidth),
    height: boardDimension(boardSize.height, DEFAULT_VIEWPORT.targetHeight)
  };
}

/**
 * Applies a game's board size to viewportConfig.
 * @returns {boolean} whether the board size actually changed - the callers use this
 *   to re-run the layout, so it must not be second-guessed by comparing viewportConfig
 *   before and after: state and meta both carry the board size and whichever message
 *   arrives first would be the only one that sees a difference.
 */
export function setViewportSize(boardSize) {
  const { width, height } = normalizeBoardSize(boardSize) || { width: DEFAULT_VIEWPORT.targetWidth, height: DEFAULT_VIEWPORT.targetHeight };
  if(width == viewportConfig.targetWidth && height == viewportConfig.targetHeight)
    return false;

  viewportConfig.targetWidth  = width;
  viewportConfig.targetHeight = height;
  return true;
}

// The body classes that pick a toolbar layout. They are the ones the toolbar CSS and
// updateToolbarLayout in main.js already work with - an empty class is the default
// layout, where the toolbar sits in the margin at the left of the board.
export const LAYOUT_CLASSES = [ 'wideToolbar', 'horizontalToolbar', 'aspectTooGood' ];

/**
 * Picks the toolbar layout and the scale the board is rendered at. The board always
 * uses the whole window and the toolbar sits in whatever margin the window's aspect
 * ratio leaves over - unless there is less than a toolbar width of margin
 * ('aspectTooGood'), in which case the board shrinks to make room for it.
 *
 * @param {number} windowWidth
 * @param {number} windowHeight
 * @param {Object} viewport - { targetWidth, targetHeight }
 * @param {Object} [options] - { scale, toolbarHidden }
 *   scale: board scale dictated by the surrounding UI (edit mode) instead of the window
 *   toolbarHidden: the player hid the toolbar, so aspectTooGood keeps the full scale
 * @returns {Object} { scale, layoutClass } - layoutClass is one of LAYOUT_CLASSES or ''
 */
export function calculateLayout(windowWidth, windowHeight, viewport, options = {}) {
  const { targetWidth, targetHeight } = viewport;
  const windowIsNarrower = windowWidth/windowHeight < targetWidth/targetHeight;

  let scale = options.scale !== undefined
    ? options.scale
    : (windowIsNarrower ? windowWidth/targetWidth : windowHeight/targetHeight);

  const marginX = windowWidth  - scale*targetWidth;
  const marginY = windowHeight - scale*targetHeight;

  if(marginX + marginY < TOOLBAR_SIZE) {
    if(!options.toolbarHidden)
      scale = (windowWidth - TOOLBAR_SIZE)/targetWidth;
    return { scale, layoutClass: 'aspectTooGood' };
  }
  if(marginX > WIDE_TOOLBAR_SIZE)
    return { scale, layoutClass: 'wideToolbar' };
  if(windowIsNarrower)
    return { scale, layoutClass: 'horizontalToolbar' };
  return { scale, layoutClass: '' };
}

/**
 * Whether the window is turned the wrong way round for the board, which is what the
 * "please rotate your device" nag is for. It used to be a plain `@media (orientation:
 * portrait)`, keyed off the window alone - so a portrait board in a portrait window,
 * the case this all exists for, got told to rotate away from a perfect fit. Only a
 * landscape board can be rotated into, so a portrait or square board never nags: a
 * portrait board on a landscape desktop window is letterboxed but perfectly playable.
 *
 * @param {number} windowWidth
 * @param {number} windowHeight
 * @param {Object} viewport - { targetWidth, targetHeight }
 * @returns {boolean}
 */
export function isOrientationMismatch(windowWidth, windowHeight, viewport) {
  return windowHeight >= windowWidth && viewport.targetWidth > viewport.targetHeight;
}

/**
 * Whether edit mode moves the module panel above the room or lets it cover the
 * room entirely - no class means it stays beside the room. These used to be two
 * media queries keyed off a hardcoded 16/20 window aspect ratio, which is half
 * of the default board's 16/10, so a game with a differently shaped board
 * flipped at the wrong window shape. At 1600x1000 the classes match what those
 * media queries matched, window size for window size - including the sizes
 * where both of them applied at once.
 *
 * @param {number} windowWidth
 * @param {number} windowHeight
 * @param {Object} viewport - { targetWidth, targetHeight }
 * @returns {string[]} any of 'editModulesAbove', 'editModulesOverlay'
 */
export function calculateEditModuleClasses(windowWidth, windowHeight, viewport) {
  const windowAspect = windowWidth/windowHeight;
  const halfBoardAspect = viewport.targetWidth/viewport.targetHeight/2;
  const classes = [];

  if(windowAspect <= halfBoardAspect || (windowWidth >= NARROW_WINDOW_SIZE && windowHeight >= windowWidth))
    classes.push('editModulesAbove');
  if(windowWidth <= NARROW_WINDOW_SIZE && windowAspect >= halfBoardAspect)
    classes.push('editModulesOverlay');
  return classes;
}

/**
 * Whether the editor sidebar has to drop its button labels and show icons only. It is
 * 128px wide with them and 36px without, and those 92px come out of the room - but only
 * while the room is what is limited by the window's width. A portrait board fills the
 * height long before it runs out of width, so it can keep the labels in a window where
 * the default board can't, and a wide board loses them in one where it could.
 *
 * This used to be `@media (max-width: 1600px)`, which is roughly the window a 16:10 board
 * needs at full height - the same number for every board, and one that took the labels
 * away on e.g. 1600x900 even though the room there is limited by its height and does not
 * get one pixel bigger without them.
 *
 * @param {number} windowWidth
 * @param {number} windowHeight
 * @param {Object} viewport - { targetWidth, targetHeight }
 * @returns {boolean}
 */
export function isEditSidebarNarrow(windowWidth, windowHeight, viewport) {
  // the module panel layouts put the panel where the sidebar's labels would be
  if(calculateEditModuleClasses(windowWidth, windowHeight, viewport).length)
    return true;
  return (windowWidth - EDIT_SIDEBAR_WIDTH)/viewport.targetWidth < (windowHeight - EDIT_TOOLBAR_HEIGHT)/viewport.targetHeight;
}

/**
 * The height of the add widget overlay's header row, in the overlay's own coordinates. The
 * header sits above the 1600x1000 layout the previews live in, so the overlay as a whole is
 * 1600x(1000+this) - see #addOverlayHeader in editmode.css.
 */
export const ADD_OVERLAY_HEADER_HEIGHT = 90;

/**
 * The scale the add widget overlay is rendered at. Its contents are laid out for the default
 * board because the widget previews in it are real widgets at coordinates hardcoded for that
 * board, so the whole layout is scaled into the room and centered instead of being stretched
 * to it - see #addOverlayContent in editmode.css. The header row makes the overlay taller than
 * the default board, so it is scaled down a little even there.
 *
 * @param {Object} viewport - { targetWidth, targetHeight }
 * @returns {number}
 */
export function addOverlayScale(viewport) {
  return Math.min(viewport.targetWidth/DEFAULT_VIEWPORT.targetWidth, viewport.targetHeight/(DEFAULT_VIEWPORT.targetHeight + ADD_OVERLAY_HEADER_HEIGHT));
}

/**
 * Where a widget ends up when it is added by clicking its preview in the add widget overlay:
 * the preview is shown at the overlay's own coordinates, so those go through the same scale
 * and centering the overlay itself gets. The widget keeps its full size while the overlay
 * shrinks, so the result is then kept on the board - without that, a preview near the edge of
 * a small board would add a widget hanging over it.
 *
 * @param {Object} viewport - { targetWidth, targetHeight }
 * @param {number} x - the preview's x in the overlay's 1600x1000 layout
 * @param {number} y - the preview's y in the overlay's 1600x1000 layout
 * @param {number} width - the width the added widget will have, not the preview's delta
 * @param {number} height - the height the added widget will have
 * @returns {number[]} [ x, y ] on the board
 */
export function addOverlayPosition(viewport, x, y, width, height) {
  const scale = addOverlayScale(viewport);
  // the top left corner of the 1600x1000 layout on the board: the overlay is centered as a whole,
  // and the header row above the layout pushes the layout itself half a header row further down
  const layoutLeft = viewport.targetWidth/2  - DEFAULT_VIEWPORT.targetWidth*scale/2;
  const layoutTop  = viewport.targetHeight/2 - (DEFAULT_VIEWPORT.targetHeight - ADD_OVERLAY_HEADER_HEIGHT)*scale/2;
  function onBoard(coordinate, layoutStart, widgetSize, boardSize) {
    return Math.max(0, Math.min(Math.round(layoutStart + coordinate*scale), boardSize - widgetSize));
  }
  return [
    onBoard(x, layoutLeft, width,  viewport.targetWidth),
    onBoard(y, layoutTop,  height, viewport.targetHeight)
  ];
}
