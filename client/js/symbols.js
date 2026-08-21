import { $, asArray } from "./domhelpers";
import { enableEmojiVariantFlyouts, closeEmojiVariantFlyout, collapseEmojiVariants, expandEmojiVariants, loadEmojiVariants } from "./emojivariants";

export function emojiToFilename(emoji) {
  return [...emoji].map(char => char.codePointAt(0).toString(16).padStart(4, '0')).join('_').replace(/_fe0f/g, '');
}

// The emoji as they appear in text, so that emojis2images() can swap them for their artwork.
// Kept next to the pickers: everything the pickers offer has to be recognized here as well.
const emojiRegex = /\ud83c\udff4(\udb40[\udc61-\udc7a])+\udb40\udc7f|(\ud83c[\udde6-\uddff]){2}|([\#\*0-9]\ufe0f?\u20e3)|(\u00a9|\u00ae|[\u203c\u2049\u20e3\u2122\u2139\u2194-\u2199\u21a9\u21aa\u231a\u231b\u2328\u23cf\u23e9-\u23fa\u24c2\u25aa\u25ab\u25b6\u25c0\u25fb-\u25fe\u2600-\u2604\u260e\u2611\u2614\u2615\u2618\u261d\u2620\u2622\u2623\u2626\u262a\u262e\u262f\u2638-\u263a\u2640\u2642\u2648-\u2653\u265f\u2660\u2663\u2665\u2666\u2668\u267b\u267e\u267f\u2692-\u2697\u2699\u269b\u269c\u26a0\u26a1\u26a7\u26aa\u26ab\u26b0\u26b1\u26bd\u26be\u26c4\u26c5\u26c8\u26ce\u26cf\u26d1\u26d3\u26d4\u26e9\u26ea\u26f0-\u26f5\u26f7-\u26fa\u26fd\u2702\u2705\u2708-\u270d\u270f\u2712\u2714\u2716\u271d\u2721\u2728\u2733\u2734\u2744\u2747\u274c\u274e\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27a1\u27b0\u27bf\u2934\u2935\u2b05-\u2b07\u2b1b\u2b1c\u2b50\u2b55\u3030\u303d\u3297\u3299]|\ud83c[\udc04\udccf\udd70\udd71\udd7e\udd7f\udd8e\udd91-\udd9a\udde6-\uddff\ude01\ude02\ude1a\ude2f\ude32-\ude3a\ude50\ude51\udf00-\udf21\udf24-\udf93\udf96\udf97\udf99-\udf9b\udf9e-\udff0\udff3-\udff5\udff7-\udfff]|\ud83d[\udc00-\udcfd\udcff-\udd3d\udd49-\udd4e\udd50-\udd67\udd6f\udd70\udd73-\udd7a\udd87\udd8a-\udd8d\udd90\udd95\udd96\udda4\udda5\udda8\uddb1\uddb2\uddbc\uddc2-\uddc4\uddd1-\uddd3\udddc-\uddde\udde1\udde3\udde8\uddef\uddf3\uddfa-\ude4f\ude80-\udec5\udecb-\uded2\uded5-\uded8\udedc-\udee5\udee9\udeeb\udeec\udef0\udef3-\udefc\udfe0-\udfeb\udff0]|\ud83e[\udd0c-\udd3a\udd3c-\udd45\udd47-\ude7c\ude80-\ude8a\ude8e\ude8f\ude90-\udec6\udec8\udecd-\udedc\udedf-\udeea\udeef\udef0-\udef8])((\ud83c[\udffb-\udfff])?(\ud83e[\uddb0-\uddb3])?(\ufe0f?\u200d([\u2000-\u3300]|[\ud83c-\ud83e][\ud000-\udfff])\ufe0f?)?)*/g;

function emojis2images(dom) {
  function replaceEmojisInNode(node) {
    // Skip nodes with the class "emoji-monochrome"
    if (node.classList && node.classList.contains('emoji-monochrome')) {
      return;
    }

    // Process text nodes only
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        const originalContent = html(child.textContent);
        const replacedContent = originalContent.replace(emojiRegex, m =>
          `<img class="emoji" src="i/noto-emoji/emoji_u${emojiToFilename(m)}.svg" alt="${m}">`
        );
        if(replacedContent != originalContent) {
          const span = document.createElement('span');
          span.innerHTML = replacedContent;
          child.replaceWith(span);
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        replaceEmojisInNode(child);  // Recurse into child elements
      }
    });
  }

  replaceEmojisInNode(dom);
}

