class GameSettingsModule extends SidebarModule {
  constructor() {
    super('settings', 'Game Settings', 'Settings like legacy modes for the current game.');
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

    const handleToggle = (e) => {
      if (e.target.tagName === 'A') return;
      const newState = !checkbox.checked;
      legacyMode(name, newState);
      checkbox.checked = newState;
      tile.style.background = newState ? 'var(--backgroundHighlightColor1)' : 'var(--backgroundColor)';
      removeSection.style.display = newState ? 'none' : 'block';
    };

    const handleRemove = (e) => {
      e.stopPropagation();
      const confirmMessage = `This can't be undone.\n\nOnly do this if you've confirmed your game works correctly without this setting.`;
      if(confirm(confirmMessage))
        this.removeLegacyMode(name);
    };

    tile.addEventListener('click', handleToggle);
    checkbox.addEventListener('change', handleToggle);
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
      const duration = select.value.includes('noFade') ? 9999 : 100;

      if (select.value === 'default') {
        css = '';
      } else if (select.value.includes('translucent')) {
        css = `
          .cursor {
            --cursorActiveOpacity: 0.3;
            --cursorPressedOpacity: 0.3;
            --cursorActiveDuration: ${duration}s;
          }
          .cursor.pressed {
            background-color: var(--playerColor);
          }
          .cursor::before {
            display: none;
          }
        `;
      } else if (select.value.includes('solid-no-name')) {
        css = `
          .cursor {
            --cursorActiveOpacity: 1;
            --cursorPressedOpacity: 1;
            --cursorActiveDuration: ${duration}s;
          }
          .cursor.pressed {
            background-color: var(--playerColor);
          }
          .cursor::before {
            display: none;
          }
        `;
      } else if (select.value.includes('solid-player-name')) {
        css = `
          .cursor {
            --cursorActiveOpacity: 1;
            --cursorPressedOpacity: 1;
            --cursorActiveDuration: ${duration}s;
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
      } else if (select.value === 'invisible') {
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

  addCssEditor(target) {
    this.addSubHeader('Global Room CSS');

    const p1 = document.createElement('p');
    p1.textContent = 'You can add custom CSS to your room. This is an advanced feature and should be used with care.';
    target.append(p1);

    const gameSettings = getCurrentGameSettings();
    const currentCss = gameSettings ? gameSettings.globalCss : '';
    const textarea = document.createElement('textarea');
    textarea.value = currentCss;
    textarea.spellcheck = false;
    textarea.style.cssText = `
      width: 100%;
      min-height: 200px;
      white-space: pre;
      font-family: monospace;
      border-width: 1px 0;
    `;
    target.append(textarea);

    textarea.addEventListener('input', () => {
      const gameSettings = getCurrentGameSettings();
      gameSettings.globalCss = textarea.value;
      toServer('setGameSettings', gameSettings);
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
  }

  onStateReceived(state) {
    this.updateBadge();
    super.onStateReceived(state);
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
    this.addHeader('Game Settings');

    const gameSettings = getCurrentGameSettings();
    if (Object.keys(gameSettings ? gameSettings.legacyModes : {}).length > 0) {
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

   this.addDropdown('Cursor Visibility', 'cursorVisibility', 'Changes the visibility of the cursor in the room.', [
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
