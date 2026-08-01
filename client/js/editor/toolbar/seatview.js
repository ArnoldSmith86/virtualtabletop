class SeatViewButton extends ToolbarButtonWithContent {
  constructor() {
    super('event_seat', 'Preview as seat', 'Show the room the way the player in a given seat sees it.\n\nThis only changes what you see - nothing is sent to the other players. Widgets cannot be picked up and dropped while a seat is previewed.');
    // somebody sitting down (or a seat being added or removed) changes both the
    // list and, if it was the previewed seat, the preview itself
    onSeatsChanged(_=>this.syncPreview());
  }

  onEditorClose() {
    this.stopPreview();
  }

  renderContent(target) {
    this.list = div(target, 'seatViewContent', '');
  }

  renderSeats() {
    this.list.innerHTML = '';
    const active = getSeatViewPreview();

    const own = document.createElement('button');
    own.innerText = 'Your own view';
    own.classList.toggle('active', !active);
    own.onclick = _=>this.preview(null);
    this.list.appendChild(own);

    const seats = widgetFilter(w=>w.get('type') == 'seat').sort((a,b)=>a.get('index') - b.get('index') || String(a.get('id')).localeCompare(String(b.get('id'))));
    for(const seat of seats) {
      const button = document.createElement('button');
      button.innerText = `${seat.get('id')}${seat.get('player') ? ' - ' + seat.get('player') : ' - empty'}`;
      button.classList.toggle('active', active == seat.get('id'));
      button.onclick = _=>this.preview(seat.get('id'));
      this.list.appendChild(button);
    }

    if(!seats.length)
      div(this.list, 'seatViewEmpty', 'This game has no seat widgets.');
  }

  preview(seatID) {
    setSeatViewPreview(seatID);
    this.syncPreview();
  }

  stopPreview() {
    setSeatViewPreview(null);
    $('body').classList.remove('seatViewPreview');
  }

  syncPreview() {
    $('body').classList.toggle('seatViewPreview', !!getSeatViewPreview());
    if(this.list)
      this.renderSeats();
  }

  toggle(state) {
    super.toggle(state);
    if(state)
      this.renderSeats();
  }
}
