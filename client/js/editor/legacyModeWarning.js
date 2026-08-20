// Legacy modes decide what widget JSON means: the same routine computes something else with
// convertNumericVarParametersToNumbers on, the same holder draws something else with
// disableHolderImageWidget on. Widget states that travel from one game into another - the
// toolbox widget buffer, the saved widget library - therefore carry a snapshot of the modes of
// the game they were taken from, so the game they end up in can say what the two disagree on.

function currentLegacyModes() {
  const modes = {};
  for(const name in LEGACY_MODES)
    modes[name] = !!legacyMode(name);
  return modes;
}

// The modes the source game and the current game disagree on, given the states that are about
// to travel. Two kinds of mode are left out on purpose:
//   - modes the snapshot does not mention at all, because a snapshot written before a mode
//     existed says nothing about it and unknown is not the same as different
//   - modes whose detect() finds nothing in the states themselves, because copying a plain
//     button out of a game with disableHolderImageWidget on cannot go wrong
function legacyModeDifferences(sourceModes, widgetStates) {
  if(!sourceModes || typeof sourceModes != 'object')
    return [];
  const state = {};
  for(const widgetState of widgetStates || [])
    state[widgetState.id] = widgetState;
  return Object.keys(LEGACY_MODES).filter(name=>{
    return name in sourceModes && !!sourceModes[name] != !!legacyMode(name) && LEGACY_MODES[name].detect(state);
  }).map(name=>({
    label: LEGACY_MODES[name].label,
    inSource: !!sourceModes[name]
  }));
}

// One wording for the panel and the confirmation, so that the two cannot drift apart.
function legacyModeDifferenceText(difference) {
  return `${difference.label}: ${difference.inSource ? 'on' : 'off'} in the source game, ${difference.inSource ? 'off' : 'on'} here`;
}

const legacyModeWarningExplanation = 'Legacy modes change how widgets behave, so the widgets can work differently in this game.';

function legacyModeWarningHTML(differences) {
  if(!differences.length)
    return '';
  let list = '';
  for(const difference of differences)
    list += `<li>${html(legacyModeDifferenceText(difference))}</li>`;
  return `<div class=legacyModeWarning>
    <b>These widgets come from a game with different legacy modes:</b>
    <ul>${list}</ul>
    ${legacyModeWarningExplanation}
  </div>`;
}

// true if the widgets should be added anyway - adding across a difference is allowed, it just
// asks first.
function confirmLegacyModeDifferences(differences) {
  if(!differences.length)
    return true;
  const list = differences.map(difference=>`  ${legacyModeDifferenceText(difference)}`).join('\n');
  return confirm(`These widgets were saved in a game with different legacy modes:\n\n${list}\n\n${legacyModeWarningExplanation}\n\nPress OK to add them anyway, or Cancel to abort.`);
}
