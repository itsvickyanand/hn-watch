// monitors.js — the scheduler. Turns each saved monitor into a repeating timer.
//
// On every "tick" it:
//   1. fetches recent HN stories
//   2. asks `claude -p` which ones match the user's plain-English prompt
//   3. saves the new matches (de-duplicated) and announces them
//
// It emits events so main.js can fire notifications and update the UI:
//   'items'  -> { monitorId, items }   new feed items were added
//   'status' -> { monitorId, state, message }   'running' | 'idle' | 'error'

const { EventEmitter } = require('events');
const store = require('./store');
const { getRecentStories } = require('./hn');
const { runClaude } = require('./claude');

class MonitorManager extends EventEmitter {
  constructor() {
    super();
    this.timers = new Map(); // monitorId -> setInterval handle
  }

  // Start timers for every saved monitor (called at app launch).
  startAll() {
    for (const m of store.getState().monitors) this.start(m);
  }

  start(monitor) {
    this.stop(monitor.id); // avoid duplicate timers
    const everyMs = Math.max(1, monitor.intervalMinutes) * 60 * 1000;
    // Run once now so the user sees results without waiting a full interval...
    this.runTick(monitor.id);
    // ...then on the chosen schedule.
    const handle = setInterval(() => this.runTick(monitor.id), everyMs);
    this.timers.set(monitor.id, handle);
  }

  stop(id) {
    const handle = this.timers.get(id);
    if (handle) clearInterval(handle);
    this.timers.delete(id);
  }

  stopAll() {
    for (const id of this.timers.keys()) this.stop(id);
  }

  async runTick(monitorId) {
    // Re-read the monitor each tick in case it was edited/removed.
    const monitor = store.getState().monitors.find((m) => m.id === monitorId);
    if (!monitor) return this.stop(monitorId);

    this.emit('status', { monitorId, state: 'running' });
    try {
      // Shared 5-minute cache: monitors ticking within the window reuse one
      // fetch, so API calls stay flat no matter how many monitors there are.
      const stories = await getRecentStories(30);

      // Only bother Claude with stories we haven't already filed away.
      const unseen = stories.filter((s) => store.isNew(s.hnId));
      if (unseen.length === 0) {
        store.updateMonitor(monitorId, { lastRunAt: Date.now() });
        return this.emit('status', { monitorId, state: 'idle' });
      }

      const matches = await judge(monitor.prompt, unseen);

      // Turn Claude's picks into feed items.
      const items = matches
        .map((match) => {
          const story = unseen.find((s) => s.hnId === match.hnId);
          if (!story) return null;
          return {
            id: `${monitorId}-${story.hnId}`,
            monitorId,
            hnId: story.hnId,
            title: story.title,
            url: story.url,
            points: story.points,
            comments: story.comments,
            summary: match.summary || '',
            seenAt: Date.now(),
          };
        })
        .filter(Boolean);

      const fresh = store.addFeedItems(items);
      store.updateMonitor(monitorId, { lastRunAt: Date.now() });

      if (fresh.length) this.emit('items', { monitorId, items: fresh });
      this.emit('status', { monitorId, state: 'idle' });
    } catch (err) {
      this.emit('status', { monitorId, state: 'error', message: err.message });
    }
  }
}

// Ask Claude to judge relevance and summarise. Returns [{ hnId, summary }].
async function judge(userPrompt, stories) {
  const list = stories
    .map((s) => `${s.hnId}: ${s.title} (${s.points} pts) — ${s.url}`)
    .join('\n');

  const prompt = `You are filtering Hacker News stories for a user.

The user cares about: "${userPrompt}"

Here are recent stories as "id: title":
${list}

Return ONLY a JSON array of the stories that genuinely match what the user
cares about. Each element must be {"hnId": <number>, "summary": "<why it's
relevant, max 12 words>"}. If nothing matches, return []. No prose, JSON only.`;

  // Haiku: this is fast headline classification, not deep reasoning — the model
  // choice here is the single biggest lever on how quickly the feed fills.
  const raw = await runClaude(prompt, { model: 'haiku' });
  return parseJsonArray(raw);
}

// Claude sometimes wraps JSON in ```fences``` or adds a stray sentence.
// Pull out the first [...] block and parse it defensively.
function parseJsonArray(text) {
  if (!text) return [];
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

module.exports = { MonitorManager };
