let jeEnabled = null;
let jeRoutineLogging = false;
let jeMode = null;
let jeWidget = null;
let jePlainWidget = null;
let jeStateBefore = null;
let jeStateBeforeRaw = null;
let jeStateNow = null;
let jeJSONerror = null;
let jeCommandError = null;
let jeCommandWithOptions = null;
let jeIsSVG = {};
// how long an image that could not be read stays remembered as unreadable, in step with the retry
// the engine does for the same file (UNREADABLE_RETRY_MS in main.js)
const jeSVGRetryDelay = 30000;
let jeWidgetHighlighting = true;
let jeDebugViewing = null;
let jeInMacroExecution = false;
let jeContext = null;
let jeSecondaryWidget = null;
let jeDeltaIsOurs = false;
let jeMouseButtonIsDown = false;
let jeKeyIsDown = false;
let jeKeyIsDownDeltas = [];
let jeKeyword = '';
let jeTabSearchActive = false;
let jeTabSearchFilter = '';
let jeTabSearchHighlightIndex = -1;
let jeTabKeyHeld = false;
let jeTabArrowKeysUsed = false;
let jeIgnoreBlurOnce = false;
const jeState = {
  ctrl: false,
  shift: false,
  mouseX: 0,
  mouseY: 0,
  widget: null
};

const jeMacroPreset = `
// this code will be called for
// every widget as variable w

// variable v is a persistent object you
// can use to store other information

// EXAMPLES

// add a property to all cards of a deck
/*
if(w.deck == "deckName")
  w.customVariable = true;
*/

// change ID of matching widgets
/*
var match = w.id.match(/^Player 3 - ((First|Second).*)$/)
if(match)
  w.id = "Player 5 - "+match[1]
*/

// move matching widgets to the left
/*
if(w.id.match(/^Player [13] - (Score|Seat)/))
  w.x -= 20;
*/

// change all widget IDs to a counter prefixed by "w"
/*
if(!v.i)
  v.i = 1
w.id = "w"+v.i
v.i++
*/

// Adds pseudo players to seats
/*
if (w.type=="seat" && w.player==null) {
  w.player = "player " + (w.index||1)
  w.color = "hsl("+Math.floor(Math.random() * 360)+", 100%, 50%)"
}
*/
`;

const jeOrder = [ 'type', 'id#', 'parent', 'fixedParent', 'deck', 'cardType', 'index*', 'owner#', 'x*', 'y*', 'width*', 'height*', 'borderRadius', 'scale', 'rotation#', 'layer', 'z', 'inheritChildZ#', 'movable*', 'movableInEdit*#' ];

// whether a file is an SVG is decided by fetchSVG() (main.js) - the same call
// the engine and the SVG replacements editor make, so the three cannot disagree
// about the same file. It also spares decoding a whole bitmap as text just to
// find no <svg> in it, and does not call a PNG that happens to contain the
// three bytes "svg" somewhere an SVG. A file that could not be read at all is
// answered with undefined: that says nothing about what the file is, so it must
// not be remembered as a verdict - fetchSVG() retries such a file as well.
async function checkIfSVG(url) {
  try {
    return (await fetchSVG(url)) !== null;
  } catch (e) {
    return undefined;
  }
}

// true while a "write" face object of a deck is selected - a box players can type into while playing
function jeIsWriteFaceObject() {
  return jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].type == 'write';
}

