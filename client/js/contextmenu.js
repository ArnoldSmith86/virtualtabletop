import { $, $a, removeFromDOM, escapeID, unescapeID, onLoad } from './domhelpers.js';
import { widgets, batchStart, batchEnd, setDeltaCause } from './serverstate.js';
import { clientPointer } from './main.js';
import { playerName } from './overlays/players.js';
import { getEnabledLegacyModes } from './legacymodes.js';
import { contrastAnyColor } from './color.js';
import { generateSymbolsDiv } from './symbols.js';

const CONTEXT_PREVIEW_ID = 'contextMenuPreview';
const CONTEXT_POPUP_ID = 'contextMenuPopup';
const BORDER_PX = 8;
const DEFAULT_ENLARGE = 2;

let currentWidget = null;
let touchActive = false;
let rightClickActive = false;
let touchMoveBound = null;
let mouseMoveBound = null;
let mouseUpBound = null;
let longTouchTimer = null;
let previewRotation = 0;
let currentMenu = null;

function hasButtons(widget) {
  const steps = widget.get('rotationSteps');
  const menu = currentMenu ?? widget.get('contextMenu');
  return (Array.isArray(steps) && steps.length > 0) || (Array.isArray(menu) && menu.length > 0);
}

function hasEnlargeOrRotationOrContextMenu(widget) {
  return widget.get('enlarge') ||
    (Array.isArray(widget.get('rotationSteps')) && widget.get('rotationSteps').length > 0) ||
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
  let popup = $(`#${CONTEXT_POPUP_ID}`);
  if (!popup) {
    popup = document.createElement('div');
    popup.id = CONTEXT_POPUP_ID;
    popup.className = 'contextMenuPopup';
    popup.innerHTML = `
      <div class="contextMenuPopupBg">
        <div class="contextMenuRotationRow"></div>
        <div class="contextMenuContent">
          <div class="contextMenuPreviewWrap">
            <div id="${CONTEXT_PREVIEW_ID}" class="contextMenuPreview"></div>
          </div>
          <div class="contextMenuButtons"></div>
        </div>
      </div>
    `;
    popup.classList.add('hidden');
    $('body').appendChild(popup);
    popup.addEventListener('mousedown', e => {
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        closePopupAndStartHold(e.clientX, e.clientY);
      } else {
        e.stopPropagation();
      }
    });
    popup.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
  }
  return popup;
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

