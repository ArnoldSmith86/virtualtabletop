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

    const chooseDir = document.createElement('button');
    chooseDir.className = 'sidebarButton';
    chooseDir.setAttribute('icon', 'folder_open');
    chooseDir.innerHTML = '<span>Choose directory…</span>';
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
      this.addSubHeader('File tree');
      const treeEl = document.createElement('div');
      treeEl.className = 'filesPanel-tree';
      this.renderTree(treeEl, buildFileTree(this.files), '', mappings);
      target.append(treeEl);
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
    clearLog.innerHTML = '<span>Clear log</span>';
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
      const currentMappings = getGameSettingsFileMappings();
      for (const f of files) {
        const m = currentMappings[f.relativePath];
        if (!m || !m.handlerId || !f.isHandle) continue;
        try {
          const file = await f.handle.getFile();
          const mod = file.lastModified;
          if (this.lastModifiedByPath[f.relativePath] != null && this.lastModifiedByPath[f.relativePath] !== mod)
            await this.runHandlerForFile(f, m);
          this.lastModifiedByPath[f.relativePath] = mod;
        } catch (_) {}
      }
      this.files = files;
    };
    this.lastModifiedByPath = {};
    this.pollTimer = setInterval(poll, 2000);
    poll();
  }

  renderTree(container, node, pathPrefix, mappings) {
    const ul = document.createElement('ul');
    ul.className = 'filesPanel-list';

    for (const [dirName, child] of Object.entries(node.children).sort()) {
      const li = document.createElement('li');
      li.className = 'filesPanel-dir';
      const label = document.createElement('span');
      label.className = 'filesPanel-dirName';
      label.textContent = dirName + '/';
      label.onclick = () => {
        li.classList.toggle('open');
      };
      li.append(label);
      const sub = document.createElement('div');
      sub.className = 'filesPanel-children';
      this.renderTree(sub, child, pathPrefix ? pathPrefix + '/' + dirName : dirName, mappings);
      li.append(sub);
      ul.append(li);
    }

    for (const file of node.files.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = pathPrefix ? pathPrefix + '/' + file.name : file.name;
      const li = document.createElement('li');
      li.className = 'filesPanel-file';
      li.dataset.path = rel;

      const preview = document.createElement('div');
      preview.className = 'filesPanel-preview';
      if (IMAGE_EXT.test(file.name)) {
        const img = document.createElement('img');
        img.alt = file.name;
        getFileContent(file).then(blob => { img.src = URL.createObjectURL(blob); }).catch(() => {});
        preview.append(img);
      } else {
        const ext = getExtension(file.name);
        preview.textContent = ext || '?';
      }
      li.append(preview);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'filesPanel-fileName';
      nameSpan.textContent = file.name;
      li.append(nameSpan);

      const mapping = mappings[rel] || {};
      const row = document.createElement('div');
      row.className = 'filesPanel-actions';
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
      select.onchange = () => {
        const handlerId = select.value || null;
        if (!handlerId) {
          delete mappings[rel];
        } else {
          if (!mappings[rel]) mappings[rel] = {};
          mappings[rel].handlerId = handlerId;
          const handler = window.getFileHandler(handlerId);
          mappings[rel].options = mappings[rel].options || {};
          for (const sch of handler.optionsSchema || []) {
            if (mappings[rel].options[sch.key] === undefined && sch.options && sch.options[0])
              mappings[rel].options[sch.key] = sch.options[0].value;
          }
        }
        saveFileMappings();
        this.renderOptions(row, rel, mappings[rel], file);
      };
      row.append(select);

      this.renderOptions(row, rel, mapping, file);
      li.append(row);

      const runBtn = document.createElement('button');
      runBtn.className = 'sidebarButton filesPanel-run';
      runBtn.setAttribute('icon', 'play_arrow');
      runBtn.title = 'Run now';
      runBtn.onclick = () => {
        const mapping = getGameSettingsFileMappings()[rel] || {};
        this.runHandlerForFile(file, mapping).catch(e => alert(e.message));
      };
      li.append(runBtn);

      ul.append(li);
    }

    container.append(ul);
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
        input = document.createElement('select');
        const grouped = typeof getAllAssetsGrouped === 'function' ? getAllAssetsGrouped() : {};
        for (const url of Object.keys(grouped)) {
          const opt = document.createElement('option');
          opt.value = url;
          opt.textContent = url.replace(/^\/assets\//, '');
          if (opts[sch.key] === url) opt.selected = true;
          input.append(opt);
        }
        opts[sch.key] = input.value || opts[sch.key];
        input.onchange = () => {
          opts[sch.key] = input.value;
          saveFileMappings();
        };
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
      const row = this.moduleDOM.querySelector(`.filesPanel-file[data-path="${fileInfo.relativePath}"]`);
      const optsDiv = row && row.querySelector('.filesPanel-options');
      if (optsDiv) {
        m.options = m.options || {};
        for (const input of optsDiv.querySelectorAll('select, input[type="text"]')) {
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
