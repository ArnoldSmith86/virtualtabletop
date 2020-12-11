function $(selector, parent) {
  return (parent || document).querySelector(selector);
}

function $a(selector, parent) {
  return (parent || document).querySelectorAll(selector);
}

function removeFromDOM(node) {
  if(typeof node == 'string') {
    for(const c of $a(node))
      removeFromDOM(c);
  } else {
    node.parentNode.removeChild(node);
  }
}

function domByTemplate(id, type) {
  const div = document.createElement(type || 'div');
  div.innerHTML = document.getElementById(id).innerHTML;
  return div;
}

function on(selector, eventName, callback) {
  for(const d of $a(selector))
    d.addEventListener(eventName, callback);
}

function onLoad(callback) {
  window.addEventListener('DOMContentLoaded', callback);
}

function selectFile(getContents) {
  return new Promise((resolve, reject) => {
    const upload = document.createElement('input');
    upload.type = 'file';
    upload.addEventListener('change', function(e) {
      if(!getContents)
        resolve(e.target.files[0]);

      const reader = new FileReader();
      reader.addEventListener('load', a=>resolve({ content: a.target.result, name: e.target.files[0].name }));
      if(getContents == 'BINARY')
        reader.readAsArrayBuffer(e.target.files[0]);
      else
        reader.readAsDataURL(e.target.files[0]);
    });
    upload.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  });
}
