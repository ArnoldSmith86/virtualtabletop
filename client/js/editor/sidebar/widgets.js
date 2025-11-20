function deepReplace(obj, idMap) {
  if (typeof obj !== 'object' || obj === null) {
    return;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i];
      if (typeof item === 'string' && idMap[item]) {
        obj[i] = idMap[item];
      } else {
        deepReplace(item, idMap);
      }
    }
    return;
  }

  // It's an object.
  // First, recurse on all values.
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (key !== 'type' && typeof value === 'string' && idMap[value]) {
        obj[key] = idMap[value];
      } else {
        deepReplace(value, idMap);
      }
    }
  }

  // Then, rename keys. This is safer after values are processed.
  const protectedKeys = [
    'id', 'type', 'parent', 'deck', 'hand',
    'x', 'y', 'z', 'width', 'height', 'rotation', 'scale',
    'color', 'text', 'html', 'css', 'class',
    'faces', 'activeFace', 'faceCycle',
    'locked', 'hidden', 'snap', 'fixed',
    'name', 'widgets', 'groups', 'preview', 'inheritFrom',
    'cardType', 'min', 'max', 'value', 'step',
    'collection', 'source', 'dropTarget', 'dropLimit',
    'linkedToSeat', 'onlyVisibleForSeat'
  ];
  const keysToRename = Object.keys(obj).filter(key => idMap[key] && !protectedKeys.includes(key));
  for (const oldKey of keysToRename) {
    const newKey = idMap[oldKey];
    if (oldKey !== newKey) {
      obj[newKey] = obj[oldKey];
      delete obj[oldKey];
    }
  }
}

class WidgetsModule extends SidebarModule {
  constructor() {
    super('widgets', 'Widgets', 'Manage widgets.');
    this.viewMode = localStorage.getItem('vtt-widget-view-mode') || 'list';
    this.listViewButton = null;
    this.gridViewButton = null;
  }

  // Render preview markup from a URL or a Material Symbol reference like "symbol:heading"
  renderPreviewHTML(preview) {
    if (!preview) return '';
    if (typeof preview === 'string' && preview.startsWith('symbol:')) {
      const rawName = preview.slice('symbol:'.length);
      const alias = { heading: 'title' };
      const symbolName = alias[rawName] || rawName;
      const safe = html(symbolName || 'help');
      return `<i class="material-symbols" style="font-size: 64px; line-height: 1; color: #333;">${safe}</i>`;
    }
    return `<img src="${preview}" style="max-width: 100%; max-height: 100%; object-fit: contain;" draggable="false">`;
  }

  onSelectionChangedWhileActive(newSelection) {
    if (this.moduleDOM) {
      $('#saveWidgetsToBuffer', this.moduleDOM).disabled = newSelection.length !== 1;
    }
  }

