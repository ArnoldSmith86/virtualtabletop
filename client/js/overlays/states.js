function fillStatesList(states, activePlayers) {
  const addDiv = $('#addState');
  addDiv.parentElement.removeChild(addDiv);
  for(const entry of $a('#statesList > div'))
    entry.parentNode.removeChild(entry);
  for(const state of states) {
    const entry = domByTemplate('template-stateslist-entry');
    entry.className = 'roomState';
    $('img', entry).src = state.image;
    $('.bgg', entry).textContent = `${state.name} (${state.year})`;
    $('.bgg', entry).href = state.bgg;
    $('.rules', entry).href = state.rules;
    $('.players', entry).textContent = `${state.players} (${state.mode})`;
    $('.time', entry).textContent = state.time;

    $('.play', entry).addEventListener('click', _=>toServer('loadState', state.id));
    $('.remove', entry).addEventListener('click', _=>toServer('removeState', state.id));

    $('#statesList').appendChild(entry);
  }
  $('#statesList').appendChild(addDiv);
}

function addState(type, src) {
  if(type == 'url' && (!src || !src.match(/^http/)))
    return;
  toServer('addState', { type, src, meta: {
    name:    $('#addState [placeholder=Name]').value,
    image:   $('#addState [placeholder=Image]').value,
    rules:   $('#addState [placeholder="Rules link"]').value,
    bgg:     $('#addState [placeholder="BordGameGeek link"]').value,
    year:    $('#addState [placeholder=Year]').value,
    mode:    $('#addState [placeholder=Mode]').value,
    players: $('#addState [placeholder=Players]').value,
    time:    $('#addState [placeholder=Time]').value
  }});
}

onLoad(function() {
  onMessage('meta', args=>fillStatesList(args.meta.states, args.activePlayers));

  on('#addState .create', 'click', _=>addState('state'));
  on('#addState .upload', 'click', _=>selectFile(true).then(f=>addState('file', f)));
  on('#addState .link',   'click', _=>addState('url', prompt('Enter shared URL:')));
});
