import { $, onLoad } from './domhelpers.js';

// Languages selectable in the players tab. Adding a language only requires a
// new dictionary in client/i18n/<code>.json and an entry here.
const availableLanguages = {
  'en':    'English',
  'de':    'Deutsch',
  'pt-BR': 'Português (Brasil)'
};

function detectLanguage() {
  if(typeof localStorage == 'undefined' || typeof navigator == 'undefined')
    return 'en';

  const stored = localStorage.getItem('language');
  if(stored && availableLanguages[stored])
    return stored;

  for(const preferred of navigator.languages || [ navigator.language ]) {
    const lower = String(preferred).toLowerCase();
    const exact = Object.keys(availableLanguages).find(l=>l.toLowerCase() == lower);
    if(exact)
      return exact;
    const partial = Object.keys(availableLanguages).find(l=>l.toLowerCase().split('-')[0] == lower.split('-')[0]);
    if(partial)
      return partial;
  }
  return 'en';
}

const language = detectLanguage();
let dictionary = {};

// room.html is statically served and identical for every language, so the
// dictionary is fetched as a static file and applied client-side.
const dictionaryLoaded = language == 'en' || typeof fetch == 'undefined'
  ? Promise.resolve()
  : fetch(`${config.urlPrefix || ''}/i18n/${language}.json`).then(r=>r.json()).then(d=>dictionary=d).catch(_=>{});

export function getLanguage() {
  return language;
}

export function translate(text) {
  return dictionary[text] || text;
}

// --- Game translation: language-suffixed properties -------------------------
// Games (unlike the static UI) are translated by the game author: any widget
// property or game-metadata field may carry a language suffix, e.g. `label:de`
// or `description:pt-BR`. When the suffix matches the currently selected UI
// language the suffixed value overrides the unsuffixed one, so a single game
// can be translated without duplicating it per language. The resolution happens
// locally on read, so the shared room state is never modified (two players may
// look at the same game in different languages).
//
// This is a PRESENTATION feature: the override is resolved per client on read,
// so it must only be used for content that is *displayed* (labels, text, images,
// positions, css, …). A routine must not depend on a language-suffixed property
// for game logic — it should read the base (unsuffixed) property, otherwise two
// players with different languages would compute different results from the same
// shared state. Structural/identity properties (see below) are therefore never
// localized so hierarchy and links stay language-independent no matter what.

// Only a `base:suffix` key whose suffix looks like a BCP-47 language tag is
// treated as a translation, so ordinary property names are never misinterpreted.
const languageSuffixRegex = /^(.+):([a-z]{2,3}(?:-[a-z0-9]+)*)$/i;

// Properties that define a widget's identity, type or place in the hierarchy are
// never localized: a per-language override of these would re-link or re-type
// widgets and desync the shared state. (Mirrors the non-inheritable set in
// statemanaged.js.)
const nonLocalizableProperties = new Set([ 'id', 'type', 'parent', 'deck', 'cardType' ]);

// Does a key look like a language-suffixed property (regardless of which
// language)? Used to decide cheaply whether overrides need recomputing.
export function isLanguageSuffixedKey(key) {
  return languageSuffixRegex.test(key);
}

// How well a property-name language suffix matches the selected language.
// Returns 0 for no match; higher scores win when several suffixes are present.
function languageSuffixScore(suffix) {
  const lang = language.toLowerCase();
  suffix = suffix.toLowerCase();
  if(suffix == lang)
    return 3;                                        // exact tag, e.g. pt-BR
  if(suffix == lang.split('-')[0] || lang == suffix.split('-')[0])
    return 2;                                        // primary subtag, e.g. de vs de-DE
  if(suffix.split('-')[0] == lang.split('-')[0])
    return 1;                                        // same language, other region
  return 0;
}

