// demo-seed.js — reset HN Watch to a clean, demo-friendly state.
//
// Writes three broad monitors (which reliably get matches on any HN front page)
// and an empty feed, so when you launch the app they tick immediately and fill
// the feed live in front of your audience.
//
// Usage (with the app NOT running):
//   node scripts/demo-seed.js
//
// It only touches the app's data file; your code is untouched.

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mirror Electron's app.getPath('userData') for name "hn-watch" on each OS.
function userDataDir() {
  if (process.platform === 'darwin')
    return path.join(os.homedir(), 'Library', 'Application Support', 'hn-watch');
  if (process.platform === 'win32')
    return path.join(process.env.APPDATA || os.homedir(), 'hn-watch');
  return path.join(os.homedir(), '.config', 'hn-watch');
}

const now = Date.now();
const data = {
  monitors: [
    {
      id: 'mon-demo-ai',
      prompt: 'AI, LLMs, and machine learning',
      intervalMinutes: 30,
      createdAt: now,
      lastRunAt: null,
    },
    {
      id: 'mon-demo-dev',
      prompt: 'programming languages and developer tools',
      intervalMinutes: 30,
      createdAt: now,
      lastRunAt: null,
    },
    {
      id: 'mon-demo-show',
      prompt: 'Show HN startup and product launches',
      intervalMinutes: 30,
      createdAt: now,
      lastRunAt: null,
    },
  ],
  feed: [],
  seenHnIds: [],
};

const dir = userDataDir();
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'hn-watch-data.json');
fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('Seeded demo state at:', file);
console.log('Monitors:', data.monitors.map((m) => m.prompt).join(' | '));
console.log('Now run:  npm start');
