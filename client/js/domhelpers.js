export function $(selector, parent) {
  return (parent || document).querySelector(selector);
}

export function $a(selector, parent) {
  return (parent || document).querySelectorAll(selector);
}

export function div(parent, className, html) {
  const div = document.createElement('div');
  if(className)
    div.className = className;
  if(html)
    div.innerHTML = html;
  if(parent)
    parent.append(div);
  return div;
}

const sleep = delay => new Promise(resolve => setTimeout(resolve, delay));

export function regexEscape(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, m=>'\\'+m[0]);
}

export function setText(node, text) {
  for(const child of node.childNodes) {
    if(child.nodeType == Node.TEXT_NODE) {
      child.nodeValue = text;
      return;
    }
  }
  node.appendChild(document.createTextNode(text));
}

export function removeFromDOM(node) {
  if(typeof node == 'string') {
    for(const c of $a(node))
      removeFromDOM(c);
  } else {
    node.parentNode.removeChild(node);
  }
}

export function domByTemplate(id, obj, type='div') {
  const dom = document.createElement(type);
  dom.innerHTML = document.getElementById(id).innerHTML;
  applyValuesToDOM(dom, obj || {});
  return dom;
}

export function shuffleArray(array) {
  const isString = typeof array === 'string';
  array = [...array];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return isString ? array.join('') : array;
}

