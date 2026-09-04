const openPopups = []; // stack of open popups so close controls only affect the top-most one

// the editor reacts to Escape on keyup (closing the active sidebar module with a
// synthetic click that would also dismiss every open popup), so when a popup
// handled the Escape keydown, swallow the matching keyup before it gets there
let popupHandledEscape = false;
document.addEventListener('keyup', e=>{
  if(e.key == 'Escape' && popupHandledEscape) {
    popupHandledEscape = false;
    e.stopPropagation();
  }
}, true);

// Selecting the text of an input by dragging across it regularly ends outside
// the popup, and the click the browser then reports has the common ancestor of
// both ends as its target - the page, not the input. Where the drag started is
// what says whether that click happened inside the popup, so it is remembered
// here (mouse clicks only: a keyboard-triggered click has no mousedown of its
// own and would otherwise be judged by the last one somebody made).
let popupMouseDownTarget = null;
document.addEventListener('mousedown', e=>{
  popupMouseDownTarget = e.target;
}, true);

// The lists inside a popup that scroll on their own anyway (the widget ids, the
// property names, the operations). Where the popup does not fit the room it has,
// they are what gives way - see fitScrollAreas.
const popupScrollAreas = '.widgetPickerList, .popup-property-list, .popup-operation-list';
// three rows or so: a list shorter than that shows less than it takes to scroll
// it, so the popup scrolls after all instead of shrinking it any further
const popupScrollAreaMinHeight = 66;

