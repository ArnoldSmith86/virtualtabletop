import Logging from './logging.mjs';

export default class Player {
  constructor(connection, name, room) {
    this.connection = connection;
    this.name = name;
    this.room = room;

    this.latestDeltaIDbyDifferentPlayer = this.room.deltaID;
    this.waitingForStateConfirmation = false;
    this.possiblyConflictingDeltas = [];

    connection.addMessageHandler(this.messageReceived);
    connection.addCloseHandler(this.connectionClosed);
  }

  connectionClosed = (func, args) => {
    this.room.removePlayer(this);
  }

  messageReceived = async (func, args) => {
    if([ 'delta', 'mouse', 'trace' ].indexOf(func) == -1)
      this.trace('messageReceived', { func, args });

    try {
      if(func == 'confirm')
        this.waitingForStateConfirmation = false;
      if(func == 'delta')
        this.receiveDelta(args);
      if(func == 'editState')
        await this.room.editState(this, args.id, args.meta);
      if(func == 'loadState')
        await this.room.loadState(this, args.stateID, args.variantID);
      if(func == 'mouse')
        this.room.mouseMove(this, args);
      if(func == 'playerColor')
        this.room.recolorPlayer(this, args.player, args.color);
      if(func == 'removeState')
        this.room.removeState(this, args);
      if(func == 'rename')
        this.room.renamePlayer(this, args.oldName, args.newName);
      if(func == 'trace')
        this.trace('client', args);
    } catch(e) {
      Logging.handleWebSocketException(func, args, e);
      this.send('internal_error', func);
      this.connection.close();
    }
  }

  receiveDelta(delta) {
    if(this.waitingForStateConfirmation) {
      this.trace('receiveDelta', { status: 'waitingForStateConfirmation', delta });
      return;
    }

    if(delta.id < this.latestDeltaIDbyDifferentPlayer) {
      this.trace('receiveDelta', { status: 'idTooLow', delta, possiblyConflicting: this.possiblyConflictingDeltas });
      for(const conflictDelta of this.possiblyConflictingDeltas) {
        for(const widgetID in delta.s) {
          if(conflictDelta.s[widgetID] !== undefined) {
            this.trace('receiveDelta', { status: 'conflict', delta, conflictDelta, widgetID });
            this.waitingForStateConfirmation = true;
            this.room.receiveInvalidDelta(this, delta, widgetID);
            return;
          }
        }
      }
    }

    this.possiblyConflictingDeltas = [];
    this.room.receiveDelta(this, delta);
  }

  rename(newName) {
    this.name = newName;
    this.send('rename', newName);
  }

  send(func, args) {
    if(func == 'delta') {
      this.possiblyConflictingDeltas.push(args);
      this.latestDeltaIDbyDifferentPlayer = args.id;
    }
    this.connection.toClient(func, args);
  }

  trace(source, payload) {
    if(this.room.enableTracing || source == 'client' && payload.type == 'enable') {
      payload.player = this.name;
      this.room.trace(source, payload);
    }
  }
}
