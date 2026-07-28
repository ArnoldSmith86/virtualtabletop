// The single source of truth for legacy modes. Everything that needs to know about them
// derives from this object: the Game Settings sidebar (labels + descriptions), the file
// updater (detect + since) and the test matrix (interactsWith).
//
// Adding a legacy mode means adding one entry here - see docs/compat.md for the checklist.
//
// Fields:
//   since         - the file version that introduced the mode. The file updater enables the
//                   mode for every game saved before that version whose state matches detect().
//   pr            - the pull request that introduced the mode, linked from the sidebar.
//   interactsWith - other modes that share a code region with this one and can therefore
//                   influence each other's result. Drives the pairwise tier of the test
//                   matrix, so an omitted entry is a permanently untested combination.
//   detect        - given a complete state, true if the game might rely on the old behavior.
//                   Be conservative: a false positive keeps the old (working) behavior, a
//                   false negative breaks someone's game.
//   label         - the checkbox caption in the Game Settings sidebar.
//   description   - the HTML shown below the checkbox.
//
// This module is imported by the server (server/fileupdater.mjs) as well as by the client
// bundle, so it must stay free of browser globals.

export const LEGACY_MODES = {
  convertNumericVarParametersToNumbers: {
    since: 18,
    pr: 2581,
    interactsWith: [ 'useOneAsDefaultForVarParameters' ],
    detect: state => /"var |COMPUTE/.test(JSON.stringify(state)),
    label: 'Convert numeric var parameters to numbers',
    description: `
      <b>Problem</b>: Whenever you used a string in a var expression that consisted of only digits, it was converted to a number.
      <br><br>
      A common pitfall was storing a widget <code>id</code> in an array and later trying to <code>SELECT</code> it using the stored <code>id</code>. Because <code>id</code>s are randomly generated alphanumeric strings, this would fail for some unlucky widgets that received an all numeric <code>id</code>.
      <br><br>
      <b>Example:</b>
      <br>
      <code>var a = []</code>
      <br>
      <code>var a = push '1'</code>
      <br><br>
      <b>Old result</b>: <code>[1]</code><br>
      <b>New result</b>: <code>['1']</code>
      `
  },
  useOneAsDefaultForVarParameters: {
    since: 18,
    pr: 2581,
    interactsWith: [ 'convertNumericVarParametersToNumbers' ],
    detect: state => /"var |COMPUTE/.test(JSON.stringify(state)),
    label: 'Use 1 as default for var parameters',
    description: `
      <b>Problem</b>: When you called a function in a var expression, every parameter not provided was set to <code>1</code>.
      <br><br>
      <b>Example:</b>
      <br>
      <code>var a = +</code>
      <br><br>
      <b>Old result</b>: <code>2</code><br>
      <b>New result</b>: <code>0</code> and an error message
      `
  },
  useIframeForHtmlCards: {
    since: 19,
    pr: 2729,
    interactsWith: [],
    detect: function(state) {
      for(const widget of Object.values(state))
        if(widget && widget.type == 'deck' && Array.isArray(widget.faceTemplates))
          for(const face of widget.faceTemplates)
            if(face && Array.isArray(face.objects))
              for(const object of face.objects)
                if(object && object.type == 'html')
                  return true;
      return false;
    },
    label: 'Use iframes for card face HTML objects',
    description: `
      <b>Legacy Behavior</b>: Card face objects with <code>type: 'html'</code> are rendered in an iframe. This behavior is used for older games and can be enabled by checking this box.
      <br><br>
      <b>Default Behavior</b>: These objects are rendered directly into the DOM which should be faster and easier to work with. This is the default for new games and is used when this box is unchecked.
      `
  },
  disableHolderImageWidget: {
    since: 21,
    pr: 2634,
    interactsWith: [],
    detect: function(state) {
      for(const id in state) {
        const properties = state[id];
        if(properties && properties.type == 'holder')
          if(properties.image || properties.icon || properties.text || properties.textColor || properties.color || properties.svgReplaces)
            return true;
      }
      return false;
    },
    label: 'Disable holder image support',
    description: `
      <b>Problem</b>: Holders now support image, icon, and text properties natively, but some games manually implemented this functionality before it was supported and may break with the new behavior.
      <br><br>
      <b>Old behavior</b>: Holders did not natively support image/icon/text properties, requiring manual workarounds.<br>
      <b>New behavior</b>: Holders support image, icon, and text properties directly.
      <br><br>
      This legacy mode disables the native image/icon/text support for holders, restoring the old behavior.
      `
  }
};

export const ALL_LEGACY_MODES = Object.keys(LEGACY_MODES);

// The combinations the test matrix runs. Linear in the number of modes (T0 + T1 + one-hot)
// plus one entry per declared interaction, so adding a mode never doubles the work.
export function legacyModeCombinations() {
  const combinations = { modern: {}, 'legacy-all': {} };
  for(const name of ALL_LEGACY_MODES)
    combinations['legacy-all'][name] = true;
  for(const name of ALL_LEGACY_MODES)
    combinations[`only-${name}`] = { [name]: true };

  const seen = new Set();
  for(const name of ALL_LEGACY_MODES) {
    for(const other of LEGACY_MODES[name].interactsWith) {
      const key = [ name, other ].sort().join('+');
      if(LEGACY_MODES[other] && !seen.has(key)) {
        seen.add(key);
        combinations[`pair-${key}`] = { [name]: true, [other]: true };
      }
    }
  }
  return combinations;
}

// A combination with every mode listed explicitly, so callers can set the false ones too
// instead of leaking whatever the previous caller turned on.
export function fullLegacyCombination(combination) {
  const result = {};
  for(const name of ALL_LEGACY_MODES)
    result[name] = !!(combination || {})[name];
  return result;
}
