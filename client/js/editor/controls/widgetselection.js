// The widget picker the whole editor shares: a searchable list of widget ids
// with a type filter, plus a mode that picks widgets by clicking them in the
// room. The properties sidebar uses it for the parent and seat inputs, the
// routine editor for widget, holder and collection parameters.
let activeWidgetPicker = null;

function startWidgetPicker(targetWidget, onPick, options = {}) {
  activeWidgetPicker = {
    targetWidget,
    targetWidgetID: targetWidget.id,
    onPick,
    pickerKey: options.pickerKey || null,
    filter: typeof options.filter === 'function' ? options.filter : null,
    resolve: typeof options.resolve === 'function' ? options.resolve : null,
    multiple: !!options.multiple
  };

  $('body').classList.add('editorWidgetPicking');
}

function stopWidgetPicker() {
  activeWidgetPicker = null;
  $('body').classList.remove('editorWidgetPicking');
}

function getWidgetPicker(targetWidgetID = null, pickerKey = null) {
  if(!activeWidgetPicker)
    return null;

  if(targetWidgetID !== null && activeWidgetPicker.targetWidgetID != targetWidgetID)
    return null;

  if(pickerKey !== null && activeWidgetPicker.pickerKey !== pickerKey)
    return null;

  return activeWidgetPicker;
}

function isWidgetPickerActive(targetWidgetID = null, pickerKey = null) {
  return !!getWidgetPicker(targetWidgetID, pickerKey);
}

// The widgets a picker's target stands for: itself, or - for the facade of a
// multi-selection, whose id is the ids of all of them ("h1,h2") and which is not
// in the room under it - the widgets behind it.
function targetWidgets(targetWidget) {
  if(!targetWidget)
    return [];
  return targetWidget.isMulti ? targetWidget.widgets : [ targetWidget ];
}

// The widget a running picker belongs to, as long as it still is the widget of
// that id in the room: a new state from the server replaces every widget, so the
// same id regularly comes back as a different object - one that has nothing to
// do with the editor the picker was started from. The editor tells widgets apart
// by identity everywhere else for the same reason (widgetStillExists).
function widgetPickerTarget() {
  if(!activeWidgetPicker)
    return null;
  const targetWidget = activeWidgetPicker.targetWidget;
  const behind = targetWidgets(targetWidget);
  // all of them: a multi-selection that loses one of its widgets is re-rendered
  // as a new facade, so the one this picker was started for is stale either way
  return behind.length && behind.every(w=>widgets.get(w.id) === w) ? targetWidget : null;
}

// A click in the room hits the top-most widget, which is often not the one the
// picker is looking for - a holder is covered by the cards lying on it. The
// picker resolves such a click to the widget underneath it that fits.
function resolvePickedWidget(clickedWidget, picker) {
  const pickedWidget = picker.resolve ? picker.resolve(clickedWidget) : clickedWidget;
  if(!pickedWidget)
    return null;
  return !picker.filter || picker.filter(pickedWidget) ? pickedWidget : null;
}

// A click on a widget in the room while a picker is running belongs to the
// picker, never to the widget: in edit mode a click on an already selected
// widget triggers it (that is how a button is tested without leaving the
// editor), and the widget a picker belongs to is selected the whole time it
// runs. Clicks are routed here before that happens, which is also what makes
// that widget pickable at all - it never arrives as a selection change.
function handleWidgetPickerClick(clickedWidget) {
  const picker = getWidgetPicker();
  if(!picker)
    return false;

  const targetWidget = widgetPickerTarget();
  if(!targetWidget) {
    stopWidgetPicker();
    return false;
  }

  const pickedWidget = clickedWidget && resolvePickedWidget(clickedWidget, picker);
  if(pickedWidget) {
    // a picker that collects several widgets stays active for the next click
    if(!picker.multiple)
      stopWidgetPicker();
    picker.onPick(targetWidget, [ pickedWidget ]);
  }
  // the click was the picker's either way - a widget the filter rejects must not
  // fall through and be clicked instead
  return true;
}

// the picker restores the selection it started from after every pick, which must
// not be mistaken for the player picking that widget
let restoringWidgetPickerSelection = false;

function isWidgetPickerRestoringSelection() {
  return restoringWidgetPickerSelection;
}

