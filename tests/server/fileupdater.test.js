import FileUpdater, { VERSION } from '../../server/fileupdater.mjs';

// Every save carries the version it was written with and is migrated on load,
// so that a change to what a property means never changes what an existing game
// does. This covers the dragLimit sides, which used to be clamped with
// Math.max(null, x) - i.e. at 0 - where they are now read as "no limit".
function migrated(widget, version = VERSION - 1) {
  const state = { _meta: { version }, w: Object.assign({ id: 'w', type: 'basic' }, widget) };
  return FileUpdater(state).w;
}

describe('the dragLimit sides written as null', () => {
  test('become the 0 they always clamped to', () => {
    expect(migrated({ dragLimit: { minX: null, maxY: 10 } }).dragLimit).toEqual({ minX: 0, maxY: 10 });
    expect(migrated({ dragLimit: { minX: null, maxX: null, minY: null, maxY: null } }).dragLimit)
      .toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  });

  test('leave every other limit as it was written', () => {
    expect(migrated({ dragLimit: { minX: 0, maxX: '${PROPERTY width OF board}', condition: 'y > x' } }).dragLimit)
      .toEqual({ minX: 0, maxX: '${PROPERTY width OF board}', condition: 'y > x' });
    expect(migrated({ dragLimit: {} }).dragLimit).toEqual({});
    expect(migrated({ dragLimit: 'nonsense' }).dragLimit).toBe('nonsense');
    expect(migrated({}).dragLimit).toBe(undefined);
  });

  test('are left alone in a file that was written with the new meaning', () => {
    const state = { _meta: { version: VERSION }, w: { id: 'w', type: 'basic', dragLimit: { minX: null } } };
    expect(FileUpdater(state).w.dragLimit).toEqual({ minX: null });
  });
});