const jeCommands = [
  /* Just for editing convenience, the top (command) buttons are listed first */
  {
    id: 'je_copyState',
    name: 'Copy state from another room/server',
    icon: '[import_room]',
    forceKey: 'C',
    options: [ { type: 'string', label: 'URL' } ],
    call: async function(options) {
      const sourceURL = options.URL.replace(/\/[^\/]+$/, a=>`/state${a}`);
      const targetURL = location.href.replace(/\/[^\/]+$/, a=>`/state${a}`);

      try {
        const sourceResp = await fetch(sourceURL);
        if (!sourceResp.ok) throw new Error('Failed to fetch source');
        const data = await sourceResp.text();

        const targetResp = await fetch(targetURL, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: data
        });
        if (!targetResp.ok) throw new Error('Failed to update target');
      } catch (err) {
        alert(err.message);
      }
    }
  },
  {
    id: 'je_callMacro',
    name: _=>jeMode == 'macro' ? 'Call' : 'Macro',
    icon: _=>jeMode == 'macro' ? '[play_arrow]' : '[routine]',
    forceKey: 'M',
    call: async function() {
      if(jeMode != 'macro') {
        jeWidget = null;
        jeMode = 'macro';
        jeSetEditorContent(jeMacroPreset);
        jeColorize();
        editPanel.style.setProperty('--treeHeight', "20%");
      } else {
        jeJSONerror = null;
        jeInMacroExecution = true;
        try {
          const macro = new Function(`"use strict";return (function(w, v) {${jeGetEditorContent()}})`)();
          const variableState = {};
          for(const w of [...widgets.values()]) { // shallow copy because we might create new widgets by changing the id
            const s = JSON.stringify(w.state);
            const newState = JSON.parse(s);
            macro(newState, variableState);
            await updateWidget(JSON.stringify(newState), s);
          }
        } catch(e) {
          jeJSONerror = e;
        }
        jeDisplayTree();
        jeInMacroExecution = false;
      }
      jeShowCommands();
    }
  },
  {
    id: 'je_showWidget',
    name: 'Show this widget below',
    icon: '[visibility]',
    forceKey: 'S',
    call: async function() {
      if(jeMode == 'multi')
        jeSecondaryWidget = jeGetEditorContent();
      else if(jeWidget !== undefined && jeWidget && (jeSecondaryWidget === null || jeStateNow.id != JSON.parse(jeSecondaryWidget).id))
        jeSecondaryWidget = JSON.stringify(jeWidget.state, null, '  ');
      else
        jeSecondaryWidget = null;
      jeShowCommands();
    }
  },
  {
    id: 'je_duplicateWidget',
    name: 'Duplicate widget',
    icon: '[auto_awesome]',
    forceKey: 'D',
    show: _=>jeStateNow,
    options: [
      { label: 'Increment IDs',          type: 'select', options: [ { value: 'Numbers', text: 'Numbers' }, { value: 'Letters', text: 'Letters' }, { value: '', text: 'None'  } ] },
      { label: 'Increment In',           type: 'string',   value: 'dropTarget,hand,index,inheritFrom,linkedToSeat,onlyVisibleForSeat,text' },
      { label: 'Copy using inheritFrom', type: 'checkbox', value: false },
      { label: 'Inherit properties',     type: 'string', value: '' },
      { label: 'Copy recursively',       type: 'checkbox', value: true  },
      // getters because jeCommands is built at load time, before the game's viewport is known
      { label: 'X offset',               type: 'number',   value: 0,   get min() { return -viewportConfig.targetWidth  }, get max() { return viewportConfig.targetWidth  } },
      { label: 'Y offset',               type: 'number',   value: 0,   get min() { return -viewportConfig.targetHeight }, get max() { return viewportConfig.targetHeight } },
      { label: '# Copies X',             type: 'number',   value: 1,   min:     0, max:  100 },
      { label: '# Copies Y',             type: 'number',   value: 0,   min:     0, max:  100 }
    ],
    call: async function(options) {
      for(const id of jeSelectedIDs()) {
        const problems = [];
        const clonedWidget = (await duplicateWidget(widgets.get(id), options['Copy recursively'], options['Copy using inheritFrom'], options['Inherit properties'].split(',').map(e => e.trim()),options['Increment IDs'], options['Increment In'].split(','), options['X offset'], options['Y offset'], options['# Copies X'], options['# Copies Y'], problems))[0];
        if(problems.length)
          jeJSONerror = problems.join('\n');
        if(clonedWidget) {
          setSelection([ clonedWidget ]);
          jeStateNow.id = '###SELECT ME###';
          jeSetAndSelect(clonedWidget.id);
          jeStateNow.id = clonedWidget.id;
        }
      }
    }
  },
  {
    id: 'je_SVGColors',
    name: 'Show colors in SVG image',
    icon: 'colors',
    show: function() {
      if (!jeStateNow || !jeStateNow.image) return false;
      const url = jeStateNow.image;
      if (typeof jeIsSVG[url] === 'boolean') return jeIsSVG[url];
      if (url.match(/\.svg$/i))
        return true;
      // Only a definite answer is remembered as a verdict - a file that could not be read says
      // nothing about what it is, and fetchSVG() retries it. What is remembered for such a file is
      // *when* it failed, because the buttons are redrawn by plenty of things - every keystroke in
      // the JSON pane among them - and a dead URL would otherwise cost one failing request each.
      // While the request is in flight the url is marked as being asked about, so a failure that
      // redraws the buttons cannot ask for the file again without ever stopping.
      if (jeIsSVG[url] === undefined || jeIsSVG[url].failedAt < Date.now() - jeSVGRetryDelay) {
        jeIsSVG[url] = 'pending';
        checkIfSVG(url).then(result => {
          if (typeof result === 'boolean') {
            jeIsSVG[url] = result;
            jeShowCommands();
          } else {
            jeIsSVG[url] = { failedAt: Date.now() };
          }
        });
      }
      return false;
    },
    call: async function(options) {
      // pressing the button again closes the panel it opened, so it is never left without a way out
      const panel = $('#jeSVGColors');
      if (panel)
        panel.querySelector('.jeSVGColorsClose').click();
      else
        jeSVGColors();
    }
  },
  /* Now the context-dependent stuff */
  {
    id: 'je_toggleBoolean',
    name: 'toggle boolean',
    context: '.*"(true|false)"',
    call: async function() {
      jeInsert(jeContext.slice(1), jeContext[jeContext.length-2], jeContext[jeContext.length-1]=='"false"');
    }
  },
  {
    id: 'je_formatHTML',
    name: 'format HTML',
    context: '^.* ↦ ',
    show: function() {
      const value = jeGetValue();
      if (!value || typeof value !== 'object') return false;
      const key = jeGetLastKey();
      const stringValue = value[key];
      return typeof stringValue === 'string' && /<[^>]+>/.test(stringValue);
    },
    call: async function() {
      const key = jeGetLastKey();
      
      // Get current indentation from the JSON structure
      // Find the line with the property key
      const s = jeCursorOffsets()[0];
      const v = jeGetEditorContent();
      const lines = v.split('\n');
      
      // Find the line containing the property key
      let propertyLineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('"' + key + '"')) {
          propertyLineIndex = i;
          break;
        }
      }
      
      // If not found, use current line
      if (propertyLineIndex === -1) {
        propertyLineIndex = v.substr(0, s).split('\n').length - 1;
      }
      
      const propertyLine = lines[propertyLineIndex] || '';
      const indentMatch = propertyLine.match(/^(\s*)/);
      const propertyIndent = indentMatch ? indentMatch[1] : '';
      
      // Format HTML with indentation (property indent + 2 spaces for HTML content)
      const htmlIndent = propertyIndent + '  ';
      
      let stringStart = -1;
      let stringEnd = -1;
      
      for (let i = s; i >= 0; i--) {
        if (v[i] === '"' && (i === 0 || v[i-1] !== '\\')) {
          stringStart = i;
          break;
        }
      }
      
      for (let i = Math.max(s, stringStart + 1); i < v.length; i++) {
        if (v[i] === '"' && v[i-1] !== '\\') {
          stringEnd = i;
          break;
        }
      }
      
      if (stringStart === -1 || stringEnd === -1) {
        return;
      }
      
      const htmlContent = v.substring(stringStart + 1, stringEnd);
      const formattedHTML = jeFormatHTML(htmlContent, htmlIndent);
      const newContent = v.substring(0, stringStart + 1) + '\n' + formattedHTML + '\n' + propertyIndent + v.substring(stringEnd);
      
      jeSetEditorContent(newContent);
      jeColorize();
      const newStringEnd = stringStart + 1 + formattedHTML.length + 2 + propertyIndent.length;
      jeSelect(stringStart + 1, newStringEnd, true);
    }
  },
  {
    id: 'je_colorPicker',
    name: 'change color',
    options: [ { type: 'color', label: 'color' } ],
    context: '.*#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})|^.* ↦ color',
    call: async function(options) {
      if(options['color']) {
        jeInsert(null, jeGetLastKey(), options['color']);
        jeApplyChanges();
      };
    }
  },
  {
    id: 'je_openWidgetById',
    name: 'open widget by ID',
    context: '.*"([^"]+)"',
    call: async function() {
      const m = jeContext.join('').match(/"([^"]+)"/);
      const w = widgets.get(m[1]);
      setSelection([ w ]);
      jeSelectWidget(w);
    },
    show: function() {
      const m = jeContext.join('').match(/"([^"]+)"/);
      return widgets.has(m[1]);
    }
  },
  {
    id: 'je_uploadAsset',
    name: 'upload a different asset',
    context: '.*"(/assets/[0-9_-]+|/i/[^"]+)"|^.* ↦ image$|^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+ ↦ value$',
    show: _=>!jeGetValue()||!String(jeGetValue()[jeGetLastKey()]).match(/^\/assets\/[0-9_-]+$/),
    call: async function() {
      const a = await uploadAsset();
      if(a) {
        jeInsert(null, jeGetLastKey(), a);
        await jeApplyChanges();
      }
    }
  },
  {
    id: 'je_uploadAssetGeneric',
    name: 'upload a different asset',
    context: '.*',
    show: _=>jeGetValue()&&String(jeGetValue()[jeGetLastKey()]).match(/^\/assets\/[0-9_-]+$/),
    call: async function() {
      const a = await uploadAsset();
      if(a) {
        jeInsert(null, jeGetLastKey(), a);
        await jeApplyChanges();
      }
    }
  },
  {
    id: 'je_symbolPickerAsset',
    name: 'pick an asset from the symbol picker',
    context: '.*"(/assets/[0-9_-]+|/i/[^"]+)"|^.* ↦ image$|^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+ ↦ value$',
    show: function() {
      const current = jeGetValueAt('objects');
      if(Array.isArray(current)) {
        const index = jeGetKeyAfter('objects') || 0;
        return typeof current[index] == 'object' && current[index] !== null && current[index].type == 'image';
      }
      return true;
    },
    call: async function() {
      const a = await pickSymbol('images');
      if(a) {
        jeInsert(null, jeGetLastKey(), a.url);
        await jeApplyChanges();
      }
    }
  },
  {
    id: 'je_symbolPickerText',
    name: 'pick a symbol from the symbol picker',
    context: '^(button|basic) ↦ text$',
    call: async function() {
      const a = await pickSymbol('fonts');
      if(a) {
        jeStateNow.classes = a.type;
        jeStateNow.text = '###SELECT ME###';
        jeSetAndSelect(a.type == 'emoji-monochrome' ? a.symbol.substr(1, a.symbol.length-2) : a.symbol.replace(/_NOFILL$/, ''));
        await jeApplyChanges();
      }
    },
    show: function() {
      return [ 'symbols', 'material-symbols', 'material-symbols-nofill', 'emoji-monochrome' ].indexOf(jeStateNow.classes) != -1;
    }
  },
  {
    id: 'je_symbolPickerIcon',
    name: 'pick an icon from the symbol picker',
    context: '^.* ↦ icon( ↦ |$)',
    call: async function() {
      const a = await pickSymbol();
      if(a) {
        const current = jeGetValueAt('icon');
        if(Array.isArray(current)) {
          const index = jeGetKeyAfter('icon') || 0;
          if(typeof current[index] == 'object' && current[index] !== null)
            current[index].name = '###SELECT ME###';
          else
            current[index] = '###SELECT ME###';
          jeSetAndSelect(a.symbol);
          await jeApplyChanges();
        } else if(typeof current == 'object' && current !== null) {
          current.name = '###SELECT ME###';
          await jeSetValueAt('icon', current, a.symbol);
        } else {
          await jeSetValueAt('icon', a.symbol);
        }
      }
    }
  },
  {
    id: 'je_symbolPickerIconDeck',
    name: 'pick an icon from the symbol picker',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    call: async function() {
      const a = await pickSymbol();
      if(a) {
        jeGetValueAt('objects')[jeGetKeyAfter('objects')].value = '###SELECT ME###';
        jeSetAndSelect(a.symbol);
        await jeApplyChanges();
      }
    },
    show: _=>jeGetValueAt('objects')[jeGetKeyAfter('objects')].type == 'icon'
  },
  {
    id: 'je_symbolPickerCustom',
    name: 'upload a custom icon asset',
    context: '^.* ↦ icon( ↦ |$)',
    call: async function() {
      const a = await uploadAsset();
      if(a) {
        const current = jeGetValueAt('icon');
        if(Array.isArray(current)) {
          const index = jeGetKeyAfter('icon') || 0;
          if(typeof current[index] == 'object' && current[index] !== null)
            current[index].name = '###SELECT ME###';
          else
            current[index] = '###SELECT ME###';
          jeSetAndSelect(a);
          await jeApplyChanges();
        } else if(typeof current == 'object' && current !== null) {
          current.name = '###SELECT ME###';
          await jeSetValueAt('icon', current, a);
        } else {
          await jeSetValueAt('icon', a);
        }
      }
    }
  },
  {
    id: 'je_iconToArray',
    name: 'add another icon',
    context: '^.* ↦ icon( ↦ |$)',
    call: async function() {
      const a = await pickSymbol();
      if(a) {
        const current = jeGetValueAt('icon');
        if(Array.isArray(current)) {
          current.push('###SELECT ME###');
          await jeSetValueAt('icon', current, a.symbol);
        } else {
          await jeSetValueAt('icon', [ current, '###SELECT ME###' ], a.symbol);
        }
      }
    },
    show: _=>jeGetValueAt('icon') !== null
  },
  {
    id: 'je_iconToObject',
    name: 'show advanced options',
    context: '^.* ↦ icon( ↦ |$)',
    call: async function() {
      // fill in the default advanced options while keeping whatever is already
      // set (name/scale/color/...), then put the cursor back on the icon name
      const defaults = { name: '###SELECT ME###', scale: 1, offsetX: 0, offsetY: 0, rotation: 0, flip: '', opacity: null, color: '', strokeColor: '', strokeWidth: 0, hoverColor: '', hoverStrokeColor: '', hoverStrokeWidth: null, hoverOpacity: null };
      const expand = current => {
        const isObject = typeof current == 'object' && current !== null;
        const merged = isObject ? Object.assign({}, defaults, current) : Object.assign({}, defaults);
        const name = isObject ? current.name : current;
        merged.name = '###SELECT ME###';
        return { merged, name: typeof name == 'undefined' ? '' : name };
      };
      const icon = jeGetValueAt('icon');
      if(Array.isArray(icon)) {
        const index = jeGetKeyAfter('icon');
        const { merged, name } = expand(icon[index]);
        icon[index] = merged;
        await jeSetValueAt('icon', icon, name);
      } else {
        const { merged, name } = expand(icon);
        await jeSetValueAt('icon', merged, name);
      }
    },
    show: _=>{
      const icon = jeGetValueAt('icon');
      if(Array.isArray(icon)) {
        const element = icon[jeGetKeyAfter('icon')];
        return typeof element == 'string' || typeof element == 'object' && element !== null;
      }
      return typeof icon == 'string' || typeof icon == 'object' && icon !== null;
    }
  },
  {
    id: 'je_iconToString',
    name: 'use default options',
    context: '^.* ↦ icon ↦ ',
    call: async function() {
      const current = jeGetValueAt('icon');
      if(Array.isArray(current)) {
        const name = current[jeGetKeyAfter('icon')].name;
        current[jeGetKeyAfter('icon')] = '###SELECT ME###';
        await jeSetValueAt('icon', current, name);
      } else {
        await jeSetValueAt('icon', current.name);
      }
    },
    show: _=>!Array.isArray(jeGetValueAt('icon')) && typeof jeGetValueAt('icon') == 'object' && jeGetValueAt('icon') !== null || Array.isArray(jeGetValueAt('icon')) && typeof jeGetValueAt('icon')[jeGetKeyAfter('icon')] == 'object'
  },
  {
    id: 'je_uploadAudio',
    name: 'upload audio file',
    context: '^.*\\(AUDIO\\) ↦ source|^.* ↦ clickSound',
    call: async function() {
      const a = await uploadAsset();
      if(a) {
        jeInsert(null, jeGetLastKey(), a);
        await jeApplyChanges();
      }
    }
  },
  {
    id: 'je_audioPicker',
    name: 'pick a sound from the sound picker',
    context: '^.*\\(AUDIO\\) ↦ source|^.* ↦ clickSound',
    call: async function() {
      const a = await pickAudio();
      if(a) {
        jeInsert(null, jeGetLastKey(), a);
        await jeApplyChanges();
      }
    }
  },
  {
    id: 'je_cardDefaultsHeightAndWidth',
    name: 'height and width',
    context: '^deck ↦ cardDefaults',
    call: async function() {     
      jeStateNow.cardDefaults = {
        ...jeStateNow.cardDefaults,
        height: '###SELECT ME###',
        width: 103
      };
      jeSetAndSelect(160);
      await jeApplyChanges();
    },
    show: function() {
      return !(jeStateNow.cardDefaults && (jeStateNow.cardDefaults.height || jeStateNow.cardDefaults.width));
    }
  },
  {
    id: 'je_onPileCreation',
    name: 'onPileCreation template',
    context: '^deck ↦ cardDefaults',
    call: async function() {
      const onPileCreation = {
        handleCSS: '###SELECT ME###',
        handleSize: 'auto',
        handleOffset: 15,
        handlePosition: 'top right'
      };  
      jeStateNow.cardDefaults = {
        ...jeStateNow.cardDefaults,
        onPileCreation: onPileCreation
      };
      jeSetAndSelect('');
      await jeApplyChanges();
    },
    show: function() {
      return !(jeStateNow.cardDefaults && jeStateNow.cardDefaults.onPileCreation);
    }
  },
  {
    id: 'je_cardTypeTemplate',
    name: 'card type template',
    context: '^deck ↦ cardTypes',
    call: async function() {
      const cardType = {};
      const cssVariables = {};
      for(const face of jeStateNow.faceTemplates || []) {
        if(Array.isArray(face.objects)) {
          for(const object of face.objects) {
            for(const property in object.dynamicProperties || {})
              cardType[object.dynamicProperties[property]] = '';
            (JSON.stringify(object.css || '').match(/--[a-zA-Z]+/g) || []).forEach(m=>cssVariables[`${m}: black`]=true);
          }
        }
      }
      const css = Object.keys(cssVariables).join('; ');
      if(css)
        cardType.css = css;
      jeStateNow.cardTypes['###SELECT ME###'] = cardType;
      jeSetAndSelect(generateUniqueWidgetID());
    }
  },
  {
    id: 'je_addCard',
    name: _=>`add card ${widgetFilter(w=>w.get('deck')==jeStateNow.id&&w.get('cardType')==jeContext[2]).length + 1}`,
    context: '^deck ↦ cardTypes ↦ [^"↦]+',
    call: async function() {
      const card = { deck:jeStateNow.id, type:'card', cardType:jeContext[2] };
      await addWidgetLocal(card);
      if(jeStateNow.parent)
        await widgets.get(card.id).moveToHolder(widgets.get(jeStateNow.parent));
      else
        await widgets.get(card.id).updatePiles();
    }
  },
  {
    id: 'je_addAllCards',
    name: _=>`add one card of all ${Object.keys(jeStateNow.cardTypes).length} cardTypes`,
    context: '^deck ↦ cardTypes',
    show: _=>Object.keys(jeStateNow.cardTypes).length,
    call: async function() {
      for(const cardType in jeStateNow.cardTypes) {
        const card = { deck:jeStateNow.id, type:'card', cardType };
        await addWidgetLocal(card);
        if(jeStateNow.parent)
          await widgets.get(card.id).moveToHolder(widgets.get(jeStateNow.parent));
        else
          await widgets.get(card.id).updatePiles();
      }
    }
  },
  {
    id: 'je_removeCard',
    name: _=>`remove card ${widgetFilter(w=>w.get('deck')==jeStateNow.id&&w.get('cardType')==jeContext[2]).length}`,
    context: '^deck ↦ cardTypes ↦ [^"↦]+',
    show: _=>widgetFilter(w=>w.get('deck')==jeStateNow.id&&w.get('cardType')==jeContext[2]).length,
    call: async function() {
      const card = widgetFilter(w=>w.get('deck')==jeStateNow.id&&w.get('cardType')==jeContext[2])[0];
      await removeWidgetLocal(card.get('id'));
    }
  },
  {
    id: 'je_removeAllCards',
    name: _=>`remove all ${widgetFilter(w=>w.get('deck')==jeStateNow.id).length} cards`,
    context: '^deck ↦ cardTypes',
    show: _=>widgetFilter(w=>w.get('deck')==jeStateNow.id).length,
    call: async function() {
      for(const card of widgetFilter(w=>w.get('deck')==jeStateNow.id))
        await removeWidgetLocal(card.get('id'));
    }
  },
  {
    id: 'je_exportCSV',
    name: 'export to CSV',
    options: [
      { label: 'separator',    type: 'select',    options: [ { value: ',', text: ',' }, { value: ';', text: ';' } ] }
    ],
    context: '^deck ↦ cardTypes',
    call: async function(options) {

      function downloadCSV(csv, filename) {
        const csvFile = new Blob([csv], {type:"text/csv"});
        const downloadLink = document.createElement("a");
        downloadLink.download = filename;
        downloadLink.href = window.URL.createObjectURL(csvFile);
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
      }

      function escapeField(v) {
        if(v === undefined)
          return '';
        if(typeof v == 'number')
          return v.toString();

        return typeof v == 'string' && !v.match(/^-?[0-9]*(\.[0-9]+)?(e[0-9]+)?$|^JSON:/) ? `"${v.replace(/"/g, '""')}"` : `"JSON:${JSON.stringify(v).replace(/"/g, '""')}"`;
      }

      const allProperties = [...new Set(Object.values(jeStateNow.cardTypes).reduce((a,t)=>a.concat(...Object.keys(t)), []))];
      let csvText = `id::INTERNAL${options["separator"]}${allProperties.map(escapeField).join(options["separator"])}${options["separator"]}cardCount::INTERNAL\n`;
      for(const [ id, type ] of Object.entries(jeStateNow.cardTypes)) {
        const cardCount = widgetFilter(w=>w.get('deck')==jeStateNow.id&&w.get('cardType')==id).length;
        csvText += `${escapeField(id)}${options["separator"]}${allProperties.map(p=>escapeField(type[p])).join(options["separator"])}${options["separator"]}${cardCount}\n`;
      }
      downloadCSV(csvText, `${jeStateNow.id} cardTypes.csv`);
    }
  },
  {
    id: 'je_importCSV',
    name: 'import from CSV',
    options: [
      { label: 'mode',    type: 'select',    options: [ { value: 'set', text: 'set' }, { value: 'add', text: 'add' } ] }
    ],
    context: '^deck ↦ cardTypes',
    call: async function(options) {

      let csv;
      try {
        csv = await selectFile('TEXT');
      } catch(e) {
        if(e.message !== 'File selection cancelled.')
          alert(`Error: ${e.toString()}`);
        return;
      }

      //source : https://stackoverflow.com/questions/8493195/how-can-i-parse-a-csv-string-with-javascript-which-contains-comma-in-data/41563966#41563966

      function csvToArray(text, delimiter) {
        let p = '', row = [''], ret = [row], i = 0, r = 0, s = !0, l;
        for (l of text) {
            if ('"' === l) {
                if (s && l === p) row[i] += l;
                s = !s;
            } else if (delimiter === l && s) l = row[++i] = '';
            else if ('\n' === l && s) {
                if ('\r' === p) row[i] = row[i].slice(0, -1);
                row = ret[++r] = [l = '']; i = 0;
            } else row[i] += l;
            p = l;
        }
        return ret;
      };

      function unescapeField(v) {
        try {
          if(v.match(/^JSON:/))
            return JSON.parse(v.substr(5));
          else if(v && v.match(/^-?[0-9]*(\.[0-9]+)?(e[0-9]+)?$/))
            return parseFloat(v);
          else if(v)
            return v;
        } catch(e) {
          return e.toString();
        }
      }

      const oldCardTypeIDs = Object.keys(jeStateNow.cardTypes);

      if(options["mode"]== "set")
        jeStateNow.cardTypes = {};

      const lines=csvToArray(csv.content, csv.content.split(';').length > csv.content.split(',').length ? ';' : ',');
      const headers=lines[0].map(unescapeField);
      const targetCounts = {};

      for(let i=1;i<lines.length;i++){

        const obj = {};
        const currentline=lines[i]

        if(lines[i].length == 1 && !lines[i][0])
          continue;

        for(let j=0;j<Math.min(headers.length, currentline.length);j++)
          obj[headers[j]] = unescapeField(currentline[j]);

        const cardTypeID = obj['id::INTERNAL'] || generateUniqueWidgetID();
        delete obj['id::INTERNAL'];

        targetCounts[cardTypeID] = obj['cardCount::INTERNAL'];
        delete obj['cardCount::INTERNAL'];

        jeStateNow.cardTypes[cardTypeID] = obj;
      }

      batchStart();
      setDeltaCause(`${getPlayerDetails().playerName} imported CSV to ${jeStateNow.id} in editor`);

      for(const oldID of oldCardTypeIDs)
        if(!jeStateNow.cardTypes[oldID])
          for(const card of widgetFilter(w=>w.get('deck')==jeStateNow.id&&w.get('cardType')==oldID))
            await removeWidgetLocal(card.get('id'));

      jeSetAndSelect();
      await jeApplyChanges();

      for(const [ id, targetCount ] of Object.entries(targetCounts)) {
        const currentCount = widgetFilter(w=>w.get('deck')==jeStateNow.id&&w.get('cardType')==id).length;
        for(let i=0; i<targetCount-currentCount; ++i) {
          const cardId = await addWidgetLocal({ deck:jeStateNow.id, type:'card', cardType:id });
          if(jeStateNow.parent)
            await widgets.get(cardId).moveToHolder(widgets.get(jeStateNow.parent));
        }
        for(let i=0; i<currentCount-targetCount; ++i) {
          const card = widgetFilter(w=>w.get('deck')==jeStateNow.id&&w.get('cardType')==id)[0];
          await removeWidgetLocal(card.get('id'));
        }
      }

      batchEnd();
    }
  },
  {
    id: 'je_faceTemplate',
    name: 'face template',
    context: '^deck ↦ faceTemplates',
    call: async function() {
      jeStateNow.faceTemplates.push({
        objects: '###SELECT ME###'
      });
      jeSetAndSelect([]);
    }
  },
  {
    id: 'je_grid',
    name: 'grid element',
    context: '^[^ ]* ↦ grid',
    call: async function() {
      const w = widgets.get(jeStateNow.id);
      jeStateNow.grid.push({
        x: '###SELECT ME###',
        y: w.get('height')
      });
      jeSetAndSelect(w.get('width'));
    }
  },
  {
    id: 'je_hexGrid',
    name: 'calculated hex grid',
    context: '^[^ ]* ↦ grid',
    call: async function() {
      const w = widgets.get(jeStateNow.id);
      let hexType = w.get('hexType');
      let isFlat = hexType === 'flat';
      let hexSide = isFlat ? w.get('height') : w.get('width');

      let long = hexSide;
      let short = parseFloat((long * Math.sqrt(3) / 2).toFixed(2));
      let long15 = long * 1.5;
      let long75 = long * 0.75;
      let shortHalf = short / 2;

      let xHex = isFlat ? long15 : short;
      let yHex = isFlat ? short : long15;
      let offsetXHex = isFlat ? long75 : shortHalf;
      let offsetYHex = isFlat ? shortHalf : long75;

      jeStateNow.grid.push(
        {
          "x": '###SELECT ME###',
          "y": yHex,
          "offsetX": offsetXHex,
          "offsetY": offsetYHex
        },
        {
          "x": xHex,
          "y": yHex,
          "offsetX": 0,
          "offsetY": 0
        }       
      );
      jeSetAndSelect(xHex);
    }
  },
  {
    id: 'je_imageTemplate',
    name: 'image template',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects',
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects.push({
        type: 'image',
        x: 0,
        y: 0,
        color: 'transparent',
        width: jeStateNow.cardDefaults && jeStateNow.cardDefaults.width  || 103,
        height: jeStateNow.cardDefaults && jeStateNow.cardDefaults.height || 160,
        dynamicProperties: {
          value: '###SELECT ME###'
        }
      });
      jeSetAndSelect('image');
    }
  },
  {
    id: 'je_iconTemplate',
    name: 'icon template',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects',
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects.push({
        type: 'icon',
        value: '###SELECT ME###',
        x: 0,
        y: 0,
        size: 50,
        rotation: 0,
        color: '',
        strokeColor: '',
        strokeWidth: 0
      });
      jeSetAndSelect('favorite');
    }
  },
  {
    id: 'je_htmlTemplate',
    name: 'html template',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects',
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects.push({
        type: 'html',
        x: 0,
        y: 0,
        value: '###SELECT ME###',
        width: jeStateNow.cardDefaults && jeStateNow.cardDefaults.width  || 103,
        height: jeStateNow.cardDefaults && jeStateNow.cardDefaults.height || 160
      });
      jeSetAndSelect('<h1>hello</h1>world');
    }
  },
  {
    id: 'je_inheritFromString',
    name: 'convert to object',
    context: '^.* ↦ inheritFrom',
    show:  _=>typeof jeStateNow.inheritFrom == "string",
    call: async function() {
      const w = jeStateNow.inheritFrom;
      jeStateNow.inheritFrom = {};
      jeStateNow.inheritFrom[w] = '###SELECT ME###';
      jeSetAndSelect("*");
    }
  },
  {
    id: 'je_inheritFromObject',
    name: 'add field',
    context: '^.* ↦ inheritFrom',
    show:  _=>typeof jeStateNow.inheritFrom == "object" && jeStateNow.inheritFrom[""]==undefined,
    call: async function() {
      jeStateNow.inheritFrom["###SELECT ME###"] = [""];
      jeSetAndSelect("");
    }
  },
  {
    id: 'je_cssString',
    name: 'convert to simple object',
    context: '^.* ↦ (css|[a-z]+CSS)',
    show: function() {
      const cssKind = jeContext.join(' ↦ ').match(this.context)[1];
      return typeof jeStateNow[cssKind] == "string";
    },
    call: async function() {
      const cssKind = jeContext.join(' ↦ ').match(this.context)[1];
      const elements = jeStateNow[cssKind].split(/[;:]/);
      if(elements.length > 1) {
        const selectedKey = elements[0];
        elements[0] = "###SELECT ME###";
        jeStateNow[cssKind] = {};
        for( let i=0; i<Math.floor(elements.length/2); i++)
          jeStateNow[cssKind][elements[2*i].trim()] = elements[2*i+1].trim();
        jeSetAndSelect(selectedKey.trim())
      } else {
        jeStateNow[cssKind] = '###SELECT ME###';
        jeSetAndSelect({});
      }
    }
  },
  {
    id: 'je_cssObject',
    name: 'convert to nested object',
    context: '^.* ↦ css',
    show:  function() {
      if(typeof jeStateNow.css != "object" || jeStateNow.css === null)
        return false;
      for(const property in jeStateNow.css)
        if(typeof jeStateNow.css[property] == "object")
          return false;
      return true;
    },
    call: async function() {
      jeStateNow.css = { '###SELECT ME###': jeStateNow.css };
      jeSetAndSelect("default");
    }
  },
  {
    id: 'je_textTemplate',
    name: 'text template',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects',
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects.push({
        type: 'text',
        x: 0,
        y: 0,
        fontSize: 20,
        textAlign: 'center',
        width: jeStateNow.cardDefaults && jeStateNow.cardDefaults.width  || 103,
        dynamicProperties: {
          value: '###SELECT ME###'
        }
      });
      jeSetAndSelect('text');
    }
  },
  {
    id: 'je_writeTemplate',
    name: 'write template',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects',
    call: async function() {
      // inset a bit and only as tall as a few lines: a card can not be dragged or flipped by its text box,
      // so there has to be some card left around it for the player to grab. The placeholder is what tells a
      // player the card can be written on - without it an empty text box is blank.
      jeStateNow.faceTemplates[+jeContext[2]].objects.push({
        type: 'write',
        placeholder: 'write here…',
        x: 10,
        y: 10,
        fontSize: 14,
        textAlign: 'left',
        width: (jeStateNow.cardDefaults && jeStateNow.cardDefaults.width || 103) - 20,
        height: 60,
        dynamicProperties: {
          value: '###SELECT ME###'
        }
      });
      jeSetAndSelect('note');
    }
  },
  {
    id: 'je_inputField',
    name: 'add field',
    context: '^.* ↦ \\(INPUT\\) ↦ fields',
    call: jeRoutineCall(function(routineIndex, routine, operationIndex, operation) {
      jeGetValue(jeContext.slice(1, routineIndex+4)).push( { type: "###SELECT ME###" } );
      jeSetAndSelect('string');
    })
  },
  {
    id: 'je_classes',
    name: 'classes',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>!jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].classes,
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].classes = '###SELECT ME###';
      jeSetAndSelect('');
    }
  },
  {
    id: 'je_faceTemplate_css',
    name: 'css',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>!jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].css,
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].css = '###SELECT ME###';
      jeSetAndSelect({});
    }
  },
  {
    id: 'je_rotation',
    name: 'rotation',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>!jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].rotation,
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].rotation = '###SELECT ME###';
      jeSetAndSelect(0);
    }
  },
  {
    id: 'je_display',
    name: 'display',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>!jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].display,
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].display = '###SELECT ME###';
      jeSetAndSelect(true);
    }
  },
  {
    id: 'je_editable',
    name: 'editable',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>jeIsWriteFaceObject() && jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].editable === undefined,
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].editable = '###SELECT ME###';
      jeSetAndSelect(true);
    }
  },
  {
    id: 'je_placeholder',
    name: 'placeholder',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>jeIsWriteFaceObject() && !jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].placeholder,
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].placeholder = '###SELECT ME###';
      jeSetAndSelect('');
    }
  },
  {
    id: 'je_spellCheck',
    name: 'spellCheck',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>jeIsWriteFaceObject() && jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].spellCheck === undefined,
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].spellCheck = '###SELECT ME###';
      jeSetAndSelect(true);
    }
  },
  {
    id: 'je_backgroundColor',
    name: 'backgroundColor',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>jeIsWriteFaceObject() && jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].backgroundColor === undefined,
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].backgroundColor = '###SELECT ME###';
      jeSetAndSelect('transparent');
    }
  },
  {
    id: 'je_borderColor',
    name: 'borderColor',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>jeIsWriteFaceObject() && jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].borderColor === undefined,
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].borderColor = '###SELECT ME###';
      jeSetAndSelect('#000000');
    }
  },
  {
    id: 'je_dynamicProperties',
    name: 'dynamicProperties',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    show: _=>!jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].dynamicProperties,
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].dynamicProperties = { "###SELECT ME###": "" };
      jeSetAndSelect('');
    }
  },
  {
    id: 'je_toggleDynamicValue',
    name: _=>(jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]].dynamicProperties || {}).value ? 'static value' : 'dynamic value',
    context: '^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+',
    call: async function() {
      const o = jeStateNow.faceTemplates[+jeContext[2]].objects[+jeContext[4]];
      const d = !!(o.dynamicProperties || {}).value;
      const v = d ? o.dynamicProperties.value : o.value;
      if(d) {
        delete o.dynamicProperties.value;
        if(!Object.keys(o.dynamicProperties).length)
          delete o.dynamicProperties;
        o.value = '###SELECT ME###';
      } else {
        delete o.value;
        if(!o.dynamicProperties)
          o.dynamicProperties = {};
        o.dynamicProperties.value = '###SELECT ME###';
      }
      jeSetAndSelect(v);
    }
  },
  {
    id: 'je_removeProperty',
    name: _=>`remove property ${jeContext && jeContext[jeContext.length-1]}`,
    context: ' ↦ (?=[^"]+$)',
    call: async function() {
      let pointer = jeGetValue(jeContext.slice(0, -1));
      if(Array.isArray(pointer))
        pointer.splice(jeContext[jeContext.length-1], 1);
      else
        delete pointer[jeContext[jeContext.length-1]];

      const [ oldStart, oldEnd ] = jeCursorOffsets();
      jeSet(JSON.stringify(jeStateNow, null, '  '));
      jeSelect(oldStart, oldEnd, true);
    },
    show: function() {
      return jeGetValue(jeContext.slice(0, -1))[jeContext[jeContext.length-1]] !== undefined;
    }
  },
  {
    id: 'je_openDeck',
    name: 'Open deck',
    icon: '[deck]',
    forceKey: 'ArrowDown',
    context: '^card',
    show: _=>widgets.has(jeStateNow.deck),
    call: async function() {
      const d = widgets.get(jeStateNow.deck);
      setSelection([ d ]);
      jeSelectWidget(d);
    }
  },
  {
    id: 'je_addMultiProperty',
    name: 'add property',
    context: '^Multi-Selection',
    options: [ { type: 'string', label: 'Property' } ],
    call: async function(options) {
      jeStateNow[options.Property] = null;
      jeUpdateMulti();
    }
  },
  {
    id: 'je_multiShift',
    name: 'shift',
    context: '^Multi-Selection ↦ [^ ]+',
    show: _=>jeGetValue()&&typeof jeGetValue()[jeGetLastKey()] == 'number',
    options: [ { type: 'number', label: 'Offset', value: 0 } ],
    call: async function(options) {
      const property = jeContext[1];
      for(const widget of jeMultiSelectedWidgets()) {
        const target = options.Offset + (typeof jeStateNow[property] == 'number' ? jeStateNow[property] : jeStateNow[property][widget.get('id')]);
        if(widget.get(property) !== target)
          await widget.set(property, target);
      }
      jeUpdateMulti();
    }
  },
  {
    id: 'je_multiParent',
    name: 'set biggest as parent',
    context: '^Multi-Selection',
    call: async function() {
      let biggestArea = 0;
      let biggestWidget = null;
      for(const widget of jeMultiSelectedWidgets()) {
        const area = widget.get('width') * widget.get('height');
        if(area > biggestArea) {
          biggestArea = area;
          biggestWidget = widget;
        }
      }
      for(const widget of jeMultiSelectedWidgets()) {
        if(widget !== biggestWidget) {
          const oldX = widget.get('x');
          const oldY = widget.get('y');
          await widget.set('parent', biggestWidget.get('id'));
          await widget.set('x', oldX - biggestWidget.get('x'));
          await widget.set('y', oldY - biggestWidget.get('y'));
        }
      }
      jeUpdateMulti();
    }
  },
  {
    id: 'je_multiEnterParent',
    name: 'enter new parent ID',
    context: '^Multi-Selection',
    options: [ { type: 'string', label: 'Parent ID', value: '' } ],
    call: async function(options) {
      if(widgets.has(options['Parent ID'])) {
        const newParent = widgets.get(options['Parent ID']);
        for(const widget of jeMultiSelectedWidgets()) {
          if(widget !== newParent) {
            const oldX = widget.get('x');
            const oldY = widget.get('y');
            await widget.set('parent', newParent.get('id'));
            await widget.set('x', oldX - newParent.get('x'));
            await widget.set('y', oldY - newParent.get('y'));
          }
        }
        jeUpdateMulti();
      }
    }
  }
];

function jeRoutineCall(callback, synchronous, command) {
  const f = function() {
    let routineIndex = -1;
    let commandFound = !command;
    for(let i=jeContext.length-1; i>=0; --i) {
      if(commandFound && String(jeContext[i]).match(/Routine$/)) {
        routineIndex = i;
        break;
      } else if(!commandFound && String(jeContext[i]) == `(${command})`) {
        commandFound = true;
      }
    }

    const routine = jeGetValue(jeContext.slice(1, routineIndex+1));
    if(jeContext.length >= routineIndex)
      return callback(routineIndex, routine, jeContext[routineIndex+1], routine[jeContext[routineIndex+1]]);
    else
      return callback(routineIndex, routine, null, null);
  };

  if(synchronous)
    return f;
  else
    return async _=>f();
}

