let lastTimeout = 1000;
let connection;

function startWebSocket() {
  const url = `ws://${location.host}`;
  console.log(`connecting to ${url}`);
  connection = new WebSocket(url);

  connection.onopen = () => {
    toServer('room', { playerName, roomID });
  };

  connection.onerror = (error) => {
    console.log(`WebSocket error: ${error}`);
    setTimeout(startWebSocket, lastTimeout *= 2);
  };

  connection.onclose = () => {
    console.log(`WebSocket closed`);
    setTimeout(startWebSocket, lastTimeout *= 2);
  };

  connection.onmessage = (e) => {
    const { func, args } = JSON.parse(e.data);
    fromServer(func, args);
  };
}
startWebSocket();

function fromServer(func, args) {
  if(func == 'add')
    addWidget(args);
  if(func == 'meta') {
    fillPlayerList(args.meta.players, args.activePlayers);
    fillStatesList(args.meta.states, args.activePlayers);
  }
  if(func == 'rename') {
    playerName = args;
    localStorage.setItem('playerName', playerName);
  }
  if(func == 'state') {
    for(const widget of $a('.widget'))
      widget.parentNode.removeChild(widget);
    for(const widgetID in args)
      if(widgetID != '_meta')
        addWidget(args[widgetID]);
  }
  if(func == 'translate')
    widgets.get(args.id).setPositionFromServer(args.pos[0], args.pos[1]);
  if(func == 'update')
    widgets.get(args.id).receiveUpdate(args);
}

function toServer(func, args) {
  connection.send(JSON.stringify({ func, args }));
}
