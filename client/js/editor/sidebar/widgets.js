class WidgetsModule extends SidebarModule {
  constructor() {
    super('inventory', 'Widgets', 'Manage custom widgets.');
  }

  onSelectionChangedWhileActive(newSelection) {
    if (this.moduleDOM) {
      $('#saveWidgetsToBuffer', this.moduleDOM).disabled = !newSelection.length;
    }
  }

  renderModule(target) {
    target.innerHTML = '';
    super.renderModule(target);
    this.addHeader('Custom Widgets');
    
    const d = div(target, '', `
      <div class="buttonBar" style="display: flex; align-items: center; margin-bottom: 10px;">
        <input type="text" id="widgetFilter" placeholder="Filter..." style="flex-grow: 1;flex-shrink: 1;margin-right: 5px;">
        <button icon="add" id="saveWidgetsToBuffer"></button>
        <button icon="edit" id="editWidgetsButton"></button>
      </div>
    `);
    
    $('#widgetFilter', d).onkeyup = e => this.renderWidgetBuffer(e.target.value);
    $('#editWidgetsButton', d).onclick = e => {
        this.currentContents.classList.toggle('editing');
        e.currentTarget.classList.toggle('active');
        for(const input of this.currentContents.querySelectorAll('input'))
            input.readOnly = !this.currentContents.classList.contains('editing');
    };
    $('#saveWidgetsToBuffer', d).onclick = e => this.button_saveWidgetsToBuffer();
    $('#saveWidgetsToBuffer', d).disabled = !selectedWidgets.length;
    
    this.currentContents = div(target);
    this.renderWidgetBuffer();
  }

  async renderWidgetBuffer(filter = '') {
    const response = await fetch('/api/widgets');
    let customWidgets = await response.json();
    if (!Array.isArray(customWidgets)) {
      customWidgets = Object.values(customWidgets);
    }
    const lowerCaseFilter = filter.toLowerCase();

    const filteredWidgets = Object.values(customWidgets).filter(widgetData => {
      if (!filter) return true;

      const nameMatch = (widgetData.name || widgetData.id || '').toLowerCase().includes(lowerCaseFilter);
      if (nameMatch) return true;

      if (widgetData.widgets && Array.isArray(widgetData.widgets)) {
        return widgetData.widgets.some(subWidget =>
          (subWidget.type || 'basic').toLowerCase().includes(lowerCaseFilter)
        );
      }
      return false;
    });
    
    let list = '';
    for(const state of filteredWidgets) {
      const widgetTypes = [...new Set(state.widgets.map(w => w.type || 'basic'))].join(', ');
      list += `
        <li data-id="${state.id}" draggable="true">
          <span class="drag-handle"></span>
          <div class="widget-info">
            <input value="${html(state.name || state.id)}" readonly>
            <div class="widget-type">${widgetTypes}</div>
          </div>
          <div class="actions">
            <label class="unique-widget-label"><input type="checkbox" ${state.unique ? 'checked' : ''}> Unique</label>
            <button icon="add"></button>
            <button icon="delete"></button>
          </div>
        </li>`;
    }
    this.currentContents.innerHTML = `<ul>${list}</ul>`;

    for(const item of this.currentContents.querySelectorAll('li')) {
      const widgetId = item.dataset.id;
      const state = customWidgets.find(w => w.id === widgetId);

      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', widgetId);
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragover', e => {
        e.preventDefault();
        const dragging = document.querySelector('.dragging');
        if (dragging !== item) {
          const rect = item.getBoundingClientRect();
          const y = e.clientY - rect.top;
          if (y < rect.height / 2) {
            item.parentNode.insertBefore(dragging, item);
          } else {
            item.parentNode.insertBefore(dragging, item.nextSibling);
          }
        }
      });

      const input = item.querySelector('input');
      input.onchange = e => {
        state.name = e.target.value;
        fetch(`/api/widgets/${state.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        });
      };
      input.readOnly = !this.currentContents.classList.contains('editing');
      item.querySelector('[icon=add]').onclick = e => this.button_loadWidgetFromBuffer(state);
      item.querySelector('[icon=delete]').onclick = async e => {
        if (confirm(`Are you sure you want to delete the widget "${state.name || state.id}"?`)) {
          await fetch(`/api/widgets/${state.id}`, { method: 'DELETE' });
          const currentFilter = document.getElementById('widgetFilter')?.value || '';
          this.renderWidgetBuffer(currentFilter);
        }
      };

      item.querySelector('.unique-widget-label input').onchange = e => {
        state.unique = e.target.checked;
        fetch(`/api/widgets/${state.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        });
      };
    }

    this.currentContents.addEventListener('dragstart', e => {
      e.target.classList.add('dragging');
    });

    this.currentContents.addEventListener('dragend', e => {
      e.target.classList.remove('dragging');
      const newOrder = [...this.currentContents.querySelectorAll('li')].map(item => customWidgets.find(w => w.id === item.dataset.id));
      fetch('/api/widgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrder)
      });
    });
  }

  button_saveWidgetsToBuffer() {
    function addRecursively(widget, buffer) {
      buffer.push(JSON.parse(JSON.stringify(widget.state)));
      for(const w of widgetFilter(w=>w.get('parent')==widget.id))
        addRecursively(w, buffer);
    }
    const widgetBuffer = [];
    for(const widget of selectedWidgets)
      addRecursively(widget, widgetBuffer);
    
    fetch('/api/widgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({name: 'New Widget', widgets: widgetBuffer})
    }).then(() => this.renderWidgetBuffer());
  }

  async button_loadWidgetFromBuffer(widgetData) {
    const widgetBuffer = JSON.parse(JSON.stringify(widgetData.widgets));
    const idMap = {};

    const duplicates = widgetBuffer.filter(state => widgets.has(state.id)).map(state => state.id);
    if (duplicates.length) {
      if (widgetData.unique) {
        const duplicatesList = duplicates.join(', ');
        const overwriteAll = confirm(`The following widget IDs already exist: ${duplicatesList}\n\nPress OK to overwrite these widgets, or Cancel to abort loading.`);
        if (!overwriteAll) return;
      } else {
        for (const widget of widgetBuffer) {
          const newId = generateUniqueWidgetID();
          idMap[widget.id] = newId;
        }
        for (const widget of widgetBuffer) {
          widget.id = idMap[widget.id];
        }
      }
    }

    for (const widget of widgetBuffer) {
      if (widget.parent && idMap[widget.parent]) {
        widget.parent = idMap[widget.parent];
      }
      if (widget.type === 'card' && widget.deck && idMap[widget.deck]) {
        widget.deck = idMap[widget.deck];
      }
    }
    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} loaded widgets from the widget buffer in editor`);

    const cards = [];
    const others = [];
    for (const state of widgetBuffer) {
      if (state.type === 'card') {
        cards.push(state);
      } else {
        others.push(state);
      }
    }

    const processWidgets = async (widgetsToProcess) => {
      for (const state of widgetsToProcess) {
        if (!widgetBuffer.some(w => w.id === state.parent) && !widgets.has(state.parent)) {
          delete state.parent;
          delete state.x;
          delete state.y;
        }
        if (state.type === 'card' && !widgetBuffer.some(w => w.id === state.deck) && !widgets.has(state.deck)) {
          console.error(`Widget ${state.id} references a deck that is not in the buffer and is not already in the room. It will not be loaded.`);
        } else {
          await addWidgetLocal(state);
        }
      }
    };

    await processWidgets(others);
    await processWidgets(cards);

    batchEnd();
  }
}