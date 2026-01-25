export function $(selector, parent) {
  return (parent || document).querySelector(selector);
}

export function $a(selector, parent) {
  return (parent || document).querySelectorAll(selector);
}

// returns the first matching direct child of the parent
export function $c(selector, parent) {
  return Array.from(parent.children).find(
    el => el.matches(selector)
  );
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

export function progressButton(button, clickHandler, disableWhenDone=true) {
  const initialIcon = button.getAttribute('icon');
  const initialText = button.innerText;

  button.onclick = async function() {
    button.disabled = true;
    button.classList.add('progress');
    button.innerText = 'Working...';
    button.setAttribute('icon', 'hourglass_empty');
    try {
      await clickHandler(function(status, progress) {
        button.innerText = status;
        if(progress) {
          button.classList.add('visualProgress');
          button.style.setProperty('--progress', progress);
        }
      });
      button.setAttribute('icon', 'check');
      button.innerText = 'Done';
      button.classList.remove('progress');
      button.classList.remove('visualProgress');
      button.classList.add('green');
    } catch(e) {
      button.setAttribute('icon', 'error');
      button.innerText = e.toString();
      button.classList.remove('progress');
      button.classList.remove('visualProgress');
      button.classList.add('red');
    }
    if(disableWhenDone) {
      await sleep(2500);
      button.disabled = false;
      button.setAttribute('icon', initialIcon);
      button.innerText = initialText;
      button.classList.remove('green');
      button.classList.remove('red');
    }
  };
}

async function shareURL(url) {
  try {
    await navigator.share({ url });
  } catch(e) {
    try {
      await navigator.clipboard.writeText(url);
    } catch(e) {
      throw new Error('Could not share or copy URL.');
    }
  }
}

// uses a progressButton with a custom handler that shares a URL
export function shareButton(button, urlCallback) {
  progressButton(button, async function(updateProgress) {
    updateProgress('Sharing...');
    await shareURL(urlCallback());
  });
}

export async function loadImage(img, src) {
  return new Promise(function(resolve, reject) {
    img.onload = function() {
      img.onload = null;
      resolve(img);
    };
    img.onerror = e=>reject(e);
    img.src = src;
  });
}

const sleep = delay => new Promise(resolve => setTimeout(resolve, delay));

export function rand() {
  let number = Math.random();

  if(window.customRandomSeed) {
    const x = Math.sin(window.customRandomSeed++) * 10000;
    number = Math.round((x - Math.floor(x))*1000000)/1000000;
  }

  if(typeof traceRandom == 'function')
    traceRandom(number);
  return number;
}

export function regexEscape(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, m=>'\\'+m[0]);
}

