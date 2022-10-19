let waitingForStateCreation = null;
let variantIDjustUpdated = null;

function loadJSZip() {
  const node = document.createElement('script');
  node.src = 'scripts/jszip';
  $('head').appendChild(node);
}

async function waitForJSZip() {
  while(typeof JSZip == 'undefined')
    await sleep(50)
}

async function resolveStateCollections(file, callback) {
  if(file.name.match(/\.vttc$/)) {
    await waitForJSZip();
    for(const [ filename, f ] of Object.entries((await JSZip.loadAsync(file)).files))
      callback(new File([await f.async('blob')], filename));
  } else {
    callback(file);
  }
}

function selectVTTfile(callback) {
  selectFile(false, file=>resolveStateCollections(file, callback));
}

function addStateFile(f) {
  const stateDOM = domByTemplate('template-stateslist-entry');
  let id;
  do {
    id = Math.random().toString(36).substring(3, 7);
  } while($(`.roomState[data-id="${id}"]`));
  stateDOM.dataset.id = id;
  stateDOM.className = 'uploading visible roomState noImage';

  let isSave = false;
  function metaCallback(name, similarName, image, variants, savePlayers, saveDate) {
    if(image) {
      stateDOM.classList.remove('noImage');
      $('img', stateDOM).src = image;
    }

    isSave = !!savePlayers;
    fillStateTileTitles(stateDOM, name, similarName, savePlayers, saveDate)

    uploadingStates[isSave ? 0 : 1].push(stateDOM);
    insertUploadingState(stateDOM, $a('#statesList > div')[isSave ? 0 : 1]);
    updateEmptyLibraryHint();
    if($('#statesList > div:nth-of-type(1) .roomState'))
      $('#statesList > div:nth-of-type(1)').classList.remove('empty');

    stateDOM.scrollIntoView(false);
  }
  function progressCallback(percent) {
    stateDOM.style.setProperty('--progress', percent);
  }
  function doneCallback() {
    uploadingStates[isSave ? 0 : 1] = uploadingStates[isSave ? 0 : 1].filter(s=>s!=stateDOM);
    removeFromDOM(stateDOM);
  }

  uploadStateFile(f, `addState/${roomID}/${id}/file/${f.name}`, metaCallback, progressCallback, doneCallback);
}

async function uploadStateFile(sourceFile, targetURL, metaCallback, progressCallback, loadCallback) {
  await waitForJSZip();

  let zip = null;
  try {
    zip = await JSZip.loadAsync(sourceFile);
  } catch(e) {
    alert(`${sourceFile.name} is not a valid VTT, VTTC or PCIO file.`);
    return;
  }

  let json = null;
  const assets = {};
  for(const [ filename, file ] of Object.entries(zip.files)) {
    if(filename.match(/json$/)) {
      const content = JSON.parse(await file.async('string'));
      if(!json) {
        json = content;
        if(json._meta)
          json._meta.info.variants = [];
      }
      if(json._meta)
        json._meta.info.variants.push(content._meta.info);
    }
    if(filename.match(/^\/?(user)?assets/) && file._data && file._data.crc32)
      assets[file._data.crc32 + '_' + file._data.uncompressedSize] = filename;
  }

  if(json === null) {
    alert(`${sourceFile.name} is not a valid VTT, VTTC or PCIO file.`);
    return;
  } else if(Array.isArray(json)) {
    metaCallback(sourceFile.name.replace(/\.[^.]+$/, ''), '', null, [{}], null, null);
  } else {
    const image = await zip.file(json._meta.info.image.substr(1)).async('base64');
    let imageURL = null;
    for(const [ type, pattern ] of Object.entries({ jpeg: '^\\/9j\\/', png: '^iVBO', 'svg+xml': '^PHN2', gif: '^R0lG', webp: '^UklG' }))
      if(image.match(pattern))
        imageURL = `data:image/${type};base64,${image}`;

    metaCallback(json._meta.info.name, json._meta.info.similarName, imageURL, json._meta.info.variants, json._meta.info.savePlayers, json._meta.info.saveDate);
  }

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

  let blob = sourceFile;
  if(removed > total/2) {
    zip.file('asset-map.json', JSON.stringify(assets));
    console.log(`Uploading ${sourceFile.name}: rebuilding zip file because ${removed}/${total} assets are already on the server.`);
    blob = await zip.generateAsync({ type: 'blob', compression: total-removed < 5 ? 'DEFLATE' : 'STORE' });
  }

  var req = new XMLHttpRequest();
  req.onload = function(e) {
    if(e.target.status != 200)
      alert(`${e.target.status}: ${e.target.response}`);
    loadCallback();
  };
  req.upload.onprogress = e=>progressCallback(e.loaded/e.total);

  req.open('PUT', targetURL, true);
  req.setRequestHeader('Content-type', 'application/octet-stream');
  req.send(blob);
}