// A rubber band drawn in the room is the one selection change a running picker
// owns - it is how widgets are picked with a band instead of a click, and the
// picker puts its own widget back afterwards. Every other route into
// setSelection (the JSON editor's tree, an "Edit line ..." link, an undo, a new
// state) is the editor moving on to another widget, armed picker or not: it is
// the selection the picker itself makes that must not be mistaken for one, not
// the mere existence of a picker.
let selectingWidgetsInRoom = false;

function selectWidgetsInRoom(applySelection) {
  selectingWidgetsInRoom = true;
  try {
    return applySelection();
  } finally {
    selectingWidgetsInRoom = false;
  }
}

// Whether a running picker explains a selection change: it selects what was
// caught in the room and then restores the selection it started from, which is
// not the editor moving on to another widget. That only holds for a selection
// made in the room, and only while the widget the picker belongs to is still
// there - once it is deleted or replaced by a new state, the change is real and
// the popup the picker runs from goes along.
function isWidgetPickerChangingSelection() {
  return !!activeWidgetPicker && selectingWidgetsInRoom && !!widgetPickerTarget();
}

// Nothing can be picked for a widget that is gone, and the click in the room a
// picker waits for would never come: the popup it runs from is being closed in
// the same breath. So it ends where its widget does, whichever route the
// selection change came from - and since the crosshair over the room is the only
// sign that a click in there is being waited for, it must not just disappear:
// say why it did.
function endWidgetPickerWithoutTarget() {
  if(!activeWidgetPicker || widgetPickerTarget())
    return;
  const gone = targetWidgets(activeWidgetPicker.targetWidget).filter(w=>widgets.get(w.id) !== w).map(w=>w.id);
  const goneWords = gone.join(', ') || activeWidgetPicker.targetWidgetID;
  stopWidgetPicker();
  editorNote(`picking in the room ended: ${goneWords} is gone`);
}

// Turns a selection into a pick and puts the picker's own widget back
// afterwards, which is why the sidebar stops there rather than re-rendering for
// what was picked. Only a selection made in the room is one: taking any other
// one would put the editor back on the widget the picker belongs to, so a
// running picker would make the sidebar unable to move on at all.
function handleWidgetPickerSelection(newSelection) {
  if(restoringWidgetPickerSelection)
    return true;
  if(!selectingWidgetsInRoom)
    return false;

  const picker = getWidgetPicker();
  if(!picker)
    return false;

  const targetWidget = widgetPickerTarget();

  if(!targetWidget) {
    stopWidgetPicker();
    return false;
  }

  // the widgets the editor is on while the picker runs - one, or all of a
  // multi-selection
  const selectedByEditor = targetWidgets(targetWidget);
  const isSelectedByEditor = widget=>selectedByEditor.some(w=>w.id == widget.id);

  const restoreSelection = _=>{
    if(newSelection.length == selectedByEditor.length && newSelection.every(isSelectedByEditor))
      return;
    restoringWidgetPickerSelection = true;
    try {
      setSelection(selectedByEditor);
    } finally {
      restoringWidgetPickerSelection = false;
    }
  };

  const resolved = [];
  for(const clickedWidget of newSelection) {
    // the target widget is selected again after every pick, so a selection
    // change to it cannot be told apart from that - clicks on it arrive as a
    // click (handleWidgetPickerClick) instead
    if(!clickedWidget || isSelectedByEditor(clickedWidget))
      continue;
    const pickedWidget = resolvePickedWidget(clickedWidget, picker);
    if(!pickedWidget || isSelectedByEditor(pickedWidget))
      continue;
    if(resolved.indexOf(pickedWidget) == -1)
      resolved.push(pickedWidget);
  }

  // an ambiguous selection of several widgets only counts when the picker
  // collects more than one anyway
  const pickedWidgets = picker.multiple || resolved.length == 1 ? resolved : [];

  if(pickedWidgets.length) {
    // a picker that collects several widgets stays active for the next click
    if(!picker.multiple)
      stopWidgetPicker();
    picker.onPick(targetWidget, pickedWidgets);
  }

  restoreSelection();
  return true;
}