function images2emojis(dom) {
  const regexpUnicodeModified = /<img class="emoji" src="[^"]*i\/noto-emoji\/emoji_u[0-9a-f_]+\.svg" alt="([^"]+)"[^>]*>/g;
  dom.innerHTML = dom.innerHTML.replace(regexpUnicodeModified, (m,g)=>g);
}

function replaceMaterialIcons(html) {
  return html.replace(/\b(material-icons(?:-(outlined|round|sharp|twotone))?)\b/g, "material-symbols");
}

function toNotoMonochrome(emoji) {
  return emoji
    .replace(/[\u{1f3fb}-\u{1f3ff}]/ug, '') // remove skin tone modifiers (they are not supported by Noto Emoji)
    .replace(/\u200d[\u2640\u2642]/, '')    // remove gender modifiers    (they are not supported by Noto Emoji)
    .replace(/\ufe0f/g, '')                 // remove variation selectors (they tell Firefox to use color emoji)
    .replace(/\u{1faf1}\u200d\u{1faf2}/ug,              '🤝')  // join variants of emojis that have
    .replace(/.*\u200d\u{1f91d}\u200d.*/ug,             '👭')  // two people interacting because
    .replace(/.*\u200d\u2764\u200d\u{1f48b}\u200d.*/ug, '💏')  // they have a special notation for
    .replace(/.*\u200d\u2764\u200d.*/ug,                '💑'); // skin and gender variants
}

// The emoji the bundled monochrome font cannot draw: it has no glyph for them, or no ligature
// for their ZWJ sequence, so a picker offering them would show an empty box.
function skipForNotoMonochrome(emoji) {
  return emoji.match(/^[\u{1f3c3}-\u{1f3cc}]\u{fe0f}?\u{200d}[\u{2640}\u{2642}]\u{fe0f}(\u{200d}\u{27a1}\u{fe0f})?|\u{1f468}|\u{1f468}\u{200d}[\u{1f33e}\u{1f373}\u{1f37c}\u{1f393}\u{1f3a4}\u{1f3a8}\u{1f3eb}\u{1f3ed}\u{1f4bb}\u{1f4bc}\u{1f527}\u{1f52c}\u{1f680}\u{1f692}\u{1f9af}\u{1f9b1}\u{1f9b2}\u{1f9bc}\u{1f9bd}]|\u{1f468}\u{200d}[\u{1f9af}\u{1f9bc}\u{1f9bd}]\u{200d}\u{27a1}\u{fe0f}|\u{1f468}\u{200d}[\u{2695}\u{2696}\u{2708}]\u{fe0f}|\u{1f468}\u{200d}\u{2764}\u{fe0f}\u{200d}(\u{1f468}|\u{1f48b}\u{200d}\u{1f468})|\u{1f469}\u{200d}[\u{1f33e}\u{1f373}\u{1f393}\u{1f3a4}\u{1f3a8}\u{1f3eb}\u{1f3ed}\u{1f4bb}\u{1f4bc}\u{1f527}\u{1f52c}\u{1f680}\u{1f692}\u{1f9af}-\u{1f9b3}\u{1f9bc}\u{1f9bd}]|\u{1f469}\u{200d}[\u{1f9af}\u{1f9bc}\u{1f9bd}]\u{200d}\u{27a1}\u{fe0f}|\u{1f469}\u{200d}[\u{2695}\u{2696}\u{2708}]\u{fe0f}|\u{1f469}\u{200d}\u{2764}\u{fe0f}\u{200d}(\u{1f48b}\u{200d})?[\u{1f468}\u{1f469}]|\u{1f46b}|\u{1f46c}|\u{200d}[\u{2640}\u{2642}]|\u{1f478}|\u{1f57a}|\u{1f934}|\u{1f936}|[\u{1f6d8}\u{1fa8a}\u{1fa8e}\u{1fac8}\u{1facd}\u{1faea}\u{1faef}]|\u{1f9d1}\u{200d}(\u{1f37c}|\u{1f384}|\u{1fa70}|\u{1f91d}\u{200d}\u{1f9d1})|\u{1fac3}|\u{1fac4}$/u);
}

// The emoji that are too new for the emoji font the operating system ships: the browser draws
// them as an empty box, so the picker previews them with the bundled artwork like it does the
// flags. They can be dropped from here once the systems catch up.
function tooNewForBrowserEmojiFont(emoji) {
  return emoji.match(/[\u{1f6d8}\u{1fa89}\u{1fa8a}\u{1fa8e}\u{1fa8f}\u{1fabe}\u{1fac6}\u{1fac8}\u{1facd}\u{1fadc}\u{1fadf}\u{1fae9}\u{1faea}\u{1faef}]|\u{1f9d1}\u{200d}\u{1fa70}/u);
}

// Icon search matching. Both icon pickers search the same way: the one below and the icon picker
// of the properties sidebar (client/js/editor/propertyInputs.js), which reaches these functions
// through the window exports of main.js.
//
// A search term matches the beginning of a word of the icon name, but only a whole word of its
// tags. The tags describe what an icon shows, so matching them anywhere in their text answers
// "bear" with a compass tagged "bearing", a razor tagged "beard" and an I-beam tagged "load
// bearing" - 19 of the 32 results had nothing to do with bears. Names keep matching from the
// start of a word so that typing "swor" still finds the swords while nothing is complete yet.
// Whole words are matched in either number: the file name of an icon says "horse" or "knives",
// its tags say whichever reads naturally, and a search for the other one has to find it anyway.

// The tags are US English (the same list normalized the generated ones), so "defence" was a dead
// end while 178 icons are tagged "defense". Both directions, because a few file names are British
// instead: "saber" has to find lorc/crossed-sabres and "tire" lorc/tyre.
const iconSearchSpellings = {};
for(const [ british, american ] of Object.entries({
  defence:'defense', defences:'defenses', armour:'armor', armours:'armors', armoured:'armored',
  armourer:'armorer', honour:'honor', honours:'honors', honoured:'honored', jewellery:'jewelry',
  jewellers:'jewelers', jewelled:'jeweled', harbour:'harbor', labour:'labor', theatre:'theater',
  centre:'center', centres:'centers', colour:'color', colours:'colors', coloured:'colored',
  fibre:'fiber', fibres:'fibers', sceptre:'scepter', vapour:'vapor', vapours:'vapors',
  flavour:'flavor', flavours:'flavors', traveller:'traveler', travellers:'travelers',
  plough:'plow', mould:'mold', moulded:'molded', moulding:'molding', sabre:'saber',
  sabres:'sabers', manoeuvre:'maneuver', manoeuvres:'maneuvers', litre:'liter', litres:'liters',
  aluminium:'aluminum', grey:'gray', greyish:'grayish', neighbour:'neighbor', savour:'savor',
  aeroplane:'airplane', artefact:'artifact', artefacts:'artifacts', behaviour:'behavior',
  marvellous:'marvelous', counsellor:'counselor', rumour:'rumor', metre:'meter', metres:'meters',
  moustache:'mustache', pyjamas:'pajamas', storey:'story', tyre:'tire', tyres:'tires',
  kerb:'curb', sulphur:'sulfur', draught:'draft', gaol:'jail', pretence:'pretense',
  offence:'offense', licence:'license', practise:'practice', analyse:'analyze', paralyse:'paralyze'
})) {
  iconSearchSpellings[british] = american;
  iconSearchSpellings[american] = british;
}

// Accents are dropped rather than split on: the tags spell it "epee", while "épée" used to become
// the two prefixes "p" and "e" and answered with a pelican, an elbow pad and a printer.
function iconSearchWords(text) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(word => word);
}

function iconSearchEntry(name, keywords) {
  return {
    name: iconSearchWords(name),
    tags: new Set(iconSearchWords(keywords.join(' '))),
    // the fallback in iconSearchScores matches anywhere in here, including the de-hyphenated name
    text: `${name},${name.replace(/[-_]/g, ' ')},${keywords.join()}`.toLowerCase()
  };
}

// Words that end in an "s" that is not a plural one: dropping it made "news" a search for "new"
// and answered with newborns, sprouts and champagne. The double-s words ("cross", "compass") need
// no list, the rule below never strips an "s" that follows another one.
const iconSearchNotPlural = new Set([
  'news', 'lens', 'bus', 'gas', 'plus', 'minus', 'focus', 'status', 'virus', 'circus', 'canvas',
  'atlas', 'chaos', 'cosmos', 'iris', 'axis', 'oasis', 'basis', 'crisis', 'tennis', 'physics',
  'mathematics', 'politics', 'economics', 'statistics', 'mechanics', 'electronics', 'ethics',
  'species', 'series', 'goods', 'pants', 'jeans', 'shorts', 'scissors', 'pliers', 'tongs'
]);

// The plurals an "s" cannot make. Registered in both directions like the spellings above: a file
// name carries one number only ("lorc/kitchen-knives", "delapouite/wolf-head"), and so does a tag.
const iconSearchIrregularPlurals = {};
for(const [ singular, plural ] of Object.entries({
  knife:'knives', life:'lives', wife:'wives', leaf:'leaves', loaf:'loaves', half:'halves',
  calf:'calves', shelf:'shelves', wolf:'wolves', elf:'elves', dwarf:'dwarves', thief:'thieves',
  hoof:'hooves', staff:'staves', die:'dice', foot:'feet', tooth:'teeth', goose:'geese',
  mouse:'mice', louse:'lice', man:'men', woman:'women', child:'children', person:'people',
  ox:'oxen', cactus:'cacti', fungus:'fungi'
})) {
  iconSearchIrregularPlurals[singular] = plural;
  iconSearchIrregularPlurals[plural] = singular;
}

