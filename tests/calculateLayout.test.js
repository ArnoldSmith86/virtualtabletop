import { calculateLayout, DEFAULT_MENU_CONFIG } from '../client/js/calculateLayout.js';

describe('calculateLayout', () => {
  const viewport16x10 = { targetWidth: 1600, targetHeight: 1000 };

  test('should default to side layout on ultra-wide screens', () => {
    // 3200x1000 (32:10)
    const result = calculateLayout(3200, 1000, viewport16x10);
    expect(result.layoutMode).toBe('wide-side');
    expect(result.scale).toBe(1); // 1000/1000
  });

  test('should default to bottom layout on vertical screens', () => {
    // 1000x2000 (1:2)
    const result = calculateLayout(1000, 2000, viewport16x10);
    expect(result.layoutMode).toBe('bottom');
    // window width / target width = 1000/1600 = 0.625
    expect(result.scale).toBe(0.625);
  });

  test('should handle hidden menu configuration', () => {
    const result = calculateLayout(1600, 1000, viewport16x10, { isHidden: true });
    expect(result.layoutMode).toBe('hidden');
    expect(result.scale).toBe(1);
  });

  test('should apply hysteresis favoring bottom when scaling is close and previous mode was bottom', () => {
    // With 1.03 hysteresis, if side and bottom are equal, it prefers bottom if previously bottom.
    // 1644x1060 gives exactly scale=1 for both side (1644-44=1600) and bottom (1060-60=1000)
    const result = calculateLayout(1644, 1060, viewport16x10, {}, 'bottom');
    expect(result.layoutMode).toBe('bottom');
    expect(result.scale).toBe(1);
  });

  test('should clamp to a minimum scale for tiny windows', () => {
    const result = calculateLayout(10, 10, viewport16x10);
    expect(result.scale).toBe(0.1);
  });
});