export function mapAssetURLs(str) {
  return String(str).replaceAll(/(^|["' (])\/(assets|i)\//g, '$1$2/');
}

export function unmapAssetURLs(str) {
  return String(str).replaceAll(/(^|["' (])(assets|i)\//g, '$1/$2/');
}

export function escapeID(id) {
  if(!id)
    return '';
  return id.toString().replaceAll(
    /(_)|([^-_0-9A-Za-z])/g,
    (match, p1, p2) => {
      if(p1)
        return '__';
      return '_x' + p2.charCodeAt(0).toString(16).padStart(4,'0') + '_';
    });
}

export function unescapeID(id) {
  if(!id)
    return '';
  return id.toString().replaceAll(
    /_(_)|_x([0-9A-Za-z]{4})_/g,
    (match, p1, p2) => {
      if(p1)
        return '_';
      return String.fromCharCode(parseInt(p2, 16));
    });
}

export function formField(field, dom, id) {
  const label = document.createElement('label');
  dom.appendChild(label);
  label.htmlFor = id;
  label.textContent = field.label || '';

  if(field.type == 'checkbox') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!field.value;
    dom.appendChild(input);
    input.id = id;
  }

  if(field.type == 'switch') {
    const input = document.createElement('input');
    const switchbox = document.createElement('label');
    switchbox.classList.add('switchbox');
    input.classList.add('switchbox');
    input.type = 'checkbox';
    if(field.value == 'on'){
      var thisValue = true;
    } else {
      var thisValue = false;
    }
    input.checked = thisValue;
    dom.appendChild(input);
    dom.appendChild(switchbox);
    switchbox.htmlFor = input.id = id;
  }

  if(field.type == 'color') {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = field.value || '#ff0000';
    dom.appendChild(input);
    input.id = id;
  }

  if(field.type == 'number') {
    const input = document.createElement('input');
    const spanafter = document.createElement('span');
    const labelExplainer = document.createElement('span');
    labelExplainer.classList.add('numberInputRange');
    input.type = 'number';
    input.step = 'any';
    input.value = field.value !== undefined ? field.value : 0;
    const maxset = field.max !== undefined;
    const minset = field.min !== undefined;
    if(input.value > field.max)
      input.value = field.max;
    if(input.value < field.min)
      input.value = field.min;

    if(minset && maxset) {
      labelExplainer.textContent = ' ('+ field.min +' - '+ field.max +')';
      label.appendChild(labelExplainer);
      input.min = minset ? field.min : false;
      input.max = maxset ? field.max : false;
    } else if(minset && !maxset) {
      labelExplainer.textContent = ' (at least '+ field.min+')';
      label.appendChild(labelExplainer);
      input.min = minset ? field.min : false;
    } else if(!minset && maxset) {
      labelExplainer.textContent = ' (up to '+ field.max+')';
      label.appendChild(labelExplainer);
      input.max = maxset ? field.max : false;
    }
    dom.appendChild(input);
    dom.appendChild(spanafter);
    input.id = id;
  }

  if(field.type == 'select') {
    const input = document.createElement('select');
    for(const option of field.options) {
      const optionElement = document.createElement('option');
      optionElement.value = option.value || '';
      optionElement.textContent = option.text || option.value || '';
      if(option.value == field.value || field.value == null && option.selected)
        optionElement.selected = true;
      input.appendChild(optionElement);
    }
    dom.appendChild(input);
    input.id = id;
  }

  if(field.type == 'palette') {
    const input = document.createElement('div');
    for(const option of asArray(field.colors || '#000000')) {
      const optionlabel = document.createElement('label');
      optionlabel.htmlFor = option;
      optionlabel.textContent = ' ';

      const optionlabelinterior = document.createElement('div');
      optionlabelinterior.style="background-color:"+option+";"
      optionlabel.appendChild(optionlabelinterior);

      const optionElement = document.createElement('input');
      optionElement.type = 'radio';
      optionElement.value = option || '';
      optionElement.id = option || '';
      optionElement.name = id;
      if(toHex(option) == field.value)
        optionElement.checked = 'checked';
      input.appendChild(optionElement);
      input.appendChild(optionlabel);
    }
    dom.appendChild(input);
    input.id = id;
  }

  if(field.type == 'choose') {
    function renderWidgetRaw(widget, state, target) {
      // TODO: consolidate with sidebar/properties.js
      delete state.id;
      delete state.x;
      delete state.y;
      delete state.rotation;
      delete state.scale;
      delete state.parent;

      widget.applyInitialDelta(state);
      target.appendChild(widget.domElement);
      if(widget instanceof Card)
        widget.deck.removeCard(widget);
      return widget.domElement;
    }

    function renderWidget(widget, propertyOverride, target) {
      return renderWidgetRaw(new widget.constructor(generateUniqueWidgetID()), Object.assign({}, widget.state, propertyOverride), target);
    }

    const input = document.createElement('div');
    for (const widgetID of field.widgets) {
      const widget = widgets.get(widgetID);
      for(let face=0; face<(field.mode == 'faces'?widget.getFaceCount():1); ++face) {
        let propertyOverride = field.propertyOverride || {};
        if(field.mode == 'faces')
          propertyOverride.activeFace = face;
        const widgetDOM = renderWidget(widget, propertyOverride, input);
        widgetDOM.dataset.source = widgetID;
        widgetDOM.dataset.face = face;
        if (asArray(field.value || []).indexOf(widgetID) !== -1) {
          widgetDOM.classList.add('selected');
        }
        widgetDOM.onclick = () => {
          const selectedWidgets = $a('.selected', input);
          if (widgetDOM.classList.contains('selected')) {
            if (selectedWidgets.length > (field.min === undefined ? 0 : field.min) || field.min === field.max) {
              widgetDOM.classList.remove('selected');
            }
          } else if (selectedWidgets.length < (field.max === undefined ? 1 : field.max)) {
            widgetDOM.classList.add('selected');
          }
        };
      }
    }
    dom.appendChild(input);
    input.id = id;
  }

  if(field.type == 'string') {
    const input = document.createElement('input');
    input.value = field.value || '';
    dom.appendChild(input);
    input.id = id;
  }

  if(field.type == 'text') {
    label.textContent = field.text;
  }

  if(field.type == 'title') {
    label.textContent = field.text;
  }

  if(field.type == 'subtitle') {
    label.textContent = field.text;
  }
}

function emojis2images(dom) {
  const regex = /\uD83C\uDFF4(\uDB40[\uDC61-\uDC7A])+\uDB40\uDC7F|(\ud83c[\udde6-\uddff]){2}|([\#\*0-9]\ufe0f?\u20e3)|(\u00a9|\u00ae|[\u203c-\u3300]|[\ud83c-\ud83e][\ud000-\udfff])((\ud83c[\udffb-\udfff])?(\ud83e[\uddb0-\uddb3])?(\ufe0f?\u200d([\u2000-\u3300]|[\ud83c-\ud83e][\ud000-\udfff])\ufe0f?)?)*/g;
  dom.innerHTML = dom.innerHTML.replace(regex, m=>`<img class="emoji" src="i/noto-emoji/emoji_u${emojiToFilename(m)}.svg" alt="${m}">`);
}

function images2emojis(dom) {
  const regexpUnicodeModified = /<img class="emoji" src="[^"]*i\/noto-emoji\/emoji_u[0-9a-f_]+\.svg" alt="([^"]+)"[^>]*>/g;
  dom.innerHTML = dom.innerHTML.replace(regexpUnicodeModified, (m,g)=>g);
}

export function applyValuesToDOM(parent, obj) {
  for(const dom of $a('[data-field]', parent)) {
    if(obj[dom.dataset.field]) {
      dom.classList.remove('hidden');
      if(dom.dataset.html)
        dom.innerHTML = DOMPurify.sanitize(mapAssetURLs(obj[dom.dataset.field]), { USE_PROFILES: { html: true } });
      else
        dom[dom.dataset.target || 'innerText'] = obj[dom.dataset.field];
      if(dom.dataset.target == 'src')
        dom.src = mapAssetURLs(obj[dom.dataset.field]);
      emojis2images(dom);
    } else {
      dom[dom.dataset.target || 'innerText'] = '';
      if(!dom.dataset.forceshow)
        dom.classList.add('hidden');
    }
  }
  for(const hideDom of $a('[data-showfor]', parent))
    toggleClass(hideDom, 'hidden', !hideDom.dataset.showfor.split('|').filter(field=>obj[field]).length);
}

export function getValuesFromDOM(parent) {
  const obj = {};
  for(const dom of $a('[data-field]:not([data-target=href])', parent)) {
    images2emojis(dom);
    if(dom.dataset.target == 'checked')
      obj[dom.dataset.field] = dom.checked;
    else if(dom.dataset.html && (dom.innerText.trim() || dom.innerHTML.match(/<img|<video/)) && dom.innerText != (dom.dataset.placeholder || '<empty>'))
      obj[dom.dataset.field] = unmapAssetURLs(DOMPurify.sanitize(dom.innerHTML, { USE_PROFILES: { html: true } }));
    else
      obj[dom.dataset.field] = dom[dom.dataset.target || 'innerText'].trim().replace(dom.dataset.placeholder || '<empty>', '');
    emojis2images(dom);
  }
  return obj;
}

export function enableEditing(parent, obj) {
  parent.classList.add('editing');
  parent.classList.remove('notEditing');

  for(const dom of $a('[data-field]:not([data-target=href])', parent)) {
    if(dom.classList.contains('uneditable'))
      continue;
    if(dom.tagName != 'INPUT')
      dom.contentEditable = true;
    dom.classList.remove('hidden');
    if(!dom.innerText.trim() && !dom.innerHTML.match(/<img|<video/)) {
      dom.innerText = dom.dataset.placeholder || '<empty>';
      dom.onclick = function(e) {
        if(dom.innerText == (dom.dataset.placeholder || '<empty>'))
          document.execCommand('selectAll', false, null);
      };
    }
    if(dom.dataset.html)
      addRichtextControls(dom);
  }
  for(const hideDom of $a('[data-showfor]', parent))
    hideDom.classList.remove('hidden');
}

export function disableEditing(parent, obj) {
  parent.classList.remove('editing');
  parent.classList.add('notEditing');

  for(const dom of $a('[data-field]:not([data-target=href])', parent)) {
    if(dom.contentEditable != 'false' && !dom.classList.contains('uneditable')) {
      dom.contentEditable = false;
      if(!obj[dom.dataset.field]) {
        dom[dom.dataset.target || 'innerText'] = '';
        if(!dom.dataset.forceshow)
          dom.classList.add('hidden');
      }
      if(dom.dataset.html)
        removeRichtextControls(dom);
    }
  }
  for(const hideDom of $a('[data-showfor]', parent))
    if(!hideDom.dataset.showfor.split('|').filter(field=>obj[field]).length)
      hideDom.classList.add('hidden');
}

function emojiToFilename(emoji) {
  return [...emoji].map(char => char.codePointAt(0).toString(16).padStart(4, '0')).join('_').replace(/_fe0f/g, '');
}

let symbolData = null;
export async function loadSymbolPicker() {
  if(symbolData === null) {
    symbolData = 'loading';
    symbolData = await (await fetch('i/fonts/symbols.json')).json();
    let list = '';
    let gameIconsIndex = 0;
    for(const [ category, symbols ] of Object.entries(symbolData)) {
      list += `<h2>${category}</h2>`;
      for(const [ symbol, keywords ] of Object.entries(symbols)) {
        if(symbol.includes('/')) {
          // increase resource limits in /etc/ImageMagick-6/policy.xml to 8GiB and then: montage -background none assets/game-icons.net/*/*.svg -geometry 48x48+0+0 -tile 60x assets/game-icons.net/overview.png
          list += `<i class="gameicons" title="game-icons.net: ${symbol}" data-symbol="${symbol}" data-keywords="${symbol},${keywords.join().toLowerCase()}" style="--x:${gameIconsIndex%60};--y:${Math.floor(gameIconsIndex/60)};--url:url('i/game-icons.net/${symbol}.svg')"></i>`;
          ++gameIconsIndex;
        } else {
          let className = 'emoji';
          if(symbol[0] == '[')
            className = 'symbols';
          else if(symbol.match(/^[a-z0-9_]+$/))
            className = 'material-icons';
          list += `<i class="${className}" title="${className}: ${symbol}" data-keywords="${symbol},${keywords.join().toLowerCase()}" style="--url:url('i/noto-emoji/emoji_u${emojiToFilename(symbol)}.svg')">${symbol}</i>`;
        }
      }
    }
    $('#symbolList').innerHTML = list;

    $('#symbolPickerOverlay input').onkeyup = function() {
      const text = regexEscape($('#symbolPickerOverlay input').value.toLowerCase());
      for(const icon of $a('#symbolList i'))
        toggleClass(icon, 'hidden', !icon.dataset.keywords.match(text));
      for(const title of $a('#symbolList h2'))
        toggleClass(title, 'hidden', text);
      toggleClass($('#symbolPickerOverlay'), 'fewResults', $a('#symbolList i:not(.hidden)').length < 100);
    };
  }
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
    const parent = window.getSelection().getRangeAt(0).startContainer.parentNode.closest('h4');
    if(parent)
      parent.replaceWith(...parent.children);
    else
      document.execCommand('formatBlock', false, 'h4');
    dom.focus();
  };
  $('[icon=palette]', controls).onclick = function() {
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
    const range = window.getSelection().getRangeAt(0);

    showStatesOverlay('symbolPickerOverlay');
    $('#symbolPickerOverlay').scrollTop = 0;
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
          let className = 'emoji';
          if(icon.innerText[0] == '[')
            className = 'symbols';
          else if(icon.innerText.match(/^[a-z0-9_]+$/))
            className = 'material-icons';
          if(className == 'emoji')
            document.execCommand('inserthtml', false, icon.innerText);
          else
            document.execCommand('inserthtml', false, `<i class="richtextSymbol ${className}">${icon.innerText}</i>`);
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

export function toggleClass(dom, className, active) {
  if(active || typeof active == 'undefined' && !dom.classList.contains(className))
    dom.classList.add(className);
  else
    dom.classList.remove(className);
}

export function on(selector, eventName, callback) {
  for(const d of $a(selector))
    d.addEventListener(eventName, callback);
}

export function onLoad(callback) {
  window.addEventListener('DOMContentLoaded', callback);
}

export function selectFile(getContents, multipleCallback) {
  return new Promise((resolve, reject) => {
    const upload = document.createElement('input');
    upload.type = 'file';
    if (typeof multipleCallback === 'function') upload.setAttribute('multiple', true);
    upload.addEventListener('change', function(e) {
      if(!getContents && typeof multipleCallback !== 'function')
        return resolve(e.target.files[0]);

      for(const file of e.target.files) {
        if(!getContents && typeof multipleCallback === 'function') {
          multipleCallback(file);
          continue;
        }

        const name = file.name;
        const reader = new FileReader();
        reader.addEventListener('load', function(e) {
          if(typeof multipleCallback === 'function')
            multipleCallback({ content: e.target.result, name });
          else
            resolve({ content: e.target.result, name });
        });
        if(getContents == 'BINARY')
          reader.readAsArrayBuffer(file);
        else if(getContents == 'TEXT')
          reader.readAsText(file);
        else
          reader.readAsDataURL(file);
      }
    });
    upload.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  });
}

export function asArray(variable) {
  return Array.isArray(variable) ? variable : [ variable ];
}

export function mod(a, b) {
  return ((a % b) + b) % b;
}

export function funhash(s) {
  for(var i = 0, h = 0xdeadbeef; i < s.length; i++)
  h = Math.imul(h ^ s.charCodeAt(i), 2654435761);
  return (h ^ h >>> 16) >>> 0;
}