// What one term of a query stands for: the forms of it that mean the same thing to the search,
// and the words it may match the beginning of. Tags and file names are each written in whichever
// number reads naturally - "lorc/kitchen-knives", "delapouite/horse-head", a tag "cards" - so
// both directions have to be covered, and the name has to be covered too: an icon named "horse"
// is not tagged "horse" (a tag may not repeat a word of the name), so matching plurals in the
// tags alone lost it. An "es" plural can be either the word without its "s" or the word without
// its "es" - "horses" is a horse, "crosses" is a cross - so both are offered; every form is
// matched whole, so the one that is not a word ("hors") finds nothing rather than horseshoes,
// which is what replacing the term by it used to do.
function iconSearchTerm(term) {
  const prefixes = [ term ];
  if(iconSearchSpellings[term])
    prefixes.push(iconSearchSpellings[term]);
  const forms = new Set();
  for(const word of prefixes) {
    forms.add(word).add(`${word}s`).add(`${word}es`);
    if(iconSearchIrregularPlurals[word])
      forms.add(iconSearchIrregularPlurals[word]);
    if(/[^s]s$/.test(word) && !iconSearchNotPlural.has(word)) {
      forms.add(word.slice(0, -1)); // horses -> horse, cards -> card
      if(/es$/.test(word))
        forms.add(word.slice(0, -2)); // crosses -> cross, boxes -> box, torches -> torch
    }
  }
  return { prefixes, forms: [ ...forms ] };
}

// What the tags of an icon say it shows, for its tooltip: nothing else tells a user that the
// search knows an icon as "first aid" or "trick taking". Read back out of entry.text (see
// iconSearchEntry above) rather than kept a second time - there are 14000 of these.
function iconSearchTagText(entry) {
  return entry.text.split(',').slice(2).filter(tag => tag).join(', ');
}

// 3 for a whole word of the name, 2 for the beginning of one, 1 for a tag, 0 for no match at all:
// an icon that is called what was typed comes before one that is only described that way, so
// "dragon" leads with the dragons instead of with the dragonfly and the fish scales.
function iconSearchTermScore(entry, term) {
  return term.forms.some(form => entry.name.includes(form)) ? 3
    : term.prefixes.some(prefix => entry.name.some(word => word.startsWith(prefix))) ? 2
    : term.forms.some(form => entry.tags.has(form)) ? 1 : 0;
}

// The icon that is called exactly what was typed and nothing else: as many words in the name as
// there are in the query, each of them one of the forms its term stands for. The forms rather than
// the literal query, so that the number and the spelling of what was typed matter as little here
// as they do everywhere else - "souls" and "sabre" lead with the same icon as "soul" and "saber".
function iconSearchExactName(entry, terms) {
  return entry.name.length == terms.length && terms.every((term, i) => term.forms.includes(entry.name[i]));
}

// An entry has to match every term and is worth as much as its weakest one.
function iconSearchScore(entry, terms) {
  let score = 3;
  for(const term of terms) {
    const termScore = iconSearchTermScore(entry, term);
    if(!termScore)
      return 0;
    score = Math.min(score, termScore);
  }
  return score;
}

// On top of the per-term score: 5 for an icon that IS called what was typed, 4 for one whose name
// begins with it. A word like "star" is in the name of 60 icons and a tag of 400 more, so without
// this the icon actually called "star" sits somewhere in the middle of them. The name is compared
// as its words joined by spaces - "arrow_back" and the game-icons "lorc/arrow-back" both read
// "arrow back", which is the spelling Google's own icon site uses and the natural way to type it.
// The 5 goes through iconSearchExactName rather than that spelling, so that the number and the
// spelling of what was typed matter as little here as they do everywhere else - "souls" and
// "sabre" lead with the same icon as "soul" and "saber"; the 4 stays literal, since a prefix of a
// longer name has no term of its own to offer a form of.
// Only entries that matched at all are offered the bonus, so it can never resurrect a non-match.
function iconSearchNameScore(entry, terms, spelledOutQuery) {
  return iconSearchExactName(entry, terms) ? 5
    : entry.name.join(' ').startsWith(`${spelledOutQuery} `) ? 4 : 0;
}

// Scores a whole list of search entries against one query: 0 for the entries that do not match,
// 1 to 5 for the ones that do. Both pickers rank by it, which is what makes them agree on what a
// query means - the sidebar sorts its result list, the picker below lays its matches out in the
// CSS orders of their score because its list is built once and only filtered afterwards.
function iconSearchScores(entries, query) {
  if(!query.trim())
    return entries.map(_=>1);
  const words = iconSearchWords(query);
  const spelledOutQuery = words.join(' '); // what an icon would have to be called to be an exact hit
  const terms = words.map(iconSearchTerm);
  const scores = terms.length ? entries.map(entry => {
    const score = iconSearchScore(entry, terms);
    return score ? Math.max(score, iconSearchNameScore(entry, terms, spelledOutQuery)) : 0;
  }) : [];
  if(scores.some(score => score))
    return scores;
  // a half typed tag ("cthulh") or a pasted emoji has no word to match, so rather than showing an
  // empty picker, fall back to the old "appears anywhere in the name or the tags". A query with no
  // letter of the tags' alphabet at all ("меч", "???") leaves no term either, and every entry
  // matching no term used to unhide all 14000 icons - it takes the same fallback now and ends up
  // in the honest "no results" state when that finds nothing either.
  const looseTerms = query.toLowerCase().split(/\s+/).filter(term => term);
  return entries.map(entry => looseTerms.every(term => entry.text.includes(term)) ? 1 : 0);
}

// Both pickers use these, so that they also say the same thing: the search finds an icon by what
// it shows and not only by its file name, which none of the three file names of the old
// placeholder ("sword, heart, dice") told anyone.
const iconSearchPlaceholder = 'Search by name or by what the icon shows (first aid, cthulhu, …)';
// the tags are single, common English words, so a search that finds nothing is usually a phrase,
// a rare synonym or a spelling they do not use
const iconSearchNoResultsHint = 'Try a shorter or more common word.';

// The name the skin tone flyout says a set of forms belongs to. The elements carry no keywords (see
// buildSymbolPicker), so it is read out of the icon's search entry: entry.text is the symbol, the
// symbol with its separators spelled out, and then its keywords - the first of which is the name.
function symbolName(icon) {
  const entry = entryOfIcon.get(icon);
  return entry ? (entry.text.split(',')[2] || '').replace(/_/g, ' ') : '';
}

