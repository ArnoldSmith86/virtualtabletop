function $(selector, parent) {
  return (parent || document).querySelector(selector, parent);
}

function $a(selector, parent) {
  return (parent || document).querySelectorAll(selector);
}

function domByTemplate(id) {
  const div = document.createElement('div');
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
      reader.addEventListener('load', e=>resolve(e.target.result));
      reader.readAsDataURL(e.target.files[0]);
    });
    upload.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  });
}
