import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// assets/fonts/symbols.json is what the two icon pickers read; assets/game-icons.net/icon-metadata.json is the
// full data set its tags were written from. Both describe the same SVGs and follow rules that are prose in the
// metadata file's _instructions block - the kind a later run adding a few icons silently breaks. The expensive
// one is the sprite index: symbols.json addresses assets/game-icons.net/overview48.png by position in the
// montage, which is the glob order of the files, so inserting one icon shifts every later one and the whole
// picker renders the wrong artwork with nothing failing.
const dir = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(dir, '../assets');

const metadata = JSON.parse(fs.readFileSync(path.join(assets, 'game-icons.net/icon-metadata.json'), 'utf8'));
const symbols = JSON.parse(fs.readFileSync(path.join(assets, 'fonts/symbols.json'), 'utf8'));

// the montage is built from `assets/game-icons.net/*/*.svg`, so the order is the file names including their
// extension, sorted bytewise - "deer-head.svg" comes before "deer.svg" because "-" sorts before "."
const svgFiles = fs.readdirSync(path.join(assets, 'game-icons.net'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .flatMap(artist => fs.readdirSync(path.join(assets, 'game-icons.net', artist.name))
    .filter(file => file.endsWith('.svg'))
    .map(file => `${artist.name}/${file}`))
  .sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
  .map(file => file.replace(/\.svg$/, ''));

const pickerIcons = {};
for(const [ category, entries ] of Object.entries(symbols))
  if(category.startsWith('Game-icons.net - '))
    for(const [ name, entry ] of Object.entries(entries))
      pickerIcons[name] = { category, index: entry[0], tags: entry.slice(1) };

// the checks below run over 4181 icons and 80000 tags, so they collect what is wrong and assert once
// instead of asserting per icon - a failure names the icons, an empty list is the passing case
function collect(check) {
  const problems = [];
  for(const name of svgFiles)
    check(name, problem => problems.push(`${name}: ${problem}`));
  return problems.slice(0, 20);
}

test('every game-icons.net SVG is in both metadata files and nothing else is', () => {
  expect(Object.keys(pickerIcons).sort()).toEqual([ ...svgFiles ].sort());
  expect(Object.keys(metadata.icons).sort()).toEqual([ ...svgFiles ].sort());
});

test('the sprite sheet indices are the glob order of the SVG files', () => {
  expect(svgFiles.map(name => pickerIcons[name].index)).toEqual(svgFiles.map((_, index) => index));
});

test('the sprite sheets cover every icon and fonts.css has a row for each of them', () => {
  // the pickers place an icon in the sheet with --x/--y and scale the sheet with --spritesheetX/Y,
  // so a sheet that gained a row without fonts.css following draws every icon at the wrong offset
  const rows = Math.ceil(svgFiles.length / 60);
  const fonts = fs.readFileSync(path.join(dir, '../client/css/fonts.css'), 'utf8');
  expect(+fonts.match(/--spritesheetX:\s*(\d+)/)[1]).toBe(60);
  expect(+fonts.match(/--spritesheetY:\s*(\d+)/)[1]).toBe(rows);
  for(const size of [ 24, 48 ]) {
    // the IHDR of a PNG: width, height, bit depth and color type, right behind the signature
    const ihdr = fs.readFileSync(path.join(assets, `game-icons.net/overview${size}.png`)).subarray(16, 26);
    expect([ ihdr.readUInt32BE(0), ihdr.readUInt32BE(4) ]).toEqual([ 60 * size, rows * size ]);
    // color type 4 is grayscale + alpha - the artwork is black on transparent, and keeping that
    // one gray in three RGBA channels costs 1.7 MB on overview48.png alone
    expect(ihdr[9]).toBe(4);
  }
});

test('symbols.json and icon-metadata.json agree on every tag', () => {
  expect(collect((name, fail) => {
    if(pickerIcons[name].tags.join('|') != metadata.icons[name].tags.join('|'))
      fail(`symbols.json has [${pickerIcons[name].tags}], icon-metadata.json has [${metadata.icons[name].tags}]`);
  })).toEqual([]);
});

test('every icon has a description and five categories of the vocabulary', () => {
  expect(collect((name, fail) => {
    const icon = metadata.icons[name];
    if(typeof icon.description != 'string' || icon.description.length < 10)
      fail(`description is ${JSON.stringify(icon.description)}`);
    if(icon.categories.length != 5)
      fail(`has ${icon.categories.length} category suggestions`);
    for(const category of icon.categories)
      if(!metadata.categoryVocabulary.includes(category))
        fail(`suggests the unknown category ${category}`);

    // the picker category is the mapping of the first suggestion that maps anywhere
    const mapped = icon.categories.map(category => metadata.categoryMapping[category]).filter(category => category);
    if(icon.category != mapped[0])
      fail(`is categorized as ${icon.category} but its suggestions map to ${mapped[0]}`);
    if(pickerIcons[name].category != `Game-icons.net - ${icon.category}`)
      fail(`is in ${pickerIcons[name].category} but icon-metadata.json says ${icon.category}`);
  })).toEqual([]);
});

test('the tags of an icon are searchable, distinct and add something to its name', () => {
  const searchWords = text => text.toLowerCase().split(/[^a-z0-9]+/).filter(word => word);

  expect(collect((name, fail) => {
    const tags = metadata.icons[name].tags;
    // the pickers match a search term against the beginning of a word of the file name and
    // against whole words of the tags (client/js/symbols.js, client/js/editor/propertyInputs.js)
    const nameWords = searchWords(name.split('/')[1]);
    const covered = new Set();

    if(!tags.length || tags.length > 20)
      fail(`has ${tags.length} tags`);
    if(new Set(tags).size != tags.length)
      fail(`repeats a tag`);
    for(const tag of tags) {
      if(tag != tag.toLowerCase().trim())
        fail(`the tag "${tag}" is not lowercase and trimmed`);
      // an accent or an & cannot be typed into the search box
      if(!tag.match(/^[a-z0-9 '.-]+$/))
        fail(`the tag "${tag}" is not plain ASCII`);
      // a tag whose words the file name or an earlier tag already covers can never be the reason for a match
      if(!searchWords(tag).some(word => !covered.has(word) && !nameWords.some(nameWord => nameWord.startsWith(word))))
        fail(`the tag "${tag}" adds no searchable word to the ones before it`);
      for(const word of searchWords(tag))
        covered.add(word);
    }
  })).toEqual([]);
});

// The rest of the file checks the data; this checks what the pickers make of it. Both of them
// score a query with client/js/symbols.js, which is a plain script the bundler concatenates, so
// evaluate it the way tests/client/property-inputs.test.js does and search the real picker index.
const searchSource = fs.readFileSync(path.join(dir, '../client/js/symbols.js'), 'utf8')
  .replace(/^import\s+[^;]+;\r?\n/gm, '')
  .replace(/^export\s+/gm, '');
const { iconSearchEntry, iconSearchScores, emojiToFilename, emojiRegex } = new Function(`${searchSource}
  ; return { iconSearchEntry, iconSearchScores, emojiToFilename, emojiRegex };`)();

const searchIndex = Object.entries(symbols).filter(([ category ]) => category != 'Emoji - Flags')
  .flatMap(([ , entries ]) => Object.entries(entries).map(([ symbol, keywords ]) => symbol.includes('/')
    ? { symbol, ...iconSearchEntry(symbol.split('/')[1], keywords.slice(1)) } // the sprite index in front of the tags
    : { symbol, ...iconSearchEntry(symbol, keywords) }));

function searchSymbols(query) {
  const scores = iconSearchScores(searchIndex, query);
  return searchIndex.filter((entry, i) => scores[i]).map(entry => entry.symbol);
}

// what the pickers show: the sidebar sorts its matches by their score, the picker of the room lays
// them out in the CSS orders of the same score, so both of them read in this order
function rankedSymbols(query) {
  const scores = iconSearchScores(searchIndex, query);
  return searchIndex.map((entry, i) => ({ symbol: entry.symbol, score: scores[i] })).filter(match => match.score)
    .sort((a, b) => b.score - a.score).map(match => match.symbol);
}

test('a plural finds what its singular finds', () => {
  // Neither the file names nor the tags settle on a number - the icon is "delapouite/horse-head"
  // but "lorc/kitchen-knives", and a tag may not repeat a word of the name, so an icon named
  // "horse" carries the word nowhere else. Matching one number only lost almost everything:
  // "horses" answered with 3 of the 22 icons "horse" finds, "roses" and "axes" with none of the
  // roses and two of the axes.
  const missed = [];
  for(const [ singular, plural ] of Object.entries({
    horse:'horses', house:'houses', rose:'roses', axe:'axes', box:'boxes', torch:'torches',
    glass:'glasses', church:'churches', knife:'knives', wolf:'wolves', leaf:'leaves', tooth:'teeth'
  })) {
    const found = new Set(searchSymbols(plural));
    for(const symbol of searchSymbols(singular))
      // a word that only begins with the singular ("horseback", "boxing") is a match of the
      // singular alone - the plural is matched as a whole word, in either number
      if(!found.has(symbol) && !symbol.split('/').pop().split(/[^a-z0-9]+/).some(word => word != singular && word.startsWith(singular)))
        missed.push(`"${plural}" misses ${symbol}`);
  }
  expect(missed).toEqual([]);
});

test('a word that only ends in s is not searched as a plural', () => {
  // "news" used to be searched as "new" and answered with 148 icons - a newborn, a new shoot,
  // "accessibility_new" - instead of the 16 that have to do with news
  const news = searchSymbols('news');
  expect(news).toContain('delapouite/newspaper');
  expect(news).not.toContain('delapouite/new-born');
  expect(news).not.toContain('lorc/new-shoot');
  expect(news.length).toBeLessThan(searchSymbols('new').length / 4);
  // "cross" is not the plural of "cros" either, and "crosses" still finds the crosses
  expect(searchSymbols('crosses')).toContain('delapouite/jerusalem-cross');
  expect(searchSymbols('lens')).toContain('lorc/microscope-lens');
});

test('an icon is found by the name of the set it belongs to', () => {
  // the 22 major arcana are one set, and are looked for as one: their file names carry "tarot" and
  // the number, so without the tags "major arcana" answered with nothing and "tarot card" with the
  // joker while all 22 of them sat in the picker
  const arcana = svgFiles.filter(name => name.startsWith('caro-asercion/tarot-'));
  expect(arcana.length).toBe(22);
  for(const query of [ 'major arcana', 'tarot card', 'tarot deck' ])
    expect(searchSymbols(query)).toEqual(expect.arrayContaining(arcana));
});

test('two icons of the same subject are told apart by their tags', () => {
  // the two Schroedinger cats share their box, their trefoil and 16 of their tags, and at the size
  // of the picker grid they are the same picture - the tags that differ are what names them
  expect(searchSymbols('live cat')).toContain('caro-asercion/schrodingers-cat-alive');
  expect(searchSymbols('awake cat')).toContain('caro-asercion/schrodingers-cat-alive');
  expect(searchSymbols('dead cat')).not.toContain('caro-asercion/schrodingers-cat-alive');
  expect(searchSymbols('limp cat')).toEqual([ 'caro-asercion/schrodingers-cat-dead' ]);
});

test('the icon that is called exactly what was typed comes first', () => {
  // a whole-word match says nothing about how much of the name is left over, so the icon that owns
  // the word used to rank wherever the montage order happened to put it
  expect(rankedSymbols('soul')[0]).toBe('delapouite/soul');
  expect(rankedSymbols('anvil')[0]).toBe('lorc/anvil');
  expect(rankedSymbols('shield')[0]).toBe('sbed/shield');
  // and the ranking still puts the names in front of the icons that are only tagged with the word
  expect(rankedSymbols('dragon').slice(0, 3).every(symbol => symbol.includes('dragon'))).toBe(true);
});

test('an icon game-icons.net has renamed is found by the name the site uses now', () => {
  // the file names stay as they are - renaming one breaks every game that references it by URL -
  // so the name of today has to be in the tags, and as one phrase: every word of a query has to
  // match something, down to the "in" that no single-word tag carries
  expect(searchSymbols('person in blizzard')).toContain('lorc/eskimo');
  expect(searchSymbols('satellite')).toContain('lorc/sattelite');
  expect(searchSymbols('star satellites')).toContain('lorc/star-sattelites');
});

// The emoji categories name their SVG by code point, the way emojiToFilename() spells it. A key
// with a stray variation selector or a sequence added without its artwork is an empty box in the
// picker and a broken <img> in a label, with nothing else noticing.
const pickerEmojis = Object.entries(symbols).filter(([ category ]) => category.startsWith('Emoji'))
  .flatMap(([ , entries ]) => Object.keys(entries));

test('every emoji of the pickers has its noto-emoji SVG', () => {
  expect(pickerEmojis.filter(emoji => !fs.existsSync(path.join(assets, `noto-emoji/emoji_u${emojiToFilename(emoji)}.svg`)))).toEqual([]);
});

test('every emoji of the pickers is recognized in text', () => {
  // emojis2images() replaces what this regex matches, so an emoji it does not know stays browser
  // text in a label - which is a box on every machine whose font is older than the emoji
  expect(pickerEmojis.filter(emoji => {
    emojiRegex.lastIndex = 0;
    const match = emojiRegex.exec(emoji);
    // the match may drop a variation selector, which addresses the same file
    return !match || match.index || emojiToFilename(match[0]) != emojiToFilename(emoji);
  })).toEqual([]);
});