// For an object with (possibly) language-suffixed keys, return a map of
// base-property -> overriding value for the currently selected language, or
// null when there are none (the common case, kept allocation-free).
export function languageOverrides(object) {
  let overrides = null;
  let scores = null;
  for(const key in object) {
    const match = key.match(languageSuffixRegex);
    if(!match)
      continue;
    const score = languageSuffixScore(match[2]);
    if(!score)
      continue;
    const base = match[1];
    if(nonLocalizableProperties.has(base))
      continue;
    if(!overrides)
      overrides = {}, scores = {};
    if(scores[base] === undefined || score > scores[base]) {
      scores[base] = score;
      overrides[base] = object[key];
    }
  }
  return overrides;
}

// Apply language overrides onto a metadata object in place (name, description,
// ruleText, …) so downstream code that reads the plain field names gets the
// translated value.
export function localizeMeta(object) {
  return object && Object.assign(object, languageOverrides(object));
}

const translatedAttributes = [ 'placeholder', 'title', 'aria-label', 'data-label', 'data-placeholder' ];

function skipTranslation(element) {
  // never touch game content: widgets in the room, game tiles and variants in the
  // library, the JSON editor surfaces and routine log, elements that display game
  // metadata (data-field) and anything marked with the standard translate="no"
  return element.id == 'room' || element.id == 'playerCursors'
      || element.id == 'jeText' || element.id == 'jeTextHighlight' || element.id == 'jeLog'
      || element.classList.contains('roomState') || element.classList.contains('variant')
      || element.hasAttribute('data-field') || element.getAttribute('translate') == 'no'
      || element.tagName == 'SCRIPT' || element.tagName == 'STYLE';
}

// nodes reported by the MutationObserver can be deep inside a skipped subtree,
// so their ancestors have to be checked as well
function insideSkippedSubtree(node) {
  for(let element = node.nodeType == Node.ELEMENT_NODE ? node : node.parentElement; element && element.tagName != 'BODY'; element = element.parentElement)
    if(skipTranslation(element))
      return true;
  return false;
}

function translateNode(node) {
  if(node.nodeType == Node.TEXT_NODE) {
    const trimmed = node.nodeValue.trim();
    if(trimmed && dictionary[trimmed]) {
      // options without a value attribute use their text as value and other code
      // compares against the English value, so materialize it before translating
      const parent = node.parentElement;
      if(parent && parent.tagName == 'OPTION' && !parent.hasAttribute('value'))
        parent.setAttribute('value', parent.value);
      node.nodeValue = node.nodeValue.replace(trimmed, _=>dictionary[trimmed]);
    }
    return;
  }

  if(node.nodeType != Node.ELEMENT_NODE || skipTranslation(node))
    return;

  for(const attribute of translatedAttributes) {
    const value = node.getAttribute(attribute);
    if(value && dictionary[value])
      node.setAttribute(attribute, dictionary[value]);
  }

  for(const child of [ ...node.childNodes ])
    translateNode(child);
  if(node.tagName == 'TEMPLATE')
    for(const child of [ ...node.content.childNodes ])
      translateNode(child);
}

// also translates DOM that is created after the page loaded, like the editor
export function translateSubtree(root) {
  if(language != 'en')
    dictionaryLoaded.then(_=>translateNode(root));
}

// translates a container whose contents get (re)created at runtime, like the
// editor sidebar modules
export function translateOnChange(root) {
  if(language == 'en')
    return;
  dictionaryLoaded.then(function() {
    translateNode(root);
    new MutationObserver(function(mutations) {
      for(const mutation of mutations)
        for(const node of mutation.addedNodes)
          if(!insideSkippedSubtree(node))
            translateNode(node);
    }).observe(root, { childList: true, subtree: true });
  });
}

function translateDOM() {
  document.documentElement.lang = language;
  if(language != 'en')
    translateNode(document.body);
}

function initLanguageSelection() {
  const select = $('#languageSelect');
  if(!select)
    return;
  for(const [ code, name ] of Object.entries(availableLanguages)) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    option.selected = code == language;
    select.appendChild(option);
  }
  select.addEventListener('change', function() {
    localStorage.setItem('language', select.value);
    location.reload();
  });
}

// this module is also imported from Node (tests share domhelpers.js), so only
// register the DOM translation in an actual browser
if(typeof window != 'undefined')
  onLoad(function() {
    dictionaryLoaded.then(function() {
      translateDOM();
      initLanguageSelection();
    });
  });