function insertUploadingState(uploadingState, category) {
  const title = $('h3', uploadingState).textContent;
  if(!$(`.list [data-id="${uploadingState.dataset.id}"]`, category)) {
    let found = false;
    for(const existingState of $a('.roomState', category)) {
      if(title.localeCompare($('h3', existingState).textContent) < 0) {
        $('.list', category).insertBefore(uploadingState, existingState);
        found = true;
        break;
      }
    }
    if(!found)
      $('.list', category).appendChild(uploadingState);
  }
}

async function addState(e, type, src, id, addAsVariant) {
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

  const blob = new Blob([ src ], { type: 'text/plain' });

  let url = `addState/${roomID}/${id}/${type}/${src && src.name && encodeURIComponent(src.name)}/`;
  if(addAsVariant)
    url += addAsVariant;
  waitingForStateCreation = addAsVariant || id;

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

async function saveState() {
  $('#stateSaveOverlay input').value = [...new Set(widgetFilter(w=>w.get('type')=='seat'&&w.get('player')).map(w=>w.get('player')))].sort().join(', ');
  if(!$('#stateSaveOverlay input').value)
    $('#stateSaveOverlay input').value = activePlayers.sort().join(', ');
  showStatesOverlay('stateSaveOverlay');

  $('#stateSaveOverlay [icon=save]').onclick = function() {
    toServer('saveState', $('#stateSaveOverlay input').value);
    showStatesOverlay('statesOverlay');
  };
  $('#stateSaveOverlay [icon=undo]').onclick = _=>showStatesOverlay('statesOverlay');
}

function updateEmptyLibraryHint() {
  $('#emptyLibrary').style.display = $('#statesList > div:nth-of-type(2) .roomState') ? 'none' : 'block';
}

function toggleStateStar(state, dom) {
  const targetList = dom.parentElement.parentElement == $('#statesList > div:nth-of-type(2)')
                   ? $('#statesList > div:nth-of-type(3) > .list')
                   : $('#statesList > div:nth-of-type(2) > .list');
  targetList.insertBefore(dom, [...targetList.children].filter(d=>$('h3', d).innerText.localeCompare($('h3', dom).innerText) > 0)[0]);
  updateEmptyLibraryHint();
  toServer('toggleStateStar', state.publicLibrary);
}

function updateLibraryFilter() {
  const text = regexEscape($('#filterByText').value.toLowerCase());
  const type = $('#filterByType').value;
  const players = $('#filterByPlayers').value;
  const duration = $('#filterByDuration').value.split('-');
  const language = $('#filterByLanguage').value;
  const mode = $('#filterByMode').value;
  for(const state of $a('#statesList .list > div')) {
    if(state.classList.contains('uploading'))
      continue;
    const textMatch     = state.dataset.text.match(text);
    const typeMatch     = type     == 'Any' || state.dataset.type.split(/[,;] */).indexOf(type) != -1;
    const playersMatch  = players  == 'Any' || state.dataset.players.split(/[,;] */).indexOf(players) != -1;
    const durationMatch = duration == 'Any' || state.dataset.duration >= duration[0] && state.dataset.duration <= duration[1];
    const languageMatch = language == 'Any' || state.dataset.languages.split(/[,;] */).indexOf(language) != -1;
    const modeMatch     = mode     == 'Any' || state.dataset.modes.split(/[,;] */).indexOf(mode) != -1;
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

let loadedFromURLproperties = false;
function loadGameFromURLproperties(states) {
  if(widgets.size || !urlProperties.load)
    return;

  const match = String(urlProperties.load).match(`^${regexEscape(config.externalURL)}/library/(.*?)(#VTT/([0-9]+)(\\.json)?)?`+String.fromCharCode(36));
  if(match) {
    let targetStateID = 'PL:games:' + match[1].substr(0, match[1].length-4);
    if(match[1].match(/^Tutorial%20-%20/))
      targetStateID = 'PL:tutorials:'+match[1].substr(15, match[1].length-19);
    else if(match[1].match(/^Assets%20-%20/))
      targetStateID = 'PL:assets:'+match[1].substr(13, match[1].length-17);

    if(states[targetStateID])
      toServer('loadState', { stateID: targetStateID, variantID: match[3] || 0 });
    else
      console.error(`Tried to load library game from a legacy URL but could not find ID ${targetStateID}.`);
  } else if(urlProperties.load && !loadedFromURLproperties) {
    addState(null, 'link', urlProperties.load);
    loadedFromURLproperties = true;
  } else if(urlProperties.load) {
    const urlMatch = String(urlProperties.load).match(`^(.*?)(#VTT/([0-9]+)(\\.json)?)?`+String.fromCharCode(36))
    const foundStates = (Object.values(states).filter(s=>s.link && s.link.match(`^${regexEscape(urlMatch[1])}`)));
    if(foundStates.length) {
      toServer('loadState', { stateID: foundStates[0].id, variantID: urlMatch[3] || 0 });
      delete urlProperties.load;
    }
  }
}

function fillStateTileTitles(dom, name, similarName, savePlayers, saveDate) {
  $('h3', dom).textContent = name;
  if(savePlayers) {
    const date = new Date(saveDate);
    $('.linked', dom).textContent = 'save';
    $('h4', dom).textContent = `${savePlayers}`;
    $('h4', dom).innerHTML += `<br><br>`;
    $('h4', dom).append(`${date.toLocaleString("en-US", { month: "long" })} ${date.getDate()}, ${date.getFullYear()}`);
  } else {
    $('h4', dom).textContent = similarName && name != similarName ? `Similar to ${similarName}` : '';
  }
}

let uploadingStates = [[],[]];
function fillStatesList(states, starred, activeState, returnServer, activePlayers) {
  if(returnServer) {
    $('#statesButton').dataset.overlay = 'returnOverlay';
    overlayShownForEmptyRoom = true;
    return;
  }

  const emptyLibrary = $('#emptyLibrary');
  const buttons = $('#statesOverlay .buttons');
  $('#saveState').style.display = 'none';
  removeFromDOM('#statesList > div');

  let isEmpty = true;

  const languageOptions = {};
  const modeOptions = {};

  const publicLibraryLinksFound = {};

  const categories = {
    'In-Progress Games': domByTemplate('template-stateslist-category'),
    'Game Shelf': domByTemplate('template-stateslist-category'),
    'Public Library': domByTemplate('template-stateslist-category')
  };

  for(const kvp of Object.entries(states).sort((a, b) => a[1].name.localeCompare(b[1].name))) {
    const state = kvp[1];
    state.id = kvp[0];
    state.starred = starred && starred[state.publicLibrary];

    let target = 'Game Shelf';
    if(state.savePlayers)
      target = 'In-Progress Games';
    else if(!!kvp[1].publicLibrary && (!starred || !starred[kvp[1].publicLibrary]))
      target = 'Public Library';
    const category = categories[target];

    isEmpty = false;

    const entry = domByTemplate('template-stateslist-entry');
    entry.dataset.id = state.id;
    entry.className = state.image ? 'roomState' : 'roomState noImage';
    if(state.publicLibrary)
      entry.className += ' publicLibraryGame';
    if(state.publicLibrary && state.publicLibrary.match(/tutorial/))
      entry.className += ' publicLibraryTutorial';
    if(state.link)
      entry.className += ' linkedGame';
    if(state.savePlayers)
      entry.className += ' savedGame';
    if(activeState && activeState.stateID == state.id) {
      entry.className += ' activeGame';
      $('#saveState', buttons).style.display = 'inline-flex';
    }

    $('img', entry).src = state.image.replace(/^\//, '');

    fillStateTileTitles(entry, state.name, state.similarName, state.savePlayers, state.saveDate);

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
      for(const lang of variant.language.split(/[,;] */))
        languageOptions[lang] = true;
    }

    for(const mode of state.mode.split(/[,;] */))
      modeOptions[mode] = true;

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
      if($('#statesButton').dataset.overlay !== 'statesOverlay')
        showStatesOverlay('statesOverlay');
      if(state.name == 'Unnamed' && !state.link && !state.savePlayers) {
        fillStateDetails(states, state, entry);
        $('#stateDetailsOverlay .buttons [icon=edit]').click();
      }
    }
  }

  for(const [ categoryIndex, categoryUploadingStates ] of Object.entries(uploadingStates))
    for(const uploadingState of categoryUploadingStates)
      insertUploadingState(uploadingState, Object.values(categories)[categoryIndex]);

  for(const [ title, category ] of Object.entries(categories)) {
    $('.title', category).textContent = title;
    $('#statesList').appendChild(category);
  }

  if(!$('.roomState', categories['In-Progress Games']))
    categories['In-Progress Games'].classList.add('empty');

  categories['Game Shelf'].insertBefore(emptyLibrary, $('h2', categories['Game Shelf']).nextSibling);
  categories['Game Shelf'].insertBefore(buttons, $('h2', categories['Game Shelf']).nextSibling);
  updateEmptyLibraryHint();

  const previousLanguage = $('#filterByLanguage').value;
  let languageHTML = '<option>Any</option>';
  for(const languageOption of Object.keys(languageOptions).sort())
    languageHTML += `<option ${previousLanguage && previousLanguage == languageOption ? 'selected' : ''} value="${languageOption}">${languageOption.replace(/^$/, 'None')}</option>`;
  $('#filterByLanguage').innerHTML = languageHTML;

  const previousMode = $('#filterByMode').value;
  let modeHTML = '<option>Any</option>';
  for(const modeOption of Object.keys(modeOptions).sort((a, b) => a.localeCompare(b)))
    modeHTML += `<option ${previousMode && previousMode == modeOption ? 'selected' : ''}>${modeOption}</option>`;
  $('#filterByMode').innerHTML = modeHTML;

  updateLibraryFilter();

  if($('#stateDetailsOverlay').style.display != 'none') {
    const stateID = $('#stateDetailsOverlay').dataset.id;
    if(!states[stateID]) {
      showStatesOverlay('statesOverlay');
    } else if(!$('#stateDetailsOverlay').classList.contains('editing')) {
      showOverlay();
      fillStateDetails(states, states[stateID], $(`#statesOverlay .roomState[data-id="${stateID}"]`));
    }
  }

  $('#stateAddOverlay .upload').onclick = function() {
    loadJSZip();
    showStatesOverlay('statesOverlay');
    selectVTTfile(addStateFile);
  };

  loadGameFromURLproperties(states);
}

function fillStateDetails(states, state, dom) {
  showStatesOverlay('stateDetailsOverlay');
  $('#stateDetailsOverlay').dataset.id = state.id;
  for(const dom of $a('#stateDetailsOverlay, #stateDetailsOverlay > *'))
    dom.scrollTop = 0;

  disableEditing($('#stateDetailsOverlay'), state);
  applyValuesToDOM($('#stateDetailsOverlay'), state);

  toggleClass($('#stateDetailsOverlay .star'),         'active', !!state.starred);
  toggleClass($('#stateDetailsOverlay .star'),         'hidden', !state.publicLibrary);
  toggleClass($('#mainImage > i'),                     'hidden', !state.link);
  toggleClass($('#stateDetailsOverlay [icon=upload]'), 'hidden', state.publicLibrary || !config.allowPublicLibraryEdits);

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

  const deletable = !state.publicLibrary || config.allowPublicLibraryEdits;
  const editable  = !state.link && !state.savePlayers && deletable;
  toggleClass($('#stateDetailsOverlay .buttons [icon=edit]'), 'hidden', !editable);
  toggleClass($('#stateDetailsOverlay .buttons [icon=delete]'), 'hidden', !deletable);
  toggleClass($('#stateDetailsOverlay .buttons [icon=edit_off]'), 'hidden', editable || deletable);
  toggleClass($('#stateDetailsOverlay .buttons [icon=link]'), 'hidden', state.savePlayers);

  function updateStateDetailsDomains(state) {
    $('#similarDetailsDomain').innerText = String(state.bgg).replace(/^ *https?:\/\/(www\.)?/, '').replace(/\/.*/, '');
    $('#similarRulesDomain').innerText = String(state.rules).replace(/^ *https?:\/\/(www\.)?/, '').replace(/\/.*/, '');
    $('.hideForEdit [data-field=similarAwards]').innerText = String(state.similarAwards);
  }
  updateStateDetailsDomains(state);

  const variantOperationQueue = [];

  const createTempState = async function(e, operation, variantID, buttons) {
    const previousText = e.target.innerText;
    e.target.innerText = 'Copying active game...';
    for(const button of buttons)
      button.disabled = true;
    variantOperationQueue.push({
      operation,
      variantID,
      filenameSuffix: await (await fetch(`createTempState/${roomID}`)).text()
    });
    for(const button of buttons)
      button.disabled = false;
    e.target.innerText = previousText;
  }

  const addVariant = function(variantID, variant) {
    const stateIDforLoading = variant.plStateID || state.id;
    const variantIDforLoading = variant.plVariantID || variantID;
    const isLinkedVariant = !!variant.plStateID;
    if(variant.plStateID)
      variant = states[variant.plStateID].variants[variant.plVariantID];

    if(!variant.variantImage)
      variant.variantImage = state.image;

    const vEntry = domByTemplate('template-variantslist-entry', variant);
    vEntry.className = isLinkedVariant ? 'linked variant' : 'variant';

    if(isLinkedVariant)
      for(const dom of $a('[data-field]', vEntry))
        dom.classList.add('uneditable');

    toggleClass($('img', vEntry), 'hidden', !variant.variantImage);
    $('img', vEntry).src = String(variant.variantImage).replace(/^\//, '');

    $('[icon=play_arrow]', vEntry).onclick = function() {
      toServer('loadState', { stateID: stateIDforLoading, variantID: variantIDforLoading });
      $('#activeGameButton').click();
    };

    $('[icon=edit]',  vEntry).onclick = function(e) {
      for(const variantDOM of $a('#stateDetailsOverlay .variantsList .variant'))
        toggleClass(variantDOM, 'editingVariant', e.target == $('[icon=edit]', variantDOM) && !variantDOM.classList.contains('editingVariant'));
    };

    $('[icon=save]', vEntry).onclick = function(e) {
      createTempState(e, 'save', [...$a('#stateDetailsOverlay .variant')].indexOf(vEntry), $a('button', vEntry));
    };
    $('[icon=north]', vEntry).onclick = function() {
      variantOperationQueue.push({
        operation: 'up',
        variantID: [...$a('#stateDetailsOverlay .variant')].indexOf(vEntry)
      });
      vEntry.parentNode.insertBefore(vEntry, vEntry.previousSibling);
    };
    $('[icon=south]', vEntry).onclick = function() {
      variantOperationQueue.push({
        operation: 'down',
        variantID: [...$a('#stateDetailsOverlay .variant')].indexOf(vEntry)
      });
      if(vEntry.nextSibling)
        vEntry.nextSibling.after(vEntry);
      else
        vEntry.parentNode.prepend(vEntry);
    };
    $('[icon=delete]', vEntry).onclick = function() {
      variantOperationQueue.push({
        operation: 'delete',
        variantID: [...$a('#stateDetailsOverlay .variant')].indexOf(vEntry)
      });
      removeFromDOM(vEntry);
    };

    $('#stateDetailsOverlay .variantsList').appendChild(vEntry);
    return vEntry;
  }

  $('#stateDetailsOverlay .variantsList').innerHTML = '';
  for(const variantID in state.variants)
    addVariant(variantID, state.variants[variantID]);



  $('#variantsList > [icon=add]').onclick = function() {
    showStatesOverlay('variantAddOverlay');
    $('#variantAddOverlay select').innerHTML = '';
    for(const [ id, state ] of Object.entries(states)) {
      if(state.publicLibrary) {
        for(const [ variantID, variant ] of Object.entries(state.variants)) {
          const option = document.createElement('option');
          option.value = `${id}/${variantID}`;
          option.innerText = `${state.name} - ${variant.players} - ${variant.language} - ${variant.variant}`;
          $('#variantAddOverlay select').appendChild(option);
        }
      }
    }
  };
  $('#variantAddOverlay [icon=save]').onclick = async function(e) {
    const variantID = $a('#stateDetailsOverlay .variant').length;
    await createTempState(e, 'create', variantID, $a('#variantAddOverlay button'));
    showStatesOverlay('stateDetailsOverlay');
    const emptyVariant = { variantImage: state.image };
    const vEntry = addVariant(variantID, emptyVariant);
    enableEditing(vEntry, emptyVariant);
  };
  $('#variantAddOverlay [icon=upload]').onclick = function(e) {
    loadJSZip();
    selectVTTfile(function(f) {
      $('#stateDetailsOverlay').classList.add('uploading');

      const variantDOM = [];
      const filenameSuffix = Math.random().toString(36).substring(3, 11);

      function metaCallback(name, similarName, image, variants) {
        variantOperationQueue.push({
          operation: 'create',
          filenameSuffix
        });
        for(const variant of variants) {
          const vEntry = addVariant($a('#stateDetailsOverlay .variant').length, variant);
          vEntry.classList.add('uploading');
          enableEditing(vEntry, variant);
          variantDOM.push(vEntry);
        }
      }
      function progressCallback(percent) {
        for(const d of variantDOM)
          d.style.setProperty('--progress', percent);
      }
      function doneCallback() {
        for(const d of variantDOM)
          d.classList.remove('uploading');
        if(!$('#stateDetailsOverlay .uploading.variant'))
          $('#stateDetailsOverlay').classList.remove('uploading');
      }

      uploadStateFile(f, `createTempState/${roomID}/${filenameSuffix}`, metaCallback, progressCallback, doneCallback);
    });
    showStatesOverlay('stateDetailsOverlay');
  };
  $('#variantAddOverlay [icon=link]').onclick = function(e) {
    showStatesOverlay('stateDetailsOverlay');
    const tokens = $('#variantAddOverlay select').value.split('/');
    const newVariant = { plStateID: tokens[0], plVariantID: tokens[1] };
    const vEntry = addVariant($a('#stateDetailsOverlay .variant').length, newVariant);
    enableEditing(vEntry, newVariant);
    variantOperationQueue.push({
      operation: 'newLink',
      variant: newVariant
    });
  };

  $('#closeDetails').onclick = function() {
    showStatesOverlay('statesOverlay');
  };
  $('#stateDetailsOverlay .buttons [icon=menu]').onclick = function(e) {
    $('#stateDetailsOverlay .buttons > div').classList.toggle('hidden');
    e.stopPropagation();
    document.addEventListener('click', e=>$('#stateDetailsOverlay .buttons > div').classList.add('hidden'));
  };
  $('#stateDetailsOverlay .buttons [icon=download]').onclick = function() {
    window.open(`dl/${roomID}/${state.id}`);
  };
  $('#stateDetailsOverlay .buttons [icon=link]').onclick = function() {
    shareLink(state);
  };
  $('#shareOK').onclick = _=>showStatesOverlay('stateDetailsOverlay');
  $('#stateDetailsOverlay .buttons [icon=delete]').onclick = async function() {
    $('#statesButton').dataset.overlay = 'confirmOverlay';
    if(await confirmOverlay('Delete game', 'Are you sure you want to completely remove this game from your game shelf?', 'Delete', 'Keep')) {
      toServer('removeState', state.id);
      removeFromDOM(dom);
      updateEmptyLibraryHint();
      if(!$('#statesList > div:nth-of-type(1) .roomState'))
        $('#statesList > div:nth-of-type(1)').classList.add('empty');
      showStatesOverlay('statesOverlay');
    } else {
      showStatesOverlay('stateDetailsOverlay');
    }
  };
  $('#stateDetailsOverlay .buttons [icon=upload]').onclick = function() {
    $('#statesButton').dataset.overlay = 'confirmOverlay';
    toServer('addStateToPublicLibrary', state.id);
  };

  $('#stateDetailsOverlay .star').onclick = function(e) {
    e.currentTarget.classList.toggle('active');
    $(`#statesOverlay .roomState[data-id="${state.id}"] .star`).click();
  };

  $('#stateDetailsOverlay .buttons [icon=edit]').onclick = function() {
    enableEditing($('#stateDetailsOverlay'), state);

    for(const uploadButton of $a('#stateDetailsOverlay button[icon=image]')) {
      uploadButton.onclick = async function() {
        const isVariantImage = uploadButton.parentNode.classList.contains('variantEdit');
        const img = $('img', uploadButton.parentNode.parentNode);
        $('#statesButton').dataset.overlay = 'updateImageOverlay';
        let newURL = await updateImage(uploadButton.value, isVariantImage ? 'Use state image' : null);
        if(!newURL && isVariantImage)
          newURL = state.image;
        uploadButton.value = newURL;
        toggleClass(img, 'hidden', !newURL);
        img.src = newURL ? newURL.replace(/^\//, '') : '';
        showStatesOverlay('stateDetailsOverlay');
      };
    }
  };
  $('#discardDetails').onclick = async function() {
    $('#statesButton').dataset.overlay = 'confirmOverlay';
    if(await confirmOverlay('Discard changes', 'Are you sure you want to discard any changes you made to this game?', 'Discard', 'Keep')) {
      showStatesOverlay('statesOverlay');
      dom.click();
    } else {
      showStatesOverlay('stateDetailsOverlay');
    }
  };
  $('#stateDetailsOverlay .buttons [icon=save]').onclick = function() {
    const meta = Object.assign(JSON.parse(JSON.stringify(state)), getValuesFromDOM($('#stateDetailsOverlay')));

    const variantInput = [];
    for(const variantDOM of $a('#variantsList .variant')) {
      const input = getValuesFromDOM(variantDOM);
      if(input.variantImage == meta.image)
        input.variantImage = '';
      variantInput.push(input);
      disableEditing(variantDOM, input);
    }

    disableEditing($('#stateDetailsOverlay'), meta);
    updateStateDetailsDomains(meta);

    toServer('editState', {
      id: meta.id,
      meta,
      variantInput,
      variantOperationQueue
    });
  };
}

async function updateImage(currentImage, noImageText) {
  return new Promise(function(resolve, reject) {
    showOverlay('updateImageOverlay');
    const o = $('#updateImageOverlay');

    $('img.previous', o).src = currentImage.replace(/^\//, '');
    $('img.current', o).src = currentImage.replace(/^\//, '');
    $('input.current', o).value = currentImage;

    $('button[icon=image_not_supported]', o).innerText = noImageText || 'Use no image';

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

async function confirmOverlay(title, text, confirmButton, cancelButton) {
  return new Promise(function(resolve, reject) {
    showOverlay('confirmOverlay');
    applyValuesToDOM($('#confirmOverlay'), { title, text, confirmButton, cancelButton });

    $('#confirmOverlay button:nth-of-type(1)').onclick = function() {
      showOverlay();
      resolve(false);
    };
    $('#confirmOverlay button:nth-of-type(2)').onclick = function() {
      showOverlay();
      resolve(true);
    };
  });
}

async function shareLink(state) {
  showOverlay('shareLinkOverlay');
  let url = state.link;
  if(!url) {
    const name = state.name.replace(/[^A-Za-z0-9.-]/g, '_');
    url = await fetch(`share/${roomID}/${state.id}`);
    url = `${location.origin}${await url.text()}/${name}.vtt`;
  }
  $('#sharedLink').value = url;
}

onLoad(function() {
  onMessage('meta', args=>fillStatesList(args.meta.states, args.meta.starred, args.meta.activeState, args.meta.returnServer, args.activePlayers));

  on('#filterByText', 'keyup', updateLibraryFilter);
  on('#clearSearch', 'click', _=>{$('#filterByText').value='';updateLibraryFilter();$('#filterByText').focus()});
  on('#stateFilters select', 'change', updateLibraryFilter);

  on('#addState', 'click', _=>showStatesOverlay('stateAddOverlay'));
  on('#saveState', 'click', saveState);

  on('#stateAddOverlay .create', 'click', e=>addState(e, 'state'));
  on('#stateAddOverlay .link',   'click', e=>addState(e, 'link', prompt('Enter shared URL:')));

  document.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    $('#statesButton').click();
  });
  document.addEventListener('drop', function(e) {
    e.preventDefault();
    loadJSZip();
    for(const file of e.dataTransfer.files)
      resolveStateCollections(file, addStateFile);
  });
});