function jeAddMJcommands() {
  jeCommands.push({
    id: 'je_mjUp',
    name: 'MJ up',
    context: '^.*',
    call: function() {
      jeGetValue(jeContext.slice(0, -1))[jeContext[jeContext.length-1]] = jeGetValue(jeContext.slice(0, -1))[jeContext[jeContext.length-1]].replace(/\/([UV][1234]|R)$/, '');
      jeSetAndSelect();
      jeApplyChanges();
    },
    show: function() {
      return String(jeGetValue(jeContext.slice(0, -1))[jeContext[jeContext.length-1]]).match(/^http.*\/([UV][1234]|R)$/);
    }
  });
  jeCommands.push({
    id: 'je_mjPrompt',
    name: 'MJ prompt',
    context: '^.*',
    call: function() {
      const url = jeGetValue(jeContext.slice(0, -1))[jeContext[jeContext.length-1]].split('/');
      const newPrompt = prompt('MJ prompt', decodeURIComponent(url[5]));
      if(newPrompt) {
        url[5] = encodeURIComponent(newPrompt);
        jeGetValue(jeContext.slice(0, -1))[jeContext[jeContext.length-1]] = url.join('/');
        jeSetAndSelect();
        jeApplyChanges();
      }
    },
    show: function() {
      return String(jeGetValue(jeContext.slice(0, -1))[jeContext[jeContext.length-1]]).match(/^http.*\/image\//);
    }
  });
  for(const down of [ 'U1', 'U2', 'U3', 'U4', 'V1', 'V2', 'V3', 'V4', 'R' ]) {
    jeCommands.push({
      id: 'je_mj'+down,
      name: 'MJ '+down,
      context: '^.*',
      call: function() {
        jeGetValue(jeContext.slice(0, -1))[jeContext[jeContext.length-1]] = jeGetValue(jeContext.slice(0, -1))[jeContext[jeContext.length-1]] + '/' + down;
        jeSetAndSelect();
        jeApplyChanges();
      },
      show: function() {
        return String(jeGetValue(jeContext.slice(0, -1))[jeContext[jeContext.length-1]]).match(/^http.*\/image\//);
      }
    });
  }
}

let jeExpressionCounter = 0;
function jeAddRoutineExpressionCommands(variable, expression) {
  jeCommands.push({
    id: 'expression_' + ++jeExpressionCounter,
    name: `Expression: ${variable}`,
    class: 'expression',
    context: `^.*Routine`,
    call: jeRoutineCall(function(routineIndex, routine, operationIndex, operation) {
      if(operationIndex === null)
        routine.push(`var ###SELECT ME### = ${expression}`);
      else
        routine.splice(operationIndex+1, 0, `var ###SELECT ME### = ${expression}`);
      jeSetAndSelect(variable, true);
    }),
    show: jeRoutineCall((_, routine)=>Array.isArray(routine), true)
  });
}

function jeAddRoutineCommentCommand() {
  jeCommands.push({
    id: 'comment_',
    name: 'Comment',
    class: 'comment',
    context: '^.*Routine',
    call: jeRoutineCall(function (routineIndex, routine, operationIndex) {
      routine.splice(operationIndex+1, 0, `// ###SELECT ME###`);
      jeSetAndSelect('Comment', true);
    }),
    show: jeRoutineCall((_, routine) => Array.isArray(routine), true)
  });
}

function jeAddRoutineOperationCommands(command, defaults) {
  jeCommands.push({
    id: 'operation_' + command,
    name: command,
    class: 'operation',
    context: `^.*Routine`,
    call: jeRoutineCall(function(routineIndex, routine, operationIndex, operation) {
      if(operationIndex === null)
        routine.push({func: '###SELECT ME###'});
      else
        routine.splice(operationIndex+1, 0, {func: '###SELECT ME###'});
      jeSetAndSelect(command);
    }),
    show: jeRoutineCall((_, routine)=>Array.isArray(routine), true)
  });

  jeCommands.push({
    id: 'default_' + command + '_comment',
    name: 'comment',
    context: `^.* ↦ \\(${command}\\) ↦ `,
    call: jeRoutineCall(function(routineIndex, routine, operationIndex, operation) {
      jeInsert(jeContext.slice(1, routineIndex+2), 'comment', 'Write a quick comment to make the operation more human-readable.');
    }),
    show: jeRoutineCall(function(routineIndex, routine, operationIndex, operation) {
      return operation && operation['comment'] === undefined;
    }, true)
  });

  for(const property in defaults) {
    jeCommands.push({
      id: 'default_' + command + '_' + property,
      name: property,
      context: `^.* ↦ \\(${command}\\) ↦ `,
      call: property == 'sortBy' ? // Special case for sortBy; emulate jeInsert w/special replacement
        jeRoutineCall(function(routineIndex, routine, operationIndex, operation) {
          jeGetValue(jeContext.slice(1,routineIndex+2)).sortBy = {
            "key": "###SELECT ME###",
            "reverse": false
          };
          jeSetAndSelect('z');
        }, false, command) :
        jeRoutineCall(function(routineIndex, routine, operationIndex, operation) {
          jeInsert(jeContext.slice(1, routineIndex+2), property, defaults[property]);
        }, false, command),
      show: jeRoutineCall(function(routineIndex, routine, operationIndex, operation) {
        return operation && operation[property] === undefined;
      }, true)
    });
  }
}

function jeAddCommands() {
  const widgetTypes = [ 'all' ];
  const collectionNames = [ 'all', 'DEFAULT', 'thisButton', 'child', 'widget', 'playerSeats', 'activeSeats' ];

  const widgetBase = new Widget();
  widgetTypes.push(jeAddWidgetPropertyCommands(new BasicWidget(), widgetBase));
  widgetTypes.push(jeAddWidgetPropertyCommands(new Button(), widgetBase));
  widgetTypes.push(jeAddWidgetPropertyCommands(new Canvas(), widgetBase));
  widgetTypes.push(jeAddWidgetPropertyCommands(new Card(), widgetBase));
  widgetTypes.push(jeAddWidgetPropertyCommands(new Deck(), widgetBase));
  widgetTypes.push(jeAddWidgetPropertyCommands(new Dice(), widgetBase));
  widgetTypes.push(jeAddWidgetPropertyCommands(new Holder(), widgetBase));
  widgetTypes.push(jeAddWidgetPropertyCommands(new Label(), widgetBase));
  widgetTypes.push(jeAddWidgetPropertyCommands(new Line(), widgetBase));
  widgetTypes.push(jeAddWidgetPropertyCommands(new Pile(), widgetBase));
  widgetTypes.push(jeAddWidgetPropertyCommands(new Scoreboard(), widgetBase));
  widgetTypes.push(jeAddWidgetPropertyCommands(new Seat(), widgetBase));
  widgetTypes.push(jeAddWidgetPropertyCommands(new Spinner(), widgetBase));
  widgetTypes.push(jeAddWidgetPropertyCommands(new Timer(), widgetBase));

  jeAddRoutineOperationCommands('AUDIO', { source: '', maxVolume: 1.0, length: null, player: null, silence: false, count: 1 });
  jeAddRoutineOperationCommands('CALL', { widget: 'id', routine: 'clickRoutine', return: true, arguments: {}, variable: 'result', collection: 'result' });
  jeAddRoutineOperationCommands('CANVAS', { collection: 'DEFAULT', mode: 'reset', x: 0, y: 0, value: 1 ,color:'#1F5CA6', count: 1 });
  jeAddRoutineOperationCommands('CLICK', { collection: 'DEFAULT', count: 1 , mode:'respect' });
  jeAddRoutineOperationCommands('CLONE', { source: 'DEFAULT', collection: 'DEFAULT', xOffset: 0, yOffset: 0, count: 1, recursive: false, properties: null });
  jeAddRoutineOperationCommands('COUNT', { collection: 'DEFAULT', holder: null, variable: 'COUNT', owner: null });
  jeAddRoutineOperationCommands('DELAY', { milliseconds: 0 });
  jeAddRoutineOperationCommands('DELETE', { collection: 'DEFAULT'});
  jeAddRoutineOperationCommands('FLIP', { count: 'all', face: null, faceCycle: 'forward', holder: null, collection: 'DEFAULT' });
  jeAddRoutineOperationCommands('FOREACH', { loopRoutine: [], in: [], range: [], collection: 'DEFAULT' });
  jeAddRoutineOperationCommands('GET', { variable: 'id', collection: 'DEFAULT', property: 'id', aggregation: 'first', skipMissing: false });
  jeAddRoutineOperationCommands('IF', { condition: null, operand1: null, relation: '==', operand2: null, thenRoutine: [], elseRoutine: [] });
  jeAddRoutineOperationCommands('INPUT', { cancelButtonIcon: null, cancelButtonText: "Cancel", confirmButtonIcon: null, confirmButtonText: "Go", fields: [], header: "", player: null, block: false, randomRotation: 5 } );
  jeAddRoutineOperationCommands('LABEL', { value: 0, mode: 'set', label: null, collection: 'DEFAULT' });
  jeAddRoutineOperationCommands('MOVE', { count: 1, face: null, from: null, to: null, fillTo: null, collection: 'DEFAULT' });
  jeAddRoutineOperationCommands('MOVEXY', { count: 1, face: null, from: null, x: 0, y: 0, z: 0, snapToGrid: true, resetOwner: true });
  jeAddRoutineOperationCommands('RECALL', { owned: true, inHolder: true, holder: null, excludeCollection: null, byDistance: false });
  jeAddRoutineOperationCommands('RESET', { property: 'resetProperties' });
  jeAddRoutineOperationCommands('ROTATE', { count: 1, angle: 90, mode: 'add', holder: null, collection: 'DEFAULT' });
  jeAddRoutineOperationCommands('SCORE', { mode: 'set', property: 'score', seats: null, round: null, value: null });
  jeAddRoutineOperationCommands('SELECT', { type: 'all', property: 'parent', relation: '==', value: null, max: 999999, collection: 'DEFAULT', mode: 'set', source: 'all', sortBy: '###SEE jeAddRoutineOperation###', random: false});
  jeAddRoutineOperationCommands('SET', { collection: 'DEFAULT', property: 'parent', relation: '=', value: null });
  jeAddRoutineOperationCommands('SHIFT', { holders: null, widgets: 'all', interval: 1, direction: 'forward', wrap: true, keepOrder: true });
  jeAddRoutineOperationCommands('SHUFFLE', { holder: null, collection: 'DEFAULT', mode: 'true random', modeValue: 1 });
  jeAddRoutineOperationCommands('SORT', { key: 'value', reverse: false, rearrange: false, locales: null, options: null, holder: null, collection: 'DEFAULT' });
  jeAddRoutineOperationCommands('TIMER', { value: 0, seconds: 0, mode: 'toggle', timer: null, collection: 'DEFAULT' });
  jeAddRoutineOperationCommands('TURN', { turn: 1, turnCycle: 'forward', source: 'all', collection: 'TURN' });
  jeAddRoutineOperationCommands('UPLOAD', { variable: 'uploadedFileName', fileTypes: [ '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.json', '.mp3', '.wav', '.ogg', '.m4a' ] });
  jeAddRoutineOperationCommands('VAR', { variables: {} });

  jeAddRoutineExpressionCommands('random', 'randInt 1 10');
  jeAddRoutineExpressionCommands('increment', '${variableName} + 1');

  jeAddRoutineCommentCommand();

  jeAddCSScommands();

  jeAddFaceCommand('border', '', 1);
  jeAddFaceCommand('classes', '', '');
  jeAddFaceCommand('css', '', {});
  jeAddFaceCommand('properties', '', {});
  jeAddFaceCommand('radius', ' (rounded corners)', 1);

  jeAddGridCommand('x', 0);
  jeAddGridCommand('y', 0);
  jeAddGridCommand('maxX', 0);
  jeAddGridCommand('maxY', 0);
  jeAddGridCommand('minX', 0);
  jeAddGridCommand('minY', 0);
  jeAddGridCommand('alignX', 0);
  jeAddGridCommand('alignY', 0);
  jeAddGridCommand('offsetX', 0);
  jeAddGridCommand('offsetY', 0);
  jeAddGridCommand('rotation', 0);
  jeAddConditionCommands('grid', '^[^ ]* ↦ grid ↦ [0-9]+', _=>jeStateNow.grid[+jeContext[2]]);

  jeAddLimitCommand('minX', 0);
  jeAddLimitCommand('minY', 0);
  // Default max limits are computed dynamically.
  jeAddLimitCommand('maxX');
  jeAddLimitCommand('maxY');
  // which point of the widget the limit is about: 0.5 is its middle, i.e. the
  // value that is wanted often enough to be the one the button inserts
  jeAddLimitCommand('alignX', 0.5);
  jeAddLimitCommand('alignY', 0.5);
  jeAddConditionCommands('limit', '^[^ ]* ↦ dragLimit', _=>jeStateNow.dragLimit);

  // Default values computed dynamically.
  jeAddResetPropertiesCommand('parent');
  jeAddResetPropertiesCommand('x');
  jeAddResetPropertiesCommand('y');
  jeAddResetPropertiesCommand('rotation');
  jeAddResetPropertiesCommand('activeFace');
  jeAddResetPropertiesCommand('scale');
  jeAddResetPropertiesCommand('display');

  jeAddFieldCommand('text', 'subtitle|title|text', '');
  jeAddFieldCommand('label', 'checkbox|choose|color|number|palette|select|slider|string|switch', '');
  jeAddFieldCommand('value', 'checkbox|choose|color|number|palette|select|slider|string|switch', '');
  jeAddFieldCommand('variable', 'checkbox|choose|color|number|palette|select|slider|string|switch', '');
  jeAddFieldCommand('colors', 'palette', [ '#000000' ]);
  jeAddFieldCommand('min', 'number|slider', 0);
  jeAddFieldCommand('max', 'number|slider', 10);
  jeAddFieldCommand('step', 'slider', 1);
  jeAddFieldCommand('unit', 'slider', '');
  jeAddFieldCommand('values', 'slider', [ 'low', 'medium', 'high' ]);
  jeAddFieldCommand('options', 'select', [ { value: 'value', text: 'text' } ]);
  jeAddFieldCommand('regex', 'string', '');
  jeAddFieldCommand('regexHint', 'string', '');

  jeAddFieldCommand('source', 'choose', 'DEFAULT');
  jeAddFieldCommand('collection', 'choose', 'DEFAULT');
  jeAddFieldCommand('holder', 'choose', '');
  jeAddFieldCommand('min', 'choose', 0);
  jeAddFieldCommand('max', 'choose', 1);
  jeAddFieldCommand('mode', 'choose', 'widgets');
  jeAddFieldCommand('faces', 'choose', null);
  jeAddFieldCommand('scale', 'choose', 1);
  jeAddFieldCommand('propertyOverride', 'choose', {});
  jeAddFieldCommand('visibleChildWidgets', 'choose', false);

  jeAddEnumCommands('^[a-z]+ ↦ type', widgetTypes.slice(1));
  jeAddEnumCommands('^.*\\([A-Z]+\\) ↦ value', [ '${}' ]);
  jeAddEnumCommands('^deck ↦ faceTemplates ↦ [0-9]+ ↦ objects ↦ [0-9]+ ↦ textAlign', [ 'left', 'center', 'right' ]);
  jeAddEnumCommands('^[a-z]+ ↦ classes', ['transparent', 'transition', 'symbols', 'material-symbols', 'material-symbols-nofill', 'standard_font', 'handwriting_font', 'handwriting_casual_font', 'condensed_font', 'serif_font', 'fantasy_font', 'gothic_font', 'horror_font', 'tech_font']);
  jeAddEnumCommands('^.*\\(AUDIO\\) ↦ player', [ '${}', '${getPlayerDetails().playerName}' ]);
  jeAddEnumCommands('^.*\\(AUDIO\\) ↦ count', [ 1, 'loop' ]);
  jeAddEnumCommands('^.*\\(CANVAS\\) ↦ mode', [ 'set', 'inc', 'dec', 'change', 'reset', 'setPixel' ]);
  jeAddEnumCommands('^.*\\(CLICK\\) ↦ mode', [ 'respect', 'ignoreClickable', 'ignoreClickRoutine', 'ignoreAll' ]);
  jeAddEnumCommands('^.*\\(FLIP\\) ↦ faceCycle', [ 'forward', 'backward', 'random' ]);
  jeAddEnumCommands('^.*\\(FLIP\\) ↦ count', [ 1, 'all' ]);
  jeAddEnumCommands('^.*\\(GET\\) ↦ aggregation', [ 'first', 'last', 'array', 'average', 'median', 'min', 'max', 'sum' ]);
  jeAddEnumCommands('^.*\\(IF\\) ↦ relation', [ '<', '<=', '==', '!=', '>', '>=' ]);
  jeAddEnumCommands('^.*\\(IF\\) ↦ (operand1|operand2|condition)', [ '${}' ]);
  jeAddEnumCommands('^.*\\(INPUT\\) ↦ fields ↦ [0-9]+ ↦ mode', [ 'widgets', 'faces' ]);
  jeAddEnumCommands('^.*\\(INPUT\\) ↦ fields ↦ [0-9]+ ↦ type', [ 'checkbox', 'choose', 'color', 'number', 'palette', 'select', 'slider', 'string', 'subtitle', 'switch', 'text', 'title' ]);
  jeAddEnumCommands('^.*\\(LABEL\\) ↦ mode', [ 'set', 'dec', 'inc', 'append' ]);
  jeAddEnumCommands('^.*\\(MOVE\\) ↦ count', [ 1, 'all' ]);
  jeAddEnumCommands('^.*\\(MOVEXY\\) ↦ count', [ 1, 'all' ]);
  jeAddEnumCommands('^.*\\(ROTATE\\) ↦ angle', [ 45, 60, 90, 135, 180 ]);
  jeAddEnumCommands('^.*\\(ROTATE\\) ↦ mode', [ 'set', 'add' ]);
  jeAddEnumCommands('^.*\\(ROTATE\\) ↦ count', [ 1, 'all' ]);
  jeAddEnumCommands('^.*\\(SCORE\\) ↦ mode', [ 'set', 'inc', 'dec' ]);
  jeAddEnumCommands('^.*\\(SELECT\\) ↦ mode', [ 'set', 'add', 'remove', 'intersect' ]);
  jeAddEnumCommands('^.*\\(SELECT\\) ↦ relation', [ '<', '<=', '==', '!=', '>', '>=', 'in' ]);
  jeAddEnumCommands('^.*\\(SELECT\\) ↦ type', widgetTypes);
  jeAddEnumCommands('^.*\\(SET\\) ↦ relation', [ '+', '-', '=', "*", "/",'!' ]);
  jeAddEnumCommands('^.*\\(SHUFFLE\\) ↦ mode', [ 'true random', 'overhand', 'riffle', 'reverse', 'seeded' ]);
  jeAddEnumCommands('^.*\\(SHIFT\\) ↦ widgets', [ 'all', 'top' ]);
  jeAddEnumCommands('^.*\\(SHIFT\\) ↦ direction', [ 'forward', 'backward', 'random' ]);
  jeAddEnumCommands('^.*\\(SHIFT\\) ↦ wrap', [ true, false ]);
  jeAddEnumCommands('^.*\\(SHIFT\\) ↦ keepOrder', [ true, false ]);
  jeAddEnumCommands('^.*\\(TIMER\\) ↦ mode', [ 'pause', 'start', 'toggle', 'set', 'dec', 'inc', 'reset']);
  jeAddEnumCommands('^.*\\(TIMER\\) ↦ value', [ 0, 'start', 'end', 'milliseconds']);
  jeAddEnumCommands('^.*\\(TURN\\) ↦ turnCycle', [ 'forward', 'backward', 'random', 'position', 'seat']);
  jeAddEnumCommands('^.*\\([A-Z]+\\) ↦ property', [ 'id', 'parent', 'type', 'rotation' ]);

  jeAddEnumCommands('^.*\\((CANVAS|CLICK|COUNT|DELETE|FLIP|GET|LABEL|ROTATE|SET|SORT|SHUFFLE|TIMER)\\) ↦ collection', collectionNames.slice(1));
  jeAddEnumCommands('^.*\\(CLONE\\) ↦ source', collectionNames.slice(1));
  jeAddEnumCommands('^.*\\((SELECT|TURN)\\) ↦ source', collectionNames);
  jeAddEnumCommands('^.*\\(COUNT\\) ↦ owner', [ '${}' ]);
  jeAddEnumCommands('^scoreboard ↦ sortField',['index', 'player', 'total']);
  jeAddEnumCommands('^scoreboard ↦ scoreEntry',['auto', 'keypad', 'pane', 'type']);

  jeAddNumberCommand('increment number', '+', x=>x+1);
  jeAddNumberCommand('decrement number', '-', x=>x-1);
  jeAddNumberCommand('double number', '*', x=>x*2);
  jeAddNumberCommand('half number', '/', x=>x/2);
  jeAddNumberCommand('zero', '0', x=>0);
  jeAddNumberCommand('opposite value', '0', x=>-x);
  jeAddNumberCommand('${}', '0', x=>'${}');

  jeAddAlignmentCommands();
  jeAddMJcommands();
}

function jeAddAlignmentCommands() {
  jeCommands.push({
    id: 'jeCenterInParent',
    name: 'center in parent',
    context: '^.* ↦ (x|y)( ↦ "[0-9]+")?$',
    show: _=>!jeContext.includes('grid'),
    call: async function() {
      const key = jeGetLastKey();
      const sizeKey = key == 'x' ? 'width' : 'height';
      const parentSize = jeStateNow.parent ? widgets.get(jeStateNow.parent).get(sizeKey) : (sizeKey == 'width' ? viewportConfig.targetWidth : viewportConfig.targetHeight);
      jeStateNow[key] = '###SELECT ME###';
      jeSetAndSelect((parentSize-widgets.get(jeStateNow.id).get(sizeKey))/2);
    }
  });
  jeCommands.push({
    id: 'jeMultiAlign',
    name: 'align',
    context: '^Multi-Selection ↦ (x|y)',
    options: [
      { label: 'Coordinate', type: 'select', options: [ { value: 0.5, text: 'Center' }, { value: 0, text: 'Top/Left' }, { value: 1, text: 'Bottom/Right'  } ] },
      { label: 'Reference',  type: 'select', options: [ { value: 'First selected widget' }, { value: 'Lowest value' }, { value: 'Highest value' }, { value: 'Center of all' } ] }
    ],
    call: async function(options) {
      const key = jeContext[1];
      const sizeKey = key == 'x' ? 'width' : 'height';
      const selected = jeMultiSelectedWidgets();
      const coords = selected.map(w=>w.absoluteCoord(key) + w.get(sizeKey)*options.Coordinate);

      let target = coords[0];
      if(options.Reference == 'Lowest value')
        target = Math.min(...coords);
      if(options.Reference == 'Highest value')
        target = Math.max(...coords);
      if(options.Reference == 'Center of all')
        target = (Math.max(...coords) + Math.min(...coords)) / 2;
      for(const w of selected)
        await w.set(key, target - w.get(sizeKey)*options.Coordinate - (w.get('parent') ? widgets.get(w.get('parent')).absoluteCoord(key) : 0));
      jeUpdateMulti();
    }
  });
  jeCommands.push({
    id: 'jeMultiDistribute',
    name: 'distribute',
    context: '^Multi-Selection ↦ (x|y)',
    call: async function() {
      const key = jeContext[1];
      const sizeKey = key == 'x' ? 'width' : 'height';
      const selected = jeMultiSelectedWidgets();

      const min = Math.min(...selected.map(w=>w.absoluteCoord(key)));
      const max = Math.max(...selected.map(w=>w.absoluteCoord(key)+w.get(sizeKey)));
      const heights = selected.map(w=>w.get(sizeKey)).reduce((a,b)=>a + b);
      const spacing = (max-min-heights)/(selected.length-1);
      selected.sort((a,b)=>a.absoluteCoord(key) - b.absoluteCoord(key));
      for(const widget of selected) {
        const before = selected.slice(0, selected.findIndex(w=>w.id == widget.id));
        await widget.set(key, Math.round(min + before.map(w=>w.get(sizeKey) + spacing).reduce((a,b)=>a + b, 0) - (widget.get('parent') ? widgets.get(widget.get('parent')).absoluteCoord(key) : 0)));
      }
      jeUpdateMulti();
    }
  });
}

function displayComputeOps() {
  const keyword = $('#var_search').value;
  let results = compute_ops.filter(o => o.name.toLowerCase().includes(keyword.toLowerCase()) || o.desc.toLowerCase().includes(keyword.toLowerCase()));
  var resultTable = '<table>';
  if(keyword.length > 0) {
    for(const r of Object.values(results).sort((a, b) => a.name.toString().localeCompare(b.name)))
      resultTable += '<tr valign=top><td><b>' + r.name + '</b></td><td><b>' + r.sample + '</b><br>' + r.desc + '</td></tr>';
  }
  resultTable += '</table>';
  $('#var_results').innerHTML = resultTable;
  jeKeyword = keyword;
}

function jeAddCSScommands() {
  const string_presets = {
    "border": "1px solid black", "background": "white", "font-size": "16px", "color": "black", "background-image": "url('')"
  };
  const nested_presets = {
    '[a-z]+': {
      'default': string_presets,
      ':hover': string_presets
    },
    'seat': {
      '.seated.turn': {}
    },
    'timer': {
      '.alert': {}, '.paused':{}
    },
    'holder': {
      '.droppable': {"border": "calc(1px / var(--scale)) solid #aaa !important"},
      '.droptarget': {"border": "calc(1px / var(--scale)) solid #333 !important"}
    },
    'pile': {
      '.pile .handle': {}
    }
  };

  // Add nested object button items
  for(const type in nested_presets) {
    for(const cssSection in nested_presets[type]) { // Add CSS sections
      jeCommands.push({
        id: 'css_' + cssSection,
        name: cssSection,
        context: `^${type} ↦ css`,
        show:  function() {
          if(typeof jeStateNow.css != "object" || jeStateNow.css === null || JSON.stringify(jeStateNow.css) == '{}')
            return false;
          for(const property in jeStateNow.css)
            if(typeof jeStateNow.css[property] != "object")
              return false;
          return jeStateNow.css[cssSection] == undefined;
        },
        call: async function() {
          jeStateNow.css[cssSection] = '###SELECT ME###';
          jeSetAndSelect({});
        }
      });
      for(const cssProperty in nested_presets[type][cssSection]) { // Add entries per-section
        jeCommands.push({
          id: 'css_' + cssSection + '_' + cssProperty,
          name: cssProperty,
          context: `^${type} ↦ css ↦ [^↦]*`,
          show: function() {
            const contents = jeStateNow.css[cssSection];
            return typeof contents == "object" && contents !== null && jeContext.includes(cssSection) && !(cssProperty in contents);
          },
          call: async function() {
            jeStateNow.css[cssSection][cssProperty] = '###SELECT ME###';
            jeSetAndSelect(nested_presets[type][cssSection][cssProperty]);
          }
        });
      }
    }
  }

  // Add simple object button items
  for(const cssProperty in string_presets) { // Add entries in "default" (only) section
    jeCommands.push({
      id: 'css_string_' + cssProperty,
      name: cssProperty,
      context: `.* ↦ (css|[a-z]+CSS)`,
      show: function() { // Need to make sure it is a simple object (contents are "key": "string" pairs)
        const cssKind = jeContext.join(' ↦ ').match(this.context)[1];
        const contents = jeStateNow[cssKind];
        if(typeof contents != "object" || contents === null || cssProperty in contents) // simple object, property already there
          return false;
        for(const property in jeStateNow[cssKind]) // Check to see if any sub-objects
          if(typeof jeStateNow[cssKind][property] == "object")
            return false;
        return true; // All OK
      },
      call: async function() {
        const cssKind = jeContext.join(' ↦ ').match(this.context)[1];
        jeStateNow[cssKind][cssProperty] = '###SELECT ME###';
        jeSetAndSelect(string_presets[cssProperty]);
      }
    });
  }
}

function jeAddEnumCommands(context, values) {
  for(const v of values) {
    jeCommands.push({
      id: 'enum_' + String(v),
      name: String(v),
      context: context,
      call: async function() {
        jeInsert(null, jeGetLastKey(), v);
      },
      show: function() {
        let pointer = jeGetValue();
        return pointer[jeGetValue()] !== v;
      }
    });
  }
}

function jeAddFaceCommand(key, description, value) {
  jeCommands.push({
    id: 'face_' + key+description,
    name: key+description,
    context: '^deck ↦ faceTemplates ↦ [0-9]+',
    show: _=>!jeStateNow.faceTemplates[+jeContext[2]][key],
    call: async function() {
      jeStateNow.faceTemplates[+jeContext[2]][key] = '###SELECT ME###';
      jeSetAndSelect(value);
    }
  });
}

function jeAddFieldCommand(key, types, value) {
  jeCommands.push({
    id: 'field_' + key,
    name: key,
    context: '^.*\\(INPUT\\) ↦ fields ↦ [0-9]+',
    show: jeRoutineCall(function(routineIndex) {
      const field = jeGetValue(jeContext.slice(1, routineIndex+5));
      return typeof field[key] === 'undefined' && (field.type || '').match(types);
    }, true),
    call: jeRoutineCall(function(routineIndex, routine, operationIndex, operation) {
      jeGetValue(jeContext.slice(1, routineIndex+5))[key] = key != 'options' ? '###SELECT ME###' :
        [
          {
            value: "###SELECT ME###",
            text: "text"
          }
        ];
      jeSetAndSelect( key != 'options' ? value : "value");
    })
  });
}

function jeAddGridCommand(key, value) {
  jeCommands.push({
    id: 'grid_' + key,
    name: key,
    context: '^[^ ]* ↦ grid ↦ [0-9]+',
    show: _=>typeof jeStateNow.grid[+jeContext[2]] == "object" && jeStateNow.grid[+jeContext[2]] !== null && !(key in jeStateNow.grid[+jeContext[2]]),
    call: async function() {
      jeStateNow.grid[+jeContext[2]][key] = '###SELECT ME###';
      jeSetAndSelect(value);
    }
  });
}


function jeAddLimitCommand(key, value) {
  jeCommands.push({
    id: 'limit_' + key,
    name: key,
    context: '^[^ ]* ↦ dragLimit',
    show: _=>typeof jeStateNow.dragLimit == "object" && jeStateNow.dragLimit !== null && !(key in jeStateNow.dragLimit),
    call: async function() {
      const w = widgets.get(jeStateNow.id);
      jeStateNow.dragLimit[key] = '###SELECT ME###';
      let limit = value;
      if (key == 'maxX')
        limit = viewportConfig.targetWidth - w.get('width');
      else if (key == 'maxY')
        limit = viewportConfig.targetHeight - w.get('height');
      jeSetAndSelect(limit);
    }
  });
}

// Neither the area a widget can be dragged in nor the area a snap grid applies
// to has to be a rectangle: a condition is an inequality in x and y (the
// position being judged, in the same coordinates as the four sides next to it)
// that the drag keeps true, respectively that the grid needs to apply. A widget
// property is read as ${PROPERTY name}. The starting point is the half-plane
// below the diagonal - short, and it shows the syntax. The second command turns
// one condition into the list of them that a shape needs more than one
// inequality for. `owner` is a function because the object the buttons write
// into is looked up again on every click (a grid entry is one of an array).
function jeAddConditionCommands(idPrefix, context, owner) {
  const object = _=>typeof owner() == "object" && owner() !== null ? owner() : null;
  jeCommands.push({
    id: idPrefix + '_condition',
    name: 'add condition',
    context,
    show: _=>!!object() && object().condition === undefined,
    call: async function() {
      object().condition = '###SELECT ME###';
      jeSetAndSelect('y > x');
    }
  });
  jeCommands.push({
    id: idPrefix + '_condition_add',
    name: 'add another condition',
    context,
    show: _=>!!object() && object().condition !== undefined,
    call: async function() {
      object().condition = asArray(object().condition).concat([ '###SELECT ME###' ]);
      jeSetAndSelect('x > y');
    }
  });
}

function jeAddNumberCommand(name, key, callback) {
  jeCommands.push({
    id: 'number_' + name,
    name: name,
    forceKey: key,
    context: '.*',
    show: _=>jeGetValue()&&typeof jeGetValue()[jeGetLastKey()] == 'number',
    call: async function() {
      const newValue = callback(jeGetValue()[jeGetLastKey()]);
      jeGetValue()[jeGetLastKey()] = '###SELECT ME###';
      jeSetAndSelect(newValue);
    }
  });
}

function jeAddResetPropertiesCommand(key) {
  jeCommands.push({
    id: 'rProp_' + key,
    name: key,
    context: '^[^ ]* ↦ resetProperties',
    show: _=>typeof jeStateNow.resetProperties == "object" && jeStateNow.resetProperties !== null && !(key in jeStateNow.resetProperties),
    call: async function() {
      const w = widgets.get(jeStateNow.id);
      jeStateNow.resetProperties[key] = '###SELECT ME###';
      let rProp = w.get(key);
      jeSetAndSelect(rProp);
    }
  });
}

function jeAddWidgetPropertyCommands(object, widgetBase) {
  for(const property in object.defaults)
    // lineOriginalRotation is a valid global property but only meaningful while a
    // line rotates one of its stops, so it gets no per-widget-type insert button
    // (it would be noise on every type).
    if(property != 'typeClasses' && property != 'lineOriginalRotation' && !property.match(/^c[0-9]{2}$/))
      jeAddWidgetPropertyCommand(object, widgetBase, property);
  const type = object.defaults.typeClasses.replace(/widget /, '');
  if(type != 'card' && type != 'pile') {
    jeCommands.push({
      id: 'addWidget_' + type,
      name: `add ${type} widget`,
      context: 'No widget selected.',
      onEmpty: true,
      call: async function() {
        const newWidget = widgets.get(await addWidgetLocal(type == 'basic' ? {} : {type}));
        setSelection([ newWidget ]);
        jeSelectWidget(newWidget);
      }
    });
  }
  return type == 'basic' ? null : type;
}

const buttonColorProperties = ['backgroundColor', 'borderColor', 'textColor', 'backgroundColorOH', 'borderColorOH', 'textColorOH'];

function jeAddWidgetPropertyCommand(object, widgetBase, property) {
  jeCommands.push({
    id: 'widget_' + object.getDefaultValue('typeClasses').replace('widget ', '') + '_' + property,
    name: property,
    class: 'property',
    context: `^${object.getDefaultValue('typeClasses').replace('widget ', '')}`,
    isTypeSpecific: JSON.stringify(widgetBase.getDefaultValue(property)) !== JSON.stringify(object.getDefaultValue(property)),
    call: property=='dropTarget'? // Special case for dropTarget, faces, and spinner options
            async function() {
              jeStateNow.dropTarget = {
                "type": "###SELECT ME###"
              };
              jeSetAndSelect('card');
            }
        : property=='faces' ?
            async function() {
              jeStateNow.faces = ["###SELECT ME###"];
              jeSetAndSelect({});
            }
        : object.getDefaultValue('typeClasses').replace('widget ', '') + '_' + property == 'spinner_options' ?
            async function() {
              jeStateNow.options = "###SELECT ME###";
              jeSetAndSelect([]);
            }
        : property == 'inheritFrom' || property == 'css' ? // Special case to override defaults for these two
            async function() {
              jeStateNow[property] = '###SELECT ME###';
              jeSetAndSelect({});
            }
        : async function() {
             jeInsert([], property, property.match(/Routine$/) ? [] : object.getDefaultValue(property));
           },
    show: function() {
      return jeStateNow[property] === undefined && !(object.getDefaultValue('typeClasses').replace('widget ', '') == 'button' && buttonColorProperties.includes(property));
    }
  });
}

async function jeApplyChanges() {
  // while the state is only semantically wrong the commands keep editing the text, but the
  // room is never handed a state it cannot load - including by the commands that apply their
  // own change instead of going through the gated call in clickButton
  if(jeJSONerror)
    return;
  if(jeMode == 'multi')
    return await jeApplyChangesMulti();

  const currentStateRaw = jeGetEditorContent();
  const completeState = JSON.parse(jePostProcessText(currentStateRaw).replace(/,(?=\n *[\]}],?$)/gm, ''));

  // apply external changes that happened while the key was pressed
  for(const delta of jeKeyIsDownDeltas)
    for(const key in delta)
      completeState[key] = delta[key];

  const currentState = JSON.stringify(jePostProcessObject(completeState));
  if(currentStateRaw != jeStateBeforeRaw || jeKeyIsDownDeltas.length) {
    const old = JSON.parse(jeStateBefore);
    const cur = JSON.parse(currentState);
    const idChanged = cur.id != old.id || cur.type != old.type;
    jeDeltaIsOurs = true;
    await jeApplyExternalChanges(completeState);
    jeStateBeforeRaw = currentStateRaw;
    const oldState = jeStateBefore;
    jeStateBefore = currentState;
    await updateWidget(currentState, oldState); // in editmode.js
    if(idChanged) {
      setSelection([ widgets.get(cur.id) ]);
      if(widgets.has(cur.id))
        widgets.get(cur.id).setHighlighted(true);
    }
    jeDeltaIsOurs = false;
  }
}

