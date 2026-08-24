// The single source of truth for legacy modes. Everything that needs to know about them
// derives from this object: the Game Settings sidebar (labels + descriptions), the file
// updater (detect + since) and the test matrix (interactsWith).
//
// Adding a legacy mode means adding one entry below and calling legacyMode('yourModeName') at
// the code site whose behavior it switches. The sidebar checkbox, the classification of older
// saves and the test matrix all follow from the entry; nothing else needs to know the name.
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
//   summary       - one line, shown below the checkbox. What changed, in the fewest words.
//   description   - the HTML shown when the reader opens the tile's Details disclosure. Keep
//                   the vocabulary of the existing entries (Old behavior / New behavior /
//                   Example) so the panel reads as one document.
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
    summary: 'Strings that consist of only digits become numbers in var expressions.',
    description: `
      <b>Old behavior</b>: Whenever you used a string in a var expression that consisted of only digits, it was converted to a number.
      <br><br>
      <b>New behavior</b>: Such a string stays a string.
      <br><br>
      <b>Example:</b>
      <br>
      <code>var a = []</code>
      <br>
      <code>var a = push '1'</code>
      <br><br>
      Old result: <code>[1]</code><br>
      New result: <code>['1']</code>
      <br><br>
      A common pitfall was storing a widget <code>id</code> in an array and later trying to <code>SELECT</code> it using the stored <code>id</code>. Because <code>id</code>s are randomly generated alphanumeric strings, this would fail for some unlucky widgets that received an all numeric <code>id</code>.
      `
  },
  useOneAsDefaultForVarParameters: {
    since: 18,
    pr: 2581,
    interactsWith: [ 'convertNumericVarParametersToNumbers' ],
    detect: state => /"var |COMPUTE/.test(JSON.stringify(state)),
    label: 'Use 1 as default for var parameters',
    summary: 'Parameters you leave out of a var function call default to 1.',
    description: `
      <b>Old behavior</b>: When you called a function in a var expression, every parameter not provided was set to <code>1</code>.
      <br><br>
      <b>New behavior</b>: A missing parameter is left empty and reported as an error.
      <br><br>
      <b>Example:</b>
      <br>
      <code>var a = +</code>
      <br><br>
      Old result: <code>2</code><br>
      New result: <code>0</code> and an error message
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
    summary: 'HTML objects on card faces are rendered inside an iframe.',
    description: `
      <b>Old behavior</b>: Card face objects with <code>type: 'html'</code> are rendered in an iframe, which isolates their CSS but is slower.
      <br><br>
      <b>New behavior</b>: These objects are rendered directly into the DOM, which is faster and easier to work with. This is the default for new games.
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
    summary: 'Holders ignore their image, icon and text properties.',
    description: `
      <b>Old behavior</b>: Holders did not display image, icon or text properties themselves, so games that wanted them built the look out of other widgets.
      <br><br>
      <b>New behavior</b>: Holders display image, icon and text properties directly. Games that built those manual workarounds can look broken because both are drawn at once.
      <br><br>
      This legacy mode disables the native image/icon/text support for holders, restoring the old behavior.
      `
  },
  classicHolderLayout: {
    since: 24,
    pr: 3117,
    interactsWith: [],
    detect: function(state) {
      // a holder that spells its layout out behaves the same with or without the mode,
      // so only holders that would fall back to the default are affected
      for(const id in state)
        if(state[id] && state[id].type == 'holder' && state[id].layout === undefined)
          return true;
      return false;
    },
    label: 'Classic holder layout',
    summary: "Holders without a layout property keep piling cards up at the drop offset instead of arranging them automatically.",
    description: `
      <b>Old behavior</b>: A holder without any arrangement properties stacks everything at its drop offset, in its top left corner.
      <br><br>
      <b>New behavior</b>: A holder defaults to <code>layout: 'auto'</code>: it centers its cards and, when it is large enough, spreads them out and wraps them into rows on its own. Setting any of the classic arrangement properties (or another <code>layout</code>) switches that off per holder.
      <br><br>
      This legacy mode keeps the classic default (<code>layout: 'custom'</code>) for every holder of this game that does not say otherwise.
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
