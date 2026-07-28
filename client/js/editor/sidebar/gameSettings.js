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
    tile.style.cssText = `
      border: 1px solid var(--modalBorderColor);
      border-left: 4px solid transparent;
      border-radius: 4px;
      padding: 12px;
      margin: 8px 0;
      background: var(--backgroundColor);
      color: var(--textColor);
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
    this.addHeader('Game Settings');

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
