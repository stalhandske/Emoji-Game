# Desert Golf — Project Guide

## Overview

A desert-themed golf roguelike written as a **single HTML file** (`index.html`).
No build step, no dependencies — open in a browser and play.
Canvas size: 360×648 px. Designed for vertical mobile (iPhone 13).

## Running tests

```bash
node tests/physics.test.js
```

Requires Playwright v1.56.0 (pinned in `package.json`) with the cached Chromium at
`/root/.cache/ms-playwright/chromium-1194/`. All 111 tests must pass before deploying.

## Deploying

Push to `main`:
```bash
git push origin <branch>:main
```

The working feature branch is `claude/desert-golf-prototype-olqy6`.

---

## Architecture

Everything lives in `index.html` — one `<script>` block, no modules.

### Grid constants
| Constant | Value | Meaning |
|----------|-------|---------|
| `T` | 36 | Tile size in px |
| `COLS` | 10 | Level width in tiles |
| `ROWS` | 18 | Level height in tiles |
| `SAND` | 0 | Passable tile |
| `ROCK` | 1 | Solid tile |
| `BALL_R` | 8 | Ball radius (px) |

Canvas is `COLS*T × ROWS*T` = 360×648 px.

### Key positions
- **Tee** (ball start): `(2.5*T, 15.5*T)` = (90, 558) — bottom-left area
- **Hole**: `(7.5*T, 2.5*T)` = (270, 90) — top-right area

### BASE_LEVEL rock layout
Interior rock pairs (row, cols):
- Row 4: cols 5–6 → x=[180,252], y=[144,180]
- Row 6: cols 3–4 → x=[108,180], y=[216,252]
- Row 9: cols 5–6 → x=[180,252], y=[324,360]
- Row 11: cols 3–4 → x=[108,180], y=[396,432]
- Row 13: cols 6–7 → x=[216,288], y=[468,504]

**Important for tests**: when placing a ball near a rock, remember `BALL_R=8` — the ball circle must not overlap any rock tile. Use `window.__golf.ballOverlapsRock()` to verify.

---

## Physics

### Update loop (`update()`)
Called once per animation frame. Increments `physicsFrame`, then sub-steps:
```
steps = ceil(speed / BALL_R)   // at least 1
for each step:
  move ball by (vx/steps, vy/steps)
  resolveCollisions()           // wall + enemy collision every sub-step
friction applied after all steps
```

Sub-stepping prevents fast-ball tunnelling — each step moves at most `BALL_R` pixels.

### Wall collision (`resolveEntityCollisions`)
Circle vs AABB tiles. Handles ghost-corner suppression (no spurious lateral kicks at tile joins).

### Enemy collision (`resolveCollisions`)
Run inside the sub-step loop. Key rules:
- **`state === 'gone'` enemies are skipped entirely** — blood pools don't interact with the ball.
- Push-out happens every sub-step (no guard).
- Damage + velocity reflection happen **at most once per enemy per `physicsFrame`** (guarded by `z.lastHitFrame`).

#### Zombie collision
- Push-out uses the geometric normal (zombie centre → ball centre).
- **Velocity reflection uses the ball's own approach direction** (`cnx = -ball.vx/speed`).
- Result: ball always bounces straight back toward the shooter regardless of contact point.

#### Shape enemy collision (`circleVsPoly`)
Returns `{ pen, nx, ny, pnx, pny }`:
- `pnx/pny` — direction from closest point on edge toward ball centre (used for **both** push-out and velocity reflection).
- `nx/ny` — outward face normal of the closest edge (stored but not currently used for reflection).
- Uses **maximum penetration depth** edge selection — picks the face the ball is deepest inside, which is always the primary contact face. This prevents corner-hit bugs where the minimum-pen edge could have `dot > 0` with the incoming velocity.
- **Inside-polygon SAT fallback**: if ball centre is fully inside the polygon (can happen with fast balls), finds the nearest face by minimum signed-distance and pushes out through it.

### Shape default angles
| Shape | Angle | Appearance |
|-------|-------|------------|
| triangle | `-π/2` | Apex pointing up |
| square | `π/4` | Edges horizontal + vertical |
| pentagon | `-π/2` | Apex pointing up, flat base |
| hexagon | `0` | Flat top and bottom |

Shapes do not rotate during gameplay.

---

## Enemies

