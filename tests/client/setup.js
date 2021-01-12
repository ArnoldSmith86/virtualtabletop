import { mockConnection } from '../../client/js/connection.js';

mockConnection();

document.body.insertAdjacentHTML('beforeend', '<div id="roomArea"> <div id="room"> <div id="topSurface" class="surface"></div> </div></div> <div id="debugButtonOverlay"><pre id="debugButtonOutput"></pre></div> <div id="enlarged"></div>');

//Check & set envvar to ensure it's only registered once.
if (!process.env.UNHANDLED_REJECTION_INITIALIZED) {
  process.on('unhandledRejection', reason => {
    throw(reason);
  })
  process.env.UNHANDLED_REJECTION_INITIALIZED = true
}