// How long the list may get for the skin tones to be put into it instead of behind a hover of their
// own: a search this narrow is a handful of rows, and a flyout per icon is then more work to open
// than the whole result is to read. It fits the largest set an icon has (a 5x5 matrix is 25 forms)
// twice over, so the single icon a search is often meant to find always shows what it offers.
const inlineVariantLimit = 50;

// A toned form put into the grid is a copy of the icon it belongs to - same category, same family,
// same CSS order and big-preview state - so the picker's own click handling and its previews treat
// it as one of its icons. Only what it shows and what it stands for differ.
function inlineVariantIcon(icon, variant, description) {
  const inline = icon.cloneNode(false);
  inline.classList.remove('hasEmojiVariants');
  inline.dataset.symbol = variant;
  inline.textContent = variant;
  inline.title = `${icon.dataset.type}: ${variant} (${description})`;
  inline.style.setProperty('--url', `url('i/noto-emoji/emoji_u${emojiToFilename(variant)}.svg')`);
  return inline;
}

// pickSymbol() binds its click handlers to the entries right after awaiting this, so a second caller
// must not resume while the first one is still fetching: the list would still be the "Loading..."
// card and the icons that arrive afterwards would never become clickable. Everybody awaits the same
// promise instead - including the unawaited preload of addRichtextControls().
let symbolPickerPromise = null;
export function loadSymbolPicker() {
  if(!symbolPickerPromise) {
    symbolPickerPromise = buildSymbolPicker();
    symbolPickerPromise.catch(_=>symbolPickerPromise = null); // allow retrying after a failed fetch
  }
  return symbolPickerPromise;
}

async function buildSymbolPicker() {
  // the "Material Symbols - *" categories, names and keywords come from Google's icon metadata:
  // https://fonts.google.com/metadata/icons?incomplete=true&key=material_symbols (strip the )]}' prefix).
  // The two font files are the instances Google Fonts itself serves, which are much smaller than the
  // variable fonts in the material-design-icons repository:
  // https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0 (NoFill)
  // https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,1,0 (Fill)
  // An icon is marked "(FILL+NOFILL)" only if those two files actually render it differently.
  const symbolData = await (await fetch('i/fonts/symbols.json')).json();
  // the search floats its best matches to the top of the list (see filterSymbolList), so this separates
  // them from the rest of the matches, which stay in their symbols.json order below
  let list = '<h2 id="symbolMoreMatches" class="hidden">More matches</h2>';
  // What the search reads, one entry per <i> below and in the same order. It is kept here rather than
  // in the elements because 14000 data-keywords attributes are what made the TestCafe editor run take
  // 48 minutes - and because filtering must not re-parse them on every keystroke.
  const symbolSearch = [];
  for(const [ category, symbols ] of Object.entries(symbolData)) {
    if(category == 'Emoji - Flags')
      continue;
    list += `<h2 data-family="${category.match(/^(Material|VTT|Emoji)/)?'font':'image'}">${category}</h2>`;
    for(let [ symbol, keywords ] of Object.entries(symbols)) {
      if(symbol.includes('/')) {
        const gameIconsIndex = keywords.shift();
        // the file name is searched word by word, so that both "polar-bear" and "polar bear" find the
        // icon without spending one of its tags on it
        symbolSearch.push(iconSearchEntry(symbol.split('/')[1], keywords));
        // --x and --y address the icon in the sprite sheets by its position in the montage; the
        // _instructions of assets/game-icons.net/icon-metadata.json say how those are rebuilt
        list += `<i class="gameicons" data-family="image" title="game-icons.net: ${symbol}" data-type="game-icons" data-symbol="${symbol}" style="--x:${gameIconsIndex%60};--y:${Math.floor(gameIconsIndex/60)};--url:url('i/game-icons.net/${symbol}.svg')"></i>`;
      } else {
        const hasNoFillVariant = symbol.match(/ \(FILL\+NOFILL\)$/);
        symbol = symbol.replace(/ \(FILL\+NOFILL\)$/, '');
        let className = 'emoji-monochrome';
        if(symbol[0] == '[')
          className = 'symbols';
        else if(symbol.match(/^[a-z0-9_]+$/))
          className = 'material-symbols';
        if(className != 'emoji-monochrome' || !skipForNotoMonochrome(symbol)) {
          const symbolToReturn = className == 'emoji-monochrome' ? `(${symbol})` : symbol;
          symbolSearch.push(iconSearchEntry(symbol, keywords));
          list += `<i class="${className}" data-family="font" title="${className}: ${symbol}" data-type="${className}" data-symbol="${symbolToReturn}" style="--url:url('i/noto-emoji/emoji_u${emojiToFilename(symbol)}.svg')">${toNotoMonochrome(symbol)}</i>`;
        }
        // "material-symbols-nofill: save" told the reader nothing about why the same glyph is listed
        // twice, and the value it inserts (save_NOFILL) is not what a tooltip should be teaching
        if(className == 'material-symbols' && hasNoFillVariant) {
          symbolSearch.push(iconSearchEntry(symbol, keywords));
          list += `<i class="material-symbols-nofill" data-family="font" title="material-symbols: ${symbol} (outlined)" data-type="material-symbols-nofill" data-symbol="${symbol}_NOFILL">${symbol}</i>`;
        }
      }
    }
  }
  for(const [ category, symbols ] of Object.entries(symbolData)) {
    if(category.match(/Emoji/)) {
      list += `<h2 data-family="image">${category}</h2>`;
      for(const [ symbol, keywords ] of Object.entries(symbols)) {
        // the flags and the newest emoji need a class of their own because no browser font draws them, but
        // their type stays emoji-color: that is the library they belong to, and the library filter below,
        // the click handler of pickSymbol and the variant tooltips all match data-type exactly, so a class
        // list in there loses every one of them
        let className = 'emoji-color';
        if(category == 'Emoji - Flags' || tooNewForBrowserEmojiFont(symbol))
          className += ' emojiAsImage';
        symbolSearch.push(iconSearchEntry(symbol, keywords));
        list += `<i class="${className}" data-family="image" title="emoji-color: ${symbol}" data-type="emoji-color" data-symbol="${symbol}" style="--url:url('i/noto-emoji/emoji_u${emojiToFilename(symbol)}.svg')">${symbol}</i>`;
      }
    }
  }
  $('#symbolList').innerHTML = list;

  // Filtering visits every one of the ~14000 entries, so pair each one with its element once here. The
  // cached shown/order/big is what the entry currently looks like, so a keystroke only writes to the
  // elements that actually change.
  for(const [ index, el ] of $a('#symbolList i').entries()) {
    const entry = Object.assign(symbolSearch[index], { el, family: el.dataset.family, type: el.dataset.type, shown: true, order: 0, big: false });
    symbolIndex.push(entry);
    entryOfIcon.set(el, entry);
  }

  // The tooltip said "game-icons.net: delapouite/first-aid-kit" and nothing else, so the words the
  // search actually knows the icon by stayed invisible. They are added on hover rather than into 14000
  // title attributes, for the same reason the search data does not live in the elements either.
  $('#symbolList').onmouseover = function(e) {
    const icon = e.target.closest('i');
    const entry = icon && entryOfIcon.get(icon);
    if(entry && !icon.dataset.described) {
      icon.dataset.described = 1;
      icon.title = `${icon.title}\n${iconSearchTagText(entry)}`;
    }
  };

  // the search field is a type=search input with the browser's own clear button, and terms also arrive by
  // paste, cut or drop - none of which is a keystroke, so listen for input like the inline pickers do
  $('#symbolPickerOverlay input').oninput = scheduleSymbolFilter;

  $('#symbolSearchStatus button').onclick = function() {
    setLibraryFilter(null); // the one control the picker has for a library filter it was opened with
    $('#symbolPickerOverlay input').value = '';
    $('#symbolPickerOverlay input').focus();
    filterSymbolList();
  };

  // the toned forms come from a list of their own, fetched next to this one - a search that ran
  // before it arrived puts them in as soon as it does instead of waiting for the next keystroke
  loadEmojiVariants().then(_=>{
    if($('#symbolPickerOverlay input').value)
      filterSymbolList();
  }, _=>null);
}

