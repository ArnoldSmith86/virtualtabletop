import { ClientFunction } from 'testcafe';

import { LEGACY_COMBOS, applyLegacy, getState, prepareClient, setName, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// Every legacy-mode combination the registry declares - all off, all on, each mode alone and
// each declared interacting pair - driven through the same probe game. The Compute sweep pins
// the engine into a single combination and compares a hash of the whole room; this pins what
// each mode actually does, in both of its states, per property. A failure here names the
// property and the combination instead of saying "hash differs".
//
// Expectations are written as functions of the combination rather than as recorded values:
// the point of a legacy mode is that both of its answers are intentional, so writing both
// down is what makes an accidental change to either half fail.
const probes = {
  // convertNumericVarParametersToNumbers: a digits-only string keeps its type or is converted
  pushedString:    modes => modes.convertNumericVarParametersToNumbers ? [ 4711 ] : [ '4711' ],
  // ... which is why a widget id that happens to be all digits used to become unselectable
  selectByStoredID:modes => modes.convertNumericVarParametersToNumbers ? 0 : 1,
  // ... and why a string operation on a digits-only string used to fail outright
  concatDigits:    modes => modes.convertNumericVarParametersToNumbers ? 0 : '12',
  // '+' converts in both states - the exception the mode's condition spells out
  addedStrings:    _ => 3,

  // useOneAsDefaultForVarParameters: omitted compute parameters defaulted to 1
  emptyPlus:       modes => modes.useOneAsDefaultForVarParameters ? 2 : 0,
  emptyTimes:      modes => modes.useOneAsDefaultForVarParameters ? 1 : 0,

  // the two var modes are declared as interacting: this one only takes the modern path when
  // both are off, because the string has to survive the parameter conversion for color.js's
  // out-of-band check to reject it
  contrastString:  modes => modes.convertNumericVarParametersToNumbers || modes.useOneAsDefaultForVarParameters ? '#909090' : '#ffffff',

  // and nothing above may depend on the two rendering modes
  contrastDefault: _ => '#ffffff'
};

const probeState = {
  probeButton: {
    id: 'probeButton',
    type: 'button',
    clickRoutine: [
      "var ids = []",
      "var ids = push '4711'",
      "var pushedString = ${ids}",
      "var concatDigits = concat '1' '2'",
      "var addedStrings = + '1' '2'",
      "var emptyPlus = +",
      "var emptyTimes = *",
      "var contrastDefault = colorContrast '#101010'",
      "var contrastString = colorContrast '#101010' '0.5'",
      { func: 'SELECT', property: 'id', value: '${ids.0}' },
      { func: 'COUNT', variable: 'selectByStoredID' },
      { func: 'SET', collection: 'thisButton', property: 'probeResults', value: {
        pushedString:     '${pushedString}',
        selectByStoredID: '${selectByStoredID}',
        concatDigits:     '${concatDigits}',
        addedStrings:     '${addedStrings}',
        emptyPlus:        '${emptyPlus}',
        emptyTimes:       '${emptyTimes}',
        contrastDefault:  '${contrastDefault}',
        contrastString:   '${contrastString}'
      } }
    ]
  },
  // a widget whose id consists of digits only - the pitfall the numeric conversion caused
  4711: { id: '4711', type: 'label', text: 'numeric id' }
};

for(const [ name, modes ] of Object.entries(LEGACY_COMBOS)) {
  test(`Legacy matrix (${name})`, async t => {
    await ClientFunction(prepareClient)();
    await setName(t);
    await applyLegacy(modes);
    await setRoomState(probeState);
    await t.click('#w_probeButton');

    let results = null;
    for(let wait=50; wait<1000; wait*=2) {
      results = JSON.parse(await getState()).probeButton.probeResults;
      if(results)
        break;
      await new Promise(resolve => setTimeout(resolve, wait));
    }

    for(const [ probe, expected ] of Object.entries(probes))
      await t.expect(JSON.stringify((results || {})[probe])).eql(JSON.stringify(expected(modes)), `${probe} in combination ${name}`);
  });
}
