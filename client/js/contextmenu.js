import { $, $a, removeFromDOM, unescapeID, onLoad, asArray, mapAssetURLs } from './domhelpers.js';
import { widgets, batchStart, batchEnd, setDeltaCause } from './serverstate.js';
import { playerName } from './overlays/players.js';
import { contrastAnyColor } from './color.js';
import { generateSymbolsDiv } from './symbols.js';

const CONTEXT_PREVIEW_ID = 'contextMenuPreview';
const CONTEXT_POPUP_ID = 'contextMenuPopup';
const CONTEXT_DESCRIPTION_POPOVER_ID = 'contextMenuDescriptionPopover';
const CONTEXT_TITLE_ROW_ID = 'contextMenuTitleRow';
const DEFAULT_ENLARGE = 2;

let currentWidget = null;
let enlargePreviewIndex = 0;
let optionOverrides = null;
let touchActive = false;
let longTouchHandled = false;
let rightClickActive = false;
let longTouchTimer = null;
let currentMenu = null;
let descriptionPopoverOwner = null;

function hasRotationSteps(widget) {
  const s = widget.get('rotationSteps');
  return typeof s === 'number' || (Array.isArray(s) && s.length > 0);
}

function hasButtons(widget) {
  const menu = currentMenu !== null ? currentMenu : widget.get('contextMenu');
  return hasRotationSteps(widget) || (Array.isArray(menu) && menu.length > 0);
}

function hasPopupTriggers(widget) {
  const options = widget.get('contextMenuOptions');
  return (options !== null && typeof options === 'object' && !Array.isArray(options)) ||
    hasRotationSteps(widget) ||
    (Array.isArray(widget.get('contextMenu')) && widget.get('contextMenu').length > 0);
}

// widgets that opt into new right-click behavior; classic enlarge keeps the original click/drag path
function reactsToRightClick(widget) {
  return hasPopupTriggers(widget) || Array.isArray(widget.get('rightClickRoutine'));
}

// the widgets under a point, topmost first - including the ones the open popup covers, so that
// holding the button and moving over a fan of cards previews one after the other
function widgetsAtPoint(clientX, clientY) {
  document.body.classList.add('hitTest');
  const els = document.elementsFromPoint(clientX, clientY);
  document.body.classList.remove('hitTest');
  const found = [];
  for (const el of els) {
    if (el.id && el.id.slice(0, 2) === 'w_' && widgets.has(unescapeID(el.id.slice(2))))
      found.push(widgets.get(unescapeID(el.id.slice(2))));
  }
  return found;
}

function widgetAtPoint(clientX, clientY) {
  return widgetsAtPoint(clientX, clientY).find(hasPopupTriggers) || null;
}

function ensurePopup() {
  return $(`#${CONTEXT_POPUP_ID}`);
}

// how big one room pixel is on screen: the layout scale times the zoom level
function getRoomScale() {
  const cssNumber = name => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 1;
  return cssNumber('--scale') * cssNumber('--zoom');
}

function getPopupOptions(widget) {
  // the preview defaults to the widget's numeric `enlarge` factor so both features stay consistent
  const opts = { factor: typeof widget.get('enlarge') === 'number' ? widget.get('enlarge') : DEFAULT_ENLARGE };
  for (const raw of [ widget.get('contextMenuOptions'), optionOverrides ]) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
      continue;
    if (typeof raw.factor === 'number') opts.factor = raw.factor;
    if (typeof raw.title === 'string') opts.title = raw.title;
    if (typeof raw.color === 'string') opts.color = raw.color;
    if (raw.image !== undefined && raw.image !== null) opts.image = asArray(raw.image);
    if (raw.widget !== undefined && raw.widget !== null) opts.widget = asArray(raw.widget);
  }
  return opts;
}