function copyWidgetToPreview(widget, previewEl) {
  const id = widget.get('id');
  const roomScale = getRoomScale();
  const enlarge = widget.get('enlarge') || DEFAULT_ENLARGE;
  const w = widget.get('width');
  const h = widget.get('height');
  const scale = roomScale * enlarge;
  const scaledW = w * scale;
  const scaledH = h * scale;
  const boundBox = widget.domElement.getBoundingClientRect();
  const centerX = boundBox.left + boundBox.width / 2;
  const centerY = boundBox.top + boundBox.height / 2;
  let left = centerX - scaledW / 2;
  let top = centerY - scaledH / 2;
  const widgetRotation = widget.get('rotation') || 0;
  const totalRotation = widgetRotation + previewRotation;
  const rad = (totalRotation * Math.PI) / 180;
  const aabbW = Math.abs(scaledW * Math.cos(rad)) + Math.abs(scaledH * Math.sin(rad));
  const aabbH = Math.abs(scaledW * Math.sin(rad)) + Math.abs(scaledH * Math.cos(rad));

  let cssText = widget.domElement.style.cssText;
  cssText += `;--originalLeft:${boundBox.left}px;--originalTop:${boundBox.top}px`;
  cssText += `;--originalRight:${boundBox.right}px;--originalBottom:${boundBox.bottom}px`;

  previewEl.innerHTML = widget.domElement.innerHTML;
  previewEl.className = widget.domElement.className;
  previewEl.dataset.id = id;
  previewEl.style.cssText = cssText;
  previewEl.style.display = widget.domElement.style.display;
  previewEl.style.position = 'absolute';
  previewEl.style.left = '50%';
  previewEl.style.top = '50%';
  previewEl.style.width = `${w}px`;
  previewEl.style.height = `${h}px`;
  previewEl.style.marginLeft = `${-w / 2}px`;
  previewEl.style.marginTop = `${-h / 2}px`;
  previewEl.style.transform = `scale(${scale}) rotate(${totalRotation}deg)`;
  previewEl.style.transformOrigin = 'center center';

  if (widget.get('_ancestor') && widgets.has(widget.get('_ancestor')) && widgets.get(widget.get('_ancestor')).domElement.classList.contains('showCardBack'))
    previewEl.classList.add('showCardBack');

  for (const clone of $a('canvas', previewEl)) {
    const original = $(`canvas[data-id = '${clone.dataset.id}']`, widget.domElement);
    if (original) {
      const context = clone.getContext('2d');
      clone.width = original.width;
      clone.height = original.height;
      context.drawImage(original, 0, 0);
    }
  }
  const originalTextareas = [...$a('textarea', widget.domElement)];
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

  const wrap = previewEl.closest('.contextMenuPreviewWrap');

  const popup = $(`#${CONTEXT_POPUP_ID}`);
  if (popup) {
    const rotationRow = $('.contextMenuRotationRow', popup);
    const buttonsCol = $('.contextMenuButtons', popup);
    const rowH = 40;
    const gap = 8;
    const padding = BORDER_PX;
    const menuForLayout = currentMenu ?? widget.get('contextMenu');
    const hasMenuButtons = Array.isArray(menuForLayout) && menuForLayout.length > 0;
    const buttonsWidth = buttonsCol && hasMenuButtons ? 100 : 0;
    const buttonsHeight = buttonsCol && buttonsCol.offsetHeight ? buttonsCol.offsetHeight : aabbH;
    const contentHeight = Math.max(aabbH, buttonsHeight);
    const bgWidth = aabbW + (buttonsWidth ? buttonsWidth + gap : 0) + padding * 2;
    const bgHeight = (rotationRow && Array.isArray(widget.get('rotationSteps')) && widget.get('rotationSteps').length ? rowH + gap : 0) + contentHeight + padding * 2;
    let bgLeft = Math.round(centerX - aabbW / 2 - padding);
    let bgTop = Math.round(centerY - aabbH / 2 - padding - (rotationRow && Array.isArray(widget.get('rotationSteps')) && widget.get('rotationSteps').length ? rowH + gap : 0));
    const roomArea = $('#roomArea');
    if (roomArea) {
      const room = roomArea.getBoundingClientRect();
      const margin = Math.min(room.width, room.height) * 0.05;
      if (bgLeft < room.left + margin) bgLeft = room.left + margin;
      if (bgLeft + bgWidth > room.right - margin) bgLeft = room.right - margin - bgWidth;
      if (bgTop < room.top + margin) bgTop = room.top + margin;
      if (bgTop + bgHeight > room.bottom - margin) bgTop = room.bottom - margin - bgHeight;
      bgLeft = Math.round(bgLeft);
      bgTop = Math.round(bgTop);
    }
    const bg = $('.contextMenuPopupBg', popup);
    if (bg) {
      bg.style.position = 'fixed';
      bg.style.left = `${bgLeft}px`;
      bg.style.top = `${bgTop}px`;
      bg.style.width = `${bgWidth}px`;
      bg.style.height = `${bgHeight}px`;
      bg.style.padding = `${padding}px`;
      bg.style.boxSizing = 'border-box';
    }
    const contentLeft = padding;
    const contentTop = padding + (rotationRow && Array.isArray(widget.get('rotationSteps')) && widget.get('rotationSteps').length ? rowH + gap : 0);
    if (wrap) {
      wrap.style.position = 'absolute';
      wrap.style.left = `${contentLeft}px`;
      wrap.style.top = `${contentTop}px`;
      wrap.style.width = `${aabbW}px`;
      wrap.style.height = `${aabbH}px`;
    }
    if (rotationRow) {
      rotationRow.style.position = 'absolute';
      rotationRow.style.left = `${contentLeft}px`;
      rotationRow.style.top = `${padding}px`;
      rotationRow.style.width = `${aabbW}px`;
    }
    if (buttonsCol) {
      buttonsCol.style.position = 'absolute';
      buttonsCol.style.left = `${contentLeft + aabbW + gap}px`;
      buttonsCol.style.top = `${contentTop}px`;
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
  rowEl.innerHTML = '';
  if (!Array.isArray(steps) || steps.length === 0) {
    rowEl.style.display = 'none';
    return;
  }
  rowEl.style.display = 'flex';
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
  rowEl.append(leftBtn, rightBtn);
}

function renderContextMenuButtons(widget, colEl) {
  const menu = currentMenu ?? widget.get('contextMenu');
  colEl.innerHTML = '';
  if (!Array.isArray(menu) || menu.length === 0) {
    colEl.style.display = 'none';
    return;
  }
  colEl.style.display = 'flex';
  colEl.style.flexDirection = 'column';
  colEl.style.gap = '4px';
  const popup = ensurePopup();
  const buttonsCol = $('.contextMenuButtons', popup);
  const iconSize = 24;
  for (const item of menu) {
    const hasSubmenu = Array.isArray(item.menu) && item.menu.length > 0;
    const routine = item.routine;
    const routineDef = typeof routine === 'string' ? widget.get(routine) : null;
    const hasRoutine = typeof routine === 'string' && Array.isArray(routineDef);
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
    if (hasSubmenu) {
      btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        currentMenu = item.menu;
        renderContextMenuButtons(widget, buttonsCol);
        requestAnimationFrame(() => { if (currentWidget) positionPopupBackground(currentWidget, popup); });
      };
    } else if (hasRoutine) {
      btn.onclick = async () => {
        batchStart();
        setDeltaCause(`${playerName} context action ${routine} on ${widget.id}`);
        await widget.evaluateRoutine(routine, {}, {});
        batchEnd();
        closeContextMenu();
      };
    }
    colEl.appendChild(btn);
  }
}

function positionPopupBackground(widget, popup) {
  const buttonsCol = $('.contextMenuButtons', popup);
  const bw = buttonsCol && buttonsCol.offsetWidth ? buttonsCol.offsetWidth : 0;
  const bh = buttonsCol && buttonsCol.offsetHeight ? buttonsCol.offsetHeight : 0;
  if (bw <= 0) return;
  const roomScale = getRoomScale();
  const enlarge = widget.get('enlarge') || DEFAULT_ENLARGE;
  const w = widget.get('width');
  const h = widget.get('height');
  const scale = roomScale * enlarge;
  const scaledW = w * scale;
  const scaledH = h * scale;
  const totalRotation = (widget.get('rotation') || 0) + previewRotation;
  const rad = (totalRotation * Math.PI) / 180;
  const aabbW = Math.abs(scaledW * Math.cos(rad)) + Math.abs(scaledH * Math.sin(rad));
  const aabbH = Math.abs(scaledW * Math.sin(rad)) + Math.abs(scaledH * Math.cos(rad));
  const rowH = 40;
  const gap = 8;
  const padding = BORDER_PX;
  const contentHeight = Math.max(aabbH, bh);
  const bgWidth = aabbW + bw + gap + padding * 2;
  const bgHeight = (Array.isArray(widget.get('rotationSteps')) && widget.get('rotationSteps').length ? rowH + gap : 0) + contentHeight + padding * 2;
  const bg = $('.contextMenuPopupBg', popup);
  if (!bg) return;
  let bgLeft = parseFloat(bg.style.left) || 0;
  let bgTop = parseFloat(bg.style.top) || 0;
  const roomArea = $('#roomArea');
  if (roomArea) {
    const room = roomArea.getBoundingClientRect();
    const margin = Math.min(room.width, room.height) * 0.05;
    if (bgLeft < room.left + margin) bgLeft = room.left + margin;
    if (bgLeft + bgWidth > room.right - margin) bgLeft = room.right - margin - bgWidth;
    if (bgTop < room.top + margin) bgTop = room.top + margin;
    if (bgTop + bgHeight > room.bottom - margin) bgTop = room.bottom - margin - bgHeight;
    bgLeft = Math.round(bgLeft);
    bgTop = Math.round(bgTop);
  }
  bg.style.width = `${bgWidth}px`;
  bg.style.height = `${bgHeight}px`;
  bg.style.left = `${bgLeft}px`;
  bg.style.top = `${bgTop}px`;
}

function openContextMenu(widget, menuOverride) {
  currentWidget = widget;
  previewRotation = 0;
  currentMenu = menuOverride !== undefined ? (Array.isArray(menuOverride) ? menuOverride : []) : (widget.get('contextMenu') || []);
  const popup = ensurePopup();
  const previewEl = $(`#${CONTEXT_PREVIEW_ID}`);
  const rotationRow = $('.contextMenuRotationRow', popup);
  const buttonsCol = $('.contextMenuButtons', popup);

  copyWidgetToPreview(widget, previewEl);
  renderRotationButtons(widget, rotationRow);
  renderContextMenuButtons(widget, buttonsCol);

  popup.classList.remove('hidden');

  requestAnimationFrame(() => {
    if (!currentWidget || currentWidget !== widget) return;
    positionPopupBackground(widget, popup);
  });
}

export function openContextMenuWithMenu(widget, menu) {
  if (!widget || !Array.isArray(menu)) return;
  openContextMenu(widget, menu);
}

export function closeContextMenu() {
  currentWidget = null;
  currentMenu = null;
  touchActive = false;
  rightClickActive = false;
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
      if (!currentWidget || !hasButtons(currentWidget)) closeContextMenu();
    }
  };
  document.addEventListener('mousemove', mouseMoveBound);
  document.addEventListener('mouseup', mouseUpBound);
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
      if (!currentWidget || !hasButtons(currentWidget))
        closeContextMenu();
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
  if (currentWidget && !hasButtons(currentWidget))
    closeContextMenu();
  touchActive = false;
  if (touchMoveBound) {
    document.removeEventListener('touchmove', touchMoveBound);
    touchMoveBound = null;
  }
}

onLoad(function() {
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
    if (!popup || popup.classList.contains('hidden')) return;
    if (!popup.contains(e.target)) {
      closeContextMenu();
      return;
    }
    if (!e.target.closest('.contextMenuPopupBg'))
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
