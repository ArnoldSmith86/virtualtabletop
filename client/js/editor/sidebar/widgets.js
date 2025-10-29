class WidgetsModule extends SidebarModule {
  constructor() {
    super('widgets', 'Widgets', 'Manage custom widgets.');
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
        <button icon="add" id="saveWidgetsToBuffer" class="sidebarButton"><span>Save selected widgets</span></button>
        <button icon="edit" id="editWidgetsButton" class="sidebarButton"><span>Edit widgets</span></button>
      </div>
    `);

    $('#widgetFilter', d).onkeyup = e => this.renderWidgetBuffer(e.target.value);
    $('#editWidgetsButton', d).onclick = e => {
      this.currentContents.classList.toggle('editing');
      e.currentTarget.classList.toggle('active');
      if (this.currentContents.classList.contains('editing')) {
        this.currentContents.classList.add('editing-widgets');
      } else {
        this.currentContents.classList.remove('editing-widgets');
      }
      this.renderWidgetBuffer($('#widgetFilter', d).value);
    };
    $('#saveWidgetsToBuffer', d).onclick = e => this.button_saveWidgetsToBuffer();
    $('#saveWidgetsToBuffer', d).disabled = !selectedWidgets.length;

    this.currentContents = div(target);
    this.renderWidgetBuffer();
  }

  async getWidgets(source) {
    let data;
    if (source === 'server') {
      const response = await fetch(`${config.urlPrefix}/api/widgets`);
      data = await response.json();
    } else {
      const rawData = localStorage.getItem('customWidgets');
      if (!rawData) return { widgets: [], groups: [] };
      try {
        data = JSON.parse(rawData);
      } catch (e) {
        return { widgets: [], groups: [] };
      }
    }

    if (Array.isArray(data)) {
      return { widgets: data, groups: [] };
    }

    if (typeof data === 'object' && data !== null) {
      const widgets = Array.isArray(data.widgets) ? data.widgets : [];
      const groups = Array.isArray(data.groups) ? data.groups : [];
      return { widgets, groups };
    }

    return { widgets: [], groups: [] };
  }

  async createWidget(widgetData, target) {
    const { widgets, groups } = await this.getWidgets(target);
    const newId = target === 'local' ? `local-${Date.now()}-${Math.random().toString(36).substring(2, 11)}` : undefined;
    const newWidget = JSON.parse(JSON.stringify(widgetData));
    if (newId) {
      newWidget.id = newId;
    }
    widgets.push(newWidget);

    if (target === 'server') {
      if (!config.allowPublicLibraryEdits) return;
      return fetch(`${config.urlPrefix}/api/widgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets, groups })
      });
    } else {
      localStorage.setItem('customWidgets', JSON.stringify({ widgets, groups }));
      return Promise.resolve(newWidget);
    }
  }

  async updateWidget(widget, source) {
    const { widgets, groups } = await this.getWidgets(source);
    const index = widgets.findIndex(w => w.id === widget.id);
    if (index !== -1) {
      widgets[index] = widget;
      await this.updateAllWidgets({ widgets, groups }, source);
    }
  }

  async updateAllWidgets(data, source) {
    if (source === 'server') {
      if (!config.allowPublicLibraryEdits) return;
      return fetch(`${config.urlPrefix}/api/widgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } else {
      localStorage.setItem('customWidgets', JSON.stringify(data));
    }
  }

  async deleteWidget(widgetId, source) {
    const { widgets, groups } = await this.getWidgets(source);
    const updatedWidgets = widgets.filter(w => w.id !== widgetId);

    for (const group of groups) {
      group.widgets = group.widgets.filter(id => id !== widgetId);
    }

    await this.updateAllWidgets({ widgets: updatedWidgets, groups }, source);
  }

  renderList(widgets, groups, source, filter, isEditing) {
    const lowerCaseFilter = filter.toLowerCase();

    const filterWidgets = (widgetList) => {
      return widgetList.filter(widgetData => {
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
    };

    const renderWidget = (state) => {
      const widgetTypes = [...new Set(state.widgets.map(w => w.type || 'basic'))].join(', ');
      return `
            <li data-id="${state.id}" data-source="${source}" draggable="${isEditing}">
                <span class="drag-handle"></span>
                <div class="widget-info">
                    <input value="${html(state.name || state.id)}" readonly>
                    <div class="widget-type">${widgetTypes}</div>
                </div>
                <div class="actions">
                    <label class="unique-widget-label"><input type="checkbox" ${state.unique ? 'checked' : ''}> Unique</label>
                    <button icon="add" class="sidebarButton"><span>Add widget to room</span></button>
                    <button icon="download" class="sidebarButton download-json"><span>Download</span></button>
                    <button icon="delete" class="sidebarButton"><span>Delete widget</span></button>
                </div>
            </li>`;
    };

    let list = '';
    const groupedWidgetIds = new Set(groups.flatMap(g => g.widgets));

    for (const group of groups) {
      const groupWidgets = group.widgets.map(id => widgets.find(w => w.id === id)).filter(Boolean);
      const filteredGroupWidgets = filterWidgets(groupWidgets);

      if (filter && filteredGroupWidgets.length === 0) continue;

      const isCollapsed = filter ? false : group.collapsed;
      list += `
          <div class="widget-group" data-group-name="${html(group.name)}" data-source="${source}">
              <div class="widget-group-header" draggable="${isEditing}">
                  <span class="drag-handle"></span>
                  <span class="collapse-arrow">${isCollapsed ? '▶' : '▼'}</span>
                  <input class="group-name-input" value="${html(group.name)}" readonly>
              </div>
              <ul class="widget-group-body" ${isCollapsed ? 'style="display: none;"' : ''}>
                  ${filteredGroupWidgets.map(renderWidget).join('')}
              </ul>
          </div>
      `;
    }

    const ungroupedWidgets = widgets.filter(w => !groupedWidgetIds.has(w.id));
    const filteredUngroupedWidgets = filterWidgets(ungroupedWidgets);

    if (filteredUngroupedWidgets.length > 0) {
      list += `<ul>${filteredUngroupedWidgets.map(renderWidget).join('')}</ul>`;
    }

    list += `<div class="new-group-drop-target" data-source="${source}"></div>`;

    return list;
  }

  async renderWidgetBuffer(filter = '') {
    const { widgets: serverWidgets, groups: serverGroups } = await this.getWidgets('server');
    const { widgets: localWidgets, groups: localGroups } = await this.getWidgets('local');

    const isEditing = this.currentContents.classList.contains('editing');
    let serverListHTML = '';
    if (config.allowPublicLibraryEdits || serverWidgets.length > 0) {
      serverListHTML = `
        <div class="widget-list-container">
          <div class="widget-list-header">
            <span>On The Server</span>
            <div class="widget-list-actions">
              ${config.allowPublicLibraryEdits ? `<button icon="upload" class="sidebarButton import-widgets" data-source="server"><span>Import Server-Wide</span></button>` : ''}
              <button icon="download" class="sidebarButton export-widgets" data-source="server"><span>Download Custom Widgets</span></button>
            </div>
          </div>
          <div class="widget-list server-list">${this.renderList(serverWidgets, serverGroups, 'server', filter, isEditing)}</div>
        </div>
      `;
    }

    this.currentContents.innerHTML = `
      ${serverListHTML}
      <div class="widget-list-container">
        <div class="widget-list-header">
          <span>In Local Storage</span>
          <div class="widget-list-actions">
            <button icon="upload" class="sidebarButton import-widgets" data-source="local"><span>Import to Local Storage</span></button>
            <button icon="download" class="sidebarButton export-widgets" data-source="local"><span>Download Custom Widgets</span></button>
          </div>
        </div>
        <div class="widget-list local-list">
          ${(localWidgets.length === 0 && localGroups.length == 0) ? '<div class="explainer-text">Select a widget in the room and press "+" (Save selected widgets) to create a reusable widget.</div>' : this.renderList(localWidgets, localGroups, 'local', filter, isEditing)}
        </div>
      </div>
    `;

    for (const button of this.currentContents.querySelectorAll('.export-widgets')) {
      button.onclick = e => this.exportWidgets(e.currentTarget.dataset.source);
    }
    for (const button of this.currentContents.querySelectorAll('.import-widgets')) {
      button.onclick = e => this.importWidgets(e.currentTarget.dataset.source);
    }

    for (const item of this.currentContents.querySelectorAll('li')) {
      const widgetId = item.dataset.id;
      const source = item.dataset.source;
      const allWidgets = source === 'server' ? serverWidgets : localWidgets;
      const state = allWidgets.find(w => w.id === widgetId);
      if (!state) return;
      if (source === 'server' && !config.allowPublicLibraryEdits) {
        item.classList.add('readonly');
      }

      const input = item.querySelector('input');
      input.readOnly = (source === 'server' && !config.allowPublicLibraryEdits) || !isEditing;
      if (!isEditing) {
        input.disabled = true;
      }
      item.draggable = isEditing || source === 'local' || config.allowPublicLibraryEdits;

      item.addEventListener('dragstart', e => {
        if (isEditing) {
          e.dataTransfer.setData('text/plain', JSON.stringify({ id: widgetId, source, action: 'reorder' }));
          e.dataTransfer.effectAllowed = 'move';
          item.classList.add('dragging');
        } else {
          e.dataTransfer.setData('text/plain', JSON.stringify({ id: widgetId, source }));
          e.dataTransfer.effectAllowed = 'copy';

          const widgetBuffer = JSON.parse(JSON.stringify(state.widgets));
          if (!widgetBuffer || widgetBuffer.length === 0) return;

          const previewContainer = document.createElement('div');
          previewContainer.style.position = 'absolute';
          previewContainer.style.left = '-9999px';

          const idMap = new Map();
          const tempWidgetInstances = new Map();
          const cards = [];
          const others = [];

          for (const s of widgetBuffer) {
            if (s.type === 'card') {
              cards.push(s);
            } else {
              others.push(s);
            }
          }

          const rootWidgets = widgetBuffer.filter(s => !s.parent || !widgetBuffer.some(p => p.id === s.parent));
          let minX = rootWidgets.length > 0 ? Infinity : 0;
          let minY = rootWidgets.length > 0 ? Infinity : 0;
          for (const s of rootWidgets) {
            minX = Math.min(minX, s.x || 0);
            minY = Math.min(minY, s.y || 0);
          }

          const createInstances = (statesToProcess) => {
            for (const s of statesToProcess) {
              const tempId = `drag-preview-${Date.now()}-${Math.random()}`;
              idMap.set(s.id, tempId);
              let previewWidget;
              switch (s.type) {
                case 'button': previewWidget = new Button(tempId); break;
                case 'canvas': previewWidget = new Canvas(tempId); break;
                case 'card': previewWidget = new Card(tempId); break;
                case 'deck': previewWidget = new Deck(tempId); break;
                case 'dice': previewWidget = new Dice(tempId); break;
                case 'holder': previewWidget = new Holder(tempId); break;
                case 'label': previewWidget = new Label(tempId); break;
                case 'pile': previewWidget = new Pile(tempId); break;
                case 'scoreboard': previewWidget = new Scoreboard(tempId); break;
                case 'seat': previewWidget = new Seat(tempId); break;
                case 'spinner': previewWidget = new Spinner(tempId); break;
                case 'timer': previewWidget = new Timer(tempId); break;
                default: previewWidget = new BasicWidget(tempId); break;
              }
              tempWidgetInstances.set(tempId, previewWidget);
            }
          };

          const applyDeltasAndRender = (statesToProcess) => {
            for (const s of statesToProcess) {
              const tempId = idMap.get(s.id);
              const previewWidget = tempWidgetInstances.get(tempId);
              widgets.set(tempId, previewWidget);

              const tempState = JSON.parse(JSON.stringify(s));
              tempState.id = tempId;

              const parentId = tempState.parent ? idMap.get(tempState.parent) : null;
              if (parentId) {
                tempState.parent = parentId;
              } else {
                tempState.x = (s.x || 0) - minX;
                tempState.y = (s.y || 0) - minY;
              }
              if (tempState.deck) tempState.deck = idMap.get(tempState.deck);

              previewWidget.applyInitialDelta(tempState);

              if (!parentId) {
                previewContainer.appendChild(previewWidget.domElement);
              }
            }
          };

          createInstances(others);
          createInstances(cards);

          applyDeltasAndRender(others);
          applyDeltasAndRender(cards);

          document.body.appendChild(previewContainer);
          e.dataTransfer.setDragImage(previewContainer, 0, 0);

          setTimeout(() => {
            for (const tempId of tempWidgetInstances.keys()) {
              widgets.delete(tempId);
            }
            document.body.removeChild(previewContainer);
          }, 0);
        }
      });

      item.addEventListener('dragend', e => {
        item.classList.remove('dragging');
      });

      item.addEventListener('dragover', e => {
        if (isEditing) {
          e.preventDefault();
          item.classList.add('drag-over');
        }
      });

      item.addEventListener('dragleave', e => {
        if (isEditing) {
          item.classList.remove('drag-over');
        }
      });

      item.addEventListener('drop', async e => {
        if (isEditing) {
          e.preventDefault();
          e.stopPropagation();
          item.classList.remove('drag-over');
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.action !== 'reorder') return;

          const draggedId = data.id;
          const targetId = item.dataset.id;
          const source = data.source;

          if (draggedId === targetId) return;

          const { widgets, groups } = await this.getWidgets(source);

          const sourceGroup = groups.find(g => g.widgets.includes(draggedId));
          const targetGroup = groups.find(g => g.widgets.includes(targetId));

          if (sourceGroup && sourceGroup === targetGroup) {
            const draggedIndex = sourceGroup.widgets.indexOf(draggedId);
            const targetIndex = sourceGroup.widgets.indexOf(targetId);

            if (draggedIndex !== -1 && targetIndex !== -1) {
              const [draggedWidgetId] = sourceGroup.widgets.splice(draggedIndex, 1);
              sourceGroup.widgets.splice(targetIndex, 0, draggedWidgetId);
              await this.updateAllWidgets({ widgets, groups }, source);
              this.renderWidgetBuffer(filter);
            }
          } else {
            const draggedIndex = widgets.findIndex(w => w.id === draggedId);
            const targetIndex = widgets.findIndex(w => w.id === targetId);

            if (draggedIndex !== -1 && targetIndex !== -1) {
              const [draggedWidget] = widgets.splice(draggedIndex, 1);
              widgets.splice(targetIndex, 0, draggedWidget);
              await this.updateAllWidgets({ widgets, groups }, source);
              this.renderWidgetBuffer(filter);
            }
          }
        }
      });

      input.onchange = e => {
        if (source === 'server' && !config.allowPublicLibraryEdits) return;
        state.name = e.target.value;
        this.updateWidget(state, source);
      };
      item.querySelector('[icon=add]').onclick = e => window.placeWidget(state.id, source);
      item.querySelector('.download-json').onclick = e => this.exportWidgetJson(state);
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
        if (isEditing) {
          e.dataTransfer.dropEffect = 'move';
        } else {
          e.dataTransfer.dropEffect = 'copy';
        }
      });

      list.addEventListener('drop', async e => {
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.action === 'reorder') return;
        const { id, source } = data;
        const targetList = e.currentTarget.classList.contains('server-list') ? 'server' : 'local';

        if (source === targetList) return;
        if (targetList === 'server' && !config.allowPublicLibraryEdits) return;

        const { widgets: sourceWidgets, groups: sourceGroups } = await this.getWidgets(source);
        const widgetData = sourceWidgets.find(w => w.id === id);

        await this.createWidget(widgetData, targetList);

        const widgetGroup = sourceGroups.find(g => g.widgets.includes(id));
        if (widgetGroup) {
          const { groups: targetGroups } = await this.getWidgets(targetList);
          const targetGroup = targetGroups.find(g => g.name === widgetGroup.name);
          if (targetGroup) {
            targetGroup.widgets = targetGroup.widgets.filter(wid => wid !== id);
          }
        }

        this.renderWidgetBuffer(filter);
      });
    }

    for (const dropTarget of this.currentContents.querySelectorAll('.new-group-drop-target')) {
      dropTarget.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dropTarget.classList.add('drag-over');
      });
      dropTarget.addEventListener('dragleave', e => {
        dropTarget.classList.remove('drag-over');
      });
      dropTarget.addEventListener('drop', async e => {
        e.preventDefault();
        dropTarget.classList.remove('drag-over');
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const { id, source } = data;

        const groupName = prompt('Enter a name for the new group:');
        if (!groupName) return;

        const { widgets, groups } = await this.getWidgets(source);
        const newGroup = { name: groupName, widgets: [id], collapsed: false };
        groups.push(newGroup);
        await this.updateAllWidgets({ widgets, groups }, source);
        this.renderWidgetBuffer(filter);
      });
    }

    for (const groupHeader of this.currentContents.querySelectorAll('.widget-group-header')) {
      groupHeader.addEventListener('click', async e => {
        if (e.target.classList.contains('group-name-input')) return;
        const groupName = groupHeader.parentElement.dataset.groupName;
        const source = groupHeader.parentElement.dataset.source;
        const { widgets, groups } = await this.getWidgets(source);
        const group = groups.find(g => g.name === groupName);
        if (group) {
          group.collapsed = !group.collapsed;
          await this.updateAllWidgets({ widgets, groups }, source);
          this.renderWidgetBuffer(filter);
        }
      });

      const groupNameInput = groupHeader.querySelector('.group-name-input');
      groupNameInput.readOnly = !isEditing;
      if (isEditing) {
        groupNameInput.addEventListener('dblclick', e => {
          groupNameInput.readOnly = false;
          groupNameInput.focus();
        });
      } else {
        groupNameInput.disabled = true;
      }

      const saveGroupName = async () => {
        if (groupNameInput.readOnly) return;
        const newGroupName = groupNameInput.value;
        const oldGroupName = groupHeader.parentElement.dataset.groupName;
        const source = groupHeader.parentElement.dataset.source;
        const { widgets, groups } = await this.getWidgets(source);
        const group = groups.find(g => g.name === oldGroupName);
        if (group && newGroupName) {
          group.name = newGroupName;
          await this.updateAllWidgets({ widgets, groups }, source);
          this.renderWidgetBuffer(filter);
        } else {
          groupNameInput.value = oldGroupName;
        }
        groupNameInput.readOnly = true;
      };

      groupNameInput.addEventListener('blur', saveGroupName);
      groupNameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          saveGroupName();
        }
      });

      groupHeader.addEventListener('dragstart', e => {
        e.stopPropagation();
        const groupName = groupHeader.parentElement.dataset.groupName;
        const source = groupHeader.parentElement.dataset.source;
        e.dataTransfer.setData('text/plain', JSON.stringify({ groupName, source, action: 'reorderGroup' }));
        e.dataTransfer.effectAllowed = 'move';
      });

      groupHeader.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        groupHeader.parentElement.classList.add('drag-over');
      });

      groupHeader.addEventListener('dragleave', e => {
        groupHeader.parentElement.classList.remove('drag-over');
      });

      groupHeader.addEventListener('drop', async e => {
        e.preventDefault();
        e.stopPropagation();
        groupHeader.parentElement.classList.remove('drag-over');
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));

        if (data.action === 'reorderGroup') {
          const { groupName: draggedGroupName, source } = data;
          const targetGroupName = groupHeader.parentElement.dataset.groupName;
          const { widgets, groups } = await this.getWidgets(source);

          const draggedIndex = groups.findIndex(g => g.name === draggedGroupName);
          const targetIndex = groups.findIndex(g => g.name === targetGroupName);

          if (draggedIndex !== -1 && targetIndex !== -1) {
            const [draggedGroup] = groups.splice(draggedIndex, 1);
            groups.splice(targetIndex, 0, draggedGroup);
            await this.updateAllWidgets({ widgets, groups }, source);
            this.renderWidgetBuffer(filter);
          }
        } else {
          const { id, source } = data;
          const targetGroupName = groupHeader.parentElement.dataset.groupName;
          const { widgets, groups } = await this.getWidgets(source);

          const sourceGroup = groups.find(g => g.widgets.includes(id));
          if (sourceGroup) {
            sourceGroup.widgets = sourceGroup.widgets.filter(wid => wid !== id);
          }

          const targetGroup = groups.find(g => g.name === targetGroupName);
          if (targetGroup) {
            targetGroup.widgets.push(id);
          }

          await this.updateAllWidgets({ widgets, groups }, source);
          this.renderWidgetBuffer(filter);
        }
      });
    }
  }

  button_saveWidgetsToBuffer() {
    function addRecursively(widget, buffer) {
      buffer.push(JSON.parse(JSON.stringify(widget.state)));
      for (const w of widgetFilter(w => w.get('parent') == widget.id))
        addRecursively(w, buffer);
    }
    const widgetBuffer = [];
    for (const widget of selectedWidgets)
      addRecursively(widget, widgetBuffer);

    const defaultTarget = config.allowPublicLibraryEdits ? 'server' : 'local';
    const name = selectedWidgets.length > 0 ? selectedWidgets[0].id : undefined;
    this.createWidget({ name, widgets: widgetBuffer }, defaultTarget)
      .then(() => this.renderWidgetBuffer());
  }

  async updateWidgetFromBuffer() {
    const textarea = $('#editWidgetJSON');
    const source = textarea.dataset.source;
    const previousState = JSON.parse(textarea.dataset.previousState);
    let currentState;
    try {
      currentState = JSON.parse(textarea.value);
    } catch (e) {
      alert(e.toString());
      return;
    }

    if (currentState.id !== previousState.id) {
      // ID has changed, this is tricky. We need to delete the old one and create a new one.
      // For simplicity, we'll prevent ID changes in this editor for now.
      alert("Changing the widget ID is not supported here. Please create a new widget instead.");
      textarea.value = JSON.stringify(previousState, null, 2);
      return;
    }

    await window.updateWidget(JSON.stringify(currentState), JSON.stringify(previousState));
    this.renderWidgetBuffer();
    showOverlay(); // hide overlay
  }

  editWidgetJson(state, source) {
    const textarea = $('#editWidgetJSON');
    const widgetData = JSON.stringify(state, null, 2);
    textarea.value = widgetData;
    textarea.dataset.previousState = widgetData;
    textarea.dataset.source = source;

    // Monkey-patch the save button's onclick
    const saveButton = $('#editJSONoverlay .custom-json-editor-buttons > button[icon=save]');
    saveButton.onclick = () => this.updateWidgetFromBuffer();

    const cancelButton = $('#editJSONoverlay .custom-json-editor-buttons > button[icon=close]');
    cancelButton.onclick = () => showOverlay();

    showOverlay('editJSONoverlay');
  }

  async placeWidgetFromBuffer(widgetData, coords) {
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

    const newRootWidgetIds = [];
    const cards = [];
    const others = [];
    for (const state of widgetBuffer) {
      if (state.type === 'card') {
        cards.push(state);
      } else {
        others.push(state);
      }
    }

    const rootWidgets = widgetBuffer.filter(state => !widgetBuffer.some(w => w.id === state.parent) && !widgets.has(state.parent));
    let offsetX = 0;
    let offsetY = 0;

    if (coords && rootWidgets.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      for (const w of rootWidgets) {
        minX = Math.min(minX, w.x || 0);
        minY = Math.min(minY, w.y || 0);
      }
      offsetX = coords.x - minX;
      offsetY = coords.y - minY;
    }

    const processWidgets = async (widgetsToProcess) => {
      for (const state of widgetsToProcess) {
        const isRoot = !widgetBuffer.some(w => w.id === state.parent) && !widgets.has(state.parent);

        if (isRoot) {
          if (coords) {
            state.x = (state.x || 0) + offsetX;
            state.y = (state.y || 0) + offsetY;
          }
          delete state.parent;
        }

        if (state.type === 'card' && !widgetBuffer.some(w => w.id === state.deck) && !widgets.has(state.deck)) {
          console.error(`Widget ${state.id} references a deck that is not in the buffer and is not already in the room. It will not be loaded.`);
        } else {
          const newId = await addWidgetLocal(state);
          if (isRoot) {
            newRootWidgetIds.push(newId);
          }
        }
      }
    };

    await processWidgets(others);
    await processWidgets(cards);

    batchEnd();
    return newRootWidgetIds;
  }

  async button_loadWidgetFromBuffer(widgetData) {
    this.placeWidgetFromBuffer(widgetData);
  }

  exportWidgetJson(widgetData) {
    const json = JSON.stringify(widgetData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${widgetData.name || widgetData.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async exportWidgets(source) {
    const widgets = await this.getWidgets(source);
    const json = JSON.stringify(widgets, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `widgets-${source}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async importWidgets(source) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = async e => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const file = files[0];

      const reader = new FileReader();
      reader.onload = async event => {
        try {
          let newWidgets = JSON.parse(event.target.result);
          if (!Array.isArray(newWidgets)) {
            newWidgets = [newWidgets];
          }

          const existingWidgets = await this.getWidgets(source);
          const existingIds = new Set(existingWidgets.map(w => w.id));
          const importedWidgets = [];

          for (const widget of newWidgets) {
            if (typeof widget !== 'object' || widget === null || !Array.isArray(widget.widgets)) {
              console.warn('Skipping invalid widget:', widget);
              continue;
            }

            let newWidget = JSON.parse(JSON.stringify(widget));

            if (!newWidget.id || existingIds.has(newWidget.id)) {
              const newId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
              newWidget.id = newId;
            }

            await this.createWidget(newWidget, source);
            existingIds.add(newWidget.id);
            importedWidgets.push(newWidget);
          }

          await this.renderWidgetBuffer();

          for (const importedWidget of importedWidgets) {
            const newWidgetElement = this.currentContents.querySelector(`li[data-id="${importedWidget.id}"]`);
            if (newWidgetElement) {
              newWidgetElement.classList.add('flash');
              setTimeout(() => newWidgetElement.classList.remove('flash'), 1000);
            }
          }
        } catch (error) {
          alert(`Error importing widgets: ${error.message}`);
        }
      };
      reader.readAsText(file);
    };
    fileInput.click();
  }
}