async function jeApplyChangesMulti() {
  const setValueIfNeeded = async function(widget, key, value) {
    if(widget.get(key) !== value)
      await widget.set(key, value);
  };

  const currentState = JSON.parse(jeGetEditorContent());

  if(jeGetContext()[1] == 'widgets') {
    jeDeltaIsOurs = true;
    var cursorState = jeCursorStateGet();
    jeUpdateMulti();
    jeCursorStateSet(cursorState);
    setSelection(jeMultiSelectedWidgets());
    jeDeltaIsOurs = false;
  } else {
    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} edited properties on multiple widgets in editor`);
    jeDeltaIsOurs = true;
    const selection = jeMultiSelectedWidgets();
    const widgetIDs = selection.map(w=>w.get('id'));
    for(const key in currentState) {
      if(key != 'widgets') {
        for(const w of selection) {
          if(!jeMultiValueIsPerWidget(currentState[key], widgetIDs))
            await setValueIfNeeded(w, key, currentState[key]);
          else if(currentState[key][w.get('id')] !== undefined)
            await setValueIfNeeded(w, key, currentState[key][w.get('id')]);
        }
      }
    }
    batchEnd();
    jeDeltaIsOurs = false;
  }
}

function jeApplyDelta(delta) {
  if(jeMode == 'widget') {
    if(delta.s[jeWidget.id] && delta.s[jeWidget.id].type !== undefined) {
      const w = widgets.get(jeWidget.id);
      jePlainWidget = new w.constructor();
      jeColorize();
    }

    for(const field of [ 'id', 'deck' ]) {
      if(!jeDeltaIsOurs && jeStateNow && jeStateNow[field] && delta.s[jeStateNow[field]] !== undefined) {
        if(delta.s[jeStateNow[field]] === null) {
          jeEmpty();
        } else {
          if(jeKeyIsDown) {
            jeKeyIsDownDeltas.push(delta.s[jeStateNow[field]]);
            return;
          }

          jeSelectWidget(widgets.get(jeStateNow.id), false, true);
        }
      }
    }

    // if the JSON in the editor is invalid, and the delta contains the widget, try to update the invalid JSON as much as possible
    if(!jeStateNow && jeJSONerror && delta.s[jeWidget.id]) {
      let text = $('#jeText').textContent;
      for(const [ key, value ] of Object.entries(delta.s[jeWidget.id])) {
        if(value === null) {
          if(!text.match(new RegExp(`^  "${key}": ${JSON.stringify(jeWidget.getDefaultValue(key))},?$`, 'm')))
            text = text.replace(new RegExp(`,\n?\n  "${key}": ("[^"]*"|true|false|\\d+(\\.\\d+)?)(?=,?$)`, 'gm'), '');
        } else if(!text.match(new RegExp(`^  "${key}"`, 'm')))
          text = text.replace(new RegExp(`\n\\}`, 'gm'), `,\n  "${key}": ${JSON.stringify(value)}\n}`);
        else if(text.match(new RegExp(`^  "${key}": ("[^"]*"|true|false|\\d+(\\.\\d+)?),?$`, 'm')))
          text = text.replace(new RegExp(`^  "${key}":[^,\n]*`, 'gm'), `  "${key}": ${JSON.stringify(value)}`);
        else
          text = text + `\n\n--- GOT DELTA WHILE JSON WAS INVALID ---\n${delta.c}\n\nApply this to your JSON:\n\n  "${key}": ${JSON.stringify(value, null, '  ').replace(/\n/g, '\n  ')}`;
      }
      jeSet(text);
    }
  }

  if(jeMode == 'multi' && !jeDeltaIsOurs) {
    try {
      for(const selectedWidget of JSON.parse(jeGetEditorContent()).widgets) {
        if(delta.s[selectedWidget] !== undefined) {
          if(jeKeyIsDown) {
            jeKeyIsDownDeltas.push(delta.s);
            return;
          }

          return jeUpdateMulti();
        }
      }
    } catch(e) {
    }
  }
}

export function jeApplyState(state) {
  jeEmpty();
  jeDisplayTree();
}

async function jeApplyExternalChanges(state) {
  const before = JSON.parse(jeStateBefore);
  if(state.type == 'card' && state.deck === before.deck) {
    const cardDefaults = { ...widgets.get(state.deck).get('cardDefaults') };
    if(state['cardDefaults (in deck)'] && JSON.stringify(state['cardDefaults (in deck)']) != JSON.stringify(cardDefaults))
      await widgets.get(state.deck).set('cardDefaults', state['cardDefaults (in deck)']);

    if(state.cardType === before.cardType) {
      const cardTypes = { ...widgets.get(state.deck).get('cardTypes') };
      if(state['cardType ['+ state.cardType + '] (in deck)'] && JSON.stringify(state['cardType ['+ state.cardType + '] (in deck)']) != JSON.stringify(cardTypes[state.cardType])) {
        cardTypes[state.cardType] = state['cardType ['+ state.cardType + '] (in deck)'];
        await widgets.get(state.deck).set('cardTypes', cardTypes);
      }
    }
  }
}

async function jeCallCommand(command) {
  if(command.options) {
    jeCommandWithOptions = command;
  } else {
    jeDeltaIsOurs = true;
    await command.call();
    jeDeltaIsOurs = false;
  }
}

function jeCommandOptions() {
  const div = document.createElement('div');
  div.id = 'jeCommandOptions';
  const name = typeof jeCommandWithOptions.name == 'function' ? jeCommandWithOptions.name() : jeCommandWithOptions.name;
  div.innerHTML = `<b>${html(String(name))} options:</b><div></div><button>Go</button><button class=cancel>Cancel</button>`;

  // the options belong to the command button that was clicked, so they open right below it and that
  // button is marked. Opening them above the list instead would push the whole list down, away
  // from the pointer that just clicked into it.
  const button = $(`#jeContextButtons > [id="${jeCommandWithOptions.id}"]`);
  if(button) {
    button.classList.add('jeCommandOwner');
    button.parentElement.insertBefore(div, button.nextSibling);
  } else {
    $('#jeCommands').insertBefore(div, $('#jeTopButtons').nextSibling);
  }

  for(const option of jeCommandWithOptions.options) {
    formField(option, $('#jeCommandOptions div'), `${jeCommandWithOptions.id}_${option.label}`);
    $('#jeCommandOptions div').append(document.createElement('br'));
    const firstInput = $('input,select', div);
    if(firstInput)
      firstInput.focus();
  }

  // the command list scrolls, so options opening near its bottom edge would have their buttons cut
  // off. 'nearest' scrolls only in that case, which keeps the list still in the common one
  div.scrollIntoView({ block: 'nearest' });

  $a('#jeCommandOptions button')[0].addEventListener('click', async function() {
    const options = {};
    for(const option of jeCommandWithOptions.options) {
      const input = $(`[id="${jeCommandWithOptions.id}_${option.label}"]`);
      options[option.label] = option.type == 'checkbox' ? input.checked : input.value;
      if(option.type == 'number')
        options[option.label] = parseFloat(options[option.label]);
      if(Number.isNaN(options[option.label]))
        options[option.label] = 0;
    }

    await jeCommandWithOptions.call(options);
    jeCommandWithOptions = null;
    jeShowCommands();
  });

  $a('#jeCommandOptions button')[1].addEventListener('click', function() {
    jeCommandWithOptions = null;
    jeShowCommands();
  });
}

export async function jeClick(widget, e) {
  if(e.ctrlKey) {
    jeSelectWidget(widget, e.shiftKey || e.which == 3 || e.button == 2);
    return true;
  }
}

// The offsets getSelection() reports are indices into whichever node holds the selection, so
// they only describe the editor while the editor holds it. Clicking a command button - or
// typing into the option fields of a command that has some - moves the selection out of
// #jeText, so the position the editor was last at is remembered here and used instead. Every
// read of the editor cursor goes through this, which keeps that memory up to date.
let jeLastCursorOffsets = [ 0, 0 ];

function jeCursorOffsets() {
  const selection = getSelection();
  // both ends have to sit in the text node #jeText holds: a selection dragged out of the editor
  // reports its two ends in different nodes, and one anchored on #jeText itself counts child
  // nodes rather than characters - neither pair says where the cursor is in the JSON
  const text = $('#jeText').firstChild;
  if(text && selection.anchorNode === text && selection.focusNode === text)
    jeLastCursorOffsets = [ Math.min(selection.anchorOffset, selection.focusOffset), Math.max(selection.anchorOffset, selection.focusOffset) ];
  return jeLastCursorOffsets;
}

function jeCursorStateGet() {
  const [ s, e ] = jeCursorOffsets();
  const v = jeGetEditorContent();
  const linesUntilCursor = v.split('\n').slice(0, v.substr(0, s).split('\n').length);
  const currentLine = linesUntilCursor.pop();
  let defaultValueToAdd = null;
  try {
    const defaultValueMatch = currentLine.match(/^  "([^"]+)": (.*?),?$/);
    if(defaultValueMatch && jeWidget && jeWidget.getDefaultValue(defaultValueMatch[1]) === JSON.parse(defaultValueMatch[2]))
      defaultValueToAdd = defaultValueMatch[1];
  } catch(e) {}
  return {
    scroll: $('#jeText').scrollTop,
    currentLine,
    lineNumber: linesUntilCursor.length,
    defaultValueToAdd,
    sameLinesBefore: linesUntilCursor.filter(l=>l==currentLine).length,
    start: s-linesUntilCursor.join('\n').length,
    end: e-linesUntilCursor.join('\n').length
  };
}

function jeCursorStateSet(state) {
  const v = jeGetEditorContent();
  const lines = v.split('\n');
  // moving the selection focuses the editor, which must not happen while a command's options are
  // being typed into: a change arriving from another player would else pull the caret out of the
  // option field and the next keystroke would land in the JSON. The position is only remembered
  // then, which is where the commands read it from anyway.
  const restore = function(start, end) {
    const options = $('#jeCommandOptions');
    if(options && options.contains(document.activeElement))
      jeLastCursorOffsets = [ start, end ];
    else
      jeSelect(start, end);
  };
  let offset = 0;
  let linesFound = 0;
  let lineRestored = false;
  for(const line of lines) {
    if(line == state.currentLine && linesFound++ == state.sameLinesBefore) {
      restore(offset + state.start - 1, offset + state.end - 1);
      lineRestored = true;
      break;
    } else {
      offset += line.length + 1;
    }
  }
  // a command that rewrites the very line the cursor sits on - shift on "x" for example - leaves
  // no line to match it by, so the cursor falls back to the same line number. Without that it ends
  // up nowhere and the next command runs on the top of the JSON instead of on the property the
  // panel still offers commands for.
  if(!lineRestored && lines[state.lineNumber] !== undefined) {
    const lineStart = lines.slice(0, state.lineNumber).reduce((total, line)=>total + line.length + 1, 0);
    const lineEnd = lineStart + lines[state.lineNumber].length;
    const inLine = offsetInLine=>Math.max(lineStart, Math.min(lineEnd, lineStart + offsetInLine - 1));
    restore(inLine(state.start), inLine(state.end));
  }
  $('#jeText').scrollTop = state.scroll;
  jeMarkCommandLine();
}