class Popup {
  constructor(source) {
    this.source = source;
    this.domElement = document.createElement('div');
    this.domElement.classList.add('inline-popup');
    this.changeListeners = [];
    this.cancelListeners = [];
    this.boundOnClick = this.onClick.bind(this);
    this.boundOnOutsideClick = this.onOutsideClick.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);
  }

  // kind colors the section the same way the chips of that kind are colored in
  // the routine, so "widget", "value" and "property" mean the same thing here as
  // they do in the sentence; the arrow and the highlight say which one is open
  addAccordionSection(title, contentHTML='', kind=null) {
    const isFirst = !$('.accordion-section', this.domElement);
    const section = div(this.domElement, 'accordion-section', `
      <h3>${title}</h3>
      <div class=accordion-content>${contentHTML}</div>
    `);
    if(kind)
      section.dataset.kind = kind;
    const open = _=>{
      for(const toClose of $a('.accordion-section', this.domElement)) {
        toClose.classList.remove('open');
        $('.accordion-content', toClose).classList.remove('open');
      }
      section.classList.add('open');
      $('.accordion-content', section).classList.add('open');
    };
    $('h3', section).addEventListener('click', e=>{
      e.stopPropagation();
      open();
      this.moveIntoView();
    });
    if(isFirst)
      open();
    return [ $('h3', section), $('.accordion-content', section) ];
  }

  addCloseButton() {
    if($('.popup-close', this.domElement))
      return;
    const close = document.createElement('span');
    close.className = 'material-symbols popup-close';
    close.textContent = 'close';
    close.title = 'Close';
    focusable(close, _=>this.hide());
    // in the title bar where the popup has one, otherwise the first child so the
    // sticky float stays in the top right corner while scrolling
    const h1 = $('h1', this.domElement);
    if(h1)
      h1.append(close);
    else
      this.domElement.prepend(close);
  }

  hide() {
    if(openPopups.indexOf(this) != -1)
      openPopups.splice(openPopups.indexOf(this), 1);
    if(this.source && this.source.classList)
      this.source.classList.remove('popupSource');
    // a popup opened from a button inside this one (the info tip of a section
    // title) belongs to it: every popup is appended to #editor rather than to
    // the one it came from, so without this it stays on screen anchored to an
    // element that is no longer in the document - and a click outside does not
    // dismiss it either, because that click is inside a popup
    for(const above of [ ...openPopups ])
      if(above.source && this.domElement.contains(above.source))
        above.hide();
    if(this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    if(this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    document.removeEventListener('click', this.boundOnOutsideClick);
    document.removeEventListener('keydown', this.boundOnKeyDown, true);
    this.domElement.remove();
    for(const listener of this.cancelListeners)
      listener();
    this.cancelListeners = [];
  }

  // a popup that lets the user click widgets in the room must not cover the play
  // area - the widgets it wants to select are in there
  avoidsPlayArea() {
    return false;
  }

  // the part of the screen the popup may use: everything except the module
  // button strip on the right edge, minus the play area for widget pickers
  placementLimits() {
    const sidebar = $('#editorSidebar');
    const limits = { left: 0, top: 0, right: window.innerWidth - (sidebar ? sidebar.offsetWidth : 0), bottom: window.innerHeight };
    const roomArea = this.avoidsPlayArea() && $('#roomArea');
    if(!roomArea)
      return limits;
    // the play area sits along one edge (below the modules on a portrait phone,
    // left of them on a wide screen), so use the biggest strip it leaves over
    const room = roomArea.getBoundingClientRect();
    const strips = [
      Object.assign({}, limits, { bottom: Math.min(limits.bottom, room.top) }),
      Object.assign({}, limits, { top: Math.max(limits.top, room.bottom) }),
      Object.assign({}, limits, { right: Math.min(limits.right, room.left) }),
      Object.assign({}, limits, { left: Math.max(limits.left, room.right) })
    ].filter(s=>s.right-s.left >= 240 && s.bottom-s.top >= 160);
    strips.sort((a, b)=>(b.right-b.left)*(b.bottom-b.top) - (a.right-a.left)*(a.bottom-a.top));
    return strips[0] || limits; // no strip is usable: covering the room beats being unusable
  }

  // Whether the control the popup hangs off has to stay readable while it is
  // open. It does where the popup edits that control - a routine chip is the
  // sentence the parameter belongs to. An info tip is not about its own button:
  // that button is a 14px glyph with nothing to read on it, while the tip is
  // prose that wants every line of height it can get.
  avoidsSource() {
    return true;
  }

  // The popup is the control it hangs off, opened up: a parameter popup that
  // lands on its own chip hides the sentence it is about (on a phone it swallows
  // the whole routine), and the chip going away with the popup is what says the
  // editor has moved on. So the popup keeps to the strip above or below that
  // control - the roomier of the two - as long as one of them can hold a popup
  // at all; where neither can, being usable still beats being clear of it.
  limitsAroundSource(limits) {
    if(!this.avoidsSource() || !this.source || !this.source.isConnected)
      return limits;
    const source = this.source.getBoundingClientRect();
    if(!source.width && !source.height)
      return limits;
    const above = Object.assign({}, limits, { bottom: Math.min(limits.bottom, source.top) });
    const below = Object.assign({}, limits, { top: Math.max(limits.top, source.bottom) });
    const height = strip=>strip.bottom-strip.top;
    const strip = height(below) >= height(above) ? below : above;
    return height(strip) >= 240 ? strip : limits;
  }

  // A popup that is taller than the room it has scrolls, which puts whatever is
  // at its bottom out of sight with nothing saying it is there: the button a
  // section is for is the last thing in it, so "Use these widgets" is exactly
  // what a too-long list of widget ids pushes below the fold. The lists in a
  // popup scroll on their own anyway, so the height that is missing is taken
  // from them rather than from the popup - the list gets shorter, everything
  // around it stays where it can be seen and reached.
  fitScrollAreas() {
    const lists = [ ...$a(popupScrollAreas, this.domElement) ].filter(list=>list.offsetParent !== null);
    if(!lists.length)
      return;
    // start from their full height every time: what does not fit changes with
    // the section that is open, the search term and the size of the window
    for(const list of lists)
      list.style.maxHeight = '';
    // shrinking a list reflows what is around it, so ask again rather than
    // assume the popup got shorter by exactly as much as the list did
    for(let pass=0; pass<3; ++pass) {
      let missing = this.domElement.scrollHeight - this.domElement.clientHeight;
      if(missing <= 0)
        break;
      let shrank = false;
      for(const list of lists) {
        if(missing <= 0)
          break;
        const height = list.getBoundingClientRect().height;
        const shrunk = Math.max(popupScrollAreaMinHeight, height-missing);
        if(shrunk >= height)
          continue;
        list.style.maxHeight = `${shrunk}px`;
        missing -= height-shrunk;
        shrank = true;
      }
      if(!shrank) // nothing left to give: the popup scrolls after all
        break;
    }
    // the mark that says a list is cut off (a rule and a fade below its last
    // row) is set when the list is filled, before it is known how tall it may be
    for(const list of lists)
      if(list.classList.contains('popup-property-list'))
        list.classList.toggle('popup-property-list-complete', list.scrollHeight <= list.clientHeight);
  }

  moveIntoView() {
    const limits = this.limitsAroundSource(this.placementLimits());
    // shrink into the available strip instead of hanging out of it
    this.domElement.style.maxWidth = `${Math.min(window.innerWidth/2, limits.right-limits.left-20)}px`;
    this.domElement.style.maxHeight = `${Math.min(window.innerHeight-20, limits.bottom-limits.top-20)}px`;
    const wanted = this.domElement.getBoundingClientRect(); // where it wants to be
    // How wide the popup lays itself out is limited by how far its left edge is
    // from the right edge of the screen (it is fixed, with no right), so its
    // width where it currently sits is not the width it will have where it is
    // about to be put - and moving it would change the width again, in circles.
    // Measured at the left end of the room it may use, it is the width it keeps
    // at every position that fits it, which is every position placed below.
    this.domElement.style.left = `${limits.left+10}px`;
    // at the width it keeps as well: how tall the content is depends on it
    this.fitScrollAreas();
    const rect = this.domElement.getBoundingClientRect();
    const fit = (position, size, from, to)=>Math.min(Math.max(position, from+10), Math.max(from+10, to-10-size));
    this.domElement.style.left = `${fit(wanted.left, rect.width, limits.left, limits.right)}px`;
    this.domElement.style.top = `${fit(wanted.top, rect.height, limits.top, limits.bottom)}px`;
    // the size it was placed with, so that a later resize is only followed when
    // the content really changed
    this.placedSize = { width: rect.width, height: rect.height };
  }

  notifyChangeListeners(value) {
    for(const listener of this.changeListeners) {
      listener(value);
    }
  }

  onClick(e) {
    // clicks inside the popup never close it; that is what the close button,
    // the Escape key and clicks outside all popups are for
    e.stopPropagation();
  }

  onKeyDown(e) {
    // only the top-most popup reacts so nested info popups close one at a time
    if(e.key == 'Escape' && openPopups[openPopups.length-1] === this) {
      e.stopPropagation();
      popupHandledEscape = true;
      this.hide();
    }
  }

  onOutsideClick(e) {
    // clicks inside any popup (e.g. a nested info popup) never dismiss other popups
    if(e.target.closest && e.target.closest('.inline-popup'))
      return;
    // and neither does one that only ended outside because a text selection was
    // dragged out of a popup's input (e.detail is 0 for clicks from the keyboard)
    if(e.detail && popupMouseDownTarget && popupMouseDownTarget.closest && popupMouseDownTarget.closest('.inline-popup'))
      return;
    // a control that re-renders its list (the row that adds a name/value pair)
    // is gone from the document by the time the click reaches here, so asking
    // where it sits answers "nowhere" - which used to read as a click outside
    // and closed the popup after every entry
    if(e.target && e.target.isConnected === false)
      return;
    if(!this.domElement.contains(e.target))
      this.hide();
  }

  registerCancelListener(listener) {
    this.cancelListeners.push(listener);
  }

  registerChangeListener(listener) {
    this.changeListeners.push(listener);
  }

  reset() {
    // also drop document listeners from a previous show() so a bubbling click
    // that re-opens this popup cannot immediately close it again
    document.removeEventListener('click', this.boundOnOutsideClick);
    document.removeEventListener('keydown', this.boundOnKeyDown, true);
    this.domElement.innerHTML = '';
    this.changeListeners = [];
    this.cancelListeners = [];
  }

  setSource(source) {
    this.source = source;
  }

  // the title is its own element inside the h1 so that the close button, the info
  // button and the raw name of what is edited can live in the same title bar
  setTitle(title) {
    let h1 = $('h1', this.domElement);
    if(!h1) {
      h1 = document.createElement('h1');
      this.domElement.prepend(h1);
      const close = $('.popup-close', this.domElement);
      if(close)
        h1.append(close);
    }
    let text = $('.popup-title-text', h1);
    if(!text) {
      text = document.createElement('span');
      text.className = 'popup-title-text';
      h1.prepend(text);
    }
    text.textContent = title;
    return text;
  }

  show() {
    const sourceRect = this.source.getBoundingClientRect();
    // which control this popup belongs to, in that control's own color: the
    // outline appearing and going away is what ties the two together, in
    // particular when the editor moves on and takes the popup with it
    if(this.source.classList)
      this.source.classList.add('popupSource');
    $('#editor').append(this.domElement);
    this.domElement.style.left = `${sourceRect.left}px`;
    this.domElement.style.top = `${sourceRect.bottom}px`;
    this.moveIntoView();
    this.addCloseButton();
    if(openPopups.indexOf(this) == -1)
      openPopups.push(this);
    this.domElement.addEventListener('click', this.boundOnClick);
    // capture phase so Escape only closes the popup instead of also deselecting in the editor
    document.addEventListener('keydown', this.boundOnKeyDown, true);
    // defer so the click that opened the popup doesn't immediately close it
    setTimeout(_=>document.addEventListener('click', this.boundOnOutsideClick), 0);
    // move back into view when the content grows after opening, e.g. when
    // picking widgets in the room adds rows to the popup near the bottom edge.
    // Only childList is observed: watching style/class would feed moveIntoView's
    // own style writes back into the observer (and picker inputs toggle classes
    // constantly), so it stays limited to actual content changes.
    if(typeof MutationObserver != 'undefined' && !this.mutationObserver) {
      this.mutationObserver = new MutationObserver(_=>this.moveIntoView());
      this.mutationObserver.observe(this.domElement, { childList: true, subtree: true });
    }
    // The popup also changes size without its content changing - a picker lays
    // itself out, a swatch grid rewraps once the width is clamped - and the
    // position computed for the size before that hangs it over the module button
    // strip or over the control it belongs to. Only a real change of size is
    // followed, so moveIntoView's own writes (which leave the size as it found
    // it) cannot feed themselves back in here.
    if(typeof ResizeObserver != 'undefined' && !this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(_=>{
        const rect = this.domElement.getBoundingClientRect();
        if(!this.placedSize || Math.abs(rect.width-this.placedSize.width) >= 1 || Math.abs(rect.height-this.placedSize.height) >= 1)
          this.moveIntoView();
      });
      this.resizeObserver.observe(this.domElement);
    }
  }
}

// Every popup of the editor belongs to the widget that is being edited: it hangs
// off a control (a chip of a routine, the button that adds one) that is thrown
// away as soon as the editor moves on to another widget, so it would be left
// floating over the new one with nothing behind it. A click outside dismisses a
// popup, but a click that selects another widget in the room is not one for the
// popups that read the room - the widget pickers take the clicks in there - and
// a selection also changes without any click at all: deleting the widget, an
// undo, or a new state arriving from the server.
// Closing is not always a pure dismissal: the pickers that only write their
// parameter when the popup goes away (color, icon, sound, key/value and string
// lists) apply what was picked, exactly as they do on a click outside. That
// write goes to the widget the popup belonged to, which is why this runs after
// the editor has moved on rather than in the middle of it - and why it is said
// out loud: the widget that was written to is not on screen any more, so "it was
// saved" and "I lost it" would look exactly the same.
function closeEditorPopups() {
  const applied = [];
  for(const popup of [ ...openPopups ]) {
    popup.hide();
    if(popup.appliedOnHide) {
      applied.push(popup.appliedOnHide);
      popup.appliedOnHide = null;
    }
  }
  closePropertyInfoPopup();
  closeEmojiVariantFlyout();
  for(const write of applied)
    editorNote(writeWords(write));
}

// Which of the widgets a write goes to are still there to take it, told apart
// exactly the way the sidebar tells them apart before writing (widgetStillExists
// in properties.js - the jest harness loads this file without it, so fall back
// to the identity half of that test there).
function writtenWidgets(widget) {
  const exists = typeof widgetStillExists == 'function'
    ? widgetStillExists
    : w=>!!w && !w.isBeingRemoved && widgets.get(w.id) === w;
  const targets = !widget ? [] : (widget.isMulti ? widget.widgets : [ widget ]);
  return { kept: targets.filter(exists), gone: targets.filter(w=>!exists(w)) };
}

// What a write that happened off screen reads like. A multi-selection can be
// half gone, and saying "set" for it would be as wrong as saying "not set": name
// the widgets it reached and the ones it did not.
function writeWords(write) {
  if(!write.goneIDs.length)
    return `${write.parameter} set to ${write.value} on ${write.widgetID}`;
  if(!write.keptIDs.length)
    return `${write.parameter} was not set to ${write.value}: ${write.widgetID} is gone`;
  return `${write.parameter} set to ${write.value} on ${write.keptIDs.join(', ')}: ${write.goneIDs.join(', ')} is gone`;
}

// a value in a line of feedback: what was typed for text, the JSON for the rest,
// cut off where it stops being a line
function shortValueWords(value) {
  const text = typeof value == 'string' ? value : JSON.stringify(value);
  if(typeof text != 'string')
    return 'nothing';
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

// A line of feedback for something the editor did that the user cannot see
// happening, in the corner of the module panel where the editing is: a write to
// a widget that has just left the screen, a mode that ended on its own. It says
// its piece and fades, so it never becomes part of the layout.
function editorNote(text) {
  const editor = $('#editor');
  if(!editor)
    return;
  let notes = $('#editorNotes');
  if(!notes) {
    notes = div(editor);
    notes.id = 'editorNotes';
  }
  // only the last few, so a burst of them cannot wall off the module panel
  while(notes.children.length >= 3)
    notes.firstChild.remove();
  const note = div(notes, 'editorNote');
  note.textContent = text;
  note.title = 'Click to dismiss';
  note.onclick = _=>note.remove();
  setTimeout(_=>note.classList.add('editorNoteFading'), 4000);
  setTimeout(_=>note.remove(), 5000);
}

// what a tutorial is called in words: the title of the popup it is offered from
// where there is one ("SELECT - Pick the widgets…" is a SELECT tutorial), and
// otherwise the file name without the part every one of them starts with
function tutorialWords(tutorialName, title) {
  if(typeof title == 'string' && title)
    return title.split(' - ')[0];
  return tutorialName.replace(/^functions-/, '').replace(/-/g, ' ');
}

class InfoPopup extends Popup {
  constructor(source, infoHTML, tutorialName=null, videoFilename=null, title=null) {
    super(source);
    this.infoHTML = infoHTML;
    this.tutorialName = tutorialName;
    this.videoFilename = videoFilename;
    this.title = title;
  }

  // several paragraphs of prose about a 14px "i": covering that button costs
  // nothing, halving the height the text may use costs a scrollbar
  avoidsSource() {
    return false;
  }

  show() {
    super.show();
    // the text is what an info popup is opened for, so it is never a section to
    // unfold - only the tutorial and the video below it are
    if(this.title)
      this.setTitle(this.title);
    div(this.domElement, 'content popup-info-text', this.infoHTML);
    // the link says what it opens: the name of the tutorial file read as a file
    // name, which is what it is
    // the room id is whatever the player typed on the welcome screen, so the link
    // is built as an element rather than as HTML - anything else puts that text
    // into the DOM of everybody who opens an info popup
    if(this.tutorialName) { // FIXME: using the same roomID more than once doesn't work yet if the tutorial is already in there (also in production?)
      const [ , tutorialContent ] = this.addAccordionSection('Tutorial');
      const link = document.createElement('a');
      link.href = `tutorial/${encodeURIComponent(this.tutorialName)}/ROOM:${encodeURIComponent(roomID)}-tutorials`;
      link.textContent = `Play the ${tutorialWords(this.tutorialName, this.title)} tutorial`;
      tutorialContent.append(link);
    }
    if(this.videoFilename)
      this.addAccordionSection('Video', `<video src="i/videos/${this.videoFilename}" controls></video>`);
    this.moveIntoView();
  }
}

// Every control of the routine editor is a span rather than a button (they sit
// inside sentences), so this is what gives one a keyboard: the tab order, the
// role a screen reader announces and Enter/Space doing what a click does.
function focusable(dom, onActivate) {
  dom.tabIndex = 0;
  dom.setAttribute('role', 'button');
  dom.addEventListener('click', e=>{
    e.stopPropagation();
    onActivate(e);
  });
  dom.addEventListener('keydown', e=>{
    if(e.key == 'Enter' || e.key == ' ') {
      e.preventDefault();
      e.stopPropagation();
      onActivate(e);
    }
  });
  return dom;
}

let openRoutinePopup = null; // only one parameter popup is open at a time

const predefinedVariableDescriptions = {
  playerName: 'name of the player who started the routine',
  playerColor: 'color of the player who started the routine',
  seatID: 'seat id of the player who started the routine (null without a seat)',
  seatIndex: 'seat index of the player who started the routine (null without a seat)',
  thisID: 'id of the widget that contains the routine',
  mouseCoords: '[x, y] cursor position of the player who started the routine',
  activePlayers: 'array of the names of all active players',
  activeColors: 'array of the colors of all active players',
  activeSeats: 'array of the ids of all occupied seats'
};

const predefinedCollectionDescriptions = {
  playerSeats: 'all seats occupied by the player who started the routine',
  activeSeats: 'all seats with an active player',
  thisButton: 'the widget that contains the routine (not necessarily a button)'
};

const routineWidgetPickerKey = 'routineWidgets';

let propertySuggestionListCounter = 0;

// the identifier syntax ${PROPERTY name OF widget} accepts (see widget.js):
// everything outside [A-Za-z0-9 _-] has to be escaped, and a leading $ makes the
// engine read the name from a variable, so it is kept as it is
const propertyIdentifier = '(?:[a-zA-Z0-9 _-]|\\\\u[0-9a-fA-F]{4})+';

function escapePropertyIdentifier(name) {
  const dollar = String(name).charAt(0) == '$' ? '$' : '';
  return dollar + String(name).slice(dollar.length).split('').map(c=>{
    if(c.match(/^[A-Za-z0-9 _-]$/))
      return c;
    return `\\u${('000' + c.charCodeAt(0).toString(16)).slice(-4)}`;
  }).join('').replace(/^PROPERTY /, 'PROPERTY\\u0020').replace(/ OF /g, '\\u0020OF ');
}

function unescapePropertyIdentifier(name) {
  return String(name).replace(/\\u([0-9a-fA-F]{4})/g, (_, code)=>String.fromCharCode(parseInt(code, 16)));
}

function propertyReference(property, widgetID) {
  const of = widgetID ? ` OF ${escapePropertyIdentifier(widgetID)}` : '';
  return `\$\{PROPERTY ${escapePropertyIdentifier(property)}${of}\}`;
}

// { property, widget } of a value that is nothing but a property reference, so
// the property builder can start from the value the parameter already has
function parsePropertyReference(value) {
  if(typeof value != 'string')
    return null;
  // the name is matched lazily, exactly like the engine does, so the first " OF "
  // ends it - which is why escapePropertyIdentifier escapes one inside a name
  const match = value.match(new RegExp(`^\\$\\{PROPERTY (\\$?${propertyIdentifier}?)(?: OF (\\$?${propertyIdentifier}))?\\}$`));
  if(!match)
    return null;
  return { property: unescapePropertyIdentifier(match[1]), widget: match[2] ? unescapePropertyIdentifier(match[2]) : '' };
}

class RoutinePopup extends Popup {
  constructor(source) {
    super(source);
  }

  hide() {
    if(openRoutinePopup === this)
      openRoutinePopup = null;
    // a popup that offers the widget picker starts in-room picks, so end them
    // when it goes away; other popups (e.g. info popups) must not interfere
    if(isWidgetPickerActive(null, routineWidgetPickerKey))
      stopWidgetPicker();
    super.hide();
  }

  // The pickers that keep what is picked in a working value and write it to the
  // routine only when the popup goes away: a color is picked by dragging and a
  // list is edited row by row, so there is no single moment to write on before
  // that. Closing is that moment however the popup is closed - the close button,
  // a click outside, or the editor moving on to another widget. That last one is
  // why the write is remembered here: closeEditorPopups() says it out loud,
  // because the widget it went to is off screen by then.
  applyWorkingValueOnHide() {
    // notifyChangeListeners makes newRoutineValues call hide() again, so guard
    // against re-entering the notify
    if(!this.workingChanged || this.applied)
      return;
    this.applied = true;
    const parameter = this.parameterNames[0];
    const widget = this.widget;
    // Exactly the test the write itself goes through, so the note cannot claim
    // a value the sidebar then drops: a pile that is dissolving is still in
    // widgets under its own id for the three property changes it takes to get
    // there, and widgetStillExists is the only thing that knows that.
    const written = writtenWidgets(widget);
    this.appliedOnHide = {
      parameter: `${(this.operation && this.operation.func) || 'var'} ${parameter}`,
      value: shortValueWords(this.workingValue),
      widgetID: widget && widget.id,
      keptIDs: written.kept.map(w=>w.id),
      goneIDs: written.gone.map(w=>w.id)
    };
    this.notifyChangeListeners({ [parameter]: this.workingValue });
  }

  // the property builder's widget picker needs the room visible while it is open
  avoidsPlayArea() {
    return this.usesRoomAsInput();
  }

  // whether a click in the play area is an answer this popup is waiting for
  // rather than a click outside it. Only the pickers that take widgets from the
  // room are: a popup that merely keeps out of the play area (so that what it
  // opens is not covered by it) must still be dismissed by a click in there -
  // that click selects another widget, which is a different editor than the one
  // the popup was opened in.
  usesRoomAsInput() {
    return this.propertyPickerShown || this.needsRoomForPicker();
  }

  needsRoomForPicker() {
    return false;
  }

  offersUseDefault() {
    return true;
  }

  // what the popup asks, in words: its title says "MOVE - which widgets" rather
  // than "MOVE - parameters from / collection", which is the engine's vocabulary
  // (the raw names are next to it, the way the routine cards name their
  // operation and the automation headers their property)
  parameterQuestion() {
    return 'which value';
  }

  // every popup shows the raw value as editable text; the ones whose own input
  // already is the whole value (JSON, the operation itself) do not need it twice
  offersValueInput() {
    return true;
  }

  valueInputHint() {
    return null;
  }

  onClick(e) {
  }

  onOutsideClick(e) {
    // clicking widgets in the room is how the widget picker works - and a picker
    // that takes a single widget has already stopped itself by the time the
    // click arrives here, so while this popup offers the room as an input, a
    // click in it is that input rather than a click outside the popup
    if(isWidgetPickerActive(null, routineWidgetPickerKey))
      return;
    if(this.usesRoomAsInput() && e.target.closest && e.target.closest('#roomArea'))
      return;
    super.onOutsideClick(e);
  }

  setNewCollectionValue(value) {
    this.setNewValue(value);
  }

  setNewValue(value) {
    this.notifyChangeListeners({ [this.parameterNames[0]]: value });
  }

  // the value the chip stands for: the parameter that is set (a chip can offer
  // alternatives like {holder,collection}), otherwise the first one
  currentValue() {
    if(!this.operation || typeof this.operation != 'object')
      return undefined;
    const set = this.parameterNames.filter(p=>typeof this.operation[p] != 'undefined');
    return this.operation[set.length ? set[0] : this.parameterNames[0]];
  }

  valueAsText(value) {
    if(value === undefined)
      return '';
    return typeof value == 'string' ? value : JSON.stringify(value);
  }

  // a raw text edit means JSON where that is what was typed (numbers, booleans,
  // arrays, objects) and a plain string otherwise - a bare word, and anything
  // else that is not valid JSON, is almost always meant as text
  parseValueText(text) {
    try {
      const value = JSON.parse(text);
      return typeof value == 'string' ? text : value;
    } catch(e) {
      return text;
    }
  }

  // what the text input does with an edit; the pickers collect it instead of
  // applying it right away
  applyValueInput(value) {
    this.setNewValue(value);
  }

  syncValueInput(value) {
    if(this.valueInput && document.activeElement !== this.valueInput)
      this.valueInput.value = this.valueAsText(value);
  }

  // the current value as editable text next to the button that drops it again -
  // the two things a parameter popup is opened for, above everything else
  renderValueRow() {
    this.valueInput = null;
    const row = document.createElement('div');
    row.className = 'popup-value-row';

    if(this.offersValueInput()) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'popup-value-input';
      input.value = this.valueAsText(this.currentValue());
      input.placeholder = this.valueInputHint() || 'value';
      input.title = 'The value of this parameter - edit it directly or use one of the sections below';
      input.addEventListener('change', _=>this.applyValueInput(this.parseValueText(input.value)));
      row.append(input);
      this.valueInput = input;
    }

    // an explicitly set parameter (other than the operation type itself) can be
    // reset to its default, which for IF.condition also restores the operand chips
    if(this.offersUseDefault() && this.parameterNames[0] != 'func' && this.operation && typeof this.operation == 'object' && this.parameterNames.some(p=>typeof this.operation[p] != 'undefined')) {
      const clear = button(row, 'use default', _=>{
        const values = {};
        for(const parameter of this.parameterNames)
          values[parameter] = undefined;
        this.notifyChangeListeners(values);
      });
      clear.className = 'popup-use-default';
      clear.title = 'Remove the explicit value and go back to the default';
    }

    if(row.firstChild)
      $('h1', this.domElement).after(row);
  }

  // "Property <name> of <widget>" instead of a plain list of properties: both
  // parts are editable, the name field suggests the properties the chosen widget
  // currently has (the way the CSS editor suggests selectors) and the widget
  // field gets the picker the rest of the editor uses
  renderPropertyBuilder(content) {
    const parsed = parsePropertyReference(this.currentValue()) || { property: '', widget: '' };
    // the shared picker's CSS is scoped to .editorModule
    const host = div(content, 'editorModule');
    const row = div(host, 'popup-property-row');

    div(row, 'popup-property-label').textContent = 'Property';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'popup-property-name';
    nameInput.placeholder = 'name';
    nameInput.value = parsed.property;
    const listID = `routinePropertySuggestions${++propertySuggestionListCounter}`;
    nameInput.setAttribute('list', listID);
    const datalist = document.createElement('datalist');
    datalist.id = listID;
    row.append(nameInput, datalist);

    div(row, 'popup-property-label').textContent = 'of';
    const widgetInput = document.createElement('input');
    widgetInput.type = 'text';
    widgetInput.className = 'popup-property-widget';
    widgetInput.placeholder = 'this widget'; // an empty target means the widget the routine is on
    widgetInput.value = parsed.widget;
    row.append(widgetInput);

    // the suggestions are the properties of the widget the value is read from
    const suggestionsFor = _=>{
      const targetID = widgetInput.value.trim();
      const target = targetID && typeof widgets != 'undefined' && widgets.get(targetID);
      return Object.keys(((target || this.widget || {}).state) || {}).sort();
    };
    const updateSuggestions = _=>{
      datalist.innerHTML = '';
      for(const property of suggestionsFor()) {
        const option = document.createElement('option');
        option.value = property;
        datalist.append(option);
      }
    };
    updateSuggestions();
    widgetInput.addEventListener('input', updateSuggestions);

    const apply = _=>{
      const property = nameInput.value.trim();
      nameInput.classList.toggle('inputError', !property);
      if(property)
        this.setNewValue(propertyReference(property, widgetInput.value.trim()));
    };

    const controls = renderWidgetSelectPopout(host, this.widget, {
      title: 'Read the property from',
      pickerKey: routineWidgetPickerKey,
      allowSelf: true, // a routine regularly reads a property of its own widget
      getSelectedIDs: _=>widgetInput.value.trim() ? [ widgetInput.value.trim() ] : [],
      apply: widgetID=>{
        widgetInput.value = widgetID;
        updateSuggestions();
        // with the property named already, picking the widget is the last thing
        // the value was missing - waiting for another click on "use property"
        // only leaves the popup looking like it did nothing
        if(nameInput.value.trim())
          apply();
      },
      onClear: _=>{
        widgetInput.value = '';
        updateSuggestions();
      },
      clearLabel: 'This widget'
    });
    controls.expandButton.title = 'Pick the widget to read the property from';
    widgetInput.after(controls.expandButton); // the popout stays below the row
    const expand = controls.expandButton.onclick;
    controls.expandButton.onclick = e=>{
      expand(e);
      // picking in the room only works while the popup does not cover it
      this.propertyPickerShown = controls.popout.style.display != 'none';
      this.moveIntoView();
    };

    for(const input of [ nameInput, widgetInput ])
      input.addEventListener('keydown', e=>{
        if(e.key == 'Enter')
          apply();
      });
    button(host, 'use property', apply);
  }

  setOperationDetails(operation, parameterNames, widget, variables, collections) {
    this.operation = operation;
    this.parameterNames = parameterNames;
    this.widget = widget;
    this.variables = variables;
    this.collections = collections;
  }

  // One section per kind of thing the routine offers instead of four groups in
  // one: a value and a group of widgets are two different answers to "what can
  // I put here", so they are two sections, each in the color the sentence uses
  // for it - and only one of them is open at a time. Where an entry comes from
  // is a plain line inside the section rather than a heading of its own color.
  renderRoutineValueSection(showVariables, showCollections) {
    if(showVariables)
      this.renderRoutineValueKindSection('Values the routine has', 'variable', `
        <pre>
        The values the routine itself can offer, by the name they are stored under.

        Earlier operations remember values under a name: [COUNT] and [GET] store what they counted or read, [VAR] and [var] store what you calculate, and [CALL] stores what another routine returned. Picking one here uses whatever it holds when the routine runs.

        The ones below "In every routine" are there without any operation creating them.
        </pre>
      `, [
        { title: 'From earlier operations', list: [ ...this.variables ].sort().map(variable=>({
          label: variable,
          onClick: _=>this.setNewValue(`\$\{${variable}\}`)
        })) },
        { title: 'In every routine', list: Object.keys(predefinedVariableDescriptions).map(variable=>({
          label: variable, description: predefinedVariableDescriptions[variable],
          onClick: _=>this.setNewValue(`\$\{${variable}\}`)
        })) }
      ]);

    if(showCollections)
      this.renderRoutineValueKindSection('Groups of widgets the routine has', 'collection', `
        <pre>
        A collection is a group of widgets an earlier [SELECT] picked out, by the name it is stored under. Operations that act on widgets take one instead of a single widget.

        The ones below "In every routine" are there without any operation creating them.
        </pre>
      `, [
        { title: 'From earlier operations', list: [ ...this.collections ].sort((a, b)=>JSON.stringify(a) < JSON.stringify(b) ? -1 : 1).map(collection=>({
          label: typeof collection == 'string' ? collection : `[ ${collection.join(', ')} ]`,
          description: typeof collection == 'string' ? null : 'these widgets, listed in the routine itself',
          onClick: _=>this.setNewCollectionValue(typeof collection == 'string' ? collection : [ ...collection ])
        })) },
        { title: 'In every routine', list: Object.keys(predefinedCollectionDescriptions).map(collection=>({
          label: collection, description: predefinedCollectionDescriptions[collection],
          onClick: _=>this.setNewCollectionValue(collection)
        })) }
      ]);
  }

  // what each entry is stays a hover tip: written out below every button the
  // list turns into a wall of text nobody reads through
  renderRoutineValueKindSection(title, kind, infoHTML, groups) {
    const [ heading, content ] = this.addAccordionSection(title, '', kind);
    infoButton(heading, infoHTML);
    for(const group of groups) {
      if(!group.list.length)
        continue;
      div(content, 'popup-value-group').textContent = group.title;
      for(const entry of group.list) {
        const dom = div(content, 'popup-entry');
        const entryButton = button(dom, entry.label, entry.onClick);
        entryButton.dataset.kind = kind;
        entryButton.title = entry.description || group.title;
      }
    }
  }

  renderWidgetPropertySection() {
    const [ title, content ] = this.addAccordionSection('A property of a widget in the room', '', 'property');
    infoButton(title, `
      Wherever you use a value in an operation, you can use a property of any widget in the room instead.
      For example, you might want to put a score property on a card widget, then use that score in an operation.
      Pick the widget in the room (or leave it empty to read the property from the widget this routine belongs to) and choose one of its properties.
    `);
    this.renderPropertyBuilder(content);
  }

  show(showVariables=true, showCollections=true) {
    this.propertyPickerShown = false;
    if(openRoutinePopup && openRoutinePopup !== this)
      openRoutinePopup.hide();
    openRoutinePopup = this;
    super.show();
    const func = this.operation && this.operation.func;
    const title = this.setTitle(`${func || 'var'} - ${this.parameterQuestion()}`);
    // what this parameter is is the question the popup answers, so its info tip
    // is the parameter's own text rather than the whole operation's
    const info = this.parameterNames[0] == 'func' ? commonInfoButton(null, func) : commonParameterInfoButton(null, func, this.parameterNames[0]);
    if(info)
      title.after(info);
    const raw = document.createElement('span');
    raw.className = 'popup-title-raw';
    raw.textContent = this.parameterNames.join(' / ');
    raw.title = `The ${this.parameterNames.length > 1 ? 'parameters' : 'parameter'} this sets in the JSON of the operation`;
    $('h1', this.domElement).append(raw);

    this.renderValueRow();

    // where the popup picks a widget in the room, a property of a widget is the
    // next thing along the same line of thought, so it follows right behind that
    // section instead of behind the values the routine remembers
    const propertyBehindPicker = showVariables && this.needsRoomForPicker();
    if(propertyBehindPicker)
      this.renderWidgetPropertySection();
    if(showVariables || showCollections)
      this.renderRoutineValueSection(showVariables, showCollections);
    if(showVariables && !propertyBehindPicker)
      this.renderWidgetPropertySection();

    this.moveIntoView();
  }
}

class RoutineOperationPopup extends RoutinePopup {
  constructor() {
    super();
  }

  offersValueInput() {
    return false; // this popup picks an operation, not a value
  }

  setNewValue(newOperation) {
    if(typeof newOperation == 'string') {
      this.notifyChangeListeners(newOperation);
    } else {
      // keep nothing of the old operation except the new func
      const newValue = {};
      for(const key in this.operation)
        newValue[key] = undefined;
      Object.assign(newValue, newOperation);
      this.notifyChangeListeners(newValue);
    }
  }

  // every operation there is, right away and in one list: a shortlist of "common
  // actions" only hides the other two thirds behind a second click. The list is
  // long, so a search box narrows it down by name or by what the sentence says.
  show() {
    super.show(false, false);
    // the generic "<func> - which value / func" title is jargon in the first
    // popup a new user sees, and there is no raw parameter worth naming here
    const h1 = $('h1', this.domElement);
    for(const generic of $a('.popup-title-raw, .info-button', h1))
      generic.remove();
    const title = this.setTitle(this.operation && this.operation.func ? `${this.operation.func} - change operation` : 'Add operation');
    const info = this.operation && this.operation.func ? commonInfoButton(null, this.operation.func) : null;
    if(info)
      title.after(info);

    const showEntries = _=>this.renderOperationEntries();

    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'popup-property-search';
    search.placeholder = 'Search operations...';
    this.domElement.append(search);
    this.searchInput = search;

    // how the list is read is a matter of taste rather than of the routine, so
    // the two settings follow the search box - the first thing a newcomer meets
    // is the way into the list, not two preferences about it - and they are
    // remembered for next time
    const settings = div(this.domElement, 'popup-list-settings');
    popupSetting(settings, 'Say what each operation is for', 'routineOperationDescriptions', true, showEntries);
    // grouped by default: 110 operations in one alphabetical scroll is the one
    // list somebody who does not know their names cannot navigate
    popupSetting(settings, 'Group them by what they do', 'routineOperationGrouping', true, showEntries);

    this.listElement = div(this.domElement, 'popup-operation-list');
    this.examples = routineOperationExamples();

    search.addEventListener('input', showEntries);
    showEntries();

    this.moveIntoView();
    search.focus(); // the list is long, so typing is where this popup is used from
  }

  // the operations the search term leaves over, either alphabetically (the order
  // the metadata is written in) or under the heading of what they are for
  renderOperationEntries() {
    const list = this.listElement;
    list.innerHTML = '';
    const term = this.searchInput.value.trim().toLowerCase();
    const matches = this.examples.filter(e=>!term || `${e.func} ${e.label || ''} ${e.description} ${e.example}`.toLowerCase().includes(term));
    const withDescription = popupSettingValue('routineOperationDescriptions', true);
    const grouped = popupSettingValue('routineOperationGrouping', true);

    // what the operation is for, not what one with nothing but its defaults
    // would say: the sentence of an operation that does not exist yet
    // describes the example, and every one of them starts with "the picked
    // widgets" - the list is read to find an operation, not to read a routine
    const addEntry = ({ func, label, description, example, newOperation })=>{
      const entry = div(list, 'popup-operation');
      entry.addEventListener('click', _=>this.setNewValue(newOperation));
      entry.title = withDescription ? example : `${description} - ${example}`;
      div(entry, 'popup-operation-func').textContent = label || func;
      if(withDescription)
        div(entry, 'popup-operation-example').textContent = description;
    };

    if(grouped) {
      // the groups in the order they are written in, not in the order the search
      // happens to leave them in - the list stays the same list while typing
      const titles = [ ...routineOperationGroups.map(group=>group.title), 'Other operations' ].filter(title=>matches.some(e=>e.group == title));
      for(const title of titles) {
        div(list, 'popup-operation-group').textContent = title;
        for(const example of matches.filter(e=>e.group == title))
          addEntry(example);
      }
    } else {
      for(const example of matches)
        addEntry(example);
    }
    if(!matches.length)
      div(list, 'popup-property-empty').textContent = 'No matching operation.';
  }
}

// The list behind the drop-down of a var statement: every way it can work out
// its value, grouped by what the operations are for. It is a menu like the ones
// a setting opens, only that 110 phrases need a search box and headings - so it
// borrows the operation picker's list rather than the four-entry menu's.
class RoutineComputeOperationPopup extends RoutinePopup {
  constructor(choices, current) {
    super();
    this.choices = choices;
    this.current = current;
  }

  offersUseDefault() {
    return false; // a statement always works its value out somehow
  }

  offersValueInput() {
    return false; // this popup picks an operation, not a value
  }

  show() {
    super.show(false, false);
    const h1 = $('h1', this.domElement);
    for(const generic of $a('.popup-title-raw, .info-button', h1))
      generic.remove();
    const title = this.setTitle('How the value is worked out');
    const info = infoButton(null, `
      <pre>
      Everything a var statement can work out, in the words it is said with.

      An operand is a number, a text, true/false/nothing, an empty list or box, or a value the routine remembers - never a bare word, which would be read as the operation itself. The editor writes whichever of those was typed.
      </pre>
    `, null, null, 'working out a value');
    if(info)
      title.after(info);

    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'popup-property-search';
    search.placeholder = 'Search operations...';
    this.domElement.append(search);
    this.searchInput = search;
    this.listElement = div(this.domElement, 'popup-operation-list');
    search.addEventListener('input', _=>this.renderComputeEntries());
    this.renderComputeEntries();
    this.moveIntoView();
    search.focus(); // the list is long, so typing is where this popup is used from
  }

  renderComputeEntries() {
    const list = this.listElement;
    list.innerHTML = '';
    const term = this.searchInput.value.trim().toLowerCase();
    const matches = this.choices.filter(choice=>!term || `${choice.operator} ${choice.word} ${choice.description}`.toLowerCase().includes(term));
    for(const group of [ ...new Set(matches.map(choice=>choice.group)) ]) {
      div(list, 'popup-operation-group').textContent = group;
      for(const choice of matches.filter(c=>c.group == group)) {
        const entry = div(list, 'popup-operation');
        if(choice.operator === this.current)
          entry.classList.add('selected');
        entry.title = choice.description || `${choice.operator || 'no operation'} - ${choice.word}`;
        entry.addEventListener('click', _=>this.notifyChangeListeners({ operator: choice.operator }));
        // read like the operation picker: what the statement stores in the
        // operation color, what it means underneath it in the text color. The
        // plain assignment stores no operation at all, so it has only the
        // meaning to show
        if(choice.operator)
          div(entry, 'popup-operation-func').textContent = choice.operator;
        div(entry, 'popup-operation-example').textContent = choice.word;
      }
    }
    if(!matches.length)
      div(list, 'popup-property-empty').textContent = 'No matching operation.';
  }
}

// a value offered as a button or a menu entry says what it means in the sentence
// rather than what is stored: the parameter's own wording (a table or a function
// of the value), and the value itself where it has none
function routineValueWords(value, display) {
  const words = typeof display == 'function' ? display(value) : display && display[value];
  return words != null ? String(words) : String(value);
}

// One entry of a menu: the phrase it would put into the sentence, and under it
// the sentence it would then read as - what a phrase does is the whole reason to
// pick it, so it is on screen rather than in a hover tip.
function menuEntry(appendTo, label, preview, onClick) {
  const entry = button(appendTo, '', onClick);
  entry.className = 'popup-menu-entry';
  div(entry, 'popup-menu-entry-label').textContent = label;
  if(preview && preview.trim() && preview.trim() != label.trim())
    div(entry, 'popup-menu-entry-preview').textContent = preview;
  return entry;
}

// The drop-down under the phrase a sentence starts with: one entry per way the
// operation can work, worded as the phrase that sentence would start with -
// nothing else. The phrases are the beginning of the sentence they produce, so
// an explanation under each of them says the same thing twice and turns picking
// one into reading a page; the whole sentence is a hover tip away.
class RoutineVariantMenu extends Popup {
  constructor(choices, currentID, title=null) {
    super();
    this.choices = choices;
    this.currentID = currentID;
    this.title = title;
  }

  show() {
    super.show();
    this.domElement.classList.add('popup-menu', 'popup-menu-plain');
    // every other popup of the editor says what it is for in a title bar - a
    // bare list with a floating x in the corner reads as an unfinished one
    this.setTitle(this.title || 'What this operation does');
    for(const choice of this.choices) {
      const entry = menuEntry(this.domElement, choice.lead, null, _=>this.notifyChangeListeners(choice.values));
      entry.title = `${choice.label}: ${choice.example}`;
      entry.classList.toggle('selected', choice.id === this.currentID);
      // a way of working writes the parameters that tell the ways apart, and one
      // of them may hold a value the game works out while it runs - picking any
      // entry (this one included) writes over it. That is worth a word on the
      // entry itself rather than a surprise afterwards, and it stays on the one
      // line every entry is: a phrase, and what picking it costs.
      if(choice.replaces && choice.replaces.length) {
        const note = document.createElement('span');
        note.className = 'popup-menu-entry-replaces';
        note.textContent = `replaces ${choice.replaces.join(' and ')}`;
        $('.popup-menu-entry-label', entry).append(note);
        entry.title += `\n\nPicking this replaces ${choice.replaces.join(' and ')}, which the game works out while the routine runs.`;
      }
    }
    this.moveIntoView();
  }
}

// The "+ option" button behind a sentence: everything the operation can say in
// addition to what it says now, worded as the phrase it would add. Picking one
// switches its parameters on; the x behind the phrase switches them off again.
class RoutineClausePopup extends RoutinePopup {
  // the same list of phrases also offers the kinds of line an INPUT dialog can
  // hold, which is a different thing to say about it
  constructor(options, info=null, infoTitle=null, title=null) {
    super();
    this.options = options;
    this.info = info;
    this.infoTitle = infoTitle;
    this.title = title;
  }

  offersUseDefault() {
    return false; // this popup adds a part of the sentence, it has no value of its own
  }

  offersValueInput() {
    return false;
  }

  // a list of phrases is a menu, not a form: no section saying "Options" around
  // a single list of options - but the same title bar every other popup has,
  // because a bare list with a floating x in the corner reads as an unfinished
  // one
  show() {
    if(openRoutinePopup && openRoutinePopup !== this)
      openRoutinePopup.hide();
    openRoutinePopup = this;
    Popup.prototype.show.call(this);
    this.domElement.classList.add('popup-menu');
    const header = this.setTitle(this.title || 'Add an option').parentNode;
    infoButton(header, this.info || `
      Everything this operation can do on top of what it does now. An option only shows up in the sentence while it is in use - the x behind it removes it again.
    `, null, null, this.infoTitle || 'the options of an operation');
    header.append($('.popup-close', this.domElement));
    for(const option of this.options)
      menuEntry(this.domElement, option.label, option.sentence, _=>this.notifyChangeListeners(option.values));
    this.moveIntoView();
  }
}

// What the drop-down of a setting reports back when the answer is none of its
// phrases: the caller (the chip in the sentence) then opens the full popup of
// the parameter, which can also hold a value the routine works out while it runs.
const routineFullPopupRequest = { openFullPopup: true };

// The drop-down behind a setting: the phrases it can say, worded the way the
// sentence words them, and the one it says now marked. A setting with a handful
// of fixed answers is picked from a list the same way the phrase a sentence
// starts with is - a popup with a title, a text field and three sections around
// four phrases is a form where a menu was needed.
class RoutineEnumMenu extends RoutinePopup {
  constructor(options={}) {
    super();
    this.options = options;
  }

  offersUseDefault() {
    return false; // a setting always has a value; the list is what changes it
  }

  offersValueInput() {
    return false;
  }

  show() {
    if(openRoutinePopup && openRoutinePopup !== this)
      openRoutinePopup.hide();
    openRoutinePopup = this;
    Popup.prototype.show.call(this);
    this.domElement.classList.add('popup-menu', 'popup-menu-plain');
    const current = this.currentValue();
    for(const value of this.options.values) {
      const entry = menuEntry(this.domElement, routineValueWords(value, this.options.display), null, _=>this.setNewValue(value));
      entry.classList.toggle('selected', value === current);
    }
    const other = menuEntry(this.domElement, this.options.otherLabel || 'something else…', null, _=>this.notifyChangeListeners(routineFullPopupRequest));
    other.classList.add('popup-menu-entry-other');
    other.title = 'Use a value the routine works out while it runs instead of one of these';
    this.moveIntoView();
  }
}

class RoutineStringPopup extends RoutinePopup {
  constructor() {
    super();
  }

  parameterQuestion() {
    return 'which text';
  }

  currentValue() {
    if(typeof this.operation == 'string') { // var statements and comments are strings
      const match = this.operation.match(/^var (\S+) = (.*)$/);
      const stringParts = { variable: match && match[1], expression: match && match[2], statement: this.operation, comment: this.operation.replace(/^\/\/\s?/, '') };
      const part = stringParts[this.parameterNames[0]];
      return part == null ? undefined : part;
    }
    return super.currentValue();
  }

  parseValueText(text) {
    return text; // a text parameter takes what was typed, quotes and all
  }

  show() {
    super.show(true, false);
    if(this.valueInput)
      this.valueInput.focus();
  }
}

// The property names to propose for a parameter that takes one, grouped by where
// they come from: the widget the routine belongs to, the rest of the room, and
// the standard properties the engine defines (the validator's tables are part of
// the editor bundle). Every name appears in the first group that has it.
// includeOwn=false leaves the widget's own properties out entirely (onEnter and
// onLeave set properties on the widget that entered, not on this one).
function proposedPropertyGroups(widget, includeOwn=true) {
  const groups = [];
  const seen = new Set();
  const addGroup = (title, names)=>{
    const fresh = [ ...new Set(names) ].filter(name=>name && !seen.has(name)).sort();
    for(const name of fresh)
      seen.add(name);
    if(fresh.length)
      groups.push({ title, names: fresh });
  };

  if(includeOwn)
    addGroup('This widget', Object.keys((widget && widget.state) || {}));

  // the handful of properties a routine sets over and over, in front of the
  // hundred the engine defines: the common case is a glance rather than a scan
  addGroup('Commonly set', [ 'x', 'y', 'owner', 'activeFace', 'movable', 'text', 'parent', 'rotation' ]);

  const inRoom = [];
  if(typeof widgets != 'undefined')
    for(const other of widgets.values())
      if(!widget || other.id != widget.id)
        inRoom.push(...Object.keys(other.state || {}));
  addGroup('Other widgets in this room', inRoom);

  const standard = [];
  if(typeof WIDGET_PROPERTIES != 'undefined')
    for(const type in WIDGET_PROPERTIES)
      standard.push(...Object.keys(WIDGET_PROPERTIES[type]));
  addGroup('Other standard properties', standard);

  return groups;
}

// Parameters that name a widget property (the property of GET/SET/SELECT/SCORE
// and of RESET): the value section proposes the names instead of leaving them to
// be typed from memory - which is where the typos in a routine usually are.
class RoutinePropertyNamePopup extends RoutineStringPopup {
  parameterQuestion() {
    return 'which property';
  }

  show() {
    const [ valueTitle, valueContent ] = this.addAccordionSection('Value', '', 'value');
    infoButton(valueTitle, `
      This parameter takes the name of a widget property.
      Any name works - a game can put its own properties on a widget - so the list is only a proposal:
      the properties this widget has, the ones the other widgets in the room use and the ones the engine defines itself.
    `);

    const search = document.createElement('input');
    search.className = 'popup-property-search';
    search.placeholder = 'Search properties...';
    valueContent.append(search);
    const list = div(valueContent, 'popup-property-list');

    const groups = proposedPropertyGroups(this.widget);
    const showEntries = _=>{
      list.innerHTML = '';
      const term = search.value.trim().toLowerCase();
      const current = this.currentValue();
      let shown = 0;
      let hidden = 0;
      for(const group of groups) {
        const matches = group.names.filter(name=>!term || name.toLowerCase().includes(term));
        const visible = matches.slice(0, Math.max(0, 200 - shown));
        hidden += matches.length - visible.length;
        shown += visible.length;
        if(!visible.length)
          continue;
        div(list, 'popup-property-group').textContent = group.title;
        for(const name of visible)
          button(list, name, _=>this.setNewValue(name)).classList.toggle('selected', name === current);
      }
      if(!shown)
        div(list, 'popup-property-empty').textContent = 'No matching property.';
      else if(hidden)
        div(list, 'popup-property-empty').textContent = `${hidden} more - refine the search.`;
      // the fade and the rule under the list only mean something while it is
      // taller than it may be - measured once the popup is on the page
      setTimeout(_=>list.classList.toggle('popup-property-list-complete', list.scrollHeight <= list.clientHeight), 0);
    };
    search.addEventListener('input', showEntries);
    showEntries();

    super.show();
  }
}

class RoutineNumberPopup extends RoutinePopup {
  parameterQuestion() {
    return 'which number';
  }

  constructor(options={}) {
    super();
    this.options = options;
  }

  needsRoomForPicker() {
    return !!this.options.widgetType; // only then it offers the room picker
  }

  // some number parameters also take strings, e.g. a property name or a seat id
  valueInputHint() {
    return this.options.textHint;
  }

  // everything this popup shows and takes is in the unit the sentence uses, and
  // scale is what that is worth in the one the engine stores (a time is said in
  // seconds and stored in milliseconds)
  scaled(value) {
    return this.options.scale && typeof value == 'number' ? value*this.options.scale : value;
  }

  currentValue() {
    const value = super.currentValue();
    return this.options.scale && typeof value == 'number' ? value/this.options.scale : value;
  }

  setNewValue(value) {
    // for parameter alternatives like {fillTo,count} the last one is the normal
    // parameter and the ones before it override it in the engine, so clear those
    const values = {};
    for(const parameter of this.parameterNames)
      values[parameter] = undefined;
    values[this.parameterNames[this.parameterNames.length-1]] = this.scaled(value);
    this.notifyChangeListeners(values);
  }

  show() {
    const [ valueTitle, valueContent ] = this.addAccordionSection('Value', '', 'value');
    infoButton(valueTitle, 'Use fixed values that will always behave the same way.');

    const specials = this.options.specialValues || [];
    for(const value of specials)
      button(valueContent, routineValueWords(value, this.options.display), _=>this.setNewValue(value));
    // starts at 0 because that is a meaningful value for most number parameters
    // (move/flip/rotate none, x/y/angle 0); "use default" is what clears a value.
    // A parameter whose numbers are none of them (a ROTATE angle) offers only its
    // own, with everything else a line of text away.
    if(!this.options.specialOnly)
      for(let i=0; i<=10; i++)
        if(specials.indexOf(i) == -1)
          button(valueContent, routineValueWords(i, this.options.display), _=>this.setNewValue(i));

    // a few number parameters name a widget instead (TURN turn takes a seat id),
    // so offer the picker for those as well
    if(this.options.widgetType) {
      const [ widgetTitle, widgetContent ] = this.addAccordionSection('Widgets in the room', '', 'widget');
      infoButton(widgetTitle, 'Use the id of a widget instead of a number: search it by id or pick it in the room.');
      // the properties module's picker CSS is scoped to .editorModule
      const host = div(widgetContent, 'editorModule');
      renderWidgetSelectPopout(host, this.widget, {
        pickerKey: routineWidgetPickerKey,
        inline: true,
        allowSelf: true,
        typeFilter: this.options.widgetType,
        getSelectedIDs: _=>typeof this.currentValue() == 'string' ? [ this.currentValue() ] : [],
        apply: widgetID=>this.setNewValue(widgetID)
      });
    }

    super.show(true, false);
  }
}

class RoutineEnumPopup extends RoutinePopup {
  parameterQuestion() {
    return 'which setting';
  }

  constructor(options={}) {
    super();
    this.options = options;
  }

  show() {
    const [ valueTitle, valueContent ] = this.addAccordionSection('Value', '', 'value');
    infoButton(valueTitle, 'Use fixed values that will always behave the same way.');
    // the choices read the way the sentence words them (">" is "is more than"),
    // so nothing is picked from a list that speaks a different language
    for(const option of this.options.values)
      button(valueContent, routineValueWords(option, this.options.display), _=>this.setNewValue(option));
    super.show(true, false);
  }
}

class RoutineWidgetIDPopup extends RoutinePopup {
  parameterQuestion() {
    return 'which widget';
  }

  constructor(options={}) {
    super();
    this.options = options;
    this.workingIDs = [];
  }

  needsRoomForPicker() {
    return true;
  }

  // whether a click in the room climbs past the card or pile it hit to whatever
  // lies under it. A parameter that takes any widget takes those two as well, so
  // it does not - only one that means holders, which cards are what cover.
  resolvesCovering() {
    return false;
  }

  show(showCollections=false) {
    // the picker is the primary input here, so it comes first and open
    const [ title, content ] = this.addAccordionSection('Widgets in the room', '', 'widget');
    infoButton(title, `
      Search widgets by their id, filter them by type or pick them in the room, then apply the selection.
      The type filter also applies to picking in the room: with the type set to holder, a click on a card selects the holder it lies on.
    `);
    // seed the picker with the widgets the parameter already holds so applying
    // it without changes keeps the current value instead of clearing it
    const currentValue = this.operation && typeof this.operation == 'object' ? this.operation[this.parameterNames[0]] : null;
    const currentIDs = Array.isArray(currentValue) ? currentValue : (typeof currentValue == 'string' ? [ currentValue ] : []);
    // a collection name looks like a widget id but is none, so only keep ids
    // that exist - applying the picker must not turn a collection into widgets
    this.workingIDs = currentIDs.filter(id=>typeof id == 'string' && widgets.has(id));

    // the properties module's picker CSS is scoped to .editorModule, so render
    // into a matching wrapper to inherit its sizing
    const host = div(content, 'editorModule');
    renderWidgetSelectPopout(host, this.widget, {
      pickerKey: routineWidgetPickerKey,
      inline: true,
      multiple: true,
      allowSelf: true, // a routine regularly acts on the widget it belongs to
      resolveCovering: this.resolvesCovering(),
      typeFilter: this.options.widgetType, // preset from the parameter, changeable in the picker
      getSelectedIDs: _=>this.workingIDs,
      apply: widgetIDs=>this.workingIDs = widgetIDs,
      onClear: _=>this.workingIDs = [],
      clearLabel: 'Select none'
    });
    // the button that applies the picked widgets is what the section is for, so
    // it is the one filled button among the outlined ones instead of looking
    // like another way to change the selection
    button(content, 'Use these widgets', _=>this.setNewValue([ ...this.workingIDs ])).classList.add('primary');
    // a widget parameter takes a widget id, which a variable or widget property
    // can provide as well - e.g. ${PROPERTY parent} for the holder a button sits on
    super.show(true, showCollections);
  }
}

class RoutineHoldersOrCollectionSourcePopup extends RoutineWidgetIDPopup {
  parameterQuestion() {
    return 'which widgets';
  }

  constructor(options={}) {
    super(options);
  }

  // this parameter means the holders widgets are taken from, and a holder in the
  // room is under the cards lying on it
  resolvesCovering() {
    return true;
  }

  setNewCollectionValue(value) {
    // a collection (whether a name or an in-place array of widget ids) belongs to the
    // second parameter if there is one; the first (holder-like) parameter is cleared
    // because the engine prefers it over the collection
    const holderParameter = this.parameterNames[0];
    const collectionParameter = this.parameterNames[1];
    if(collectionParameter === undefined)
      this.notifyChangeListeners({ [holderParameter]: value });
    else
      this.notifyChangeListeners({ [holderParameter]: undefined, [collectionParameter]: value });
  }

  setNewValue(value) {
    // widget ids arrive as an array and belong to the first (holder-like) parameter;
    // a variable or widget property resolves to a widget id, so it goes there too;
    // collection names are strings and belong to the second parameter if there is one
    // - unless the operation names a holder right now, where a typed-over string is
    // the id of another one: editing "deck1" to "deck2" may not turn the holder into
    // a collection and leave the operation acting on nothing. The list of collections
    // sets one through setNewCollectionValue and is unaffected by this.
    const namesTheHolder = this.operation && typeof this.operation == 'object' && typeof this.operation[this.parameterNames[0]] != 'undefined';
    if(Array.isArray(value) || typeof value == 'string' && (namesTheHolder || value.match(/\$\{[^}]+\}/))) {
      const holderParameter = this.parameterNames[0];
      const collectionParameter = this.parameterNames[1];
      // clear the sibling collection (mirror of setNewCollectionValue) so a leftover
      // value can't re-surface as the source if the holder is later cleared
      if(collectionParameter === undefined)
        this.notifyChangeListeners({ [holderParameter]: value });
      else
        this.notifyChangeListeners({ [holderParameter]: value, [collectionParameter]: undefined });
    } else {
      this.setNewCollectionValue(value);
    }
  }

  show() {
    super.show(true);
  }
}

