# Prompts & Process

## Coding agent used

**Claude Code** (Claude Opus) — Anthropic's agentic CLI/IDE coding assistant —
was used to design, build, debug, and iterate on this app.

Note the nice recursion: the app *itself* uses `claude -p` (Claude Code in
headless mode) as its runtime for both the monitors and the research swarm. So
Claude Code both **wrote** the app and **runs inside** it.

The prompts below are the actual messages I sent the agent, in order, kept close
to verbatim (typos and all) so the process is transparent.

---

## 1 — Understanding the brief

> first simplify this *(pasted the full HN Watch brief)*

> i am not understanding it simplyfy further

> what is the swarm thing

> i want to understand each line and its meaning *(pasted the brief again)*

> not like this each line simplified

> this is better but add meaning to terms such as tauri hn watch etc

## 2 — Tech-stack decision

> got it now lets start to build it but want to know if it can be done using my
> current knowledge of js react next node express postgres mongodb etc — is rust
> really necessary

*(Chose Electron + Node.js over Tauri + Rust to match my existing skills. The
agent flagged this deviates from the brief and documented it in the README.)*

## 3 — Build

*(The agent scaffolded the whole app from this decision: Electron main process,
the `claude -p` runner + shared concurrency queue, the monitor scheduler, the
swarm orchestrator, JSON persistence, tray, notifications, and the UI. Built
incrementally with explanations of each file.)*

## 4 — Git & auth setup

> git@github.com:itsvickyanand/hn-watch.git push to this repository — i have
> logged in from the terminal as well check that

> use personal

> do you need claude api key

> so we are all set

## 5 — Debugging the first run

> i ran it but again the same issue *(with screenshots showing "error" monitors)*

> quit the hn watch and rerun

*(Diagnosed two real issues: (a) the CLI `claude` wasn't logged in — separate
from the desktop Claude app's login; fixed with `claude auth login`; (b) a queue
bug where `execJob` didn't return a promise, crashing every `claude -p` call.)*

> Login successful.

## 6 — Review & polish

> perfect what we created so far give me point wise

> map the feeds to the monitor — as of now its hard to identify which feed
> belongs to which monitor

> prepare a demo

> where is the tray on my mac i dont know

> when i am quitting the app the app doesn't close

*(Fixed: ⌘Q/menu-quit now fully exits via an app `before-quit` handler, not just
the tray button.)*

## 7 — Architecture questions

> so if i quit will the monitors and schedules finish or run in the background

> i want to know if there are 50 monitors all scheduled at different times will
> the fetching happen from api for each call

> yes lets do that — fetch HN api and cache for 5 minutes and fuel all the
> monitors if they fall in that 5 minute zone with no api calls; if no fresh api
> call in last 5 minutes just fetch again for the monitor

*(Added a shared 5-minute HN cache with request coalescing so N monitors cause
~1 API call per 5 min instead of N.)*

## 8 — Brief compliance audit

> check each point of this and tell me if our app stands upon this or not — no
> code changes please — let me know the file and code where its done each
> functionality as i want to explain the code along with the feature

*(Produced a point-by-point mapping of the brief to files/line numbers.)*

## 9 — Feature requests

> when new monitor is added add on the top of list not at the bottom — also same
> with the feeds — also give ui options to change the dig deeper configs — also
> i am not getting notifications

> i tried send test notification but did not work

*(Diagnosed macOS notification permissions for unpackaged Electron dev apps.)*

> date time still did not appear, notification is fixed

> add time and date in the most readable format of the post and the monitor as
> well

*(Added relative timestamps — "5m ago" — with full-date tooltips, auto-refresh
every 60s.)*

---

## What the agent handled end-to-end

- Full app architecture and all code (Electron main, `src/*`, renderer)
- The shared concurrency queue — the brief's core "one-per-tick vs many-at-once"
  challenge
- Debugging real environment issues (CLI auth, a promise bug, macOS tray &
  notifications, SSH multi-account git)
- Git hygiene (personal identity, correct SSH key, commits & pushes)
- README, DEMO.md, and this file
