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
      if(func == 'addStateToPublicLibrary')
        this.room.addStateToPublicLibrary(this, args);
      if(func == 'confirm')
        this.waitingForStateConfirmation = false;
      if(func == 'delta')
        this.receiveDelta(args);
      if(func == 'editState')
        await this.room.editState(this, args.id, args.meta, args.variantInput, args.variantOperationQueue);
      if(func == 'loadState')
        await this.room.loadState(this, args.stateID, args.variantID, args.linkSourceStateID, args.delayForGameStartRoutine);
      if(func == 'mouse')
        this.room.mouseMove(this, args);
      if(func == 'playerColor')
        this.room.recolorPlayer(this, args.player, args.color);
      if(func == 'removeState')
        this.room.removeState(this, args);
      if(func == 'rename')
        this.room.renamePlayer(this, args.oldName, args.newName);
      if(func == 'saveState')
        this.room.saveState(this, args.players, args.updateCurrentSave);
      if(func == 'setRedirect')
        this.room.setRedirect(this, args);
      if(func == 'toggleStateStar')
        this.room.toggleStateStar(this, args);
      if(func == 'trace')
        this.trace('client', args);
      if(func == 'unlinkState')
        await this.room.unlinkState(this, args);
    } catch(e) {
      if(e instanceof Logging.UserError) {
        this.send('error', `${e.code} - ${e.message}`);
      } else {
        Logging.handleWebSocketException(func, args, e);
        this.send('internal_error', func);
        this.connection.close();
      }
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
          if(conflictDelta.id > delta.id && conflictDelta.s[widgetID] !== undefined) {
            // widget was deleted in both deltas - no problem
            if(delta.s[widgetID] === null && conflictDelta.s[widgetID] === null)
              continue;
            // widget was deleted in ONE of the deltas -> conflict
            if(delta.s[widgetID] === null || conflictDelta.s[widgetID] === null) {
              this.trace('receiveDelta', { status: 'conflict', delta, conflictDelta, widgetID, key: '<deletion>' });
              this.waitingForStateConfirmation = true;
              this.room.receiveInvalidDelta(this, delta, widgetID, '<deletion>');
              return;
            }
            for(const key in delta.s[widgetID]) {
              // a property of the widget was changed in both deltas and not to the same value -> conflict
              if(conflictDelta.s[widgetID][key] !== undefined && delta.s[widgetID][key] !== conflictDelta.s[widgetID][key]) {
                this.trace('receiveDelta', { status: 'conflict', delta, conflictDelta, widgetID, key });
                this.waitingForStateConfirmation = true;
                this.room.receiveInvalidDelta(this, delta, widgetID, key);
                return;
              }
            }
          }
        }
      }
    }

    for(const widgetID in delta.s) {
      if (!this.room.state[widgetID] && delta.s[widgetID] && !delta.s[widgetID].id) {
        // tried to modify properties of a missing widget -> client is in bad state
        this.waitingForStateConfirmation = true;
        this.room.receiveInvalidDelta(this, delta, widgetID, '<modification>');
        return;
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
    if(this.room.traceIsEnabled() || source == 'client' && payload.type == 'enable') {
      payload.player = this.name;
      this.room.trace(source, payload);
    }
  }
}