class RoutineJSONPopup extends RoutinePopup {
  parameterQuestion() {
    return 'which value, as JSON';
  }

  constructor() {
    super();
  }

  getCurrentValue() {
    return this.operation[this.parameterNames[0]];
  }

  offersValueInput() {
    return false; // the textarea below already holds the whole value
  }

  // what the textarea was typed into means, or undefined where it means nothing
  // (JSON.parse never returns undefined, so it is free as the "no" of this)
  parseTextareaValue(text) {
    try {
      return JSON.parse(text);
    } catch(e) {
      // a bare word (e.g. a sortBy property name) is almost always meant as a
      // string, so quote it automatically instead of rejecting the input
      return text.trim().match(/^[A-Za-z_][\w.-]*$/) ? text.trim() : undefined;
    }
  }

  valueSectionInfo() {
    return 'Enter a JSON value (object, array, string, number, boolean or null). A bare word is quoted automatically as a string.';
  }

  show() {
    // the current value is the most likely thing to edit, so it comes first and open
    const [ valueTitle, valueContent ] = this.addAccordionSection('Value', '', 'value');
    infoButton(valueTitle, this.valueSectionInfo());
    const textarea = document.createElement('textarea');
    const currentValue = this.getCurrentValue();
    textarea.value = JSON.stringify(typeof currentValue != 'undefined' ? currentValue : null, null, '  ');
    textarea.addEventListener('change', _=>{
      const newValue = this.parseTextareaValue(textarea.value);
      textarea.classList.toggle('inputError', newValue === undefined);
      if(newValue !== undefined)
        this.setNewValue(newValue);
    });
    valueContent.append(textarea);
    super.show(true, false);
    textarea.focus();
  }
}