const jeCursorStateStorage = {};
function jeSaveCursorState(widget, cursorState) {
  if(widget && widget.id)
    jeCursorStateStorage[widget.id] = cursorState;
}

function jeLoadCursorState(widget) {
  if(widget && widget.id)
    return jeCursorStateStorage[widget.id];
}

function jeSelectWidget(widget, addToSelection) {
  const cursorState = jeCursorStateGet();
  jeSaveCursorState(jeWidget, cursorState);

  const newCursorState = jeLoadCursorState(widget);

  if(addToSelection && (jeMode == 'widget' || jeMode == 'multi')) {
    jeSelectWidgetMulti(widget);
  } else {
    jeMode = 'widget';
    jeWidget = widget;
    jePlainWidget = new widget.constructor();
    jeKeyIsDownDeltas = [];
    jeStateNow = JSON.parse(JSON.stringify(widget.state));
    if(newCursorState && newCursorState.defaultValueToAdd && jeStateNow[newCursorState.defaultValueToAdd] === undefined)
      jeStateNow[newCursorState.defaultValueToAdd] = jeWidget.getDefaultValue(newCursorState.defaultValueToAdd);
    const jsonString = JSON.stringify(jePreProcessObject(jeStateNow), null, '  ');
    jeStateBefore = jePreProcessText(jsonString);
    jeSet(jePreProcessText(jsonString, false));
    editPanel.style.setProperty('--treeHeight', "20%");
  }

  if(newCursorState)
    jeCursorStateSet(newCursorState);

  jeCenterSelection();

  jeGetContext();
  updateSelectionBars();
}

function jeSelectWidgetMulti(widget) {
  const wID = widget.get('id');

  if(jeMode == 'widget')
    jeStateNow = { widgets: [ jeWidget.get('id'), wID ] };
  else if(jeStateNow.widgets.indexOf(wID) != -1)
    jeStateNow.widgets.splice(jeStateNow.widgets.indexOf(wID), 1);
  else
    jeStateNow.widgets.push(wID);

  if(jeStateNow.widgets.length == 1 || jeStateNow.widgets[0] == jeStateNow.widgets[1])
    return jeSelectWidget(widgets.get(jeStateNow.widgets[0]));

  jeWidget = null;
  jeMode = 'multi';
  jeUpdateMulti();
}

function jeSelectSetMulti(widgets) {
  const wIDs = widgets.map(w=>w.get('id'));

  jeStateNow = { widgets: wIDs };

  jeWidget = null;
  jeMode = 'multi';
  jeUpdateMulti();
  jeGetContext();
  updateSelectionBars();
}

function jeMultiSelectedWidgets() {
  let selected = [];
  for(const search of jeStateNow.widgets) {
    const isRegex = search.match(/^\/(.*)\/([a-z]+)?$/);
    const isProperty = search.match(/^([a-zA-Z0-9_-]+):(.*)$/);
    selected = selected.concat(widgetFilter(function(w) {
      try {
        if(isRegex && String(w.get('id')).match(new RegExp(isRegex[1], isRegex[2])))
          return true;
        if(isProperty) {
          const value = String(w.get(isProperty[1])).toLowerCase();
          if(!isProperty[2] && value != 'null' && value != '' || isProperty[2] && value.includes(isProperty[2]))
            return true;
        }
      } catch(e) {}
      if(!isRegex && w.get('id') == search)
        return true;
    }));
  }
  return selected;
}

// In the multi-selection editor a property is either one value that goes to all
// selected widgets or an object that maps each selected widget id to its own.
function jeMultiValueIsPerWidget(value, widgetIDs) {
  return typeof value == 'object' && value !== null && !Object.keys(value).filter(k=>!widgetIDs.includes(k)).length;
}

// Pairs every value the multi-selection state gives for a property with the widget
// it belongs to, or with null where one value goes to the whole selection. Gathering
// the ids of the selection means running its search terms, so the shared case is
// answered without doing that.
function jeMultiPropertyEntries(state, property) {
  const value = state[property];
  if(typeof value != 'object' || value === null)
    return [ [ null, value ] ];
  const widgetIDs = jeMultiSelectedWidgets().map(w=>w.get('id'));
  if(!jeMultiValueIsPerWidget(value, widgetIDs))
    return [ [ null, value ] ];
  return Object.entries(value);
}

// The properties of a multi-selection whose value has to name a widget in the room,
// with the message for the first one that does not.
function jeMultiWidgetReferenceError(state) {
  // gathering the selection means running its search terms, so a state without either
  // property is answered without doing that
  let cardIDs = null;
  const goesToACard = widgetID => {
    if(cardIDs === null)
      cardIDs = new Set(jeMultiSelectedWidgets().filter(w=>w.get('type') == 'card').map(w=>w.get('id')));
    return widgetID === null ? cardIDs.size > 0 : cardIDs.has(widgetID);
  };
  for(const [ property, label ] of [ [ 'parent', 'Parent' ], [ 'deck', 'Deck' ] ]) {
    if(state[property] === undefined)
      continue;
    for(const [ widgetID, value ] of jeMultiPropertyEntries(state, property)) {
      // deck names a deck on a card - on anything else it is an ordinary property
      // that happens to be called deck
      if(property == 'deck' && !goesToACard(widgetID))
        continue;
      // null is applied by deleting the property: a widget without a parent belongs to the
      // room, while a card without a deck is dropped on the next load like a missing one
      if(value === undefined || (value === null && property != 'deck'))
        continue;
      const forWidget = widgetID === null ? '' : ` (widget "${widgetID}")`;
      // an object arrives here either as a value that is no ID at all, or as a
      // per-widget object whose keys do not match the selection - which makes the
      // whole object the one value the selection shares
      if(value !== null && typeof value == 'object')
        return widgetID === null
          ? `${label} has to be a widget ID, or an object with one entry per selected widget.`
          : `${label} has to be a widget ID${forWidget}.`;
      if(!widgets.has(value))
        return `${label} ${value} does not exist${forWidget}.`;
      if(property == 'deck' && !widgets.get(value).get('cardTypes'))
        return `Given widget ${value} is not a deck or doesn't define cardTypes${forWidget}.`;
    }
  }
  return null;
}

function jeSelectedIDs() {
  if(!jeStateNow)
    return [];
  else if(jeMode == 'multi')
    return jeMultiSelectedWidgets().map(w=>w.get('id'));
  else
    return [ jeStateNow.id ];
}

function jeCenterSelection() {
  const selectedIDs = jeSelectedIDs();

  for(const widgetDOM of $a('#jeTree .key')) {
    widgetDOM.parentElement.classList.toggle('jeHighlightRow', selectedIDs.indexOf(widgetDOM.textContent) != -1);
    if(selectedIDs.indexOf(widgetDOM.textContent) != -1)
      widgetDOM.scrollIntoView({ block: 'center' });
  }

  jeHighlightWidgets();
}

// The toggle for this sits in the selection bar, which every module that edits
// the selection carries - so it has to answer for a plain room selection as well
// as for whatever the JSON editor is showing.
function jeHighlightWidgets() {
  const selectedIDs = jeEnabled ? jeSelectedIDs() : selectedWidgets.map(w=>w.id);
  for(const [ id, w ] of widgets)
    w.setHighlighted(jeWidgetHighlighting && selectedIDs.indexOf(id) != -1);
}

function jeWidgetHighlightingEnabled() {
  return jeWidgetHighlighting;
}

function jeToggleWidgetHighlighting() {
  jeWidgetHighlighting = !jeWidgetHighlighting;
  jeHighlightWidgets();
  updateSelectionBars();
}

function jeSVGColors() {
  const div = document.createElement('div');
  div.id = 'jeSVGColors';
  div.innerHTML = `<div class="jeSVGColorsHeader"><b>SVG colors</b><button class="jeSVGColorsClose" title="Close">✕</button></div><div class="jeSVGColorsBody"></div>`;
  $('#jeCommands').insertBefore(div, $('#jeTopButtons').nextSibling);

  // Reinsert the div because it gets removed
  const observer = new MutationObserver(() => {
    if (!document.querySelector('#jeSVGColors')) {
      $('#jeCommands').insertBefore(div, $('#jeTopButtons').nextSibling);
    }
    closeIfImageChanged();
  });
  const jeCommands = document.querySelector('#jeCommands');
  if (jeCommands) {
    observer.observe(jeCommands, { childList: true, subtree: false });
  }

  const body = div.querySelector('.jeSVGColorsBody');
  const image = jeStateNow.image;

  // Whatever the panel has to say instead of colors, followed by the URL it is about: the panel is
  // a narrow column and the image property it answers for is easily scrolled out of the JSON pane.
  function sayInPanel(text, offerRetry) {
    body.innerHTML = '';
    const message = document.createElement('div');
    message.className = 'jeSVGColorsMessage';
    message.textContent = text;
    const url = document.createElement('div');
    url.className = 'jeSVGColorsURL';
    url.textContent = url.title = image;
    body.append(message, url);
    if (offerRetry) {
      const retry = document.createElement('button');
      retry.textContent = 'Try again';
      // fetchSVG() forgets a request that failed, so this really does ask for the file again
      retry.addEventListener('click', loadColors);
      body.appendChild(retry);
    }
  }

  // the text of a swatch has to stay readable on the color itself, and contrastAnyColor() reads a
  // six digit hex: a short form or an alpha channel would go through a canvas it cannot answer for
  // and come back as black on every swatch
  function opaqueHex(color) {
    const short = color.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])[0-9a-fA-F]?$/);
    return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : color.slice(0, 7);
  }

  function showColors(colors) {
    body.innerHTML = `<div class="jeSVGColorList">` + colors.map(color => {
      const backgroundColor = color === 'currentColor' ? 'black' : color;
      const textColor = color === 'currentColor' ? 'white' : contrastAnyColor(opaqueHex(color), 1);
      const title = color === 'currentColor' ? ` title="Inherits the widget's text color"` : '';
      return `<button style="background-color: ${backgroundColor}; color: ${textColor};" data-color="${color}"${title}>${color}</button>`;
    }).join('') + `</div>`;

    // Create the buttons
    const buttons = body.querySelectorAll('button');
    // a color that already has an svgReplaces entry is checked off, so working through a long
    // palette shows what is left instead of looking the same after every click
    const markMapped = _=>buttons.forEach(button => button.classList.toggle('jeSVGColorMapped', !!jeStateNow.svgReplaces && button.getAttribute('data-color') in jeStateNow.svgReplaces));
    markMapped();
    buttons.forEach(button => {
      button.addEventListener('click', function() {
        // a color of one file has no business in another widget's svgReplaces
        if (!jeStateNow || jeStateNow.image !== image)
          return;
        if (!jeStateNow.svgReplaces) {
          jeStateNow.svgReplaces = {};
        }
        const color = this.getAttribute('data-color');
        if (!(color in jeStateNow.svgReplaces)) {
          jeStateNow.svgReplaces[color] = "###SELECT ME###";
          jeSetAndSelect("");
        }
        markMapped();
      });
    });
  }

  // Extract and display SVG colors. The file comes from fetchSVG() (main.js), the one request per
  // image the engine and the SVG replacements editor go through as well: it answers with the file's
  // text, with null for a file that turned out not to be an SVG, and rejects when the file could not
  // be read at all - a cross-origin image blocked by CORS, a server that is not answering, a URL
  // that 404s. Every outcome gets a sentence in the panel, including an SVG that simply uses no hex
  // colors, so it never sits empty looking like it is still loading. An unhandled rejection here is
  // treated as a client crash and takes the whole session down with the error overlay.
  function loadColors() {
    sayInPanel('Loading the image …');
    fetchSVG(image).then(svg => {
      if (svg === null)
        return sayInPanel('The file behind this URL is not an SVG - the server answered with something else - so it has no colors that could be replaced.');
      // longest first, so #33aabbcc is one color and not #33aabb followed by nothing
      const hexColorRegex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b|currentColor/g;
      const uniqueColors = Array.from(svg.matchAll(hexColorRegex), match => match[0]);
      const colors = [...new Set(uniqueColors)];
      if (!colors.length)
        return sayInPanel('This SVG paints itself with named colors like red, with rgb() values or from a <style> block. Only hex colors such as #3366cc can be replaced.');
      showColors(colors);
    }).catch(_=>sayInPanel('This image could not be loaded, so the colors it uses could not be listed. Check the URL, then try again.', true));
  }
  loadColors();

  // The panel answers for one file, so it goes away as soon as the widget is showing another one -
  // otherwise it keeps listing the colors of the file it was opened with, names that file in its
  // messages and retries that file. Reloading it instead would request one URL per keystroke while
  // the image property is being typed, each prefix of it a URL of its own.
  function closeIfImageChanged() {
    if (jeStateNow && jeStateNow.image !== image)
      closePanel();
  }

  let classObserver;
  const closePanel = function() {
    div.remove();
    observer.disconnect();
    if (classObserver)
      classObserver.disconnect();
  };
  div.querySelector('.jeSVGColorsClose').addEventListener('click', closePanel);

  // Close the color viewer if the widget is deselected. The widget's DOM id is escaped, so it is
  // asked for its element rather than looked up by the id as it is written in the JSON.
  const widgetDiv = jeWidget && jeWidget.domElement;
  if (widgetDiv) {
    classObserver = new MutationObserver(() => {
      if (!widgetDiv.classList.contains('selectedInEdit'))
        closePanel();
    });
    classObserver.observe(widgetDiv, { attributes: true, attributeFilter: ['class'] });
  }
}

function jeUpdateMulti() {
  const selectedWidgets = jeMultiSelectedWidgets();
  const cursorState = jeCursorStateGet();
  jeCenterSelection();
  const keys = [ 'x', 'y', 'width', 'height', 'parent', 'z', 'layer' ];
  for(const usedKey in jeStateNow || [])
    if(usedKey != 'widgets' && keys.indexOf(usedKey) == -1)
      keys.push(usedKey);
  for(const key of keys) {
    jeStateNow[key] = {};
    for(const selectedWidget of selectedWidgets)
      jeStateNow[key][selectedWidget.get('id')] = selectedWidget.get(key);
    if(Object.values(jeStateNow[key]).every( (val, i, arr) => val === arr[0] ))
      jeStateNow[key] = Object.values(jeStateNow[key])[0];
  }
  jeSet(jeStateBefore = JSON.stringify(jeStateNow, null, '  '));
  jeCursorStateSet(cursorState);
}

function jeColorize() {
  const langObj = [
    [ /^( +")(.*)( \(in .*)(":.*)$/, null, 'extern', 'extern', null ], // e.g. "cardDefaults (in deck)": ...
    [ /^( +")(.*)(": ")(.*)(",?)$/, null, 'key', null, 'string', null ], // e.g. "value": "..."
    [ /^( +")(.*)(": )(-?[0-9.]+)(,?)$/, null, 'key', null, 'number', null ], // e.g. "value": 3
    [ /^( +)(-?[0-9.]+)(,?)$/, null, 'number', null ], // e.g. -37 (for example an array element)
    [ /^( +")(.*)(": )(null|true|false)(,?)$/, null, 'key', null, 'null', null ], // e.g. "value": true
    [ /^( +")(.*)(":.*)$/, null, 'key', null ], // e.g. "value": <some random string>
    [ /^(Room)$/, 'extern' ],
    [ /^( +"var )(.*)( = )(-?[0-9.]+)?(null|true|false)?(\$\{[^}]+\})?('(?:[a-zA-Z0-9,.() _-]|\\\\u[0-9a-fA-F]{4})*')?( )?([0-9a-zA-Z_-]+|[=+*/%<!>&|-]{1,3})?(🧮(?:[0-9a-zA-Z_-]+|[=+*/%<!>&|-]{1,2}))?( )?(-?[0-9.]+)?(null|true|false)?(\$\{[^}]+\})?('(?:[a-zA-Z0-9,.() _-]|\\\\u[0-9a-fA-F]{4})*')?( )?(-?[0-9.]+)?(null|true|false)?(\$\{[^}]+\})?('(?:[a-zA-Z0-9,.() _-]|\\\\u[0-9a-fA-F]{4})*')?( )?(-?[0-9.]+)?(null|true|false)?(\$\{[^}]+\})?('(?:[a-zA-Z0-9,.() _-]|\\\\u[0-9a-fA-F]{4})*')?(.*)(",?)$/, 'default', 'custom', null, 'number', 'null', 'variable', 'string', null, null, 'variable', null, 'number', 'null', 'variable', 'string', null, 'number', 'null', 'variable', 'string', null, 'number', 'null', 'variable', 'string', null, 'default' ],
    [ /^( +")(.*)(",?)$/, null, 'string', null ]
  ];
  let out = [];
  let nr = 0;
  function push(line) {
    // Highlight HTML tags and attributes
    line = line.replace(/(&lt;\/?)([a-zA-Z][a-zA-Z0-9]*)(.*?)(&gt;)/g, (m, open, tag, attrs, close) => {
      // Highlight tag name
      let result = open + `<i class=htmltag>${tag}</i>`;
      // Highlight attributes: attr="value" or attr='value'
      attrs = attrs.replace(/(\s+)([a-zA-Z][a-zA-Z0-9-]*)(\s*=\s*)('|\\&quot;)([^&']*)(\4)/g, 
        (m, ws, attr, eq, quote, value, quoteEnd) => {
          if(attr === 'style') {
            // Highlight CSS properties and values separately
            value = value.replace(/([a-zA-Z-]+)(\s*:\s*)([^;]+)/g, 
              (m, prop, colon, val) => `<i class=csskey>${prop}</i>${colon}<i class=cssvalue>${val.trim()}</i>`
            );
            return ws + `<i class=htmlattr>${attr}</i>${eq}${quote}${value}${quoteEnd}`;
          }
          return ws + `<i class=htmlattr>${attr}</i>${eq}${quote}<i class=htmlvalue>${value}</i>${quoteEnd}`;
        }
      );
      result += attrs + close;
      return result;
    });

    // Highlight variables
    line = line.replace(/\$\{[^}]+\}/g, m=>`<i class=variable>${m}</i>`);

    out.push(`<div class=jeTextLine><span class=jeLineNumber>${nr}</span><span class=jeLineContent>${line}</span></div>`);
  }
  for(let line of jeGetEditorContent().split('\n')) {
    ++nr;
    let foundMatch = false;
    for(const l of langObj) {
      const match = line.match(l[0]);
      if(match) {
        if(jeMode == 'widget' && match[1] == '  "' && l[2] == 'key' && (l[4] == "null" && match[4] == "null" || String(jeWidget.defaults[match[2]]) == match[4])) {
          push(`<i class=default>${html(line)}</i>`);
          foundMatch = true;
          break;
        }

        const c = {...l};
        if(jeMode == 'widget' && match[1] == '  "' && l[2] == 'key' && [ 'id', 'type' ].indexOf(match[2]) == -1 && jePlainWidget.getDefaultValue(match[2]) === undefined)
          c[2] = 'custom';

        for(let i=1; i<l.length; ++i) {
          if(c[i] === 'string' && /<[^>]+>/.test(match[i]))
            c[i] = null;
          if(c[i] && match[i])
            match[i] = `<i class=${c[i]}>${html(match[i])}</i>`;
          else if(match[i])
            match[i] = html(match[i]);
        }

        push(match.slice(1).join(''));
        foundMatch = true;

        break;
      }
    }
    if(!foundMatch)
      push(html(line));
  }
  $('#jeTextHighlight').innerHTML = out.join('');
  $('#editor').style.setProperty('--linenumbers-digits', Math.floor(Math.log10(nr)+1));
  jeMarkCommandLine();
}

/* Displaying and controlling tree subpane of edit area */

const isNodeCollapsed = {};
function jeDisplayTree() {
  const allWidgets = Array.from(widgets.values());
  const oldFilterValue = $('#jeWidgetSearchBox') && $('#jeWidgetSearchBox').value;
  // the tree is also shown from sidebar modules other than the JSON one, which leave jeStateNow at whatever they last saw
  const selectedIDs = jeEnabled ? jeSelectedIDs() : selectedWidgets.map(w=>w.id);
  $('#jeTree').innerHTML = '<div><input id="jeWidgetSearchBox" placeholder="🔍 Filter"><button>Collapse</button></div><ul class=jeTreeDisplay>' + jeDisplayTreeAddWidgets(allWidgets, null, selectedIDs) + '</ul>';

  treeNodes = {};
  for(const dom of $a('#jeTree .key'))
    treeNodes[dom.innerText] = dom.parentNode;

  // Add handlers to tree elements to display widget contents
  on('.jeTreeExpander', 'click', function(e) {
    if(e.target.classList.contains('jeTreeExpander')) {
      jeToggleTreeNode(e.target, !e.target.classList.contains('jeTreeExpander-down'));
      e.stopImmediatePropagation();
    }
  });

  // Add handler to search box to display widget list
  on('#jeWidgetSearchBox', 'input', jeDisplayFilteredWidgets);
  on('#jeWidgetSearchBox + button', 'click', e=>$a('#jeTree .jeTreeExpander-down').forEach(expander=>jeToggleTreeNode(expander, false)));

  on('.jeTreeWidget', 'click', function(e) {
    const widget = widgets.get($('.key', e.currentTarget).innerText);

    if(!e.shiftKey) {
      setSelection([ widget ]);
    } else if(selectedWidgets.indexOf(widget) == -1) {
      setSelection(selectedWidgets.concat([ widget ]));
    } else {
      setSelection(selectedWidgets.filter(w=>w!=widget));
    }

    e.stopPropagation();
  });

  if(oldFilterValue) {
    $('#jeWidgetSearchBox').value = oldFilterValue;
    jeDisplayFilteredWidgets();
  }
}

// Opening and closing a branch, for the arrow of the tree and for the keys of
// the selection bar alike. The collapsed state is remembered per widget, so a
// tree that is rebuilt - or opened again in another module - comes back the way
// it was left.
function jeToggleTreeNode(expander, open) {
  if(!expander || !expander.classList.contains('jeTreeExpander') || expander.classList.contains('jeTreeExpander-down') == open)
    return;
  jeSetTreeNodeOpen(expander, open);
  isNodeCollapsed[expander.parentNode.dataset.filter] = !open;
}

// Showing and hiding a branch without saying anything about what the user wants
// to see: this is what the filter uses to bring the branches that hold a match
// into view.
function jeSetTreeNodeOpen(expander, open) {
  if(!expander || !expander.classList.contains('jeTreeExpander') || expander.classList.contains('jeTreeExpander-down') == open)
    return;
  $('.nested', expander.parentElement).classList.toggle('active', open);
  expander.classList.toggle('jeTreeExpander-down', open);
}

