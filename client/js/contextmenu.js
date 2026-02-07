import { $, $a, removeFromDOM, escapeID, unescapeID, onLoad, asArray, mapAssetURLs } from './domhelpers.js';
import { widgets, batchStart, batchEnd, setDeltaCause } from './serverstate.js';
import { clientPointer } from './main.js';
import { playerName } from './overlays/players.js';
import { getEnabledLegacyModes } from './legacymodes.js';
import { contrastAnyColor } from './color.js';
import { generateSymbolsDiv } from './symbols.js';

const CONTEXT_PREVIEW_ID = 'contextMenuPreview';
const CONTEXT_POPUP_ID = 'contextMenuPopup';
const CONTEXT_DESCRIPTION_POPOVER_ID = 'contextMenuDescriptionPopover';
const CONTEXT_TITLE_ROW_ID = 'contextMenuTitleRow';
const BORDER_PX = 8;
const DEFAULT_ENLARGE = 2;

let currentWidget = null;
let enlargePreviewIndex = 0;
let enlargeOverrides = null;
let touchActive = false;
let rightClickActive = false;
let touchMoveBound = null;
let mouseMoveBound = null;
let mouseUpBound = null;
let longTouchTimer = null;
let previewRotation = 0;
let currentMenu = null;
let descriptionPopoverOwner = null;

function hasRotationSteps(widget) {
  const s = widget.get('rotationSteps');
  return typeof s === 'number' || (Array.isArray(s) && s.length > 0);
}

function hasButtons(widget) {
  const menu = currentMenu ?? widget.get('contextMenu');
  return hasRotationSteps(widget) || (Array.isArray(menu) && menu.length > 0);
}

function hasEnlargeOrRotationOrContextMenu(widget) {
  return widget.get('enlarge') ||
    hasRotationSteps(widget) ||
    (Array.isArray(widget.get('contextMenu')) && widget.get('contextMenu').length > 0);
}

function widgetAtPoint(clientX, clientY) {
  document.body.classList.add('hitTest');
  const els = document.elementsFromPoint(clientX, clientY);
  document.body.classList.remove('hitTest');
  for (const el of els) {
    if (el.id && el.id.slice(0, 2) === 'w_' && widgets.has(unescapeID(el.id.slice(2)))) {
      const w = widgets.get(unescapeID(el.id.slice(2)));
      if (hasEnlargeOrRotationOrContextMenu(w))
        return w;
    }
  }
  return null;
}

function ensurePopup() {
  return $(`#${CONTEXT_POPUP_ID}`);
}

function getRoomScale() {
  const scaleV = getComputedStyle(document.documentElement).getPropertyValue('--scale').trim();
  const scaleN = parseFloat(scaleV);
  const scale = isNaN(scaleN) ? 1 : scaleN;
  if (document.body.classList.contains('zoom2x')) {
    const zoomV = getComputedStyle(document.documentElement).getPropertyValue('--zoom').trim();
    const zoomN = parseFloat(zoomV);
    const zoom = isNaN(zoomN) ? 1 : zoomN;
    return scale * zoom;
  }
  return scale;
}

function getEnlargeOpts(widget) {
  const raw = widget.get('enlarge');
  let opts = null;
  if (raw !== undefined && raw !== null && raw !== false) {
    if (typeof raw === 'number') opts = { factor: raw };
    else if (typeof raw === 'object') {
      opts = { factor: typeof raw.factor === 'number' ? raw.factor : DEFAULT_ENLARGE };
      if (typeof raw.title === 'string') opts.title = raw.title;
      if (typeof raw.color === 'string') opts.color = raw.color;
      if (raw.image !== undefined && raw.image !== null) opts.image = asArray(raw.image);
      if (raw.widget !== undefined && raw.widget !== null) opts.widget = asArray(raw.widget);
    }
  }
  if (enlargeOverrides) {
    opts = opts ? { ...opts } : { factor: DEFAULT_ENLARGE };
    if (typeof enlargeOverrides.factor === 'number') opts.factor = enlargeOverrides.factor;
    if (typeof enlargeOverrides.title === 'string') opts.title = enlargeOverrides.title;
    if (typeof enlargeOverrides.color === 'string') opts.color = enlargeOverrides.color;
    if (enlargeOverrides.image !== undefined && enlargeOverrides.image !== null) opts.image = asArray(enlargeOverrides.image);
    if (enlargeOverrides.widget !== undefined && enlargeOverrides.widget !== null) opts.widget = asArray(enlargeOverrides.widget);
  }
  return opts;
}

