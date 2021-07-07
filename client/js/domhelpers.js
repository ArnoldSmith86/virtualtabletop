export function $(selector, parent) {
  return (parent || document).querySelector(selector);
}

export function $a(selector, parent) {
  return (parent || document).querySelectorAll(selector);
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

export function domByTemplate(id, type) {
  const div = document.createElement(type || 'div');
  div.innerHTML = document.getElementById(id).innerHTML;
  return div;
}

export function formField(field, dom, id) {
  if(field.type == 'checkbox') {
    const input = document.createElement('input');
    const label = document.createElement('label');
    input.type = 'checkbox';
    input.checked = !!field.value;
    label.textContent = field.label;
    dom.appendChild(input);
    dom.appendChild(label);
    label.htmlFor = input.id = id;
  }

  if(field.type == 'color') {
    const input = document.createElement('input');
    const label = document.createElement('label');
    input.type = 'color';
    input.value = field.value || '#ff0000';
    label.textContent = field.label;
    dom.appendChild(label);
    dom.appendChild(input);
    label.htmlFor = input.id = id;
  }

  if(field.type == 'number') {
    const input = document.createElement('input');
    const label = document.createElement('label');
    input.type = 'number';
    input.value = field.value !== undefined ? field.value : 1;
    input.min = field.min || 1;
    input.max = field.max || 10;
    label.textContent = field.label;
    dom.appendChild(label);
    dom.appendChild(input);
    label.htmlFor = input.id = id;
  }

  if(field.type == 'select') {
    const input = document.createElement('select');
    const label = document.createElement('label');

    for(const option of field.options) {
      const optionElement = document.createElement('option');
      optionElement.value = option.value || '';
      optionElement.textContent = option.text || option.value || '';
      input.appendChild(optionElement);
    }
    label.textContent = field.label;
    dom.appendChild(label);
    dom.appendChild(input);
    label.htmlFor = input.id = id;
  }

  if(field.type == 'string') {
    const input = document.createElement('input');
    const label = document.createElement('label');
    input.value = field.value || '';
    label.textContent = field.label;
    dom.appendChild(label);
    dom.appendChild(input);
    label.htmlFor = input.id = id;
  }

  if(field.type == 'text') {
    const p = document.createElement('p');
    p.textContent = field.text;
    dom.appendChild(p);
  }
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
        else
          reader.readAsDataURL(file);
      }
    });
    upload.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  });
}
