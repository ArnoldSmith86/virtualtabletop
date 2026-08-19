// Features the client uses that are newer than the browsers in the browserslist key of
// package.json, and that are fine to use anyway wherever they appear - because a browser that
// does not have them ignores them and only loses the improvement they make.
//
// This is the wide brush. A feature that is only safe in one particular place, because of
// something written next to it, belongs at that place instead:
//
//   /* compat-fallback css.properties.overflow.clip: the overflow: hidden above covers it */
//
// Every entry has to keep excusing something: once nothing in the client uses the feature
// anymore, the check reports the entry and it goes. Same rule as for the markers - the list
// stays a description of the client rather than a wish list.

export default [
  {
    feature: 'css.properties.cursor',
    reason: 'a cursor keyword only ever changes the shape of a pointer; a browser driven by a finger has none and ignores it'
  },
  {
    feature: 'css.properties.resize',
    reason: 'iOS has no resize handles at all, so nothing there is resizable with or without the declaration'
  },
  {
    feature: 'css.selectors.selection',
    reason: 'the colours of a text selection; without the rule the browser paints its own'
  },
  {
    feature: 'css.selectors.focus-visible',
    reason: 'our own focus ring; a browser that drops the rule (with the :hover half of the group, where there is one) still draws the default outline it always did'
  },
  {
    feature: 'css.properties.accent-color',
    reason: 'tints checkboxes and radio buttons; without it they are the browser default blue'
  },
  {
    feature: 'css.properties.color-scheme',
    reason: 'asks for dark form controls and scrollbars; without it they stay light while everything around them is already styled by us'
  },
  {
    feature: 'css.properties.scrollbar-width',
    reason: 'thin or hidden scrollbars; without it the scrollbar keeps its normal width, which costs a few pixels and nothing else'
  },
  {
    feature: 'css.properties.overflow-anchor',
    reason: 'turns scroll anchoring off; a browser without scroll anchoring has nothing to turn off'
  },
  {
    feature: 'css.properties.overflow-wrap.anywhere',
    reason: 'breaks a word with no break opportunity in it; without it such a word overflows its box instead, which is ugly rather than broken'
  },
  {
    feature: 'css.properties.speak',
    reason: 'keeps screen readers from reading out the ligature names of icon glyphs; nothing visual depends on it'
  },
  {
    feature: 'css.selectors.fullscreen',
    reason: 'swaps the icon of the fullscreen button while fullscreen is on; the button itself works either way through its webkit branch in main.js'
  },
  {
    feature: 'css.at-rules.container',
    reason: 'client/js/containerQueryFallback.js reads the @container blocks out of the stylesheet text and applies them by hand on browsers that dropped them'
  },
  {
    feature: 'css.properties.container',
    reason: 'names the query container for the @container blocks, which containerQueryFallback.js resolves itself on browsers without container queries'
  },
  {
    feature: 'css.types.length.container_query_length_units',
    reason: 'a length relative to the query container, only ever used inside an @container block that containerQueryFallback.js already stands in for'
  }
];
