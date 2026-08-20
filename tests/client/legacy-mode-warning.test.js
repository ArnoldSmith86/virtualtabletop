import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { LEGACY_MODES } from '../../client/js/legacymoderegistry.js';

// The editor files are plain scripts that get concatenated by server/minify.mjs, so evaluate the
// source with the few things it reaches for outside itself handed in.
const dir = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(dir, '../../client/js/editor/legacyModeWarning.js'), 'utf8');

let currentModes = {};
let confirmAnswer = true;
let confirmMessage = null;

const warning = new Function('LEGACY_MODES', 'legacyMode', 'html', 'confirm', `${source}
  return { currentLegacyModes, legacyModeDifferences, legacyModeWarningHTML, confirmLegacyModeDifferences };
`)(
  LEGACY_MODES,
  name=>currentModes[name],
  value=>String(value),
  message=>{ confirmMessage = message; return confirmAnswer; }
);

// a widget of a kind every mode's detect() ignores, so a test only sees the modes it sets up
const plainButton = [ { id: 'b', type: 'button', text: 'click me' } ];
// disableHolderImageWidget looks for a holder that draws something itself
const decoratedHolder = [ { id: 'h', type: 'holder', image: '/i/box.svg' } ];

beforeEach(() => {
  currentModes = {};
  confirmAnswer = true;
  confirmMessage = null;
});

describe('the legacy modes recorded next to travelling widgets', () => {
  test('records every known mode as a boolean, whether or not the game carries it', () => {
    currentModes = { disableHolderImageWidget: true };
    const snapshot = warning.currentLegacyModes();
    expect(Object.keys(snapshot).sort()).toEqual(Object.keys(LEGACY_MODES).sort());
    expect(snapshot.disableHolderImageWidget).toBe(true);
    expect(snapshot.useIframeForHtmlCards).toBe(false);
  });
});

describe('which legacy modes a paste is warned about', () => {
  test('says nothing without a snapshot - widgets saved before the modes were recorded', () => {
    currentModes = { disableHolderImageWidget: true };
    expect(warning.legacyModeDifferences(null, decoratedHolder)).toEqual([]);
    expect(warning.legacyModeDifferences(undefined, decoratedHolder)).toEqual([]);
  });

  test('says nothing when the two games agree', () => {
    currentModes = { disableHolderImageWidget: true };
    expect(warning.legacyModeDifferences(warning.currentLegacyModes(), decoratedHolder)).toEqual([]);
  });

  test('names a differing mode and which side it was on', () => {
    currentModes = { disableHolderImageWidget: true };
    const sourceModes = warning.currentLegacyModes();
    currentModes = {};
    expect(warning.legacyModeDifferences(sourceModes, decoratedHolder)).toEqual([
      { label: LEGACY_MODES.disableHolderImageWidget.label, inSource: true }
    ]);
  });

  test('names the difference the other way round as well', () => {
    const sourceModes = warning.currentLegacyModes();
    currentModes = { disableHolderImageWidget: true };
    expect(warning.legacyModeDifferences(sourceModes, decoratedHolder)).toEqual([
      { label: LEGACY_MODES.disableHolderImageWidget.label, inSource: false }
    ]);
  });

  test('skips a mode the snapshot does not mention - a mode added after it was written', () => {
    // a game that predates a mode ran the old behavior, which is what the mode being on means,
    // so guessing "off" here would warn in the wrong direction and stay silent for the real case
    currentModes = { disableHolderImageWidget: true };
    expect(warning.legacyModeDifferences({ useIframeForHtmlCards: false }, decoratedHolder)).toEqual([]);
  });

  test('skips a differing mode that cannot reach the widgets being pasted', () => {
    currentModes = { disableHolderImageWidget: true };
    const sourceModes = warning.currentLegacyModes();
    currentModes = {};
    expect(warning.legacyModeDifferences(sourceModes, plainButton)).toEqual([]);
    expect(warning.legacyModeDifferences(sourceModes, [])).toEqual([]);
  });
});

describe('how the difference is put to the user', () => {
  const difference = { label: 'Disable holder image support', inSource: true };

  test('the panel names both sides and stays away when there is nothing to say', () => {
    const html = warning.legacyModeWarningHTML([ difference ]);
    expect(html).toContain('Disable holder image support: on in the source game, off here');
    expect(warning.legacyModeWarningHTML([])).toBe('');
  });

  test('adding across a difference asks first and can be aborted', () => {
    confirmAnswer = false;
    expect(warning.confirmLegacyModeDifferences([ difference ])).toBe(false);
    expect(confirmMessage).toContain('Disable holder image support: on in the source game, off here');
  });

  test('adding without a difference does not ask at all', () => {
    confirmAnswer = false;
    expect(warning.confirmLegacyModeDifferences([])).toBe(true);
    expect(confirmMessage).toBe(null);
  });
});