// A branch is collapsed if the user left it that way - and a pile, whose cards
// nobody wants to scroll past, also if it was never touched at all.
function jeTreeNodeIsCollapsed(filter, widget) {
  return isNodeCollapsed[filter] !== undefined ? isNodeCollapsed[filter] : !!widget && widget.get('type') == 'pile';
}

// Bringing the selected widgets into view: what somebody opening the tree is
// looking for is almost always the widget the editor is already on. A row inside
// a collapsed branch has no box at all, so the branches on the way down to it are
// opened before it is scrolled to.
function jeScrollTreeToSelection() {
  const selectedIDs = jeEnabled ? jeSelectedIDs() : selectedWidgets.map(w=>w.id);
  let firstRow = null;
  for(const node of $a('#jeTree li.jeTreeWidget')) {
    if(selectedIDs.indexOf(node.dataset.id) == -1)
      continue;
    for(let list = node.parentElement; list && list.id != 'jeTree'; list = list.parentElement)
      if(list.classList.contains('jeNestedTree'))
        jeToggleTreeNode(list.previousElementSibling, true);
    firstRow = firstRow || $('.key', node);
  }
  if(firstRow)
    firstRow.scrollIntoView({ block: 'nearest' });
}

function jeDisplayTreeAddWidgets(allWidgets, parent, selectedIDs) {
  function colored(str, kind) {
    return `<i class=${kind}>${html(str)}</i>`
  }
  let result = '';

  for(const widget of (allWidgets.filter(w=>w.get('parent')==parent)).sort((w1,w2)=>String(w1.get('id')).localeCompare(w2.get('id'), 'en', {numeric: true, ignorePunctuation: true}))) {
    const children = jeDisplayTreeAddWidgets(allWidgets, widget.get('id'), selectedIDs);
    const isSelected = selectedIDs.indexOf(widget.get('id')) != -1 ? 'jeHighlightRow' : '';
    const filter = html(widget.get('id')+(widget.get('type')||'basic')+(widget.get('cardType')||'')).toLowerCase();
    const filterText = `data-filter="${filter}"`;
    const idText = `data-id="${widget.get('id')}"`;
    const isCollapsed = jeTreeNodeIsCollapsed(filter, widget);

    if(children)
      result += `<li ${filterText} ${idText} class="jeTreeWidget"><span class="jeTreeWidget ${isSelected} jeTreeExpander ${isCollapsed ? '' : 'jeTreeExpander-down'}">`;
    else
      result += `<li ${filterText} ${idText} class="jeTreeWidget ${isSelected}">`;

    result += jeTreeGetWidgetHTML(widget);

    if(children)
      result += `</span><ul class="jeNestedTree nested ${isCollapsed ? '' : 'active'}">${children}</ul>`;
    result += '</li>';

    delete allWidgets[allWidgets.indexOf(widget)];
  }
  return result;
}

function jeTreeGetWidgetHTML(widget) {
  function colored(str, kind) {
    return `<i class=${kind}>${html(str)}</i>`
  }
  const type = widget.get('type');

  let result = `${colored(widget.get('id'), 'key')} (${colored(type || 'basic','string')} - `;
  const id = String(widget.get('id'));
  // extras are only helpful on generated IDs (random four characters or a
  // type/piece prefix plus a number), not on IDs an author chose
  if(id.match(/^[0-9a-z]{4}$/) || (type ? id.startsWith(type) && id.substr(type.length).match(/^[0-9]+$/) : id.match(/^[a-z]+[0-9]+$/))) {
    if(type == 'card' && !String(widget.get('cardType')).match(/^type-[0-9a-f-]{36}$/))
      result += `${colored(widget.get('cardType'),'extern')} - `;
    if(type == 'button' && widget.get('text'))
      result += `${colored(String(widget.get('text')).replaceAll('\n', '\\n'),'extern')} - `;
    if(type == null && widget.get('classes'))
      result += `${colored(widget.get('classes'),'extern')} - `;
  }
  result += `${colored(String(Math.floor(widget.get('x'))),'number')},` +
    `${colored(String(Math.floor(widget.get('y'))),'number')})`;

  return result;
}

function jeUpdateTree(delta) {
  for(const id in delta) {
    if(typeof treeNodes[id] != 'undefined' && delta[id] != null && typeof delta[id].parent == 'undefined') {
      treeNodes[id].innerHTML = jeTreeGetWidgetHTML(widgets.get(id));
    } else if(!jeInMacroExecution) {
      jeDisplayTree();
      if(jeDeltaIsOurs && delta[id] != null && typeof delta[id].id == 'string')
        jeCenterSelection();
      break;
    }
  }
}

function jeDisplayFilteredWidgets(e) {
  const subtext = $('#jeWidgetSearchBox').value.toLowerCase();
  const propertyFilter = $('#jeWidgetSearchBox').value.match(/^([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]*)$/);
  for(const previousParent of $a('#jeTree .filterChildIncluded'))
    previousParent.classList.remove('filterChildIncluded');

  // An empty filter matches every widget, so carrying on would mark every branch
  // as one that holds a match and open the whole tree. Instead the tree goes
  // back to the shape the user left it in.
  if(!subtext) {
    for(const node of $a('#jeTree li.jeTreeWidget')) {
      node.classList.remove('filterIncluded', 'filterNotIncluded');
      jeSetTreeNodeOpen(node.firstElementChild, !jeTreeNodeIsCollapsed(node.dataset.filter, widgets.get(node.dataset.id)));
    }
    return;
  }

  for(const node of $a('#jeTree li.jeTreeWidget')) {
    let nodeMatchesFilter = !!node.dataset.filter && node.dataset.filter.includes(subtext);
    if(propertyFilter) {
      const value = String(widgets.get(node.dataset.id).get(propertyFilter[1])).toLowerCase();
      if(!propertyFilter[2] && value != 'null' && value != '' || propertyFilter[2] && value.includes(propertyFilter[2]))
        nodeMatchesFilter = true;
    }
    node.classList.toggle('filterIncluded', nodeMatchesFilter);
    node.classList.toggle('filterNotIncluded', !nodeMatchesFilter);
    // The branches on the way to a match are opened for real instead of being
    // forced open by CSS: that way their arrow tells the truth, and one click on
    // it - or one ← - folds the branch away again while the filter still stands.
    if(nodeMatchesFilter)
      for(let parent=node.parentElement; parent.classList.contains('jeTreeWidget') || parent.classList.contains('jeNestedTree'); parent=parent.parentElement)
        if(parent.classList.contains('jeNestedTree'))
          jeSetTreeNodeOpen(parent.previousElementSibling, true);
        else
          parent.classList.add('filterChildIncluded');
  }
}

/* End of tree subpane control */

function jeGetContext() {
  const [ s, e ] = jeCursorOffsets();
  const v = jeGetEditorContent();

  const select = v.substr(s, Math.min(e-s, 100)).replace(/\n/g, '\\n');
  const line = v.split('\n')[v.substr(0, s).split('\n').length-1];

  if(jeMode == 'macro') {
    jeContext = [ 'Macro' ];
    jeShowCommands();
    return jeContext;
  }

  if(jeMode == 'empty') {
    jeShowCommands();
    return jeContext;
  }

  if(jeMode == 'trace') {
    jeContext = [ 'Trace' ];
    jeShowCommands();
    return jeContext;
  }

  try {
    jeStateNow = JSON.parse(jePostProcessText(v));

    if(!jeStateNow.id)
      jeJSONerror = 'No ID given.';
    else if(typeof jeStateNow.id != 'string')
      jeJSONerror = 'ID has to be a string.';
    else if(JSON.parse(jeStateBefore).id != jeStateNow.id && widgets.has(jeStateNow.id))
      jeJSONerror = `ID ${jeStateNow.id} is already in use.`;
    else if(jeStateNow.parent !== undefined && jeStateNow.parent !== null && !widgets.has(jeStateNow.parent))
      jeJSONerror = `Parent ${jeStateNow.parent} does not exist.`;
    else if(jeStateNow.type == 'card' && (!jeStateNow.deck || !widgets.has(jeStateNow.deck)))
      jeJSONerror = `Deck ${jeStateNow.deck} does not exist.`;
    else if(jeStateNow.type == 'card' && !widgets.get(jeStateNow.deck).get('cardTypes'))
      jeJSONerror = `Given widget ${jeStateNow.deck} is not a deck or doesn't define cardTypes.`;
    else if(jeStateNow.type == 'card' && (!jeStateNow.cardType || !widgets.get(jeStateNow.deck).get('cardTypes')[jeStateNow.cardType]))
      jeJSONerror = `Card type ${jeStateNow.cardType} does not exist in deck ${jeStateNow.deck}.`;
    else
      jeJSONerror = null;
  } catch(e) {
    jeStateNow = null;
    jeJSONerror = e;
  }

  // go through all the lines up until the cursor and use the indentation to figure out the context
  let keys = [ jeStateNow && jeStateNow.type || 'basic' ];
  for(const line of v.split('\n').slice(0, v.substr(0, s).split('\n').length)) {
    const keyMatch = line.match(/^(\s+)"((?:\\.|[^"\\])*)"\s*:/);
    if(keyMatch) {
      const depth = keyMatch[1].length/2;
      keys[depth] = keyMatch[2];
      keys = keys.slice(0, depth+1);
      continue;
    }

    const valueMatch = line.match(/^( +)(["{ftn0-9-])/);
    if(valueMatch) {
      const depth = valueMatch[1].length/2;
      if(valueMatch[2]=='{' || line.match(/^ +("[^"]*"|false|true|null|-?[0-9]+\.?[0-9]*),?$/)) {
        keys[depth] = (keys[depth] === undefined ? -1 : keys[depth]) + 1;
        keys = keys.slice(0, depth+1);
      }
    }
    const mClose = line.match(/^( *)[\]}]/);
    if(mClose)
      keys = keys.slice(0, mClose[1].length/2+1);
  }

  // make sure the context actually exists in the widget
  if(!jeJSONisUnparsed()) {
    let pointer = jeStateNow;
    for(let i=1; i<keys.length; ++i) {
      if(pointer[keys[i]] === undefined) {
        keys = keys.slice(0, i);
        break;
      }
      pointer = pointer[keys[i]];
    }
  }

  // insert the operation type as a virtual key so commands can check which operation they're in
  try {
    for(let i=1; i<keys.length-1; ++i) {
      if(String(keys[i]).match(/Routine$/) && typeof keys[i+1] == 'number' && !jeJSONisUnparsed()) {
        const operation = jeGetValue(keys.slice(1, i+2), true);
        const func = typeof operation == 'string' && operation.match(/^var/) ? 'var expression' : operation.func;
        keys.splice(i+2, 0, '(' + (func || String(keys.slice(0, i+2))) + ')');
      }
    }
  } catch(e) {}

  if(select)
    keys.push(`"${select}"`);

  if(jeMode == 'multi') {
    try {
      jeStateNow = JSON.parse(v);

      if(!Array.isArray(jeStateNow.widgets)) {
        jeJSONerror = 'Key widgets is not an array.';
      } else {
        // the same checks the single widget mode does above - a parent no widget in
        // the room has would leave the whole selection in limbo, a deck no widget in
        // the room has leaves the card without faces and drops it on the next load.
        // While the widgets array itself is being edited, the values still describe
        // the previous selection, so there is nothing to check yet.
        jeJSONerror = keys[1] == 'widgets' ? null : jeMultiWidgetReferenceError(jeStateNow);
      }
    } catch(e) {
      jeStateNow = null;
      jeJSONerror = e;
    }
    keys[0] = 'Multi-Selection';
  }

  jeContext = keys;

  jeShowCommands();

  return jeContext;
}

function jeGetEditorContent() {
  return $('#jeText').textContent.replace(/\u00a0/g, ' ');
}

function jeGetLastKey() {
  return jeContext[jeContext.length-1].toString().match(/^"/) ? jeContext[jeContext.length-2] : jeContext[jeContext.length-1];
}

function jeGetValue(context, all) {
  let pointer = jeStateNow;
  for(const key of context || jeContext)
    if(all && pointer[key] !== undefined || typeof pointer[key] == 'object' && pointer[key] !== null)
      pointer = pointer[key];
  return pointer
}

function jeInsert(context, key, value) {
  if(!jeJSONisUnparsed()) {
    let pointer = jeGetValue(context);
    pointer[key] = '###SELECT ME###';
    jeSetAndSelect(value);
  }
}

function jeGetValueAt(key) {
  let pointer = jeStateNow;
  for(const k of jeContext.slice(1)) {
    if(typeof pointer[k] != 'undefined')
      pointer = pointer[k];
    if(key == k)
      return pointer;
  }
}

async function jeSetValueAt(key, value, selectValue) {
  let pointer = jeStateNow;
  for(const k of jeContext.slice(1)) {
    if(key == k)
      break;
    if(typeof pointer[k] != 'undefined')
      pointer = pointer[k];
  }
  if(selectValue !== undefined) {
    pointer[key] = value;
    jeSetAndSelect(selectValue);
  } else {
    pointer[key] = '###SELECT ME###';
    jeSetAndSelect(value);
  }
  await jeApplyChanges();
}

function jeGetKeyAfter(key) {
  let found = false;
  for(const k of jeContext) {
    if(found)
      return k;
    if(key == k)
      found = true;
  }
}

function jeIsInlineTag(tagName) {
  return [ 'a', 'abbr', 'acronym', 'b', 'bdo', 'big', 'br', 'button', 'cite', 'em', 'i', 'img', 'label', 'map', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'tt', 'var', 'strike' ].indexOf(tagName.toLowerCase()) != -1;
}

function jeFormatHTML(html, baseIndent) {
  if (!html || !html.trim()) return html;
  
  const trimmed = html.replace(/\n\s*/g, ' ').trim();
  const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];
  
  function findMatchingClosingTag(startPos, tagName) {
    let pos = startPos;
    let nestedDepth = 1;
    
    while (pos < trimmed.length) {
      const nextTag = trimmed.indexOf('<', pos);
      if (nextTag === -1) return { start: -1, end: -1 };
      
      const tagEnd = trimmed.indexOf('>', nextTag);
      if (tagEnd === -1) return { start: -1, end: -1 };
      
      const tagContent = trimmed.substring(nextTag + 1, tagEnd);
      const isClosing = tagContent.trim().startsWith('/');
      const currentTagName = (isClosing ? tagContent.substring(1) : tagContent).trim().split(/\s/)[0].toLowerCase();
      const isSelfClosing = selfClosingTags.includes(currentTagName) || tagContent.trim().endsWith('/');
      
      if (!isClosing && currentTagName === tagName && !isSelfClosing) {
        nestedDepth++;
      } else if (isClosing && currentTagName === tagName) {
        nestedDepth--;
        if (nestedDepth === 0) {
          return { start: nextTag, end: tagEnd + 1 };
        }
      }
      
      pos = tagEnd + 1;
    }
    
    return { start: -1, end: -1 };
  }
  
  function containsBlockChild(contentStart, contentEnd) {
    let pos = trimmed.indexOf('<', contentStart);
    while (pos !== -1 && pos < contentEnd) {
      const tagEnd = trimmed.indexOf('>', pos);
      if (tagEnd === -1 || tagEnd > contentEnd) break;
      const tagInner = trimmed.substring(pos + 1, tagEnd).trim();
      const isClosing = tagInner.startsWith('/');
      const tagName = (isClosing ? tagInner.substring(1) : tagInner).split(/\s/)[0].toLowerCase();
      const isSelfClosing = selfClosingTags.includes(tagName) || tagInner.endsWith('/');
      if (!isClosing && !isSelfClosing && !jeIsInlineTag(tagName)) {
        return true;
      }
      pos = trimmed.indexOf('<', tagEnd + 1);
    }
    return false;
  }

  function formatContent(startPos, endPos, currentDepth, parentIsBlock) {
    const result = [];
    let i = startPos;
    const currentIndent = baseIndent + '  '.repeat(currentDepth);
    let lineBuffer = '';
    let lineLength = 0;
    
    function flushLine() {
      if (!parentIsBlock || !lineLength) return;
      result.push(currentIndent + lineBuffer);
      lineBuffer = '';
      lineLength = 0;
    }
    
    function appendToken(tokenText) {
      if (!parentIsBlock) return;
      const trimmedToken = tokenText.replace(/\s+/g, ' ').trim();
      if (!trimmedToken) return;
      const tokenLength = trimmedToken.length;
      
      if (tokenLength > 60) {
        flushLine();
        result.push(currentIndent + trimmedToken);
        return;
      }
      
      if (lineLength && lineLength + 1 + tokenLength > 60) {
        flushLine();
      }
      
      if (lineLength) {
        lineBuffer += ' ';
        lineLength += 1;
      }
      
      lineBuffer += trimmedToken;
      lineLength += tokenLength;
    }
    
    while (i < endPos) {
      if (trimmed[i] === '<') {
        const tagEnd = trimmed.indexOf('>', i);
        if (tagEnd === -1 || tagEnd >= endPos) break;
        
        const tagContent = trimmed.substring(i + 1, tagEnd);
        const isClosing = tagContent.trim().startsWith('/');
        const tagName = (isClosing ? tagContent.substring(1) : tagContent).trim().split(/\s/)[0].toLowerCase();
        const isSelfClosing = selfClosingTags.includes(tagName) || tagContent.trim().endsWith('/');
        const isInlineTag = jeIsInlineTag(tagName);
        
        if (isClosing) {
          flushLine();
          result.push(baseIndent + '  '.repeat(Math.max(0, currentDepth - 1)) + '<' + tagContent + '>');
          i = tagEnd + 1;
        } else if (isSelfClosing) {
          flushLine();
          result.push(baseIndent + '  '.repeat(currentDepth) + '<' + tagContent + '>');
          i = tagEnd + 1;
        } else {
          const closingTag = findMatchingClosingTag(tagEnd + 1, tagName);
          if (closingTag.end !== -1 && closingTag.end <= endPos) {
            const fullTagContent = trimmed.substring(i, closingTag.end).trim();
            const hasBlockChild = containsBlockChild(tagEnd + 1, closingTag.start);
            if (isInlineTag) {
              if (parentIsBlock) {
                appendToken(fullTagContent);
              } else {
                result.push(baseIndent + '  '.repeat(currentDepth) + fullTagContent);
              }
              i = closingTag.end;
            } else if (!hasBlockChild && fullTagContent.length <= 60) {
              flushLine();
              result.push(baseIndent + '  '.repeat(currentDepth) + fullTagContent);
              i = closingTag.end;
            } else {
              flushLine();
              result.push(baseIndent + '  '.repeat(currentDepth) + '<' + tagContent + '>');
              const nestedResult = formatContent(tagEnd + 1, closingTag.start, currentDepth + 1, true);
              result.push(...nestedResult);
              const actualClosingTag = trimmed.substring(closingTag.start, closingTag.end);
              result.push(baseIndent + '  '.repeat(currentDepth) + actualClosingTag);
              i = closingTag.end;
            }
          } else {
            result.push(baseIndent + '  '.repeat(currentDepth) + '<' + tagContent + '>');
            i = tagEnd + 1;
          }
        }
      } else {
        const nextTag = trimmed.indexOf('<', i);
        if (nextTag === -1 || nextTag >= endPos) {
          const textContent = trimmed.substring(i, endPos).trim();
          if (textContent) {
            if (parentIsBlock) {
              const words = textContent.split(/\s+/);
              for (const word of words) {
                appendToken(word);
              }
            } else {
              result.push(baseIndent + '  '.repeat(currentDepth) + textContent);
            }
          }
          break;
        }
        
        const textContent = trimmed.substring(i, nextTag).trim();
        if (textContent) {
          if (parentIsBlock) {
            const words = textContent.split(/\s+/);
            for (const word of words) {
              appendToken(word);
            }
          } else {
            result.push(baseIndent + '  '.repeat(currentDepth) + textContent);
          }
        }
        i = nextTag;
      }
    }
    
    flushLine();
    
    return result;
  }
  
  return formatContent(0, trimmed.length, 0, false).join('\n');
}

// START routine logging

let jeRoutineResetOnNextLog = true;
// True while the newest thing in the log is the "logging resumed" note. Leaving and entering edit
// mode again without anything being logged in between would otherwise stack up an identical note
// for every round trip.
let jeLoggingResumeNoted = false;
let jeRoutineAutoReset = true;
let jeRoutineResult = '';
let jeLoggingHTML = '';
let jeLoggingDepth = 0;
let jeHTMLStack = [];

// Empty the log, both the buffer and what is on screen - a buffer that no longer matches the panel
// leaves entries on display that look current while nothing knows about them any more. Operations
// of a routine that is currently running have the log so far saved on jeHTMLStack, so that has to
// be emptied too - otherwise jeLoggingRoutineOperationEnd prepends it again and resurrects what was
// just cleared.
function jeLoggingClear() {
  jeLoggingHTML = '';
  jeLoggingResumeNoted = false;
  for(const entry of jeHTMLStack)
    entry[0] = '';
  if($('#jeLog'))
    $('#jeLog').innerHTML = '';
}

function jeLoggingJSON(obj) {
  return html(JSON.stringify(obj, null, '  ').split('\n').slice(1, -1).join('\n'));
}

// The built-in variables of the routines that are currently running, one entry per routine on the
// stack - the innermost one belongs to the routine the operation being logged is part of. They
// hold the value the routine started with, so they are identical in every operation of it and are
// shown behind their own expander while the variables the routine actually works with stay at the
// top of the pane. A routine that assigns a built-in name keeps that variable among its own,
// because its value then differs from the one the routine started with.
let jeLoggingEngineVariableStack = [];

function jeLoggingEngineVariables(variables) {
  const fromEngine = {};
  for(const name in predefinedVariableDescriptions)
    if(name in variables)
      fromEngine[name] = variables[name];
  return fromEngine;
}

function jeLoggingVariables(variables) {
  const fromEngine = jeLoggingEngineVariableStack[0] || {};
  const own = {};
  const engine = {};
  for(const name in variables) {
    const untouched = name in fromEngine && JSON.stringify(variables[name]) === JSON.stringify(fromEngine[name]);
    (untouched ? engine : own)[name] = variables[name];
  }
  const ownBlock = Object.keys(own).length ?
        `<div class="jeLogVariables"><h3>Variables afterwards</h3>${jeLoggingJSON(own)}</div>` : '';
  const engineBlock = Object.keys(engine).length ?
        `<div class="jeLogDetails">
            <div class="jeExpander">
              <span class="jeLogName">Built-in variables</span>
            </div>
            <div class="jeLogNested">
              <div class="jeLogVariables">${jeLoggingJSON(engine)}</div>
            </div>
          </div>` : '';
  return ownBlock + engineBlock;
}

