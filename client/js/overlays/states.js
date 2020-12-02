let waitingForStateCreation = null;

function addState(e, type, src) {
  if(type == 'url' && (!src || !src.match(/^http/)))
    return;
  const id = Math.random().toString(36).substring(3, 7);

  if(e.target.parentNode == $('#addVariant')) {
    waitingForStateCreation = $('#stateEditOverlay').dataset.id;
    toServer('addState', { id, type, src, addAsVariant: $('#stateEditOverlay').dataset.id });
  } else {
    waitingForStateCreation = id;
    toServer('addState', { id, type, src });
  }
}

function downloadState(variantID) {
  const stateID = $('#stateEditOverlay').dataset.id;
  let url = `/dl/${roomID}/${stateID}`;
  if(variantID)
    url += `/${variantID}`;
  window.location.href = url;
}

function editState() {
  const variants = {};
  for(const variant of $a('#variantsEditList > div')) {
    variants[variant.dataset.id] = {
      players: $('.statePlayers', variant).value,
      language: $('.stateLanguage', variant).value,
      variant: $('.stateVariant', variant).value,
      link: $('.stateLink', variant).value,
      etag: $('.stateEtag', variant).value
    };
  }
  toServer('editState', { id: $('#stateEditOverlay').dataset.id, meta: {
    name:    $('#stateName').value,
    image:   $('#stateImage').value,
    rules:   $('#stateRules').value,
    bgg:     $('#stateBGG').value,
    year:    $('#stateYear').value,
    mode:    $('#stateMode').value,
    time:    $('#stateTime').value,
    variants
  }});
  showOverlay('statesOverlay');
}

function fillStatesList(states, activePlayers) {
  const addDiv = $('#addState');
  removeFromDOM(addDiv);
  removeFromDOM('#statesList > div');

  for(const kvp of Object.entries(states).sort((a, b) => a[1].name.localeCompare(b[1].name))) {
    const state = kvp[1];
    state.id = kvp[0];

    const entry = domByTemplate('template-stateslist-entry');
    entry.className = 'roomState';
    $('img', entry).src = state.image;
    $('.bgg', entry).textContent = `${state.name} (${state.year})`;
    $('.bgg', entry).href = state.bgg;
    $('.rules', entry).href = state.rules;
    $('.time', entry).textContent = state.time;

    for(const variantID in state.variants) {
      const variant = state.variants[variantID];
      const vEntry = domByTemplate('template-variantslist-entry');
      $('.language', vEntry).textContent = String.fromCodePoint(...[...variant.language].map(c => c.charCodeAt() + 0x1F1A5));
      $('.players', vEntry).textContent = variant.players;
      $('.variant', vEntry).textContent = variant.variant;

      $('.play', vEntry).addEventListener('click', _=>{ toServer('loadState', { stateID: state.id, variantID }); showOverlay(null); });
      $('.variantsList', entry).appendChild(vEntry);
    }

    $('.edit', entry).addEventListener('click', _=>fillEditState(state));
    $('#statesList').appendChild(entry);

    if(state.id == waitingForStateCreation) {
      waitingForStateCreation = null;
      if(state.name == 'Unnamed' || $('#stateEditOverlay').style.display == 'flex')
        fillEditState(state);
    }
  }
  $('#statesList').appendChild(addDiv);
}

function fillEditState(state) {
  $('#stateEditOverlay').dataset.id = state.id;

  $('#stateName').value = state.name;
  $('#stateImage').value = state.image;
  $('#stateRules').value = state.rules;
  $('#stateBGG').value = state.bgg;
  $('#stateYear').value = state.year;
  $('#stateMode').value = state.mode;
  $('#stateTime').value = state.time;

  removeFromDOM('#variantsEditList > div');
  for(const variantID in state.variants) {
    const variant = state.variants[variantID];
    const vEntry = domByTemplate('template-variantseditlist-entry');
    vEntry.dataset.id = variantID;
    $('.stateLanguage', vEntry).value = variant.language;
    $('.statePlayers', vEntry).value = variant.players;
    $('.stateVariant', vEntry).value = variant.variant;
    $('.stateLink', vEntry).value = variant.link || '';
    $('.stateEtag', vEntry).value = variant.etag;
    $('.stateLink', vEntry).parentNode.style.display = variant.link ? 'block' : 'none';

    $('.download', vEntry).addEventListener('click', _=>downloadState(variantID));
    $('.remove', vEntry).addEventListener('click', _=>removeFromDOM(vEntry));
    $('#variantsEditList').appendChild(vEntry);
  }

  showOverlay(null);
  showOverlay('stateEditOverlay');
}

function removeState() {
  toServer('removeState', $('#stateEditOverlay').dataset.id);
  showOverlay('statesOverlay');
}

onLoad(function() {
  onMessage('meta', args=>fillStatesList(args.meta.states, args.activePlayers));

  on('#addState .create, #addVariant .create', 'click', e=>addState(e, 'state'));
  on('#addState .upload, #addVariant .upload', 'click', e=>selectFile(true).then(f=>addState(e, 'file', f)));
  on('#addState .link,   #addVariant .link',   'click', e=>addState(e, 'link', prompt('Enter shared URL:')));

  on('#stateEditOverlay .save',     'click', editState);
  on('#stateEditOverlay .download', 'click', _=>downloadState());
  on('#stateEditOverlay .remove',   'click', removeState);
});
