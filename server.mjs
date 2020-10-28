import path from 'path';
import express from 'express'
import http from 'http'

const __dirname = path.resolve();
const app = express()
const server = http.Server(app)

app.get('/',function(req,res){
    res.send("Server is working.");
});

server.listen(process.env.PORT || 8272, function () {
    console.log('Listening on ' + server.address().port);
});