function copyWidgetToPreview(widget, previewEl) {
  const opts = getEnlargeOpts(widget);
  const roomScale = getRoomScale();
  const factor = opts ? opts.factor : (widget.get('enlarge') || DEFAULT_ENLARGE);
  const boundBox = widget.domElement.getBoundingClientRect();

  let sourceWidget = widget;
  let previewW = widget.get('width');
  let previewH = widget.get('height');
  let useImage = false;
  let imageList = null;
  let widgetList = null;

  if (opts && opts.widget && opts.widget.length > 0) {
    widgetList = opts.widget.map(id => widgets.has(id) ? widgets.get(id) : null).filter(Boolean);
    if (widgetList.length > 0) {
      sourceWidget = widgetList[enlargePreviewIndex % widgetList.length];
      previewW = sourceWidget.get('width');
      previewH = sourceWidget.get('height');
    }
  } else if (opts && opts.image && opts.image.length > 0) {
    useImage = true;
    imageList = opts.image;
  }

  const scale = roomScale * factor;
  const scaledW = previewW * scale;
  const scaledH = previewH * scale;

  const widgetRotation = useImage ? 0 : (sourceWidget.get('rotation') || 0) + previewRotation;
  const rad = (widgetRotation * Math.PI) / 180;
  const aabbW = useImage ? scaledW : (Math.abs(previewW * scale * Math.cos(rad)) + Math.abs(previewH * scale * Math.sin(rad)));
  const aabbH = useImage ? scaledH : (Math.abs(previewW * scale * Math.sin(rad)) + Math.abs(previewH * scale * Math.cos(rad)));

  const wrap = previewEl.closest('.contextMenuPreviewWrap');
  const descPopover = $(`#${CONTEXT_DESCRIPTION_POPOVER_ID}`);
  wrap.innerHTML = '';
  const navCount = (imageList && imageList.length > 1) || (widgetList && widgetList.length > 1);

  if (useImage) {
    let styleEl = $('#contextMenuStyle');
    if (styleEl) removeFromDOM(styleEl);
    previewEl.innerHTML = '';
    previewEl.className = 'contextMenuPreview';
    previewEl.removeAttribute('data-id');
    previewEl.style.cssText = '';
    const img = document.createElement('img');
    img.alt = '';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.objectFit = 'contain';
    const idx = enlargePreviewIndex % imageList.length;
    img.src = mapAssetURLs(typeof imageList[idx] === 'string' ? imageList[idx] : (imageList[idx]?.image ?? imageList[idx]));
    previewEl.appendChild(img);
    wrap.appendChild(previewEl);
  } else {
    const id = sourceWidget.get('id');
    const w = sourceWidget.get('width');
    const h = sourceWidget.get('height');
    let cssText = sourceWidget.domElement.style.cssText;
    cssText += `;--originalLeft:${boundBox.left}px;--originalTop:${boundBox.top}px`;
    cssText += `;--originalRight:${boundBox.right}px;--originalBottom:${boundBox.bottom}px`;
    previewEl.innerHTML = sourceWidget.domElement.innerHTML;
    previewEl.className = sourceWidget.domElement.className;
    previewEl.dataset.id = id;
    previewEl.style.cssText = cssText;
    previewEl.style.display = sourceWidget.domElement.style.display;
    previewEl.style.position = 'absolute';
    previewEl.style.left = '50%';
    previewEl.style.top = '50%';
    previewEl.style.width = `${w}px`;
    previewEl.style.height = `${h}px`;
    previewEl.style.marginLeft = `${-w / 2}px`;
    previewEl.style.marginTop = `${-h / 2}px`;
    previewEl.style.transform = `scale(${scale}) rotate(${widgetRotation}deg)`;
    previewEl.style.transformOrigin = 'center center';
    if (sourceWidget.get('_ancestor') && widgets.has(sourceWidget.get('_ancestor')) && widgets.get(sourceWidget.get('_ancestor')).domElement.classList.contains('showCardBack'))
      previewEl.classList.add('showCardBack');
    for (const clone of $a('canvas', previewEl)) {
      const original = $(`canvas[data-id = '${clone.dataset.id}']`, sourceWidget.domElement);
      if (original) {
        const context = clone.getContext('2d');
        clone.width = original.width;
        clone.height = original.height;
        context.drawImage(original, 0, 0);
      }
    }
    const originalTextareas = [...$a('textarea', sourceWidget.domElement)];
    const clonedTextareas = [...$a('textarea', previewEl)];
    for (const i in originalTextareas)
      if (clonedTextareas[i]) clonedTextareas[i].value = originalTextareas[i].value;
    const wStyle = $(`#STYLES_${escapeID(id)}`);
    let styleEl = $('#contextMenuStyle');
    if (styleEl) removeFromDOM(styleEl);
    if (wStyle) {
      styleEl = document.createElement('style');
      styleEl.id = 'contextMenuStyle';
      styleEl.appendChild(document.createTextNode(wStyle.textContent.replaceAll(`#w_${escapeID(id)}`, `#${CONTEXT_PREVIEW_ID}`)));
      $('head').appendChild(styleEl);
    }
    wrap.appendChild(previewEl);
  }

  const popupEl = $(`#${CONTEXT_POPUP_ID}`);
  const navRow = popupEl ? $('.contextMenuPreviewNavRow', popupEl) : null;
  if (navRow) {
    navRow.innerHTML = '';
    if (navCount) {
      navRow.style.display = 'flex';
      const len = imageList ? imageList.length : widgetList.length;
      const leftNav = document.createElement('button');
      leftNav.type = 'button';
      leftNav.setAttribute('icon', 'chevron_left');
      leftNav.setAttribute('aria-label', 'Previous');
      leftNav.title = 'Previous';
      leftNav.onclick = (e) => { e.stopPropagation(); enlargePreviewIndex = (enlargePreviewIndex - 1 + len) % len; copyWidgetToPreview(widget, previewEl); };
      const rightNav = document.createElement('button');
      rightNav.type = 'button';
      rightNav.setAttribute('icon', 'chevron_right');
      rightNav.setAttribute('aria-label', 'Next');
      rightNav.title = 'Next';
      rightNav.onclick = (e) => { e.stopPropagation(); enlargePreviewIndex = (enlargePreviewIndex + 1) % len; copyWidgetToPreview(widget, previewEl); };
      navRow.append(leftNav, rightNav);
    } else {
      navRow.style.display = 'none';
    }
  }

  const popup = $(`#${CONTEXT_POPUP_ID}`);
  if (popup) {
    const titleRow = $(`#${CONTEXT_TITLE_ROW_ID}`);
    const hasTitle = opts && opts.title;
    if (titleRow) {
      titleRow.textContent = hasTitle ? opts.title : '';
      titleRow.classList.toggle('hidden', !hasTitle);
    }
    if (wrap) {
      wrap.style.width = `${aabbW}px`;
      wrap.style.height = `${aabbH}px`;
      if (descPopover) wrap.appendChild(descPopover);
    }
  }
}

