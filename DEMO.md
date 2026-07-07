# HN Watch — Demo Script

A ~5-minute walkthrough that shows every feature. Verified working end-to-end.

## 0. Before the demo (one-time setup)

```bash
# make sure the CLI Claude is logged in (separate from the desktop app!)
claude auth status          # must say "loggedIn": true
echo "say PONG" | claude -p # must print: PONG

# from the project folder
cd ~/Desktop/projects/internalv1
npm install                 # if not already
```

To start from a clean, populated state (recommended for a live audience):

```bash
node scripts/demo-seed.js   # writes 3 broad monitors, empty feed
npm start
```

The three seeded monitors ("AI/LLMs", "developer tools", "Show HN launches")
reliably match stories on any HN front page, so the feed fills within seconds.

---

## 1. The pitch (10 seconds)

> "HN Watch is a quiet robot that reads Hacker News for you. You describe what
> you care about in plain English; it checks HN on a schedule, asks Claude which
> stories match, and drops them into a feed — and you can send a swarm of Claude
> agents to research any story in depth."

---

## 2. Create a monitor (live)

1. In the left panel, type a prompt, e.g. **`Rust and systems programming`**.
2. Set **Check every** to `30` minutes.
3. Click **Add monitor**.

> "It runs once immediately — no waiting for the first interval."

Within a few seconds, matching stories appear in the feed. Point out:
- Each card has a **colored badge** naming the monitor that caught it.
- The sidebar shows a **matching swatch** and an **"N in feed"** count.

---

## 3. Show the feed (the "one call per tick" workload)

> "Each monitor is a background worker. On every tick it pulls ~30 recent HN
> stories, sends the ones we haven't seen — plus your prompt — to `claude -p`,
> and Claude returns just the matches with a one-line summary. New items are
> de-duplicated so nothing repeats."

---

## 4. Dig deeper — the swarm (the "many at once" workload)

1. Click **Dig deeper** on any feed item.
2. A modal opens with **4 agents** running **in parallel**, each a different
   angle: *What & who*, *Landscape*, *Skeptic*, *Why it matters*.
3. Watch their text **stream in live**.
4. When all finish, a final **combined brief** appears at the bottom.

> "This is the same `claude -p` runtime as the monitors, but hit very
> differently — four calls fired at once instead of one on a timer."

---

## 5. The key design point (say this out loud)

> "Both workloads — the calm monitor ticks and the bursty swarm — go through
> ONE shared concurrency queue in `src/claude.js`. At most 3 `claude` processes
> ever run at once; the rest wait in line. So a swarm burst can't starve the
> monitors or overwhelm the machine. That single gate is the answer to the
> 'one-per-tick vs many-at-once' question."

Optionally open `src/claude.js` and show `MAX_CONCURRENT` + the `pump()` queue.

---

## 6. Persistence, tray & notifications

1. **Close the window** (the red button). The app keeps running — point to the
   **tray icon** in the menu bar.
2. Reopen it from the tray icon → the feed and monitors are still there.
3. Mention: new matches fire a **native notification**; everything is saved to a
   local JSON file, so it all survives a full restart.

> "Close it, quit it, reopen it — the monitors and their feed persist."

Quit for real from the **tray menu → Quit**.

---

## 7. Wrap (trade-offs — good to volunteer)

- Built with **Electron + Node** (the original brief said Tauri + Rust); the Node
  main process plays the exact role the brief gave the Rust layer.
- Storage is a **JSON file** — smallest thing that satisfies "persist locally".
- Swarm agents **reason over the story context**; enabling live web tools is a
  one-flag change in `src/claude.js`.

See `README.md` for the full design write-up.

---

## Reset between demos

```bash
# quit the app first (tray → Quit), then:
node scripts/demo-seed.js && npm start
```