export function setText(node, text) {
  if(node.classList.contains('emoji-monochrome'))
    text = toNotoMonochrome(text);
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
    const j = Math.floor(rand() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return isString ? array.join('') : array;
}

export function mapAssetURLs(str) {
  let result = String(str);

  const gameSettings = getGameSettings();
  const assetAliases = gameSettings.assetAliases || {};
  
  for(const [asset, alias] of Object.entries(assetAliases))
    result = result.replace(new RegExp(`\\{\\{${regexEscape(alias)}\\}\\}`, 'g'), asset);

  return result.replaceAll(/(^|["' (])\/(assets|i)\//g, '$1$2/');
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
    const underlineelement = document.createElement('div');
    underlineelement.classList.add('inputunderline');
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
    dom.appendChild(underlineelement);
    dom.appendChild(spanafter);
    input.id = id;
  }

  if(field.type == 'select') {
    const input = document.createElement('select');
    const underlineelement = document.createElement('div');
    const inputexpandselect = document.createElement('div');
    underlineelement.classList.add('inputunderline');
    inputexpandselect.classList.add('inputexpandselect');
    for(const option of asArray(field.options || [])) {
      const optionElement = document.createElement('option');
      optionElement.value = option.value || '';
      optionElement.textContent = option.text || option.value || '';
      if(option.value == field.value || field.value == null && option.selected)
        optionElement.selected = true;
      input.appendChild(optionElement);
    }
    inputexpandselect.textContent = "expand_more";
    dom.appendChild(input);
    dom.appendChild(underlineelement);
    dom.appendChild(inputexpandselect);
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
    const input = document.createElement('div');
    for (const widgetID of field.widgets) {
      const widget = widgets.get(widgetID);
      for(let face=0; face<(field.mode == 'faces'?widget.getFaceCount():1); ++face) {
        if(Array.isArray(field.faces) && field.faces.indexOf(face) == -1)
          continue;
        let propertyOverride = Object.assign({}, field.propertyOverride || {});
        if(field.mode == 'faces')
          propertyOverride.activeFace = face;

        const widgetContainer = div(input, 'inputchooseWidgetWrapper');
        const widgetClone = widget.renderReadonlyCopy(propertyOverride, $('body'), field.visibleChildWidgets);
        const widgetDOM = widgetClone.domElement;
        widgetClone.state.scale = scale * (field.scale || 1);
        widgetClone.domElement.style.cssText = mapAssetURLs(widgetClone.css());
        widgetDOM.dataset.source = widgetID;
        widgetDOM.dataset.face = face;

        const rect = widgetDOM.getBoundingClientRect();
        widgetContainer.style.width  = `${rect.width }px`;
        widgetContainer.style.height = `${rect.height}px`;
        widgetContainer.append(widgetDOM);

        if (asArray(field.value || []).indexOf(widgetID) !== -1) {
          widgetContainer.classList.add('selected');
        }
        widgetContainer.onclick = _=>{
          if(widgetContainer.classList.contains('selected')) {
            widgetContainer.classList.remove('selected');
          } else if($a('.selected', input).length < (field.max === undefined ? 1 : field.max)) {
            widgetContainer.classList.add('selected');
          } else if(field.max === undefined || field.max === 1) {
            for(const previousSelected of $a('.selected', input))
              previousSelected.classList.remove('selected');
            widgetContainer.classList.add('selected');
          }
        };
      }
    }
    dom.appendChild(input);
    input.id = id;
  }

  if(field.type == 'string') {
    const input = document.createElement('input');
    const underlineelement = document.createElement('div');
    underlineelement.classList.add('inputunderline');
    input.value = field.value || '';
    dom.appendChild(input);
    dom.appendChild(underlineelement);
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

function html(string) {
  return String(string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function applyValuesToDOM(parent, obj) {
  for(const dom of $a('[data-field]', parent)) {
    if(obj[dom.dataset.field]) {
      dom.classList.remove('hidden');
      if(dom.dataset.html)
        dom.innerHTML = DOMPurify.sanitize(replaceMaterialIcons(mapAssetURLs(obj[dom.dataset.field])), { USE_PROFILES: { html: true } });
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

export function selectFile(getContents, multipleCallback, fileTypes) {
  return new Promise((resolve, reject) => {
    const upload = document.createElement('input');
    upload.type = 'file';
    if (typeof multipleCallback === 'function') upload.setAttribute('multiple', true);
    if (Array.isArray(fileTypes)) upload.setAttribute('accept', fileTypes.join(','));

    const cancelHandler = () => {
      window.removeEventListener('focus', cancelHandler);
      setTimeout(() => {
        if (upload.files.length === 0) {
          reject(new Error('File selection cancelled.'));
        }
      }, 300);
    };
    window.addEventListener('focus', cancelHandler);

    upload.addEventListener('change', function(e) {
      window.removeEventListener('focus', cancelHandler);
      if (e.target.files.length === 0) {
        return reject(new Error('File selection cancelled.'));
      }

      if (typeof multipleCallback === 'function') {
        for (const file of e.target.files) {
          if(!getContents) {
            multipleCallback(file);
            continue;
          }
  
          const reader = new FileReader();
          reader.onload = (event) => {
            multipleCallback({ content: event.target.result, name: file.name });
          };
          if (getContents === 'BINARY') {
            reader.readAsArrayBuffer(file);
          } else if (getContents === 'TEXT') {
            reader.readAsText(file);
          } else {
            reader.readAsDataURL(file);
          }
        }
        resolve(); // Resolve the promise once all files are being processed
      } else {
        const file = e.target.files[0];
        if(!getContents) {
          resolve(file);
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          resolve({ content: event.target.result, name: file.name });
        };
        if (getContents === 'BINARY') {
          reader.readAsArrayBuffer(file);
        } else if (getContents === 'TEXT') {
          reader.readAsText(file);
        } else {
          reader.readAsDataURL(file);
        }
      }
    });
    upload.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

export function triggerDownload(url, filename) {
  var link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link); // Required for Firefox
  link.click();
  setTimeout(function(){
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, 100);
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

export function getBaseURL() {
  return `${location.origin}${config.urlPrefix || ''}`;
}