// A plain list of values, edited as the list it is: one row per entry with the
// row that adds another one below, the same shape as the name/value rows. What
// a drop-down offers, the colors of a palette and the sides of a widget are all
// lists of one thing each, and writing them as JSON means typing the brackets
// and quotes around them by hand. An entry that is an object (a select entry
// that stores something other than what it shows) keeps its JSON so the file
// round-trips.
class RoutineStringListPopup extends RoutinePopup {
  constructor(options={}) {
    super();
    this.options = options;
    this.workingValue = null;
    this.workingChanged = false;
  }

  parameterQuestion() {
    return 'which values';
  }

  offersValueInput() {
    return false; // the rows below are the whole value
  }

  currentEntries() {
    return Array.isArray(this.workingValue) ? this.workingValue : [];
  }

  saveEntries(entries) {
    this.workingValue = entries;
    this.workingChanged = true;
  }

  hide() {
    this.applyWorkingValueOnHide(); // several entries in one go
    super.hide();
  }

  show() {
    const [ title, content ] = this.addAccordionSection('Value', '', 'value');
    infoButton(title, `
      One row per entry, in the order they are shown. Anything that is valid JSON (a number, true, an object) is stored as such, everything else as text.
    `);
    this.workingValue = this.operation && typeof this.operation == 'object' ? this.operation[this.parameterNames[0]] : null;
    this.listElement = div(content, 'popup-key-value-list');
    this.renderEntries();
    super.show(true, false);
  }

