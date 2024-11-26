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

function emojis2images(dom) {
  const regex = /\ud83c\udff4(\udb40[\udc61-\udc7a])+\udb40\udc7f|(\ud83c[\udde6-\uddff]){2}|([\#\*0-9]\ufe0f?\u20e3)|(\u00a9|\u00ae|[\u203c\u2049\u20e3\u2122\u2139\u2194-\u2199\u21a9\u21aa\u231a\u231b\u2328\u23cf\u23e9-\u23fa\u24c2\u25aa\u25ab\u25b6\u25c0\u25fb-\u25fe\u2600-\u2604\u260e\u2611\u2614\u2615\u2618\u261d\u2620\u2622\u2623\u2626\u262a\u262e\u262f\u2638-\u263a\u2640\u2642\u2648-\u2653\u265f\u2660\u2663\u2665\u2666\u2668\u267b\u267e\u267f\u2692-\u2697\u2699\u269b\u269c\u26a0\u26a1\u26a7\u26aa\u26ab\u26b0\u26b1\u26bd\u26be\u26c4\u26c5\u26c8\u26ce\u26cf\u26d1\u26d3\u26d4\u26e9\u26ea\u26f0-\u26f5\u26f7-\u26fa\u26fd\u2702\u2705\u2708-\u270d\u270f\u2712\u2714\u2716\u271d\u2721\u2728\u2733\u2734\u2744\u2747\u274c\u274e\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27a1\u27b0\u27bf\u2934\u2935\u2b05-\u2b07\u2b1b\u2b1c\u2b50\u2b55\u3030\u303d\u3297\u3299]|\ud83c[\udc04\udccf\udd70\udd71\udd7e\udd7f\udd8e\udd91-\udd9a\udde6-\uddff\ude01\ude02\ude1a\ude2f\ude32-\ude3a\ude50\ude51\udf00-\udf21\udf24-\udf93\udf96\udf97\udf99-\udf9b\udf9e-\udff0\udff3-\udff5\udff7-\udfff]|\ud83d[\udc00-\udcfd\udcff-\udd3d\udd49-\udd4e\udd50-\udd67\udd6f\udd70\udd73-\udd7a\udd87\udd8a-\udd8d\udd90\udd95\udd96\udda4\udda5\udda8\uddb1\uddb2\uddbc\uddc2-\uddc4\uddd1-\uddd3\udddc-\uddde\udde1\udde3\udde8\uddef\uddf3\uddfa-\ude4f\ude80-\udec5\udecb-\uded2\uded5-\uded7\udedc-\udee5\udee9\udeeb\udeec\udef0\udef3-\udefc\udfe0-\udfeb\udff0]|\ud83e[\udd0c-\udd3a\udd3c-\udd45\udd47-\ude7c\ude80-\ude88\ude90-\udebd\udebf-\udec5\udece-\udedb\udee0-\udee8\udef0-\udef8])((\ud83c[\udffb-\udfff])?(\ud83e[\uddb0-\uddb3])?(\ufe0f?\u200d([\u2000-\u3300]|[\ud83c-\ud83e][\ud000-\udfff])\ufe0f?)?)*/g;

  function replaceEmojisInNode(node) {
    // Skip nodes with the class "emoji-monochrome"
    if (node.classList && node.classList.contains('emoji-monochrome')) {
      return;
    }

    // Process text nodes only
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        const originalContent = html(child.textContent);
        const replacedContent = originalContent.replace(regex, m =>
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

function skipForNotoMonochrome(emoji) {
  return emoji.match(/^[\u{1f3c3}-\u{1f3cc}]\u{fe0f}?\u{200d}[\u{2640}\u{2642}]\u{fe0f}(\u{200d}\u{27a1}\u{fe0f})?|\u{1f468}|\u{1f468}\u{200d}[\u{1f33e}\u{1f373}\u{1f37c}\u{1f393}\u{1f3a4}\u{1f3a8}\u{1f3eb}\u{1f3ed}\u{1f4bb}\u{1f4bc}\u{1f527}\u{1f52c}\u{1f680}\u{1f692}\u{1f9af}\u{1f9b1}\u{1f9b2}\u{1f9bc}\u{1f9bd}]|\u{1f468}\u{200d}[\u{1f9af}\u{1f9bc}\u{1f9bd}]\u{200d}\u{27a1}\u{fe0f}|\u{1f468}\u{200d}[\u{2695}\u{2696}\u{2708}]\u{fe0f}|\u{1f468}\u{200d}\u{2764}\u{fe0f}\u{200d}(\u{1f468}|\u{1f48b}\u{200d}\u{1f468})|\u{1f469}\u{200d}[\u{1f33e}\u{1f373}\u{1f393}\u{1f3a4}\u{1f3a8}\u{1f3eb}\u{1f3ed}\u{1f4bb}\u{1f4bc}\u{1f527}\u{1f52c}\u{1f680}\u{1f692}\u{1f9af}-\u{1f9b3}\u{1f9bc}\u{1f9bd}]|\u{1f469}\u{200d}[\u{1f9af}\u{1f9bc}\u{1f9bd}]\u{200d}\u{27a1}\u{fe0f}|\u{1f469}\u{200d}[\u{2695}\u{2696}\u{2708}]\u{fe0f}|\u{1f469}\u{200d}\u{2764}\u{fe0f}\u{200d}(\u{1f48b}\u{200d})?[\u{1f468}\u{1f469}]|\u{1f46b}|\u{1f46c}|\u{200d}[\u{2640}\u{2642}]|\u{1f478}|\u{1f57a}|\u{1f934}|\u{1f936}|\u{1f9d1}\u{200d}(\u{1f37c}|\u{1f384}|\u{1f91d}\u{200d}\u{1f9d1})|\u{1fac3}|\u{1fac4}$/u);
}

let symbolData = null;
export async function loadSymbolPicker() {
  if(symbolData === null) {
    symbolData = 'loading';
    symbolData = await (await fetch('i/fonts/symbols.json')).json();
    let list = '';
    for(const [ category, symbols ] of Object.entries(symbolData)) {
      if(category == 'Emoji - Flags')
        continue;
      list += `<h2 class="${category.match(/Material|VTT|Emoji/)?'fontCategory':'imageCategory'}">${category}</h2>`;
      for(const [ symbol, keywords ] of Object.entries(symbols)) {
        if(symbol.includes('/')) {
          const gameIconsIndex = keywords.shift();
          // increase resource limits in /etc/ImageMagick-6/policy.xml to 8GiB and then: montage -background none assets/game-icons.net/*/*.svg -geometry 48x48+0+0 -tile 60x assets/game-icons.net/overview.png
          list += `<i class="gameicons" title="game-icons.net: ${symbol}" data-type="game-icons" data-symbol="${symbol}" data-keywords="${symbol.split('/')[1]},${keywords.join().toLowerCase()}" style="--x:${gameIconsIndex%60};--y:${Math.floor(gameIconsIndex/60)};--url:url('i/game-icons.net/${symbol}.svg')"></i>`;
        } else {
          let className = 'emoji-monochrome';
          if(symbol[0] == '[')
            className = 'symbols';
          else if(symbol.match(/^[a-z0-9_]+$/))
            className = 'material-icons';
          if(className != 'emoji-monochrome' || !skipForNotoMonochrome(symbol))
            list += `<i class="${className}" title="${className}: ${symbol}" data-type="${className}" data-symbol="${symbol}" data-keywords="${symbol},${keywords.join().toLowerCase()}" style="--url:url('i/noto-emoji/emoji_u${emojiToFilename(symbol)}.svg')">${toNotoMonochrome(symbol)}</i>`;
        }
      }
    }
    for(const [ category, symbols ] of Object.entries(symbolData)) {
      if(category.match(/Emoji/)) {
        list += `<h2 class="imageCategory">${category}</h2>`;
        for(const [ symbol, keywords ] of Object.entries(symbols)) {
          let className = 'emoji-color';
          if(category == 'Emoji - Flags')
            className += ' emojiFlag';
          list += `<i class="${className}" title="${className}: ${symbol}" data-type="${className}" data-symbol="${symbol}" data-keywords="${symbol},${keywords.join().toLowerCase()}" style="--url:url('i/noto-emoji/emoji_u${emojiToFilename(symbol)}.svg')">${symbol}</i>`;
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

export async function pickSymbol(type='all', bigPreviews=true, closeOverlay=true) {
  if($('#statesButton').dataset.overlay == 'symbolPickerOverlay')
    $('#statesButton').dataset.overlay = detailsOverlay;

  await loadSymbolPicker();
  return new Promise((resolve, reject) => {
    showOverlay('symbolPickerOverlay');
    $('#symbolPickerOverlay').classList.toggle('bigPreviews', bigPreviews);
    $('#symbolPickerOverlay').classList.toggle('hideFonts',   type=='images');
    $('#symbolPickerOverlay').classList.toggle('hideImages',  type=='fonts');
    $('#symbolPickerOverlay').scrollTop = 0;
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
