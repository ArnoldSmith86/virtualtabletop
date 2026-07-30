import FileUpdater, { VERSION } from '../../server/fileupdater.mjs';

// The v22 migration renames the seat text/color properties and hands "display"
// over to the generic show/hide boolean. Getting that wrong is not recoverable
// once a room has been saved, so every rule it applies is pinned down here.
function updateFromV21(state) {
  return FileUpdater(Object.assign({ _meta: { version: 21 } }, state));
}

function updateWidgets(widgets) {
  const state = updateFromV21(widgets);
  delete state._meta;
  return state;
}

describe('v22 seat property rename', () => {
  test('renames the seat properties and leaves other widgets alone', () => {
    expect(updateWidgets({
      seat: { type: 'seat', display: 'playerName', displayEmpty: 'sit down', colorEmpty: '#ff0000' },
      card: { type: 'card', display: false }
    })).toEqual({
      seat: { type: 'seat', seatedText: 'playerName', emptyText: 'sit down', emptyColor: '#ff0000' },
      card: { type: 'card', display: false }
    });
  });

  test('bumps the version', () => {
    expect(updateFromV21({})._meta.version).toBe(VERSION);
  });

  test('renames the seat-only names wherever they appear', () => {
    expect(updateWidgets({
      label: {
        type: 'label',
        css: { color: '${PROPERTY colorEmpty OF seat}' },
        dynamicProperties: { text: [ { func: 'GET', property: 'displayEmpty' } ] }
      }
    })).toEqual({
      label: {
        type: 'label',
        css: { color: '${PROPERTY emptyColor OF seat}' },
        dynamicProperties: { text: [ { func: 'GET', property: 'emptyText' } ] }
      }
    });
  });

  test('renames a dynamicProperties key on a seat but not on other widgets', () => {
    expect(updateWidgets({
      seat: { type: 'seat', dynamicProperties: { display: [ { func: 'VAR' } ] } },
      card: { type: 'card', dynamicProperties: { display: [ { func: 'VAR' } ] } }
    })).toEqual({
      seat: { type: 'seat', dynamicProperties: { seatedText: [ { func: 'VAR' } ] } },
      card: { type: 'card', dynamicProperties: { display: [ { func: 'VAR' } ] } }
    });
  });

  test('renames ${PROPERTY display OF <seat>} but not the same for other widgets', () => {
    expect(updateWidgets({
      seat: { type: 'seat' },
      card: { type: 'card' },
      button: {
        type: 'button',
        clickRoutine: [
          { func: 'LABEL', value: '${PROPERTY display OF seat}' },
          { func: 'LABEL', value: '${PROPERTY display OF card}' }
        ]
      }
    }).button.clickRoutine).toEqual([
      { func: 'LABEL', value: '${PROPERTY seatedText OF seat}' },
      { func: 'LABEL', value: '${PROPERTY display OF card}' }
    ]);
  });

  test('renames ${PROPERTY display} inside a seat only', () => {
    expect(updateWidgets({
      seat: { type: 'seat', css: { color: '${PROPERTY display}' } },
      card: { type: 'card', css: { color: '${PROPERTY display}' } }
    })).toEqual({
      seat: { type: 'seat', css: { color: '${PROPERTY seatedText}' } },
      card: { type: 'card', css: { color: '${PROPERTY display}' } }
    });
  });

  test('renames SET display when the value uses a seat text placeholder', () => {
    expect(updateWidgets({
      button: {
        type: 'button',
        clickRoutine: [
          { func: 'SET', property: 'display', value: 'seat playerName' },
          { func: 'SET', property: 'display', value: false }
        ]
      }
    }).button.clickRoutine).toEqual([
      { func: 'SET', property: 'seatedText', value: 'seat playerName' },
      { func: 'SET', property: 'display', value: false }
    ]);
  });

  test('renames display on a collection that provably holds only seats', () => {
    expect(updateWidgets({
      button: {
        type: 'button',
        clickRoutine: [
          { func: 'SELECT', type: 'seat' },
          { func: 'SET', property: 'display', value: '' },
          { func: 'GET', property: 'display', variable: 'text' },
          { func: 'SELECT', type: 'card', collection: 'cards' },
          { func: 'SET', property: 'display', value: '', collection: 'cards' }
        ]
      }
    }).button.clickRoutine).toEqual([
      { func: 'SELECT', type: 'seat' },
      { func: 'SET', property: 'seatedText', value: '' },
      { func: 'GET', property: 'seatedText', variable: 'text' },
      { func: 'SELECT', type: 'card', collection: 'cards' },
      { func: 'SET', property: 'display', value: '', collection: 'cards' }
    ]);
  });

  test('forgets what a collection holds once a nested routine could have refilled it', () => {
    expect(updateWidgets({
      button: {
        type: 'button',
        clickRoutine: [
          { func: 'SELECT', type: 'seat' },
          { func: 'IF', condition: true, thenRoutine: [] },
          { func: 'SET', property: 'display', value: '' }
        ]
      }
    }).button.clickRoutine[2]).toEqual({ func: 'SET', property: 'display', value: '' });
  });

  test('renames a SELECT that filters seats by display', () => {
    expect(updateWidgets({
      button: { type: 'button', clickRoutine: [ { func: 'SELECT', type: 'seat', property: 'display', value: 'x' } ] }
    }).button.clickRoutine).toEqual([ { func: 'SELECT', type: 'seat', property: 'seatedText', value: 'x' } ]);
  });
});

describe('v22 fixed seat color', () => {
  test('moves the old .seated override into seatedColor', () => {
    expect(updateWidgets({
      seat: { type: 'seat', css: { default: { border: 'none' }, '.seated': { '--color': '#ff0000 !important' } } }
    })).toEqual({
      seat: { type: 'seat', seatedColor: '#ff0000', css: { default: { border: 'none' } } }
    });
  });

  test('resolves the preset that pointed at the empty color', () => {
    expect(updateWidgets({
      seat: { type: 'seat', colorEmpty: '#00ff00', css: { '.seated': { '--color': '${PROPERTY colorEmpty} !important' } } }
    })).toEqual({
      seat: { type: 'seat', emptyColor: '#00ff00', seatedColor: '#00ff00', css: {} }
    });
  });

  test('keeps an occupied seat on its fixed color', () => {
    expect(updateWidgets({
      seat: { type: 'seat', player: 'Alice', color: '#123456', css: { '.seated': { '--color': '#ff0000 !important' } } }
    }).seat).toMatchObject({ seatedColor: '#ff0000', color: '#ff0000' });
  });

  test('leaves an override without !important alone, it never won anyway', () => {
    const css = { '.seated': { '--color': '#ff0000' } };
    expect(updateWidgets({ seat: { type: 'seat', css } })).toEqual({ seat: { type: 'seat', css } });
  });

  test('leaves an override it cannot resolve alone', () => {
    const css = { '.seated': { '--color': '${PROPERTY color OF other} !important' } };
    expect(updateWidgets({ seat: { type: 'seat', css } })).toEqual({ seat: { type: 'seat', css } });
  });
});