  renderModule(target) {
    target.innerHTML = '';
    super.renderModule(target);
    this.addHeader('Widgets');

    const d = div(target, '', `
      <div class ="legend-text" style="margin-bottom: 10px;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" class="hasRoutine" fill="currentColor"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Zm-24 60v137q0 16 15 19.5t23-10.5l121-237q5-10-1-19.5t-17-9.5h-87v-139q0-16-15-20t-23 10L346-449q-5 11 .5 20t16.5 9h93Z"/></svg>: Has a routine that runs when added to a room.<br>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" class="isUnique" fill="currentColor"><path d="M760-360q12-12 28.5-12t28.5 12l63 64q12 12 12 28t-12 28q-12 12-28 12t-28-12l-64-63q-12-12-12-28.5t12-28.5Zm40-480q12 12 12 28.5T800-783l-63 63q-12 12-28.5 12T680-720q-12-12-12-28.5t12-28.5l64-63q12-12 28-12t28 12Zm-640 0q12-12 28.5-12t28.5 12l63 64q12 12 12 28t-12 28q-12 12-28.5 12T223-720l-63-63q-12-12-12-28.5t12-28.5Zm40 480q12 12 12 28.5T200-303l-63 63q-12 12-28.5 12T80-240q-12-12-12-28.5T80-297l64-63q12-12 28-12t28 12Zm154 73 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143Zm126-194Zm0 212L314-169q-11 7-23 6t-21-8q-9-7-14-17.5t-2-23.5l44-189-147-127q-10-9-12.5-20.5T140-571q4-11 12-18t22-9l194-17 75-178q5-12 15.5-18t21.5-6q11 0 21.5 6t15.5 18l75 178 194 17q14 2 22 9t12 18q4 11 1.5 22.5T809-528L662-401l44 189q3 13-2 23.5T690-171q-9 7-21 8t-23-6L480-269Z"/></svg>: Is a unique widget. Recommended one per room.
      </div>
      <div class="buttonBar" style="display: flex; align-items: center; margin-bottom: 10px;">
        <span class="widgetFilerIcon">search</span>
        <input type="text" id="widgetFilter" placeholder="Filter..." style="flex-grow: 1;flex-shrink: 1;margin-right: 5px;">
        <div class="actions">
          <div class="segmented-control">
            <button id="listViewButton" class="sidebarButton active" icon="list"><span>View as List</span></button>
            <button id="gridViewButton" class="sidebarButton" icon="grid_view"><span>View as Grid</span></button>
          </div>
          <button icon="bookmark_add" id="saveWidgetsToBuffer" class="sidebarButton"><span>Save selected widget</span></button>
          <button icon="edit" id="editWidgetsButton" class="sidebarButton"><span>Edit widgets</span></button>
        </div>
      </div>
    `);

    $('#widgetFilter', d).onkeyup = e => this.renderWidgetBuffer(e.target.value);
    this.listViewButton = $('#listViewButton', d);
    this.gridViewButton = $('#gridViewButton', d);
    this.listViewButton.onclick = () => {
      if (this.viewMode === 'list') return;
      this.viewMode = 'list';
      localStorage.setItem('vtt-widget-view-mode', 'list');
      this.renderWidgetBuffer($('#widgetFilter', d).value);
    };
    this.gridViewButton.onclick = () => {
      if (this.viewMode === 'grid') return;
      this.viewMode = 'grid';
      localStorage.setItem('vtt-widget-view-mode', 'grid');
      this.renderWidgetBuffer($('#widgetFilter', d).value);
    };
    $('#editWidgetsButton', d).onclick = e => {
      this.currentContents.classList.toggle('editing');
      e.currentTarget.classList.toggle('active');
      if (this.currentContents.classList.contains('editing')) {
        this.currentContents.classList.add('editing-widgets');
        this.viewMode = 'list';
      } else {
        this.currentContents.classList.remove('editing-widgets');
      }
      this.renderWidgetBuffer($('#widgetFilter', d).value);
    };
    $('#saveWidgetsToBuffer', d).onclick = e => this.button_saveWidgetsToBuffer();
    $('#saveWidgetsToBuffer', d).disabled = selectedWidgets.length !== 1;

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
        body: JSON.stringify(newWidget)
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

    const updatedGroups = groups.map(g => {
      g.widgets = g.widgets.filter(id => id !== widgetId);
      return g;
    }).filter(g => g.widgets.length > 0);

    await this.updateAllWidgets({ widgets: updatedWidgets, groups: updatedGroups }, source);
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

    //Sort local storage widgets
    const getWidgetTypesString = (state) => {
      return [...new Set(state.widgets.map(w => w.type || 'basic'))].join(', ');
    };

    const parseLocalTimestamp = (id) => {
      if (typeof id !== 'string') return 0;
      if (id.startsWith('local-')) {
        const parts = id.split('-');
        if (parts.length >= 3) {
          const ts = parseInt(parts, 10);
          return isNaN(ts) ? 0 : ts;
        }
      }
      return 0;
    };

    const localSort = this.localSort || { by: 'time', dir: 'desc' };
    const compare = (a, b) => {
      const getValue = (widget, key) => {
        switch (key) {
          case 'id':
            return widget.name || widget.id || '';
          case 'type':
            return getWidgetTypesString(widget);
          case 'time':
          default:
            return parseLocalTimestamp(widget.id);
        }
      };

      const va = getValue(a, localSort.by);
      const vb = getValue(b, localSort.by);

      let cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).toLowerCase().localeCompare(String(vb).toLowerCase());

      // Secondary sort by name if types match
      if (localSort.by === 'type' && cmp === 0) {
        cmp = (a.name || a.id || '').toLowerCase().localeCompare((b.name || b.id || '').toLowerCase());
      }

      // Tertiary sort by ID if all else matches
      if (cmp === 0) {
        cmp = String(a.id || '').localeCompare(String(b.id || ''));
      }

      return localSort.dir === 'desc' ? -cmp : cmp;
    };

    const maybeSort = (arr) => {
      if (source !== 'local') return arr;
      return [...arr].sort(compare);
    };

    const renderWidget = this.viewMode === 'grid'
      ? (state, source, isEditing) => this.renderGridWidget(state, source, isEditing)
      : (state, source, isEditing) => this.renderListWidget(state, source, isEditing);

