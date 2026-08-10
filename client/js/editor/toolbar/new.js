class NewButton extends ToolbarButton {
  constructor() {
    super('note_add', 'New room', 'Start with a new blank room.');
  }

  click() {
    if (!confirm('Start with a new blank room? Your current room state will be replaced.'))
      return;
    fetch(location.href.replace(/\/[^\/]+$/, a=>`/state${a}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{ "_meta": { "gameSettings": { "legacyModes": { } } } }'
    })
  }
}
