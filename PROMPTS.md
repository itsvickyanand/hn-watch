# Prompts & Process

## Coding agent

Built with **Claude Code** (Claude Opus), Anthropic's agentic coding assistant.

A nice bit of recursion: the app *itself* uses `claude -p` (Claude Code in
headless mode) as its runtime for both the scheduled monitors and the on-demand
research swarm — so Claude Code both **wrote** this app and **runs inside** it.

## How I worked with it

I drove the build through a sequence of decisions and questions rather than one
big "build me X" prompt — choosing the stack, pressure-testing the architecture
(background behaviour, API load at scale, brief compliance), then iterating on
UX. The agent scaffolded the code, explained each module, and debugged real
environment issues along the way.

The prompts below are the substantive ones, lightly edited for clarity. The full
unedited history lives in the git commit log.

---

### 1. Stack decision

> I'm strongest in JS / React / Node. Can this be built on that stack instead of
> Tauri + Rust, or is Rust genuinely necessary here? Walk me through the
> trade-off.

→ Chose **Electron + Node.js** to match my skills; the agent flagged the
deviation from the brief and documented it in the README. The Node main process
plays the exact role the brief assigns to the Rust layer.

### 2. Build

> Let's build it. Scaffold the whole app and walk me through each part as you go.

→ Produced the full architecture: the `claude -p` runner + shared concurrency
queue (`src/claude.js`), the monitor scheduler (`src/monitors.js`), the swarm
orchestrator (`src/swarm.js`), JSON persistence (`src/store.js`), HN fetching
(`src/hn.js`), tray + notifications (`main.js`), and the UI (`renderer/`).

### 3. Debugging the first run

> The monitors show an error on every tick — figure out why and fix it.

→ Found two real issues: (a) the **CLI `claude` wasn't logged in** (separate from
the desktop Claude app) — fixed with `claude auth login`; (b) a **queue bug**
where `execJob` returned `undefined`, so `pump().finally()` crashed every call.
Fixed by making it return a promise.

### 4. Architecture — background behaviour

> If I quit the app, do the monitors keep running in the background, or stop?

→ Clarified the model: **closing the window** keeps monitors ticking in the tray;
**quitting** fully stops them (state persists and resumes on relaunch).

### 5. Architecture — API load at scale

> If there are 50 monitors scheduled at different times, does each tick hit the
> Hacker News API separately?

> Let's fix that: fetch HN once and cache it for 5 minutes. Any monitor that
> ticks within that window reuses the cache with zero API calls; only fetch again
> if the cache is older than 5 minutes.

→ Added a **shared 5-minute cache with request coalescing** (`src/hn.js`): 50
monitors now cause ~1 API call per 5 minutes instead of 50. Verified with a test
(50 concurrent ticks → 1 call).

### 6. Brief-compliance audit

> Audit our implementation against every point of the brief — no code changes.
> For each requirement, tell me the file and lines where it's implemented so I
> can explain the code alongside the feature.

→ Produced a point-by-point mapping of each brief requirement to its file and
line numbers.

### 7. UX iteration

> New monitors and new feed items should appear at the top of their lists. Add a
> UI to configure the "dig deeper" research angles. And notifications aren't
> firing — investigate.

→ Newest-first ordering; a settings modal to toggle / edit / add swarm angles
(persisted); diagnosed macOS notification permissions for unpackaged Electron.

> Add readable timestamps to both the feed items and the monitors.

→ Relative times ("5m ago") with full-date tooltips, auto-refreshing every 60s.

### 8. Quit behaviour

> When I quit the app it doesn't actually close.

→ ⌘Q / menu-quit was only hiding the window. Fixed with an app `before-quit`
handler so every quit path fully exits.

---

## What the agent handled end-to-end

- Full architecture and all code
- The shared concurrency queue — the brief's core "one-per-tick vs many-at-once"
  challenge
- Real environment debugging: CLI auth, a promise bug, macOS tray &
  notifications, multi-account SSH/git
- Git hygiene, README, DEMO.md, and this file
