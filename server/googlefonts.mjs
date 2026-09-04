import Logging from './logging.mjs';

// The catalog Google's own font browser reads. It lists every family together with the styles it
// has, which is what a picker needs - the Developer API returns the same data but only with an API
// key, and this endpoint is public.
const CATALOG_URL = 'https://fonts.google.com/metadata/fonts';
const STYLESHEET_URL = 'https://fonts.googleapis.com/css2';

// Font files are only ever fetched from the host Google's stylesheets point at, so a manipulated
// stylesheet cannot turn the import into a request to an arbitrary address.
const FILE_HOST = 'https://fonts.gstatic.com/';

const CATALOG_MAX_AGE = 24*60*60*1000;

// The biggest font file that is downloaded at all - the same cap the upload of an asset has. Only the CJK
// families come anywhere near it, and one of those is not something a game should carry around.
const FILE_MAX_SIZE = 10*1024*1024;

// The styles a text can select with font-weight/font-style alone, in the order the catalog names
// them. Everything else Google offers (the intermediate weights of a family) would need css beyond
// what an imported font is for.
export const STYLES = [ '400', '700', '400i', '700i' ];

let catalog = null;
let catalogLoadedAt = 0;
let catalogPending = null;

// The families Google currently offers, most popular first. Cached for a day: it is a 2.5 MB
// download that changes a few times a year, and every deck editor asks for it.
export async function families() {
  if(catalog && Date.now()-catalogLoadedAt < CATALOG_MAX_AGE)
    return catalog;
  if(!catalogPending) {
    catalogPending = loadFamilies().then(families=>{
      catalog = families;
      catalogLoadedAt = Date.now();
      catalogPending = null;
      return families;
    }, e=>{
      catalogPending = null;
      throw e;
    });
  }
  return catalogPending;
}

async function loadFamilies() {
  const response = await fetch(CATALOG_URL).catch(_=>null);
  if(!response || !response.ok)
    throw new Logging.UserError(502, 'Google Fonts did not answer with its list of fonts.');
  return parseFamilies(await response.text());
}

// Google guards the catalog against being read as a script by prefixing it with )]}' - that has to
// come off before it parses as JSON. Only the free families are offered, and only the four styles
// an imported font is used through; a family with none of them (an icon font, say) is dropped.
// Google's popularity rank decides the order, so the list opens on the fonts most people look for.
export function parseFamilies(body) {
  const data = JSON.parse(String(body).replace(/^\)\]\}'/, ''));
  return (data.familyMetadataList || [])
    .filter(entry=>entry.isOpenSource !== false && isValidFamily(entry.family))
    .map(entry=>({
      family: entry.family,
      category: entry.category,
      styles: STYLES.filter(style=>entry.fonts && entry.fonts[style]),
      popularity: entry.popularity || Number.MAX_SAFE_INTEGER
    }))
    .filter(entry=>entry.styles.length)
    .sort((a, b)=>a.popularity-b.popularity || a.family.localeCompare(b.family))
    .map(({ family, category, styles })=>({ family, category, styles }));
}

// A family name is put into a URL and later into an @font-face rule, so keep it to what Google
// actually names its families: letters, digits and spaces.
export function isValidFamily(family) {
  return typeof family == 'string' && /^[A-Za-z0-9][A-Za-z0-9 ]{0,60}$/.test(family);
}

export function stylesheetURL(family, styles) {
  const wanted = STYLES.filter(style=>styles.indexOf(style) != -1);
  if(!wanted.length)
    throw new Logging.UserError(400, 'No known font style was asked for.');
  // css2 wants the axis tuples sorted, italic last and weights ascending within each.
  const tuples = wanted
    .map(style=>[ style.endsWith('i') ? 1 : 0, parseInt(style, 10) ])
    .sort((a, b)=>a[0]-b[0] || a[1]-b[1])
    .map(([ italic, weight ])=>`${italic},${weight}`);
  return `${STYLESHEET_URL}?family=${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@${tuples.join(';')}`;
}

// The font files Google serves for a family. Asked for without a browser's user agent, the answer is
// one plain TrueType file per style instead of the dozens of unicode-range woff2 slices a browser
// gets - one file per style is what a game can carry along in its assets.
export async function fontFaces(family, styles) {
  if(!isValidFamily(family))
    throw new Logging.UserError(400, 'That is not a Google Fonts family name.');
  const response = await fetch(stylesheetURL(family, styles)).catch(_=>null);
  if(!response || !response.ok)
    throw new Logging.UserError(404, `Google Fonts does not offer "${family}" in the requested styles.`);
  const faces = parseFontFaces(await response.text());
  if(!faces.length)
    throw new Logging.UserError(404, `Google Fonts returned no font file for "${family}".`);
  return faces;
}

export function parseFontFaces(stylesheet) {
  const faces = [];
  for(const block of String(stylesheet).match(/@font-face\s*{[^}]*}/g) || []) {
    const url = (block.match(/src:\s*url\(([^)]+)\)/) || [])[1];
    if(!url || !url.startsWith(FILE_HOST))
      continue;
    faces.push({
      url,
      weight: parseInt((block.match(/font-weight:\s*(\d+)/) || [])[1], 10) || 400,
      style: (block.match(/font-style:\s*italic/) || []).length ? 'italic' : 'normal'
    });
  }
  return faces;
}

export async function download(url) {
  if(!url.startsWith(FILE_HOST))
    throw new Logging.UserError(400, 'Font files are only downloaded from Google Fonts.');
  const response = await fetch(url).catch(_=>null);
  if(!response || !response.ok)
    throw new Logging.UserError(502, 'Downloading a font file from Google Fonts failed.');
  if(+response.headers.get('content-length') > FILE_MAX_SIZE)
    throw new Logging.UserError(400, 'That font file is too big to be used in a game.');
  const content = Buffer.from(await response.arrayBuffer());
  if(content.length > FILE_MAX_SIZE)
    throw new Logging.UserError(400, 'That font file is too big to be used in a game.');
  return content;
}

export default { families, parseFamilies, isValidFamily, stylesheetURL, fontFaces, parseFontFaces, download, STYLES };
