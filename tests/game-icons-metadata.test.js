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

// the checks below run over 4131 icons and 70000 tags, so they collect what is wrong and assert once
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
