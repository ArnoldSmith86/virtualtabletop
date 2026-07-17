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

const translatedAttributes = [ 'placeholder', 'title', 'aria-label', 'data-label', 'data-placeholder' ];

function skipTranslation(element) {
  // never touch game content: widgets in the room, game tiles and variants in the
  // library and elements that display game metadata (data-field)
  return element.id == 'room' || element.id == 'playerCursors'
      || element.classList.contains('roomState') || element.classList.contains('variant')
      || element.hasAttribute('data-field')
      || element.tagName == 'SCRIPT' || element.tagName == 'STYLE';
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