function rotationStepIndex(steps, currentRotation) {
  const r = ((currentRotation % 360) + 360) % 360;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const s = ((steps[i] % 360) + 360) % 360;
    const d = Math.min(Math.abs(r - s), 360 - Math.abs(r - s));
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function renderRotationButtons(widget, rowEl) {
  const steps = widget.get('rotationSteps');
  const stepNum = typeof steps === 'number' ? steps : (Array.isArray(steps) && steps.length > 0 ? steps[0] : null);
  rowEl.innerHTML = '';
  const spacer = rowEl.closest('.contextMenuPopupBg')?.querySelector('.contextMenuMenuSpacer');
  if (stepNum == null) {
    rowEl.style.display = 'none';
    if (spacer) spacer.style.minHeight = '0';
    return;
  }
  rowEl.style.display = 'flex';
  if (spacer) spacer.style.minHeight = '';
  const leftBtn = document.createElement('button');
  leftBtn.setAttribute('icon', 'rotate_left');
  leftBtn.title = 'Rotate left';
  const rightBtn = document.createElement('button');
  rightBtn.setAttribute('icon', 'rotate_right');
  rightBtn.title = 'Rotate right';
  const afterRotate = () => {
    requestAnimationFrame(() => {
      if (currentWidget) positionPopupBackground(currentWidget, ensurePopup());
    });
  };
  if (typeof steps === 'number') {
    leftBtn.onclick = async () => {
      const current = currentWidget.get('rotation') ?? 0;
      setDeltaCause(`${playerName} rotated ${currentWidget.id}`);
      await currentWidget.set('rotation', current - stepNum);
      copyWidgetToPreview(currentWidget, $(`#${CONTEXT_PREVIEW_ID}`));
      afterRotate();
    };
    rightBtn.onclick = async () => {
      const current = currentWidget.get('rotation') ?? 0;
      setDeltaCause(`${playerName} rotated ${currentWidget.id}`);
      await currentWidget.set('rotation', current + stepNum);
      copyWidgetToPreview(currentWidget, $(`#${CONTEXT_PREVIEW_ID}`));
      afterRotate();
    };
  } else {
    leftBtn.onclick = async () => {
      const current = currentWidget.get('rotation') ?? 0;
      const i = rotationStepIndex(steps, current);
      const nextI = (i - 1 + steps.length) % steps.length;
      const nextVal = steps[nextI];
      setDeltaCause(`${playerName} rotated ${currentWidget.id}`);
      await currentWidget.set('rotation', nextVal);
      copyWidgetToPreview(currentWidget, $(`#${CONTEXT_PREVIEW_ID}`));
      afterRotate();
    };
    rightBtn.onclick = async () => {
      const current = currentWidget.get('rotation') ?? 0;
      const i = rotationStepIndex(steps, current);
      const nextI = (i + 1) % steps.length;
      const nextVal = steps[nextI];
      setDeltaCause(`${playerName} rotated ${currentWidget.id}`);
      await currentWidget.set('rotation', nextVal);
      copyWidgetToPreview(currentWidget, $(`#${CONTEXT_PREVIEW_ID}`));
      afterRotate();
    };
  }
  rowEl.append(leftBtn, rightBtn);
}

function renderContextMenuButtons(widget, colEl, popupContrastColor) {
  hideDescriptionPopover();
  const menu = currentMenu ?? widget.get('contextMenu');
  colEl.innerHTML = '';
  if (!Array.isArray(menu) || menu.length === 0) {
    colEl.style.display = 'none';
    return;
  }
  const iconColor = popupContrastColor ?? 'white';
  colEl.style.display = 'flex';
  colEl.style.flexDirection = 'column';
  colEl.style.gap = '4px';
  const popup = ensurePopup();
  const buttonsCol = $('.contextMenuButtons', popup);
  const iconSize = 24;
  const descriptionPopover = $(`#${CONTEXT_DESCRIPTION_POPOVER_ID}`);
  for (const item of menu) {
    const hasSubmenu = Array.isArray(item.menu) && item.menu.length > 0;
    const routine = item.routine;
    const routineDef = typeof routine === 'string' ? widget.get(routine) : null;
    const hasRoutine = typeof routine === 'string' && Array.isArray(routineDef);
    const hasDescription = typeof item.description === 'string' && item.description.length > 0;
    const row = document.createElement('div');
    row.className = 'contextMenuActionRow';
    const btn = document.createElement('button');
    btn.className = 'contextMenuAction';
    const textColor = item.color ? contrastAnyColor(item.color, 1) : 'white';
    if (item.color) {
      btn.style.backgroundColor = item.color;
      btn.style.color = textColor;
    }
    if (!hasRoutine && !hasSubmenu) {
      btn.disabled = true;
      btn.title = typeof routine === 'string' ? `Routine '${routine}' doesn't exist` : 'No routine or submenu';
    }
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'contextMenuActionIcon';
    iconWrapper.style.width = `${iconSize}px`;
    iconWrapper.style.height = `${iconSize}px`;
    const symbol = typeof item.icon === 'object' && item.icon !== null ? item.icon : { name: item.icon ?? 'chevron_right' };
    generateSymbolsDiv(iconWrapper, iconSize, iconSize, [ symbol ], '', 1, textColor, textColor);
    btn.appendChild(iconWrapper);
    const label = document.createElement('span');
    label.className = 'contextMenuActionLabel';
    label.textContent = item.text || '';
    if (item.color) label.style.color = textColor;
    btn.appendChild(label);
    row.appendChild(btn);
    if (hasDescription && descriptionPopover) {
      const infoBtn = document.createElement('button');
      infoBtn.className = 'contextMenuDescriptionTrigger';
      infoBtn.type = 'button';
      infoBtn.title = 'Show description';
      const infoIcon = document.createElement('div');
      infoIcon.className = 'contextMenuActionIcon';
      infoIcon.style.width = '20px';
      infoIcon.style.height = '20px';
      generateSymbolsDiv(infoIcon, 20, 20, [ { name: 'info' } ], '', 1, iconColor, iconColor);
      infoBtn.appendChild(infoIcon);
      infoBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isOpen = descriptionPopoverOwner === infoBtn;
        hideDescriptionPopover();
        if (!isOpen) {
          descriptionPopover.textContent = item.description;
          descriptionPopoverOwner = infoBtn;
          descriptionPopover.classList.remove('hidden');
        }
      };
      row.appendChild(infoBtn);
    }
    if (hasSubmenu) {
      btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        currentMenu = item.menu;
        const bg = $('.contextMenuPopupBg', popup);
        const subBgColor = bg ? getComputedStyle(bg).backgroundColor : '';
        const subContrast = (subBgColor && subBgColor !== 'rgba(0, 0, 0, 0)') ? contrastAnyColor(subBgColor, 1) : 'white';
        renderContextMenuButtons(widget, buttonsCol, subContrast);
        requestAnimationFrame(() => { if (currentWidget) positionPopupBackground(currentWidget, popup); });
      };
    } else if (hasRoutine) {
      btn.onclick = async () => {
        batchStart();
        setDeltaCause(`${playerName} context action ${routine} on ${widget.id}`);
        await widget.evaluateRoutine(routine, { previewIndex: enlargePreviewIndex }, {});
        batchEnd();
        closeContextMenu();
      };
    }
    colEl.appendChild(row);
  }
}