// Even though a keystroke only writes to the entries that change, showing and hiding hundreds of them costs
// the browser a layout pass over the whole 14000-entry list - which is a stutter per character while typing.
// Filter once the typing pauses instead.
let symbolFilterTimeout = null;
function scheduleSymbolFilter() {
  clearTimeout(symbolFilterTimeout);
  symbolFilterTimeout = setTimeout(filterSymbolList, 120);
}

// The best matches are shown large, the rest of them in the compact grid below the "More matches" heading.
const bigPreviewLimit = 100;
const symbolIndex = [];
// the search entry of an icon element, for whoever holds the element and needs what the search knows
// about it: the tag text its tooltip grows on hover, the name its skin tone flyout is headed with
const entryOfIcon = new Map();
// The CSS order a match is laid out at is its score subtracted from this: score 5 (the icon IS called what
// was typed) ends up first, score 1 (only its tags say so) last, then the "More matches" heading itself,
// then everything the big previews had no room for.
const moreMatchesOrder = 5;
const overflowOrder = 6;

// the inline icon picker's "Libraries:" checkboxes, translated into the data-type of the icons here. A
// picker opened from there searches the libraries the user left checked, instead of answering a term they
// narrowed down with icons from the libraries they just switched off.
const symbolLibraries = {
  'game-icons':       [ 'game-icons' ],
  'material-symbols': [ 'material-symbols', 'material-symbols-nofill' ],
  'emoji-color':      [ 'emoji-color' ],
  'emoji-monochrome': [ 'emoji-monochrome' ],
  'vtt-symbols':      [ 'symbols' ]
};
let libraryFilter = null; // { types, count } - null means every library, which is how the picker opens elsewhere
function setLibraryFilter(libraries) {
  const all = Object.keys(symbolLibraries);
  libraryFilter = libraries && libraries.length < all.length
    ? { types: new Set(libraries.flatMap(library => symbolLibraries[library] || [])), count: libraries.length } : null;
}

// the picker is also the image picker (type=='images'), so a user who typed into a field labeled "Search
// images..." and pressed "Browse more..." no longer lands in a dialog that calls everything in it an icon
let itemName = 'icon';
function setPickerWording(type) {
  itemName = type == 'images' ? 'image' : 'icon';
  $('#symbolPickerOverlay h1').textContent = `Pick ${itemName}`;
  // the same wording as the inline pickers (see iconSearchPlaceholder): both search the tags that say what
  // an icon shows, not just its file name
  $('#symbolPickerOverlay input').placeholder = itemName == 'image'
    ? 'Search by name or by what the image shows (first aid, cthulhu, …)' : iconSearchPlaceholder;
  $('#symbolSearchStatus button').textContent = `Show all ${itemName}s`;
}

// Same ranking as the inline icon search of the property editor (see iconSearchMatches in
// editor/propertyInputs.js): both score with iconSearchScores above, so the two pickers cannot disagree
// about what a query means. The list is not reordered in the DOM (that would mean moving thousands of
// nodes per keystroke): #symbolList is a flex container, so setting the score as the CSS order is enough.
function filterSymbolList() {
  clearTimeout(symbolFilterTimeout);
  if(!symbolIndex.length)
    return; // the list is still being fetched/built - nothing to filter yet

  collapseEmojiVariants($('#symbolList')); // the forms of the last search are icons of the grid too

  const query = $('#symbolPickerOverlay input').value;
  const ranked = !!query.trim();
  const scores = iconSearchScores(symbolIndex, query);
  // the picker can be restricted to one family of icons, which hides the other one in CSS instead of
  // adding .hidden - so only counting the search matches would call a blank card "few" or "some results"
  const hiddenFamily = $('#symbolPickerOverlay').classList.contains('hideImages') ? 'image'
                     : $('#symbolPickerOverlay').classList.contains('hideFonts')  ? 'font' : null;

  const matches = [];
  let total = 0; // everything the picker could show right now, for the status line to compare against
  for(const [ index, entry ] of symbolIndex.entries()) {
    // a library the picker was opened without is scored to zero, so hiding, ranking and the counts below
    // all follow from the one number the same way a non-matching search term does
    entry.score = libraryFilter && !libraryFilter.types.has(entry.type) ? 0 : scores[index];
    entry.rank = overflowOrder;
    if(entry.family != hiddenFamily) {
      ++total;
      if(entry.score)
        matches.push(entry);
    }
  }
  // stable, so matches of the same score keep their symbols.json order and icon families stay together
  matches.sort((a, b) => b.score - a.score);
  matches.forEach((entry, index) => entry.rank = index < bigPreviewLimit ? moreMatchesOrder - entry.score : overflowOrder);

  for(const entry of symbolIndex) {
    const order = ranked ? entry.rank : 0; // unfiltered, the list keeps its category order
    const big = ranked && entry.rank < moreMatchesOrder;
    if(entry.shown != !!entry.score)
      toggleClass(entry.el, 'hidden', !(entry.shown = !!entry.score));
    if(entry.order != order)
      entry.el.style.order = (entry.order = order) || '';
    if(entry.big != big)
      toggleClass(entry.el, 'bigPreview', entry.big = big);
  }

  for(const title of $a('#symbolList h2:not(#symbolMoreMatches)'))
    toggleClass(title, 'hidden', ranked);
  toggleClass($('#symbolMoreMatches'), 'hidden', !ranked || matches.length <= bigPreviewLimit);
  toggleClass($('#symbolPickerOverlay'), 'fewResults', matches.length <= bigPreviewLimit);
  toggleClass($('#symbolPickerOverlay'), 'noResults', !matches.length);

  // a search or a library filter - typed here or carried over from the inline picker - leaves a slice of
  // ~13000 icons with nothing on screen saying so, so state how much is left and offer the one click back
  // to all of it. The count comes first because it is what the narrow layouts keep. The libraries are the
  // less obvious half of that handover: the picker has no checkboxes of its own, so without a word about
  // them a list missing every emoji looks like the whole one.
  const filtered = ranked || !!libraryFilter;
  const libraries = libraryFilter ? ` from ${libraryFilter.count} of ${Object.keys(symbolLibraries).length} libraries` : '';
  toggleClass($('#symbolPickerOverlay'), 'filtered', filtered);
  $('#symbolSearchStatus span').textContent = filtered && matches.length
    ? `${matches.length} of ${total} ${itemName}s${libraries}${ranked ? ` match${matches.length == 1 ? 'es' : ''} "${query}"` : ''}` : '';
  $('#symbolNoResults').textContent = ranked
    ? `No ${itemName}s${libraries} match "${query}". ${iconSearchNoResultsHint}`
    : `No ${itemName}s in the chosen libraries.`;

  // Once the result is short enough to take in at a glance, the toned forms are better off in the
  // grid than behind a hover of their own. A result nowhere near that short is not even asked for
  // its emoji - that question is another pass over the matches on every keystroke. The forms are
  // built from `matches`, which already leaves out whatever family the picker is hiding in CSS.
  const emojiIcons = matches.length <= inlineVariantLimit
                   ? matches.filter(entry => entry.el.classList.contains('emoji-color')).map(entry => entry.el) : [];
  expandEmojiVariants($('#symbolList'), emojiIcons, {
    emoji: icon=>icon.dataset.symbol,
    create: inlineVariantIcon,
    budget: inlineVariantLimit - matches.length
  });
}

