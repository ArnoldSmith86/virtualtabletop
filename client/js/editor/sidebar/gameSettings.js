class GameSettingsModule extends SidebarModule {
  constructor() {
    super('settings', 'Game Settings', 'Settings like legacy modes and global game options.');
  }

  addCheckbox(text, name, description, target) {
    if(legacyMode(name) === undefined)
      return;

    const tile = document.createElement('div');
    tile.className = 'settings-tile';
    tile.style.cssText = `
      border: 1px solid var(--modalBorderColor);
      border-radius: 4px;
      padding: 12px;
      margin: 8px 0;
      background: var(--backgroundColor);
      color: var(--textColor);
      cursor: pointer;
      transition: all 0.2s ease;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    `;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = name;
    checkbox.id = name;
    checkbox.checked = legacyMode(name);
    checkbox.style.marginRight = '8px';

    const label = document.createElement('label');
    label.htmlFor = name;
    label.textContent = text;
    label.style.fontWeight = 'bold';

    header.append(checkbox, label);
    tile.append(header);

    const desc = document.createElement('div');
    desc.innerHTML = description;
    desc.style.fontSize = '0.9em';
    desc.style.color = 'var(--textColor)';
    
    // Prevent link clicks from toggling the checkbox
    desc.querySelectorAll('a').forEach(link => {
      link.style.pointerEvents = 'auto';
    });

    tile.append(desc);

    const removeSection = document.createElement('div');
    removeSection.style.cssText = `
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--modalBorderColor);
    `;
    removeSection.style.display = checkbox.checked ? 'none' : 'block';

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
    removeButton.className = 'red';
    removeButton.textContent = 'Remove';

    removeSection.append(removeText, removeButton);
    tile.append(removeSection);

    const handleRemove = (e) => {
      e.stopPropagation();
      const confirmMessage = `This can't be undone.\n\nOnly do this if you've confirmed your game works correctly without this setting.`;
      if(confirm(confirmMessage))
        this.removeLegacyMode(name);
    };

    const handleChange = () => {
      const newState = checkbox.checked;
      legacyMode(name, newState);
      tile.style.background = newState ? 'var(--backgroundHighlightColor1)' : 'var(--backgroundColor)';
      removeSection.style.display = newState ? 'none' : 'block';
    };

    tile.addEventListener('click', (e) => {
      if (e.target.tagName === 'A' || e.target.tagName === 'LABEL' || e.target === removeButton || removeButton.contains(e.target)) return;
      if (e.target !== checkbox) {
        checkbox.click();
      }
    });

    checkbox.addEventListener('change', handleChange);
    removeButton.addEventListener('click', handleRemove);

    // Set initial state
    tile.style.background = checkbox.checked ? 'var(--backgroundHighlightColor1)' : 'var(--backgroundColor)';

    target.append(tile);
  }

  addDropdown(text, name, description, options, target) {
    const tile = document.createElement('div');
    tile.className = 'settings-tile';
    tile.style.cssText = `
      border: 1px solid var(--modalBorderColor);
      border-radius: 4px;
      padding: 12px;
      margin: 8px 0;
      background: var(--backgroundColor);
      color: var(--textColor);
    `;

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

  // 16:10 stays 16:10, but a board like 1234x1000 reduces to nothing readable,
  // so fall back to a decimal ratio once the reduced numbers get big
  boardRatioText(width, height) {
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const divisor = gcd(Math.round(width), Math.round(height));
    const [ w, h ] = [ width/divisor, height/divisor ];
    const ratio = w <= 40 && h <= 40 ? `${w}:${h}` : `${(width/height).toFixed(2)}:1`;
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

  widgetsOutsideBoard(width, height) {
    return this.boardWidgetBoxes()
      .filter(box => box.left < 0 || box.top < 0 || box.right > width || box.bottom > height)
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
      How large the play area is, in game units. Widget <code>x</code>, <code>y</code>, <code>width</code> and <code>height</code> are measured on this grid and the whole board is scaled to fit each player's window, so this is what decides the board's shape - not how big it looks.
      <br><br>
      Existing widgets are <b>not</b> moved when you change it. Default is 1600 × 1000, allowed values are ${MIN_BOARD_SIZE} to ${MAX_BOARD_SIZE}.
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

    inputRow.append(width.wrap, cross, height.wrap, swapButton);
    tile.append(inputRow);

    const ratioReadout = document.createElement('div');
    ratioReadout.className = 'boardSizeRatio';
    tile.append(ratioReadout);

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
      toServer('setGameSettings', gameSettings);
    };

    const reset = () => {
      const gameSettings = getCurrentGameSettings();
      delete gameSettings.boardSize;
      toServer('setGameSettings', gameSettings);
    };

    const addMessage = (text, action) => {
      const message = document.createElement('div');
      message.className = 'boardSizeMessage';
      message.textContent = text;
      if(action) {
        const button = document.createElement('button');
        button.textContent = action.text;
        button.addEventListener('click', action.onClick);
        message.append(document.createElement('br'), button);
      }
      messages.append(message);
    };

    const update = () => {
      const [ w, h ] = pending();
      const valid = isValid(w) && isValid(h);
      const changed = valid && (w != viewportConfig.targetWidth || h != viewportConfig.targetHeight);

      ratioReadout.textContent = valid ? `= ${this.boardRatioText(w, h)}` : '';
      applyButton.disabled = !changed;
      resetButton.disabled = !(getCurrentGameSettings() || {}).boardSize;

      for(const button of presetRow.children)
        button.classList.toggle('active', valid && button.dataset.ratio == (w/h).toFixed(4));

      messages.innerHTML = '';
      if(!valid) {
        addMessage(`Width and height have to be between ${MIN_BOARD_SIZE} and ${MAX_BOARD_SIZE}.`);
        return;
      }

      if(w/h > 4 || h/w > 4)
        addMessage(w > h
          ? 'This board is much wider than it is tall - the toolbar will cover most of it on normal screens.'
          : 'This board is much taller than it is wide - the toolbar will cover most of it on normal screens.');

      const outside = this.widgetsOutsideBoard(w, h);
      if(outside.length)
        addMessage(`${outside.length} widget${outside.length == 1 ? '' : 's'} would stick out past the board edge and be clipped away.`, {
          text: 'Select them',
          onClick: _=>setSelection(outside)
        });
    };

    for(const preset of presets) {
      const button = document.createElement('button');
      button.textContent = preset.text;
      button.dataset.ratio = (preset.width/preset.height).toFixed(4);
      button.addEventListener('click', _=>{
        width.input.value = preset.width;
        height.input.value = preset.height;
        update();
      });
      presetRow.append(button);
    }

    swapButton.addEventListener('click', _=>{
      [ width.input.value, height.input.value ] = [ height.input.value, width.input.value ];
      update();
    });

    for(const input of [ width.input, height.input ]) {
      input.addEventListener('input', update);
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
    target.append(p1);

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

  renderModule(target) {
    target.innerHTML = '';
    this.syncBoardSize = null;
    this.cachedWidgetBoxes = null;
    this.addHeader('Game Settings');

    this.addSubHeader('Board Settings');
    this.addBoardSizeSetting(target);

    const gameSettings = getCurrentGameSettings();
    // a game that only sets a board size (or only global CSS) has game settings without any
    // legacy modes in them, so this can't assume the object is there
    if (Object.keys(gameSettings && gameSettings.legacyModes || {}).length > 0) {
      this.addSubHeader('Legacy Modes');
      const p1 = document.createElement('p');
      p1.textContent = 'We try our best not to break existing games, but some bugs can only be fixed by changing game behavior.';
      target.append(p1);

      const p2 = document.createElement('p');
      p2.textContent = 'For those occasions, we have introduced legacy modes. When active, each setting below will change certain things about VTT to former - usually buggy - behavior.';
      target.append(p2);

      const p3 = document.createElement('p');
      p3.textContent = 'We highly recommended you build and test your games with all of these settings disabled (boxes unchecked) to avoid obscure bugs. If you are working on a game and these settings are checked, review the VTT wiki documentation before making changes to routines. If there are no checkboxes below, legacy mode is not applicable for your game.';
      target.append(p3);
    }
 
    this.addCheckbox('Convert numeric var parameters to numbers', 'convertNumericVarParametersToNumbers', `
      <b>Problem</b>: Whenever you used a string in a var expression that consisted of only digits, it was converted to a number.
      <br><br>
      A common pitfall was storing a widget <code>id</code> in an array and later trying to <code>SELECT</code> it using the stored <code>id</code>. Because <code>id</code>s are randomly generated alphanumeric strings, this would fail for some unlucky widgets that received an all numeric <code>id</code>.
      <br><br>
      <b>Example:</b>
      <br>
      <code>var a = []</code>
      <br>
      <code>var a = push '1'</code>
      <br><br>
      <b>Old result</b>: <code>[1]</code><br>
      <b>New result</b>: <code>['1']</code>
      <br><br>
      See <a href="https://github.com/ArnoldSmith86/virtualtabletop/pull/2581">pull request #2581</a> for technical details. Also see the <a href="https://github.com/ArnoldSmith86/virtualtabletop/wiki/Legacy-Mode">Legacy Mode wiki</a> page.
      `, target);
    this.addCheckbox('Use 1 as default for var parameters', 'useOneAsDefaultForVarParameters', `
      <b>Problem</b>: When you called a function in a var expression, every parameter not provided was set to <code>1</code>.
      <br><br>
      <b>Example:</b>
      <br>
      <code>var a = +</code>
      <br><br>
      <b>Old result</b>: <code>2</code><br>
      <b>New result</b>: <code>0</code> and an error message
      <br><br>
      See <a href="https://github.com/ArnoldSmith86/virtualtabletop/pull/2581">pull request #2581</a> for technical details. Also see the <a href="https://github.com/ArnoldSmith86/virtualtabletop/wiki/Legacy-Mode">Legacy Mode wiki</a> page.
      `, target);
    this.addCheckbox('Use iframes for card face HTML objects', 'useIframeForHtmlCards', `
      <b>Legacy Behavior</b>: Card face objects with <code>type: 'html'</code> are rendered in an iframe. This behavior is used for older games and can be enabled by checking this box.
      <br><br>
      <b>Default Behavior</b>: These objects are rendered directly into the DOM which should be faster and easier to work with. This is the default for new games and is used when this box is unchecked.
      <br><br>
      See <a href="https://github.com/ArnoldSmith86/virtualtabletop/pull/2729">pull request #2729</a> for technical details. Also see the <a href="https://github.com/ArnoldSmith86/virtualtabletop/wiki/Legacy-Mode">Legacy Mode wiki</a> page.
      `, target);
    this.addCheckbox('Disable holder image support', 'disableHolderImageWidget', `
      <b>Problem</b>: Holders now support image, icon, and text properties natively, but some games manually implemented this functionality before it was supported and may break with the new behavior.
      <br><br>
      <b>Old behavior</b>: Holders did not natively support image/icon/text properties, requiring manual workarounds.<br>
      <b>New behavior</b>: Holders support image, icon, and text properties directly.
      <br><br>
      This legacy mode disables the native image/icon/text support for holders, restoring the old behavior.
      <br><br>
      See <a href="https://github.com/ArnoldSmith86/virtualtabletop/pull/2634">pull request #2634</a> for technical details. Also see the <a href="https://github.com/ArnoldSmith86/virtualtabletop/wiki/Legacy-Mode">Legacy Mode wiki</a> page.
      `, target);

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
  }
}