function hideDescriptionPopover() {
  const el = $(`#${CONTEXT_DESCRIPTION_POPOVER_ID}`);
  if (el) el.classList.add('hidden');
  descriptionPopoverOwner = null;
}

function positionPopupBackground(widget, popup) {
  const bg = $('.contextMenuPopupBg', popup);
  const wrap = $('.contextMenuPreviewWrap', popup);
  if (!bg || !wrap) return;
  const boundBox = widget.domElement.getBoundingClientRect();
  const widgetCenterX = boundBox.left + boundBox.width / 2;
  const widgetCenterY = boundBox.top + boundBox.height / 2;
  const wrapRect = wrap.getBoundingClientRect();
  const wrapCenterX = wrapRect.left + wrapRect.width / 2;
  const wrapCenterY = wrapRect.top + wrapRect.height / 2;
  const bgRect = bg.getBoundingClientRect();
  let left = Math.round(bgRect.left + (widgetCenterX - wrapCenterX));
  let top = Math.round(bgRect.top + (widgetCenterY - wrapCenterY));
  const w = bg.offsetWidth;
  const h = bg.offsetHeight;
  const roomArea = $('#roomArea');
  if (roomArea) {
    const room = roomArea.getBoundingClientRect();
    const margin = Math.min(room.width, room.height) * 0.05;
    if (left < room.left + margin) left = room.left + margin;
    if (left + w > room.right - margin) left = room.right - margin - w;
    if (top < room.top + margin) top = room.top + margin;
    if (top + h > room.bottom - margin) top = room.bottom - margin - h;
    left = Math.round(left);
    top = Math.round(top);
  }
  bg.style.left = `${left}px`;
  bg.style.top = `${top}px`;
}