// search and libraries prefill the picker's search field and library filter, so a picker opened from a place
// that already has both (the property editor's inline icon picker and its "Browse more..." button) starts out
// filtered the same way instead of contradicting what the user just narrowed down
export async function pickSymbol(type='all', bigPreviews=true, closeOverlay=true, search='', libraries=null) {
  if($('#statesButton').dataset.overlay == 'symbolPickerOverlay')
    $('#statesButton').dataset.overlay = detailsOverlay;

  let resolve;
  const symbol = new Promise(r => resolve = r);

  // symbols.json is half a megabyte, so the first open of the picker waits on a fetch: show the (empty,
  // "Loading...") card right away instead of leaving the user with nothing at all after their click
  $('#symbolPickerOverlay').classList.toggle('bigPreviews', bigPreviews);
  $('#symbolPickerOverlay').classList.toggle('hideFonts',   type=='images');
  $('#symbolPickerOverlay').classList.toggle('hideImages',  type=='fonts');
  // the status line has nothing to count until the list is there, so it stays down over the "Loading..." card
  $('#symbolPickerOverlay').classList.remove('fewResults', 'noResults', 'filtered');
  setPickerWording(type);
  setLibraryFilter(libraries);
  $('#symbolPickerOverlay input').value = search;
  showOverlay('symbolPickerOverlay');
  $('#symbolPickerOverlay input').focus();
  // a transferred search term is fully replaced by typing a new one - but on a touch device selecting it
  // also pops the selection handles and their context bar over the first row of a picker that is short
  // anyway. Selecting is the fallback where there is nothing to ask: it is the cosmetic half of opening
  // the picker, and must not be what keeps the picker from opening at all.
  const coarsePointer = typeof matchMedia == 'function' && matchMedia('(pointer: coarse)').matches;
  if(search && !coarsePointer)
    $('#symbolPickerOverlay input').select();
  $('#symbolPickerOverlay [icon=close]').onclick = function(e) {
    closeEmojiVariantFlyout();
    if(closeOverlay)
      showOverlay(null);
    resolve(null);
  };

  try {
    await loadSymbolPicker();
  } catch(e) {
    if(closeOverlay)
      showOverlay(null); // do not leave the "Loading..." card up when the list never arrives
    throw e;
  }
  $('#symbolList').scrollTop = 0; // the list is built once and is the picker's scroller, so open it at the top
  filterSymbolList();

  // the symbol a picked icon stands for is its own most of the time, but the skin tone flyout of an
  // emoji resolves the same pick with one of its variants instead
  function pick(icon, symbol) {
    closeEmojiVariantFlyout();
    if(closeOverlay)
      showOverlay(null);
    const isImage = ['emoji-color','game-icons'].indexOf(icon.dataset.type) != -1;
    let url = null;
    if(icon.dataset.type == 'emoji-color')
      url = `/i/noto-emoji/emoji_u${emojiToFilename(symbol)}.svg`;
    if(icon.dataset.type == 'game-icons')
      url = `/i/game-icons.net/${symbol}.svg`;
    resolve(Object.assign({...icon.dataset}, { symbol, isImage, url }));
  }

  // One listener for the whole grid: it holds over 13000 icons, and giving each of them its own click
  // handler every time the picker opens is a tenth of a second the picker does not have - and the toned
  // forms a narrow search puts into the grid (expandEmojiVariants) are clones, which carry none at all.
  $('#symbolList').onclick = e=>{
    const icon = e.target.closest('i');
    if(icon)
      pick(icon, icon.dataset.symbol);
  };
  enableEmojiVariantFlyouts($('#symbolList'), {
    selector: 'i.emoji-color',
    emoji: icon=>icon.dataset.symbol,
    onPick: (icon, variant)=>pick(icon, variant),
    label: symbolName
  });

  return symbol;
}

