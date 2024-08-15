let currentMetaData = null;

let waitingForStateCreation = null;
let variantIDjustUpdated = null;

let detailsInSidebar = false;
let detailsOverlay = 'stateDetailsOverlay';

const stateFilterSpans = $a('#stateFilters > span');

const loadedLibraryImages = {};

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
    id = rand().toString(36).substring(3, 7);
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
    fillStateTileTitles(stateDOM, name, similarName, savePlayers, saveDate);
    $('i', stateDOM).textContent = 'upload';

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
    alert(`${sourceFile.name} is not a valid VTT, VTTC, VTTS or PCIO file.`);
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
    alert(`${sourceFile.name} is not a valid VTT, VTTC, VTTS or PCIO file.`);
    return;
  } else if(Array.isArray(json)) {
    metaCallback(sourceFile.name.replace(/\.[^.]+$/, ''), '', null, [{}], null, null);
  } else {
    let imageURL = null;

    if(json._meta.info.image) {
      if(json._meta.info.image.match(/^http/)) {
        imageURL = json._meta.info.image;
      } else if(zip.files[json._meta.info.image.substr(1)]) {
        const image = await zip.file(json._meta.info.image.substr(1)).async('base64');
        for(const [ type, pattern ] of Object.entries({ jpeg: '^\\/9j\\/', png: '^iVBO', 'svg+xml': '^PHN2', gif: '^R0lG', webp: '^UklG' }))
          if(image.match(pattern))
            imageURL = `data:image/${type};base64,${image}`;
      }
    }

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
    id = rand().toString(36).substring(3, 7);

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

async function saveState(e) {
  if(e.target == $('#updateSaveState'))
    return toServer('saveState', { players: $('#stateSaveOverlay input').value, updateCurrentSave: true });

  $('#stateSaveOverlay input').value = [...new Set(widgetFilter(w=>w.get('type')=='seat'&&w.get('player')).map(w=>w.get('player')))].sort().join(', ');
  if(!$('#stateSaveOverlay input').value)
    $('#stateSaveOverlay input').value = activePlayers.sort().join(', ');
  showStatesOverlay('stateSaveOverlay');

  $('#stateSaveOverlay button[icon=save]').onclick = function() {
    if($('#stateSaveOverlay input').value) {
      toServer('saveState', { players: $('#stateSaveOverlay input').value });
      showStatesOverlay('statesOverlay');
    } else {
      alert('Please enter active players or a different identifier.');
    }
  };
  $('#stateSaveOverlay [icon=undo]').onclick = $('#stateSaveOverlay [icon=close]').onclick = _=>showStatesOverlay('statesOverlay');

  $('#stateSaveOverlay input').onkeyup = function(e) {
    if(e.key == 'Enter')
      $('#stateSaveOverlay button[icon=save]').click();
  };
}

function updateEmptyLibraryHint() {
  const isEmpty = !$('#statesList > div:nth-of-type(2) .roomState');
  $('#emptyLibrary').style.display = isEmpty ? 'block' : 'none';
  $('#emptyLibraryByFilter').style.display = $('#statesList > div:nth-of-type(2) .visible.roomState') || isEmpty ? 'none' : 'block';
}

function toggleStateStar(state, dom) {
  const targetList = dom.parentElement.parentElement == $('#statesList > div:nth-of-type(2)')
                   ? $('#statesList > div:nth-of-type(3) > .list')
                   : $('#statesList > div:nth-of-type(2) > .list');
  const states = [...targetList.children].concat(dom);
  states.sort((a,b)=>sortStatesCallback(a.dataset,b.dataset));
  targetList.insertBefore(dom, states[states.indexOf(dom)+1]);
  updateEmptyLibraryHint();
  toServer('toggleStateStar', state.publicLibrary);
}

function updateLibraryFilter() {
  const states = [...$a('#statesList .list > div')].map(d=>[ d, d.dataset ]);
  const activeFilters = {
    text:     regexEscape($('#filterByText').value.toLowerCase()),
    type:     $('#filterByType').value,
    players:  $('#filterByPlayers').value,
    duration: $('#filterByDuration').value,
    language: $('#filterByLanguage').value,
    mode:     $('#filterByMode').value
  };

  function applyFilters(filters, callback) {
    for(const [ dom, dataset ] of states) {
      if(dom.classList.contains('uploading')) {
        callback(dom, true);
      } else {
        const textMatch     = dataset.text.match(filters.text);
        const typeMatch     = filters.type     == 'Any' || dataset.type.split(/[,;] */).indexOf(filters.type) != -1;
        const playersMatch  = filters.players  == 'Any' || dataset.players.split(/[,;] */).indexOf(filters.players) != -1;
        const durationMatch = filters.duration == 'Any' || dataset.duration >= filters.duration.split('-')[0] && dataset.duration <= filters.duration.split('-')[1];
        const languageMatch = filters.language == 'Any' || dataset.languages.split(/[,;] */).indexOf(filters.language.replace(/ \+ None/, '')) != -1 || filters.language.match(/None$/) && dataset.languages.split(/[,;] */).indexOf('') != -1;
        const modeMatch     = filters.mode     == 'Any' || dataset.modes.split(/[,;] */).indexOf(filters.mode) != -1;
        callback(dom, textMatch && typeMatch && playersMatch && durationMatch && languageMatch && modeMatch);
      }
    }
  }

  applyFilters(activeFilters, (dom,match)=>toggleClass(dom, 'visible', match));

  for(const select of $a('#stateFilters select')) {
    for(const option of $a('option', select)) {
      const filterOverride = {};
      filterOverride[select.id.substr(8).toLowerCase()] = option.value;
      let foundState = false;
      applyFilters(Object.assign({...activeFilters}, filterOverride), (dom,match)=>foundState|=match);
      toggleClass(option, 'noMatch', !foundState);
    }
  }

  updateEmptyLibraryHint();
  if(sortBy != $('#librarySort').value) {
    sortBy = $('#librarySort').value;
    resortStatesList();
  }
}

function parsePlayers(players) {
  const validPlayers = [];
  for(const token of String(players||'').split(',')) {
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

  const match = String(urlProperties.load).match(`^${regexEscape(config.externalURL)}/library/(.*?)(#VTT/([0-9]+)(\\.json)?)?$`);
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
    const urlMatch = String(urlProperties.load).match(`^(.*?)(#VTT/([0-9]+)(\\.json)?)?$`)
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
  emojis2images(dom);
}

let sortBy = $('#librarySort').value;
function sortStatesCallback(stateA, stateB) {
  if(sortBy == 'year' && stateB.year != stateA.year)
    return stateB.year - stateA.year;
  if(sortBy == 'lastUpdate' && (stateB.saveDate || stateB.lastUpdate) != (stateA.saveDate || stateA.lastUpdate))
    return (stateB.saveDate || stateB.lastUpdate || 0) - (stateA.saveDate || stateA.lastUpdate || 0);
  if(sortBy == 'stars' && stateB.stars != stateA.stars)
    return stateB.stars - stateA.stars;
  if(sortBy == 'timePlayed' && stateB.timePlayed != stateA.timePlayed)
    return stateB.timePlayed - stateA.timePlayed;
  if(sortBy == 'similarName' && stateB.similarName != stateA.similarName)
    return String(stateA.similarName||stateA.name).localeCompare(String(stateB.similarName||stateB.name));
  return String(stateA.name).localeCompare(String(stateB.name));
}
function resortStatesList() {
  for(const list of $a('#statesList .list')) {
    const states = [...$a('.roomState', list)].map(d=>[ d, d.dataset ]).sort((a, b) => sortStatesCallback(a[1], b[1]));
    for(const [ stateDOM, stateData ] of states)
      list.appendChild(stateDOM);
  }
}

function updateFilterOverflow() {
  $('#filterOverflow').classList.add('empty');
  for(const span of stateFilterSpans)
    if($('#filterByTextWrapper') != span)
      $('#stateFilters').insertBefore(span, $('#filterOverflow'));
  for(const span of [...stateFilterSpans].sort((a,b)=>b.dataset.priority-a.dataset.priority)) {
    if($('#filterByTextWrapper') != span && $('#filterByTextWrapper').clientWidth < 200) {
      $('#filterOverflow > div').insertBefore(span, $('#filterOverflow > div').firstChild);
      $('#filterOverflow').classList.remove('empty');
    }
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
  const emptyLibraryByFilter = $('#emptyLibraryByFilter');
  const saveButton = $('#saveState');
  const updateSaveButton = $('#updateSaveState');
  const addButton = $('#addState');
  $('#saveState').style.display = $('#updateSaveState').style.display = 'none';
  removeFromDOM('#statesList > div');

  let isEmpty = true;

  const languageOptions = {};
  const modeOptions = {};

  const publicLibraryLinksFound = {};
  for(const state of Object.values(states)) {
    state.starred = starred && starred[state.publicLibrary];
    state.stars = state.stars || 0;
    for(const variant of state.variants)
      if(variant.plStateID)
        publicLibraryLinksFound[`${variant.plStateID} - ${variant.plVariantID}`] = true;
  }

  const categories = {
    'In-Progress Games': domByTemplate('template-stateslist-category'),
    'Game Shelf': domByTemplate('template-stateslist-category'),
    'Public Library': domByTemplate('template-stateslist-category')
  };

  for(const kvp of Object.entries(states).sort((a, b) => sortStatesCallback(a[1], b[1])).sort((a, b) => (!!a[1].publicLibrary && !a[1].starred) - (!!b[1].publicLibrary && !b[1].starred))) {
    const state = kvp[1];
    state.id = kvp[0];

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
    if(state.showName === false)
      entry.className += ' hideName';
    if(state.link)
      entry.className += ' linkedGame';
    if(state.savePlayers)
      entry.className += ' savedGame';
    if(activeState && (activeState.stateID == state.id || activeState.saveStateID == state.id || activeState.linkStateID == state.id)) {
      entry.className += ' activeGame';
      saveButton.style.display = 'inline-flex';
      if(activeState.saveStateID && states[activeState.saveStateID] && states[activeState.saveStateID].savePlayers)
        updateSaveButton.style.display = 'inline-flex';
    }

    fillStateTileTitles(entry, state.name, state.similarName, state.savePlayers, state.saveDate);

    if(state.image) {
      const mappedURL = mapAssetURLs(state.image);
      if(loadedLibraryImages[mappedURL]) {
        $('img:not(.emoji)', entry).dataset.src = $('img:not(.emoji)', entry).src = mappedURL;
      } else {
        $('img:not(.emoji)', entry).dataset.src = mappedURL;
        lazyImageObserver.observe($('img:not(.emoji)', entry));
      }
    }

    const validPlayers = [];
    const validLanguages = [];
    let hasVariants = false;
    for(const variantID in state.variants) {
      let variant = state.variants[variantID];
      if(variant.plStateID)
        variant = states[variant.plStateID].variants[variant.plVariantID];

      if(!publicLibraryLinksFound[`${state.id} - ${variantID}`] || state.starred)
        hasVariants = true;

      validPlayers.push(...parsePlayers(variant.players));
      validLanguages.push(variant.language);
      for(const lang of String(variant.language||'').split(/[,;] */)) {
        languageOptions[lang] = true;
        if(lang && !lang.match(/^en/))
          languageOptions[`${lang} + None`] = true;
      }
    }

    for(const mode of String(state.mode).split(/[,;] */))
      modeOptions[mode] = true;

    if(hasVariants) {
      entry.addEventListener('click', async function(e) {
        let loadGame = $('#stateDetailsOverlay.notEditing');
        if(!loadGame) {
          loadGame = await confirmOverlay('Discard changes', `Are you sure you want to discard any changes you made to ${$('#mainDetails h1').innerText}?`, 'Discard', 'Keep', 'delete', 'undo', 'red');
          if(loadGame)
            disableEditing($('#stateDetailsOverlay'), state);
          showStatesOverlay('statesOverlay');
        }
        if(loadGame)
          fillStateDetails(states, state, entry);
      });
      $('.star', entry).addEventListener('click', function(e) {
        e.target.disabled = true;
        entry.dataset.stars = +entry.dataset.stars + (state.starred ? -1 : 1);
        if($('#stateDetailsOverlay').dataset.id == state.id) {
          $('#stateDetailsOverlay [data-field=stars]').innerText = +entry.dataset.stars || '';
          toggleClass($('#stateDetailsOverlay .star'), 'active', !state.starred);
        }
        toggleStateStar(state, entry);
        event.stopPropagation();
      });
      $('.list', category).appendChild(entry);
    }

    entry.dataset.name = state.name;
    entry.dataset.similarName = state.similarName;
    entry.dataset.year = state.year;
    entry.dataset.stars = state.stars;
    entry.dataset.timePlayed = state.timePlayed;
    entry.dataset.text = `${state.name} ${state.similarName} ${state.description} ${state.similarDesigner} ${state.similarAwards} ${state.savePlayers}`.toLowerCase();
    entry.dataset.players = validPlayers.join();
    entry.dataset.lastUpdate = state.saveDate || state.lastUpdate || 0;
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
      if($('#stateDetailsOverlay.notEditing')) {
        if($('#statesButton').dataset.overlay !== 'statesOverlay')
          showStatesOverlay('statesOverlay');
        if(state.name == 'Unnamed' && !state.link && !state.savePlayers) {
          fillStateDetails(states, state, entry);
          $('#stateDetailsOverlay .buttons [icon=edit]').click();
        }
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

  if(!$('.roomState', categories['In-Progress Games'])) {
    categories['In-Progress Games'].classList.add('empty');
    for(const button of [ updateSaveButton, saveButton ])
      $('.buttons', categories['Game Shelf']).appendChild(button);
  } else {
    for(const button of [ updateSaveButton, saveButton ])
      $('.buttons', categories['In-Progress Games']).appendChild(button);
  }

  categories['Game Shelf'].insertBefore(emptyLibrary, $('.list', categories['Game Shelf']));
  categories['Game Shelf'].insertBefore(emptyLibraryByFilter, $('.list', categories['Game Shelf']));
  $('.buttons', categories['Game Shelf']).appendChild(addButton);
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

  if($('#stateDetailsOverlay').style.display != 'none' || $('#statesOverlay.withDetails')) {
    const stateID = $('#stateDetailsOverlay').dataset.id;
    if(!states[stateID]) {
      $('#closeDetails').click();
    } else if(!$('#stateDetailsOverlay').classList.contains('editing')) {
      if(!$('#statesOverlay.withDetails'))
        showOverlay();
      fillStateDetails(states, states[stateID], $(`#statesOverlay .roomState[data-id="${stateID}"]`));
    }
  }

  $('#stateAddOverlay button[icon=upload]').onclick = function() {
    loadJSZip();
    showStatesOverlay('statesOverlay');
    selectVTTfile(addStateFile);
  };

  loadGameFromURLproperties(states);
}

function fillStateDetails(states, state, dom) {
  toggleClass($('#statesOverlay'), 'withDetails', detailsInSidebar);
  if(!detailsInSidebar)
    showStatesOverlay(detailsOverlay);
  else
    updateFilterOverflow();

  $('#stateDetailsOverlay').dataset.id = state.id;
  for(const dom of $a('#stateDetailsOverlay, #stateDetailsOverlay > *'))
    dom.scrollTop = 0;

  applyValuesToDOM($('#stateDetailsOverlay'), Object.assign({ showName: true }, state));
  toggleClass($('#mainDetails'), 'noImage', !state.image);
  toggleClass($('#similarDetails'), 'noImage', !state.similarImage);

  toggleClass($('#stateDetailsOverlay .star'),         'active', !!state.starred);
  toggleClass($('#stateDetailsOverlay .star'),         'hidden', !state.publicLibrary);
  toggleClass($('#mainImage > i'),                     'hidden', !state.link);
  toggleClass($('#stateDetailsOverlay [icon=upload]'), 'hidden', state.publicLibrary || !config.allowPublicLibraryEdits);

  function fillArrowButton(arrowDom, targetDom) {
    arrowDom.style.display = targetDom ? 'block' : 'none';
    if(targetDom) {
      arrowDom.dataset.id = targetDom.dataset.id;
      $('img', arrowDom).src = $('img', targetDom).dataset.src;
      toggleClass($('img', arrowDom), 'hidden', $('img', arrowDom).src == location.href);
      $('h3', arrowDom).innerText = $('h3', targetDom).innerText;
      $('h4', arrowDom).innerText = $('h4', targetDom).innerText;
      arrowDom.className = targetDom.className;
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
  toggleClass($('#stateDetailsOverlay .buttons [icon=link]'), 'hidden', !!state.savePlayers);
  toggleClass($('#stateDetailsOverlay .buttons [icon=link_off]'), 'hidden', !state.link);
  toggleClass($('#stateDetailsOverlay .buttons [icon=settings]'), 'hidden', !state.savePlayers);

  function updateStateDetailsDomains(state) {
    $('#similarDetailsDomain').innerText = String(state.bgg).replace(/^ *https?:\/\/(www\.)?/, '').replace(/\/.*/, '');
    $('#similarRulesDomain').innerText = String(state.rules).replace(/^ *https?:\/\/(www\.)?/, '').replace(/\/.*/, '');
    $('.hideForEdit [data-field=similarAwards]').innerText = String(state.similarAwards);
    emojis2images($('.hideForEdit [data-field=similarAwards]'));
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
    toggleClass(vEntry, 'noImage', !variant.variantImage);
    $('img', vEntry).src = mapAssetURLs(variant.variantImage);

    $('[icon=play_arrow]', vEntry).onclick = async function() {
      $('#statesButton').dataset.overlay = 'confirmOverlay';
      let switchToActiveGame = true;
      let loadNewState = true;

      if(widgets.size) {
        if(state.savePlayers)
          loadNewState = await confirmOverlay('Switch game', 'Are you sure you want to switch games? You will lose all unsaved progress in the current game.', ' Load in-progress game', 'Return to active game', 'play_arrow', 'undo');
        else
          loadNewState = await confirmOverlay('Switch game', 'Are you sure you want to load a new game? You will lose all unsaved progress in the current game.', 'Load new game', 'Return to active game', 'play_arrow', 'undo');
        switchToActiveGame = loadNewState !== null;
      }

      if(loadNewState) {
        if(!state.savePlayers)
          triggerGameStartRoutineOnNextStateLoad = true;
        toServer('loadState', { stateID: stateIDforLoading, variantID: variantIDforLoading, linkSourceStateID: state.id, delayForGameStartRoutine: !state.savePlayers });
      }
      showStatesOverlay(detailsOverlay);
      if(switchToActiveGame)
        $('#activeGameButton').click();
    };

    $('[icon=edit]', vEntry).onclick = function(e) {
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
  $('#variantAddOverlay button[icon=close]').onclick = _=>showStatesOverlay(detailsOverlay);
  $('#variantAddOverlay button[icon=save]').onclick = async function(e) {
    const variantID = $a('#stateDetailsOverlay .variant').length;
    await createTempState(e, 'create', variantID, $a('#variantAddOverlay div button'));
    showStatesOverlay(detailsOverlay);
    const emptyVariant = { variantImage: state.image };
    const vEntry = addVariant(variantID, emptyVariant);
    enableEditing(vEntry, emptyVariant);
  };
  $('#variantAddOverlay button[icon=upload]').onclick = function(e) {
    loadJSZip();
    selectVTTfile(function(f) {
      $('#stateDetailsOverlay').classList.add('uploading');

      const variantDOM = [];
      const filenameSuffix = rand().toString(36).substring(3, 11);

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
    showStatesOverlay(detailsOverlay);
  };
  $('#variantAddOverlay button[icon=link]').onclick = function(e) {
    showStatesOverlay(detailsOverlay);
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
    toggleClass($('#statesOverlay'), 'withDetails', false);
    if(!detailsInSidebar)
      showStatesOverlay('statesOverlay');
    else
      updateFilterOverflow();
  };
  $('#stateDetailsOverlay .buttons [icon=menu]').onclick = function(e) {
    $('#stateDetailsOverlay .buttons > div').classList.toggle('hidden');
    e.stopPropagation();
    document.addEventListener('click', e=>$('#stateDetailsOverlay .buttons > div').classList.add('hidden'));
  };
  $('#stateDetailsOverlay .buttons [icon=download]').onclick = function() {
    window.open(`dl/${roomID}/${encodeURIComponent(state.id)}`);
  };
  $('#stateDetailsOverlay .buttons [icon=link]').onclick = function() {
    shareLink(state);
  };
  $('#stateDetailsOverlay .buttons [icon=link_off]').onclick = function() {
    $('#mainImage > i').classList.add('hidden');
    toServer('unlinkState', state.id);
  };
  $('#shareLinkOverlay button[icon=close]').onclick = _=>showStatesOverlay(detailsOverlay);
  shareButton($('#shareLinkOverlay button[icon=share]'), _=>$('#shareLinkOverlay input').value);
  $('#stateDetailsOverlay .buttons [icon=delete]').onclick = async function() {
    $('#statesButton').dataset.overlay = 'confirmOverlay';
    const type     = state.savePlayers ? 'saved game'        : 'game';
    const category = state.savePlayers ? 'in-progress games' : 'game shelf';
    if(await confirmOverlay(`Delete ${type}`, `Are you sure you want to completely remove this ${type} from your ${category}?`, 'Delete', 'Keep', 'delete', 'undo', 'red')) {
      toServer('removeState', state.id);
      removeFromDOM(dom);
      updateEmptyLibraryHint();
      if(!$('#statesList > div:nth-of-type(1) .roomState'))
        $('#statesList > div:nth-of-type(1)').classList.add('empty');
      showStatesOverlay('statesOverlay');
    } else {
      showStatesOverlay(detailsOverlay);
    }
  };
  $('#stateDetailsOverlay .buttons [icon=settings]').onclick = function() {
    toServer('editState', {
      id: state.id,
      meta: {
        saveState:     null,
        saveVariant:   null,
        saveLinkState: null,
        savePlayers:   null,
        saveDate:      null
      },
      variantInput: {},
      variantOperationQueue: []
    });
  };
  $('#stateDetailsOverlay .buttons [icon=upload]').onclick = function() {
    toServer('addStateToPublicLibrary', state.id);
  };

  $('#stateDetailsOverlay .star').onclick = function(e) {
    e.currentTarget.classList.toggle('active');
    $('#stateDetailsOverlay .star + span').innerText = (+$('#stateDetailsOverlay .star + span').innerText + (e.currentTarget.classList.contains('active') ? 1 : -1)) || '';
    $('#stateDetailsOverlay .star + span').classList.remove('hidden');
    $(`#statesOverlay .roomState[data-id="${state.id}"] .star`).click();
  };

  $('#stateDetailsOverlay .buttons [icon=edit]').onclick = function() {
    enableEditing($('#stateDetailsOverlay'), state);

    for(const uploadButton of $a('#stateDetailsOverlay button[icon=image]')) {
      const updateImageValue = function(button, newURL) {
        const img = $('img', button.parentNode.parentNode);
        button.value = newURL;
        toggleClass(img, 'hidden', !newURL);
        toggleClass(img.parentNode.parentNode, 'noImage', !newURL);
        img.src = newURL ? mapAssetURLs(newURL) : '';
      }

      uploadButton.onclick = async function() {
        const isVariantImage = uploadButton.parentNode.classList.contains('variantEdit');
        $('#statesButton').dataset.overlay = 'updateImageOverlay';
        let newURL = await updateImage(uploadButton.value, isVariantImage ? 'Use state image' : null);
        if(!newURL && isVariantImage)
          newURL = state.image;

        // update variant images if they were the same as the main image
        if(uploadButton.dataset.field == 'image')
          for(const variantButton of $a('#stateDetailsOverlay .variant button[icon=image]'))
            if(variantButton.value == uploadButton.value)
              updateImageValue(variantButton, newURL);

        updateImageValue(uploadButton, newURL);

        showStatesOverlay(detailsOverlay);
      };
    }
  };
  $('#discardDetails').onclick = async function() {
    $('#statesButton').dataset.overlay = 'confirmOverlay';
    if(await confirmOverlay('Discard changes', "Are you sure you want to discard any changes you made to this game's variants and metadata?", 'Discard', 'Keep', 'delete', 'undo', 'red')) {
      disableEditing($('#stateDetailsOverlay'), state);
      showStatesOverlay('statesOverlay');
      dom.click();
    } else {
      showStatesOverlay(detailsOverlay);
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

function setSidebar() {
  const vw = Math.max(document.documentElement.clientWidth  || 0, window.innerWidth  || 0)
  const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
  const bigEnough = vw >= 1421 && vh >= 888;

  if(detailsInSidebar != bigEnough) {
    detailsInSidebar = bigEnough;
    detailsOverlay = detailsInSidebar ? 'statesOverlay' : 'stateDetailsOverlay';

    if(detailsInSidebar) {
      if($('#statesButton').dataset.overlay == 'stateDetailsOverlay') {
        $('#statesButton').dataset.overlay = detailsOverlay;
        $('#statesOverlay').classList.add('withDetails');
        if($('#statesButton.active'))
          showStatesOverlay(detailsOverlay);
      }
      $('#statesOverlay').append($('#stateDetailsOverlay'));
    } else {
      $('#roomArea').insertBefore($('#stateDetailsOverlay'), $('#updateImageOverlay'));
      if($('#statesButton').dataset.overlay == 'statesOverlay' && $('#statesOverlay.withDetails')) {
        $('#statesButton').dataset.overlay = detailsOverlay;
        $('#statesOverlay').classList.remove('withDetails');
        if($('#statesButton.active'))
          showStatesOverlay(detailsOverlay);
      }
    }
  }
}

async function updateImage(currentImage, noImageText) {
  return new Promise(function(resolve, reject) {
    showOverlay('updateImageOverlay');
    const o = $('#updateImageOverlay');

    $('img.previous', o).src = mapAssetURLs(currentImage);
    $('img.current', o).src = mapAssetURLs(currentImage);
    $('input.current', o).value = currentImage;

    $('button[icon=image_not_supported]', o).innerText = noImageText || 'Use no image';

    $('button[icon=upload]', o).onclick = async function() {
      $('input', o).value = await uploadAsset();
      $('img.current', o).src = mapAssetURLs($('input', o).value);
    };
    $('input ', o).oninput = async function() {
      $('img.current', o).src = mapAssetURLs($('input', o).value);
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

async function confirmOverlay(title, text, confirmButton, cancelButton, confirmIcon, cancelIcon, confirmClass, cancelClass) {
  return new Promise(function(resolve, reject) {
    showOverlay('confirmOverlay');
    applyValuesToDOM($('#confirmOverlay'), { title, text, confirmButton, cancelButton });

    $('#confirmOverlay div[icon]').setAttribute('icon', confirmIcon || 'check');

    $('#confirmOverlay .buttons button:nth-of-type(1)').setAttribute('icon', cancelIcon || 'close');
    $('#confirmOverlay .buttons button:nth-of-type(1)').className = cancelClass || '';
    $('#confirmOverlay .buttons button:nth-of-type(1)').onclick = function() {
      showOverlay();
      resolve(false);
    };
    $('#confirmOverlay .buttons button:nth-of-type(2)').setAttribute('icon', confirmIcon || 'check');
    $('#confirmOverlay .buttons button:nth-of-type(2)').className = confirmClass || '';
    $('#confirmOverlay .buttons button:nth-of-type(2)').onclick = function() {
      showOverlay();
      resolve(true);
    };

    $('#confirmOverlay .titleWithCloseButton button').onclick = function() {
      showOverlay();
      resolve(null);
    };
  });
}

async function shareLink(state) {
  showStatesOverlay('shareLinkOverlay');

  const name = state.name.replace(/[^A-Za-z]+/g, '-').toLowerCase().replace(/^-+/, '').replace(/-+$/, '');
  let url = null;

  $('#shareLinkOverlay').classList.toggle('plGame', !!state.publicLibrary);
  $('#shareLinkOverlay').classList.toggle('customGame', !state.publicLibrary);

  if(state.publicLibrary) {
    const type = state.publicLibrary.match(/tutorials/) ? 'tutorial' : 'game';
    url = `${config.externalURL}/${type}/${name}`;
  } else {
    url = state.link;
    if(!url) {
      url = await fetch(`share/${roomID}/${state.id}`);
      url = `${location.origin}${await url.text()}/${name}`;
    } else if(url.startsWith(`${config.externalURL}/s/`)) {
      url = `${config.externalURL}/game/${url.substr(config.externalURL.length + 3, 8)}/${name}`;
    }
  }

  $('#sharedLink').value = url;
}

onLoad(function() {
  setSidebar();

  onMessage('meta', args=>{
    currentMetaData = args;
    fillStatesList(args.meta.states, args.meta.starred, args.meta.activeState, args.meta.returnServer, args.activePlayers);
  });

  on('#filterOverflow > div', 'click', e=>e.stopPropagation());
  on('#filterOverflow > button', 'click', function(e) {
    $('#filterOverflow').classList.toggle('active');
    e.stopPropagation();
    document.addEventListener('click', e=>$('#filterOverflow').classList.remove('active'));
  });
  on('#filterByText', 'keyup', updateLibraryFilter);
  on('#clearSearch', 'click', _=>{$('#filterByText').value='';updateLibraryFilter();$('#filterByText').focus()});
  on('#stateFilters select', 'change', updateLibraryFilter);

  on('#addState', 'click', _=>showStatesOverlay('stateAddOverlay'));
  on('#saveState, #updateSaveState', 'click', saveState);

  on('#stateAddOverlay [icon=close]', 'click', e=>showStatesOverlay('statesOverlay'));
  on('#stateAddOverlay button[icon=save]', 'click', function(e) {
    showStatesOverlay('statesOverlay');
    addState(e, 'state');
  });
  on('#stateAddOverlay button[icon=link]', 'click', function(e) {
    if($('#stateAddOverlay input').value.match(/^http/))
      addState(e, 'link', $('#stateAddOverlay input').value);
    else
      alert('Please enter a link.');
  });

  window.addEventListener('resize', function() {
    setSidebar();
    updateFilterOverflow();
  });
  document.addEventListener('dragover', function(e) {
    if($('#statesOverlay').style.display == 'flex' && e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      $('#statesButton').click();
    }
  });
  document.addEventListener('drop', function(e) {
    if(e.dataTransfer.files.length) {
      e.preventDefault();
      loadJSZip();
      for(const file of e.dataTransfer.files)
        resolveStateCollections(file, addStateFile);
    }
  });
});

const lazyImageObserver = new IntersectionObserver(entries => {
  for(const entry of entries) {
    if(entry.isIntersecting) {
      entry.target.src = entry.target.dataset.src;
      lazyImageObserver.unobserve(entry.target);
      loadedLibraryImages[entry.target.dataset.src] = true;
    }
  }
});