// Inline popout (styled like the icon/image pickers) to select widgets by
// searching their ID, filtered by type, or by clicking them in the room.
// options:
//   pickerKey      - key for the in-room widget picker
//   typeFilter     - presets the type filter (e.g. 'seat' for seat inputs)
//   multiple       - toggle entries in a list of IDs instead of picking one
//   getSelectedIDs - returns the currently selected widget IDs
//   apply          - called with the picked ID (single) or array of IDs (multiple)
//   onClear        - when given, adds a button that removes the value
//   clearLabel     - label of that button
//   excludeIDs     - returns additional widget IDs to hide from the list
//   allowSelf      - offer the widget the popout belongs to as well, pinned to
//                    the top of the list and marked as "this widget"
//   resolveCovering - without a type filter, resolve a clicked card or pile to
//                    the widget it lies on instead of picking it
//   inline         - always show the list instead of hiding it behind an arrow
function renderWidgetSelectPopout(wrap, widget, options = {}) {
  let expandButton = null;
  if(!options.inline) {
    expandButton = document.createElement('button');
    expandButton.className = 'propertyExpandButton';
    expandButton.setAttribute('icon', 'expand_more');
    expandButton.title = 'Select a widget';
    wrap.appendChild(expandButton);
  }

  const popout = div(wrap, 'propertyPicker widgetSelectPopout');
  if(!options.inline)
    popout.style.display = 'none';

  const selectedIDs = _=>options.getSelectedIDs ? options.getSelectedIDs() : [];
  // the ids the popout belongs to: for a multi-selection that is every widget in
  // it, not the "h1,h2" of the facade - which is no widget in the room, so
  // excluding it would exclude nothing and offer them as their own parent
  const ownIDs = targetWidgets(widget).map(w=>w.id);
  const excludedIDs = _=>(options.allowSelf ? [] : ownIDs).concat(options.excludeIDs ? options.excludeIDs() : []);
  // the widget the popout belongs to is the one a routine acts on most often, so
  // the list pins and marks it instead of hiding it among the other ids
  const selfID = options.allowSelf ? widget.id : null;

  let typeFilter = options.typeFilter || '';
  let searchTerm = '';
  let refreshEntries = _=>{}; // updates the list in place, keeping search focus

  const matchesTypeFilter = w=>!typeFilter || (w.get('type') || 'basic') == typeFilter;
  // what a click in the room should resolve to: the type filter when there is
  // one, otherwise (with resolveCovering) the widget below a card or pile,
  // because those cover whatever they lie on
  const isPickTarget = w=>typeFilter ? matchesTypeFilter(w) : !options.resolveCovering || [ 'card', 'pile' ].indexOf(w.get('type')) == -1;

  const renderPopout = _=>{
    popout.innerHTML = '';

    if(options.title)
      div(popout, 'propertyPickerSectionTitle', html(options.title));

    // the two ways to fill the picker without the list - picking in the room and
    // dropping the selection - are one row, so the popout starts with one line of
    // controls rather than a column of full-width buttons
    const buttonBar = div(popout, 'propertyPickerSection widgetPickerRow');
    const pickButton = document.createElement('button');
    pickButton.setAttribute('icon', 'colorize');
    pickButton.title = `Click this button and then the ${options.multiple ? 'widgets' : 'widget'} in the room. The type filter applies here as well, so with the type set to holder a click on a card selects the holder it lies on.`;
    buttonBar.appendChild(pickButton);

    const updatePickButton = _=>{
      const isSelecting = isWidgetPickerActive(widget.id, options.pickerKey);
      // armed, the button says what to do next rather than what it does, in the
      // same words as unarmed: one control, one way of speaking
      pickButton.textContent = isSelecting ? `Click ${options.multiple ? 'widgets' : 'a widget'} in the room…` : 'Pick in the room';
      pickButton.classList.toggle('selected', isSelecting);
    };
    updatePickButton();

    pickButton.onclick = _=>{
      if(isWidgetPickerActive(widget.id, options.pickerKey)) {
        stopWidgetPicker();
      } else {
        startWidgetPicker(widget, (targetWidget, pickedWidgets)=>{
          if(options.multiple)
            options.apply([...new Set(selectedIDs().concat(pickedWidgets.map(w=>w.id)))]);
          else
            options.apply(pickedWidgets[0].id);
          refreshEntries();
          updatePickButton();
        }, {
          pickerKey: options.pickerKey,
          multiple: !!options.multiple,
          filter: pickedWidget=>excludedIDs().indexOf(pickedWidget.id) == -1 && matchesTypeFilter(pickedWidget),
          resolve: pickedWidget=>{
            let resolved = pickedWidget;
            const visited = new Set(); // a broken parent chain must not loop forever
            while(resolved && !isPickTarget(resolved) && widgets.has(resolved.get('parent')) && !visited.has(resolved.id)) {
              visited.add(resolved.id);
              resolved = widgets.get(resolved.get('parent'));
            }
            return resolved;
          }
        });
      }
      updatePickButton();
    };

    if(options.onClear) {
      const clearButton = document.createElement('button');
      clearButton.setAttribute('icon', 'link_off');
      clearButton.textContent = options.clearLabel || 'Clear';
      clearButton.onclick = _=>{
        options.onClear();
        refreshEntries();
      };
      buttonBar.appendChild(clearButton);
    }

    const searchSection = div(popout, 'propertyPickerSection');
    div(searchSection, 'propertyPickerSectionTitle', 'Search widgets');

    // the two ways to narrow the list down are one row as well: the type is what
    // the search is filtered by, so reading them apart on two lines only makes
    // the popout taller
    const searchRow = div(searchSection, 'widgetPickerRow');
    const typeNames = typeof editorTypeNames != 'undefined' ? editorTypeNames : {};
    const typeSelect = document.createElement('select');
    typeSelect.innerHTML = '<option value="">any type</option>' + Object.keys(typeNames).map(type=>`<option value="${type}">${typeNames[type]}</option>`).join('');
    typeSelect.value = typeFilter;
    searchRow.appendChild(typeSelect);

    const search = document.createElement('input');
    search.placeholder = 'Search by ID...';
    search.value = searchTerm;
    searchRow.appendChild(search);

    const list = div(searchSection, 'widgetPickerList');

    const showEntries = _=>{
      list.innerHTML = '';
      const term = searchTerm.trim().toLowerCase();
      const current = selectedIDs();
      const excluded = excludedIDs();
      const matches = [...widgets.values()]
        .filter(w=>excluded.indexOf(w.id) == -1)
        .filter(w=>matchesTypeFilter(w))
        .filter(w=>!term || w.id.toLowerCase().includes(term))
        // the widget the popout belongs to comes first, then the picked widgets
        // so they stay visible (and removable) when the list is cut off below
        .sort((a, b)=>(b.id == selfID) - (a.id == selfID) || (current.indexOf(b.id) != -1) - (current.indexOf(a.id) != -1) || a.id.localeCompare(b.id));
      for(const match of matches.slice(0, 50)) {
        const self = match.id == selfID ? '<span class=widgetPickerSelf>this widget</span>' : '';
        const entry = div(list, 'widgetPickerEntry', `<span>${html(match.id)}</span>${self}<span class=widgetPickerType>${html(match.get('type') || 'basic')}</span>`);
        entry.classList.toggle('selected', current.indexOf(match.id) != -1);
        entry.onclick = _=>{
          if(options.multiple) {
            const now = selectedIDs();
            options.apply(now.indexOf(match.id) == -1 ? now.concat(match.id) : now.filter(id=>id != match.id));
            entry.classList.toggle('selected');
          } else {
            options.apply(match.id);
            toggle(false);
          }
        };
      }
      if(!matches.length)
        div(list, 'propertyPickerEmpty', 'No matching widgets.');
      else if(matches.length > 50)
        div(list, 'propertyPickerEmpty', `${matches.length - 50} more - refine the search.`);
    };

    refreshEntries = showEntries;
    typeSelect.onchange = _=>{ typeFilter = typeSelect.value; showEntries(); };
    search.oninput = _=>{ searchTerm = search.value; showEntries(); };
    showEntries();
  };

  const toggle = open=>{
    if(options.inline)
      return;
    popout.style.display = open ? '' : 'none';
    expandButton.classList.toggle('open', open);
    if(open)
      renderPopout();
    else if(isWidgetPickerActive(widget.id, options.pickerKey))
      stopWidgetPicker();
  };

  if(options.inline)
    renderPopout();
  else
    expandButton.onclick = _=>toggle(popout.style.display == 'none');

  return {
    expandButton,
    popout,
    refresh: _=>{
      if(popout.style.display != 'none' && !popout.contains(document.activeElement))
        renderPopout();
    }
  };
}
