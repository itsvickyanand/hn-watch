# HN Watch

A small desktop app that watches Hacker News for topics you describe in plain
English. You create **monitors** ("AI-agent startup launches", "Rust async
runtime discussions"); each one runs on a schedule, asks **Claude Code**
(`claude -p`) which recent stories match, and drops the matches into a single
feed. Every feed item has a **Dig deeper** button that fans out a small swarm of
parallel `claude -p` agents to research the story from several angles and
compile one combined brief.

> **Note on the stack.** The original brief specified **Tauri + a Rust backend**.
> This implementation uses **Electron + Node.js** instead, by request — the
> Node "main process" plays the exact role the brief assigned to the Rust layer
> (schedulers, running `claude -p`, tray, notifications, persistence). Every
> other design decision below follows the brief.

---

## Run it

```bash
# 1. install
npm install

# 2. (one time) generate the tray icon
node scripts/gen-icon.js

# 3. log in to Claude Code so `claude -p` works (one time)
claude          # then run /login, or set an API key

# 4. start
npm start
```

Requirements: **Node 18+**, and **Claude Code** installed and logged in
(`claude --version` should work). If Claude isn't logged in, the app still runs
but shows "Not logged in · Please run /login" where results would appear.

### Try it
1. In the left panel, type something you care about (e.g. `AI startups`), set an
   interval, click **Add monitor**. It runs once immediately.
2. Matches appear in the feed; a native notification fires.
3. Click **Dig deeper** on any item to launch the research swarm.
4. Close the window — the app keeps running in the menu-bar tray. Reopen from
   the tray icon. Quit from the tray menu.

---

## How it works

```
renderer/ (UI, plain HTML/CSS/JS)        ← the window: form, feed, swarm view
      │  window.api  (preload.js bridge)
      ▼
main.js (Electron main = "the Rust layer")
      ├─ src/store.js      JSON-file persistence (monitors, feed, seen ids)
      ├─ src/hn.js         fetch recent stories (Algolia HN Search API)
      ├─ src/monitors.js   scheduler: one `claude -p` call per tick
      ├─ src/swarm.js      orchestrator: many `claude -p` calls at once
      └─ src/claude.js     the ONLY place that spawns `claude -p` + a queue
```

### The two workloads share one gate
The whole point of the exercise is that monitors and the swarm hit the same
runtime very differently:

- **Monitors** — *one* `claude -p` call every few minutes. Calm and steady.
- **Swarm** — *several* `claude -p` calls fired at the same instant. Bursty.

Both go through a single function, `runClaude()` in `src/claude.js`, which holds
a **concurrency queue** (`MAX_CONCURRENT = 3`). No matter how many monitors tick
or how big a swarm is, at most 3 `claude` processes ever run at once; the rest
wait in a FIFO line. This one gate is what keeps a burst from starving the
steady work (or melting the laptop). Raising throughput is a one-line change.

### Judging & summarising (monitors)
Each tick: fetch ~30 recent stories → drop any we've already seen → send the
survivors plus the user's prompt to `claude -p --output-format json` → parse the
JSON list of `{hnId, summary}` picks → save and notify. Sending only unseen
stories keeps prompts small and cheap.

### The swarm (dig deeper)
`src/swarm.js` launches one streaming agent per angle (What/who, Landscape,
Skeptic, Why-it-matters) using `--output-format stream-json`. Their text streams
to the live view as it arrives. When all finish, one more `claude -p` call
synthesises the notes into a single brief.

### Persistence & de-duplication
Everything lives in one JSON file in Electron's per-user data directory
(`hn-watch-data.json`): monitors, the feed, and a `seenHnIds` list. On launch we
load it and resume every monitor's schedule, so monitors and their feed survive
a restart. De-dup is a membership check against `seenHnIds` before anything is
added to the feed.

### Tray & notifications
Closing the window hides it instead of quitting (`win.on('close')`), so monitors
keep ticking in the background. The tray menu reopens the window or quits for
real. New matches fire a native `Notification`.

---

## Trade-offs & things deliberately stubbed

- **Electron instead of Tauri/Rust** — chosen for this build; see note at top.
- **JSON file instead of SQLite/Postgres** — the data is tiny and local; a file
  is the simplest thing that satisfies "persisted locally, survives restart".
  Swapping in SQLite would be a `store.js`-only change.
- **Swarm agents reason over the provided story context, no live web tools** —
  keeps every call non-interactive, fast, and deterministic for a demo. Giving
  agents real research power is one flag away: add
  `--allowedTools WebSearch --permission-mode bypassPermissions` in
  `src/claude.js`. Trade-off: slower, less predictable, needs permission
  handling.
- **`seenHnIds` grows unbounded** — fine for a weekend app; a real one would cap
  or age it out.
- **Fixed set of swarm angles** — defined in `src/swarm.js`; the swarm size just
  follows that list.
- **Errors surface in the UI rather than retrying** — e.g. a not-logged-in
  Claude shows its message instead of silent failure.

## Layout
```
main.js            Electron main process (tray, notifications, IPC, wiring)
preload.js         safe window.api bridge
src/store.js       persistence + de-dup
src/hn.js          Hacker News fetch
src/claude.js      claude -p runner + shared concurrency queue
src/monitors.js    scheduler (one call per tick)
src/swarm.js       dig-deeper orchestrator (many calls at once)
renderer/          UI (index.html, styles.css, app.js)
scripts/gen-icon.js  generates the tray icon
```