  renderEntries() {
    const list = this.listElement;
    list.innerHTML = '';
    const entryHint = this.options.entryHint || 'entry';

    for(const [ index, entry ] of this.currentEntries().entries()) {
      const row = div(list, 'popup-key-value-row');

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'popup-key-value-value';
      input.value = this.valueAsText(entry);
      input.placeholder = entryHint;
      // no re-render on an edit: it would take the focus out of the input
      input.addEventListener('change', _=>{
        const entries = [ ...this.currentEntries() ];
        entries[index] = this.parseValueText(input.value);
        this.saveEntries(entries);
      });
      row.append(input);

      const remove = document.createElement('span');
      remove.className = 'material-symbols popup-key-value-remove';
      remove.textContent = 'delete';
      remove.title = `Remove ${this.valueAsText(entry)}`;
      remove.addEventListener('click', _=>{
        this.saveEntries(this.currentEntries().filter((_e, i)=>i != index));
        this.renderEntries();
      });
      row.append(remove);
    }

    const addRow = div(list, 'popup-key-value-row popup-key-value-add');
    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.className = 'popup-key-value-value';
    addInput.placeholder = entryHint;
    addRow.append(addInput);

    const addEntry = _=>{
      if(!addInput.value.trim())
        return;
      this.saveEntries([ ...this.currentEntries(), this.parseValueText(addInput.value) ]);
      this.renderEntries();
      const next = $('.popup-key-value-add input', this.listElement);
      if(next)
        next.focus();
    };
    addInput.addEventListener('keydown', e=>{
      if(e.key == 'Enter')
        addEntry();
    });
    const addButton = button(addRow, 'add', addEntry);
    addButton.className = 'popup-key-value-add-button primary';
    const updateAddButton = _=>{
      addButton.disabled = !addInput.value.trim();
      addButton.title = addButton.disabled ? `Type the ${entryHint} first` : `Add ${addInput.value.trim()}`;
    };
    addInput.addEventListener('input', updateAddButton);
    updateAddButton();
  }
}

// A list of name/value pairs, edited as the list it is: one row per pair, the
// way the property sets of the Automations section are edited, plus a row that
// adds one - a VAR is a handful of names and what they get, and typing that as
// JSON means writing the braces and quotes around it by hand. The parameter is
// written when the popup closes, so several pairs are entered in one go.
class RoutineKeyValuePopup extends RoutinePopup {
  constructor(options={}) {
    super();
    this.options = options;
    this.workingValue = null;
    this.workingChanged = false;
  }

  parameterQuestion() {
    return 'which values';
  }

  offersValueInput() {
    return false; // the rows below are the whole value
  }

  currentPairs() {
    const value = this.workingValue;
    return value && typeof value == 'object' && !Array.isArray(value) ? value : {};
  }

  savePairs(pairs) {
    this.workingValue = pairs;
    this.workingChanged = true;
  }

  hide() {
    this.applyWorkingValueOnHide(); // one row of the pairs at a time
    super.hide();
  }

  show() {
    const [ title, content ] = this.addAccordionSection('Value', '', 'value');
    infoButton(title, `
      One row per name and the value it gets. Anything that is valid JSON (a number, true, null, an object) is stored as such, everything else as text.
    `);
    this.workingValue = this.operation && typeof this.operation == 'object' ? this.operation[this.parameterNames[0]] : null;
    this.listElement = div(content, 'popup-key-value-list');
    this.renderPairs();
    super.show(true, false);
  }

  renderPairs() {
    const list = this.listElement;
    list.innerHTML = '';
    const keyHint = this.options.keyHint || 'name';

    for(const key of Object.keys(this.currentPairs())) {
      const row = div(list, 'popup-key-value-row');

      const keyDOM = div(row, 'popup-key-value-key');
      keyDOM.textContent = key;
      keyDOM.title = key;

      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.className = 'popup-key-value-value';
      valueInput.value = this.valueAsText(this.currentPairs()[key]);
      valueInput.placeholder = 'value';
      // no re-render on an edit: it would take the focus out of the input
      valueInput.addEventListener('change', _=>{
        this.savePairs(Object.assign({}, this.currentPairs(), { [key]: this.parseValueText(valueInput.value) }));
      });
      row.append(valueInput);

      const remove = document.createElement('span');
      remove.className = 'material-symbols popup-key-value-remove';
      remove.textContent = 'delete';
      remove.title = `Remove ${key}`;
      remove.addEventListener('click', _=>{
        const next = Object.assign({}, this.currentPairs());
        delete next[key];
        this.savePairs(next);
        this.renderPairs();
      });
      row.append(remove);
    }

    // the row that adds one asks for both halves of a pair at once: a name on
    // its own is a variable with nothing in it, and having to add it before the
    // value can be typed is what made the popup look like it closed too early
    const addRow = div(list, 'popup-key-value-row popup-key-value-add');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'popup-key-value-name';
    nameInput.placeholder = keyHint;

    // the names the operations before this one already work with, so a value
    // that overwrites one of them is picked instead of typed out again
    const suggestions = (this.options.suggestions || []).filter(name=>typeof this.currentPairs()[name] == 'undefined');
    if(suggestions.length) {
      const datalist = document.createElement('datalist');
      datalist.id = `routineKeyValueSuggestions${++propertySuggestionListCounter}`;
      for(const name of suggestions) {
        const option = document.createElement('option');
        option.value = name;
        datalist.append(option);
      }
      addRow.append(datalist);
      nameInput.setAttribute('list', datalist.id);
    }
    addRow.append(nameInput);

    const addValueInput = document.createElement('input');
    addValueInput.type = 'text';
    addValueInput.className = 'popup-key-value-value';
    addValueInput.placeholder = 'value';
    addRow.append(addValueInput);

    const addPair = _=>{
      const key = nameInput.value.trim();
      if(!key || typeof this.currentPairs()[key] != 'undefined')
        return;
      this.savePairs(Object.assign({}, this.currentPairs(), { [key]: this.parseValueText(addValueInput.value) }));
      this.renderPairs();
      // the popup stays open for the next pair, with the cursor where it is typed
      const nextName = $('.popup-key-value-add .popup-key-value-name', this.listElement);
      if(nextName)
        nextName.focus();
    };
    for(const input of [ nameInput, addValueInput ])
      input.addEventListener('keydown', e=>{
        if(e.key == 'Enter')
          addPair();
      });
    // the button that puts the pair into the list is what the row is for, so it
    // is the filled one the popups use for the button that applies something
    const addButton = button(addRow, 'add', addPair);
    addButton.className = 'popup-key-value-add-button primary';
    // a button that does nothing until a name is typed says so instead of
    // swallowing the click
    const updateAddButton = _=>{
      const key = nameInput.value.trim();
      addButton.disabled = !key || typeof this.currentPairs()[key] != 'undefined';
      addButton.title = !key ? `Type the name of the ${keyHint} first` : (addButton.disabled ? `${key} is already in this list` : `Add ${key}`);
    };
    nameInput.addEventListener('input', updateAddButton);
    updateAddButton();
  }
}

