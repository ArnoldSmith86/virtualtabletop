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

  test('renames the seat-only names wherever a property name is expected', () => {
    expect(updateWidgets({
      label: {
        type: 'label',
        css: { color: '${PROPERTY colorEmpty OF seat}' },
        inheritFrom: { seat: [ 'colorEmpty', '!displayEmpty' ], other: '*' },
        svgReplaces: { '#fill': 'colorEmpty' },
        clickRoutine: [ { func: 'SET', property: 'displayEmpty', value: 'x' } ]
      }
    })).toEqual({
      label: {
        type: 'label',
        css: { color: '${PROPERTY emptyColor OF seat}' },
        inheritFrom: { seat: [ 'emptyColor', '!emptyText' ], other: '*' },
        svgReplaces: { '#fill': 'emptyColor' },
        clickRoutine: [ { func: 'SET', property: 'emptyText', value: 'x' } ]
      }
    });
  });

  test('leaves the seat-only names alone where they are not property names', () => {
    const state = {
      label: {
        type: 'label',
        parent: 'colorEmpty',
        text: 'show displayEmpty here',
        classes: 'colorEmpty',
        html: '<div class="displayEmpty">colorEmpty</div>',
        clickRoutine: [ { func: 'LABEL', label: 'colorEmpty', value: 'displayEmpty' } ]
      },
      colorEmpty: { type: 'holder', displayEmpty: 'kept as a property' }
    };
    const updated = updateWidgets(JSON.parse(JSON.stringify(state)));
    expect(updated.label).toEqual(state.label);
    expect(updated.colorEmpty).toEqual({ type: 'holder', emptyText: 'kept as a property' });
  });

  test('renames a face object dynamicProperties value but not its key', () => {
    expect(updateWidgets({
      deck: { type: 'deck', faceTemplates: [ { objects: [ { type: 'text', display: true, dynamicProperties: { display: 'colorEmpty' } } ] } ] }
    })).toEqual({
      deck: { type: 'deck', faceTemplates: [ { objects: [ { type: 'text', display: true, dynamicProperties: { display: 'emptyColor' } } ] } ] }
    });
  });

  test('keeps the variable name a GET derived from the property it read', () => {
    expect(updateWidgets({
      button: {
        type: 'button',
        clickRoutine: [
          { func: 'GET', property: 'colorEmpty' },
          { func: 'SET', property: 'color', value: '${colorEmpty}' }
        ]
      }
    }).button.clickRoutine).toEqual([
      { func: 'GET', property: 'emptyColor', variable: 'colorEmpty' },
      { func: 'SET', property: 'color', value: '${colorEmpty}' }
    ]);
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

  test('leaves display alone on a collection that provably holds no seats', () => {
    expect(updateWidgets({
      button: {
        type: 'button',
        clickRoutine: [
          { func: 'SELECT', type: 'label' },
          { func: 'SET', property: 'display', value: '${playerName}' }
        ]
      }
    }).button.clickRoutine[1]).toEqual({ func: 'SET', property: 'display', value: '${playerName}' });
  });

  test('still renames display after a SELECT that could have picked seats', () => {
    expect(updateWidgets({
      button: {
        type: 'button',
        clickRoutine: [
          { func: 'SELECT', property: 'player', value: '${playerName}' },
          { func: 'SET', property: 'display', value: '${playerName}' }
        ]
      }
    }).button.clickRoutine[1]).toEqual({ func: 'SET', property: 'seatedText', value: '${playerName}' });
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

describe('v22 property expressions', () => {
  test('leaves expressions it cannot resolve statically alone', () => {
    const clickRoutine = [
      { func: 'LABEL', value: '${PROPERTY $variable}' },
      { func: 'LABEL', value: '${PROPERTY colorEmpty OF $variable}' },
      { func: 'LABEL', value: '${PROPERTY colorEmpty!}' },
      { func: 'LABEL', value: 'colorEmpty ${PROPERTY colorEmpty' }
    ];
    expect(updateWidgets({ button: { type: 'button', clickRoutine: JSON.parse(JSON.stringify(clickRoutine)) } }).button.clickRoutine).toEqual(clickRoutine);
  });

  test('splits the name from the target the way the engine does', () => {
    expect(updateWidgets({
      seat: { type: 'seat' },
      button: { type: 'button', clickRoutine: [ { func: 'LABEL', value: '${PROPERTY colorEmpty OF a OF b}' } ] }
    }).button.clickRoutine[0].value).toBe('${PROPERTY emptyColor OF a OF b}');
  });

  test('a long run of " OF " does not take forever', () => {
    const value = '${PROPERTY ' + ' OF '.repeat(20000);
    const started = Date.now();
    updateWidgets({ button: { type: 'button', clickRoutine: [ { func: 'LABEL', value } ] } });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
