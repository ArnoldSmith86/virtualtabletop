class GameSettingsModule extends SidebarModule {
  constructor() {
    super('settings', 'Game Settings', 'Settings like legacy modes and global game options.');
    // Which disclosures the user opened. renderModule() runs again whenever the room sends new
    // meta or state, so without this every re-render would snap them shut.
    this.expandedModes = new Set();
    this.introExpanded = false;
  }

  addLegacyModeCheckbox(name, target) {
    if(legacyMode(name) === undefined)
      return;

    const mode = LEGACY_MODES[name];
    const description = `${mode.description}
      <br><br>
      See <a href="https://github.com/ArnoldSmith86/virtualtabletop/pull/${mode.pr}">pull request #${mode.pr}</a> for technical details. Also see the <a href="https://github.com/ArnoldSmith86/virtualtabletop/wiki/Legacy-Mode">Legacy Mode wiki</a> page.
      `;

    const tile = document.createElement('div');
    tile.className = 'settings-tile';
    // the frame comes from .settings-tile - this is only the accent edge showState() colors in
    tile.style.cssText = `
      border-left: 4px solid transparent;
      transition: all 0.2s ease;
    `;

    // Only the header toggles the mode - the text below it has to stay selectable.
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      cursor: pointer;
    `;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = name;
    checkbox.id = name;
    checkbox.checked = legacyMode(name);
    checkbox.style.marginRight = '8px';

    const label = document.createElement('label');
    label.htmlFor = name;
    label.textContent = mode.label;
    label.style.fontWeight = 'bold';
    label.style.cursor = 'pointer';

    const activeChip = document.createElement('span');
    activeChip.textContent = 'Active';
    activeChip.style.cssText = `
      margin-left: auto;
      padding: 1px 6px;
      border-radius: 8px;
      font-size: 0.75em;
      background: var(--textHighlightColor2);
      color: black;
    `;

    header.append(checkbox, label, activeChip);
    tile.append(header);

    const summary = document.createElement('div');
    summary.textContent = mode.summary;
    summary.style.cssText = `
      font-size: 0.9em;
      margin: 6px 0 0 21px;
      opacity: 0.85;
    `;
    tile.append(summary);

    const details = document.createElement('details');
    details.style.marginTop = '4px';
    details.open = this.expandedModes.has(name);

    const detailsSummary = document.createElement('summary');
    detailsSummary.textContent = 'Details';
    detailsSummary.style.cssText = `
      font-size: 0.85em;
      margin-left: 21px;
      cursor: pointer;
      opacity: 0.8;
    `;

    const desc = document.createElement('div');
    desc.innerHTML = description;
    desc.style.cssText = `
      font-size: 0.9em;
      margin: 8px 0 0 21px;
      color: var(--textColor);
    `;

    details.append(detailsSummary, desc);
    details.addEventListener('toggle', () => {
      details.open ? this.expandedModes.add(name) : this.expandedModes.delete(name);
    });
    tile.append(details);

    const removeSection = document.createElement('div');
    removeSection.style.cssText = `
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--modalBorderColor);
    `;

    const removeText = document.createElement('div');
    removeText.textContent = 'Once you\'ve confirmed your game works correctly, remove this setting to reduce clutter:';
    removeText.style.cssText = `
      font-size: 0.85em;
      margin-bottom: 8px;
      color: var(--textColor);
      opacity: 0.8;
    `;

    const removeButton = document.createElement('button');
    removeButton.setAttribute('icon', 'delete');
    removeButton.textContent = 'Remove';

    removeSection.append(removeText, removeButton);
    tile.append(removeSection);

    const handleRemove = () => {
      const confirmMessage = `This can't be undone.\n\nOnly do this if you've confirmed your game works correctly without this setting.`;
      if(confirm(confirmMessage))
        this.removeLegacyMode(name);
    };

    // Background alone is a subtle signal (#fff vs #ccc), so the accent border and the chip
    // carry the state as well.
    const showState = newState => {
      tile.style.background = newState ? 'var(--backgroundHighlightColor1)' : 'var(--backgroundColor)';
      tile.style.borderLeftColor = newState ? 'var(--textHighlightColor2)' : 'transparent';
      activeChip.style.display = newState ? 'block' : 'none';
      removeSection.style.display = newState ? 'none' : 'block';
    };

    header.addEventListener('click', e => {
      if(e.target !== checkbox && e.target.tagName !== 'LABEL')
        checkbox.click();
    });

    checkbox.addEventListener('change', () => {
      legacyMode(name, checkbox.checked);
      showState(checkbox.checked);
    });
    removeButton.addEventListener('click', handleRemove);

    showState(checkbox.checked);

    target.append(tile);
  }

  addDropdown(text, name, description, options, target) {
    const tile = document.createElement('div');
    tile.className = 'settings-tile';

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    `;

    const label = document.createElement('label');
    label.htmlFor = name;
    label.textContent = text;
    label.style.fontWeight = 'bold';

    header.append(label);
    tile.append(header);

    const desc = document.createElement('div');
    desc.innerHTML = description;
    desc.style.fontSize = '0.9em';
    desc.style.color = 'var(--textColor)';
    
    tile.append(desc);

    const select = document.createElement('select');
    select.name = name;
    select.id = name;
    select.style.width = '100%';
    select.style.padding = '8px';
    select.style.marginTop = '8px';

    for (const option of options) {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.text;
      select.append(opt);
    }

    const gameSettings = getCurrentGameSettings();
    select.value = gameSettings[name] || 'default';

    tile.append(select);

    select.addEventListener('change', () => {
      const gameSettings = getCurrentGameSettings();
      gameSettings[name] = select.value;

      let css = '';
      let noFadeCss = '';
      let duration = 100;
      if(select.value.includes('noFade')) {
        duration = 0;
        noFadeCss = 'transition: none; --cursorOpacity: var(--cursorActiveOpacity);';
      }

      if(select.value === 'default') {
        css = '';
      } else if(select.value.includes('translucent')) {
        css = `
          .cursor {
            --cursorActiveOpacity: 0.3;
            --cursorPressedOpacity: 0.3;
            --cursorActiveDuration: ${duration};
            ${noFadeCss}
          }
          .cursor.pressed {
            background-color: var(--playerColor);
          }
          .cursor::before {
            display: none;
          }
        `;
      } else if(select.value.includes('solid-no-name')) {
        css = `
          .cursor {
            --cursorActiveOpacity: 1;
            --cursorPressedOpacity: 1;
            --cursorActiveDuration: ${duration};
            ${noFadeCss}
          }
          .cursor.pressed {
            background-color: var(--playerColor);
          }
          .cursor::before {
            display: none;
          }
        `;
      } else if(select.value.includes('solid-player-name')) {
        css = `
          .cursor {
            --cursorActiveOpacity: 1;
            --cursorPressedOpacity: 1;
            --cursorActiveDuration: ${duration};
            ${noFadeCss}
          }
          .cursor.pressed {
            background-color: var(--playerColor);
          }
          .cursor::before {
            display: block;
            content: attr(data-player);
            position: relative;
            top: -5px;
            left: 19px;
            font-size: 15px;
            color: var(--playerColor);
            white-space: nowrap;
          }
        `;
      } else if(select.value === 'invisible') {
        css = `
          .cursor {
            --cursorActiveOpacity: 0;
            --cursorPressedOpacity: 0;
          }
          .cursor.pressed {
            background-color: var(--playerColor);
          }
          .cursor::before {
            display: none;
          }
        `;
      }

      gameSettings.cursorCss = css;
      document.querySelectorAll('style#gameSettingsCss').forEach(el => el.textContent = css);

      toServer('setGameSettings', gameSettings);
    });

    target.append(tile);
  }

  // A board like 1234x1000 reduces to nothing readable, so fall back to a decimal ratio once
  // the reduced numbers get big. The reduced form of a screen ratio is not what people call
  // it - and not what the preset button next to this says - so those keep their usual name.
  boardRatioText(width, height) {
    const commonNames = { '8:5': '16:10', '5:8': '10:16' };
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const divisor = gcd(Math.round(width), Math.round(height));
    const [ w, h ] = [ width/divisor, height/divisor ];
    const reduced = `${w}:${h}`;
    const ratio = w <= 40 && h <= 40 ? commonNames[reduced] || reduced : `${(width/height).toFixed(2)}:1`;
    if(width == height)
      return `${ratio} (square)`;
    return `${ratio} (${width > height ? 'landscape' : 'portrait'})`;
  }

  // only top level widgets sit on the board itself - a smaller board pushes them
  // past its edge, where they are silently clipped away. rotation and scale are
  // applied around the widget's center, so the area it covers is not its x/y/
  // width/height box. Cached because this walks every widget and the board size
  // fields recompute it on every keystroke.
  boardWidgetBoxes() {
    if(!this.cachedWidgetBoxes) {
      this.cachedWidgetBoxes = widgetFilter(w => !w.get('parent')).map(w => {
        const scale = w.get('scale') || 1;
        const halfWidth = w.get('width') * scale / 2;
        const halfHeight = w.get('height') * scale / 2;
        const angle = (w.get('rotation') || 0) * Math.PI / 180;
        const halfX = Math.abs(halfWidth * Math.cos(angle)) + Math.abs(halfHeight * Math.sin(angle));
        const halfY = Math.abs(halfWidth * Math.sin(angle)) + Math.abs(halfHeight * Math.cos(angle));
        const centerX = w.get('x') + w.get('width') / 2;
        const centerY = w.get('y') + w.get('height') / 2;
        return { widget: w, left: centerX-halfX, top: centerY-halfY, right: centerX+halfX, bottom: centerY+halfY };
      });
    }
    return this.cachedWidgetBoxes;
  }

  // Only what the entered size would newly clip. Plenty of games park templates or
  // decorations off the board on purpose, and those are already clipped today - warning
  // about them the moment the panel opens would just be noise nobody can act on.
  widgetsNewlyOutsideBoard(width, height) {
    const outside = (box, w, h) => box.left < 0 || box.top < 0 || box.right > w || box.bottom > h;
    return this.boardWidgetBoxes()
      .filter(box => outside(box, width, height) && !outside(box, viewportConfig.targetWidth, viewportConfig.targetHeight))
      .map(box => box.widget);
  }

  addBoardSizeSetting(target) {
    const tile = document.createElement('div');
    tile.className = 'settings-tile boardSizeSetting';

    const header = document.createElement('div');
    header.className = 'boardSizeHeader';
    header.textContent = 'Board Size and Shape';
    tile.append(header);

    const desc = document.createElement('div');
    desc.className = 'boardSizeDescription';
    desc.innerHTML = `
      How large the play area is. Widget <code>x</code>, <code>y</code>, <code>width</code> and <code>height</code> are measured on this grid, and the whole board is scaled to fit each player's window - so <b>this decides the board's shape, not how big it looks</b>.
      <br><br>
      Existing widgets keep their coordinates, so anything past the new edge will be cut off. Saved with the game; changes apply to everyone in the room right away. Default is ${DEFAULT_VIEWPORT.targetWidth} × ${DEFAULT_VIEWPORT.targetHeight}, allowed values are ${MIN_BOARD_SIZE} to ${MAX_BOARD_SIZE}.
    `;
    tile.append(desc);

    const numberField = (title, name, value) => {
      const wrap = document.createElement('div');
      wrap.className = 'boardSizeField';

      const label = document.createElement('label');
      label.htmlFor = name;
      label.textContent = title;

      const input = document.createElement('input');
      input.type = 'number';
      input.id = name;
      input.name = name;
      input.min = MIN_BOARD_SIZE;
      input.max = MAX_BOARD_SIZE;
      input.value = value;

      wrap.append(label, input);
      return { wrap, input };
    };

    const inputRow = document.createElement('div');
    inputRow.className = 'boardSizeInputs';

    const width = numberField('Width', 'boardWidth', viewportConfig.targetWidth);
    const height = numberField('Height', 'boardHeight', viewportConfig.targetHeight);

    const cross = document.createElement('span');
    cross.textContent = '×';

    const swapButton = document.createElement('button');
    swapButton.setAttribute('icon', 'swap_horiz');
    swapButton.title = 'Swap width and height';
    swapButton.setAttribute('aria-label', 'Swap width and height');

    // the fields, the × and the swap button stay one tight cluster on the left; the space
    // that leaves over shows the shape the numbers describe, which is what the setting is
    // actually about - with the board the room is on as a dashed outline behind it.
    const preview = document.createElement('div');
    preview.className = 'boardSizePreview';
    const previewCurrent = document.createElement('div');
    previewCurrent.className = 'boardSizePreviewCurrent';
    const previewPending = document.createElement('div');
    previewPending.className = 'boardSizePreviewPending';
    preview.append(previewCurrent, previewPending);

    const fieldCluster = document.createElement('div');
    fieldCluster.className = 'boardSizeFields';
    fieldCluster.append(width.wrap, cross, height.wrap, swapButton);

    inputRow.append(fieldCluster, preview);
    tile.append(inputRow);

    const ratioReadout = document.createElement('div');
    ratioReadout.className = 'boardSizeRatio';
    tile.append(ratioReadout);

    const presetLabel = document.createElement('div');
    presetLabel.className = 'boardSizePresetLabel';
    presetLabel.textContent = 'Presets';
    tile.append(presetLabel);

    const presetRow = document.createElement('div');
    presetRow.className = 'boardSizePresets';
    tile.append(presetRow);

    const actionRow = document.createElement('div');
    actionRow.className = 'boardSizeActions';

    const applyButton = document.createElement('button');
    applyButton.setAttribute('icon', 'check');
    applyButton.textContent = 'Apply';

    const resetButton = document.createElement('button');
    resetButton.setAttribute('icon', 'restart_alt');
    resetButton.textContent = 'Reset to default';

    actionRow.append(applyButton, resetButton);
    tile.append(actionRow);

    const messages = document.createElement('div');
    messages.className = 'boardSizeMessages';
    tile.append(messages);

    const presets = [
      { text: '16:10 (default)', width: 1600, height: 1000 },
      { text: '16:9',            width: 1600, height:  900 },
      { text: '4:3',             width: 1600, height: 1200 },
      { text: '1:1',             width: 1200, height: 1200 },
      { text: '10:16',           width: 1000, height: 1600 }
    ];

    const pending = () => [ parseInt(width.input.value, 10), parseInt(height.input.value, 10) ];
    const isValid = v => Number.isFinite(v) && v >= MIN_BOARD_SIZE && v <= MAX_BOARD_SIZE;

    // the server broadcasts the new settings back as a meta message, which is
    // what applies the viewport - here and for everyone else in the room. Only
    // the explicit Apply sends, so half typed sizes never reach the other players.
    const apply = () => {
      const [ w, h ] = pending();
      if(!isValid(w) || !isValid(h))
        return;

      const gameSettings = getCurrentGameSettings();
      gameSettings.boardSize = { width: w, height: h };
      this.boardSizeConfirmation = { width: w, height: h, text: `The board is ${w} × ${h} now - applied for everyone in the room and saved with the game.` };
      toServer('setGameSettings', gameSettings);
    };

    const reset = () => {
      const gameSettings = getCurrentGameSettings();
      delete gameSettings.boardSize;
      this.boardSizeConfirmation = {
        width: DEFAULT_VIEWPORT.targetWidth,
        height: DEFAULT_VIEWPORT.targetHeight,
        text: `The board is back to the default ${DEFAULT_VIEWPORT.targetWidth} × ${DEFAULT_VIEWPORT.targetHeight} - applied for everyone in the room.`
      };
      toServer('setGameSettings', gameSettings);
    };

    // kind is 'error' (Apply is blocked), 'warning' (Apply works, but read this first) or
    // 'success'. They used to share the error red while Apply stayed enabled, which read as
    // "something is broken" for what is only advice.
    const addMessage = (kind, text, action) => {
      const message = document.createElement('div');
      message.className = `boardSizeMessage ${kind}`;
      message.textContent = text;
      if(action) {
        const button = document.createElement('button');
        button.textContent = action.text;
        button.addEventListener('click', action.onClick);
        message.append(document.createElement('br'), button);
      }
      messages.append(message);
    };

    // the preview box in the CSS is square and this is its side in px
    const PREVIEW_SIZE = 96;
    const updatePreview = (w, h, valid) => {
      const currentW = viewportConfig.targetWidth;
      const currentH = viewportConfig.targetHeight;
      // both shapes share one scale, so the preview shows how much bigger or smaller the
      // pending board is - not just its proportions
      const largest = Math.max(currentW, currentH, valid ? w : 0, valid ? h : 0);
      const size = (el, boxW, boxH) => {
        el.style.width  = `${boxW/largest*PREVIEW_SIZE}px`;
        el.style.height = `${boxH/largest*PREVIEW_SIZE}px`;
      };

      size(previewCurrent, currentW, currentH);
      previewCurrent.style.display = valid && (w != currentW || h != currentH) ? 'block' : 'none';
      previewPending.style.display = valid ? 'block' : 'none';
      if(valid)
        size(previewPending, w, h);
    };

    // the confirmation names concrete dimensions, so it is only true while the board is
    // still on them - with a second editor in the room, somebody else applying a different
    // size has to invalidate it just like an edit here does
    const confirmationIsCurrent = () => !!this.boardSizeConfirmation
      && this.boardSizeConfirmation.width == viewportConfig.targetWidth
      && this.boardSizeConfirmation.height == viewportConfig.targetHeight;

    const update = () => {
      const [ w, h ] = pending();
      const valid = isValid(w) && isValid(h);
      const changed = valid && (w != viewportConfig.targetWidth || h != viewportConfig.targetHeight);
      const isDefault = !(getCurrentGameSettings() || {}).boardSize;

      ratioReadout.textContent = valid ? `Aspect ratio: ${this.boardRatioText(w, h)}` : '';
      applyButton.disabled = !changed;
      resetButton.disabled = isDefault;
      resetButton.title = isDefault
        ? `This game already uses the default ${DEFAULT_VIEWPORT.targetWidth} × ${DEFAULT_VIEWPORT.targetHeight} board.`
        : `Remove the board size from the game and go back to ${DEFAULT_VIEWPORT.targetWidth} × ${DEFAULT_VIEWPORT.targetHeight}.`;

      for(const button of presetRow.children)
        button.classList.toggle('active', valid && button.dataset.ratio == (w/h).toFixed(4));

      updatePreview(w, h, valid);

      messages.innerHTML = '';
      if(!valid) {
        addMessage('error', `Width and height have to be between ${MIN_BOARD_SIZE} and ${MAX_BOARD_SIZE}.`);
        return;
      }

      // Applying rebuilds the whole tile (the meta message the server answers with does, and
      // more than once), so the "this is live for everyone now" confirmation lives on the
      // module instead of in the tile it was triggered from. Editing a field or closing the
      // panel drops it again.
      if(confirmationIsCurrent() && !changed)
        addMessage('success', this.boardSizeConfirmation.text);

      if(w/h > 4 || h/w > 4)
        addMessage('warning', w > h
          ? 'This board is much wider than it is tall - the toolbar will cover most of it on normal screens.'
          : 'This board is much taller than it is wide - the toolbar will cover most of it on normal screens.');

      const outside = this.widgetsNewlyOutsideBoard(w, h);
      if(outside.length)
        addMessage('warning', `${outside.length} widget${outside.length == 1 ? '' : 's'} would stick out past the board edge and be clipped away.`, {
          text: 'Select on board',
          onClick: _=>setSelection(outside)
        });
    };

    // an edit means the user moved on from whatever was applied last
    const edited = () => {
      this.boardSizeConfirmation = null;
      update();
    };

    for(const preset of presets) {
      const button = document.createElement('button');
      button.textContent = preset.text;
      // the labels are ratios but the buttons set concrete sizes, so say which
      button.title = `${preset.text.replace(/ .*/, '')} - sets ${preset.width} × ${preset.height}`;
      button.dataset.ratio = (preset.width/preset.height).toFixed(4);
      button.addEventListener('click', _=>{
        width.input.value = preset.width;
        height.input.value = preset.height;
        edited();
      });
      presetRow.append(button);
    }

    swapButton.addEventListener('click', _=>{
      [ width.input.value, height.input.value ] = [ height.input.value, width.input.value ];
      edited();
    });

    for(const input of [ width.input, height.input ]) {
      input.addEventListener('input', edited);
      // a cleared or unusable field would otherwise keep claiming a board size
      // that isn't the one everyone is playing on
      input.addEventListener('blur', _=>{
        if(!isValid(parseInt(input.value, 10))) {
          input.value = input == width.input ? viewportConfig.targetWidth : viewportConfig.targetHeight;
          update();
        }
      });
      input.addEventListener('keydown', e=>{
        if(e.key == 'Enter')
          apply();
      });
    }

    applyButton.addEventListener('click', apply);
    resetButton.addEventListener('click', reset);

    // Applying broadcasts a meta message that comes back here (and the board can
    // just as well be resized by somebody else). Only take the fields over when
    // the board size really changed, so an unrelated setting doesn't discard
    // whatever the user is in the middle of typing.
    let appliedSize = null;
    this.syncBoardSize = () => {
      const size = `${viewportConfig.targetWidth}x${viewportConfig.targetHeight}`;
      if(size != appliedSize) {
        appliedSize = size;
        width.input.value = viewportConfig.targetWidth;
        height.input.value = viewportConfig.targetHeight;
        // a board size that isn't the one we confirmed is somebody else's, so our
        // confirmation is history now - drop it instead of letting it come back
        // if that other editor happens to switch back later
        if(!confirmationIsCurrent())
          this.boardSizeConfirmation = null;
      }
      update();
    };

    this.syncBoardSize();
    target.append(tile);
  }

  addCssEditor(target) {
    this.addSubHeader('Global Room CSS');

    const p1 = document.createElement('p');
    p1.textContent = 'You can add custom CSS to your game. This is an advanced feature and should be used with care. VTT updates may break your custom CSS.';

    // Rules here are applied after the built-in stylesheet, so they win against a built-in class of the
    // same specificity - which is how a game changes what one of them does instead of inventing its own.
    const p2 = document.createElement('p');
    p2.textContent = 'Rules here also override the built-in classes. Widgets with the "transition" class glide to a new position over 300ms, for example, which ".transition { transition: transform 600ms; }" slows down.';
    target.append(p1, p2);

    const gameSettings = getCurrentGameSettings();
    const currentCss = gameSettings ? gameSettings.globalCss || '' : '';
    const textarea = document.createElement('textarea');
    textarea.value = currentCss;
    textarea.spellcheck = false;
    textarea.style.cssText = `
      width: 100%;
      min-height: 200px;
      white-space: pre;
      font-family: monospace;
      box-sizing: border-box;
    `;
    target.append(textarea);

    let debounceTimeout;
    textarea.addEventListener('input', () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        const gameSettings = getCurrentGameSettings();
        gameSettings.globalCss = textarea.value;
        toServer('setGameSettings', gameSettings);
      }, 500);
    });
  }

  removeLegacyMode(name) {
    const gameSettings = getCurrentGameSettings();
    if (gameSettings && gameSettings.legacyModes) {
      delete gameSettings.legacyModes[name];
      toServer('setGameSettings', gameSettings);
      this.renderModule(this.moduleDOM);
    }
  }

  onClose() {
    this.boardSizeConfirmation = null;
  }

  onMetaReceived(meta) {
    this.updateBadge();
    if(this.moduleDOM && this.syncBoardSize)
      this.syncBoardSize();
  }

  onStateReceived(state) {
    this.cachedWidgetBoxes = null;
    this.updateBadge();
    super.onStateReceived(state);
  }

  // widgets moved or were added, so the boxes the board size check works on are stale -
  // recheck right away, otherwise the "would stick out past the board edge" warning keeps
  // talking about where the widgets used to be until the user touches a field
  onDeltaReceivedWhileActive(delta) {
    this.cachedWidgetBoxes = null;
    if(this.syncBoardSize)
      this.syncBoardSize();
  }

  onMetaReceivedWhileActive(meta) {
    this.renderModule(this.moduleDOM);
    this.updateBadge();
  }

  onStateReceivedWhileActive(state) {
    this.renderModule(this.moduleDOM);
    this.updateBadge();
  }

  renderButton(target) {
    super.renderButton(target);
    this.updateBadge();
  }

  addLegacyModeSection(target) {
    this.addSubHeader('Legacy Modes');

    // Only the modes this game actually carries get a tile, so the intro is gated on the same
    // list - a save with nothing but an unknown key used to render a header and no checkboxes.
    const names = Object.keys(LEGACY_MODES).filter(name => legacyMode(name) !== undefined);

    const status = document.createElement('p');
    status.style.padding = '0 12px';
    if(!names.length) {
      status.textContent = 'No legacy modes are active for this game.';
      status.style.opacity = '0.8';
      target.append(status);
      return;
    }

    status.textContent = `${names.filter(name => legacyMode(name)).length} of ${names.length} legacy modes active for this game.`;
    status.style.fontWeight = 'bold';
    target.append(status);

    const p1 = document.createElement('p');
    p1.style.padding = '0 12px';
    p1.textContent = 'We try our best not to break existing games, but some bugs can only be fixed by changing game behavior.';
    target.append(p1);

    const intro = document.createElement('details');
    intro.style.padding = '0 12px';
    intro.open = this.introExpanded;

    const introSummary = document.createElement('summary');
    introSummary.textContent = 'What are legacy modes?';
    introSummary.style.cursor = 'pointer';

    const p2 = document.createElement('p');
    p2.textContent = 'For those occasions, we have introduced legacy modes. When active, each setting below will change certain things about VTT to former - usually buggy - behavior.';

    const p3 = document.createElement('p');
    p3.textContent = 'We highly recommend you build and test your games with all of these settings disabled (boxes unchecked) to avoid obscure bugs. If you are working on a game and these settings are checked, review the VTT wiki documentation before making changes to routines.';

    intro.append(introSummary, p2, p3);
    intro.addEventListener('toggle', () => this.introExpanded = intro.open);
    target.append(intro);

    for(const name of names)
      this.addLegacyModeCheckbox(name, target);
  }

  renderModule(target) {
    target.innerHTML = '';
    this.syncBoardSize = null;
    this.cachedWidgetBoxes = null;
    this.addHeader('Game Settings');

    this.addSubHeader('Board Settings');
    this.addBoardSizeSetting(target);

    this.addLegacyModeSection(target);

    this.addSubHeader('UI Settings');
    this.addDropdown('Cursor Visibility', 'cursorVisibility', 'Changes the visibility of other players\' cursor indicators in the room.', [
      { value: 'default', text: 'Default (Can modify in JSON)' },
      { value: 'translucent-fade', text: 'Translucent (fadeout)' },
      { value: 'solid-no-name-fade', text: 'Solid (fadeout)' },
      { value: 'solid-player-name-fade', text: 'Solid + Player Name (fadeout)' },
      { value: 'translucent-noFade', text: 'Translucent (indefinite)' },
      { value: 'solid-no-name-noFade', text: 'Solid (indefinite)' },
      { value: 'solid-player-name-noFade', text: 'Solid + Player Name (indefinite)' },
      { value: 'invisible', text: 'Invisible' },
    ], target);

    this.addCssEditor(target);
  }

  updateBadge() {
    const count = getEnabledLegacyModes().length;
    this.buttonDOM.dataset.badge = count || '';

    // The badge is an unlabeled number - say what it counts in the button tooltip.
    const tooltip = this.buttonDOM.querySelector('span');
    if(tooltip)
      tooltip.innerText = count ? `${this.tooltip} ${count} legacy mode${count == 1 ? '' : 's'} active.` : this.tooltip;
  }
}