    let list = '';
    const groupedWidgetIds = new Set(groups.flatMap(g => g.widgets));

    // Determine group ordering for local view
    const groupsToRender = [...groups];

    if (source === 'local') {
      const sortBy = this.localSort ? this.localSort.by : undefined;
      if (sortBy === 'type') {
      } else {
      const getOldestTimestamp = (group) =>
        (group.widgets && group.widgets.length)
          ? Math.min(...group.widgets.map((id) => {
            const widget = widgets.find((w) => w.id === id);
            return parseLocalTimestamp(widget ? (widget.id || '') : '');
          }))
          : Number.POSITIVE_INFINITY;

      groupsToRender.sort((ga, gb) => {
        const oldestA = getOldestTimestamp(ga);
        const oldestB = getOldestTimestamp(gb);
        const nameA = (ga.name || '').toLowerCase();
        const nameB = (gb.name || '').toLowerCase();

        const primarySort = (sortBy === 'time') ? oldestA - oldestB : nameA.localeCompare(nameB);
        const secondarySort = (sortBy === 'time') ? nameA.localeCompare(nameB) : oldestA - oldestB;

        const cmp = primarySort || secondarySort;
        return (this.localSort && this.localSort.dir === 'desc') ? -cmp : cmp;
      });
      }
    }

    for (const group of groupsToRender) {
      const groupWidgets = group.widgets.map(id => widgets.find(w => w.id === id)).filter(Boolean);
      const filteredGroupWidgets = maybeSort(filterWidgets(groupWidgets));

      if (filter && filteredGroupWidgets.length === 0) continue;

      let isCollapsed;
      if (source === 'server') {
        const storedState = localStorage.getItem(`vtt-widget-group-collapsed-server-${group.name}`);
        isCollapsed = storedState !== null ? storedState === 'true' : (filter ? false : group.collapsed);
      } else {
        isCollapsed = filter ? false : group.collapsed;
      }
      if (this.viewMode === 'grid') {
        list += `
          <div class="widget-group" data-group-name="${html(group.name)}" data-source="${source}">
              <div class="widget-group-header">
                  <span class="collapse-arrow material-symbols">${isCollapsed ? 'expand_less' : 'expand_more'}</span>
                  <input class="group-name-input" value="${html(group.name)}" readonly>
              </div>
              <div class="widget-grid" ${isCollapsed ? 'style="display: none;"' : ''}>
                  ${filteredGroupWidgets.map(state => renderWidget(state, source, isEditing)).join('')}
              </div>
          </div>
        `;
      } else {
        list += `
            <div class="widget-group" data-group-name="${html(group.name)}" data-source="${source}">
                <div class="widget-group-header" draggable="${isEditing}">
                    <span class="drag-handle"></span>
                    <span class="collapse-arrow material-symbols">${isCollapsed ? 'expand_less' : 'expand_more'}</span>
                    <input class="group-name-input" value="${html(group.name)}" readonly>
                </div>
                <ul class="widget-group-body" ${isCollapsed ? 'style="display: none;"' : ''}>
                    ${filteredGroupWidgets.map(state => renderWidget(state, source, isEditing)).join('')}
                </ul>
            </div>
        `;
      }
    }

    const ungroupedWidgets = widgets.filter(w => !groupedWidgetIds.has(w.id));
    const filteredUngroupedWidgets = maybeSort(filterWidgets(ungroupedWidgets));

    if (filteredUngroupedWidgets.length > 0) {
      if (this.viewMode === 'grid') {
        list += `<div class="widget-grid">${filteredUngroupedWidgets.map(state => renderWidget(state, source, isEditing)).join('')}</div>`;
      } else {
        list += `<ul>${filteredUngroupedWidgets.map(state => renderWidget(state, source, isEditing)).join('')}</ul>`;
      }
    }

    if (source === 'local' || config.allowPublicLibraryEdits) {
      list += `<div class="new-group-drop-target" data-source="${source}"> New Group</div>`;
    }

