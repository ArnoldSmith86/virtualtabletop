const url = `ws://${location.hostname}:8273`;
const connection = new WebSocket(url);

connection.onopen = () => {
  toServer('room', self.location.pathname.substr(1));
};

connection.onerror = (error) => {
  console.log(`WebSocket error: ${error}`);
};

connection.onmessage = (e) => {
  const { func, args } = JSON.parse(e.data);
  fromServer(func, args);
};

function addWidget(widget) {
  widgets.set(widget.id, new BasicWidget(widget, document.querySelector('.surface')));
}

function fromServer(func, args) {
  if(func == 'add')
    addWidget(args);
  if(func == 'state')
    for(const widgetID in args)
      addWidget(args[widgetID]);
  if(func == 'translate')
    widgets.get(args.id).setPositionFromServer(args.pos[0], args.pos[1]);
}

function toServer(func, args) {
  connection.send(JSON.stringify({ func, args }));
}

window.addEventListener('mousemove', function(event) {
  toServer('mouse', [ event.clientX, event.clientY ]);
});

const widgets = new Map();

function objectToWidget(o) {
  if(!o.id)
    o.id = Math.random().toString(36).substring(3, 7);
  toServer('add', o);
}

window.addEventListener('DOMContentLoaded', function() {
  document.querySelector('#addWidget').addEventListener('click', function() {
    objectToWidget(JSON.parse(document.querySelector('#widgetText').value));
  });
});
