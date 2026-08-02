export const DEFAULT_MENU_CONFIG = {
  minSideMenuWidth: 44,
  wideSideMenuThreshold: 200,
  minBottomMenuHeight: 60,
  isHidden: false,
};

export const DEFAULT_VIEWPORT = { targetWidth: 1600, targetHeight: 1000 };

// The size the board is laid out for. Games can override it through
// _meta.gameSettings.aspectRatio, so this is mutated in place and everything
// that needs the current board dimensions reads from this object.
export const viewportConfig = { ...DEFAULT_VIEWPORT };

export function setViewportSize(aspectRatio) {
  viewportConfig.targetWidth  = (aspectRatio && aspectRatio.width)  || DEFAULT_VIEWPORT.targetWidth;
  viewportConfig.targetHeight = (aspectRatio && aspectRatio.height) || DEFAULT_VIEWPORT.targetHeight;
}

/**
 * Calculates the optimal layout and scale for the VTT board.
 * 
 * @param {number} windowWidth 
 * @param {number} windowHeight 
 * @param {Object} viewportConfig - { targetWidth, targetHeight }
 * @param {Object} [menuConfig] - Custom menu bounds
 * @param {string} [currentLayoutMode] - Optional mode from previous frame to apply hysteresis
 * @returns {Object} { scale, layoutMode }
 */
export function calculateLayout(
  windowWidth, 
  windowHeight, 
  viewportConfig, 
  menuConfig = {}, 
  currentLayoutMode = null
) {
  const config = { ...DEFAULT_MENU_CONFIG, ...menuConfig };
  const { targetWidth, targetHeight } = viewportConfig;

  if (config.isHidden) {
    const scale = Math.max(0.1, Math.min(windowWidth / targetWidth, windowHeight / targetHeight));
    return { scale, layoutMode: 'hidden' };
  }

  // 1. Calculate possible scales (clamping available space to >= 0)
  const availWidthSide = Math.max(0, windowWidth - config.minSideMenuWidth);
  const scaleSide = Math.min(availWidthSide / targetWidth, windowHeight / targetHeight);

  const availHeightBottom = Math.max(0, windowHeight - config.minBottomMenuHeight);
  const scaleBottom = Math.min(windowWidth / targetWidth, availHeightBottom / targetHeight);

  // 2. Select optimal layout with a 3% hysteresis buffer to prevent resize flicker
  let layoutMode;
  const HYSTERESIS_FACTOR = 1.03;

  if (currentLayoutMode === 'bottom' && scaleBottom * HYSTERESIS_FACTOR >= scaleSide) {
    layoutMode = 'bottom';
  } else if (scaleSide >= scaleBottom) {
    layoutMode = 'side';
  } else {
    layoutMode = 'bottom';
  }

  const baseScale = layoutMode === 'side' ? scaleSide : scaleBottom;

  // 3. Determine if side menu can upgrade to "wide"
  if (layoutMode === 'side') {
    const remainingWidth = windowWidth - (baseScale * targetWidth);
    if (remainingWidth >= config.wideSideMenuThreshold) {
      layoutMode = 'wide-side';
    }
  }

  // 4. Clamp to absolute minimum scale
  const scale = Math.max(baseScale, 0.1);

  return { scale, layoutMode };
}
