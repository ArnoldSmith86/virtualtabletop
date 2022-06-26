let waitingForStateCreation = null;
let variantIDjustUpdated = null;

async function addState(e, type, src, id) {
  const initialStatus = e && (e.target.dataset.initialText || e.target.innerText);
  if(e && !e.target.dataset.initialText)
    e.target.dataset.initialText = initialStatus;

  const status = function(t) {
    if(e)
      e.target.innerText=t;
  };

  if(type == 'link' && (!src || !src.match(/^http/)))
    return;
  if(!id)
    id = Math.random().toString(36).substring(3, 7);

  let blob = null;
  try {
    if(type == 'file') {
      status('Loading file...');
      const zip = await JSZip.loadAsync(src);
      const assets = {};
      for(const filename in zip.files)
        if(filename.match(/^\/?(user)?assets/) && zip.files[filename]._data && zip.files[filename]._data.crc32)
          assets[zip.files[filename]._data.crc32 + '_' + zip.files[filename]._data.uncompressedSize] = filename;

      status('Checking assets...');
      const result = await fetch('assetcheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.keys(assets))
      });

      const exist = await result.json();

      let total = 0;
      let removed = 0;
      for(const asset in exist) {
        ++total;
        if(exist[asset]) {
          ++removed;
          zip.remove(assets[asset]);
        }
      }

      if(removed > total/2) {
        zip.file('asset-map.json', JSON.stringify(assets));
        status(`Rebuilding file (${removed}/${total} assets already exist)...`);
        blob = await zip.generateAsync({ type: 'blob', compression: total-removed < 5 ? 'DEFLATE' : 'STORE' });
      } else {
        blob = src;
      }
    } else {
      blob = new Blob([ src ], { type: 'text/plain' });
    }
  } catch(e) {
    alert(e);
    status(initialStatus);
    return;
  }

  let url = `addState/${roomID}/${id}/${type}/${src && src.name && encodeURIComponent(src.name)}/`;
  waitingForStateCreation = id;
  if(e && (e.target.parentNode.parentNode == $('#addVariant') || e.target.classList.contains('update'))) {
    waitingForStateCreation = $('#stateEditOverlay').dataset.id;
    url += $('#stateEditOverlay').dataset.id;
  }

  var req = new XMLHttpRequest();
  req.onload = function(e) {
    if(e.target.status != 200)
      alert(`${e.target.status}: ${e.target.response}`);
    status(initialStatus);
  };
  req.upload.onprogress = e=>status(`Uploading (${Math.floor(e.loaded/e.total*100)}%)...`);

  req.open('PUT', url, true);
  req.setRequestHeader('Content-type', 'application/octet-stream');
  status('Starting upload...');
  req.send(blob);
}

function downloadState(variantID) {
  const stateID = $('#stateEditOverlay').dataset.id;
  let url = `dl/${roomID}`
  if(variantID !== null)
    url += `/${stateID}`;
  if(variantID)
    url += `/${variantID}`;
  window.location.href = url;
}

