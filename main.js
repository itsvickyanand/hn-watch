// main.js — the Electron "backend". This is our stand-in for the brief's
// "Rust layer": it owns the window, the system tray, notifications, local
// persistence, the monitor scheduler, and the swarm orchestrator.

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  ipcMain,
  nativeImage,
} = require('electron');
const path = require('path');

const store = require('./src/store');
const { MonitorManager } = require('./src/monitors');
const { SwarmManager, ANGLES } = require('./src/swarm');

// Set a real app name so native notifications are attributed to "HN Watch"
// (otherwise macOS labels them "Electron").
app.setName('HN Watch');

let win = null;
let tray = null;
let isQuitting = false;

const monitors = new MonitorManager();
const swarms = new SwarmManager();

// Only one copy of the app at a time; a second launch just focuses the first.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(start);
}

function start() {
  store.init(app.getPath('userData')); // load saved monitors + feed
  createWindow();
  createTray();
  wireManagers();
  monitors.startAll(); // resume every saved monitor's schedule

  // macOS: clicking the dock icon reopens the window.
  app.on('activate', showWindow);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1040,
    height: 720,
    title: 'HN Watch',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // keep the renderer sandboxed
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Closing the window HIDES it instead of quitting — the app keeps watching
  // in the tray. Real quit only happens from the tray menu.
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, 'assets', 'trayTemplate.png')
  );
  icon.setTemplateImage(true); // macOS recolors it to match the menu bar
  tray = new Tray(icon);
  tray.setToolTip('HN Watch');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open HN Watch', click: showWindow },
      {
        label: 'Send test notification',
        click: () =>
          new Notification({
            title: 'HN Watch',
            body: 'Notifications are working ✅',
          }).show(),
      },
      { type: 'separator' },
      {
        label: 'Quit HN Watch',
        accelerator: 'Command+Q',
        click: () => app.quit(), // before-quit sets the flag + stops monitors
      },
    ])
  );
  tray.on('click', showWindow);
}

function showWindow() {
  if (!win) return createWindow();
  win.show();
  win.focus();
}

// Send an event to the UI if the window exists.
function toRenderer(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function wireManagers() {
  // Monitors -> UI + native notifications
  monitors.on('items', ({ monitorId, items }) => {
    toRenderer('feed:new', { monitorId, items });
    notify(items);
  });
  monitors.on('status', (status) => toRenderer('monitor:status', status));

  // Swarm -> UI (one channel carries every swarm event type)
  for (const type of ['agent-start', 'agent-chunk', 'agent-done', 'brief', 'error']) {
    swarms.on(type, (payload) => toRenderer('swarm:event', { type, ...payload }));
  }
}

function notify(items) {
  if (!Notification.isSupported() || items.length === 0) return;
  const title =
    items.length === 1 ? 'New match on HN Watch' : `${items.length} new matches`;
  const body = items[0].title;
  const n = new Notification({ title, body });
  n.on('click', showWindow);
  n.show();
}

// ---------- IPC: the UI calls these ----------

ipcMain.handle('state:get', () => {
  const s = store.getState();
  return { monitors: s.monitors, feed: s.feed };
});

ipcMain.handle('monitor:add', (_e, { prompt, intervalMinutes }) => {
  const monitor = {
    id: `mon-${Date.now()}`,
    prompt: String(prompt || '').trim(),
    intervalMinutes: Math.max(1, Number(intervalMinutes) || 30),
    createdAt: Date.now(),
    lastRunAt: null,
  };
  store.addMonitor(monitor);
  monitors.start(monitor); // begin ticking immediately
  return monitor;
});

ipcMain.handle('monitor:remove', (_e, id) => {
  monitors.stop(id);
  store.removeMonitor(id);
  return { ok: true };
});

ipcMain.handle('swarm:start', (_e, storyId) => {
  const story = store.getState().feed.find((f) => f.id === storyId);
  if (!story) return { error: 'story not found' };
  // Use the user's configured angles (enabled ones only); falls back to
  // defaults inside swarms.start() if none are configured.
  const cfg = store.getSwarmConfig();
  const angles = cfg?.angles?.filter((a) => a.enabled);
  return swarms.start(story, angles); // returns { swarmId, angles }
});

// Read the current dig-deeper config (or the built-in defaults, all enabled).
ipcMain.handle('swarm:getConfig', () => {
  return (
    store.getSwarmConfig() || {
      angles: ANGLES.map((a) => ({ ...a, enabled: true })),
    }
  );
});
ipcMain.handle('swarm:setConfig', (_e, cfg) => store.setSwarmConfig(cfg));

// We manage quitting ourselves via the tray, so don't auto-quit on close.
app.on('window-all-closed', () => {
  /* keep running in the tray */
});

// Any real quit path — ⌘Q, the app menu, or the tray's Quit — fires this first.
// Setting the flag here lets the window's 'close' handler actually close
// (instead of hiding), so the app fully exits no matter how you quit it.
app.on('before-quit', () => {
  isQuitting = true;
  monitors.stopAll();
});
