import { $, asArray } from "./domhelpers";

function emojiToFilename(emoji) {
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
// iconSearchEntry above) rather than kept a second time - there are 13288 of these.
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

// Scores a whole list of search entries against one query: 0 for the entries that do not match,
// 1 to 4 for the ones that do. Both pickers rank by it, which is what makes them agree on what a
// query means - the sidebar sorts its result list, the picker below lays its matches out in four
// CSS orders because its list is built once and only filtered afterwards.
//
// 4 is the icon that is called exactly what was typed and nothing else: a whole-word match says
// nothing about how much of the name it leaves over, so "soul" led with soul-vessel and "anvil"
// with anvil-impact - the icon that owns the word sat among the ones that only contain it.
function iconSearchScores(entries, query) {
  if(!query.trim())
    return entries.map(_=>1);
  const words = iconSearchWords(query);
  const terms = words.map(iconSearchTerm);
  const wholeName = words.join(' ');
  const scores = terms.length ? entries.map(entry => entry.name.join(' ') == wholeName ? 4 : iconSearchScore(entry, terms)) : [];
  if(scores.some(score => score))
    return scores;
  // a half typed tag ("cthulh") or a pasted emoji has no word to match, so rather than showing an
  // empty picker, fall back to the old "appears anywhere in the name or the tags". A query with no
  // letter of the tags' alphabet at all ("меч", "???") leaves no term either, and every entry
  // matching no term used to unhide all 13288 icons - it takes the same fallback now and ends up
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

let symbolData = null;
export async function loadSymbolPicker() {
  if(symbolData === null) {
    symbolData = 'loading';
    try {
      symbolData = await (await fetch('i/fonts/symbols.json')).json();
    } catch(e) {
      symbolData = null; // a failed fetch must not leave the picker stuck in 'loading' for the whole session
      throw e;
    }
    let list = '';
    const symbolSearch = []; // one entry per <i> below, in the order they are added to #symbolList
    for(const [ category, symbols ] of Object.entries(symbolData)) {
      if(category == 'Emoji - Flags')
        continue;
      list += `<h2 data-family="${category.match(/^(Material|VTT|Emoji)/)?'font':'image'}">${category}</h2>`;
      for(let [ symbol, keywords ] of Object.entries(symbols)) {
        if(symbol.includes('/')) {
          const gameIconsIndex = keywords.shift();
          // the file name is searched word by word, so that both "polar-bear" and "polar bear"
          // find the icon without spending one of its tags on it
          const name = symbol.split('/')[1];
          symbolSearch.push(iconSearchEntry(name, keywords));
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
          if(className == 'material-symbols' && hasNoFillVariant) {
            symbolSearch.push(iconSearchEntry(symbol, keywords));
            list += `<i class="material-symbols-nofill" data-family="font" title="material-symbols-nofill: ${symbol}" data-type="material-symbols-nofill" data-symbol="${symbol}_NOFILL">${symbol}</i>`;
          }
        }
      }
    }
    for(const [ category, symbols ] of Object.entries(symbolData)) {
      if(category.match(/Emoji/)) {
        list += `<h2 data-family="image">${category}</h2>`;
        for(const [ symbol, keywords ] of Object.entries(symbols)) {
          let className = 'emoji-color';
          if(category == 'Emoji - Flags' || tooNewForBrowserEmojiFont(symbol))
            className += ' emojiAsImage';
          symbolSearch.push(iconSearchEntry(symbol, keywords));
          list += `<i class="${className}" data-family="image" title="${className}: ${symbol}" data-type="${className}" data-symbol="${symbol}" style="--url:url('i/noto-emoji/emoji_u${emojiToFilename(symbol)}.svg')">${symbol}</i>`;
        }
      }
    }
    $('#symbolList').innerHTML = list;
    const icons = Array.from($a('#symbolList i')); // one per symbolSearch entry, in the same order

    // The tooltip said "game-icons.net: delapouite/first-aid-kit" and nothing else, so the words
    // the search actually knows the icon by stayed invisible. They are added on hover, not into
    // 13288 title attributes: that much DOM text is what made the TestCafe editor run take 48
    // minutes when the search data still lived in a data-keywords attribute.
    $('#symbolList').onmouseover = function(e) {
      const icon = e.target.closest('i');
      const index = icon ? icons.indexOf(icon) : -1;
      if(index != -1 && !icon.dataset.described) {
        icon.dataset.described = 1;
        icon.title = `${icon.title}\n${iconSearchTagText(symbolSearch[index])}`;
      }
    };

    $('#symbolPickerOverlay input').onkeyup = function() {
      const text = $('#symbolPickerOverlay input').value;
      const scores = iconSearchScores(symbolSearch, text);
      const ranked = !!text.trim();
      for(const [ i, icon ] of icons.entries()) {
        toggleClass(icon, 'hidden', !scores[i]);
        // the list is built once and is only filtered afterwards, so the matches cannot be
        // re-sorted: these three classes lay them out in the four CSS orders of their score
        // instead, which is the ranking the sidebar's icon picker sorts its own results by
        toggleClass(icon, 'exactMatch', ranked && scores[i] == 4);
        toggleClass(icon, 'nameMatch',  ranked && scores[i] == 3);
        toggleClass(icon, 'tagMatch',   ranked && scores[i] == 1);
      }
      for(const title of $a('#symbolList h2'))
        toggleClass(title, 'hidden', text);
      // the picker can be restricted to one family of icons, which hides the other one in CSS instead of
      // adding .hidden - so only counting the search matches would call a blank card "few" or "some results"
      const hiddenFamily = $('#symbolPickerOverlay').classList.contains('hideImages') ? 'image'
                         : $('#symbolPickerOverlay').classList.contains('hideFonts')  ? 'font' : null;
      const matches = $a(`#symbolList i:not(.hidden)${hiddenFamily ? `:not([data-family=${hiddenFamily}])` : ''}`).length;
      toggleClass($('#symbolPickerOverlay'), 'fewResults', matches < 100);
      toggleClass($('#symbolPickerOverlay'), 'noResults', !matches);
      $('#symbolNoResults').textContent = `No icons match "${$('#symbolPickerOverlay input').value}". ${iconSearchNoResultsHint}`;
    };
    $('#symbolPickerOverlay input').placeholder = iconSearchPlaceholder;
  }
}

export async function pickSymbol(type='all', bigPreviews=true, closeOverlay=true) {
  if($('#statesButton').dataset.overlay == 'symbolPickerOverlay')
    $('#statesButton').dataset.overlay = detailsOverlay;

  await loadSymbolPicker();
  return new Promise((resolve, reject) => {
    showOverlay('symbolPickerOverlay');
    $('#symbolPickerOverlay').classList.toggle('bigPreviews', bigPreviews);
    $('#symbolPickerOverlay').classList.toggle('hideFonts',   type=='images');
    $('#symbolPickerOverlay').classList.toggle('hideImages',  type=='fonts');
    $('#symbolList').scrollTop = 0; // the list is built once and is the picker's scroller, so open it at the top
    $('#symbolPickerOverlay input').value = '';
    $('#symbolPickerOverlay input').focus();
    $('#symbolPickerOverlay input').onkeyup();

    $('#symbolPickerOverlay [icon=close]').onclick = function(e) {
      if(closeOverlay)
        showOverlay(null);
      resolve(null);
    };

    for(const icon of $a('#symbolList i')) {
      icon.onclick = function(e) {
        if(closeOverlay)
          showOverlay(null);
        const isImage = ['emoji-color','game-icons'].indexOf(icon.dataset.type) != -1;
        let url = null;
        if(icon.dataset.type == 'emoji-color')
          url = `/i/noto-emoji/emoji_u${emojiToFilename(icon.dataset.symbol)}.svg`;
        if(icon.dataset.type == 'game-icons')
          url = `/i/game-icons.net/${icon.dataset.symbol}.svg`;
        resolve(Object.assign({...icon.dataset}, { isImage, url }));
      };
    }
  });
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
    $('#symbolList').scrollTop = 0;
    for(const c of [ 'bigPreviews', 'hideFonts', 'hideImages' ])
      $('#symbolPickerOverlay').classList.remove(c);
    $('#symbolPickerOverlay input').value = '';
    $('#symbolPickerOverlay input').focus();
    $('#symbolPickerOverlay input').onkeyup();

    $('#symbolPickerOverlay [icon=close]').onclick = _=>showStatesOverlay(detailsOverlay);

    for(const icon of $a('#symbolList i')) {
      icon.onclick = function() {
        showStatesOverlay(detailsOverlay);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        if(icon.classList.contains('gameicons')) {
          document.execCommand('inserthtml', false, `<i class="richtextSymbol gameicons"><img src="i/game-icons.net/${icon.dataset.symbol}.svg"></i>`);
        } else {
          if(icon.classList.contains('emoji-color'))
            document.execCommand('inserthtml', false, icon.innerText);
          else
            document.execCommand('inserthtml', false, `<i class="richtextSymbol ${icon.className}">${icon.innerText}</i>`);
        }
        for(const insertedSymbol of $a('.richtextSymbol'))
          insertedSymbol.contentEditable = false; // adding the property above causes Chrome to insert two icons
      };
    }
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
