// The widget picker the whole editor shares: a searchable list of widget ids
// with a type filter, plus a mode that picks widgets by clicking them in the
// room. The properties sidebar uses it for the parent and seat inputs, the
// routine editor for widget, holder and collection parameters.
let activeWidgetPicker = null;

function startWidgetPicker(targetWidgetID, onPick, options = {}) {
  activeWidgetPicker = {
    targetWidgetID,
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

// A click in the room hits the top-most widget, which is often not the one the
// picker is looking for - a holder is covered by the cards lying on it. The
// picker resolves such a click to the widget underneath it that fits.
function resolvePickedWidget(clickedWidget, picker) {
  const pickedWidget = picker.resolve ? picker.resolve(clickedWidget) : clickedWidget;
  if(!pickedWidget)
    return null;
  return !picker.filter || picker.filter(pickedWidget) ? pickedWidget : null;
}

// the picker restores the selection it started from after every pick, which must
// not be mistaken for the player picking that widget
let restoringWidgetPickerSelection = false;

function handleWidgetPickerSelection(newSelection) {
  if(restoringWidgetPickerSelection)
    return true;

  const picker = getWidgetPicker();
  if(!picker)
    return false;

  const targetWidget = widgets.get(picker.targetWidgetID);

  if(!targetWidget) {
    stopWidgetPicker();
    return false;
  }

  const restoreSelection = _=>{
    if(newSelection.length == 1 && newSelection[0].id == targetWidget.id)
      return;
    restoringWidgetPickerSelection = true;
    try {
      setSelection([ targetWidget ]);
    } finally {
      restoringWidgetPickerSelection = false;
    }
  };

  const resolved = [];
  for(const clickedWidget of newSelection) {
    // the target widget is selected again after every pick, so a click on it
    // cannot be told apart from that - it is only pickable from the id list
    if(!clickedWidget || clickedWidget.id == targetWidget.id)
      continue;
    const pickedWidget = resolvePickedWidget(clickedWidget, picker);
    if(!pickedWidget || pickedWidget.id == targetWidget.id)
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
//   allowSelf      - offer the widget the popout belongs to as well
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
  const excludedIDs = _=>(options.allowSelf ? [] : [ widget.id ]).concat(options.excludeIDs ? options.excludeIDs() : []);

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

    const buttonBar = div(popout, 'propertyPickerSection');
    const pickButton = document.createElement('button');
    pickButton.setAttribute('icon', 'colorize');
    pickButton.title = `Click this button and then the ${options.multiple ? 'widgets' : 'widget'} on the table. The type filter applies here as well, so with the type set to holder a click on a card selects the holder it lies on.`;
    buttonBar.appendChild(pickButton);

    const updatePickButton = _=>{
      const isSelecting = isWidgetPickerActive(widget.id, options.pickerKey);
      pickButton.textContent = isSelecting ? `click ${options.multiple ? 'widgets' : 'a widget'}...` : 'Pick in the room';
      pickButton.classList.toggle('selected', isSelecting);
    };
    updatePickButton();

    pickButton.onclick = _=>{
      if(isWidgetPickerActive(widget.id, options.pickerKey)) {
        stopWidgetPicker();
      } else {
        startWidgetPicker(widget.id, (targetWidget, pickedWidgets)=>{
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

    const typeNames = typeof editorTypeNames != 'undefined' ? editorTypeNames : {};
    const typeSelect = document.createElement('select');
    typeSelect.innerHTML = '<option value="">any type</option>' + Object.keys(typeNames).map(type=>`<option value="${type}">${typeNames[type]}</option>`).join('');
    typeSelect.value = typeFilter;
    searchSection.appendChild(typeSelect);

    const search = document.createElement('input');
    search.placeholder = 'Search by ID...';
    search.value = searchTerm;
    searchSection.appendChild(search);

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
        // picked widgets come first so they stay visible (and removable) when
        // the list is cut off below
        .sort((a, b)=>(current.indexOf(b.id) != -1) - (current.indexOf(a.id) != -1) || a.id.localeCompare(b.id));
      for(const match of matches.slice(0, 50)) {
        const entry = div(list, 'widgetPickerEntry', `<span>${html(match.id)}</span><span class=widgetPickerType>${html(match.get('type') || 'basic')}</span>`);
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
