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
        const isEditing = this.currentContents.classList.contains('editing');
        for (const li of this.currentContents.querySelectorAll('li')) {
            const source = li.dataset.source;
            const isServerWidgetReadonly = source === 'server' && !config.allowPublicLibraryEdits;
            for (const input of li.querySelectorAll('input')) {
                input.readOnly = isServerWidgetReadonly || !isEditing;
            }
        }
    };
    $('#saveWidgetsToBuffer', d).onclick = e => this.button_saveWidgetsToBuffer();
    $('#saveWidgetsToBuffer', d).disabled = !selectedWidgets.length;
    
    this.currentContents = div(target);
    this.renderWidgetBuffer();
  }

  async getWidgets(source) {
    if (source === 'server') {
      const response = await fetch('/api/widgets');
      return await response.json();
    } else {
      const data = localStorage.getItem('customWidgets');
      return data ? JSON.parse(data) : [];
    }
  }

  async createWidget(widgetData, target) {
    if (target === 'server') {
      if (!config.allowPublicLibraryEdits) return;
      return fetch('/api/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(widgetData)
      });
    } else {
      const widgets = await this.getWidgets('local');
      const newId = `local-${Date.now()}`;
      const newWidget = { ...widgetData, id: newId };
      widgets.push(newWidget);
      localStorage.setItem('customWidgets', JSON.stringify(widgets));
      return Promise.resolve(newWidget);
    }
  }

  async updateWidget(widget, source) {
    if (source === 'server') {
      if (!config.allowPublicLibraryEdits) return;
      return fetch(`/api/widgets/${widget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(widget)
      });
    } else {
      let widgets = await this.getWidgets('local');
      const index = widgets.findIndex(w => w.id === widget.id);
      if (index !== -1) {
        widgets[index] = widget;
        localStorage.setItem('customWidgets', JSON.stringify(widgets));
      }
    }
  }

  async updateAllWidgets(widgets, source) {
    if (source === 'server') {
      if (!config.allowPublicLibraryEdits) return;
      return fetch('/api/widgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(widgets)
      });
    } else {
      localStorage.setItem('customWidgets', JSON.stringify(widgets));
    }
  }

  async deleteWidget(widgetId, source) {
    if (source === 'server') {
      if (!config.allowPublicLibraryEdits) return;
      return fetch(`/api/widgets/${widgetId}`, { method: 'DELETE' });
    } else {
      let widgets = await this.getWidgets('local');
      widgets = widgets.filter(w => w.id !== widgetId);
      localStorage.setItem('customWidgets', JSON.stringify(widgets));
    }
  }

  renderList(widgets, source, filter) {
    const lowerCaseFilter = filter.toLowerCase();
    const filteredWidgets = Object.values(widgets).filter(widgetData => {
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
        <li data-id="${state.id}" data-source="${source}" draggable="${source === 'local' || config.allowPublicLibraryEdits}">
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
    return `<ul>${list}</ul>`;
  }

  async renderWidgetBuffer(filter = '') {
    const serverWidgets = await this.getWidgets('server');
    const localWidgets = await this.getWidgets('local');

    let serverListHTML = '';
    if (config.allowPublicLibraryEdits || serverWidgets.length > 0) {
      serverListHTML = `
        <div class="widget-list-container">
          <div class="widget-list-header">On The Server</div>
          <div class="widget-list server-list">${this.renderList(serverWidgets, 'server', filter)}</div>
        </div>
      `;
    }

    this.currentContents.innerHTML = `
      ${serverListHTML}
      <div class="widget-list-container">
        <div class="widget-list-header">In Local Storage</div>
        <div class="widget-list local-list">${this.renderList(localWidgets, 'local', filter)}</div>
      </div>
    `;

    for(const item of this.currentContents.querySelectorAll('li')) {
      const widgetId = item.dataset.id;
      const source = item.dataset.source;
      const allWidgets = source === 'server' ? serverWidgets : localWidgets;
      const state = allWidgets.find(w => w.id === widgetId);
      if (source === 'server' && !config.allowPublicLibraryEdits) {
        item.classList.add('readonly');
      }

      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', JSON.stringify({id: widgetId, source}));
        e.dataTransfer.effectAllowed = 'copy';
      });

      const input = item.querySelector('input');
      input.onchange = e => {
        if (source === 'server' && !config.allowPublicLibraryEdits) return;
        state.name = e.target.value;
        this.updateWidget(state, source);
      };
      input.readOnly = !this.currentContents.classList.contains('editing');
      item.querySelector('[icon=add]').onclick = e => this.button_loadWidgetFromBuffer(state);
      const deleteButton = item.querySelector('[icon=delete]');
      if (source === 'server' && !config.allowPublicLibraryEdits) {
        deleteButton.style.display = 'none';
      }
      deleteButton.onclick = async e => {
        if (confirm(`Are you sure you want to delete the widget "${state.name || state.id}"?`)) {
          await this.deleteWidget(state.id, source);
          this.renderWidgetBuffer(filter);
        }
      };

      item.querySelector('.unique-widget-label input').onchange = e => {
        if (source === 'server' && !config.allowPublicLibraryEdits) return;
        state.unique = e.target.checked;
        this.updateWidget(state, source);
      };
    }

    for (const list of this.currentContents.querySelectorAll('.widget-list')) {
      list.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      list.addEventListener('drop', async e => {
        e.preventDefault();
        const { id, source } = JSON.parse(e.dataTransfer.getData('text/plain'));
        const targetList = e.currentTarget.classList.contains('server-list') ? 'server' : 'local';

        if (source === targetList) return;
        if (targetList === 'server' && !config.allowPublicLibraryEdits) return;

        const allWidgets = source === 'server' ? serverWidgets : localWidgets;
        const widgetData = allWidgets.find(w => w.id === id);
        
        await this.createWidget(widgetData, targetList);
        this.renderWidgetBuffer(filter);
      });
    }
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
    
    const defaultTarget = config.allowPublicLibraryEdits ? 'server' : 'local';
    const name = selectedWidgets.length === 1 ? selectedWidgets[0].id : undefined;
    this.createWidget({name, widgets: widgetBuffer}, defaultTarget)
      .then(() => this.renderWidgetBuffer());
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