function openContextMenu(widget, menuOverride) {
  currentWidget = widget;
  previewRotation = 0;
  currentMenu = menuOverride !== undefined ? (Array.isArray(menuOverride) ? menuOverride : []) : (widget.get('contextMenu') || []);
  const popup = ensurePopup();
  const opts = getEnlargeOpts(widget);
  const bg = $('.contextMenuPopupBg', popup);
  if (bg) bg.style.backgroundColor = (opts && opts.color) ? opts.color : '';
  const bgColor = bg ? getComputedStyle(bg).backgroundColor : '';
  const popupContrastColor = (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') ? contrastAnyColor(bgColor, 1) : 'white';
  const previewEl = $(`#${CONTEXT_PREVIEW_ID}`);
  const rotationRow = $('.contextMenuRotationRow', popup);
  const buttonsCol = $('.contextMenuButtons', popup);

  copyWidgetToPreview(widget, previewEl);
  renderRotationButtons(widget, rotationRow);
  renderContextMenuButtons(widget, buttonsCol, popupContrastColor);

  popup.classList.remove('hidden');

  requestAnimationFrame(() => {
    if (!currentWidget || currentWidget !== widget) return;
    positionPopupBackground(widget, popup);
    applyPopupContrastColors(popup);
  });
}

function applyPopupContrastColors(popup) {
  const bg = $('.contextMenuPopupBg', popup);
  if (!bg) return;
  const bgColor = getComputedStyle(bg).backgroundColor;
  if (!bgColor || bgColor === 'rgba(0, 0, 0, 0)') return;
  const color = contrastAnyColor(bgColor, 1);
  const titleRow = $(`#${CONTEXT_TITLE_ROW_ID}`);
  if (titleRow) titleRow.style.color = color;
  for (const row of ['.contextMenuRotationRow', '.contextMenuPreviewNavRow']) {
    const el = $(row, popup);
    if (el) for (const btn of el.querySelectorAll('button')) btn.style.color = color;
  }
}

export function openContextMenuWithMenu(widget, menu, overrides) {
  if (!widget || !Array.isArray(menu)) return;
  enlargeOverrides = overrides && typeof overrides === 'object' ? overrides : null;
  openContextMenu(widget, menu);
}

export function closeContextMenu() {
  currentWidget = null;
  currentMenu = null;
  enlargeOverrides = null;
  touchActive = false;
  rightClickActive = false;
  hideDescriptionPopover();
  const popup = $(`#${CONTEXT_POPUP_ID}`);
  if (popup) popup.classList.add('hidden');
  const styleEl = $('#contextMenuStyle');
  if (styleEl) removeFromDOM(styleEl);
  if (touchMoveBound) {
    document.removeEventListener('touchmove', touchMoveBound);
    touchMoveBound = null;
  }
  if (mouseMoveBound) {
    document.removeEventListener('mousemove', mouseMoveBound);
    mouseMoveBound = null;
  }
  if (mouseUpBound) {
    document.removeEventListener('mouseup', mouseUpBound);
    mouseUpBound = null;
  }
}

function closePopupAndStartHold(clientX, clientY) {
  closeContextMenu();
  const w = widgetAtPoint(clientX, clientY);
  if (w && hasEnlargeOrRotationOrContextMenu(w))
    return;
  mouseMoveBound = (e) => updateHoveredWidget(e.clientX, e.clientY);
  mouseUpBound = (e) => {
    if (e.button === 2) {
      rightClickActive = false;
      document.removeEventListener('mousemove', mouseMoveBound);
      document.removeEventListener('mouseup', mouseUpBound);
      mouseMoveBound = null;
      mouseUpBound = null;
      if (shouldClosePopupOnRelease()) closeContextMenu();
    }
  };
  document.addEventListener('mousemove', mouseMoveBound);
  document.addEventListener('mouseup', mouseUpBound);
}

function shouldClosePopupOnRelease() {
  return !currentWidget || !hasButtons(currentWidget);
}

function updateHoveredWidget(clientX, clientY) {
  const w = widgetAtPoint(clientX, clientY);
  if (w && w !== currentWidget && hasEnlargeOrRotationOrContextMenu(w))
    openContextMenu(w);
}

export function handleContextMenu(e, widget) {
  const popup = $(`#${CONTEXT_POPUP_ID}`);
  if (popup && !popup.classList.contains('hidden')) {
    e.preventDefault();
    closePopupAndStartHold(e.clientX, e.clientY);
    return;
  }
  if (rightClickActive) {
    e.preventDefault();
    return;
  }
  if (!widget) {
    const target = e.target;
    let el = target;
    while (el && (!el.id || el.id.slice(0, 2) !== 'w_' || !widgets.has(unescapeID(el.id.slice(2)))))
      el = el.parentNode;
    if (!el) return;
    widget = widgets.get(unescapeID(el.id.slice(2)));
  }

  e.preventDefault();

  if (Array.isArray(widget.get('rightClickRoutine'))) {
    batchStart();
    setDeltaCause(`${playerName} right-clicked ${widget.id}`);
    widget.evaluateRoutine('rightClickRoutine', {}, {}).then(() => batchEnd());
    return;
  }

  if (getEnabledLegacyModes().includes('hoverEnlarge') && widget.get('enlarge')) {
    widget.showEnlarged(e);
    return;
  }

  if (!hasEnlargeOrRotationOrContextMenu(widget))
    return;

  openContextMenu(widget);
  mouseMoveBound = (e) => updateHoveredWidget(e.clientX, e.clientY);
  mouseUpBound = (e) => {
    if (e.button === 2) {
      rightClickActive = false;
      document.removeEventListener('mousemove', mouseMoveBound);
      document.removeEventListener('mouseup', mouseUpBound);
      mouseMoveBound = null;
      mouseUpBound = null;
      if (shouldClosePopupOnRelease()) closeContextMenu();
    }
  };
  document.addEventListener('mousemove', mouseMoveBound);
  document.addEventListener('mouseup', mouseUpBound);
}

export function onLongTouch(widget) {
  if (Array.isArray(widget.get('rightClickRoutine'))) {
    batchStart();
    setDeltaCause(`${playerName} long-touched ${widget.id}`);
    widget.evaluateRoutine('rightClickRoutine', {}, {}).then(() => batchEnd());
    return;
  }

  if (getEnabledLegacyModes().includes('hoverEnlarge') && widget.get('enlarge')) {
    widget.showEnlarged();
    widget.domElement.classList.add('longtouch');
    return;
  }

  if (!hasEnlargeOrRotationOrContextMenu(widget))
    return;

  touchActive = true;
  widget.domElement.classList.add('longtouch');
  openContextMenu(widget);

  touchMoveBound = (e) => {
    if (e.touches.length) updateHoveredWidget(e.touches[0].clientX, e.touches[0].clientY);
  };
  document.addEventListener('touchmove', touchMoveBound, { passive: true });
}

export function onTouchEndContextMenu() {
  if (!touchActive) return;
  if (shouldClosePopupOnRelease()) closeContextMenu();
  touchActive = false;
  if (touchMoveBound) {
    document.removeEventListener('touchmove', touchMoveBound);
    touchMoveBound = null;
  }
}

onLoad(function() {
  const popupEl = $(`#${CONTEXT_POPUP_ID}`);
  if (popupEl) {
    popupEl.addEventListener('mousedown', e => {
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        closePopupAndStartHold(e.clientX, e.clientY);
      } else {
        e.stopPropagation();
      }
    });
    popupEl.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
  }
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return;
    e.preventDefault();
    closePopupAndStartHold(e.clientX, e.clientY);
  });
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (widgetAtPoint(t.clientX, t.clientY)) return;
    if (longTouchTimer) clearTimeout(longTouchTimer);
    longTouchTimer = setTimeout(() => {
      longTouchTimer = null;
      touchActive = true;
      touchMoveBound = (ev) => {
        if (ev.touches.length) updateHoveredWidget(ev.touches[0].clientX, ev.touches[0].clientY);
      };
      document.addEventListener('touchmove', touchMoveBound, { passive: true });
      updateHoveredWidget(t.clientX, t.clientY);
    }, 500);
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (longTouchTimer && e.touches.length === 0) {
      clearTimeout(longTouchTimer);
      longTouchTimer = null;
    }
    if (e.touches.length === 0) onTouchEndContextMenu();
  });
  document.addEventListener('touchcancel', (e) => {
    if (longTouchTimer) {
      clearTimeout(longTouchTimer);
      longTouchTimer = null;
    }
    if (e.touches.length === 0) onTouchEndContextMenu();
  });
  document.addEventListener('click', (e) => {
    const popup = $(`#${CONTEXT_POPUP_ID}`);
    const descPopover = $(`#${CONTEXT_DESCRIPTION_POPOVER_ID}`);
    if (descPopover && !descPopover.classList.contains('hidden') && !descPopover.contains(e.target) && !e.target.closest('.contextMenuDescriptionTrigger')) {
      hideDescriptionPopover();
    }
    if (!popup || popup.classList.contains('hidden')) return;
    if (!popup.contains(e.target)) {
      closeContextMenu();
      return;
    }
    if (!e.target.closest('.contextMenuPopupBg') && !e.target.closest(`#${CONTEXT_DESCRIPTION_POPOVER_ID}`))
      closeContextMenu();
  });
  window.addEventListener('resize', () => {
    const popup = $(`#${CONTEXT_POPUP_ID}`);
    if (!popup || popup.classList.contains('hidden') || !currentWidget) return;
    copyWidgetToPreview(currentWidget, $(`#${CONTEXT_PREVIEW_ID}`));
    requestAnimationFrame(() => {
      if (currentWidget) positionPopupBackground(currentWidget, popup);
    });
  });
});