class RoutineFullOperationJSONPopup extends RoutineJSONPopup {
  constructor() {
    super();
  }

  parameterQuestion() {
    return 'the whole operation, as JSON';
  }

  offersUseDefault() {
    return false; // this popup edits the entire operation, there is no default
  }

  getCurrentValue() {
    return this.operation;
  }

  valueSectionInfo() {
    return 'Enter the whole operation as a JSON object, or as the one line a var statement or a // comment is.';
  }

  // an operation is an object, or one of the two lines a routine may hold as a
  // string (a var statement, a comment) - a bare word is neither, and quoting it
  // would replace the operation with that word
  parseTextareaValue(text) {
    try {
      const value = JSON.parse(text);
      return typeof value == 'string' || value && typeof value == 'object' && !Array.isArray(value) ? value : undefined;
    } catch(e) {
      return undefined;
    }
  }

  setNewValue(value) {
    // this popup edits the entire operation instead of a single parameter, and
    // the consumer assigns what it is handed onto the operation rather than
    // replacing it - so a property the JSON no longer has is cleared explicitly
    if(typeof value == 'string')
      return this.notifyChangeListeners(value);
    const newValue = {};
    for(const key in this.operation)
      newValue[key] = undefined;
    this.notifyChangeListeners(Object.assign(newValue, value));
  }
}

// Reuses #3035's ColorInput/IconInput (the same pickers the properties sidebar
// uses) for color/icon parameters. The picker edits a local working value and
// the parameter is only written when the popup closes, so the native color
// dialog's live drag and the routine re-render don't fight each other.
class RoutinePickerPopup extends RoutinePopup {
  constructor() {
    super();
    this.workingValue = undefined;
    this.workingChanged = false;
  }

  inputClass() {
    return null;
  }

  valueHint() {
    return 'Use a fixed value that will always behave the same way.';
  }

  // the picker only writes the parameter when the popup closes, so a raw text
  // edit feeds the same working value instead of applying on its own
  applyValueInput(value) {
    this.workingValue = value;
    this.workingChanged = true;
    if(this.pickerInput && this.pickerInput.update)
      this.pickerInput.update(value);
  }

  hide() {
    // before super.hide()'s cancel listener, so its resolve(undefined) is
    // ignored once we have resolved with the value
    this.applyWorkingValueOnHide();
    super.hide();
  }

  show() {
    const [ valueTitle, valueContent ] = this.addAccordionSection('Value', '', 'value');
    infoButton(valueTitle, this.valueHint());
    this.pickerInput = null;
    this.workingValue = this.operation && typeof this.operation == 'object' ? this.operation[this.parameterNames[0]] : null;

    const InputClass = this.inputClass();
    if(typeof InputClass == 'function') {
      // a minimal stand-in for the properties module: the picker syncs through
      // getValue/setValue instead of the widget, so the listener is a no-op
      const module = { addPropertyListener() {}, inputValueUpdated() {} };
      const input = new InputClass(module, this.widget, '', {
        getValue: ()=>this.workingValue === undefined ? null : this.workingValue,
        getEffective: ()=>this.workingValue === undefined ? null : this.workingValue,
        setValue: v=>{
          this.workingValue = v;
          this.workingChanged = true;
          input.update(v);
          this.syncValueInput(v);
        },
        clearable: false
      });
      this.pickerInput = input;
      // the properties module's picker CSS is scoped to .editorModule, so render
      // into a matching wrapper to inherit the chip/picker sizing
      const host = div(valueContent, 'editorModule');
      input.render(host);
      if(input.openPicker)
        input.openPicker();
    }
    // without the properties module (e.g. jest) the value text input above is
    // the whole editor for the parameter

    super.show(true, false);
  }
}

class RoutineColorPopup extends RoutinePickerPopup {
  parameterQuestion() {
    return 'which color';
  }

  inputClass() {
    return typeof ColorInput != 'undefined' ? ColorInput : null;
  }

  valueHint() {
    return 'Pick a color, or type a hex value or "transparent".';
  }
}

class RoutineIconPopup extends RoutinePickerPopup {
  parameterQuestion() {
    return 'which icon';
  }

  inputClass() {
    return typeof IconInput != 'undefined' ? IconInput : null;
  }

  valueHint() {
    return 'Pick an icon from the ones used in this game or search the icon library.';
  }
}

// The sound an AUDIO plays, picked the same way clickSound is picked in the
// properties sidebar: the bundled sound library, an upload or a typed path,
// each of which can be played back before the routine is run.
class RoutineSoundPopup extends RoutinePickerPopup {
  parameterQuestion() {
    return 'which sound';
  }

  inputClass() {
    return typeof SoundInput != 'undefined' ? SoundInput : null;
  }

  valueHint() {
    return 'Pick a sound from the bundled library, upload one, or type the path of an audio file.';
  }

  // the sound library opens as an overlay over the board, so a popup sitting on
  // the play area would cover the very list it opens (and be covered by it on a
  // portrait window). Only where it is placed, though - the room is not one of
  // its inputs, so usesRoomAsInput stays false and a click on a widget in there
  // dismisses it like any other click outside.
  avoidsPlayArea() {
    return true;
  }

  // the sound library is an overlay of its own, so the click that picks a sound
  // in it happens outside this popup - closing it there would throw the pick
  // away before the picker hands it over
  onOutsideClick(e) {
    if(e.target.closest && e.target.closest('#audioPickerOverlay'))
      return;
    super.onOutsideClick(e);
  }

  // the play button goes with the popup, so a preview started in it would keep
  // playing with nothing left to stop it (stopSoundPreview lives in the
  // properties module, which jest does not load)
  hide() {
    if(typeof stopSoundPreview == 'function')
      stopSoundPreview();
    super.hide();
  }
}

// What a FOREACH repeats for, asked one way of repeating at a time: a range is
// three numbers and a list is what it holds, so a popup offering both under
// either of them invites a range where only entries work (and the other way
// round). Which one it asks for is the parameter the chip stands for.
class RoutineForeachSourcePopup extends RoutinePopup {
  parameterQuestion() {
    return this.options.range ? 'which numbers' : 'what to repeat for';
  }

  constructor(options={}) {
    super();
    this.options = options;
  }

  showRangeSection() {
    const [ rangeTitle, rangeContent ] = this.addAccordionSection('Range', '', 'value');
    infoButton(rangeTitle, 'Iterate over a range of numbers. The loopRoutine receives each number as the variable value.');
    const inputs = {};
    for(const name of [ 'start', 'end', 'step' ]) {
      const label = document.createElement('label');
      label.textContent = name;
      const input = document.createElement('input');
      input.type = 'number';
      inputs[name] = input;
      label.append(input);
      rangeContent.append(label);
    }
    // the range the operation already has, so changing only the step keeps the
    // start and the end instead of writing the example over them
    const current = this.currentValue();
    const seed = [ 1, 10, 1 ].map((fallback, index)=>Array.isArray(current) && typeof current[index] == 'number' ? current[index] : fallback);
    inputs.start.value = seed[0];
    inputs.end.value = seed[1];
    inputs.step.value = seed[2];
    button(rangeContent, 'use range', _=>this.setNewValue([ +inputs.start.value || 0, +inputs.end.value || 0, +inputs.step.value || 1 ]));
  }

  showEntriesSection() {
    const [ inTitle, inContent ] = this.addAccordionSection('Object / Array', '', 'value');
    infoButton(inTitle, 'Iterate over the entries of an object, array or string. The loopRoutine receives key and value for each entry.');
    const textarea = document.createElement('textarea');
    textarea.placeholder = '[ "first", "second" ]';
    const current = this.currentValue();
    if(current !== undefined)
      textarea.value = JSON.stringify(current, null, '  ');
    textarea.addEventListener('change', _=>{
      try {
        const value = JSON.parse(textarea.value);
        textarea.classList.remove('inputError');
        this.setNewValue(value);
      } catch(e) {
        textarea.classList.add('inputError');
      }
    });
    inContent.append(textarea);
  }

