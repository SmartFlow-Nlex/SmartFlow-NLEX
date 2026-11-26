const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  version: process.versions.electron,
});

// A file dragged in from Explorer and dropped on the window makes Chromium open that file in place of the app.
// main.js refuses that navigation (will-navigate); this stops it one step earlier, so the drop does nothing.
// Only drags that carry files are touched: the sandbox's own drag-and-drop (scenario cards onto the road) carries
// no files and keeps working, and these listeners sit on window, after the page's own handlers have run.
const carriesFiles = (event) => !!event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files');
window.addEventListener('dragover', (event) => { if (carriesFiles(event)) event.preventDefault(); });
window.addEventListener('drop', (event) => { if (carriesFiles(event)) event.preventDefault(); });
