import path from 'path';
import express from 'express';
import http from 'http';
import WebSocket from 'ws';

const __dirname = path.resolve();
const app = express();
const server = http.Server(app);

app.use('/', express.static(__dirname + '/client'));

app.get('/', function(req,res) {
  res.redirect(Math.random().toString(36).substring(7));
});

app.get('/:id', function(req,res) {
  res.sendFile(__dirname + '/client/room.html');
});

server.listen(process.env.PORT || 8272, function() {
  console.log('Listening on ' + server.address().port);
});


const wss = new WebSocket.Server({ port: 8273 });

wss.on('connection', ws => {
  ws.on('message', message => {
    console.log(`Received message => ${message}`);
  });
  ws.send('Hello! Message From Server!!');
});
