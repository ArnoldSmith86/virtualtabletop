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

// One wording for the panel, the badge tooltip and the confirmation, so that they cannot drift
// apart. "where these widgets were copied from" rather than "the source game" because the game
// they were copied from may well be one the reader can no longer name.
const legacyModeWarningHeading = 'These widgets were saved in a game with different legacy modes:';
const legacyModeWarningExplanation = 'Legacy modes change how widgets behave, so these widgets can work differently here. Check them after adding, or switch the mode on under Game settings.';

function legacyModeDifferenceText(difference) {
  return `${difference.label}: ${difference.inSource ? 'on' : 'off'} where these widgets were copied from, ${difference.inSource ? 'off' : 'on'} in this game`;
}

function legacyModeWarningText(differences) {
  const list = differences.map(difference=>`  ${legacyModeDifferenceText(difference)}`).join('\n');
  return `${legacyModeWarningHeading}\n\n${list}\n\n${legacyModeWarningExplanation}`;
}

function legacyModeWarningHTML(differences) {
  if(!differences.length)
    return '';
  let list = '';
  for(const difference of differences)
    list += `<li>${html(legacyModeDifferenceText(difference))}</li>`;
  return `<div class="settings-tile legacyModeWarning">
    <div class=legacyModeWarningHeader>${html(legacyModeWarningHeading)}</div>
    <ul>${list}</ul>
    <p>${html(legacyModeWarningExplanation)}</p>
  </div>`;
}

// the badge the widget library puts on an entry that was saved elsewhere, so the reader sees it
// before clicking or dragging rather than only in the dialog afterwards
const legacyModeWarningBadgeSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" class="legacyModeMismatch" fill="currentColor"><path d="M109-120q-11 0-20-5.5T75-140q-5-9-5.5-19.5T75-180l371-640q6-10 15.5-15t19.5-5q10 0 19.5 5t15.5 15l371 640q6 10 5.5 20.5T887-140q-5 9-14 14.5t-20 5.5H109Zm71-80h600L480-720 180-200Zm300-45q17 0 28.5-11.5T520-285q0-17-11.5-28.5T480-325q-17 0-28.5 11.5T440-285q0 17 11.5 28.5T480-245Zm-40-125h80v-200h-80v200Zm40-100Z"/></svg>';

// true if the widgets should be added anyway - adding across a difference is allowed, it just
// asks first.
async function confirmLegacyModeDifferences(differences) {
  if(!differences.length)
    return true;
  return !!await confirmOverlay('Different legacy modes', legacyModeWarningText(differences), 'Add anyway', 'Cancel', 'warning', 'close');
}