function copyWidgetToPreview(widget, previewEl) {
  const opts = getPopupOptions(widget);
  const roomScale = getRoomScale();
  const factor = opts.factor;
  const boundBox = widget.domElement.getBoundingClientRect();

  let sourceWidget = widget;
  let previewW = widget.get('width');
  let previewH = widget.get('height');
  let useImage = false;
  let imageList = null;
  let widgetList = null;

  if (opts.widget && opts.widget.length > 0) {
    widgetList = opts.widget.map(id => widgets.has(id) ? widgets.get(id) : null).filter(Boolean);
    if (widgetList.length > 0) {
      sourceWidget = widgetList[enlargePreviewIndex % widgetList.length];
      previewW = sourceWidget.get('width');
      previewH = sourceWidget.get('height');
    }
  } else if (opts.image && opts.image.length > 0) {
    useImage = true;
    imageList = opts.image;
  }

  const widgetRotation = useImage ? 0 : (sourceWidget.get('rotation') || 0);
  const rad = (widgetRotation * Math.PI) / 180;
  // rotated axis-aligned extents per unit of scale, used to clamp the preview to the viewport
  const unitW = useImage ? previewW : (Math.abs(previewW * Math.cos(rad)) + Math.abs(previewH * Math.sin(rad)));
  const unitH = useImage ? previewH : (Math.abs(previewW * Math.sin(rad)) + Math.abs(previewH * Math.cos(rad)));
  const scale = Math.min(roomScale * factor, window.innerWidth * 0.7 / unitW, window.innerHeight * 0.6 / unitH);
  const aabbW = unitW * scale;
  const aabbH = unitH * scale;

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
    img.src = mapAssetURLs(imageList[idx]);
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
    const wStyle = $(`#STYLES_${sourceWidget.cssScope}`);
    let styleEl = $('#contextMenuStyle');
    if (styleEl) removeFromDOM(styleEl);
    if (wStyle) {
      styleEl = document.createElement('style');
      styleEl.id = 'contextMenuStyle';
      styleEl.appendChild(document.createTextNode(wStyle.textContent.replaceAll(`#w_${sourceWidget.cssScope}`, `#${CONTEXT_PREVIEW_ID}`)));
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
  if (stepNum == null) {
    rowEl.style.display = 'none';
    return;
  }
  rowEl.style.display = 'flex';
  const rotate = async direction => {
    const current = currentWidget.get('rotation') || 0;
    let next;
    if (typeof steps === 'number') {
      next = (((current + direction * steps) % 360) + 360) % 360;
    } else {
      const i = rotationStepIndex(steps, current);
      next = steps[(i + direction + steps.length) % steps.length];
    }
    setDeltaCause(`${playerName} rotated ${currentWidget.id}`);
    await currentWidget.set('rotation', next);
    copyWidgetToPreview(currentWidget, $(`#${CONTEXT_PREVIEW_ID}`));
    requestAnimationFrame(() => {
      if (currentWidget) positionPopupBackground(currentWidget, ensurePopup());
    });
  };
  for (const [ icon, title, direction ] of [ [ 'rotate_left', 'Rotate left', -1 ], [ 'rotate_right', 'Rotate right', 1 ] ]) {
    const btn = document.createElement('button');
    btn.setAttribute('icon', icon);
    btn.title = title;
    btn.onclick = () => rotate(direction);
    rowEl.appendChild(btn);
  }
}

function renderContextMenuButtons(widget, colEl, popupContrastColor) {
  hideDescriptionPopover();
  const menu = currentMenu !== null ? currentMenu : widget.get('contextMenu');
  colEl.innerHTML = '';
  if (!Array.isArray(menu) || menu.length === 0) {
    colEl.style.display = 'none';
    return;
  }
  const iconColor = popupContrastColor || 'white';
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
    const symbol = typeof item.icon === 'object' && item.icon !== null ? item.icon : { name: item.icon || 'chevron_right' };
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
        closeContextMenu();
        await runRoutine(widget, routine, `${playerName} context action ${routine} on ${widget.id}`, { previewIndex: enlargePreviewIndex });
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

// batchEnd() has to run even if the routine throws: a leaked batch stops this client from syncing
async function runRoutine(widget, routine, cause, variables = {}) {
  batchStart();
  try {
    setDeltaCause(cause);
    await widget.evaluateRoutine(routine, variables, {});
  } finally {
    batchEnd();
  }
}

function openContextMenu(widget, menuOverride, overrides = null) {
  currentWidget = widget;
  enlargePreviewIndex = 0;
  optionOverrides = overrides;
  currentMenu = menuOverride !== undefined ? (Array.isArray(menuOverride) ? menuOverride : []) : (widget.get('contextMenu') || []);
  const popup = ensurePopup();
  const opts = getPopupOptions(widget);
  const bg = $('.contextMenuPopupBg', popup);
  if (bg) bg.style.backgroundColor = opts.color || '';
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
  openContextMenu(widget, menu, overrides && typeof overrides === 'object' ? overrides : null);
}

export function closeContextMenu() {
  currentWidget = null;
  currentMenu = null;
  optionOverrides = null;
  touchActive = false;
  hideDescriptionPopover();
  const popup = $(`#${CONTEXT_POPUP_ID}`);
  if (popup) popup.classList.add('hidden');
  const styleEl = $('#contextMenuStyle');
  if (styleEl) removeFromDOM(styleEl);
}

function isPopupOpen() {
  const popup = $(`#${CONTEXT_POPUP_ID}`);
  return popup && !popup.classList.contains('hidden');
}

function shouldClosePopupOnRelease() {
  return !currentWidget || !hasButtons(currentWidget);
}

function updateHoveredWidget(clientX, clientY) {
  const w = widgetAtPoint(clientX, clientY);
  if (w && w !== currentWidget)
    openContextMenu(w);
}

// the topmost widget under the pointer reacts; one that reacts to nothing lets the ones below it
// (like the holder of a card) have the right-click instead
function handleWidgetContextMenu(e) {
  // a long touch fires this too, after the widget's own timer has already reacted to it
  if (longTouchHandled)
    return true;

  for (const widget of widgetsAtPoint(e.clientX, e.clientY)) {
    if (Array.isArray(widget.get('rightClickRoutine'))) {
      runRoutine(widget, 'rightClickRoutine', `${playerName} right-clicked ${widget.id}`);
      return true;
    }

    if (hasPopupTriggers(widget)) {
      openContextMenu(widget);
      return true;
    }

    if (widget.get('enlarge')) {
      widget.showEnlarged(e);
      return true;
    }
  }
  return false;
}

// called by inputHandler in mousehandling.js outside of edit mode and JSON editor sessions;
// returning true consumes the event so the regular widget interaction is skipped
export function handleContextMenuInput(name, e) {
  if (name === 'contextmenu')
    return handleWidgetContextMenu(e);

  // interactions with the popup itself never get here: its own listeners stop propagation
  if (name === 'mousedown' && e.button === 2) {
    const hitWidgets = widgetsAtPoint(e.clientX, e.clientY);
    // a widget under the pointer that doesn't opt into any right-click behavior keeps its
    // normal click/drag handling, exactly like before this feature existed; empty space (no
    // widget at all) is always taken over so holding and moving onto a widget still works
    if (hitWidgets.length > 0 && !hitWidgets.some(reactsToRightClick))
      return false;
    closeContextMenu();
    rightClickActive = true;
    return true;
  }

  if (name === 'mouseup' && e.button === 2) {
    if (!rightClickActive)
      return false; // mousedown didn't take this over, so let the normal click go through too
    rightClickActive = false;
    if (shouldClosePopupOnRelease())
      closeContextMenu();
    return true;
  }

  if (name === 'mousemove' && rightClickActive) {
    if (!(e.buttons & 2)) {
      rightClickActive = false; // the release happened outside the window
      return false;
    }
    updateHoveredWidget(e.clientX, e.clientY);
    return true;
  }

  if (name === 'touchmove' && touchActive) {
    if (e.touches.length)
      updateHoveredWidget(e.touches[0].clientX, e.touches[0].clientY);
    return true;
  }

  if (name === 'touchstart' && e.touches.length === 1 && !isPopupOpen()) {
    // a long touch on empty space allows moving onto widgets to open their popup
    const t = e.touches[0];
    if (widgetsAtPoint(t.clientX, t.clientY).length === 0) {
      if (longTouchTimer) clearTimeout(longTouchTimer);
      longTouchTimer = setTimeout(() => {
        longTouchTimer = null;
        touchActive = true;
        updateHoveredWidget(t.clientX, t.clientY);
      }, 500);
    }
    return false;
  }

  if ((name === 'touchend' || name === 'touchcancel') && e.touches.length === 0) {
    if (longTouchTimer) {
      clearTimeout(longTouchTimer);
      longTouchTimer = null;
    }
    onTouchEndContextMenu();
    return false;
  }

  return false;
}

export function onLongTouch(widget) {
  if (longTouchHandled)
    return; // a widget nested inside this one already reacted to the same long touch

  if (Array.isArray(widget.get('rightClickRoutine'))) {
    longTouchHandled = true;
    widget.domElement.classList.add('longtouch');
    runRoutine(widget, 'rightClickRoutine', `${playerName} long-touched ${widget.id}`);
    return;
  }

  if (!hasPopupTriggers(widget)) {
    if (widget.get('enlarge')) {
      longTouchHandled = true;
      widget.showEnlarged();
      widget.domElement.classList.add('longtouch');
    }
    return;
  }

  longTouchHandled = true;
  touchActive = true;
  widget.domElement.classList.add('longtouch');
  openContextMenu(widget);
}

export function onTouchEndContextMenu() {
  longTouchHandled = false;
  if (!touchActive) return;
  if (shouldClosePopupOnRelease()) closeContextMenu();
  touchActive = false;
}

export function handleContextMenuTouchEnd(e) {
  if (e.target.closest('.contextMenuPopupBg') || e.target.closest(`#${CONTEXT_DESCRIPTION_POPOVER_ID}`))
    e.stopPropagation();
}

onLoad(function() {
  const popupEl = $(`#${CONTEXT_POPUP_ID}`);
  if (popupEl) {
    // interactions with the popup itself are kept away from the room's input handler;
    // events outside the popup background bubble to inputHandler in mousehandling.js
    popupEl.addEventListener('mousedown', e => {
      if (e.target.closest('.contextMenuPopupBg') || e.target.closest(`#${CONTEXT_DESCRIPTION_POPOVER_ID}`)) {
        e.stopPropagation();
        if (e.button === 2)
          e.preventDefault(); // the popup has priority: right-clicking it does nothing
      }
    });
    popupEl.addEventListener('touchstart', e => {
      e.stopPropagation();
      // no click event gets synthesized for taps on the popup container, so close here
      if (!touchActive && !e.target.closest('.contextMenuPopupBg') && !e.target.closest(`#${CONTEXT_DESCRIPTION_POPOVER_ID}`))
        closeContextMenu();
    }, { passive: true });
    popupEl.addEventListener('touchend', handleContextMenuTouchEnd);
    popupEl.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
    });
  }
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
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isPopupOpen())
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
