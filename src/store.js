// store.js — the world's simplest database: one JSON file on disk.
//
// A desktop app doesn't need Postgres/Mongo. We just keep everything in memory
// and write it to a file so it survives an app restart ("persisted locally").
//
// Shape of the data:
//   {
//     monitors: [ { id, prompt, intervalMinutes, createdAt, lastRunAt } ],
//     feed:     [ { id, monitorId, hnId, title, url, summary, points, seenAt } ],
//     seenHnIds: [ 123, 456 ]   // for de-duplication
//   }

const fs = require('fs');
const path = require('path');

let filePath = null;
let data = { monitors: [], feed: [], seenHnIds: [] };

// Called once at startup with Electron's per-user data directory.
function init(userDataDir) {
  filePath = path.join(userDataDir, 'hn-watch-data.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    data = JSON.parse(raw);
    // Make sure all keys exist even if the file is from an older version.
    data.monitors ??= [];
    data.feed ??= [];
    data.seenHnIds ??= [];
  } catch {
    // File doesn't exist yet (first launch) — start empty and create it.
    save();
  }
  return data;
}

// Write the whole thing to disk. Small data, so rewriting the file is fine.
function save() {
  if (!filePath) return;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getState() {
  return data;
}

// ---- monitors ----
function addMonitor(monitor) {
  data.monitors.push(monitor);
  save();
  return monitor;
}

function removeMonitor(id) {
  data.monitors = data.monitors.filter((m) => m.id !== id);
  // Also drop that monitor's feed items to keep things tidy.
  data.feed = data.feed.filter((item) => item.monitorId !== id);
  save();
}

function updateMonitor(id, patch) {
  const m = data.monitors.find((m) => m.id === id);
  if (m) Object.assign(m, patch);
  save();
}

// ---- feed + de-duplication ----
// Returns true if we've never seen this Hacker News story before.
function isNew(hnId) {
  return !data.seenHnIds.includes(hnId);
}

function markSeen(hnId) {
  if (!data.seenHnIds.includes(hnId)) data.seenHnIds.push(hnId);
}

// Add matched items to the top of the feed. Skips anything already seen.
// Returns only the items that were actually new (so the caller can notify).
function addFeedItems(items) {
  const fresh = items.filter((item) => isNew(item.hnId));
  for (const item of fresh) {
    markSeen(item.hnId);
    data.feed.unshift(item); // unshift = add to the front (newest first)
  }
  if (fresh.length) save();
  return fresh;
}

module.exports = {
  init,
  save,
  getState,
  addMonitor,
  removeMonitor,
  updateMonitor,
  isNew,
  markSeen,
  addFeedItems,
};