### Zombie (`type: 'zombie'`)
- HP: 2. Radius: 12 px. Speed: `PARAMS.ZOMBIE_SPEED` (0.55 px/frame).
- States: `alive` → `corpse` (at 0 HP) → `gone` (ball hits corpse).
- `gone` zombies leave a blood pool visual and are fully removed from physics.
- Chain collisions: a fast-moving zombie can damage and knock back others.
- Pathfinding: A* with string-pull smoothing, 8-directional movement.

### Shape enemies (`type: 'shape'`)
| Shape | Sides | Radius | HP | Speed mult |
|-------|-------|--------|----|------------|
| triangle | 3 | 11 | 1 | 1.4× |
| square | 4 | 13 | 2 | 1.0× |
| pentagon | 5 | 15 | 3 | 0.7× |
| hexagon | 6 | 17 | 4 | 0.5× |

Reflect the ball based on face geometry (flat-face bounces), not circular.

---

## Power-ups / Skill tree

Offered between rounds. Each has `id`, `maxLevel`, optional `requires` (prerequisites) and `exclusive` (mutually exclusive) arrays. Stored in `acquired` object (`id → level`).

Current power-ups:
- **Power Shot** — launch speed +20% per level
- **Big Hole** — hole radius +50% per level
- **Slow Zombie** — zombie speed halved per level (requires Power Shot)
- **Heavy Ball** — ball radius +25% per level (requires Slow Zombie)
- **Quick Feet** — wizard walks while ball is in motion
- **Ball Catcher** — wizard catches ball when it returns (exclusive with Ball Kick)
- **Ball Kick** — wizard kicks ball away on contact (exclusive with Ball Catcher)
- **Stun Shot** — doubles zombie stun duration

---

## Test API (`window.__golf`)

Exposed on `window` for Playwright tests. Key methods:

```js
step()                        // one physics frame (ball only)
stepAll()                     // one physics frame (ball + wizard + zombies)
setball({ x, y, vx, vy })     // place and launch ball
getball()                     // → { x, y, vx, vy, moving, inHole }
setzombie(obj)                // set zombies[0] fields
getzombies()                  // → array of { x, y, hp, state, type, shape, angle, ... }
addshaperaw(x, y, shape)      // spawn shape enemy, return index
addzombieraw(x, y)            // spawn zombie, return index
setenemyangle(idx, angle)     // set shape rotation
getbloodpools()               // → array of { x, y }
usebaselevel()                // reset to BASE_LEVEL (clears random rocks)
fullreset()                   // round=1, acquired={}, PARAMS reset, new level
resetWon()                    // clear won flag
ballOverlapsRock()            // → bool — useful for validating test start positions
triggerWin()                  // sink ball in hole
setparam(key, val)            // override a PARAMS value
setacquired(obj)              // set acquired power-ups
geteligible()                 // → [id, ...] of currently unlockable power-ups
```

---

## Test structure (`tests/physics.test.js`)

111 tests across 15 categories. Run with `node tests/physics.test.js`.

| Cat | Tests | Coverage |
|-----|-------|----------|
| Tunneling | 1–7 | Ball doesn't pass through walls |
| Ghost corners | 8–11 | No spurious bounces at tile joins |
| Bounce physics | 12–14 | Angle reflection, BOUNCE=0 |
| General | 15–16 | Ball comes to rest, multi-wall ricochet |
| Zombie | 17–21 | HP, stun, knockback, win/lose |
| Zombie chain | 22–24 | Cascade knockback |
| Power-ups | 25–27 | Quick Feet, Ball Catcher, Ball Kick |
| Skill tree | 28–31 | Locks, exclusives, prerequisites, reset |
| Shape enemies | 32–35 | Type/shape fields, HP, collision, radius |
| Ball reflection | 36–41 | Zombie bounce, square face, tunneling regression, default angles |
| Angle/speed — zombie | 42–48 | 4 cardinal + diagonal + speed 35 + moving zombie |
| Angle/speed — shapes | 49–55 | All four shapes, SAT fallback, corner push-out |
| Triangle multi-angle | 56–79 | 8 compass × 3 speeds aimed at centre |
| Triangle off-centre | 80–95 | 8 compass × 2 lateral offsets (+5, +9 px) |
| Zombie off-centre | 96–111 | 8 compass × 2 lateral offsets (+5, +10 px); approach-axis reversal |

### Test placement rules
- Always call `usebaselevel()` before placing enemies, to avoid random level rock interference.
- Check `ballOverlapsRock()` after `setball()` if the start position is near a rock cluster.
- For zombie off-centre tests, the safe zone is zombie at **(240, 413)**, DIST=45 — all 16 start positions verified against BASE_LEVEL.
