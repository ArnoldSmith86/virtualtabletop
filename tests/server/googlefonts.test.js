import GoogleFonts from '../../server/googlefonts.mjs';

// The shape of https://fonts.google.com/metadata/fonts, cut down to the fields that are read.
const catalog = `)]}'\n${JSON.stringify({
  familyMetadataList: [
    { family: 'Lobster', category: 'Display', popularity: 143, isOpenSource: true, fonts: { '400': {} } },
    { family: 'Inter', category: 'Sans Serif', popularity: 4, isOpenSource: true, fonts: { '300': {}, '400': {}, '700': {}, '400i': {}, '700i': {} } },
    { family: 'Brand Font', category: 'Sans Serif', popularity: 1, isOpenSource: false, fonts: { '400': {} } },
    { family: 'Some Icons', category: 'Icons', popularity: 2, isOpenSource: true, fonts: { '500': {} } }
  ]
})}`;

describe('server/googlefonts.mjs', function() {
  test('reads the catalog Google guards against being loaded as a script', function() {
    expect(GoogleFonts.parseFamilies(catalog)).toEqual([
      { family: 'Inter', category: 'Sans Serif', styles: [ '400', '700', '400i', '700i' ] },
      { family: 'Lobster', category: 'Display', styles: [ '400' ] }
    ]);
  });

  // a family whose only weight is one nothing can select, and a family nobody may redistribute, would
  // both be dead entries in the picker
  test('leaves out the families an imported font can not be made of', function() {
    const families = GoogleFonts.parseFamilies(catalog).map(entry=>entry.family);
    expect(families).not.toContain('Some Icons');
    expect(families).not.toContain('Brand Font');
  });

  test('asks css2 for the wanted styles, italic last and weights ascending', function() {
    expect(GoogleFonts.stylesheetURL('Playfair Display', [ '700i', '400' ]))
      .toEqual('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;1,700');
    expect(_=>GoogleFonts.stylesheetURL('Lobster', [ '500' ])).toThrow();
  });

  test('only accepts family names Google actually uses', function() {
    expect(GoogleFonts.isValidFamily('Playfair Display')).toBe(true);
    expect(GoogleFonts.isValidFamily('../../etc/passwd')).toBe(false);
    expect(GoogleFonts.isValidFamily('Lobster"; }')).toBe(false);
  });

  test('takes one font file per style out of the stylesheet', function() {
    const stylesheet = `
      @font-face {
        font-family: 'Inter';
        font-style: italic;
        font-weight: 700;
        src: url(https://fonts.gstatic.com/s/inter/v20/italicbold.ttf) format('truetype');
      }
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 400;
        src: url(https://fonts.gstatic.com/s/inter/v20/regular.ttf) format('truetype');
      }
    `;
    expect(GoogleFonts.parseFontFaces(stylesheet)).toEqual([
      { url: 'https://fonts.gstatic.com/s/inter/v20/italicbold.ttf', weight: 700, style: 'italic' },
      { url: 'https://fonts.gstatic.com/s/inter/v20/regular.ttf', weight: 400, style: 'normal' }
    ]);
  });

  // the stylesheet decides which files are downloaded, so a rule pointing somewhere else must not turn
  // the import into a request to an address of somebody else's choosing
  test('ignores font files that do not come from Google', function() {
    const stylesheet = `@font-face { font-family: 'Evil'; font-style: normal; font-weight: 400; src: url(http://example.com/evil.ttf) format('truetype'); }`;
    expect(GoogleFonts.parseFontFaces(stylesheet)).toEqual([]);
    return expect(GoogleFonts.download('http://example.com/evil.ttf')).rejects.toThrow();
  });
});