export function jeLoggingRoutineStart(widget, property, variables, byReference) {
  if( jeHTMLStack.length == 0 || ['CALL', 'CLICK', 'IF', 'loopRoutine', 'Moves'].indexOf( jeHTMLStack[0][3] ) == -1 ) {
    if(jeRoutineResetOnNextLog) {
      jeLoggingHTML = '';
      jeRoutineResetOnNextLog = false;
    }
    jeLoggingHTML += `
      <div class="jeLog">
        <div class="jeExpander ${jeLoggingDepth ? '' : 'jeExpander-down'}">
          <span class="jeLogWidget">${html(widget.get('id'))}</span> &rsaquo;
          <span class="jeLogProperty">${html(typeof property == 'string' ? property : '--custom--')}</span>
        </div>
        <div class="jeLogNested ${jeLoggingDepth ? '' : 'active'}">
    `;
    jeLoggingResumeNoted = false;
  }
  // a routine that runs by reference works on the variables of the routine that started it, which
  // may have changed a built-in one by now - the enclosing routine's set still says what it started
  // with, so it is what applies here as well
  jeLoggingEngineVariableStack.unshift(byReference
    ? jeLoggingEngineVariableStack[0] || {}
    : jeLoggingEngineVariables(variables));
  ++jeLoggingDepth;
}

export function jeLoggingRoutineEnd(variables, collections) {
  if(!jeLoggingDepth)
    return; // defensive: unmatched End, should not happen since #2672
  if( jeHTMLStack.length == 0 || ['CALL', 'CLICK', 'IF', 'loopRoutine', 'Moves'].indexOf( jeHTMLStack[0][3] ) == -1 ) jeLoggingHTML += '</div></div>';
  jeLoggingEngineVariableStack.shift();
  --jeLoggingDepth;
  if(!jeLoggingDepth)
    jeLoggingRenderLog(jeLoggingHTML + '</div></div>');
}

// Put the log into the panel. Everything that depends on the rendered DOM (the expander click
// handlers and the filter) has to be applied again afterwards, so all rendering goes through here.
function jeLoggingRenderLog(logHTML) {
  $('#jeLog').innerHTML = logHTML;

  // Make it so clicking on the arrows expands the subtree
  const expanders = document.getElementsByClassName('jeExpander');
  let i;
  for (i=0; i < expanders.length; i++) {
    expanders[i].addEventListener('click', function() {
      this.classList.toggle('jeExpander-down');
      this.parentNode.querySelector('.jeLogNested').classList.toggle('active');
      if(this.classList.contains('jeExpander-down')) {
        this.classList.add('manuallyExpanded');
        this.parentNode.querySelector('.jeLogNested').classList.add('manuallyExpanded');
      } else {
        this.classList.remove('manuallyExpanded');
        this.parentNode.querySelector('.jeLogNested').classList.remove('manuallyExpanded');
      }
    });
  }
  // Make expander arrows that are parents of nodes with problems show up red.
  const problems = document.getElementsByClassName('jeLogHasProblems');
  for (i=0; i<problems.length; i++) {
    let node = problems[i];
    while (node && node.id != 'jeLog') {
      if(node.classList.contains('jeLogOperation') || node.classList.contains('jeLog')) {
        node.firstElementChild.classList.remove('jeExpander');
        node.firstElementChild.classList.add('jeRedExpander')
      }
      node = node.parentNode;
    }
  }

  if($('#jeLogFilter') && $('#jeLogFilter').value)
    jeLoggingFilterLog($('#jeLogFilter').value);
}

// Called instead of jeLoggingRoutineEnd when logging was switched on while the routine was already
// running (e.g. the Debug module was opened while the routine waited for an INPUT). That routine
// cannot be logged retroactively, so leave a note explaining the gap instead of showing nothing.
export function jeLoggingRoutineNotLogged(widget, property) {
  if(jeLoggingDepth || jeHTMLStack.length || !$('#jeLog'))
    return;
  if(jeRoutineResetOnNextLog) {
    jeLoggingHTML = '';
    jeRoutineResetOnNextLog = false;
  }
  const routine = typeof property == 'string'
    ? `<span class="jeLogWidget">${html(widget.get('id'))}</span> &rsaquo; <span class="jeLogProperty">${html(property)}</span>`
    : `an inline routine of <span class="jeLogWidget">${html(widget.get('id'))}</span>`;
  jeLoggingHTML += `
    <div class="jeLog jeLogNote">
      ${routine} was already running when the Debug panel was opened, so it could not be recorded. Run it again to see its log.
    </div>
  `;
  jeLoggingResumeNoted = false;
  jeLoggingRenderLog(jeLoggingHTML);
}

// Called when logging is switched back on because edit mode was opened again with the Debug panel
// still displayed. Nothing that happened while the game was played was logged, so the entries that
// are still on screen are older than the last thing the user did - mark them instead of letting the
// panel present them as the most recent interaction.
function jeLoggingResumed() {
  if(jeLoggingDepth || jeHTMLStack.length || !$('#jeLog') || !jeLoggingHTML || jeLoggingResumeNoted)
    return;
  jeLoggingResumeNoted = true;
  const note = `
    <div class="jeLog jeLogNote">
      Logging resumed. Everything above is from before edit mode was left - what you did while playing was not logged.
    </div>
  `;
  jeLoggingHTML += note;
  // Appended instead of rendered from the buffer: a re-render collapses the entries the user
  // expanded before going off to play, which is the very log this note belongs to. The note carries
  // no expanders and sits outside .jeLogNested, so neither the click handlers nor the filter apply.
  $('#jeLog').insertAdjacentHTML('beforeend', note);
}

export function jeLoggingRoutineOperationStart(original, applied) {
  let fcn;
  if (typeof applied == 'string')
    if (applied.substring(0,3) == 'var')
      fcn = 'var'
    else if (applied.substring(0,2) == '//')
      fcn = '//'
    else
      fcn = applied
  else
    fcn = applied.func || '<COMMENT>'
  jeHTMLStack.unshift([jeLoggingHTML, original, applied, html(fcn), +new Date()]);
  jeLoggingHTML = '';
}

export function jeLoggingRoutineOperationEnd(problems, variables, collections, skipped) {
  const collDisplay = {};
  for(const name in collections)
    collDisplay[name] = collections[name].map(w=>`${html(w.get('id'))} (${html(w.get('type')||'basic')})`);

  const savedHTML = jeHTMLStack.shift();
  if(!savedHTML) {
    // defensive: unmatched End, should not happen since #2672. Nothing to close.
    jeRoutineResult = '';
    return;
  }
  const original = savedHTML[1];
  const originalText = jeLoggingJSON(original);
  const applied = savedHTML[2];
  const appliedText  = jeLoggingJSON(applied);
  const opFunction = savedHTML[3];
  const startTime = savedHTML[4];

  const opProblems = problems.length ?
       `<div class="jeLogDetails">
          <div class="jeExpander">
            <span class="jeLogName">Problems</span>
          </div>
          <div class="jeLogNested">
            <div class="jeLogProblems">${problems.map(p=>html(typeof p == 'string' ? p : JSON.stringify(p))).join('\n')}</div>
          </div>
        </div>` : '';
  const originalOp = originalText.length ?
        `<div class="jeLogOriginal"><h3>Original Operation</h3>${originalText}</div>` : '';
  const appliedOp = appliedText.length ?
        `<div class="jeLogApplied"> <h3>Applied Operation</h3>${appliedText}</div>` : '';
  const opOperation = originalText.length || appliedText.length ?
        `<div class="jeLogDetails">
           <div class="jeExpander">
             <span class="jeLogName">Original and applied operation</span>
           </div>
           <div class="jeLogNested">
             ${originalOp}
             ${appliedOp}
           </div>
         </div>` : '';

  const deltaText = jeLoggingJSON(getDelta().s);
  const collectionsBlock = Object.keys(collDisplay).length ?
        `<div class="jeLogCollections"><h3>Collections afterwards</h3>${jeLoggingJSON(collDisplay)}</div>` : '';
  const deltaBlock = deltaText.length ?
        `<div class="jeLogVariables"><h3>Delta afterwards</h3>${deltaText}</div>` : '';
  const opState = `${jeLoggingVariables(variables)}${collectionsBlock}${deltaBlock}`;
  const opStateBlock = opState.length ?
        `<div class="jeLogDetails">
          <div class="jeExpander">
            <span class="jeLogName">Variables, collections and delta afterwards</span>
          </div>
          <div class="jeLogNested">
            ${opState}
          </div>
        </div>` : '';

  jeLoggingHTML =  `
    ${savedHTML[0]}
    <div class="jeLogOperation ${skipped ? 'jeLogSkipped' : ''} ${problems.length ? 'jeLogHasProblems' : 'jeLogHasNoProblems'}">
      <div class="jeExpander">
        <span class="jeLogName">${opFunction}</span> ${jeRoutineResult} ${problems.length ? '<span class="jeLogFailed">failed</span>' : ''} <span class="jeLogTime" title="how long this operation took">(${+new Date() - startTime}ms)</span>
      </div>
      <div class="jeLogNested">
        ${opProblems}
        ${opOperation}
        ${jeLoggingHTML}
        ${opStateBlock}
      </div>
    </div>
  `;

  jeRoutineResult = '';
}

export function jeLoggingRoutineOperationSummary(definition, result) {
  jeRoutineResult = `<span class="jeLogSummary">${html(definition)}</span>
     ${result ? '=&gt;' : ''} <span class="jeLogResult">${html(result || '')}</span>`;
}

export function jeLoggingRoutineGetData() {
  return { jeHTMLStack, jeLoggingHTML, jeRoutineResult };
}

function jeLoggingFilterLog(filter) {
  for(const className of ['jeLogFilterMatch', 'jeLogFilterNoMatch', 'jeLogFilterChildMatch', 'active', 'jeExpander-down'])
    for(const entry of $a(`#jeLog .jeLogNested .${className}`))
      if(!entry.classList.contains('manuallyExpanded') || className.endsWith('Match'))
        entry.classList.remove(className);
  if(!filter) return;

  for(const entry of $a('#jeLog .jeLogNested .jeExpander, #jeLog .jeLogNested .jeRedExpander')) {
    if(entry.parentElement.classList.contains('jeLogDetails') || entry.textContent.toLowerCase().indexOf(filter.toLowerCase()) == -1) {
      entry.classList.add('jeLogFilterNoMatch');
    } else {
      entry.classList.add('jeLogFilterMatch');
      entry.classList.remove('jeLogFilterNoMatch');
      let parent = entry.parentElement.parentElement;
      while(parent.id != 'jeLog') {
        if(parent.classList.contains('jeLogOperation')) {
          parent.classList.add('jeLogFilterChildMatch');
          $c('.jeLogNested', parent).classList.add('active');
          $c('.jeExpander, .jeRedExpander', parent).classList.add('jeExpander-down');
        }
        parent = parent.parentElement;
      }
    }
  }
}

// END routine logging

function jeNewline() {
  const s = jeCursorOffsets()[0];
  const match = jeGetEditorContent().substr(0,s).match(/( *)[^\n]*$/);
  jePasteText('\n' + match[1], false);
}

function jePasteText(text, select) {
  const [ s, e ] = jeCursorOffsets();
  const v = jeGetEditorContent();

  jeSetEditorContent(v.substr(0, s) + text + v.substr(e));
  jeColorize();
  jeSelect(select ? s : s + text.length, s + text.length, false);
}

function jePostProcessObject(o) {
  const copy = { ...o };
  if(!o.inheritFrom)
    for(const key in copy)
      if(copy[key] === null || copy[key] === jeWidget.getDefaultValue(key) || key.match(/in deck/))
        delete copy[key];
  return copy;
}

function jePostProcessText(t) {
  // Convert actual newlines within JSON strings back to \n escape sequences.
  // Windows clipboards typically use CRLF, so ignore \r and let the following \n be escaped.
  let result = '';
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < t.length; i++) {
    const char = t[i];
    
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      result += char;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }
    
    if (inString && char === '\r')
      continue;
    else if (inString && char === '\n')
      result += '\\n';
    else
      result += char;
  }
  
  // Handle case where escapeNext is still true at end (shouldn't happen in valid JSON, but be safe)
  if (escapeNext) {
    result += '\\';
  }
  
  return result;
}

function jePreProcessObject(o) {
  const copy = {};
  for(const key of jeOrder) {
    const match = key.match(/^(.*?)(\*)?(#)?$/);
    if(o[match[1]] !== undefined)
      copy[match[1]] = o[match[1]];
    else if(match[2] == '*' && !o.inheritFrom && (o.type != 'card' || (key != 'width*' && key != 'height*')))
      copy[match[1]] = jeWidget.getDefaultValue(match[1]);
    if(match[3] == '#')
      copy[`LINEBREAK${match[1]}`] = null;
  }

  for(const key of Object.keys(o).sort()) {
    if(copy[key] === undefined && !key.match(/^c[0-9]{2}$/) && !key.match(/Routine$/) && jePlainWidget.getDefaultValue(key) !== undefined)
      copy[key] = o[key];
  }
  copy[`LINEBREAKcustom`] = null;
  for(const key of Object.keys(o).sort())
    if(copy[key] === undefined && !key.match(/^c[0-9]{2}$/) && !key.match(/Routine$/))
      copy[key] = o[key];
  copy[`LINEBREAKroutines`] = null;
  for(const key of Object.keys(o).sort())
    if(copy[key] === undefined && !key.match(/^c[0-9]{2}$/))
      copy[key] = o[key];
  copy[`LINEBREAKcanvas`] = null;
  for(const key of Object.keys(o).sort())
    if(copy[key] === undefined)
      copy[key] = o[key];

  try {
    if(copy.type == 'card') {
      if(widgets.get(copy.deck).state.cardDefaults && typeof copy['cardDefaults (in deck)'] === 'undefined')
        copy['cardDefaults (in deck)'] = widgets.get(copy.deck).get('cardDefaults');
      if(widgets.get(copy.deck).state.cardTypes && typeof copy['cardType ['+ o.cardType + '] (in deck)'] === 'undefined')
        copy['cardType ['+ o.cardType + '] (in deck)'] = widgets.get(copy.deck).get('cardTypes')[copy.cardType];
    }
  } catch(e) {}

  return copy;
}

function jePreProcessText(t, returnValidJSON=true) {
  t = t.replace(/,(?=\n *[\]}],?$)/gm, '').replace(/(\n +"LINEBREAK.*": null,)+/g, '\n').replace(/(,\n?\n +"LINEBREAK.*": null)+/g, '');
  if(returnValidJSON)
    return t;

  // Convert \n escape sequences within JSON strings to actual newlines for display
  let result = '';
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < t.length; i++) {
    const char = t[i];
    
    if (escapeNext) {
      if (inString && char === 'n') {
        result += '\n';
      } else {
        result += '\\' + char;
      }
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }
    
    result += char;
  }
  
  return result;
}

// Select the characters in a given range in the text area.
function jeSelect(start, end, scrollToCursor) {
  const t = $('#jeText');
  const text = t.textContent;
  try {
    t.focus();

    const scroll = t.scrollTop;
    t.textContent = text.substring(0, end);
    const height = t.scrollHeight;
    t.scrollTop = 50000;
    t.textContent = text;

    if(!scrollToCursor) {
      t.scrollTop = scroll;
    } else if(t.scrollTop) {
      if(Math.abs(t.scrollTop + t.clientHeight/2 - scroll) < t.clientHeight*.25)
        t.scrollTop = scroll;
      else
        t.scrollTop += t.clientHeight/2;
    }

    const node = t.firstChild;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const selection = window.getSelection();
    selection.removeAllRanges();

    selection.addRange(range);
  } catch(e) {
    t.textContent = text;
  }
}

// Set the text area to the formatted version of the given text and colorize.
function jeSet(text) {
  try {
    jeSetEditorContent(jePreProcessText(JSON.stringify(jePreProcessObject(JSON.parse(text)), null, '  '), false));
  } catch(e) {
    jeSetEditorContent(text);
  }
  jeColorize();
}

