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

  renderSeatButton(icon, label, isActive, onclick) {
    const button = document.createElement('button');
    button.setAttribute('icon', icon);
    button.innerText = label; // no span: inside the toolbar that would be a tooltip
    button.title = label; // the panel is narrow, long seat names get cut off
    button.classList.toggle('active', isActive);
    button.onclick = onclick;
    this.list.appendChild(button);
    return button;
  }

  renderSeats() {
    this.list.innerHTML = '';
    const active = getSeatViewPreview();

    // the panel is opened from an icon-only button, so nothing else on screen
    // says what this list is
    div(this.list, 'seatViewHeader', 'Show the room as:');

    const seats = widgetFilter(w=>w.get('type') == 'seat').sort((a,b)=>a.get('index') - b.get('index') || String(a.get('id')).localeCompare(String(b.get('id'))));
    const ownSeat = seats.filter(w=>w.get('player') == getPlayerDetails().playerName).length;

    // looking through your own eyes is a different kind of choice than looking
    // through a seat, and while editing it usually means the stored layout
    this.renderSeatButton('visibility', ownSeat ? 'Your own view' : 'Your own view (you have no seat)', !active, _=>this.preview(null)).classList.add('seatViewOwn');

    for(const seat of seats)
      this.renderSeatButton('event_seat', `${seat.get('index')}. ${seat.get('id')} - ${seat.get('player') || 'empty'}`, active == seat.get('id'), _=>this.preview(seat.get('id')));

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
    this.syncButton();
  }

  // the preview outlives the dropdown it was picked in, so the button has to
  // stay lit while it is on - that is how every other mode in the toolbar says
  // it is active
  syncButton() {
    $('button', this.domElement).classList.toggle('active', !!this.active || !!getSeatViewPreview());
  }

  setState(state) {
    super.setState(state);
    this.syncButton();
  }

  syncPreview() {
    $('body').classList.toggle('seatViewPreview', !!getSeatViewPreview());
    this.syncButton();
    // the drag toolbar writes positions, so it goes away with the preview and
    // comes back with it - the selection itself is left alone
    updateDragToolbar();
    if(this.list)
      this.renderSeats();
  }

  toggle(state) {
    super.toggle(state);
    if(!state)
      return;
    this.renderSeats();

    // the panel hangs below its button, which in a narrow editor puts a list of
    // seat names past the right edge of the screen
    this.domContentElement.style.marginLeft = '';
    const overflow = this.domContentElement.getBoundingClientRect().right - document.documentElement.clientWidth;
    if(overflow > 0)
      this.domContentElement.style.marginLeft = `${-5 - overflow}px`;
  }
}