export function addRichtextControls(dom) {
  const controls = domByTemplate('template-richtext-controls');
  controls.classList.add('richtext-controls');
  dom.parentNode.insertBefore(controls, dom);
  for(const button of $a('[data-command]', controls)) {
    button.onclick = function() {
      document.execCommand(button.dataset.command, false, button.dataset.payload);
      dom.focus();
    };
  }

  loadSymbolPicker();

  $('[icon=format_size]', controls).onclick = function() {
    const selection = window.getSelection();
    if (!selection.rangeCount)
      return;
    const parent = window.getSelection().getRangeAt(0).startContainer.parentNode.closest('h4');
    if(parent)
      parent.replaceWith(...parent.children);
    else
      document.execCommand('formatBlock', false, 'h4');
    dom.focus();
  };
  $('[icon=palette]', controls).onclick = function() {
    const selection = window.getSelection();
    if (!selection.rangeCount)
      return;
    const range = window.getSelection().getRangeAt(0);
    document.execCommand('forecolor', false, '#000000');
    const input = document.createElement('input');
    input.type = 'color';
    input.onchange = function() {
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.execCommand('forecolor', false, input.value);
      dom.focus();
    };
    input.click();
  };

  $('[icon=art_track]', controls).onclick = $('[icon=add_photo_alternate]', controls).onclick = async function(e) {
    $('#statesButton').dataset.overlay = 'updateImageOverlay';
    const asset = await updateImage('', 'Cancel');
    showStatesOverlay(detailsOverlay);
    if(asset) {
      const floating = e.target == $('[icon=art_track]', controls) ? 'floating' : '';
      document.execCommand('inserthtml', false, `<a href="${mapAssetURLs(asset)}"><img class="${floating} richtextAsset" src="${mapAssetURLs(asset)}"></a>`);
    }
    dom.focus();
  };
  $('[icon=movie]', controls).onclick = async function() {
    $('#statesButton').dataset.overlay = 'confirmOverlay';
    if(await confirmOverlay('Upload video', 'Please note that VTT will not do video processing like YouTube to make sure your video plays everywhere.\n\nUse WebM or MPEG-4/H.264 format because those are well supported.', 'Upload', 'Cancel', 'upload', 'cancel')) {
      showStatesOverlay(detailsOverlay);
      const asset = await uploadAsset();
      if(asset)
        document.execCommand('inserthtml', false, `<video class="richtextAsset" src="${mapAssetURLs(asset)}" controls></video>`);
      dom.focus();
    } else {
      showStatesOverlay(detailsOverlay);
    }
  };
  $('[icon=add_reaction]', controls).onclick = async function() {
    const selection = window.getSelection();
    if (!selection.rangeCount)
      return;
    const range = window.getSelection().getRangeAt(0);

    showStatesOverlay('symbolPickerOverlay');
    // the richtext editor picks from everything there is, so whatever the last caller narrowed the picker
    // down to has to be handed back before it opens
    setPickerWording('all');
    setLibraryFilter(null);
    for(const c of [ 'bigPreviews', 'hideFonts', 'hideImages', 'filtered' ])
      $('#symbolPickerOverlay').classList.remove(c);
    $('#symbolPickerOverlay input').value = '';
    $('#symbolPickerOverlay input').focus();

    $('#symbolPickerOverlay [icon=close]').onclick = function() {
      closeEmojiVariantFlyout();
      showStatesOverlay(detailsOverlay);
    };

    // the preload started above may still be running: binding the handlers now would bind them to the
    // "Loading..." card, so the icons that appear a moment later would do nothing when clicked
    try {
      await loadSymbolPicker();
    } catch(e) {
      showStatesOverlay(detailsOverlay);
      throw e;
    }
    $('#symbolList').scrollTop = 0;
    filterSymbolList();

    function insert(icon, symbol) {
      closeEmojiVariantFlyout();
      showStatesOverlay(detailsOverlay);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      if(icon.classList.contains('gameicons')) {
        document.execCommand('inserthtml', false, `<i class="richtextSymbol gameicons"><img src="i/game-icons.net/${symbol}.svg"></i>`);
      } else {
        if(icon.classList.contains('emoji-color'))
          document.execCommand('inserthtml', false, symbol);
        else
          document.execCommand('inserthtml', false, `<i class="richtextSymbol ${icon.className}">${icon.innerText}</i>`);
      }
      for(const insertedSymbol of $a('.richtextSymbol'))
        insertedSymbol.contentEditable = false; // adding the property above causes Chrome to insert two icons
    }

    $('#symbolList').onclick = e=>{
      const icon = e.target.closest('i');
      if(icon)
        insert(icon, icon.dataset.symbol);
    };
    enableEmojiVariantFlyouts($('#symbolList'), {
      selector: 'i.emoji-color',
      emoji: icon=>icon.dataset.symbol,
      onPick: (icon, variant)=>insert(icon, variant),
      label: symbolName
    });
  };
}

export function removeRichtextControls(dom) {
  removeFromDOM(dom.previousSibling);
}