  show() {
    if(this.options.range)
      this.showRangeSection();
    else
      this.showEntriesSection();
    // a collection is the third way to repeat and has its own phrase in the
    // sentence, so it is not something either of these two is filled in with
    super.show(true, false);
  }
}

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, c=>({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// How a popup shows what it offers is remembered between sessions: it is a
// preference of whoever edits, not part of the game, so it lives in
// localStorage next to the rest of the editor's own state.
function popupSettingValue(key, fallback) {
  const stored = localStorage.getItem(`routineEditor.${key}`);
  return stored === null ? fallback : stored == 'true';
}

// a checkbox rather than one of the buttons around it: it switches something
// about the list on and off instead of picking a value for the operation
function popupSetting(appendTo, label, key, fallback, onChange) {
  const dom = document.createElement('label');
  dom.className = 'popup-setting';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = popupSettingValue(key, fallback);
  input.addEventListener('change', _=>{
    localStorage.setItem(`routineEditor.${key}`, input.checked);
    onChange();
  });
  dom.append(input, document.createTextNode(` ${label}`));
  appendTo.append(dom);
  return input;
}

function button(appendTo, text, onClick) {
  const button = document.createElement('button');
  button.textContent = text;
  button.addEventListener('click', onClick);
  appendTo.append(button);
  return button;
}

async function newRoutineValues(popup) {
  return new Promise(resolve=>{
    popup.reset();
    popup.show();
    popup.registerChangeListener(value=>{
      resolve(value); // before hide() so the cancel listener's resolve(undefined) is ignored
      popup.hide();
    });
    popup.registerCancelListener(_=>resolve(undefined));
  });
}

// strip the code indentation the template literals carry so <pre> blocks align left
function dedentInfoText(text) {
  const lines = text.split('\n');
  const indents = lines.filter(l=>l.trim()).map(l=>l.match(/^ */)[0].length);
  const strip = indents.length ? Math.min(...indents) : 0;
  return lines.map(l=>l.slice(strip)).join('\n');
}

function infoButton(appendTo, infoHTML, tutorialName=null, videoFilename=null, title=null) {
  // one glyph, whatever the topic offers: a second 14px symbol next to the first
  // says nothing to anyone who does not already know what it means, and the
  // tutorial and the video are sections of the popup it opens anyway
  const dom = div(appendTo, 'info-button', `<span class=material-symbols>info</span>`);
  dom.title = title ? `About ${title}` : 'What this does';
  infoHTML = structureInfoHTML(dedentInfoText(infoHTML));
  // topic names are restricted so literal brackets like [ "widget1", "widget2" ] stay untouched
  infoHTML = infoHTML.replace(/\[([A-Za-z.]+)\](?:\(([^)]+)\))?/g, (_, topicName, topicInfo)=>`<span class=highlight data-topic="${topicName}">${topicInfo != null ? topicInfo : topicName}</span>`);

  // an info tip is clicked open and clicked shut again: a tip that follows the
  // pointer opens itself while the pointer is only traveling past the button,
  // and it takes the text away again the moment somebody reaches for it. The
  // same click works with a finger and, through focusable(), with the keyboard.
  let popup = null;
  const toggle = _=>{
    if(popup) {
      popup.hide();
      popup = null;
      return;
    }
    popup = new InfoPopup(dom, infoHTML, tutorialName, videoFilename, title);
    popup.show();
    for(const highlight of $a('.highlight', popup.domElement))
      commonInfoButton(highlight, highlight.dataset.topic);
    popup.moveIntoView();
    popup.registerCancelListener(_=>{ popup = null; });
  };
  focusable(dom, toggle);
  return dom;
}

// The wiki texts are one <pre> block: prose, and in most of them a list of
// "name: type - what it does" lines. A popup is not a terminal, so the prose
// becomes paragraphs and the parameter lines a list whose names carry the color
// the sentence uses for a value - the same language the rest of the editor
// teaches, instead of 90 characters of monospace per line.
function structureInfoHTML(text) {
  return text.replace(/<pre>([\s\S]*?)<\/pre>/g, (_, body)=>{
    let html = '';
    let inList = false;
    const endList = _=>{
      html += inList ? '</dl>' : '';
      inList = false;
    };
    for(const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if(!line)
        continue;
      const parameter = infoParameterLine(line);
      if(parameter) {
        html += inList ? '' : '<dl class=popup-info-parameters>';
        inList = true;
        html += `<dt>${parameter.name}</dt><dd>${parameter.description}</dd>`;
        continue;
      }
      endList();
      if(line.match(/^[A-Za-z ]+:$/))
        html += `<div class=popup-info-heading>${line.replace(/:$/, '')}</div>`;
      else
        html += `<p>${line}</p>`;
    }
    endList();
    return html;
  });
}

// "count: number - limits the amount of moved widgets", i.e. a line naming one
// or more parameters (the texts write alternatives as "operand1 / operand2" and
// "x and y", and a name can carry a topic link) and then what they are for.
// Everything else is prose.
function infoParameterLine(line) {
  const colon = line.indexOf(':');
  const description = colon == -1 ? '' : line.slice(colon+1).trim();
  if(colon < 1 || !description)
    return null;
  const names = line.slice(0, colon);
  if(!names.split(/\/| and /).every(name=>name.replace(/\[[A-Za-z.]+\]|[()"]/g, '').trim().match(/^[A-Za-z0-9_$]+$/)))
    return null;
  return { name: names.trim(), description };
}

function commonInfoButton(appendTo, topicName, title=null) {
  const topic = commonInfoTopic(topicName);
  return topic ? infoButton(appendTo, topic.info, topic.tutorial || null, topic.video || null, title || topicName.replace('.', ' ')) : undefined;
}

function commonParameterInfoButton(appendTo, func, parameter) {
  const topic = parameterInfoTopic(func, parameter);
  return topic ? infoButton(appendTo, topic.info, topic.tutorial || null, topic.video || null, `${func} ${parameter}`) : undefined;
}

// Everything the editor knows about a single parameter of an operation: its own
// topic when there is one, otherwise the line the operation's text describes it
// with. Operations without a text of their own get nothing.
function parameterInfoTopic(func, parameter) {
  // a chip standing for a part of another parameter (a VAR's variableName is the
  // first half of variables) is described by the one it is a part of
  const spec = ((routineOperationMetadata[func] || {}).parameters || {})[parameter];
  if(spec && spec.describedBy)
    parameter = spec.describedBy;
  const own = commonInfoTopic(`${func}.${parameter}`);
  if(own)
    return own;
  const operation = commonInfoTopic(func);
  if(!operation)
    return null;
  const line = parameterInfoLine(operation.info, parameter);
  // no line of its own (the wiki text does not mention it): the whole text is
  // still the best the editor can offer
  if(!line)
    return operation;
  return { info: `<pre>${line}\n\nSee [${func}] for the whole operation.</pre>` };
}

// The line an operation's info text has for one of its parameters, e.g.
// "count: number - limits the amount of moved widgets (defaults to 1)." The
// texts list one parameter per line, sometimes several at once ("x and y: ...",
// "operand1 / operand2: ..."), and a name can carry a topic link.
function parameterInfoLine(infoHTML, parameter) {
  for(const line of dedentInfoText(infoHTML).split('\n')) {
    const colon = line.indexOf(':');
    if(colon == -1)
      continue;
    const names = line.slice(0, colon).split(/\/| and /).map(name=>name.replace(/\[[A-Za-z.]+\]|[()]/g, '').trim());
    if(names.indexOf(parameter) != -1)
      return line.trim();
  }
  return null;
}

// The wiki texts every info button in the routine editor is built from, keyed by
// operation name (plus a few parameter/term topics that need more than a line).
function commonInfoTopic(topicName) {
  if(topicName == 'COUNT') {
    return { info: `
      <pre>
      This function determines the size of a collection and stores the result in a variable.

      Parameters:

      collection: collection - specifies the collection of widgets to counts (defaults to DEFAULT collection).
      holder: holder id (or an array) - specifies the holder that contains the widgets to count (optional). When counting a holder, only child widgets that match the holder's dropTarget property are included. Note that the widgets specified here need not be holders.
      owner: playerName - filters the widgets in the collection or holder to only count widgets owned by the specified player. The default value, null, results in no filtering by owner.
      variable: variable name - specifies the variable to store the result in (defaults to variable "COUNT").
      </pre>
    `, tutorial: 'functions-count' };
  }
  if(topicName == 'MOVE') {
    return { info: `
      <pre>
      This function moves widgets into a target [holder]. If the target of the move is an occupied seat, then the move will instead direct the widgets to the hand associated with the seat. In this case, if the hand is set to childPerOwner, the owner will be set to the player in the seat.

      Parameters:

      [MOVE.from](from): widgetID (or an array) - specifies the widget(s) that contains the widgets to move. In the typical case, this would be a holder, but could be any widget with child widgets. If from is not specified, then the "DEFAULT" collection will be moved.
      collection: collection - specifies the collection that is to be moved (defaults to "DEFAULT"). When using a collection, omit the from parameter.
      to: widgetID (or an array) - specifies the widget(s) that widgets should be moved into. In the typical case, this would be a holder or seats, but could be any widget.
      count: number - limits the amount of moved widgets (defaults to 1). Can be 0 to move none, "all" to move every selected widget, a positive number to move that many of the selected widgets, or a negative number to leave that many of the selected widgets not moved.
      fillTo: number - fills the target holders/seats up to this number (defaults to null). If specified, then count is ignored.
      face: number - optionally sets the face of the moved widgets to the given value (see FLIP). If omitted, the widgets will be left as they are.
      Note that both count and fillTo will move an entire group to one of the to widgets. If there are enough widgets remaining in the from source, then it will move to the next destination. The order that the function picks targets for moving to is not well understood, so if there are less widgets in the from source than are required, game designers may want to account for that in the JSON in some other way.

      If the dropTarget property (when moving to a holder) does not match the widgets being moved, the widgets will become children of the holder, but will keep the original x,y coordinates. In other words, they will not follow the stackOffset rules for aligning child widgets.
      </pre>
    `, tutorial: 'functions-move' };
  }
  if(topicName == 'MOVE.from') {
    return { info: `
      <pre>
      The from parameter specifies the widget(s) that contains the widgets to move. In the typical case, this would be a holder, but could be any widget with child widgets. If from is not specified, then the "DEFAULT" collection will be moved.
      </pre>
    ` };
  }
  if(topicName == 'holder') {
    return { info: `
      <pre>
      A holder is a widget that contains other widgets.
      </pre>
    ` };
  }
  if(topicName == 'FOREACH') {
    return { info: `
      <pre>
      This function iterates over a collection, object, array, string, or range of values. The loopRoutine parameter specifies the actions to take on each iteration.

      If "in" is given, it is treated as an object, array, or string, and loopRoutine receives a key and a value for each entry.
      If "range" is given (format [start, end, step]), loopRoutine is called once per value in the range, receiving it as value.
      If "collection" is given (and "in"/"range" are not), loopRoutine is called once per widget, receiving widgetID and a DEFAULT collection containing that one widget.
      If none of these are given, the DEFAULT collection is used.

      Values supplied to loopRoutine (key, value, widgetID, DEFAULT) are local to that routine; changes to other, previously-defined variables persist after the loop.

      Parameters:

      in: object/array/string - iterate over its keys/indices and values.
      range: [start, end, step] - iterate over a numeric range.
      collection: collection - the collection to iterate over if "in"/"range" are not given (defaults to DEFAULT collection).
      loopRoutine: routine - the operations to run on every iteration.
      </pre>
    `, tutorial: 'functions-foreach' };
  }
  if(topicName == 'IF') {
    return { info: `
      <pre>
      This function checks a condition and branches into thenRoutine or elseRoutine before continuing with the rest of the current routine. Any variables/collections of the main routine are available in the then/else routines.

      Parameters:

      condition: number or string - a value evaluated as true or false. Alternatively, specify operand1/relation/operand2 to compute a condition.
      relation: &lt; / &lt;= / == / != / &gt;= / &gt; - the comparator for operand1 and operand2 (defaults to ==).
      operand1 / operand2: number or string - the values being compared (operand2 defaults to null).
      thenRoutine / elseRoutine: routine - executed depending on the result of the condition.

      undefined, null, 0, "" and false are "falsey"; everything else (including [] and the strings "null"/"false"/"0") is "truthy".
      </pre>
    `, tutorial: 'functions-if' };
  }
  if(topicName == 'SELECT') {
    return { info: `
      <pre>
      This function identifies widgets matching the given source/type/property/relation/value/max criteria, then uses "mode" to combine that set of widgets into the collection named by "collection" (sorted by sortBy, if given). Selecting piles adds their content to the collection instead of the pile widget itself.

      Parameters:

      source: all or collection - the input to select from (defaults to all).
      type: widget type - limits the selection to widgets of this type (defaults to all).
      property / relation / value: the criteria a widget must match (relation defaults to ==; value defaults to null). Note that == is a strict comparison, unlike a similar JavaScript expression.
      max: number - limits how many matching widgets are used (defaults to 999999, effectively unlimited).
      collection: collection - the collection to create/change (defaults to DEFAULT collection). Must be a named collection.
      mode: set/add/remove/intersect - how the matched widgets affect collection (defaults to set).
      sortBy: property name, key object, or array of keys - sorts the collection after widgets are added.
      random: true/false - if max is smaller than the number of matches, pick randomly among them rather than taking the first ones (defaults to false).
      </pre>
    `, tutorial: 'functions-select' };
  }
  if(topicName == 'AUDIO') {
    return { info: `
      <pre>
      This function causes a sound to play. A url for the audio file is required. Audio will not play on any device until the user interacts with the webpage.

      Parameters:

      source: url - the url of the audio file. It can play a clip from another website, or an asset uploaded through the JSON editor (defaults to "").
      maxVolume: number - the maximum volume, from 0 to 1. The actual volume played is the product of this and the player's own volume slider (defaults to 1).
      length: milliseconds - length the clip should play; null plays the full duration (defaults to null).
      player: playerName (or an array) - limits which player(s) hear the sound; null means every player hears it (defaults to null).
      count: number or "loop" - how many times the clip plays. "loop" plays forever, 0 means it won't play (defaults to 1). Ignored if length is set.
      silence: true/false - when true, stops all sound currently playing in the room (defaults to false).
      </pre>
    `, tutorial: 'functions-audio' };
  }
  if(topicName == 'CALL') {
    return { info: `
      <pre>
      This function executes a custom routine defined in the same or another widget. It is most useful for "bundling" a sequence of operations you want to reuse.

      All collections and variables that exist when the call is made are inherited by the sub-routine, which also receives the collection "caller" (the widget that used CALL). Additional variables can be set via "arguments".

      Each CALL returns a variable and a collection. The variable named "result" inside the called routine becomes the variable named by "variable" (defaults to "result") in the caller; the collection named "result" inside the called routine becomes the collection named by "collection" (defaults to "result") in the caller.

      Parameters:

      routine: routine name - the routine to execute (must end in "Routine").
      widget: widget id - the widget containing the routine (defaults to the current widget).
      variable: variable name - stores the value returned from the called routine (defaults to "result").
      collection: collection name - stores the collection returned from the called routine (defaults to "result").
      return: true/false - if false, no further statements in the calling routine are executed after the CALL (defaults to true).
      arguments: JSON object - properties of this object are passed as variables to the called routine (optional).
      </pre>
    `, tutorial: 'functions-call' };
  }
  if(topicName == 'CANVAS') {
    return { info: `
      <pre>
      This function simplifies control of canvas widgets. The mode parameter determines which automation is executed.

      Parameters:

      collection: collection - the collection of canvases to change (defaults to DEFAULT collection).
      canvas: canvasID (or an array) - deprecated, use collection instead: the canvas widget(s) to change.
      count: number - limits how many canvases of the collection are changed (defaults to 0, which changes all of them).
      mode: set/inc/dec/change/reset/setPixel - which automation to apply. set/inc/dec change the activeColor index into colorMap using value. change replaces the colorMap entry at index value with color. reset sets every pixel back to the first color of colorMap. setPixel sets the pixel at (x, y) to the colorMap index given by value.
      value: number - index into colorMap (defaults to 1).
      color: string - the new color used by mode "change" (defaults to VTT blue).
      x and y: number - the pixel coordinates used by mode "setPixel" (defaults to 0).
      </pre>
    `, tutorial: 'functions-canvas' };
  }
  if(topicName == 'CLICK') {
    return { info: `
      <pre>
      This function clicks widgets as if they were clicked by a player. When a collection is used with a count greater than one, each widget in the collection is clicked once before repeating.

      Parameters:

      collection: collection - the collection of widgets to click (defaults to DEFAULT collection).
      count: number - how many times the click is triggered (defaults to 1).
      mode: respect/ignoreClickable/ignoreClickRoutine/ignoreAll - controls how the clickable property and any clickRoutine are honored (defaults to respect). respect performs the normal click behavior; ignoreClickable ignores the clickable property; ignoreClickRoutine ignores any clickRoutine and performs the default widget action instead; ignoreAll combines both.
      </pre>
    `, tutorial: 'functions-click' };
  }
  if(topicName == 'CONTEXTMENU') {
    return { info: `
      <pre>
      This function opens the right-click popup next to the first widget of a collection, with a menu of buttons that run routines of that widget. It does not wait for the player: the routine carries on while the popup is open. A button's routine can open another popup, which is how submenu structures are built.

      Parameters:

      collection: collection - the popup is shown for the first widget in it (defaults to DEFAULT collection).
      contextMenu: array - the menu entries to show. Each entry is an object with text, routine (the name of a routine of the widget) and optionally icon, color, description and menu (a submenu). Either this or property is required.
      property: property name - the widget property holding the menu entries, as an alternative to writing them into the operation (e.g. contextMenu).
      title: text - a title shown above the popup.
      factor: number - how many times its size the widget is shown at in the preview (defaults to the widget's enlarge property or 2).
      color: color - the background color of the popup.
      image: URL or array of URLs - shows a picture instead of the widget; an array adds previous/next buttons and the routine of a menu entry receives the shown index as previewIndex.
      widget: widget id or array of ids - shows another widget instead; an array adds previous/next buttons like image.
      </pre>
    ` };
  }
  if(topicName == 'CLONE' || topicName == 'DELETE') {
    return { info: `
      <pre>
      CLONE creates copies of every widget in a collection, replicating all properties of the original except id. Each clone also gets a clonedFrom property set to the id of the original. Children of the source widgets are not cloned unless recursive is used.

      DELETE removes every widget in a collection. It does not delete any children of the removed widgets; they become children of the tabletop instead.

      CLONE parameters:

      source: collection - the input collection to clone (defaults to DEFAULT).
      count: number - how many copies of each original to create (defaults to 1).
      xOffset / yOffset: number - offset applied to each clone relative to the original (defaults to 0).
      properties: object - properties to set on each cloned widget.
      recursive: true/false - if true, all descendants of the source are cloned too (defaults to false).
      collection: collection name - receives the widgets created by this operation (defaults to DEFAULT). Must be a named collection.

      DELETE parameters:

      collection: collection - the collection containing the widgets to delete (defaults to DEFAULT).
      </pre>
    `, tutorial: 'functions-clone-and-delete' };
  }
  if(topicName == 'DELAY') {
    return { info: `
      <pre>
      This function pauses routine execution for a specified duration.

      Parameters:

      milliseconds: number - the length of the delay (defaults to 0).
      </pre>
    `, tutorial: 'functions-delay' };
  }
  if(topicName == 'FLIP') {
    return { info: `
      <pre>
      This function flips widgets to the given face (for a "normal" card, 0 is the back and 1 is the front). If face is omitted, widgets flip to their "next" face as determined by faceCycle. If the holder is a seat, only widgets belonging to that seat are flipped.

      Parameters:

      holder: holderID (or an array) - the holder containing the widgets to flip (optional).
      collection: collection - the collection of widgets to flip (defaults to DEFAULT collection).
      count: number - limits how many widgets are flipped (defaults to "all"). 0 flips none, "all" flips every selected widget, a positive number flips that many, a negative number leaves that many unflipped.
      face: number - the target face. When omitted, flips to the next/random face per faceCycle.
      faceCycle: forward/backward/random - temporarily overrides the widget's faceCycle property for this operation.
      </pre>
    `, tutorial: 'functions-flip' };
  }
  if(topicName == 'GET') {
    return { info: `
      <pre>
      This function reads a property (default id) of a single widget in a collection, or determines an aggregated value across multiple widgets, and stores the result in a variable.

      Parameters:

      collection: collection - the collection of widgets to read from (defaults to DEFAULT collection).
      property: property name (or an array, to read a nested sub-property) - the property to read.
      variable: variable name - stores the result (defaults to the name of property).
      aggregation: first/last/sum/average/median/min/max/array - how to combine values across multiple widgets (defaults to "first").
      skipMissing: true/false - skip widgets where the property has no value at all.
      </pre>
    `, tutorial: 'functions-get' };
  }
  if(topicName == 'INPUT') {
    return { info: `
      <pre>
      This function shows an overlay with input controls to ask the player for input; on confirmation, the routine continues with the results stored in the given variables. Canceling stops only the routine INPUT is directly inside (the main routine, or the branch of an IF/CALL/FOREACH it is nested in).

      Parameters:

      fields: array of field definitions - what to display, in order (checkbox, choose, color, number, palette, select, slider, string, subtitle, switch, text, and title types are supported, each with their own parameters - see the wiki for the full list).
      header: text - text displayed above everything else (mostly kept for backwards compatibility).
      player: playerName (or an array) - who is shown the overlay (defaults to null, the player whose action started the routine). With an array, everybody named is asked at once and each field comes back keyed by player name.
      block: boolean - while true, everybody else is shown a message naming who is being asked and cannot interact with widgets until every overlay is answered (defaults to false).
      css: css - modifies the css of field areas other than the header/title/subtitle.
      randomRotation: number - rotates the whole dialog by a random angle of up to half this many degrees in each direction (defaults to 0, no rotation).
      cancelButtonIcon / cancelButtonText: icon/text shown on the cancel button (defaults to no icon, "Cancel"). Set both explicitly to null to hide the cancel button entirely.
      confirmButtonIcon / confirmButtonText: icon/text shown on the confirm button (defaults to no icon, "Go").
      </pre>
    `, tutorial: 'functions-input' };
  }
  if(topicName == 'LABEL') {
    return { info: `
      <pre>
      This function changes the text of widgets.

      Parameters:

      label: labelID (or an array) - the widget(s) to change (optional).
      collection: collection - the collection of widgets to change if label is not given (defaults to DEFAULT collection).
      mode: set/inc/dec/append - how the value is applied (defaults to set). inc/dec always treat the current value as a number.
      value: string or number - the value to apply (defaults to 0).
      </pre>
    `, tutorial: 'functions-label' };
  }
  if(topicName == 'MOVEXY') {
    return { info: `
      <pre>
      This function moves widgets to a specific position on the surface, outside any holder. Widgets currently in a pile or holder are moved out first.

      Parameters:

      from: holderID (or an array) - the holder containing the widgets to move.
      count: number - limits how many widgets are moved (defaults to 1). 0 moves none, "all" moves every selected widget, a positive number moves that many, a negative number leaves that many unmoved.
      face: number - optionally sets the face of the moved widgets (see FLIP). If omitted, widgets keep their current face.
      x / y: number - the target position on the surface (defaults to 0).
      z: number - the stacking order the moved widgets get (defaults to 0, which keeps the z each widget already has).
      resetOwner: true/false - resets the owner property to null (defaults to true).
      snapToGrid: true/false - aligns x/y to the widget's grid, if any (defaults to true).

      The moved widgets can form piles as if a player moved them, but will never be placed into a holder - use MOVE for that.
      </pre>
    `, tutorial: 'functions-movexy' };
  }
  if(topicName == 'RECALL') {
    return { info: `
      <pre>
      This function moves cards back into the holder they are associated with via deck. All cards belonging to that deck are moved. Do not use on holders that have no deck. Cards are recalled in DOM order (or by distance, see byDistance).

      Parameters:

      holder: holderID (or an array) - the holder(s) that cards should be recalled to.
      excludeCollection: collection - cards in this collection are not recalled (defaults to null).
      inHolder: true/false - whether cards already in some holder are recalled too (defaults to true).
      owned: true/false - whether cards owned by a player are recalled too (defaults to true).
      byDistance: true/false - recall in order of proximity to the holder instead of DOM order (defaults to false).
      </pre>
    `, tutorial: 'functions-recall' };
  }
  if(topicName == 'RESET') {
    return { info: `
      <pre>
      This function looks at the given property on every widget; if that property is an object, each of its key/value pairs is applied to the widget. It is primarily intended to restore widgets to a previously saved state.

      Parameters:

      property: property name - the property on each widget that holds the values to restore (defaults to "resetProperties").
      </pre>
    `, tutorial: 'functions-reset' };
  }
  if(topicName == 'ROTATE') {
    return { info: `
      <pre>
      This function changes the rotation of widgets. If the holder is a seat, only widgets belonging to that seat are rotated.

      Parameters:

      holder: holderID (or an array) - the holder containing the widgets to rotate (optional).
      collection: collection - the collection of widgets to change (defaults to DEFAULT collection).
      angle: number - degrees to rotate by; positive is clockwise (defaults to 90).
      count: number - limits how many widgets are rotated (defaults to 1). 0 rotates none, "all" rotates every selected widget, a positive number rotates that many, a negative number leaves that many unrotated.
      mode: set/add - whether the rotation is set to, or changed by, angle (defaults to add).
      </pre>
    `, tutorial: 'functions-rotate' };
  }
  if(topicName == 'SCORE') {
    return { info: `
      <pre>
      This function modifies a property (score by default) in one or more seats. Use SCORE when a scoreboard uses rounds; use SET on the score property when it uses totals only. Usually you don't need SCORE at all if players use the scoreboard's built-in scoring overlay.

      Parameters:

      mode: set/inc/dec - how the value is applied (defaults to set).
      property: property name - which property holds the score arrays (defaults to "score").
      seats: seat id (or array), or null - which seats are affected; null means every seat (defaults to null).
      round: integer or null - the 1-based round to change; null appends a new round to each affected seat (defaults to null).
      value: number or null - the amount to apply; null means 1 for inc/dec or 0 for set (defaults to null).

      SCORE cannot be used to modify team scores directly - modify player scores instead and let the scoreboard compute team totals.
      </pre>
    `, tutorial: 'functions-score' };
  }
  if(topicName == 'SET') {
    return { info: `
      <pre>
      This function changes a property of the given widgets.

      Parameters:

      collection: collection - the collection of widgets to change (defaults to DEFAULT collection).
      property: property name - the property to change (defaults to "parent").
      relation: = or an operation (+, -, *, /, ...) - whether value is set outright or computed against the current value.
      value: any type - the value to apply (defaults to null).
      </pre>
    `, tutorial: 'functions-set' };
  }
  if(topicName == 'SHIFT') {
    return { info: `
      <pre>
      This function passes the contents of a circle of holders on: every entry hands its widgets to the next one and receives the widgets of the one before it. A seat hands on its hand, so the widgets end up owned by the seat they arrive at.

      Parameters:

      holders: holderID/seatID array or collection - the holders and seats the widgets travel along, in that order (defaults to the hands of all seats a player sits on, in seat index order). A collection takes part with its seats in seat index order and every other holder where the collection has it. A seat nobody sits on is skipped.
      widgets: all/top/collection - which widgets of each entry are passed on: everything, the topmost widget only, or the widgets of a collection (defaults to all).
      interval: number - how many places along each entry hands its widgets (defaults to 1).
      direction: forward/backward/random - forward walks the holders in the given order, backward the other way round, random pairs them randomly (defaults to forward).
      wrap: true/false - whether the last entry hands on to the first one; without it the widgets pile up in the last entry instead (defaults to true).
      keepOrder: true/false - whether the widgets keep the order of the holder they come from, instead of arriving in the order they were created (defaults to true).
      </pre>
    `, tutorial: 'functions-shift' };
  }
  if(topicName == 'SHUFFLE') {
    return { info: `
      <pre>
      This function randomizes the stacking order (z position) of widgets. If the holder is a seat, only that seat's hand is shuffled.

      Parameters:

      holder: holderID or seatID (or an array) - the holder containing the widgets to shuffle (optional).
      collection: collection - the collection of widgets to shuffle (defaults to DEFAULT collection).
      mode: true random/overhand/reverse/riffle/seeded - the shuffling technique (defaults to "true random").
      modeValue: number - meaning depends on mode: number of overhand or riffle shuffles, or the seed for seeded (defaults to 1).
      </pre>
    `, tutorial: 'functions-shuffle' };
  }
  if(topicName == 'SORT') {
    return { info: `
      <pre>
      This function rearranges the stacking order (z position) of widgets according to the given sort key. Widgets with null values sort to the bottom; widgets with equal keys keep their relative order. If the holder is a seat, only that seat's widgets are sorted.

      Parameters:

      holder: holderID (or an array) - the holder containing the widgets to sort (optional).
      collection: collection - the collection of widgets to sort if holder is not given (defaults to DEFAULT collection).
      key: property name, key object ({key, order, reverse}), or an array of either - what to sort by; an array is applied left to right until values differ.
      reverse: true/false - reverses the order after sorting by key (defaults to false).
      rearrange: true/false - if false, only the order within the collection changes, without moving widgets in the room (only applies to collections, defaults to true).
      locales: locale string (or an array of them) - the locale used when comparing text values, e.g. "de" (defaults to the locale of the player's browser).
      options: object - the collator options used when comparing text values, e.g. {"numeric": true} to sort "9" before "10" (defaults to none).

      Sorting compares values as strings unless they're numbers; pad numeric strings with zeros, or use {"numeric": true} in options, to sort them numerically.
      </pre>
    `, tutorial: 'functions-sort' };
  }
  if(topicName == 'TIMER') {
    return { info: `
      <pre>
      This function simplifies control of timer widgets. The mode parameter determines which automation is executed.

      Parameters:

      timer: timerID - the timer to modify. The operation is ignored if this isn't the id of a timer.
      collection: collection - the collection of timers to use if timer is not given (defaults to DEFAULT collection). Non-timer widgets in the collection are ignored.
      mode: set/inc/dec/pause/start/toggle/reset - which automation to apply (defaults to "toggle"). set/inc/dec change milliseconds; pause/start/toggle change paused; reset sets milliseconds back to the timer's start value and pauses it.
      value: number or string - the value (in milliseconds) used by set/inc/dec; a string is treated as the name of a property on the timer to read the value from (defaults to 0).
      seconds: number - like value, but expressed in seconds and multiplied by 1000 (defaults to 0).
      </pre>
    `, tutorial: 'timer' };
  }
  if(topicName == 'TURN') {
    return { info: `
      <pre>
      This function changes whose turn it is among a set of seats.

      Parameters:

      turn: integer, seat id, "first", or "last" - which seat becomes active, interpreted according to turnCycle.
      turnCycle: forward/backward/random/position/seat - how the next player is chosen. forward/backward sort the active seats by index and move that many turn positions from the current seat; random picks a random active seat (turn is ignored); position uses turn "first"/"last" to pick the active seat with the smallest/largest index; seat uses turn as the id of the seat whose turn it becomes.
      source: all or collection - which seats are considered (defaults to all). Seats with skipTurn set to true are never chosen.
      collection: collection name - receives the seat whose turn it now is (defaults to "TURN"). Must be a named collection.
      </pre>
    `, tutorial: 'seats' };
  }
  if(topicName == 'UPLOAD') {
    return { info: `
      <pre>
      This function lets a player upload a file (image, sound, or JSON) for use in the game.

      Parameters:

      fileTypes: array of file extensions - filters which file types the player may choose (defaults to a standard set of image/audio/JSON extensions).
      variable: variable name - stores the uploaded file's path, e.g. "/assets/1234_5678" (defaults to "uploadedFileName").
      </pre>
    `, tutorial: 'upload' };
  }
  if(topicName == 'var') {
    return { info: `
      <pre>
      A var statement works out one value and remembers it under a name: "var total = \${a} + \${b}".

      What goes on either side of the operation is an operand, and an operand is a number, a text in single quotes, null/true/false, an empty list [] or box {}, or a \${...} reference to something the routine already remembers. A bare word is NOT an operand - it is read as the operation, which is why "var a = hello" does not do what it looks like. The editor writes the quotes for you.

      Some operations work ON the variable rather than on an operand: "var hand = push \${card}" adds a card to whatever hand already holds, and "var card = \${deck} pop" takes the last entry off deck and remembers it.

      Anything that cannot be worked out becomes 0 (dividing by zero included), and the one exception is the "=" operation, which exists for compatibility with [SET].
      </pre>
    `, tutorial: 'var' };
  }
  if(topicName == 'VAR') {
    return { info: `
      <pre>
      This function sets multiple variables directly and simultaneously. Unlike a "var x = ..." statement, it lets you set arrays, object literals, or strings containing arbitrary characters without worrying about escape sequences.

      Parameters:

      variables: object - the variables to set, as key/value pairs.
      </pre>
    `, tutorial: 'var' };
  }
}
