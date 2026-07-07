// preload.js — the guarded doorway between the UI (renderer) and Node (main).
//
// The renderer runs like a web page and can't touch Node directly (that would
// be unsafe). Here we expose a tiny, explicit `window.api` with just the calls
// the UI needs. Everything else stays locked away.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ---- request/response (renderer asks, main answers) ----
  getState: () => ipcRenderer.invoke('state:get'),
  addMonitor: (monitor) => ipcRenderer.invoke('monitor:add', monitor),
  removeMonitor: (id) => ipcRenderer.invoke('monitor:remove', id),
  startSwarm: (storyId) => ipcRenderer.invoke('swarm:start', storyId),

  // ---- push (main tells the renderer something happened) ----
  onFeedNew: (cb) => ipcRenderer.on('feed:new', (_e, data) => cb(data)),
  onMonitorStatus: (cb) =>
    ipcRenderer.on('monitor:status', (_e, data) => cb(data)),
  onSwarmEvent: (cb) => ipcRenderer.on('swarm:event', (_e, data) => cb(data)),
});
