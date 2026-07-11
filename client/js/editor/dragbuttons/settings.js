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
      <button class="dragToolbarSettingButton dragToolbarMoveType" data-mode="freeform" icon=gesture><span>move placeholder</span></button>
      <span class="editorDragToolbarDivider"></span>
      <span class="editorDragToolbarLabel">Copy</span>
      <button class="dragToolbarSettingButton dragToolbarCopyType" data-mode="default" icon=content_copy><span>copy placeholder</span></button>
      <span class="editorDragToolbarDivider"></span>
      <span class="editorDragToolbarLabel">Resize</span>
      <button class="dragToolbarSettingButton dragToolbarResizeType" data-mode="unlocked" icon=lock_open_right><span>Lock or unlock aspect ratio when resizing</span></button>
    `);
    subtoolbar.id = 'editorDragToolbarSettings';

    const moveButton = $('.dragToolbarMoveType', subtoolbar);
    const copyButton = $('.dragToolbarCopyType', subtoolbar);
    const resizeButton = $('.dragToolbarResizeType', subtoolbar);

    const moveTooltips = {
      freeform: 'Move freeform.',
      grid: 'Move in the grid of the first selected widget.'
    };
    const copyTooltips = {
      default: 'Copy with all widget properties.',
      inheritFromSource: 'Copy using inheritFrom.',
      inheritFromMaster: 'Copy using inheritFrom of the original source.'
    };
    const resizeTooltips = {
      unlocked: 'Freeform aspect ratio.',
      locked: 'Locked aspect ratio.'
    };
    const moveIcons = { freeform: 'gesture', grid: 'grid_on' };
    const copyIcons = { default: 'content_copy', inheritFromSource: 'file_copy', inheritFromMaster: 'difference' };
    const resizeIcons = { unlocked: 'lock_open_right', locked: 'lock' };

    moveButton.onclick = () => this.cycleMode(moveButton, [ 'freeform', 'grid' ], moveIcons, moveTooltips);
    copyButton.onclick = () => this.cycleMode(copyButton, [ 'default', 'inheritFromSource', 'inheritFromMaster' ], copyIcons, copyTooltips);
    resizeButton.onclick = () => this.cycleMode(resizeButton, [ 'unlocked', 'locked' ], resizeIcons, resizeTooltips);

    this.applyMode(moveButton, moveButton.dataset.mode || 'freeform', moveIcons, moveTooltips);
    this.applyMode(copyButton, copyButton.dataset.mode || 'default', copyIcons, copyTooltips);
    this.applyMode(resizeButton, resizeButton.dataset.mode || 'unlocked', resizeIcons, resizeTooltips);
  }

  cycleMode(button, modes, icons, tooltips) {
    const current = button.dataset.mode || modes[0];
    const index = Math.max(0, modes.indexOf(current));
    const nextMode = modes[(index + 1) % modes.length];
    this.applyMode(button, nextMode, icons, tooltips);
    this.updateAllTooltips();
  }

  applyMode(button, mode, icons, tooltips) {
    button.dataset.mode = mode;
    if(icons && icons[mode])
      button.setAttribute('icon', icons[mode]);
    this.updateTooltip(button, tooltips);
  }

  updateTooltip(button, tooltips) {
    if(!tooltips)
      return;
    const span = $('span', button);
    if(span)
      span.textContent = tooltips[button.dataset.mode] || '';
  }

  updateAllTooltips() {
    const moveButton = $('#editorDragToolbarSettings .dragToolbarMoveType');
    const copyButton = $('#editorDragToolbarSettings .dragToolbarCopyType');
    const resizeButton = $('#editorDragToolbarSettings .dragToolbarResizeType');
    if(moveButton)
      this.updateTooltip(moveButton, {
        freeform: 'Move freeform.',
        grid: 'Move in the grid of the first selected widget.'
      });
    if(copyButton)
      this.updateTooltip(copyButton, {
        default: 'Copy with all widget properties.',
        inheritFromSource: 'Copy using inheritFrom.',
        inheritFromMaster: 'Copy using inheritFrom of the original source.'
      });
    if(resizeButton)
      this.updateTooltip(resizeButton, {
        unlocked: 'Freeform aspect ratio',
        locked: 'Locked aspect ratio'
      });
  }
}
