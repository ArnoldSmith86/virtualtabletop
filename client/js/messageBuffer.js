export class MessageBuffer {
    constructor(name, interval, handler, connection) {
        this.name = name;
        this.interval = interval;
        this.handler = handler;
        this.connection = connection;
        this.buffer = [];
        this.locked = false;
        this._start();
    }

    _start() {
        setInterval(() => {
            // do locking here
            this.handler(this.buffer, this.connection);
            this.buffer = [];
            // end locking here
        }, this.interval);
    }
    
    send(message) {
        this.buffer.push(message);
    }
}

export const messageBufferHandlers = {
    'sendLatest': sendLatest,
    'sendAll': sendAll,
    'sendMergedObject': sendMergedObject
}

function sendLatest(buffer, connection) {
    if (buffer.length > 0) {
        connection.send(buffer.pop());
    }
}

function sendAll(buffer, connection) {
    buffer.forEach(message=>{
        connection.send(message);
    })
}

function sendMergedObject(buffer, connection) {
    if (buffer.length < 1) return;

    let result = {};
    buffer.forEach(message=>{
        result = Object.assign(result, JSON.parse(message));
    })
    connection.send(JSON.stringify(result));
}