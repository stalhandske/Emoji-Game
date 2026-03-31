---
name: playtest
description: Open the Desert Golf game in a headless browser and test the most recently changed features
disable-model-invocation: true
---

Playtest the Desert Golf game by writing and running a focused Playwright script.

## Setup

- File: `file://<absolute-path-to>/index.html`
- Node: `NODE_PATH=/opt/node22/lib/node_modules node <script>`
- Playwright is available at `/opt/node22/lib/node_modules/playwright`

## What to do

1. Check `git log --oneline -5` and `git diff HEAD~1 HEAD --stat` to identify what changed most recently.

2. Write a short Playwright script (inline, don't save to disk) that:
   - Launches Chromium headless, opens the game, waits 400ms for init
   - Captures any page errors via `page.on('pageerror', ...)`
   - Tests the specific features that changed — use `window.__golf.*` helpers:
     - `fullreset()`, `usebaselevel()`, `resetgame()`
     - `setball({x,y,vx,vy})`, `getball()`, `step()`, `stepAll()`
     - `setzombie(...)`, `getzombie()`, `getzombies()`
     - `getwizard()` → `{x, y, walking}`
     - `getstate()` → `{won, gameLost}`
     - `triggerWin()`, `getround()`
     - `setparam(key, val)`, `shootball(vx, vy)`, `getballage()`
   - Checks UI elements exist (buttons, panels) with `page.$('#id')`
   - Takes a screenshot saved to `/tmp/playtest.png` for visual confirmation

3. Run the script with:
   `NODE_PATH=/opt/node22/lib/node_modules node -e "<script>"`

4. Report:
   - Any page errors
   - Which features passed / failed
   - What the screenshot shows (describe it from the file)
   - Any bugs found, with suggested fixes
