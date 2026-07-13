import { mockConnection } from '../../client/js/connection.js';

window.config = {}
mockConnection();

// bundle-globals from main.js that other modules reference without importing
window.edit = false;
window.scale = 1;
window.roomRectangle = { left: 0, top: 0, width: 0, height: 0 };
window.widgetFilter = () => [];

document.body.insertAdjacentHTML('beforeend', '<div id="roomArea"> <div id="room"> <div id="topSurface" class="surface"></div> </div></div> <div id="debugButtonOverlay"><pre id="debugButtonOutput"></pre></div> <div id="enlarged"></div> <div id="zoomAnchor"><div id="zoomControls" class="hidden"><input id="zoomSlider" type="range" min="10" max="50" value="10" step="1"><input id="enableUserZoom" type="checkbox"><input id="allowGameZoomControl" type="checkbox"><span id="zoomOverrideMsg" style="display:none;"></span></div><button id="zoom2xButton" class="toolbarButton"><span class="tooltip"></span></button></div>');

//Check & set envvar to ensure it's only registered once.
if (!process.env.UNHANDLED_REJECTION_INITIALIZED) {
  process.on('unhandledRejection', reason => {
    throw(reason);
  })
  process.env.UNHANDLED_REJECTION_INITIALIZED = true
}
