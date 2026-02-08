/**
 * Files panel: monitor a directory or drop a folder, map files to actions (replace asset, CSV→deck, JSON→widgets, etc.).
 * Mappings and lastAssetUrl are stored in gameSettings.fileMappings.
 */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

function getExtension(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function buildFileTree(files) {
  const root = { name: '', children: {}, files: [] };
  for (const f of files) {
    const parts = f.relativePath.split(/[/\\]/).filter(Boolean);
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!dir.children[p]) dir.children[p] = { name: p, children: {}, files: [] };
      dir = dir.children[p];
    }
    if (parts.length) {
      dir.files.push({ ...f, name: parts[parts.length - 1] });
    } else {
      root.files.push({ ...f, name: f.relativePath });
    }
  }
  return root;
}

function buildFileTableRows(files) {
  const byDir = new Map();
  byDir.set('', []);
  for (const f of files) {
    const parts = f.relativePath.split(/[/\\]/).filter(Boolean);
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(f);
  }
  for (const arr of byDir.values()) arr.sort((a, b) => (a.name || a.relativePath).localeCompare(b.name || b.relativePath));
  const dirs = [...byDir.keys()].sort();
  const rows = [];
  for (const d of dirs) {
    const filesInDir = byDir.get(d);
    if (d) rows.push({ type: 'dir', path: d });
    for (const f of filesInDir) rows.push({ type: 'file', file: f, rel: f.relativePath });
  }
  return rows;
}

function getActionSummary(mapping, rel) {
  if (!mapping || !mapping.handlerId) return { text: '', assetUrl: null };
  const handler = window.getFileHandler && window.getFileHandler(mapping.handlerId);
  const label = handler ? handler.label : mapping.handlerId;
  if (mapping.handlerId === 'imageReplaceAsset' && mapping.options && mapping.options.assetUrl)
    return { text: 'Replace asset', assetUrl: mapping.options.assetUrl };
  if (mapping.handlerId === 'csvDeckCards' && mapping.options && mapping.options.deckId)
    return { text: `CSV → deck ${mapping.options.deckId}`, assetUrl: null };
  return { text: label, assetUrl: null };
}

async function readDirectory(handle, basePath = '') {
  const files = [];
  for await (const [name, entry] of handle.entries()) {
    const rel = basePath ? basePath + '/' + name : name;
    if (entry.kind === 'file') {
      files.push({ name, relativePath: rel, handle: entry, isHandle: true });
    } else if (entry.kind === 'directory') {
      files.push(...await readDirectory(entry, rel));
    }
  }
  return files;
}

async function readDirectoryFromEntry(dirEntry, basePath = '') {
  const files = [];
  const reader = dirEntry.createReader();
  const read = () => new Promise((res, rej) => reader.readEntries(res, rej));
  let entries = await read();
  while (entries.length) {
    for (const entry of entries) {
      const name = entry.name;
      const rel = basePath ? basePath + '/' + name : name;
      if (entry.isFile) {
        files.push({ name, relativePath: rel, entry, isHandle: false });
      } else if (entry.isDirectory) {
        files.push(...await readDirectoryFromEntry(entry, rel));
      }
    }
    entries = await read();
  }
  return files;
}

async function getFileContent(fileInfo) {
  if (fileInfo.isHandle) {
    const file = await fileInfo.handle.getFile();
    return file;
  }
  return new Promise((res, rej) => fileInfo.entry.file(res, rej));
}

function getGameSettingsFileMappings() {
  const gs = getCurrentGameSettings();
  if (!gs.fileMappings) gs.fileMappings = {};
  return gs.fileMappings;
}

function saveFileMappings() {
  toServer('setGameSettings', getCurrentGameSettings());
}

const FILES_PANEL_DB = 'vtt-files-panel';
const FILES_PANEL_STORE = 'handles';

function openFilesPanelDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(FILES_PANEL_DB, 1);
    r.onerror = () => rej(r.error);
    r.onsuccess = () => res(r.result);
    r.onupgradeneeded = e => e.target.result.createObjectStore(FILES_PANEL_STORE);
  });
}

