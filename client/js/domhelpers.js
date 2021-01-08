export function $(selector, parent) {
  return (parent || document).querySelector(selector);
}

export function $a(selector, parent) {
  return (parent || document).querySelectorAll(selector);
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
    upload.setAttribute('multiple', !!multipleCallback);
    upload.addEventListener('change', function(e) {
      if(!getContents)
        resolve(e.target.files[0]);

      for(const file of e.target.files) {
        const name = file.name;
        const reader = new FileReader();
        reader.addEventListener('load', function(e) {
          if(multipleCallback)
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
