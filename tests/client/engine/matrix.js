// The legacy-mode matrix for Layer A. A test either states one expectation that must hold in
// every combination - the common case for a bug fix, because a fix that only works with the
// flags off is not a fix - or asks for a specific combination when the mode genuinely changes
// the answer.
//
// The combinations come from the registry, so adding a legacy mode extends the matrix without
// touching a single test.

import { legacyModeCombinations } from '../../../client/js/legacymoderegistry.js';

export const LEGACY_COMBINATIONS = legacyModeCombinations();

// Runs the callback once per combination. Use it around describe()/test() so each combination
// gets its own named test and a failure says which one.
export function forEachLegacy(callback) {
  for(const [ name, legacy ] of Object.entries(LEGACY_COMBINATIONS))
    callback({ name, legacy });
}

// The two cheapest tiers on their own, for cases that are slow enough that the full matrix
// isn't worth it: all modes off (what the project wants) and all modes on (proves the legacy
// branches still execute at all).
export function forEachLegacyTier01(callback) {
  for(const name of [ 'modern', 'legacy-all' ])
    callback({ name, legacy: LEGACY_COMBINATIONS[name] });
}