function getFilesPanelStorageKey() {
  return 'directory_' + (typeof roomID !== 'undefined' ? roomID : 'default');
}

async function saveDirectoryHandle(handle) {
  const db = await openFilesPanelDB();
  return new Promise((res, rej) => {
    const t = db.transaction(FILES_PANEL_STORE, 'readwrite');
    t.objectStore(FILES_PANEL_STORE).put(handle, getFilesPanelStorageKey());
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

async function getDirectoryHandle() {
  const db = await openFilesPanelDB();
  return new Promise((res, rej) => {
    const t = db.transaction(FILES_PANEL_STORE, 'readonly');
    const r = t.objectStore(FILES_PANEL_STORE).get(getFilesPanelStorageKey());
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function lastAssetUrlKey(relativePath) {
  return 'lastAssetUrl_' + (typeof roomID !== 'undefined' ? roomID : 'default') + '_' + encodeURIComponent(relativePath);
}

async function getLastAssetUrlFromCache(relativePath) {
  try {
    const db = await openFilesPanelDB();
    return new Promise((res, rej) => {
      const t = db.transaction(FILES_PANEL_STORE, 'readonly');
      const r = t.objectStore(FILES_PANEL_STORE).get(lastAssetUrlKey(relativePath));
      r.onsuccess = () => res(r.result);
      r.onerror = rej;
    });
  } catch (_) {
    return undefined;
  }
}

async function saveLastAssetUrlToCache(relativePath, url) {
  try {
    const db = await openFilesPanelDB();
    return new Promise((res, rej) => {
      const t = db.transaction(FILES_PANEL_STORE, 'readwrite');
      t.objectStore(FILES_PANEL_STORE).put(url, lastAssetUrlKey(relativePath));
      t.oncomplete = () => res();
      t.onerror = rej;
    });
  } catch (_) {}
}

class FilesModule extends SidebarModule {
  constructor() {
    super('folder', 'Files', 'Monitor a folder or drop one; map files to assets, decks, or widgets.');
    this.files = [];
    this.rootHandle = null;
    this.pollTimer = null;
    this.lastPollKeys = null;
    this.lastModifiedByPath = {};
    this.fileLog = [];
  }

  onClose() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  renderModule(target) {
    target.innerHTML = '';
    this.addHeader('Files');
    const mappings = getGameSettingsFileMappings();

    const details = document.createElement('details');
    details.className = 'filesPanel-help';
    const summary = document.createElement('summary');
    summary.textContent = 'About & how to use';
    details.append(summary);
    const helpBody = document.createElement('div');
    helpBody.className = 'filesPanel-helpBody';
    const experimental = document.createElement('p');
    experimental.className = 'filesPanel-experimental';
    experimental.textContent = 'This feature is a bit experimental.';
    helpBody.append(experimental);
    const desc = document.createElement('p');
    desc.textContent = 'Monitor a folder (choose directory or drop one). For each file, pick an action in the table\'s Edit form ("On update" dropdown), configure options, and Save. Run applies the action when the file changes or when you click Run. Mappings are saved with the game.';
    helpBody.append(desc);
    const handlersTitle = document.createElement('p');
    handlersTitle.innerHTML = '<strong>Handlers:</strong>';
    helpBody.append(handlersTitle);
    const list = document.createElement('ul');
    list.className = 'filesPanel-handlerList';
    const allHandlers = typeof window.getAllFileHandlers === 'function' ? window.getAllFileHandlers() : [];
    for (const h of allHandlers) {
      const li = document.createElement('li');
      li.textContent = h.label;
      list.append(li);
    }
    helpBody.append(list);
    details.append(helpBody);
    target.append(details);

    const chooseDir = document.createElement('button');
    chooseDir.className = 'sidebarButton';
    chooseDir.setAttribute('icon', 'folder_open');
    chooseDir.innerHTML = 'Choose directory…';
    chooseDir.style.marginBottom = '8px';
    if (typeof showDirectoryPicker !== 'function') {
      chooseDir.disabled = true;
      chooseDir.title = 'Not supported in this browser. Use latest Chrome to monitor a directory.';
    } else {
      chooseDir.onclick = () => this.pickDirectory(target, mappings);
    }
    target.append(chooseDir);

    const dropZone = document.createElement('div');
    dropZone.className = 'filesPanel-dropZone';
    dropZone.innerHTML = 'Drop folder here';
    dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add('drag-over'); };
    dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
    dropZone.ondrop = e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const item = e.dataTransfer.items[0];
      if (item && item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry();
        if (entry && entry.isDirectory) this.loadDroppedFolder(entry, target, mappings);
      }
    };
    target.append(dropZone);

    if (this.files.length) {
      this.addSubHeader('Files');
      const tableWrap = document.createElement('div');
      tableWrap.className = 'filesPanel-tableWrap';
      this.renderFileTable(tableWrap, mappings);
      target.append(tableWrap);
    } else if (typeof showDirectoryPicker === 'function') {
      this.tryRestoreDirectory(target, mappings);
    }

    this.addSubHeader('Log');
    const logEl = document.createElement('div');
    logEl.className = 'filesPanel-log';
    const logList = document.createElement('div');
    logList.className = 'filesPanel-logEntries';
    for (const entry of this.fileLog.slice(-50)) {
      logList.append(this.renderLogEntry(entry));
    }
    logEl.append(logList);
    const clearLog = document.createElement('button');
    clearLog.className = 'sidebarButton';
    clearLog.setAttribute('icon', 'delete');
    clearLog.innerHTML = 'Clear log';
    clearLog.onclick = () => { this.fileLog = []; this.renderModule(this.moduleDOM); };
    logEl.append(clearLog);
    target.append(logEl);
  }

  renderLogEntry(entry) {
    const div = document.createElement('div');
    div.className = 'filesPanel-logEntry' + (entry.error ? ' filesPanel-logError' : '');
    const time = new Date(entry.time).toLocaleTimeString();
    const widgets = (entry.editedWidgetIds || []).length ? entry.editedWidgetIds.join(', ') : '—';
    const err = entry.error ? `<br><span class="filesPanel-logErrorText">${String(entry.error).replace(/</g, '&lt;')}</span>` : '';
    div.innerHTML = `<span class="filesPanel-logTime">${time}</span> <span class="filesPanel-logFile">${entry.filePath}</span> → ${entry.handlerId}<br><span class="filesPanel-logWidgets">Widgets: ${widgets}</span>${err}`;
    return div;
  }

  async tryRestoreDirectory(target, mappings) {
    try {
      const handle = await getDirectoryHandle();
      if (!handle) return;
      const granted = await handle.requestPermission({ mode: 'read' });
      if (granted !== 'granted') return;
      this.rootHandle = handle;
      this.files = await readDirectory(handle);
      this.startPolling(handle, mappings);
      this.renderModule(target);
    } catch (_) {}
  }

  async pickDirectory(target, mappings) {
    try {
      const handle = await showDirectoryPicker();
      this.rootHandle = handle;
      this.files = await readDirectory(handle);
      this.startPolling(handle, mappings);
      await saveDirectoryHandle(handle);
      this.renderModule(target);
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
    }
  }

  async loadDroppedFolder(dirEntry, target, mappings) {
    this.files = await readDirectoryFromEntry(dirEntry);
    this.rootHandle = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    const currentMappings = getGameSettingsFileMappings();
    for (const f of this.files) {
      const m = currentMappings[f.relativePath];
      if (!m || !m.handlerId) continue;
      try {
        await this.runHandlerForFile(f, m);
      } catch (e) {
        console.error('Files panel handler failed:', f.relativePath, e);
      }
    }
    this.renderModule(target);
  }

  startPolling(handle, mappings) {
    if (this.pollTimer) clearInterval(this.pollTimer);
    const poll = async () => {
      const files = await readDirectory(handle);
      const prevPaths = new Set(this.files.map(f => f.relativePath));
      const currPaths = new Set(files.map(f => f.relativePath));
      const listChanged = prevPaths.size !== currPaths.size || [...currPaths].some(p => !prevPaths.has(p));
      let contentChanged = false;
      const currentMappings = getGameSettingsFileMappings();
      for (const f of files) {
        if (!f.isHandle) continue;
        try {
          const file = await f.handle.getFile();
          const mod = file.lastModified;
          const prevMod = this.lastModifiedByPath[f.relativePath];
          if (prevMod != null && prevMod !== mod) contentChanged = true;
          this.lastModifiedByPath[f.relativePath] = mod;
          const m = currentMappings[f.relativePath];
          if (m && m.handlerId && prevMod != null && prevMod !== mod)
            await this.runHandlerForFile(f, m);
        } catch (_) {}
      }
      this.files = files;
      if ((listChanged || contentChanged) && this.moduleDOM) this.renderModule(this.moduleDOM);
    };
    this.lastModifiedByPath = {};
    this.pollTimer = setInterval(poll, 2000);
    poll();
  }

  renderFileTable(container, mappings) {
    const rows = buildFileTableRows(this.files);
    const table = document.createElement('table');
    table.className = 'filesPanel-table';
    const hoverPreview = document.createElement('div');
    hoverPreview.className = 'filesPanel-assetHoverPreview';
    const hoverPreviewImg = document.createElement('img');
    hoverPreviewImg.alt = '';
    hoverPreview.append(hoverPreviewImg);
    container.append(hoverPreview);
    table.innerHTML = '<thead><tr><th></th><th>File</th><th>Action</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    const showThumbPreview = (imgEl) => {
      hoverPreviewImg.src = imgEl.src;
      const r = imgEl.getBoundingClientRect();
      hoverPreview.style.left = r.left + 'px';
      hoverPreview.style.top = (r.top - 8) + 'px';
      hoverPreview.style.transform = 'translateY(-100%)';
      hoverPreview.classList.add('filesPanel-assetHoverPreview-visible');
    };
    const hideThumbPreview = () => hoverPreview.classList.remove('filesPanel-assetHoverPreview-visible');

    for (const row of rows) {
      if (row.type === 'dir') {
        const tr = document.createElement('tr');
        tr.className = 'filesPanel-dirRow';
        const td = document.createElement('td');
        td.colSpan = 4;
        td.textContent = row.path + '/';
        tr.append(td);
        tbody.append(tr);
        continue;
      }
      const { file, rel } = row;
      const mapping = mappings[rel] || {};
      const tr = document.createElement('tr');
      tr.className = 'filesPanel-fileRow';
      tr.dataset.path = rel;

      const tdThumb = document.createElement('td');
      tdThumb.className = 'filesPanel-cellThumb';
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'filesPanel-thumbWrap';
      if (IMAGE_EXT.test(file.name)) {
        const img = document.createElement('img');
        img.alt = file.name;
        getFileContent(file).then(blob => { img.src = URL.createObjectURL(blob); }).catch(() => {});
        img.onmouseenter = () => showThumbPreview(img);
        img.onmouseleave = hideThumbPreview;
        thumbWrap.append(img);
      } else {
        const ext = getExtension(file.name);
        thumbWrap.textContent = ext || '?';
      }
      tdThumb.append(thumbWrap);
      tr.append(tdThumb);

      const tdName = document.createElement('td');
      tdName.className = 'filesPanel-cellName';
      tdName.textContent = file.name;
      tr.append(tdName);

      const summary = getActionSummary(mapping, rel);
      const tdSummary = document.createElement('td');
      tdSummary.className = 'filesPanel-cellSummary filesPanel-summary';
      const summaryText = document.createElement('span');
      summaryText.className = 'filesPanel-summaryText';
      summaryText.textContent = summary.text;
      tdSummary.append(summaryText);
      tr.append(tdSummary);

      const tdActions = document.createElement('td');
      tdActions.className = 'filesPanel-cellActions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'sidebarButton';
      editBtn.setAttribute('icon', 'edit');
      editBtn.textContent = 'Edit';
      const runBtn = document.createElement('button');
      runBtn.type = 'button';
      runBtn.className = 'sidebarButton';
      runBtn.setAttribute('icon', 'play_arrow');
      runBtn.textContent = 'Run';
      runBtn.onclick = () => {
        const m = getGameSettingsFileMappings()[rel] || {};
        this.runHandlerForFile(file, m).catch(e => alert(e.message));
      };
      editBtn.onclick = () => this.openEditForm(tbody, tr, rel, file, mappings, tdSummary);
      const btnWrap = document.createElement('span');
      btnWrap.className = 'filesPanel-rowButtons';
      btnWrap.append(editBtn, runBtn);
      tdActions.append(btnWrap);
      tr.append(tdActions);
      tbody.append(tr);
    }
    table.append(tbody);
    container.append(table);
  }

  openEditForm(tbody, fileRow, rel, file, mappings, summaryCell) {
    const existingForm = tbody.querySelector('.filesPanel-formRow');
    if (existingForm) existingForm.remove();
    const mapping = mappings[rel] || {};
    const formTr = document.createElement('tr');
    formTr.className = 'filesPanel-formRow';
    const formTd = document.createElement('td');
    formTd.colSpan = 4;
    const form = document.createElement('div');
    form.className = 'filesPanel-editForm';
    const handlerRow = document.createElement('div');
    handlerRow.className = 'filesPanel-formRowInner';
    const handlerLabel = document.createElement('label');
    handlerLabel.textContent = 'On update ';
    const select = document.createElement('select');
    select.className = 'filesPanel-handlerSelect';
    select.innerHTML = '<option value="">— On update —</option>';
    const ext = getExtension(file.name);
    const handlers = window.getFileHandlersForExtension(ext);
    for (const h of handlers) {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = h.label;
      if (mapping.handlerId === h.id) opt.selected = true;
      select.append(opt);
    }
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'filesPanel-formOptions';
    const updateOptions = () => {
      optionsDiv.innerHTML = '';
      const hid = select.value || null;
      if (!hid) return;
      if (!mappings[rel]) mappings[rel] = {};
      mappings[rel].handlerId = hid;
      const handler = window.getFileHandler(hid);
      mappings[rel].options = mappings[rel].options || {};
      for (const sch of handler.optionsSchema || []) {
        if (mappings[rel].options[sch.key] === undefined && sch.options && sch.options[0])
          mappings[rel].options[sch.key] = sch.options[0].value;
      }
      this.renderOptions(optionsDiv, rel, mappings[rel], file);
    };
    select.onchange = () => {
      const handlerId = select.value || null;
      if (!handlerId) delete mappings[rel];
      updateOptions();
      saveFileMappings();
    };
    handlerLabel.append(select);
    handlerRow.append(handlerLabel);
    form.append(handlerRow);
    form.append(optionsDiv);
    updateOptions();
    const btnRow = document.createElement('div');
    btnRow.className = 'filesPanel-formButtons';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'sidebarButton';
    saveBtn.setAttribute('icon', 'checkmark');
    saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'sidebarButton';
    cancelBtn.setAttribute('icon', 'close');
    cancelBtn.textContent = 'Cancel';
      saveBtn.onclick = () => {
      const handlerId = select.value || null;
      const mappings = getGameSettingsFileMappings();
      if (handlerId) {
        if (!mappings[rel]) mappings[rel] = {};
        mappings[rel].handlerId = handlerId;
        const m = mappings[rel];
        m.options = m.options || {};
        if (optionsDiv) {
          for (const input of optionsDiv.querySelectorAll('select, input[type="text"], input[type="hidden"]')) {
            const key = input.dataset.optionKey;
            if (key) m.options[key] = input.value;
          }
        }
      } else {
        delete mappings[rel];
      }
      saveFileMappings();
      formTr.remove();
      const s = getActionSummary(getGameSettingsFileMappings()[rel], rel);
      summaryCell.innerHTML = '';
      const span = document.createElement('span');
      span.className = 'filesPanel-summaryText';
      span.textContent = s.text;
      summaryCell.append(span);
    };
    cancelBtn.onclick = () => formTr.remove();
    btnRow.append(saveBtn, cancelBtn);
    form.append(btnRow);
    formTd.append(form);
    formTr.append(formTd);
    tbody.insertBefore(formTr, fileRow.nextSibling);
  }

  renderOptions(container, rel, mapping, fileInfo) {
    const oldOpts = container.querySelector('.filesPanel-options');
    if (oldOpts) oldOpts.remove();
    if (!mapping || !mapping.handlerId) return;
    const handler = window.getFileHandler(mapping.handlerId);
    if (!handler.optionsSchema || !handler.optionsSchema.length) return;

    const opts = mapping.options || {};
    const div = document.createElement('div');
    div.className = 'filesPanel-options';
    for (const sch of handler.optionsSchema) {
      const label = document.createElement('label');
      label.textContent = sch.label + ' ';
      let input;
      if (sch.type === 'asset') {
        const grouped = typeof getAllAssetsGrouped === 'function' ? getAllAssetsGrouped() : {};
        const urls = Object.keys(grouped);
        if (typeof console !== 'undefined' && console.log)
          console.log('[Files asset picker] mapping.options', mapping && mapping.options ? { ...mapping.options } : null, 'rel', rel);
        const norm = (u) => {
          if (!u) return '';
          const s = String(u).trim();
          const path = s.startsWith('http') ? (() => { try { return new URL(s).pathname; } catch (_) { return s; } })() : s;
          return '/' + path.replace(/^\/+/, '').replace(/\/+$/, '');
        };
        const current = opts[sch.key] || (urls[0] || '');
        const currentNorm = norm(current);
        const matchedUrl = urls.find(u => norm(u) === currentNorm);
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.dataset.optionKey = sch.key;
        hidden.value = matchedUrl !== undefined ? matchedUrl : (urls[0] || '');
        opts[sch.key] = hidden.value;
        if (typeof console !== 'undefined' && console.log) {
          console.log('[Files asset picker]', {
            savedOpt: opts[sch.key],
            current,
            currentNorm,
            matchedUrl: matchedUrl !== undefined ? matchedUrl : null,
            hiddenValue: hidden.value,
            urlCount: urls.length,
            firstFewUrls: urls.slice(0, 5),
            normsMatch: urls.map(u => ({ url: u, norm: norm(u), match: norm(u) === currentNorm })).slice(0, 8)
          });
        }
        const wrap = document.createElement('div');
        wrap.className = 'filesPanel-assetPicker';
        wrap.append(hidden);
        const preview = document.createElement('div');
        preview.className = 'filesPanel-assetHoverPreview';
        const previewImg = document.createElement('img');
        previewImg.alt = '';
        preview.append(previewImg);
        wrap.append(preview);
        const thumbnails = document.createElement('div');
        thumbnails.className = 'filesPanel-assetThumbnails';
        const hiddenNorm = norm(hidden.value);
        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          const isSelected = norm(url) === hiddenNorm;
          if (isSelected && typeof console !== 'undefined' && console.log)
            console.log('[Files asset picker] selected index', i, 'url', url);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'filesPanel-assetThumb' + (isSelected ? ' filesPanel-assetSelected' : '');
          btn.dataset.assetUrl = url;
          const img = document.createElement('img');
          img.src = url;
          img.alt = '';
          img.title = url.replace(/^\/assets\//, '');
          btn.append(img);
          btn.onclick = () => {
            thumbnails.querySelectorAll('.filesPanel-assetThumb').forEach(t => t.classList.remove('filesPanel-assetSelected'));
            btn.classList.add('filesPanel-assetSelected');
            hidden.value = url;
            opts[sch.key] = url;
            saveFileMappings();
          };
          btn.onmouseenter = (e) => {
            previewImg.src = url;
            const r = btn.getBoundingClientRect();
            preview.style.left = r.left + 'px';
            preview.style.top = (r.top - 8) + 'px';
            preview.style.transform = 'translateY(-100%)';
            preview.classList.add('filesPanel-assetHoverPreview-visible');
          };
          btn.onmouseleave = () => preview.classList.remove('filesPanel-assetHoverPreview-visible');
          thumbnails.append(btn);
        }
        wrap.append(thumbnails);
        input = wrap;
      } else if (sch.type === 'deck') {
        input = document.createElement('select');
        for (const [id, w] of widgets) {
          if (w.get('type') === 'deck') {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = id;
            if (opts[sch.key] === id) opt.selected = true;
            input.append(opt);
          }
        }
        opts[sch.key] = input.value || opts[sch.key];
        input.onchange = () => {
          opts[sch.key] = input.value;
          saveFileMappings();
        };
      } else if (sch.type === 'select') {
        input = document.createElement('select');
        for (const o of sch.options || []) {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.text;
          if (opts[sch.key] === o.value) opt.selected = true;
          input.append(opt);
        }
        opts[sch.key] = input.value || opts[sch.key];
        input.onchange = () => {
          opts[sch.key] = input.value;
          saveFileMappings();
        };
      } else {
        input = document.createElement('input');
        input.type = sch.type === 'string' ? 'text' : 'text';
        input.placeholder = sch.label;
        input.value = opts[sch.key] != null ? opts[sch.key] : '';
        opts[sch.key] = input.value;
        input.onchange = () => {
          opts[sch.key] = input.value;
          saveFileMappings();
        };
      }
      input.dataset.optionKey = sch.key;
      label.append(input);
      div.append(label);
    }
    container.append(div);
  }

  async runHandlerForFile(fileInfo, mapping) {
    const DEBUG = false;
    if (DEBUG) console.log('[Files runHandlerForFile] ENTRY', { filePath: fileInfo.relativePath, mapping, handlerId: mapping?.handlerId });
    if (!mapping || !mapping.handlerId) return;
    const mappings = getGameSettingsFileMappings();
    const m = mappings[fileInfo.relativePath];
    if (m && this.moduleDOM) {
      const row = this.moduleDOM.querySelector(`.filesPanel-fileRow[data-path="${fileInfo.relativePath}"]`);
      const optsDiv = row && row.querySelector('.filesPanel-options');
      if (optsDiv) {
        m.options = m.options || {};
        for (const input of optsDiv.querySelectorAll('select, input[type="text"], input[type="hidden"]')) {
          const key = input.dataset.optionKey;
          if (key) m.options[key] = input.value;
        }
        saveFileMappings();
      }
    }
    const handler = window.getFileHandler(mapping.handlerId);
    if (!handler) return;
    const file = await getFileContent(fileInfo);
    const options = (m || mapping).options || {};
    const cachedLastAsset = await getLastAssetUrlFromCache(fileInfo.relativePath);
    const context = { lastAssetUrl: mapping.lastAssetUrl || cachedLastAsset };
    if (DEBUG) console.log('[Files runHandlerForFile] calling handler', { handlerId: mapping.handlerId, options, context, gameSettingsFileMappings: getGameSettingsFileMappings()[fileInfo.relativePath] });

    let content;
    const ext = getExtension(fileInfo.name);
    if (handler.id === 'imageReplaceAsset' && /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(fileInfo.name)) {
      content = file;
    } else {
      content = await (file instanceof Blob ? file.text() : Promise.resolve(file));
    }

    let result;
    try {
      result = await handler.apply(content, options, fileInfo.relativePath, context);
    } catch (err) {
      result = { editedWidgetIds: [], _error: err.message };
      console.error('[Files panel] handler failed:', fileInfo.relativePath, err);
      alert(err.message);
    }
    const mappingsAfter = getGameSettingsFileMappings();
    const mA = mappingsAfter[fileInfo.relativePath];
    if (mA && result && typeof result === 'object' && result.lastAssetUrl) {
      mA.lastAssetUrl = result.lastAssetUrl;
      await saveLastAssetUrlToCache(fileInfo.relativePath, result.lastAssetUrl);
    }
    saveFileMappings();
    const logEntry = {
      time: Date.now(),
      filePath: fileInfo.relativePath,
      handlerId: mapping.handlerId,
      editedWidgetIds: (result && result.editedWidgetIds) || [],
      error: result && result._error
    };
    this.fileLog.push(logEntry);
    const logList = this.moduleDOM && this.moduleDOM.querySelector('.filesPanel-logEntries');
    if (logList) logList.append(this.renderLogEntry(logEntry));
  }
}
