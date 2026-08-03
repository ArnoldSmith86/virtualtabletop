// Mirrors --toolbarSize in layout.css and the width the wide toolbar needs.
const TOOLBAR_SIZE = 44;
const WIDE_TOOLBAR_SIZE = 200;
// the window width below which edit mode stops keeping the module panel beside the room
const NARROW_WINDOW_SIZE = 1000;

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
