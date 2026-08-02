// Mirrors --toolbarSize in layout.css and the width the wide toolbar needs.
const TOOLBAR_SIZE = 44;
const WIDE_TOOLBAR_SIZE = 200;

export const DEFAULT_VIEWPORT = { targetWidth: 1600, targetHeight: 1000 };
export const MIN_BOARD_SIZE = 100;
export const MAX_BOARD_SIZE = 10000;

// The size the board is laid out for. Games can override it through
// _meta.gameSettings.aspectRatio, so this is mutated in place and everything
// that needs the current board dimensions reads from this object.
export const viewportConfig = { ...DEFAULT_VIEWPORT };

function boardDimension(value, fallback) {
  const number = Math.round(Number(value));
  if(!number || !isFinite(number))
    return fallback;
  return Math.max(MIN_BOARD_SIZE, Math.min(MAX_BOARD_SIZE, number));
}

// aspectRatio comes straight from the game file / another client, so anything
// that isn't a usable board size falls back to the default 1600x1000.
export function setViewportSize(aspectRatio) {
  viewportConfig.targetWidth  = boardDimension(aspectRatio && aspectRatio.width,  DEFAULT_VIEWPORT.targetWidth);
  viewportConfig.targetHeight = boardDimension(aspectRatio && aspectRatio.height, DEFAULT_VIEWPORT.targetHeight);
}

/**
 * Picks the toolbar layout and the scale the board is rendered at. The board
 * always uses the whole window and the toolbar sits in whatever margin the
 * window's aspect ratio leaves over - unless there is less than a toolbar width
 * of margin ('tight'), in which case the board shrinks to make room for it.
 *
 * @param {number} windowWidth
 * @param {number} windowHeight
 * @param {Object} viewport - { targetWidth, targetHeight }
 * @param {Object} [options] - { scale, toolbarHidden }
 *   scale: board scale dictated by the surrounding UI (edit mode) instead of the window
 *   toolbarHidden: the player hid the toolbar, so a tight layout keeps the full scale
 * @returns {Object} { scale, layoutMode: 'side'|'wide-side'|'bottom'|'tight' }
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
    return { scale, layoutMode: 'tight' };
  }
  if(marginX > WIDE_TOOLBAR_SIZE)
    return { scale, layoutMode: 'wide-side' };
  if(windowIsNarrower)
    return { scale, layoutMode: 'bottom' };
  return { scale, layoutMode: 'side' };
}