// Replace ###SELECT ME### in JSON string in jeStateNow by the string given in replaceBy,
// display the results in the text area by calling jeSet, and select the replaced text by calling jeSelect.
function jeSetAndSelect(replaceBy, insideString) {

  const emptyBrackets = replaceBy && (typeof replaceBy === 'object' && Object.keys(replaceBy).length === 0); // ###SELECT ME### should be replaced by [] or {}
  const dollar = replaceBy == '${}'; // ###SELECT ME### should be replaced by ${} (and this will be in a string)

  if(jeMode == 'widget')
    var jsonString = jePreProcessText(JSON.stringify(jePreProcessObject(jeStateNow), null, '  '), false);
  else
    var jsonString = JSON.stringify(jeStateNow, null, '  ');
  const startIndex = jsonString.indexOf(insideString ? '###SELECT ME###' : '"###SELECT ME###"');
  let length = jsonString.length-15-(insideString ? 0 : 2); // Length of json ignoring string to be replaced.

  // Replace the entire quoted string if the ###SELECT ME### is not inside a string, otherwise
  // just replace ###SELECT ME###
  const replaceByJSON = JSON.stringify(replaceBy, null, '    ');
  if(insideString || dollar)
    jsonString = jsonString.replace(/###SELECT ME###/, replaceByJSON.substr(1, replaceByJSON.length-2));
  else
    jsonString = jsonString.replace(/"###SELECT ME###"/, replaceByJSON);

  let insertedLength = jsonString.length - length; // Length of inserted string.

  // Set left and right ranges for selection based on what is being inserted.
  jeSet(jsonString);
  let leftOffset = 0;
  let rightOffset = 0;
  if(emptyBrackets || (typeof replaceBy == 'string' && !insideString && !dollar)){
    leftOffset = rightOffset = 1;
  } else if (dollar) {
    leftOffset = 3;
    rightOffset = 2;
  }

  jeSelect(startIndex + leftOffset, startIndex + insertedLength - rightOffset, true);
}

function jeSetEditorContent(content) {
  // the remembered offsets index the text that is replaced here, so they say nothing afterwards
  jeLastCursorOffsets = [ 0, 0 ];
  $('#jeText').textContent = content.replace(/\u00a0/g, ' ');
}

function jeMatchCommandName(name, filter) {
  if (!filter) return true;
  const words = name.toLowerCase().split(/\s+/);
  const filterWords = filter.toLowerCase().split(/\s+/);
  return filterWords.every(fw => words.some(w => w.startsWith(fw)));
}

// A parse error leaves nothing to work with. A state that parsed and was only
// rejected for what it says - a parent that does not exist, an ID already in use -
// still has a valid object behind it, so the context can be resolved against it and
// the commands that would fix it stay available and keep inserting. Only handing the
// state to the room waits for the message to go away.
function jeJSONisUnparsed() {
  return jeJSONerror instanceof Error;
}

function jeShowCommands() {

  // First set up top buttons
  let commandText = `<div id='jeTopButtons'>`;
  for(const command of jeCommands) {
    if(command.context == undefined) {
      const name = (typeof command.name == 'function' ? command.name() : command.name);
      const icon = (typeof command.icon == 'function' ? command.icon() : command.icon);
      const material = String(icon).match(/^[^[]/) ? 'material' : '';
      const classes = typeof command.classes == 'function' ? command.classes() : command.classes || '';
      commandText += `<button class='top ${material} ${classes}' id='${command.id}' title='${name}' ${!command.show || command.show() ? '' : 'disabled'}>${icon}</button>`;
    }
  }
  commandText += `</div>`;
  if (!jeTabSearchActive) {
    commandText += `<div style="margin-bottom: 8px; font-size: 12px; color: var(--textDimColor1);">Press or hold <span class="key">Tab</span> to search</div>`;
  } else {
    let searchHint = `<div style="margin-bottom: 8px; font-size: 12px; color: var(--textDimColor1);">`;
    if (jeTabSearchFilter.length > 0) {
      searchHint += `Search: <span style="color: var(--textColor); font-weight: bold;">${html(jeTabSearchFilter)}</span><br>`;
    } else {
      searchHint += `Type letters to filter<br>`;
    }
    const executeText = jeTabKeyHeld ? 'Release' : 'Press';
    searchHint += `<span class="key">↑</span><span class="key">↓</span> to select<br>${executeText} <span class="key">Tab</span> to execute`;
    searchHint += `</div>`;
    commandText += searchHint;
  }
  commandText += `<div id='jeContextButtons'>`;

  // Next figure out which context commands are active here.
  const activeCommands = {};
  const context = jeContext.join(' ↦ ');
  for(const command of jeCommands) {
    delete command.currentKey;
    const contextMatch = context.match(new RegExp(command.context));
    if(contextMatch && contextMatch[0]!= "" && (!command.context || command.onEmpty || jeStateNow && !jeJSONisUnparsed()) && (!command.show || command.show())) {
      const title = command.isTypeSpecific || command.isTypeSpecific === undefined ? contextMatch[0] : 'widget';
      if(activeCommands[title] === undefined)
        activeCommands[title] = [];
      activeCommands[title].push(command);
    };
  }

  if(jeContext[jeContext.length-1] == '(var expression)') {
    commandText += `\n  <b>var expression</b>\n<label>Search </label><input id="var_search" name="var_search" type="text"><br>`;
    commandText += `<div id="var_results"></div>\n`;
  }

  if(!jeJSONisUnparsed()) {
    const usedKeys = { a: 1, c: 1, x: 1, v: 1, w: 1, n: 1, t: 1, q: 1, j: 1, z: 1 };

    const sortByName = function(a, b) {
      const nameA = typeof a.name == 'function' ? a.name() : a.name;
      const nameB = typeof b.name == 'function' ? b.name() : b.name;
      return nameA.localeCompare(nameB);
    }

    const displayKey = function (k) {
      return { ArrowUp: '⬆', ArrowDown: '⬇'} [k] || k;
    }

    const allFilteredCommands = [];
    const filteredActiveCommands = {};

    for(const contextMatch of (Object.keys(activeCommands).sort((a,b)=>b.length-a.length).sort((a,b)=>a==='widget'?1:(b==='widget'?-1:0)))) {
      const filteredCommands = [];
      for(const command of activeCommands[contextMatch].sort(sortByName)) {
        try {
          if(context.match(new RegExp(command.context)) && (!command.show || command.show())) {
            const name = typeof command.name == 'function' ? command.name() : command.name;
            if (!jeTabSearchActive || jeMatchCommandName(name, jeTabSearchFilter)) {
              filteredCommands.push({ command, name });
              allFilteredCommands.push({ command, name, contextMatch });
            }
          }
        } catch(e) {
          console.error(`Failed to show command ${command.id}`, e);
        }
      }
      if (filteredCommands.length > 0) {
        filteredActiveCommands[contextMatch] = filteredCommands;
      }
    }

    if (jeTabSearchActive && jeTabSearchFilter.length >= 3) {
      const filterLower = jeTabSearchFilter.toLowerCase();
      
      const matchingWidgets = widgetFilter(w => w.get('id').toLowerCase().includes(filterLower))
        .slice(0, 10)
        .sort((a, b) => a.get('id').localeCompare(b.get('id')));
      
      for (const widget of matchingWidgets) {
        allFilteredCommands.push({ command: { id: 'widget_' + widget.get('id') }, name: widget.get('id'), contextMatch: 'Matching Widgets' });
      }

      const matchingOps = compute_ops.filter(op => 
        op.name.toLowerCase().includes(filterLower) || 
        op.desc.toLowerCase().includes(filterLower)
      ).slice(0, 10)
      .sort((a, b) => a.name.localeCompare(b.name));

      for (const op of matchingOps) {
        allFilteredCommands.push({ command: { id: 'compute_' + op.name }, name: op.name + ': ' + op.sample, contextMatch: 'Compute Operations' });
      }

      const editorContent = jeGetEditorContent();
      const lines = editorContent.split('\n');
      const matchingLines = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(filterLower)) {
          matchingLines.push({ lineNumber: i + 1, line: lines[i], index: i });
        }
      }
      matchingLines.slice(0, 10).forEach(match => {
        allFilteredCommands.push({ command: { id: 'editor_line_' + match.lineNumber }, name: 'jump to line ' + match.lineNumber, contextMatch: 'Editor Content', lineData: match });
      });
    }

    let commandIndex = 0;
    for(const contextMatch of Object.keys(filteredActiveCommands)) {
      commandText += `\n  <div class="context">${html(contextMatch)}</div>\n`;
      for(const { command, name } of filteredActiveCommands[contextMatch]) {
        if(command.forceKey && !usedKeys[command.forceKey])
          command.currentKey = command.forceKey;
        for(const key of name.split(''))
          if(key != ' ' && !command.currentKey && !usedKeys[key.toLowerCase()])
            command.currentKey = key.toLowerCase();
        for(const key of 'abcdefghijklmnopqrstuvwxyz1234567890'.split(''))
          if(!command.currentKey && !usedKeys[key])
            command.currentKey = key;
        usedKeys[command.currentKey] = true;
        let keyName = displayKey(command.currentKey);
        const shouldHighlight = jeTabSearchActive && 
          (jeTabSearchFilter.length > 0 || jeTabArrowKeysUsed) &&
          jeTabSearchHighlightIndex >= 0 &&
          commandIndex === Math.min(jeTabSearchHighlightIndex, allFilteredCommands.length - 1);
        const highlightClass = shouldHighlight ? ' jeHighlight' : '';
        commandText += `<button id="${command.id}" class="${highlightClass}">${name}</button>\n`;
        commandIndex++;
      }
    }

    if (jeTabSearchActive && jeTabSearchFilter.length >= 3) {
      const filterLower = jeTabSearchFilter.toLowerCase();
      
      const matchingWidgets = widgetFilter(w => w.get('id').toLowerCase().includes(filterLower))
        .slice(0, 10)
        .sort((a, b) => a.get('id').localeCompare(b.get('id')));
      
      if (matchingWidgets.length > 0) {
        commandText += `\n  <div class="context">Matching Widgets</div>\n`;
        for (const widget of matchingWidgets) {
          const shouldHighlight = jeTabSearchActive && 
            (jeTabSearchFilter.length > 0 || jeTabArrowKeysUsed) &&
            jeTabSearchHighlightIndex >= 0 &&
            commandIndex === Math.min(jeTabSearchHighlightIndex, allFilteredCommands.length - 1);
          const highlightClass = shouldHighlight ? ' jeHighlight' : '';
          commandText += `<button class="jeWidgetSearch${highlightClass}" data-widget-id="${html(widget.get('id'))}">${html(widget.get('id'))}</button>\n`;
          commandIndex++;
        }
      }

      const matchingOps = compute_ops.filter(op => 
        op.name.toLowerCase().includes(filterLower) || 
        op.desc.toLowerCase().includes(filterLower)
      ).slice(0, 10)
      .sort((a, b) => a.name.localeCompare(b.name));

      if (matchingOps.length > 0) {
        commandText += `\n  <div class="context">Compute Operations</div>\n`;
        for (const op of matchingOps) {
          const shouldHighlight = jeTabSearchActive && 
            (jeTabSearchFilter.length > 0 || jeTabArrowKeysUsed) &&
            jeTabSearchHighlightIndex >= 0 &&
            commandIndex === Math.min(jeTabSearchHighlightIndex, allFilteredCommands.length - 1);
          const highlightClass = shouldHighlight ? ' jeHighlight' : '';
          commandText += `<button class="jeComputeOp${highlightClass}" data-sample="${html(op.sample)}" data-desc="${html(op.desc)}">${html(op.name)}: ${html(op.sample)}</button>\n`;
          commandText += `<div class="jeComputeOpDesc" style="font-size: 11px; color: var(--textDimColor1); margin-left: 8px; margin-bottom: 4px;">${html(op.desc)}</div>\n`;
          commandIndex++;
        }
      }

      const editorContent = jeGetEditorContent();
      const lines = editorContent.split('\n');
      const matchingLines = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(jeTabSearchFilter.toLowerCase())) {
          matchingLines.push({ lineNumber: i + 1, line: lines[i], index: i });
        }
      }
      if (matchingLines.length > 0) {
        commandText += `\n  <div class="context">Editor Content</div>\n`;
        for (const match of matchingLines.slice(0, 10)) {
          const shouldHighlight = jeTabSearchActive && 
            (jeTabSearchFilter.length > 0 || jeTabArrowKeysUsed) &&
            jeTabSearchHighlightIndex >= 0 &&
            commandIndex === Math.min(jeTabSearchHighlightIndex, allFilteredCommands.length - 1);
          const highlightClass = shouldHighlight ? ' jeHighlight' : '';
          const prevLine = match.index > 0 ? lines[match.index - 1] : '';
          const nextLine = match.index < lines.length - 1 ? lines[match.index + 1] : '';
          const highlightedLine = match.line.replace(new RegExp(`(${jeTabSearchFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
          commandText += `<button class="jeEditorLine${highlightClass}" data-line="${match.lineNumber}" data-line-index="${match.index}">jump to line ${match.lineNumber}</button>\n`;
          let contextHtml = '';
          if (prevLine) contextHtml += `<div class="jeEditorLineDesc">${html(prevLine)}</div>\n`;
          contextHtml += `<div class="jeEditorLineDesc">${highlightedLine}</div>\n`;
          if (nextLine) contextHtml += `<div class="jeEditorLineDesc">${html(nextLine)}</div>\n`;
          commandText += contextHtml;
          commandIndex++;
        }
      }
    }
  }
  commandText += `\n\n${html(context)}\n`;
  if(jeJSONerror) {
    if(jeMode == 'widget')
      commandText += `\n<div>Ctrl-Space: go to error</div>\n`;
    commandText += `\n<div class=error>${html(String(jeJSONerror))}</div>\n`;
  }
  if(jeCommandError)
    commandText += `\n<div class=error>Last command failed: ${html(String(jeCommandError))}</div>\n`;
  if(jeSecondaryWidget)
    commandText += `\n\n<pre>${html(jeSecondaryWidget)}</pre>\n`;
  commandText += `</div>`;
  const scrollContainer = $('#jeContextButtons');
  const previousScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
  $('#jeCommands').innerHTML = commandText;
  
  if (jeTabSearchActive && jeTabSearchHighlightIndex >= 0) {
    const buttons = $a('#jeContextButtons button.jeHighlight');
    if (buttons.length > 0)
      buttons[0].scrollIntoView({ block: 'center' });
  } else if (scrollContainer) {
    scrollContainer.scrollTop = previousScrollTop;
  }
  
  on('#jeCommands button:not(.jeWidgetSearch):not(.jeComputeOp):not(.jeEditorLine)', 'click', clickButton);
  // Make any keycap with text 'Tab' act as a press/release toggle
  const keycaps = $a('#jeCommands .key');
  if (keycaps && keycaps.length) {
    keycaps.forEach(el => {
      const label = (el.textContent || '').trim();
      if (label.toLowerCase() === 'tab') {
        el.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          const jeTextElement = $('#jeText');
          if (jeTextElement) {
            jeTextElement.focus();
          }
          if (!jeTabSearchActive) {
            // Start Tab-hold search
            jeTabKeyHeld = true;
            jeTabSearchActive = true;
            jeTabSearchFilter = '';
            jeTabSearchHighlightIndex = -1;
            jeTabArrowKeysUsed = false;
            jeShowCommands();
          } else {
            // Release Tab: execute and close
            jeIgnoreBlurOnce = true; // avoid blur handler double-executing
            const jeTextElement2 = $('#jeText');
            if (jeTextElement2) {
              jeTextElement2.focus();
            }
            const highlighted = $('#jeContextButtons') && $('#jeContextButtons').querySelectorAll('button.jeHighlight');
            if (highlighted && highlighted.length > 0)
              highlighted[0].click();
            jeTabSearchActive = false;
            jeTabSearchFilter = '';
            jeTabSearchHighlightIndex = -1;
            jeTabArrowKeysUsed = false;
            jeTabKeyHeld = false;
            jeShowCommands();
          }
        });
      } else if (label === '↑' || label === '↓') {
        // Do not make arrow keycaps clickable; keep default cursor
        el.style.pointerEvents = 'none';
        el.style.cursor = 'default';
      }
    });
  }
  on('#jeCommands button.jeEditorLine', 'click', function(e) {
    e.stopPropagation();
    const lineNumber = parseInt(e.currentTarget.dataset.line);
    const lineIndex = parseInt(e.currentTarget.dataset.lineIndex);
    const editorContent = jeGetEditorContent();
    const lines = editorContent.split('\n');
    let charOffset = 0;
    for (let i = 0; i < lineIndex; i++) {
      charOffset += lines[i].length + 1;
    }
    jeSelect(charOffset, charOffset, true);
    $('#jeText').scrollTop = $('#jeText').scrollHeight;
    const lineHeight = $('#jeText').scrollHeight / lines.length;
    $('#jeText').scrollTop = lineIndex * lineHeight - $('#jeText').clientHeight / 2;
    jeTabSearchActive = false;
    jeTabSearchFilter = '';
    jeTabSearchHighlightIndex = -1;
    jeTabArrowKeysUsed = false;
    jeGetContext();
  });
  on('#jeCommands button.jeWidgetSearch', 'click', async function(e) {
    e.stopPropagation();
    const widgetId = e.currentTarget.dataset.widgetId;
    const widget = widgets.get(widgetId);
    if (widget) {
      jeSelectWidget(widget);
      jeTabSearchActive = false;
      jeTabSearchFilter = '';
      jeTabSearchHighlightIndex = -1;
      jeTabArrowKeysUsed = false;
      jeShowCommands();
    }
  });
  on('#jeCommands button.jeComputeOp', 'click', async function(e) {
    e.stopPropagation();
    const sample = e.currentTarget.dataset.sample;
    let routineIndex = -1;
    for(let i=jeContext.length-1; i>=0; --i) {
      if(String(jeContext[i]).match(/Routine$/)) {
        routineIndex = i;
        break;
      }
    }
    if (routineIndex >= 0) {
      const routine = jeGetValue(jeContext.slice(1, routineIndex+1));
      if (Array.isArray(routine)) {
        const operationIndex = jeContext.length >= routineIndex + 1 ? jeContext[routineIndex+1] : null;
        const varName = sample.match(/var\s+(\w+)\s*=/);
        let expressionToInsert = sample;
        if (varName) {
          expressionToInsert = sample.replace(new RegExp(`var\\s+${varName[1]}\\s*=`), 'var ###SELECT ME### =');
        }
        if(operationIndex === null) {
          routine.push(expressionToInsert);
        } else {
          routine.splice(operationIndex+1, 0, expressionToInsert);
        }
        jeStateBefore = JSON.stringify(jePreProcessObject(jeStateNow));
        jeStateBeforeRaw = jePreProcessText(JSON.stringify(jePreProcessObject(jeStateNow), null, '  '));
        jeSet(jeStateBeforeRaw);
        if (varName) {
          jeSetAndSelect(varName[1], true);
        } else {
          jeSetAndSelect('###SELECT ME###', true);
        }
        if(jeMode != 'macro' && jeMode != 'empty') {
          if((jeWidget || jeMode == 'multi') && !jeJSONerror)
            await jeApplyChanges();
        }
        jeGetContext();
      }
    } else if (jeContext && jeContext[jeContext.length - 1] == '(var expression)') {
      const v = jeGetEditorContent();
      const s = jeCursorOffsets()[0];
      const before = v.substr(0, s);
      const after = v.substr(s);
      const newContent = before + sample + after;
      jeSet(newContent);
      const newPos = s + sample.length;
      jeSelect(newPos, newPos, true);
      jeGetContext();
    }
    jeTabSearchActive = false;
    jeTabSearchFilter = '';
    jeTabSearchHighlightIndex = -1;
    jeTabArrowKeysUsed = false;
    jeShowCommands();
  });

  on('#var_search', 'input', displayComputeOps);
  if ($('#var_results') && jeKeyword !='') {
    $('#var_search').value = jeKeyword;
    displayComputeOps();
  }

  if(jeCommandWithOptions)
    jeCommandOptions();
  jeMarkCommandLine();
}

// A command with options runs on the line the cursor was left on, which no longer shows a caret
// once the dialog has taken the selection - so that line is marked while the dialog is open.
function jeMarkCommandLine() {
  for(const line of $a('#jeTextHighlight > .jeCommandLine'))
    line.classList.remove('jeCommandLine');
  if(!jeCommandWithOptions)
    return;
  const content = jeGetEditorContent();
  const line = $a('#jeTextHighlight > .jeTextLine')[content.substr(0, jeCursorOffsets()[0]).split('\n').length - 1];
  if(line)
    line.classList.add('jeCommandLine');
}

let editPanel = null;
let treeNodes = {};
let mouse_reference;
let resizer_reference;

function jeInitTree() {
  editPanel = $('#jeEditArea');

  function resize(e){
    const height = Math.min(editPanel.offsetHeight - 75, Math.max(0, resizer_reference - mouse_reference + e.y));
    editPanel.style.setProperty('--treeHeight', height + "px");
  }

  editPanel.addEventListener("mousedown", function(e){
    if(e.target == $('#jeResize')) {
      mouse_reference = e.y;
      resizer_reference = $('#jeTree').offsetHeight;
      document.addEventListener("mousemove", resize, false);
    }
  });

  document.addEventListener("mouseup", function(){
    document.removeEventListener("mousemove", resize, false);
  });
}

export function jeToggle() {
  if(jeEnabled === null) {
    jeInitTree();
    jeAddCommands();
    jeEmpty();
    $('#jeText').addEventListener('input', jeColorize);
    $('#jeText').onscroll = e=>$('#jeTextHighlight').scrollTop = e.target.scrollTop;
  }
  jeEnabled = !jeEnabled;
  setJEenabled(jeEnabled);
  jeLoggingClear();
  if(jeEnabled) {
    $('body').classList.add('jsonEdit');
    if(jeWidget && !widgets.has(jeWidget.id))
      jeEmpty();
    if(jeDebugViewing) {
      jeCallCommand(jeCommands.find(o => o.id == 'je_toggleDebug'));
      jeShowCommands()
    }
  } else {
    $('body').classList.remove('jsonEdit');
  }
}

function jeEmpty() {
  jeMode = 'empty';
  jeContext = [ 'No widget selected.' ];
  jeStateNow = null;
  jeWidget = null;

  jeSet('');
  jeShowCommands();
  updateSelectionBars();
}

const clickButton = async function(event) {
  await jeCallCommand(jeCommands.find(o => o.id == event.currentTarget.id));
  jeGetContext();
  if(jeMode != 'macro' && jeMode != 'empty') {
    if((jeWidget || jeMode == 'multi') && !jeJSONerror)
      await jeApplyChanges();
    if (jeContext[0] == '###SELECT ME###')
      jeGetContext();
  }
}

function jeInitEventListeners() {
  window.addEventListener('mousemove', function(e) {
    if(!jeEnabled)
      return;
    const surfaceRect = $('#topSurface').getBoundingClientRect();

    jeState.mouseX = Math.floor((e.clientX - surfaceRect.left) * viewportConfig.targetWidth  / surfaceRect.width);
    jeState.mouseY = Math.floor((e.clientY - surfaceRect.top ) * viewportConfig.targetHeight / surfaceRect.height);
  });

  window.addEventListener('mousedown', _=>jeMouseButtonIsDown = jeEnabled);
  window.addEventListener('mouseup', async function(e) {
    jeRoutineResetOnNextLog = jeRoutineAutoReset;
    if(!jeEnabled)
      return;
    jeMouseButtonIsDown = false;

    if(e.target == $('#jeText') && jeContext != 'macro') // Click in widget text, fix context
      jeGetContext();
  });

  window.addEventListener('keydown', async function(e) {
    if(!jeEnabled)
      return;

    if(e.key == 'Control')
      jeState.ctrl = true;
    if(e.key == 'Shift')
      jeState.shift = true;

    if(e.ctrlKey) {
      if(e.key == ' ' && jeMode == 'widget') {
        const locationLine = String(jeJSONerror).match(/line ([0-9]+) column ([0-9]+)/);
        if(locationLine) {
          const pos = jeGetEditorContent().split('\n').slice(0, locationLine[1]-1).join('\n').length + +locationLine[2];
          jeSelect(pos, pos, true);
        }

        const locationPostion = String(jeJSONerror).match(/position ([0-9]+)/);
        if(locationPostion)
          jeSelect(+locationPostion[1], +locationPostion[1], true);
      }
    }
  });

  on('#jeText', 'paste', function(e) {
    const paste = (e.clipboardData || window.clipboardData).getData('text');
    jePasteText(paste, false);
    e.preventDefault();
  });

  on('#jeText', 'keydown', function(e) {
    if(e.key == 'Enter') {
      jeNewline();
      e.preventDefault();
    }
    // Tab+Left / Tab+Right navigate the widget history (back / forward)
    if (jeEnabled && jeTabKeyHeld && (e.key == 'ArrowLeft' || e.key == 'ArrowRight')) {
      e.preventDefault();
      e.stopPropagation();
      const direction = e.key == 'ArrowLeft' ? -1 : 1;
      if (selectionBarHistoryCanNavigate(direction)) {
        // close the search overlay that Tab opened; we're navigating instead
        if (jeTabSearchActive) {
          jeTabSearchActive = false;
          jeTabSearchFilter = '';
          jeTabSearchHighlightIndex = -1;
          jeTabArrowKeysUsed = false;
        }
        jeIgnoreBlurOnce = true;
        selectionBarHistoryNavigate(direction);
        jeShowCommands();
        $('#jeText').focus();
      }
      return;
    }
    if (e.key == 'Tab' && jeEnabled) {
      const jeTextElement = $('#jeText');
      if (jeTextElement && document.activeElement === jeTextElement) {
        e.preventDefault();
        e.stopPropagation();
        if (!jeTabSearchActive) {
          jeTabKeyHeld = true;
          jeTabSearchActive = true;
          jeTabSearchFilter = '';
          jeTabSearchHighlightIndex = -1;
          jeTabArrowKeysUsed = false;
          jeShowCommands();
        } else {
          // Set jeTabKeyHeld when Tab is pressed while tabSearch is already active
          jeTabKeyHeld = true;
          jeShowCommands();
        }
      }
    }
    if (jeTabSearchActive) {
      if (e.key == 'ArrowUp') {
        e.preventDefault();
        if (jeTabSearchHighlightIndex > 0) {
          jeTabSearchHighlightIndex--;
          jeTabArrowKeysUsed = true;
          jeShowCommands();
        } else if (jeTabSearchHighlightIndex < 0) {
          const buttons = $('#jeContextButtons').querySelectorAll('button');
          jeTabSearchHighlightIndex = Math.max(0, buttons.length - 1);
          jeTabArrowKeysUsed = true;
          jeShowCommands();
        }
      } else if (e.key == 'ArrowDown') {
        e.preventDefault();
        const buttons = $('#jeContextButtons').querySelectorAll('button');
        const maxIndex = buttons.length - 1;
        if (jeTabSearchHighlightIndex < 0) {
          jeTabSearchHighlightIndex = 0;
        } else if (jeTabSearchHighlightIndex < maxIndex) {
          jeTabSearchHighlightIndex++;
        }
        jeTabArrowKeysUsed = true;
        jeShowCommands();
      } else if (e.key.length == 1 && !e.ctrlKey && !e.altKey && !e.metaKey && e.key != 'Enter') {
        jeTabSearchFilter += e.key;
        jeTabSearchHighlightIndex = 0;
        jeTabArrowKeysUsed = false;
        jeShowCommands();
        e.preventDefault();
      } else if (e.key == 'Backspace') {
        jeTabSearchFilter = jeTabSearchFilter.slice(0, -1);
        if (jeTabSearchFilter.length > 0) {
          jeTabSearchHighlightIndex = 0;
        } else {
          jeTabSearchHighlightIndex = -1;
          jeTabArrowKeysUsed = false;
        }
        jeShowCommands();
        e.preventDefault();
      }
    }
  });

  // If editor loses focus during Tab-search, simulate releasing Tab
  on('#jeText', 'blur', function() {
    if (jeIgnoreBlurOnce) { jeIgnoreBlurOnce = false; return; }
    if (jeTabSearchActive) {
      if (jeTabKeyHeld) {
        const buttons = $('#jeContextButtons') && $('#jeContextButtons').querySelectorAll('button.jeHighlight');
        if (buttons && buttons.length > 0) {
          buttons[0].click();
        }
      }
      jeTabSearchActive = false;
      jeTabSearchFilter = '';
      jeTabSearchHighlightIndex = -1;
      jeTabArrowKeysUsed = false;
      jeTabKeyHeld = false;
      jeShowCommands();
    }
  });

  window.addEventListener('keydown', function(e) {
    if(!jeEnabled)
      return;
    if(e.key != 'Control')
      jeKeyIsDown = true;
  });

  window.addEventListener('keyup', function(e) {
    if (e.key == 'Tab' && jeEnabled) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (jeTabSearchActive) {
        const buttons = $('#jeContextButtons').querySelectorAll('button.jeHighlight');
        if (buttons.length > 0) {
          buttons[0].click();
          jeTabSearchActive = false;
          jeTabSearchFilter = '';
          jeTabSearchHighlightIndex = -1;
          jeTabArrowKeysUsed = false;
          jeShowCommands();
        } else if (jeTabKeyHeld) {
          // Keep tabSearch active when releasing without a search term (only if Tab was held)
          jeTabKeyHeld = false;
          jeShowCommands();
        } else {
          // Close tabSearch if Tab was pressed (not held) without a search term
          jeTabSearchActive = false;
          jeTabSearchFilter = '';
          jeTabSearchHighlightIndex = -1;
          jeTabArrowKeysUsed = false;
          jeShowCommands();
        }
      }
      jeTabKeyHeld = false;
      return;
    }
    if(!jeEnabled)
      return;

    if(e.key == 'Control')
      jeState.ctrl = false;
    if(e.key == 'Shift')
      jeState.shift = false;

    if(e.target == $('#jeText')) {
      jeGetContext();
      if((jeWidget || jeMode == 'multi') && !jeJSONerror)
        jeApplyChanges();
    }
    jeKeyIsDown = false;
    jeKeyIsDownDeltas = [];
  });
}