function editState() {
  const variants = [];
  for(const variant of $a('#variantsEditList > div')) {
    variants.push({
      players: $('.statePlayers', variant).value,
      language: $('.stateLanguage', variant).value,
      variant: $('.stateVariant', variant).value,
      link: $('.stateLink', variant).value,
      attribution: $('.stateAttribution', variant).value
    });
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

function toggleStateStar(state, dom) {
  const targetList = dom.parentElement.parentElement == $('#statesList > div:nth-of-type(1)')
                   ? $('#statesList > div:nth-of-type(2) > .list')
                   : $('#statesList > div:nth-of-type(1) > .list');
  targetList.insertBefore(dom, [...targetList.children].filter(d=>$('h3', d).innerText.localeCompare($('h3', dom).innerText) > 0)[0]);
  $('#emptyLibrary').style.display = $('#statesList > div:nth-of-type(1) .roomState') ? 'none' : 'block';
  toServer('toggleStateStar', state.publicLibrary);
}

function updateLibraryFilter() {
  const text = $('#filterByText').value.toLowerCase();
  const type = $('#filterByType').value;
  const players = $('#filterByPlayers').value;
  const duration = $('#filterByDuration').value.split('-');
  const language = $('#filterByLanguage').value;
  const mode = $('#filterByMode').value;
  for(const state of $a('#statesList .list > div')) {
    const textMatch     = state.dataset.text.match(text);
    const typeMatch     = type     == 'Any' || state.dataset.type.split(',').indexOf(type) != -1;
    const playersMatch  = players  == 'Any' || state.dataset.players.split(',').indexOf(players) != -1;
    const durationMatch = duration == 'Any' || state.dataset.duration >= duration[0] && state.dataset.duration <= duration[1];
    const languageMatch = language == 'Any' || state.dataset.languages.split(',').indexOf(language) != -1;
    const modeMatch     = mode     == 'Any' || state.dataset.modes.split(',').indexOf(mode) != -1;
    if(textMatch && typeMatch && playersMatch && durationMatch && languageMatch && modeMatch)
      state.classList.add('visible');
    else
      state.classList.remove('visible');
  }
}

function parsePlayers(players) {
  const validPlayers = [];
  for(const token of players.split(',')) {
    const match = token.match(/^([0-9]+)(-([0-9]+)|\+)?$/);
    if(match)
      for(let i=+match[1]; i<=(match[2] ? +match[3]||20 : +match[1]); ++i)
        validPlayers.push(i);
  }
  return validPlayers;
}

function fillStatesList(states, starred, returnServer, activePlayers) {
  if(returnServer) {
    $('#statesButton').dataset.overlay = 'returnOverlay';
    overlayShownForEmptyRoom = true;
    return;
  }
  $('#statesButton').dataset.overlay = 'statesOverlay';

  const emptyLibrary = $('#emptyLibrary');
  const addState = $('#addState');
  removeFromDOM('#statesList > div');

  let isEmpty = true;
  const sortedStates = Object.entries(states).sort((a, b) => a[1].name.localeCompare(b[1].name));

  const languageOptions = {};
  const modeOptions = {};

  const publicLibraryLinksFound = {};

  for(const publicLibrary of [ false, true ]) {
    const category = domByTemplate('template-stateslist-category');
    $('.title', category).textContent = publicLibrary ? 'Public Library' : 'Your Game Shelf';

    for(const kvp of sortedStates.filter(kvp=>(!!kvp[1].publicLibrary && (!starred || !starred[kvp[1].publicLibrary])) == publicLibrary)) {
      isEmpty = false;

      const state = kvp[1];
      state.id = kvp[0];
      state.starred = starred && starred[state.publicLibrary];

      const entry = domByTemplate('template-stateslist-entry');
      entry.dataset.id = state.id;
      entry.className = state.image ? 'roomState' : 'roomState noImage';
      if(state.publicLibrary)
        entry.className += ' publicLibraryGame';

      $('img', entry).src = state.image.replace(/^\//, '');
      $('h3', entry).textContent = state.name;
      $('h4', entry).textContent = state.similarName && state.name != state.similarName ? `Similar to ${state.similarName}` : '';

      const validPlayers = [];
      const validLanguages = [];
      let hasVariants = false;
      for(const variantID in state.variants) {
        let variant = state.variants[variantID];
        if(variant.plStateID) {
          publicLibraryLinksFound[`${variant.plStateID} - ${variant.plVariantID}`] = true;
          variant = states[variant.plStateID].variants[variant.plVariantID];
        }

        if(!publicLibraryLinksFound[`${state.id} - ${variantID}`])
          hasVariants = true;

        validPlayers.push(...parsePlayers(variant.players));
        validLanguages.push(variant.language);
        languageOptions[variant.language] = true;
      }

      modeOptions[state.mode] = true;

      if(hasVariants) {
        entry.addEventListener('click', _=>fillStateDetails(states, state, entry));
        $('.star', entry).addEventListener('click', function(e) {
          toggleStateStar(state, entry);
          event.stopPropagation();
        });
        $('.list', category).appendChild(entry);
      }

      entry.dataset.text = `${state.name} ${state.similarName} ${state.description}`.toLowerCase();
      entry.dataset.players = validPlayers.join();
      entry.dataset.duration = String(state.time).replace(/.*[^0-9]/, '');
      entry.dataset.languages = validLanguages.join();
      entry.dataset.modes = state.mode;

      if(state.publicLibrary && state.publicLibrary.match(/tutorials/))
        entry.dataset.type = 'Tutorials';
      else if(state.publicLibrary && state.publicLibrary.match(/assets/))
        entry.dataset.type = 'Assets';
      else
        entry.dataset.type = 'Games';

      if(state.id == waitingForStateCreation) {
        waitingForStateCreation = null;
        if(state.name == 'Unnamed' || $('#stateEditOverlay').style.display == 'flex')
          fillEditState(state);
      }
    }

    $('#statesList').appendChild(category);
  }

  $('#statesList > div').insertBefore(emptyLibrary, $('#statesList > div > h2').nextSibling);
  $('#statesList > div').insertBefore(addState, $('#statesList > div > h2').nextSibling);
  emptyLibrary.style.display = $('#statesList > div:nth-of-type(1) .roomState') ? 'none' : 'block';

  const previousLanguage = $('#filterByLanguage').value;
  let languageHTML = '<option>Any</option>';
  for(const languageOption in languageOptions)
    languageHTML += `<option ${previousLanguage && previousLanguage == languageOption ? 'selected' : ''}>${languageOption}</option>`;
  $('#filterByLanguage').innerHTML = languageHTML;

  const previousMode = $('#filterByMode').value;
  let modeHTML = '<option>Any</option>';
  for(const modeOption in modeOptions)
    modeHTML += `<option ${previousMode && previousMode == modeOption ? 'selected' : ''}>${modeOption}</option>`;
  $('#filterByMode').innerHTML = modeHTML;

  updateLibraryFilter();

  if($('#stateDetailsOverlay').style.display != 'none') {
    showOverlay();
    const stateID = $('#stateDetailsOverlay').dataset.id;
    if(states[stateID])
      fillStateDetails(states, states[stateID], $(`#statesOverlay .roomState[data-id="${stateID}"]`));
  }
}

function fillStateDetails(states, state, dom) {
  showStatesOverlay('stateDetailsOverlay');
  $('#stateDetailsOverlay').dataset.id = state.id;
  for(const dom of $a('#stateDetailsOverlay, #stateDetailsOverlay > *'))
    dom.scrollTop = 0;

  disableEditing($('#stateDetailsOverlay'), state);
  applyValuesToDOM($('#stateDetailsOverlay'), state);

  toggleClass($('#stateDetailsOverlay .star'), 'active', state.starred);
  toggleClass($('#stateDetailsOverlay .star'), 'hidden', !state.publicLibrary);

  function fillArrowButton(arrowDom, targetDom) {
    arrowDom.style.display = targetDom ? 'block' : 'none';
    if(targetDom) {
      arrowDom.dataset.id = targetDom.dataset.id;
      $('img', arrowDom).src = $('img', targetDom).src;
      toggleClass($('img', arrowDom), 'hidden', $('img', arrowDom).src == location.href);
      $('h3', arrowDom).innerText = $('h3', targetDom).innerText;
      $('h4', arrowDom).innerText = $('h4', targetDom).innerText;
    }
    arrowDom.onclick = function() {
      showOverlay();
      targetDom.click();
    };
  }
  const visibleStates = [...$a('.roomState.visible', dom.parentElement)];
  fillArrowButton($('#nextState'), visibleStates[visibleStates.indexOf(dom)+1])
  fillArrowButton($('#prevState'), visibleStates[visibleStates.indexOf(dom)-1])

  toggleClass($('#stateDetailsOverlay > [icon=edit]'), 'hidden', state.publicLibrary && !config.allowPublicLibraryEdits);
  toggleClass($('#stateDetailsOverlay > [icon=edit_off]'), 'hidden', !state.publicLibrary || config.allowPublicLibraryEdits);

  function updateStateDetailsDomains(state) {
    $('#similarDetailsDomain').innerText = String(state.bgg).replace(/^ *https?:\/\/(www\.)?/, '').replace(/\/.*/, '');
    $('#similarRulesDomain').innerText = String(state.rules).replace(/^ *https?:\/\/(www\.)?/, '').replace(/\/.*/, '');
  }
  updateStateDetailsDomains(state);

  $('#stateDetailsOverlay .variantsList').innerHTML = '';
  for(const variantID in state.variants) {
    let variant = state.variants[variantID];
    const stateIDforLoading = variant.plStateID || state.id;
    const variantIDforLoading = variant.plVariantID || variantID;
    if(variant.plStateID)
      variant = states[variant.plStateID].variants[variant.plVariantID];
    const vEntry = domByTemplate('template-variantslist-entry', variant);
    vEntry.className = 'variant';

    toggleClass($('img', vEntry), 'hidden', !variant.variantImage && !state.image);
    $('img', vEntry).src = (variant.variantImage || state.image).replace(/^\//, '');

    $('[icon=play_arrow]', vEntry).onclick = function() {
      toServer('loadState', { stateID: stateIDforLoading, variantID: variantIDforLoading });
      $('#activeGameButton').click();
    };

    $('#stateDetailsOverlay .variantsList').appendChild(vEntry);
  }



  $('#closeDetails').onclick = function() {
    showStatesOverlay('statesOverlay');
  };
  $('#stateDetailsOverlay .star').onclick = function(e) {
    e.currentTarget.classList.toggle('active');
    $(`#statesOverlay .roomState[data-id="${state.id}"] .star`).click();
  };

  $('#stateDetailsOverlay > [icon=edit]').onclick = function() {
    enableEditing($('#stateDetailsOverlay'), state);

    for(const uploadButton of $a('#stateDetailsOverlay button[icon=image]')) {
      uploadButton.onclick = async function() {
        const img = $('img', uploadButton.parentNode.parentNode);
        $('#statesButton').dataset.overlay = 'updateImageOverlay';
        const newURL = await updateImage(uploadButton.value);
        uploadButton.value = newURL;
        toggleClass(img, 'hidden', !newURL);
        img.src = newURL ? newURL.replace(/^\//, '') : '';
        showStatesOverlay('stateDetailsOverlay');
      };
    }
  };
  $('#discardDetails').onclick = function() {
    showStatesOverlay('statesOverlay');
    dom.click();
  };
  $('#stateDetailsOverlay > [icon=save]').onclick = function() {
    const meta = JSON.parse(JSON.stringify(state));

    Object.assign(meta, getValuesFromDOM($('#stateDetailsOverlay')));

    delete meta.id;
    delete meta.starred;
    delete meta.publicLibrary;
    delete meta.publicLibraryCategory;
    for(const vID in meta.variants) {
      Object.assign(meta.variants[vID], getValuesFromDOM($a('#variantsList .variant')[vID]));
      disableEditing($a('#variantsList .variant')[vID], meta.variants[vID]);
      for(const key in meta.variants[vID])
        if([ 'players', 'language', 'variant', 'link', 'variantImage', 'plStateID', 'plVariantID' ].indexOf(key) == -1)
          delete meta.variants[vID][key];
    }

    disableEditing($('#stateDetailsOverlay'), meta);
    updateStateDetailsDomains(meta);
    toServer('editState', { id: state.id, meta });
  };
}

async function updateImage(currentImage) {
  return new Promise(function(resolve, reject) {
    showOverlay('updateImageOverlay');
    const o = $('#updateImageOverlay');

    $('img.previous', o).src = currentImage.replace(/^\//, '');
    $('img.current', o).src = currentImage.replace(/^\//, '');
    $('input.current', o).value = currentImage;

    $('button[icon=upload]', o).onclick = async function() {
      $('input', o).value = await uploadAsset();
      $('img.current', o).src = $('input', o).value.replace(/^\//, '');
    };
    $('input ', o).oninput = async function() {
      $('img.current', o).src = $('input', o).value.replace(/^\//, '');
    };

    $('button[icon=undo]', o).onclick = function() {
      showOverlay();
      resolve(currentImage);
    };
    $('button[icon=image_not_supported]', o).onclick = function() {
      showOverlay();
      resolve('');
    };
    $('button[icon=check]', o).onclick = function() {
      showOverlay();
      resolve($('input.current', o).value);
    };
  });
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

    if(variantID == variantIDjustUpdated) {
      variantIDjustUpdated = null;
      $('.update', vEntry).textContent = '✔️ Done';
      $('.update', vEntry).disabled = true;
    }
    $('.update', vEntry).addEventListener('click', e=>{
      addState(e, 'state', undefined, variantID);
      variantIDjustUpdated = variantID;
    });
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

async function shareLink() {
  showOverlay('shareLinkOverlay');
  let url = $('#stateLink').value;
  if(!url) {
    const name = $('#stateName').value.replace(/[^A-Za-z0-9.-]/g, '_');
    url = await fetch(`share/${roomID}/${$('#stateEditOverlay').dataset.id}`);
    url = `${location.origin}${await url.text()}/${name}.vtt`;
  }
  $('#sharedLink').value = url;
}

onLoad(function() {
  onMessage('meta', args=>fillStatesList(args.meta.states, args.meta.starred, args.meta.returnServer, args.activePlayers));

  on('#filterByText', 'keyup', updateLibraryFilter);
  on('#clearSearch', 'click', _=>{$('#filterByText').value='';updateLibraryFilter();$('#filterByText').focus()});
  on('#stateFilters select', 'change', updateLibraryFilter);

  on('#addState', 'click', _=>showStatesOverlay('stateAddOverlay'));

  on('#stateAddOverlay .create, #addVariant .create', 'click', e=>addState(e, 'state'));
  on('#stateAddOverlay .upload, #addVariant .upload', 'click', e=>selectFile(false, f=>addState(e, 'file', f)));
  on('#stateAddOverlay .link,   #addVariant .link',   'click', e=>addState(e, 'link', prompt('Enter shared URL:')));

  on('#addState .download', 'click', _=>downloadState(null));

  on('#stateEditOverlay .save',     'click', editState);
  on('#stateEditOverlay .download', 'click', _=>downloadState());
  on('#stateEditOverlay .remove',   'click', removeState);

  on('#stateEditOverlay .uploadAsset', 'click', _=>uploadAsset().then(function(asset) {
    if(asset)
      $('#stateImage').value = asset;
  }));
  on('#stateEditOverlay .share', 'click', _=>shareLink());

  on('#shareOK', 'click', _=>showOverlay('stateEditOverlay'));
});
