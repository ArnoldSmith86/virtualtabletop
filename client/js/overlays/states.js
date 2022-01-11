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
      const result = await fetch('/assetcheck', {
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

  let url = `/addState/${roomID}/${id}/${type}/${src && src.name && encodeURIComponent(src.name)}/`;
  waitingForStateCreation = id;
  if(e && (e.target.parentNode.parentNode == $('#addVariant') || e.target.classList.contains('update'))) {
    waitingForStateCreation = $('#stateEditScreen').dataset.id;
    url += $('#stateEditScreen').dataset.id;
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
  const stateID = $('#stateEditScreen').dataset.id;
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
  toServer('editState', { id: $('#stateEditScreen').dataset.id, meta: {
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

function toggleStateStar(state) {
  toServer('toggleStateStar', state.publicLibrary);
}

function updateLibraryFilter() {
  const text = $('#filterByText').value.toLowerCase();
  const players = $('#filterByPlayers').value;
  const language = $('#filterByLanguage').value;
  for(const state of $a('#gameShelf .card')) {
    const textMatch     = state.dataset.text.match(text);
    const playersMatch  = players  == 'Any' || state.dataset.players.split(',').indexOf(players) != -1;
    const languageMatch = language == 'Any' || state.dataset.languages.split(',').indexOf(language) != -1;
    state.style.display = textMatch && playersMatch && languageMatch ? 'block' : 'none';
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
  app.card.close('.card-opened');
  $('#statesButton').dataset.overlay = 'statesOverlay';
  if(starred){ console.log(starred); }
  // const addDiv = $('#addState');
  // removeFromDOM(addDiv);
  removeFromDOM('#gameShelf > .roomState');
  removeFromDOM('#gameShelf > .block');

  let isEmpty = true;
  const sortedStates = Object.entries(states).sort((a, b) => a[1].name.localeCompare(b[1].name));
  // console.log(sortedStates);

  for(const publicLibrary of [ false, true ]) {
    // const category = domByTemplate('template-stateslist-category');
    // $('.list-title', category).textContent = publicLibrary ? 'Public Library' : 'Your Game Shelf';
    // $('.list-title', category).className += publicLibrary ? ' pl-header' : ' yourshelf-header';

    for(const kvp of sortedStates.filter(kvp=>(!!kvp[1].publicLibrary && (!starred || !starred[kvp[1].publicLibrary])) == publicLibrary)) {
      isEmpty = false;
      // console.log(starred);
      const state = kvp[1];
      state.id = kvp[0];
// console.log(state);

      const entry = domByTemplate('template-stateslist-entry');
      entry.className = state.image ? 'card card-expandable roomState' : 'card card-expandable roomState noImage';

      if(state.publicLibrary)
        entry.className += ' publicLibraryGame';

      if(state.image){
        $('.header', entry).style.backgroundImage = "url("+state.image+")";
        $('img', entry).src = state.image;
      } else {
        $('img', entry).src = '/i/branding/android-512.png';
        $('.header', entry).style.backgroundImage = "url(/i/branding/android-512.png)";
      }
      $('.name', entry).textContent = `${state.name}`;
      $('.similar-to', entry).textContent = `Similar to ${state.similarName}`;
      if((state.similarName == state.name) || !state.similarName ){
        $('.similar-to', entry).className += ' ui-hidden';
      }
      // $('.bgg', entry).textContent = `${state.name} (${state.year})`;
      if(state.bgg){
        $('.bgg', entry).href = state.bgg;
      } else {
        $('.bgg', entry).className += ' ui-hidden';
      }
      if(state.rules){
        $('.rules', entry).href = state.rules;
      } else {
        $('.rules', entry).className += ' ui-hidden';
      }
      if(state.time){
        $('.time', entry).textContent = state.time+" minutes";
      } else {
        $('.time', entry).className += ' ui-hidden';
        $('.time-icon', entry).className += ' ui-hidden';
      }
      $('.description-info', entry).textContent = state.description;
      if(state.attribution){
        $('.attribution-info', entry).textContent = state.attribution;
      }
      $('.star', entry).setAttribute('id',"fave_"+state.name);
      $('.star', entry).setAttribute('name',"fave_"+state.name);
      $('.star-label', entry).setAttribute('for',"fave_"+state.name);
      if(starred){
        if(starred[state.name]) {
           entry.className += ' favorite';
           $('.star', entry).setAttribute("checked","checked");
        }
      }
      const validPlayers = [];
      const validLanguages = [];
      for(const variantID in state.variants) {
        const variant = state.variants[variantID];
        console.log(variant);
        const vEntry = domByTemplate('template-variantslist-entry', 'li');
        vEntry.className += ' variant';
        $('.language', vEntry).textContent = String.fromCodePoint(...[...variant.language].map(c => c.charCodeAt() + 0x1F1A5));
        $('.players', vEntry).textContent = variant.players;

        if(variant.variant){
          $('.variant-name', vEntry).textContent = variant.variant;
        } else {
          $('.variant-name', vEntry).textContent = 'Unnamed Variant';
          $('.variant-name', vEntry).className += ' unnamed';
        }
        if(variant.image){
          $('.variant-image', vEntry).src += ' unnamed';
        }
        validPlayers.push(...parsePlayers(variant.players));
        validLanguages.push(variant.language);
        $('.variantsList', entry).appendChild(vEntry);
      }

      $('.edit', entry).addEventListener('click', _=>fillEditState(state));
      $('.star', entry).addEventListener('change', _=>toggleStateStar(state));
      $('#gameShelf').appendChild(entry);

      entry.dataset.text = `${state.name} ${state.similarName} ${state.description}`.toLowerCase();
      entry.dataset.players = validPlayers.join();
      entry.dataset.languages = validLanguages.join();

      if(state.id == waitingForStateCreation) {
        waitingForStateCreation = null;
        if(state.name == 'Unnamed')
          fillEditState(state);
      }
    }

    // $('#statesList').appendChild(category);
  }
  // $('#statesList').appendChild(addDiv);
  updateLibraryFilter();

}

function fillEditState(state) {
  $('#stateEditScreen').dataset.id = state.id;

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
    // $('.stateLanguage', vEntry).value = variant.language;
    // $('.statePlayers', vEntry).value = variant.players;
    // $('.stateVariant', vEntry).value = variant.variant;
    // $('.stateLink', vEntry).value = variant.link || '';
    // $('.stateAttribution', vEntry).value = variant.attribution || '';
    // $('.stateLink', vEntry).parentNode.style.display = variant.link ? 'block' : 'none';

    // if(variantID == variantIDjustUpdated) {
    //   variantIDjustUpdated = null;
    //   $('.update', vEntry).textContent = '✔️ Done';
    //   $('.update', vEntry).disabled = true;
    // }
    // $('.update', vEntry).addEventListener('click', e=>{
    //   addState(e, 'state', undefined, variantID);
    //   variantIDjustUpdated = variantID;
    // });
    // $('.download', vEntry).addEventListener('click', _=>downloadState(variantID));
    // $('.remove', vEntry).addEventListener('click', _=>removeFromDOM(vEntry));
    $('#variantsEditList').appendChild(vEntry);
  }

  showOverlay(null);
  showOverlay('stateEditOverlay');
}

function removeState() {
  toServer('removeState', $('#stateEditScreen').dataset.id);
  showOverlay('statesOverlay');
}

async function shareLink() {
  showOverlay('shareLinkOverlay');
  let url = $('#stateLink').value;
  if(!url) {
    const name = $('#stateName').value.replace(/[^A-Za-z0-9.-]/g, '_');
    url = await fetch(`/share/${roomID}/${$('#stateEditScreen').dataset.id}`);
    url = `${location.origin}${await url.text()}/${name}.vtt`;
  }
  $('#sharedLink').value = url;
}

onLoad(function() {
  onMessage('meta', args=>fillStatesList(args.meta.states, args.meta.returnServer, args.meta.starred, args.activePlayers));

  on('#filterByText', 'keyup', updateLibraryFilter);
  on('#filterByPlayers, #filterByLanguage', 'change', updateLibraryFilter);

  on('.statesCreator .create, #addVariant .create', 'click', e=>addState(e, 'state'));
  on('.statesCreator .upload, #addVariant .upload', 'click', e=>selectFile(false, f=>addState(e, 'file', f)));
  on('.statesCreator .link,   #addVariant .link',   'click', e=>addState(e, 'link', prompt('Enter shared URL:')));

  on('.statesCreator .download', 'click', _=>downloadState(null));

  on('#stateEditScreen .save',     'click', editState);
  on('#stateEditScreen .download', 'click', _=>downloadState());
  on('#stateEditScreen .remove',   'click', removeState);

  on('#stateEditScreen .uploadAsset', 'click', _=>uploadAsset().then(function(asset) {
    if(asset)
      $('#stateImage').value = asset;
  }));
  on('#stateEditScreen .share', 'click', _=>shareLink());

  on('#shareOK', 'click', _=>showOverlay('stateEditOverlay'));

  $UI('#showAppButton').on('click', function() {
       $('#app').style.display = 'block';
  });


});
