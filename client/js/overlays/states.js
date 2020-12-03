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

function addStateFromLibrary(e) {
  pickStateFromLibrary().then(url=>{
    if(e.target.parentNode == $('#addVariant'))
      showOverlay('stateEditOverlay');
    else
      showOverlay('statesOverlay');
    addState(e, 'link', url);
  });
}

function downloadState(variantID) {
  const stateID = $('#stateEditOverlay').dataset.id;
  let url = `/dl/${roomID}`
  if(variantID !== null)
    url += `/${stateID}`;
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
      attribution: $('.stateAttribution', variant).value
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
    link:    $('#stateLink').value,
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
  $('#stateLink').value = state.link || '';
  $('#stateLink').parentNode.style.display = state.link ? 'block' : 'none';

  removeFromDOM('#variantsEditList > div');
  for(const variantID in state.variants) {
    const variant = state.variants[variantID];
    const vEntry = domByTemplate('template-variantseditlist-entry');
    vEntry.dataset.id = variantID;
    $('.stateLanguage', vEntry).value = variant.language;
    $('.statePlayers', vEntry).value = variant.players;
    $('.stateVariant', vEntry).value = variant.variant;
    $('.stateLink', vEntry).value = variant.link || '';
    $('.stateAttribution', vEntry).value = variant.attribution || '';
    $('.stateLink', vEntry).parentNode.style.display = variant.link ? 'block' : 'none';

    $('.download', vEntry).addEventListener('click', _=>downloadState(variantID));
    $('.remove', vEntry).addEventListener('click', _=>removeFromDOM(vEntry));
    $('#variantsEditList').appendChild(vEntry);
  }

  showOverlay(null);
  showOverlay('stateEditOverlay');
}

async function pickStateFromLibrary() {
  showOverlay('libraryOverlay');
  await populateLibrary();

  return new Promise((resolve, reject) => {
    on('#libraryOverlay .add', 'click', function() {
      resolve(this.dataset.url);
    });
  });
}

async function populateLibrary() {
  if(!$('#libraryList.populated')) {
    const library = await fetch('/library.json');
    for(const entry of await library.json()) {
      const lEntry = domByTemplate('template-librarylist-entry', 'tr');

      $('.name', lEntry).textContent = entry.name;
      $('.players', lEntry).textContent = entry.players;
      $('.language', lEntry).textContent = entry.language;
      $('.notes', lEntry).textContent = entry.notes;
      $('a', lEntry).textContent = entry['similar name'];
      $('a', lEntry).href = entry['similar link'];
      $('button.add', lEntry).dataset.url = entry.link;

      $('#libraryList').appendChild(lEntry);
    }
    $('#libraryList').classList.add('populated');
    removeFromDOM('#libraryOverlay > p');
  }
}

function removeState() {
  toServer('removeState', $('#stateEditOverlay').dataset.id);
  showOverlay('statesOverlay');
}

onLoad(function() {
  onMessage('meta', args=>fillStatesList(args.meta.states, args.activePlayers));

  on('#addState .create,  #addVariant .create',  'click', e=>addState(e, 'state'));
  on('#addState .upload,  #addVariant .upload',  'click', e=>selectFile(true).then(f=>addState(e, 'file', f)));
  on('#addState .link,    #addVariant .link',    'click', e=>addState(e, 'link', prompt('Enter shared URL:')));
  on('#addState .library, #addVariant .library', 'click', e=>addStateFromLibrary(e));

  on('#addState .download', 'click', _=>downloadState(null));

  on('#stateEditOverlay .save',     'click', editState);
  on('#stateEditOverlay .download', 'click', _=>downloadState());
  on('#stateEditOverlay .remove',   'click', removeState);

  on('#stateEditOverlay .uploadAsset', 'click', _=>uploadAsset().then(asset=>$('#stateImage').value=asset));
});