function getIconDetails(icon) {
  if(!icon)
    return { image: null, text: null };
  if(icon.match(/^\/assets\/[0-9_-]+$|^https?:\/\//))
    return { image: mapAssetURLs(icon), text: null, class: 'autoIconAlignImage autoIconAlignCustomAsset' };
  if(icon.match(/\//))
    return { image: `/i/game-icons.net/${icon}.svg`, text: ' ', class: 'autoIconAlignImage autoIconAlignGameIcons', colorReplace: '#000' };
  if(icon.match(/^\[/))
    return { image: ' ', text: icon, class: 'autoIconAlignFont autoIconAlignSymbols' };
  if(icon.match(/^[a-z0-9].*_NOFILL$/))
    return { image: ' ', text: icon.replace(/_NOFILL$/, ''), class: 'autoIconAlignFont autoIconAlignMaterialIconsNoFill' };
  if(icon.match(/^[a-z0-9]/))
    return { image: ' ', text: icon, class: 'autoIconAlignFont autoIconAlignMaterialIcons' };
  if(icon.match(/^\((.+)\)$/))
    return { image: ' ', text: toNotoMonochrome(icon.substr(1, icon.length-2)), class: 'autoIconAlignFont autoIconAlignNotoEmojiMonochrome' };
  return { image: `/i/noto-emoji/emoji_u${emojiToFilename(icon)}.svg`, text: ' ', class: 'autoIconAlignImage autoIconAlignNotoEmoji' };
}

function optimalSquareSize(count, width, height) {
  // Source: https://math.stackexchange.com/a/2570649

  // Compute number of rows and columns, and cell size
  var ratio = width / height;
  var ncols_float = Math.sqrt(count * ratio);
  var nrows_float = count / ncols_float;

  // Find best option filling the whole height
  var nrows1 = Math.ceil(nrows_float);
  var ncols1 = Math.ceil(count / nrows1);
  while (nrows1 * ratio < ncols1) {
    nrows1++;
    ncols1 = Math.ceil(count / nrows1);
  }
  var cell_size1 = height / nrows1;

  // Find best option filling the whole width
  var ncols2 = Math.ceil(ncols_float);
  var nrows2 = Math.ceil(count / ncols2);
  while (ncols2 < nrows2 * ratio) {
    ncols2++;
    nrows2 = Math.ceil(count / ncols2);
  }
  var cell_size2 = width / ncols2;

  // Find the best values
  var nrows, ncols, cell_size;
  if (cell_size1 < cell_size2) {
    nrows = nrows2;
    ncols = ncols2;
    cell_size = cell_size2;
  } else {
    nrows = nrows1;
    ncols = ncols1;
    cell_size = cell_size1;
  }
  return cell_size;
}

function setTextAndAdjustFontSize(element, text, maxWidth, maxHeight, initialFontSize=100, step=10) {
  element.textContent = text; // Set the text

  // Start with a large font size and decrease until it fits
  let fontSize = initialFontSize;

  // Set the font size and measure the height and width of the element
  while (fontSize >= 10) {
    element.style.fontSize = `${fontSize}px`;

    const elementHeight = element.scrollHeight;
    const elementWidth = element.scrollWidth;

    // Check if the element fits within the available height and width
    if (elementHeight <= maxHeight && elementWidth <= maxWidth) {
      break; // The element fits, exit the loop
    }

    fontSize -= step; // Reduce the font size
  }

  element.style.setProperty('--maxWidth', `${maxWidth}px`);
  element.style.setProperty('--maxHeight', `${maxHeight}px`);
}

function generateSymbolsDiv(target, width, height, symbols, text, defaultScale, defaultColor, defaultHoverColor, defaultOpacity=1) {
  const outerWrapper = div(target, 'symbolOuterWrapper', `
    <div class="symbolWrapper"></div>
    <div class="symbolText"></div>
  `);
  const wrapper = $('.symbolWrapper', outerWrapper);

  outerWrapper.style.transform = `scale(${defaultScale})`;
  outerWrapper.style.setProperty('--width', `${width}px`);
  outerWrapper.style.setProperty('--height', `${height}px`);

  let iconsWidth = width;
  let iconsHeight = height;
  let textWidth = width;
  let textHeight = height;
  const hasText = text !== undefined && text !== null && text !== '';
  const normalizedText = hasText ? String(text) : '';
  if(hasText) {
    outerWrapper.classList.add('withText');
    if(width/height >= 2) {
      outerWrapper.classList.add('textRight');
      iconsWidth = iconsHeight;
      textWidth = width - iconsWidth
    } else {
      outerWrapper.classList.add('textBottom');
      iconsHeight = iconsHeight / (normalizedText.indexOf('\n') != -1 ? 3 : 2);
      textHeight = height - iconsHeight
    }
    wrapper.style.setProperty('--width', `${iconsWidth}px`);
    wrapper.style.setProperty('--height', `${iconsHeight}px`);
    $('.symbolText', outerWrapper).style.setProperty('--color', `${defaultColor}`);
    $('.symbolText', outerWrapper).style.setProperty('--hoverColor', `${defaultHoverColor}`);
    setTextAndAdjustFontSize($('.symbolText', outerWrapper), normalizedText, textWidth, textHeight);
  }
  const maxSize = optimalSquareSize(asArray(symbols).length, iconsWidth, iconsHeight);

  outerWrapper.style.setProperty('--count', 1);

  for(let symbol of asArray(symbols)) {
    if(!symbol)
      continue;

    if(typeof symbol != 'object')
      symbol = { name: symbol };
    symbol = {
      name: symbol.name,
      scale: symbol.scale || 1,
      flip: symbol.flip || "",
      offsetX: symbol.offsetX || 0,
      offsetY: symbol.offsetY || 0,
      rotation: symbol.rotation || 0,
      color: symbol.color || defaultColor,
      strokeColor: asArray(symbol.strokeColor || "transparent"),
      strokeWidth: asArray(symbol.strokeWidth || 0),
      hoverColor: symbol.hoverColor || symbol.color || defaultHoverColor || defaultColor,
      hoverStrokeColor: asArray(symbol.hoverStrokeColor || symbol.strokeColor || "transparent"),
      hoverStrokeWidth: asArray(symbol.hoverStrokeWidth !== null && symbol.hoverStrokeWidth !== undefined ? symbol.hoverStrokeWidth : symbol.strokeWidth || 0),
      opacity: (symbol.opacity === 0 || symbol.opacity) ? symbol.opacity : defaultOpacity,
      hoverOpacity: (symbol.hoverOpacity === 0 || symbol.hoverOpacity) ? symbol.hoverOpacity : ((symbol.opacity === 0 || symbol.opacity) ? symbol.opacity : defaultOpacity),
    };

    const details = getIconDetails(symbol.name);
    const icon = div(wrapper, details.class, details.text);
    if(details.image) {
      let image = mapAssetURLs(details.image);
      let hoverImage = mapAssetURLs(details.image);
      if(details.colorReplace) {
        let colorTarget = symbol.color;
        let hoverColorTarget = symbol.hoverColor;
        if(symbol.strokeColor) {
          if(Array.isArray(colorTarget)) {
            colorTarget = colorTarget.map((v,i)=>`${v}\" stroke=\"${symbol.strokeColor[i%symbol.strokeColor.length]}\" stroke-width=\"${symbol.strokeWidth[i%symbol.strokeWidth.length]}`);
          } else {
            colorTarget = `${colorTarget}\" stroke=\"${symbol.strokeColor[0]}\" stroke-width=\"${symbol.strokeWidth[0]}`;
          }
          if(Array.isArray(hoverColorTarget)) {
            hoverColorTarget = hoverColorTarget.map((v,i)=>`${v}\" stroke=\"${symbol.hoverStrokeColor[i%symbol.hoverStrokeColor.length]}\" stroke-width=\"${symbol.hoverStrokeWidth[i%symbol.hoverStrokeWidth.length]}`);
          } else {
            hoverColorTarget = `${hoverColorTarget}\" stroke=\"${symbol.hoverStrokeColor[0]}\" stroke-width=\"${symbol.hoverStrokeWidth[0]}`;
          }
        }
        image = getSVG(image, { [details.colorReplace]: colorTarget }, i=>icon.style.setProperty('--image', `url("${i}")`));
        hoverImage = getSVG(hoverImage, { [details.colorReplace]: hoverColorTarget }, i=>icon.style.setProperty('--hoverImage', `url("${i}")`));
      }
      icon.style.setProperty('--image', `url("${image}")`);
      icon.style.setProperty('--hoverImage', `url("${hoverImage}")`);
    }
    const flip = (symbol.flip || '').toString().toLowerCase();
    const flipX = flip == 'horizontal' || flip == 'both' ? -1 : 1;
    const flipY = flip == 'vertical'   || flip == 'both' ? -1 : 1;
    icon.style.setProperty('--flipX', flipX);
    icon.style.setProperty('--flipY', flipY);
    icon.style.setProperty('--scale', symbol.scale);
    icon.style.setProperty('--width', `${maxSize}px`);
    icon.style.setProperty('--height', `${maxSize}px`);
    icon.style.setProperty('--offsetX', `${(symbol.offsetX)*maxSize}px`);
    icon.style.setProperty('--offsetY', `${(symbol.offsetY)*maxSize}px`);
    icon.style.setProperty('--rotation', `${symbol.rotation}deg`);
    icon.style.setProperty('--color', `${symbol.color}`);
    icon.style.setProperty('--hoverColor', `${symbol.hoverColor}`);
    icon.style.setProperty('--strokeColor', `${symbol.strokeColor[0]}`);
    icon.style.setProperty('--hoverStrokeColor', `${symbol.hoverStrokeColor[0]}`);
    icon.style.setProperty('--strokeWidth', `${(symbol.strokeWidth[0])/512*maxSize}px`);
    icon.style.setProperty('--hoverStrokeWidth', `${(symbol.hoverStrokeWidth[0])/512*maxSize}px`);
    icon.style.setProperty('--opacity', `${symbol.opacity}`);
    icon.style.setProperty('--hoverOpacity', `${symbol.hoverOpacity}`);
  }

  return outerWrapper;
}
