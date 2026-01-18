class SettingsDragButton extends ToolbarToggleButton {
  constructor() {
    super('settings', 'Settings', 'Change settings options for this toolbar.');
  }

  render(target) {
    super.render(target);
    this.domElement.classList.add('dragToolbarSettingsButton');
    this.ensureSubtoolbar();
    this.updateAllTooltips();
  }

  toggle(state) {
    const toolbar = $('#editorDragToolbar');
    if(toolbar)
      toolbar.classList.toggle('settingsActive', state);
  }

  onSelectionChanged(newSelection, oldSelection) {
    super.onSelectionChanged(newSelection, oldSelection);
    if(!newSelection.length && this.active) {
      this.setState(false);
      this.toggle(false);
    }
  }

  ensureSubtoolbar() {
    const toolbar = $('#editorDragToolbar');
    if(!toolbar || $('#editorDragToolbarSettings'))
      return;

    const subtoolbar = div(toolbar, 'editorDragToolbarSettings', `
      <span class="editorDragToolbarLabel">Move</span>
      <button class="dragToolbarSettingButton dragToolbarMoveType" icon=gesture><span>move placeholder</span></button>
      <span class="editorDragToolbarDivider"></span>
      <span class="editorDragToolbarLabel">Copy</span>
      <button class="dragToolbarSettingButton dragToolbarCopyType" icon=content_copy><span>copy placeholder</span></button>
      <span class="editorDragToolbarDivider"></span>
      <span class="editorDragToolbarLabel">Resize</span>
      <button class="dragToolbarSettingButton dragToolbarResizeType" icon=lock_open_right><span>Lock or unlock aspect ratio when resizing</span></button>
    `);
    subtoolbar.id = 'editorDragToolbarSettings';

    const moveButton = $('.dragToolbarMoveType', subtoolbar);
    const copyButton = $('.dragToolbarCopyType', subtoolbar);
    const resizeButton = $('.dragToolbarResizeType', subtoolbar);

    const moveTooltips = {
      gesture: 'Move freeform.',
      grid_on: 'Move in the grid of the first selected widget.'
    };
    const copyTooltips = {
      content_copy: 'Copy with all widget properties.',
      file_copy: 'Copy using inheritFrom.',
      difference: 'Copy using inheritFrom of the original source.'
    };
    const resizeTooltips = {
      lock_open_right: 'Freeform aspect ratio.',
      lock: 'Locked aspect ratio.'
    };

    moveButton.onclick = () => this.cycleIcon(moveButton, [ 'gesture', 'grid_on' ], moveTooltips);
    copyButton.onclick = () => this.cycleIcon(copyButton, [ 'content_copy', 'file_copy', 'difference' ], copyTooltips);
    resizeButton.onclick = () => this.cycleIcon(resizeButton, [ 'lock_open_right', 'lock' ], resizeTooltips);

    this.updateTooltip(moveButton, moveTooltips);
    this.updateTooltip(copyButton, copyTooltips);
    this.updateTooltip(resizeButton, resizeTooltips);
  }

  cycleIcon(button, icons, tooltips) {
    const current = button.getAttribute('icon');
    const index = Math.max(0, icons.indexOf(current));
    const nextIcon = icons[(index + 1) % icons.length];
    button.setAttribute('icon', nextIcon);
    this.updateTooltip(button, tooltips);
    this.updateAllTooltips();
  }

  updateTooltip(button, tooltips) {
    if(!tooltips)
      return;
    const span = $('span', button);
    if(span)
      span.textContent = tooltips[button.getAttribute('icon')] || '';
  }

  updateAllTooltips() {
    const moveButton = $('#editorDragToolbarSettings .dragToolbarMoveType');
    const copyButton = $('#editorDragToolbarSettings .dragToolbarCopyType');
    const resizeButton = $('#editorDragToolbarSettings .dragToolbarResizeType');
    if(moveButton)
      this.updateTooltip(moveButton, {
        gesture: 'Move freeform.',
        grid_on: 'Move in the grid of the first selected widget.'
      });
    if(copyButton)
      this.updateTooltip(copyButton, {
        content_copy: 'Copy with all widget properties.',
        file_copy: 'Copy using inheritFrom.',
        difference: 'Copy using inheritFrom of the original source.'
      });
    if(resizeButton)
      this.updateTooltip(resizeButton, {
        lock_open_right: 'Freeform aspect ratio',
        lock: 'Locked aspect ratio'
      });
  }
}