    return list;
  }

  async renderWidgetBuffer(filter = '') {
    const { widgets: serverWidgets, groups: serverGroups } = await this.getWidgets('server');
    const { widgets: localWidgets, groups: localGroups } = await this.getWidgets('local');

    const isEditing = this.currentContents.classList.contains('editing');
    
    // Preserve viewport position and internal scroll during rerender
    const preserveScrollPosition = (containerEl) => ({
      prevRectTop: containerEl.getBoundingClientRect().top,
      prevScrollTop: containerEl.scrollTop,
      scrollElem: document.scrollingElement || document.documentElement || document.body,
    });

    const scrollState = preserveScrollPosition(this.currentContents);
    const sortState = this.localSort || { by: 'time', dir: 'desc' };
    const createSortButton = (by, label, sortState) => {
      const active = sortState.by === by;
      const isDesc = active && sortState.dir === 'desc';
      return `
        <button class="sidebarButton sort-widgets ${active ? 'selected' : ''}" data-by="${by}" aria-label="Sort by ${label}"
            style="background:;color:#fff;">
          <div class="sort-label" style="font-size:10px;">${label}</div>
          <i class="material-symbols sort-glyph" style="font-size:18px;transform:${isDesc ? 'scaleY(-1)' : 'none'};">sort</i>
        </button>`;
    };

    let serverListHTML = '';
    if (serverWidgets.length > 0) {
      const isServerListCollapsed = localStorage.getItem('vtt-widget-list-collapsed-server') === 'true';
      serverListHTML = `
        <div class="widget-list-container ${isServerListCollapsed ? 'collapsed' : ''}" data-list-key="server">
          <div class="widget-list-header">
          <span class="collapse-arrow material-symbols">${isServerListCollapsed ? 'expand_less' : 'expand_more'}</span>
            <span class="widget-list-header-text">On The Server</span>
            <div class="widget-list-actions">
              ${config.allowPublicLibraryEdits ? `<button icon="upload" class="sidebarButton import-widgets" data-source="server"><span>Import Server-Wide</span></button>` : ''}
              <button icon="download" class="sidebarButton export-widgets" data-source="server"><span>Download Custom Widgets</span></button>
            </div>
          </div>
          <div class="widget-list server-list">${this.renderList(serverWidgets, serverGroups, 'server', filter, isEditing)}</div>
        </div>
      `;
    }

    const isLocalListCollapsed = localStorage.getItem('vtt-widget-list-collapsed-local') === 'true';
    this.currentContents.innerHTML = `
      ${serverListHTML}
      <div class="widget-list-container ${isLocalListCollapsed ? 'collapsed' : ''}" data-list-key="local">
        <div class="widget-list-header">
          <span class="collapse-arrow material-symbols">${isLocalListCollapsed ? 'expand_less' : 'expand_more'}</span>
          <span class="widget-list-header-text">In Local Storage</span>
          <div class="widget-list-actions">
            <div class="segmented-control sort-control">
              ${createSortButton('time', 'time', sortState)}
              ${createSortButton('id', 'name', sortState)}
              ${createSortButton('type', 'type', sortState)}
            </div>
            <button icon="upload" class="sidebarButton import-widgets" data-source="local"><span>Import to Local Storage</span></button>
            <button icon="download" class="sidebarButton export-widgets" data-source="local"><span>Download Custom Widgets</span></button>
          </div>
        </div>
        <div class="widget-list local-list">
          ${(localWidgets.length === 0 && localGroups.length == 0) ? '<div class="explainer-text">Select a widget in the room and press <span class="material-symbols" style="font-style: normal;vertical-align: middle;">bookmark_add</span> (Save selected widgets) to create a reusable widget.</div>' : this.renderList(localWidgets, localGroups, 'local', filter, isEditing)}
        </div>
      </div>
    `;

    // Restore scroll positions
    try {
      this.currentContents.scrollTop = scrollState.prevScrollTop;
      const newTop = this.currentContents.getBoundingClientRect().top;
      const delta = newTop - scrollState.prevRectTop;
      if (delta !== 0 && scrollState.scrollElem) {
        scrollState.scrollElem.scrollTop += delta;
      }
    } catch (_) {}

    if (this.viewMode === 'grid') {
      this.gridViewButton.classList.add('active');
      this.listViewButton.classList.remove('active');
      this.currentContents.classList.add('grid-view');
    } else {
      this.listViewButton.classList.add('active');
      this.gridViewButton.classList.remove('active');
      this.currentContents.classList.remove('grid-view');
    }

    for (const header of this.currentContents.querySelectorAll('.widget-list-header')) {
      header.onclick = e => {
        const container = header.parentElement;
        const listKey = container.dataset.listKey;
        if (!listKey) return;
        const isCollapsed = container.classList.toggle('collapsed');
        localStorage.setItem(`vtt-widget-list-collapsed-${listKey}`, isCollapsed);
        const arrow = header.querySelector('.collapse-arrow');
        arrow.textContent = isCollapsed ? 'expand_less' : 'expand_more';
      };
    }

    for (const button of this.currentContents.querySelectorAll('.export-widgets')) {
      button.onclick = e => this.exportWidgets(e.currentTarget.dataset.source);
    }
    for (const button of this.currentContents.querySelectorAll('.sort-widgets')) {
      button.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        const by = e.currentTarget.dataset.by;
        if (!this.localSort) this.localSort = { by: 'time', dir: 'desc' };
        if (this.localSort.by === by) {
          this.localSort.dir = this.localSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          this.localSort = { by, dir: 'asc' };
        }
        this.renderWidgetBuffer(filter);
      };
    }
    for (const button of this.currentContents.querySelectorAll('.import-widgets')) {
      button.onclick = e => this.importWidgets(e.currentTarget.dataset.source);
    }

    for (const item of this.currentContents.querySelectorAll('li')) {
      const widgetId = item.dataset.id;
      const source = item.dataset.source;
      const allWidgets = source === 'server' ? serverWidgets : localWidgets;
      const state = allWidgets.find(w => w.id === widgetId);
      if (!state) continue;
      if (source === 'server' && !config.allowPublicLibraryEdits) {
        item.classList.add('readonly');
      }

      const input = item.querySelector('input');
      input.readOnly = (source === 'server' && !config.allowPublicLibraryEdits) || !isEditing;
      if (!isEditing) {
        input.disabled = true;
      }
      item.draggable = true;

      item.addEventListener('dragstart', e => {
        if (isEditing && (source === 'local' || config.allowPublicLibraryEdits)) {
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

          const widgetMap = new Map(widgetBuffer.map(s => [s.id, s]));
          const absolutePositions = new Map();

          function calculateAbsolutePosition(widgetId) {
            if (absolutePositions.has(widgetId)) {
              return absolutePositions.get(widgetId);
            }

            const widget = widgetMap.get(widgetId);
            if (!widget) {
              return { x: 0, y: 0 };
            }

            if (!widget.parent || !widgetMap.has(widget.parent)) {
              const pos = { x: widget.x || 0, y: widget.y || 0 };
              absolutePositions.set(widgetId, pos);
              return pos;
            }

            const parentPos = calculateAbsolutePosition(widget.parent);
            const pos = {
              x: parentPos.x + (widget.x || 0),
              y: parentPos.y + (widget.y || 0)
            };
            absolutePositions.set(widgetId, pos);
            return pos;
          }

          for (const widget of widgetBuffer) {
            calculateAbsolutePosition(widget.id);
          }

          let minX = widgetBuffer.length > 0 ? Infinity : 0;
          let minY = widgetBuffer.length > 0 ? Infinity : 0;

          if (widgetBuffer.length > 0) {
            for (const pos of absolutePositions.values()) {
              minX = Math.min(minX, pos.x);
              minY = Math.min(minY, pos.y);
            }
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
              previewWidget.domElement.style.transformOrigin = 'top left';
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
              if(!tempState.parent)
                tempState.scale = (tempState.scale || 1) * getScale() * getZoomLevel();

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
      item.querySelector('[icon=add]').onclick = e => placeWidget(state.id, source);
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
      item.querySelector('.widget-label').style.display = isEditing ? 'flex' : 'none';
      const previewInput = item.querySelector('.preview-url-input');
      previewInput.onchange = e => {
        if (source === 'server' && !config.allowPublicLibraryEdits) return;
        state.preview = e.target.value;
        this.updateWidget(state, source);
        const previewContainer = item.querySelector('.widget-preview');
        if (previewContainer) {
          previewContainer.innerHTML = this.renderPreviewHTML(state.preview);
        }
      };
    }

    for (const item of this.currentContents.querySelectorAll('.widget-grid-item')) {
      const widgetId = item.dataset.id;
      const source = item.dataset.source;
      const allWidgets = source === 'server' ? serverWidgets : localWidgets;
      const state = allWidgets.find(w => w.id === widgetId);
      if (!state) continue;

      item.draggable = true;

      item.addEventListener('dragstart', e => {
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

        const widgetMap = new Map(widgetBuffer.map(s => [s.id, s]));
        const absolutePositions = new Map();

        function calculateAbsolutePosition(widgetId) {
          if (absolutePositions.has(widgetId)) {
            return absolutePositions.get(widgetId);
          }

          const widget = widgetMap.get(widgetId);
          if (!widget) {
            return { x: 0, y: 0 };
          }

          if (!widget.parent || !widgetMap.has(widget.parent)) {
            const pos = { x: widget.x || 0, y: widget.y || 0 };
            absolutePositions.set(widgetId, pos);
            return pos;
          }

          const parentPos = calculateAbsolutePosition(widget.parent);
          const pos = {
            x: parentPos.x + (widget.x || 0),
            y: parentPos.y + (widget.y || 0)
          };
          absolutePositions.set(widgetId, pos);
          return pos;
        }

        for (const widget of widgetBuffer) {
          calculateAbsolutePosition(widget.id);
        }

        let minX = widgetBuffer.length > 0 ? Infinity : 0;
        let minY = widgetBuffer.length > 0 ? Infinity : 0;

        if (widgetBuffer.length > 0) {
          for (const pos of absolutePositions.values()) {
            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
          }
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
            previewWidget.domElement.style.transformOrigin = 'top left';
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
            if(!tempState.parent)
              tempState.scale = (tempState.scale || 1) * getScale() * getZoomLevel();

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
      });

      item.addEventListener('dragend', e => {
        item.classList.remove('dragging');
      });

      item.querySelector('.add-to-room-grid').onclick = e => placeWidget(state.id, source);
    }

    for (const list of this.currentContents.querySelectorAll('.widget-list, .widget-grid')) {
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
        if (e.target.classList.contains('group-name-input') && !e.target.readOnly) return;
        const groupNameHTML = groupHeader.parentElement.dataset.groupName;
        const source = groupHeader.parentElement.dataset.source;

        const { widgets, groups } = await this.getWidgets(source);
        const group = groups.find(g => html(g.name) === groupNameHTML);
        if (!group) return;
        const groupName = group.name;

        if (source === 'server') {
          const key = `vtt-widget-group-collapsed-server-${groupName}`;
          const currentState = localStorage.getItem(key);
          const defaultState = group.collapsed;
          const isCollapsed = currentState !== null ? currentState === 'true' : defaultState;
          localStorage.setItem(key, !isCollapsed);
          this.renderWidgetBuffer(filter);
          return;
        }

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
            if (sourceGroup.widgets.length === 0) {
              groups.splice(groups.indexOf(sourceGroup), 1);
            }
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

  renderListWidget(state, source, isEditing) {
    const getWidgetTypesString = (state) => {
      return [...new Set(state.widgets.map(w => w.type || 'basic'))].join(', ');
    };
    const widgetTypes = getWidgetTypesString(state);
    const hasAddToRoomRoutine = state.widgets.some(w => w.addToRoomRoutine);
    return `
          <li data-id="${state.id}" data-source="${source}" draggable="${isEditing}" style="display: flex; align-items: center; margin-bottom: 5px;">
              <span class="drag-handle"></span>
              <div class="widget-preview">
                ${this.renderPreviewHTML(state.preview)}
              </div>
              <div class="widget-info" style="flex-grow: 1;">
                  <label class="name-widget-label widget-label" style="display: none;">Name</label>
                  <input value="${html(state.name || state.id)}" readonly>
                  <div class="widget-type">${widgetTypes}${hasAddToRoomRoutine ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" class="hasRoutine" fill="currentColor"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Zm-24 60v137q0 16 15 19.5t23-10.5l121-237q5-10-1-19.5t-17-9.5h-87v-139q0-16-15-20t-23 10L346-449q-5 11 .5 20t16.5 9h93Z"/></svg>' : ''}${state.unique ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" class="isUnique" fill="currentColor"><path d="M760-360q12-12 28.5-12t28.5 12l63 64q12 12 12 28t-12 28q-12 12-28 12t-28-12l-64-63q-12-12-12-28.5t12-28.5Zm40-480q12 12 12 28.5T800-783l-63 63q-12 12-28.5 12T680-720q-12-12-12-28.5t12-28.5l64-63q12-12 28-12t28 12Zm-640 0q12-12 28.5-12t28.5 12l63 64q12 12 12 28t-12 28q-12 12-28.5 12T223-720l-63-63q-12-12-12-28.5t12-28.5Zm40 480q12 12 12 28.5T200-303l-63 63q-12 12-28.5 12T80-240q-12-12-12-28.5T80-297l64-63q12-12 28-12t28 12Zm154 73 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143Zm126-194Zm0 212L314-169q-11 7-23 6t-21-8q-9-7-14-17.5t-2-23.5l44-189-147-127q-10-9-12.5-20.5T140-571q4-11 12-18t22-9l194-17 75-178q5-12 15.5-18t21.5-6q11 0 21.5 6t15.5 18l75 178 194 17q14 2 22 9t12 18q4 11 1.5 22.5T809-528L662-401l44 189q3 13-2 23.5T690-171q-9 7-21 8t-23-6L480-269Z"/></svg>' : ''}</div>
                  <label class="preview-widget-label widget-label">Preview</label>
                  <input class="preview-url-input" type="text" value="${html(state.preview || '')}" placeholder="https://... or symbol:NAME">
                  <label class="unique-widget-label widget-label"><input type="checkbox" ${state.unique ? 'checked' : ''}> Unique</label>
              </div>
              <div class="actions">
                  <button icon="add" class="sidebarButton"><span>Add widget to room</span></button>
                  <button icon="download" class="sidebarButton download-json"><span>Download</span></button>
                  <button icon="delete" class="sidebarButton"><span>Delete widget</span></button>
              </div>
          </li>`;
  }

  renderGridWidget(state, source, isEditing) {
    return `
      <div class="widget-grid-item" data-id="${state.id}" data-source="${source}" draggable="true">
        <div class="widget-preview">
          ${this.renderPreviewHTML(state.preview)}
          <button icon="add" class="sidebarButton add-to-room-grid"><span>Add widget to room</span></button>
        </div>
        <div class="widget-name">${html(state.name || state.id)}</div>
      </div>
    `;
  }

  button_saveWidgetsToBuffer() {
    const selectedWidgetAndChildrenIds = new Set();
    function getAllDescendants(widget) {
      selectedWidgetAndChildrenIds.add(widget.id);
      for (const w of widgetFilter(w => w.get('parent') == widget.id)) {
        getAllDescendants(w);
      }
    }

    for (const widget of selectedWidgets) {
      getAllDescendants(widget);
    }

    function addRecursively(widget, buffer) {
      const state = JSON.parse(JSON.stringify(widget.state));
      if (state.parent && !selectedWidgetAndChildrenIds.has(state.parent)) {
        delete state.parent;
      }
      buffer.push(state);
      for (const w of widgetFilter(w => w.get('parent') == widget.id))
        addRecursively(w, buffer);
    }
    const widgetBuffer = [];
    for (const widget of selectedWidgets)
      addRecursively(widget, widgetBuffer);

    const defaultTarget = config.allowPublicLibraryEdits ? 'server' : 'local';
    const name = selectedWidgets.length > 0 ? selectedWidgets.id : undefined;
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

    const newIds = new Set();
    for (const widget of widgetBuffer) {
      let newId = widget.id;
      // If the widget ID already exists, find a new one.
      if (widgets.has(newId) || newIds.has(newId)) {
        // Find the base name by removing any trailing number and optional underscore
        const baseName = widget.id.replace(/_?\d+$/, '');
        let i = 0;

        // Find the highest existing number for this baseName among ALL widgets (in room and being added)
        for (const existingId of [...widgets.keys(), ...newIds]) {
            if (existingId.startsWith(baseName)) {
                const numStr = existingId.substring(baseName.length);
                if (/^\d+$/.test(numStr)) {
                    i = Math.max(i, parseInt(numStr, 10));
                }
            }
        }
        
        do {
          i++;
          newId = `${baseName}${i}`;
        } while (widgets.has(newId) || newIds.has(newId));
      }
      idMap[widget.id] = newId;
      newIds.add(newId);
    }
    for (const widget of widgetBuffer) {
      // Update the widget's own ID first.
      widget.id = idMap[widget.id];
      // Then, update all references within the widget.
      deepReplace(widget, idMap);
    }
    batchStart();
    setDeltaCause(`${getPlayerDetails().playerName} loaded widgets from the widget buffer in editor`);

    const newRootWidgetIds = [];
    const rootWidgets = widgetBuffer.filter(state => !state.parent || !widgetBuffer.some(w => w.id === state.parent));
    let offsetX = 0;
    let offsetY = 0;

    if (coords && rootWidgets.length > 0) {
        const widgetMap = new Map(widgetBuffer.map(s => [s.id, s]));
        const absolutePositions = new Map();

        function calculateAbsolutePosition(widgetId) {
          if (absolutePositions.has(widgetId)) {
            return absolutePositions.get(widgetId);
          }

          const widget = widgetMap.get(widgetId);
          if (!widget) {
            return { x: 0, y: 0 };
          }

          if (!widget.parent || !widgetMap.has(widget.parent)) {
            const pos = { x: widget.x || 0, y: widget.y || 0 };
            absolutePositions.set(widgetId, pos);
            return pos;
          }

          const parentPos = calculateAbsolutePosition(widget.parent);
          const pos = {
            x: parentPos.x + (widget.x || 0),
            y: parentPos.y + (widget.y || 0)
          };
          absolutePositions.set(widgetId, pos);
          return pos;
        }

        for (const widget of widgetBuffer) {
          calculateAbsolutePosition(widget.id);
        }

        let minX = Infinity;
        let minY = Infinity;

        for (const pos of absolutePositions.values()) {
          minX = Math.min(minX, pos.x);
          minY = Math.min(minY, pos.y);
        }
        offsetX = coords.x - minX;
        offsetY = coords.y - minY;
    }

    const widgetStates = new Map(widgetBuffer.map(w => [w.id, w]));
    const sortedWidgets = [];
    const visited = new Set();

    function topologicalSort(widgetId) {
        if (visited.has(widgetId)) {
            return;
        }
        const state = widgetStates.get(widgetId);
        if (!state) return;

        // Recurse for parent dependency
        if (state.parent && widgetStates.has(state.parent)) {
            topologicalSort(state.parent);
        }

        // Recurse for deck dependency
        if (state.deck && widgetStates.has(state.deck)) {
            topologicalSort(state.deck);
        }

        // Recurse for inheritFrom dependencies
        if (state.inheritFrom) {
            for (const idToInheritFrom of Object.keys(state.inheritFrom)) {
                if (widgetStates.has(idToInheritFrom)) {
                    topologicalSort(idToInheritFrom);
                }
            }
        }

        if (!visited.has(widgetId)) {
            sortedWidgets.push(state);
            visited.add(widgetId);
        }
    }

    for (const state of widgetBuffer) {
        topologicalSort(state.id);
    }

    for (const state of sortedWidgets) {
        const isRoot = rootWidgets.some(w => w.id === state.id);

        if (isRoot) {
            if (coords) {
                state.x = Math.round(((state.x || 0) + offsetX) * 2) / 2;
                state.y = Math.round(((state.y || 0) + offsetY) * 2) / 2;
            }
            delete state.parent;
        }

        if (state.type === 'card' && state.deck && !widgetBuffer.some(w => w.id === state.deck) && !widgets.has(state.deck)) {
            console.error(`Widget ${state.id} references a deck ${state.deck} that is not in the buffer and is not already in the room. It will not be loaded.`);
            continue;
        }

        const newId = await addWidgetLocal(state);
        if (isRoot) {
            newRootWidgetIds.push(newId);
        }
    }

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
    const data = await this.getWidgets(source);
    const json = JSON.stringify(data, null, 2);
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
          const newData = JSON.parse(event.target.result);
          const { widgets: newWidgets, groups: newGroups } = newData;

          if (!Array.isArray(newWidgets)) {
            throw new Error('Invalid file format: "widgets" property must be an array.');
          }

          const { widgets: existingWidgets, groups: existingGroups } = await this.getWidgets(source);
          const existingIds = new Set(existingWidgets.map(w => w.id));

          for (const widget of newWidgets) {
            if (typeof widget !== 'object' || widget === null || !Array.isArray(widget.widgets)) {
              console.warn('Skipping invalid widget:', widget);
              continue;
            }

            const newWidget = JSON.parse(JSON.stringify(widget));

            if (newWidget.id && existingIds.has(newWidget.id)) {
              const index = existingWidgets.findIndex(w => w.id === newWidget.id);
              if (index !== -1) {
                existingWidgets[index] = newWidget;
              }
            } else {
              if (!newWidget.id) {
                newWidget.id = `local-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
              }
              existingWidgets.push(newWidget);
              existingIds.add(newWidget.id);
            }
          }

          if (Array.isArray(newGroups)) {
            const newWidgetIds = new Set(newWidgets.map(w => w.id));

            for (const existingGroup of existingGroups) {
              existingGroup.widgets = existingGroup.widgets.filter(id => !newWidgetIds.has(id));
            }

            for (const newGroup of newGroups) {
              const existingGroup = existingGroups.find(g => g.name === newGroup.name);
              if (existingGroup) {
                const uniqueNewWidgets = newGroup.widgets.filter(id => !existingGroup.widgets.includes(id));
                existingGroup.widgets.push(...uniqueNewWidgets);
              } else {
                existingGroups.push(JSON.parse(JSON.stringify(newGroup)));
              }
            }
          }

          await this.updateAllWidgets({ widgets: existingWidgets, groups: existingGroups }, source);
          await this.renderWidgetBuffer();

        } catch (error) {
          alert(`Error importing widgets: ${error.message}`);
        }
      };
      reader.readAsText(file);
    };
    fileInput.click();
  }
}
