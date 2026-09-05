// The Google Fonts dialog, shared by everything in the editor that lets a text pick a font family: the
// deck editor's font row for face objects, and the font inputs of the widget sidebar.
//
// A font family has to be declared for the document before a text can be drawn in it. The client ships a
// handful (client/css/fonts.css); every other family is imported into a widget's "fonts" property, from
// where the widget declares it as @font-face rules (see Widget.applyFonts). Importing downloads the font
// files into the game's assets, so the game carries its fonts the way it carries its images.
//
// The dialog is opened through a host object which says what it is editing:
//   title/intro       - the headline and the paragraph below it
//   fonts()           - the descriptors the thing being edited carries right now
//   addLabel(updating)- what the button at the bottom does, phrased for this host
//   usageText(family) - optional: what keeping a family costs, shown next to it; the generic count of
//                       what the game draws in it stands in when the host has nothing better to say
//   add(fonts, family, updating) - async: store the new list and use the family for the text it was
//                       opened from, as one action
//   remove(family)    - async: take a family's files back out
//   refresh()         - called after either, so whatever opened the dialog redraws

let builtInFamilies = null;

// The families the client itself declares, read back from the @font-face rules of its stylesheets instead
// of being listed here so a dropdown cannot drift away from what fonts.css ships. The style elements the
// widgets declare their imported fonts in are left out, and so are the symbol and emoji fonts - those draw
// glyphs, not text, and are picked through the symbol pickers. The stylesheets are part of the bundle and
// do not change while the page is open, so this is walked once.
function builtInFontFamilies() {
  if(builtInFamilies)
    return builtInFamilies;
  const symbolFonts = [ 'VTT-Symbols', 'Material Symbols', 'Material Symbols NoFill', 'Noto Emoji' ];
  const families = new Set();
  const collect = rules=>{
    for(const rule of rules || []) {
      if(rule.cssRules)
        collect(rule.cssRules); // an @media or @container the declarations sit in
      if(!(rule instanceof CSSFontFaceRule))
        continue;
      const family = String(rule.style.getPropertyValue('font-family')).replace(/^["']|["']$/g, '');
      if(family && symbolFonts.indexOf(family) == -1)
        families.add(family);
    }
  };
  for(const sheet of document.styleSheets) {
    if(String((sheet.ownerNode && sheet.ownerNode.id) || '').startsWith('FONTS_'))
      continue;
    try {
      collect(sheet.cssRules);
    } catch(e) {
      continue; // a stylesheet of another origin does not hand out its rules
    }
  }
  builtInFamilies = [ ...families ].sort();
  return builtInFamilies;
}

// The families every widget of this game has imported, except the one whose fonts the caller owns. A family
// is global to the document once a widget declares it (see Widget.applyFonts), so any text can be drawn in
// one of those - but it goes away with the widget that brought it, which is why they are offered as a group
// of their own.
function importedFontFamilies(ownScope) {
  const families = new Set();
  for(const widget of widgets.values())
    if(widget.cssScope != ownScope)
      for(const family of fontFamilyList(widget.get('fonts')))
        families.add(family);
  return [ ...families ].sort();
}

// The families of a list of @font-face descriptors, in the order they were added.
function fontFamilyList(fonts) {
  return [ ...new Set((fonts || []).filter(font=>font && font.family).map(font=>String(font.family))) ];
}

// A family name as it has to be written into a font-family declaration. Quoted, because an unquoted family
// has to be a sequence of css identifiers, which no family with a word starting with a digit is ("Exo 2",
// "Press Start 2P") - a browser drops the whole declaration for those and the text falls back to the
// default font without saying so.
function cssFontFamilyValue(family) {
  return `"${String(family).replace(/["'\\;{}]/g, '').trim()}"`;
}

// The family a font-family declaration draws its text in, so a written declaration can be matched against
// the families that are offered. A declaration is a fallback list; the first entry is the one that is used
// wherever it is available.
function cssFontFamilyName(value) {
  return String(value === null || value === undefined ? '' : value).split(',')[0].trim().replace(/^["']|["']$/g, '');
}

// Whether a css value - a declaration string, a flat object of declarations or the nested per-class form -
// draws its text in a family.
function cssNamesFontFamily(css, family) {
  if(typeof css == 'string')
    return cssFontFamilyName((css.match(/(?:^|;)\s*font-family\s*:\s*([^;]+)/i) || [])[1]) == family;
  if(!css || typeof css != 'object')
    return false;
  return Object.entries(css).some(([ key, value ])=>
    key == 'font-family' ? cssFontFamilyName(value) == family : cssNamesFontFamily(value, family));
}

// How much of this game is drawn in a family, so dropping it says what that costs rather than only asking:
// the widgets whose css names it, plus the card texts that name it in a deck's face templates.
function fontUsageText(family) {
  let widgetCount = 0;
  let textCount = 0;
  for(const widget of widgets.values()) {
    if(Object.keys(widget.state).some(property=>(property == 'css' || property.endsWith('CSS')) && cssNamesFontFamily(widget.state[property], family)))
      widgetCount++;
    for(const face of widget.state.faceTemplates || [])
      for(const object of face.objects || [])
        if(object && object.font == family)
          textCount++;
  }
  const parts = [];
  if(widgetCount)
    parts.push(`${widgetCount} widget${widgetCount == 1 ? '' : 's'}`);
  if(textCount)
    parts.push(`${textCount} card text${textCount == 1 ? '' : 's'}`);
  return parts.length ? `used by ${parts.join(' and ')}` : 'not used yet';
}

// Fills a select with every family a text of this game can be drawn in, grouped by where it comes from.
// options.owned are the families of the thing being edited, options.ownLabel/otherLabel name the two
// imported groups, and options.current keeps a family that is in neither group reachable.
function addFontFamilyOptions(select, addOption, options) {
  const owned = options.owned || [];
  if(owned.length) {
    const group = document.createElement('optgroup');
    group.label = options.ownLabel;
    select.append(group);
    for(const family of owned)
      addOption(family, family, group);
  }
  const shipped = builtInFontFamilies();
  const builtIn = document.createElement('optgroup');
  builtIn.label = 'Fonts VirtualTabletop ships with';
  select.append(builtIn);
  for(const family of shipped)
    addOption(family, family, builtIn);
  const others = importedFontFamilies(options.ownScope).filter(family=>owned.indexOf(family) == -1 && shipped.indexOf(family) == -1);
  if(others.length) {
    const group = document.createElement('optgroup');
    group.label = options.otherLabel;
    select.append(group);
    for(const family of others)
      addOption(family, family, group);
  }
  // A family written by hand (or one that came with a widget whose fonts were removed) is in neither list,
  // so it gets an entry of its own rather than the row silently showing something else.
  const current = options.current;
  if(current && ![ ...select.querySelectorAll('option') ].some(option=>option.value == current)) {
    const group = document.createElement('optgroup');
    group.label = 'Not declared in this game';
    select.append(group);
    addOption(current, current, group);
  }
}

class FontPicker {
  constructor() {
    this.host = null;
    this.selection = null;
    this.googleFonts = null;
    this.googleFontsError = null;
    this.previewFace = null;
    this.initialized = false;
  }

  initializeDOM() {
    if(this.initialized)
      return;
    this.initialized = true;
    // The dialog is positioned against the editor rather than the room: inside #roomArea, a size container,
    // its fixed positioning would be clipped to the scaled board.
    $('#editor').append($('#fontPickerOverlay'));
    $('#fontPickerClose').onclick = _=>this.close();
    $('#fontPickerSearch').oninput = _=>this.renderGoogleFontList();
    $('#fontPickerAdd').onclick = _=>this.addSelectedFont();
  }

  open(host) {
    this.initializeDOM();
    this.host = host;
    this.selection = null;
    $('#fontPickerTitle').textContent = host.title;
    $('#fontPickerIntro').textContent = host.intro;
    $('#fontPickerSearch').value = '';
    this.setStatus('');
    this.render();
    showOverlay('fontPickerOverlay');
    // the catalog is a couple of thousand families, so the dialog opens on what is already there and fills
    // its list once the download is in
    this.loadGoogleFonts().then(_=>{
      if(this.host === host)
        this.render();
    });
  }

  close() {
    this.host = null;
    this.selection = null;
    this.setPreview(null);
    showOverlay();
  }

  ownedFamilies() {
    return this.host ? fontFamilyList(this.host.fonts()) : [];
  }

  // The catalog is fetched once per session and kept.
  async loadGoogleFonts() {
    if(this.googleFonts)
      return this.googleFonts;
    this.googleFontsError = null;
    try {
      const response = await fetch('api/googleFonts');
      if(!response.ok)
        throw new Error(await response.text());
      this.googleFonts = await response.json();
    } catch(e) {
      this.googleFontsError = String(e.message || e);
    }
    return this.googleFonts;
  }

  // The catalog is fetched once per session, so a failed fetch would otherwise stay failed until the page
  // is loaded again.
  async reloadGoogleFonts() {
    this.googleFonts = null;
    this.googleFontsError = null;
    this.renderGoogleFontList();
    await this.loadGoogleFonts();
    this.render();
  }

  render() {
    if(!this.host)
      return;
    this.renderOwnedFontList();
    this.renderGoogleFontList();
    this.renderDetails();
  }

  // What one @font-face descriptor is called in the dialog - the same names the style check boxes use.
  styleName(font) {
    const weight = String(font.weight || 400);
    const italic = font.style == 'italic';
    const named = { '400': 'Regular', '700': 'Bold' }[weight];
    return named ? (italic ? (weight == '700' ? 'Bold italic' : 'Italic') : named) : `${weight}${italic ? ' italic' : ''}`;
  }

  // What the catalog calls the style one descriptor carries ("400", "700i", ...).
  styleKey(font) {
    return `${font.weight || 400}${font.style == 'italic' ? 'i' : ''}`;
  }

  // The styles there are files for, for one family.
  ownedStyles(family) {
    return [ ...new Set(this.host.fonts().filter(font=>font && font.family == family).map(font=>this.styleKey(font))) ];
  }

  // The fonts already carried, each with what it costs to keep and a button to drop it again.
  renderOwnedFontList() {
    const target = $('#fontPickerOwned');
    target.innerHTML = '';
    const families = this.ownedFamilies();
    if(!families.length) {
      div(target, 'fontPickerEmpty').textContent = 'No font has been imported here yet.';
      return;
    }
    for(const family of families) {
      const styles = this.host.fonts().filter(font=>font && font.family == family).map(font=>this.styleName(font));
      const used = (this.host.usageText || fontUsageText)(family);
      const entry = div(target, 'fontPickerOwnedEntry');
      const name = div(entry, 'fontPickerOwnedName');
      name.textContent = family;
      name.style.fontFamily = `"${family}"`;
      div(entry, 'fontPickerOwnedStyles').textContent = [ styles.join(', '), used ].filter(text=>text).join(' · ');
      const remove = document.createElement('button');
      remove.setAttribute('icon', 'delete_forever');
      remove.title = `Remove "${family}" - the texts drawn in it fall back to the default font`;
      remove.setAttribute('aria-label', remove.title);
      remove.onclick = _=>this.removeFont(family);
      entry.append(remove);
    }
  }

  // The catalog, filtered by the search field. Only the first 200 matches are drawn: the list is scrolled
  // through, not read to its end, and a few thousand rows make every keystroke in the search field lag.
  renderGoogleFontList() {
    const target = $('#fontPickerList');
    const hint = $('#fontPickerHint');
    target.innerHTML = '';
    hint.textContent = '';
    if(this.googleFontsError) {
      div(target, 'fontPickerEmpty').textContent = 'The list of Google fonts could not be loaded.';
      const retry = document.createElement('button');
      retry.textContent = 'Try again';
      retry.onclick = _=>this.reloadGoogleFonts();
      hint.textContent = `${this.googleFontsError} `;
      hint.append(retry);
      return;
    }
    if(!this.googleFonts) {
      div(target, 'fontPickerEmpty').textContent = 'Loading the list of Google fonts…';
      return;
    }
    const search = $('#fontPickerSearch').value.trim().toLowerCase();
    const matches = this.googleFonts.filter(font=>font.family.toLowerCase().indexOf(search) != -1);
    const shown = matches.slice(0, 200);
    const owned = this.ownedFamilies();
    for(const font of shown) {
      const entry = div(target, 'fontPickerEntry');
      entry.classList.toggle('selected', !!this.selection && this.selection.family == font.family);
      div(entry, 'fontPickerName').textContent = font.family;
      if(owned.indexOf(font.family) != -1)
        div(entry, 'fontPickerInGame').textContent = 'imported';
      div(entry, 'fontPickerCategory').textContent = font.category || '';
      entry.onclick = _=>this.selectGoogleFont(font);
    }
    if(!shown.length)
      div(target, 'fontPickerEmpty').textContent = 'No Google font has that in its name.';
    if(matches.length > shown.length)
      hint.textContent = `${matches.length-shown.length} more fonts match - type more of the name to narrow it down.`;
  }

  // The style a family is previewed in and always downloaded with: Regular, unless the family does not have
  // one (a handful only come as Bold or as Italic), in which case the first style it does offer stands in.
  forcedStyle(styles) {
    return styles.indexOf('400') != -1 ? '400' : styles[0];
  }

  // What the style boxes of a family open on: the ones there are already files for ("owned"), and the set
  // that is checked - those plus the previewed style. Adding a family replaces its files, so a family the
  // catalog marks as imported has to open on what is there, or adding it again throws the rest away.
  initialStyles(font) {
    const owned = this.ownedStyles(font.family).filter(style=>font.styles.indexOf(style) != -1);
    return { owned, chosen: [ ...new Set([ this.forcedStyle(font.styles), ...owned ]) ] };
  }

  // Choosing a family in the list loads that style so the preview shows the real thing. The preview route
  // does not store anything, so looking through the catalog leaves nothing behind on the server.
  async selectGoogleFont(font) {
    const forced = this.forcedStyle(font.styles);
    const { owned, chosen } = this.initialStyles(font);
    this.selection = { family: font.family, styles: font.styles, chosen, forced, owned };
    this.render();
    // The preview and the style boxes appear below the list, which in a short window means below the fold -
    // so bring them into view rather than leaving the click looking like it did nothing.
    $('#fontPickerDetails').scrollIntoView({ block: 'end' });
    this.setStatus(`Loading ${font.family}…`);
    try {
      await this.setPreview(font.family, forced);
      if(!this.selection || this.selection.family != font.family)
        return;
      this.setStatus('');
    } catch(e) {
      this.setStatus(String(e.message || e));
    }
    this.render();
  }

  async importGoogleFont(family, styles) {
    const response = await fetch(`api/googleFonts/${encodeURIComponent(family)}?styles=${styles.join(',')}`, { method: 'PUT' });
    if(!response.ok)
      throw new Error(await response.text());
    return await response.json();
  }

  // The font being looked at, loaded for the editor only - the game gets it when it is actually added, so
  // browsing the catalog changes neither the game nor what the server stores. It is registered under a name
  // of its own so a family the game already carries keeps being drawn from the game's own files.
  async setPreview(family, style) {
    const preview = $('#fontPickerPreview');
    if(this.previewFace) {
      document.fonts.delete(this.previewFace);
      this.previewFace = null;
    }
    preview.style.fontFamily = '';
    if(!family)
      return;
    const response = await fetch(`api/googleFonts/${encodeURIComponent(family)}/preview?styles=${encodeURIComponent(style)}`);
    if(!response.ok)
      throw new Error(await response.text());
    const face = new FontFace(`${family} (preview)`, await response.arrayBuffer());
    await face.load();
    if(!this.selection || this.selection.family != family)
      return;
    this.previewFace = face;
    document.fonts.add(face);
    preview.style.fontFamily = `"${family} (preview)"`;
  }

  setStatus(message) {
    $('#fontPickerStatus').textContent = message || '';
  }

  // The styles of the chosen family, as checkboxes: every style is a font file of its own that the game has
  // to carry, so only the ones a text actually needs are downloaded. The style the preview uses is always
  // part of it.
  renderDetails() {
    const target = $('#fontPickerStyles');
    target.innerHTML = '';
    const add = $('#fontPickerAdd');
    const selection = this.selection;
    add.disabled = !selection;
    // A family that is already carried is updated rather than added - the box that is checked decides which
    // styles it ends up with.
    const updating = !!selection && this.ownedFamilies().indexOf(selection.family) != -1;
    add.textContent = this.host.addLabel(updating);
    if(!selection) {
      $('#fontPickerPreview').classList.remove('active');
      return;
    }
    $('#fontPickerPreview').classList.add('active');
    div(target, 'fontPickerSubHeader').textContent = `Styles of ${selection.family} to download`;
    for(const [ style, name ] of [ [ '400', 'Regular' ], [ '700', 'Bold' ], [ '400i', 'Italic' ], [ '700i', 'Bold italic' ] ]) {
      if(selection.styles.indexOf(style) == -1)
        continue;
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = selection.chosen.indexOf(style) != -1;
      box.disabled = style == selection.forced;
      const imported = (selection.owned || []).indexOf(style) != -1;
      if(box.disabled)
        label.title = 'The style the preview is drawn in is always downloaded';
      else if(imported)
        label.title = 'This style is already imported - unchecking it takes its file out again';
      box.onchange = _=>{
        selection.chosen = selection.chosen.filter(chosen=>chosen != style);
        if(box.checked)
          selection.chosen.push(style);
      };
      label.append(box, document.createTextNode(imported ? `${name} (imported)` : name));
      target.append(label);
    }
  }

  // Downloads the chosen styles into the game's assets and hands the new font list - and the family - to
  // the host, which stores it and gives the family to the text the dialog was opened from.
  async addSelectedFont() {
    const selection = this.selection;
    const host = this.host;
    if(!selection || !host)
      return;
    this.setStatus(`Downloading ${selection.family}…`);
    let fonts;
    try {
      fonts = await this.importGoogleFont(selection.family, selection.chosen);
    } catch(e) {
      this.setStatus(String(e.message || e));
      return;
    }

    // The family's files are replaced rather than appended to, so the boxes decide the whole set of styles
    // it ends up with - which is also why they open on the styles that are already there.
    const updating = this.ownedFamilies().indexOf(selection.family) != -1;
    const kept = host.fonts().filter(font=>!font || font.family != selection.family);
    await host.add(kept.concat(fonts), selection.family, updating);

    this.close();
    host.refresh();
  }

  // Dropping a font takes its files out of the game. The texts keep naming it, so they fall back to the
  // default font - which is what a widget that was copied without its fonts looks like too.
  async removeFont(family) {
    const host = this.host;
    if(!host)
      return;
    await host.remove(family);
    this.render();
    host.refresh();
  }
}

const fontPicker = new FontPicker();

// Opens the dialog on a widget: the font files it imports are stored in its own "fonts", so its texts carry
// their fonts along when it is copied into another game. options.applyFamily - when the dialog was opened
// from a text rather than from the property itself - gives that text the family that was added, in the same
// action; options.setFonts writes the property through the editor path of whatever opened the dialog.
function openWidgetFontPicker(widget, options={}) {
  const setFonts = options.setFonts || (fonts=>{
    setDeltaCause(`${getPlayerDetails().playerName} changed the fonts of ${widget.id} in editor`);
    return widget.set('fonts', fonts);
  });
  fontPicker.open({
    title: `Fonts of ${widget.id}`,
    intro: 'Pick a font from Google Fonts to draw this text in. It is downloaded into this game\'s assets and listed on this widget, so it is saved and shared with the game and no player\'s browser ever has to ask Google for it.',
    addLabel: updating=>`${updating ? 'Update font' : 'Add font'}${options.applyFamily ? ' & use for this text' : ''}`,
    fonts: _=>widget.get('fonts') || [],
    add: async (fonts, family)=>{
      batchStart();
      try {
        await setFonts(fonts);
        if(options.applyFamily)
          await options.applyFamily(family);
      } finally {
        batchEnd();
      }
    },
    remove: async family=>setFonts((widget.get('fonts') || []).filter(font=>!font || font.family != family)),
    refresh: options.refresh || (_=>{})
  });
}
