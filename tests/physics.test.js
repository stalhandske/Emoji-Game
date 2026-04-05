'use strict';
// Desert Golf — Physics Tests
// Run with: node tests/physics.test.js
//
// Level geometry (T=36, BALL_R=8):
//   Right border inner face  x = 324   → ball centre max x = 316
//   Left  border inner face  x =  36   → ball centre min x =  44
//   Top   border inner face  y =  36   → ball centre min y =  44
//   Bottom border inner face y = 612   → ball centre max y = 604
//   Row-4 rock cluster (col 5-6): x=[180,252]  y=[144,180]  ← horizontal pair
//   Row-6 rock cluster (col 3-4): x=[108,180]  y=[216,252]  ← horizontal pair
//   Row-11 rock cluster(col 3-4): x=[108,180]  y=[396,432]  ← horizontal pair

const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, '../index.html');
const T = 36, BALL_R = 8;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Run N physics steps in the page, return final ball state
async function run(page, setup, frames) {
  await page.evaluate(s => {
    window.__golf.resetWon();
    window.__golf.setball(s);
  }, setup);
  return page.evaluate(n => {
    for (let i = 0; i < n; i++) {
      window.__golf.step();
      if (!window.__golf.getball().moving) break;
    }
    return { ...window.__golf.getball(), inRock: window.__golf.ballOverlapsRock() };
  }, frames);
}

// Run steps until predicate fires (or max frames reached)
async function runUntil(page, setup, pred, maxFrames = 60) {
  await page.evaluate(s => {
    window.__golf.resetWon();
    window.__golf.setball(s);
  }, setup);
  return page.evaluate(({ pred: predSrc, maxFrames }) => {
    const pred = new Function('b', predSrc);
    for (let i = 0; i < maxFrames; i++) {
      window.__golf.step();
      const b = window.__golf.getball();
      if (pred(b)) break;
    }
    return { ...window.__golf.getball(), inRock: window.__golf.ballOverlapsRock() };
  }, { pred: pred.toString().replace(/^[^{]+\{/, '').replace(/\}$/, ''), maxFrames });
}

// ── Test definitions ──────────────────────────────────────────────────────────

const TESTS = [

  // ── Category 1: Tunneling ──────────────────────────────────────────────────
  // Ball must not pass through walls at high speed.

  {
    cat: 'Tunneling',
    name: 'Right border — horizontal, vx=20',
    async run(page) {
      const b = await run(page, { x: 295, y: 72, vx: 20, vy: 0 }, 15);
      if (b.inRock)  return `ball ended inside rock (x=${b.x.toFixed(1)})`;
      if (b.x > 316) return `clipped through right wall (x=${b.x.toFixed(1)}, max=316)`;
    },
  },
  {
    cat: 'Tunneling',
    name: 'Right border — extreme speed, vx=35',
    async run(page) {
      const b = await run(page, { x: 250, y: 108, vx: 35, vy: 0 }, 10);
      if (b.inRock)  return `ball ended inside rock`;
      if (b.x > 316) return `clipped through right wall (x=${b.x.toFixed(1)})`;
    },
  },
  {
    cat: 'Tunneling',
    name: 'Left border — horizontal, vx=-30',
    async run(page) {
      const b = await run(page, { x: 80, y: 108, vx: -30, vy: 0 }, 10);
      if (b.inRock) return `ball ended inside rock`;
      if (b.x < 44) return `clipped through left wall (x=${b.x.toFixed(1)}, min=44)`;
    },
  },
  {
    cat: 'Tunneling',
    name: 'Top border — vertical, vy=-25',
    async run(page) {
      const b = await run(page, { x: 180, y: 80, vx: 0, vy: -25 }, 10);
      if (b.inRock) return `ball ended inside rock`;
      if (b.y < 44) return `clipped through top wall (y=${b.y.toFixed(1)}, min=44)`;
    },
  },
  {
    cat: 'Tunneling',
    name: 'Bottom border — vertical, vy=25',
    async run(page) {
      await page.evaluate(() => window.__golf.usebaselevel());
      const b = await run(page, { x: 180, y: 575, vx: 0, vy: 25 }, 10);
      if (b.inRock) return `ball ended inside rock`;
      if (b.y > 604) return `clipped through bottom wall (y=${b.y.toFixed(1)}, max=604)`;
    },
  },
  {
    cat: 'Tunneling',
    name: 'Interior rock (row-4 cluster) — vertical, vy=-20',
    async run(page) {
      await page.evaluate(() => window.__golf.usebaselevel());
      // Row-4 rock bottom face y=180; ball centre bounces at y=188
      const b = await run(page, { x: 216, y: 220, vx: 0, vy: -20 }, 10);
      if (b.inRock) return `ball ended inside rock`;
      if (b.y < 188) return `clipped through interior rock bottom (y=${b.y.toFixed(1)}, min=188)`;
    },
  },
  {
    cat: 'Tunneling',
    name: 'Interior rock (row-6 cluster) — diagonal, speed≈22',
    async run(page) {
      await page.evaluate(() => window.__golf.usebaselevel());
      // Approach from bottom-right, heading toward top-left corner of cluster
      const b = await run(page, { x: 200, y: 280, vx: -16, vy: -16 }, 12);
      if (b.inRock) return `ball ended inside rock`;
    },
  },

  // ── Category 2: Ghost corners ──────────────────────────────────────────────
  // Balls aimed straight at internal tile joins must not get a lateral kick.
  // (A ghost-corner bug would push vx≠0 when the ball was fired with vx=0.)

  {
    cat: 'Ghost corners',
    name: 'Horizontal join inside row-4 rock cluster — no lateral kick',
    // The join is the shared edge between col-5 and col-6 at x=216.
    // Ball fired straight up at the middle of that join, vx=0.
    async run(page) {
      await page.evaluate(() => window.__golf.usebaselevel());
      const b = await runUntil(
        page,
        { x: 216, y: 210, vx: 0, vy: -12 },
        b => b.vy > 0,  // stop once bounced (vy flipped)
      );
      if (b.inRock) return `ball ended inside rock`;
      if (Math.abs(b.vx) > 0.5) return `lateral kick from ghost corner (vx=${b.vx.toFixed(3)})`;
    },
  },
  {
    cat: 'Ghost corners',
    name: 'Horizontal join inside row-6 rock cluster — no lateral kick',
    async run(page) {
      await page.evaluate(() => window.__golf.usebaselevel());
      const b = await runUntil(
        page,
        { x: 144, y: 275, vx: 0, vy: -12 },
        b => b.vy > 0,
      );
      if (b.inRock) return `ball ended inside rock`;
      if (Math.abs(b.vx) > 0.5) return `lateral kick (vx=${b.vx.toFixed(3)})`;
    },
  },
  {
    cat: 'Ghost corners',
    name: 'Vertical join in left border — no vertical kick',
    // The border is many tiles tall; the join between row-3 and row-4 is at y=144.
    // Fire horizontally toward the border, centred on that join.
    async run(page) {
      const b = await runUntil(
        page,
        { x: 100, y: 144, vx: -15, vy: 0 },
        b => b.vx > 0,  // bounced off left wall
      );
      if (b.inRock) return `ball ended inside rock`;
      if (Math.abs(b.vy) > 0.5) return `vertical kick from border join (vy=${b.vy.toFixed(3)})`;
    },
  },
  {
    cat: 'Ghost corners',
    name: 'Interior rock outer corner — genuine bounce (not skipped)',
    // The top-left corner of the row-4 col-5 rock at (180, 144) IS a real exterior
    // corner — no adjacent solid tiles diagonally outward. Ball should bounce.
    async run(page) {
      await page.evaluate(() => window.__golf.usebaselevel());
      const b = await runUntil(
        page,
        { x: 160, y: 124, vx: 8, vy: 8 },
        b => b.vx < 0 || b.vy < 0,
      );
      if (b.inRock) return `ball ended inside rock`;
      // Should have deflected — vx or vy must have flipped
      if (b.vx >= 8 && b.vy >= 8) return `no deflection — corner not detected`;
    },
  },

  // ── Category 3: Bounce physics ─────────────────────────────────────────────

  {
    cat: 'Bounce physics',
    name: '90° into right border — vx flips, vy stays near zero',
    async run(page) {
      const b = await runUntil(
        page,
        { x: 280, y: 180, vx: 12, vy: 0 },
        b => b.vx < 0,
      );
      if (b.inRock) return `ball ended inside rock`;
      if (Math.abs(b.vy) > 0.5) return `unexpected vy after perpendicular bounce (vy=${b.vy.toFixed(3)})`;
      if (b.vx >= 0) return `vx did not flip (vx=${b.vx.toFixed(3)})`;
    },
  },
  {
    cat: 'Bounce physics',
    name: '45° into right border — vx flips, vy preserved',
    async run(page) {
      const speed = 10;
      const b = await runUntil(
        page,
        { x: 280, y: 180, vx: speed, vy: speed },
        b => b.vx < 0,
      );
      if (b.inRock) return `ball ended inside rock`;
      if (b.vx >= 0) return `vx did not flip`;
      // After a clean wall bounce with BOUNCE=0.75, vy should be unchanged in sign
      if (b.vy < 0) return `vy flipped unexpectedly (vy=${b.vy.toFixed(3)})`;
    },
  },
  {
    cat: 'Bounce physics',
    name: 'BOUNCE=0 — ball stops dead on wall contact',
    async run(page) {
      // Temporarily set BOUNCE to 0
      await page.evaluate(() => { PARAMS.BOUNCE = 0; });
      const b = await runUntil(
        page,
        { x: 280, y: 180, vx: 10, vy: 0 },
        b => !b.moving,
        120,
      );
      await page.evaluate(() => { PARAMS.BOUNCE = 0.75; }); // restore
      if (b.inRock) return `ball ended inside rock`;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 1.0) return `ball still moving after dead bounce (speed=${speed.toFixed(2)})`;
    },
  },

  // ── Category 4: General ────────────────────────────────────────────────────

  {
    cat: 'General',
    name: 'Ball rolls to rest on sand — not inside rock',
    async run(page) {
      const b = await run(page, { x: 180, y: 350, vx: 3, vy: -2 }, 300);
      if (b.inRock)  return `ball rested inside rock (x=${b.x.toFixed(1)}, y=${b.y.toFixed(1)})`;
      if (b.moving)  return `ball still moving after 300 frames`;
    },
  },
  {
    cat: 'General',
    name: 'Ball ricochets multiple walls without clipping',
    async run(page) {
      // Fire diagonally at speed 14 — will bounce around the level
      const b = await run(page, { x: 100, y: 500, vx: 13, vy: -11 }, 200);
      if (b.inRock) return `ball clipped into rock mid-ricochet`;
    },
  },

  // ── Category 5: Zombie ────────────────────────────────────────────────────

  {
    cat: 'Zombie',
    name: 'Ball hits zombie — hp decreases, stunTimer set, knockback applied',
    async run(page) {
      // Place zombie near ball's path, fire ball straight at it
      await page.evaluate(() => {
        window.__golf.setzombie({ x: 200, y: 300, vx: 0, vy: 0, hp: 2, state: 'alive', stunTimer: 0, path: [], repathTimer: 999 });
        window.__golf.setball({ x: 200, y: 200, vx: 0, vy: 8 });
      });
      const result = await page.evaluate(() => {
        for (let i = 0; i < 120; i++) {
          window.__golf.step();
          const z = window.__golf.getzombie();
          if (z.stunTimer > 0) return { hit: true, ...z };
        }
        return { hit: false, ...window.__golf.getzombie() };
      });
      if (!result.hit)        return `zombie was never hit (hp=${result.hp})`;
      if (result.hp !== 1)    return `hp should be 1 after first hit (got ${result.hp})`;
      if (result.stunTimer <= 0) return `stunTimer should be > 0 after hit (got ${result.stunTimer})`;
      const spd = Math.hypot(result.vx, result.vy);
      if (spd < 1)            return `zombie should have knockback velocity (speed=${spd.toFixed(2)})`;
    },
  },
  {
    cat: 'Zombie',
    name: 'Ball hits zombie twice — zombie becomes corpse',
    async run(page) {
      // Place zombie at hp=1 (already hit once), fire ball at it for killing blow
      await page.evaluate(() => {
        window.__golf.setzombie({ x: 200, y: 300, vx: 0, vy: 0, hp: 1, state: 'alive', stunTimer: 0, path: [], repathTimer: 999 });
        window.__golf.setball({ x: 200, y: 200, vx: 0, vy: 8 });
      });
      const result = await page.evaluate(() => {
        for (let i = 0; i < 120; i++) {
          window.__golf.step();
          const z = window.__golf.getzombie();
          if (z.state === 'corpse') return { corpse: true };
        }
        return { corpse: false, state: window.__golf.getzombie().state };
      });
      if (!result.corpse) return `zombie should be corpse after second hit (state=${result.state})`;
    },
  },
  {
    cat: 'Zombie',
    name: 'Ball hits corpse — zombie gone, blood pool appears',
    async run(page) {
      // Set zombie directly as a corpse
      await page.evaluate(() => {
        window.__golf.setzombie({ x: 200, y: 300, vx: 0, vy: 0, hp: 0, state: 'corpse', stunTimer: 0, path: [], repathTimer: 999 });
        window.__golf.setball({ x: 200, y: 200, vx: 0, vy: 8 });
      });
      const result = await page.evaluate(() => {
        for (let i = 0; i < 120; i++) {
          window.__golf.step();
          const z = window.__golf.getzombie();
          if (z.state === 'gone') {
            return { gone: true, pools: window.__golf.getbloodpools().length };
          }
        }
        return { gone: false, state: window.__golf.getzombie().state };
      });
      if (!result.gone)      return `zombie should be gone after hitting corpse (state=${result.state})`;
      if (result.pools < 1)  return `blood pool should appear when corpse is destroyed (pools=${result.pools})`;
    },
  },
  {
    cat: 'Zombie',
    name: 'Winning increments round; restart spawns round-1 zombies',
    async run(page) {
      await page.evaluate(() => window.__golf.fullreset()); // clean: round=1, 0 zombies
      const r0 = await page.evaluate(() => window.__golf.getround()); // 1
      await page.evaluate(() => window.__golf.triggerWin());
      const r1 = await page.evaluate(() => window.__golf.getround()); // 2
      if (r1 !== r0 + 1) return `round should be ${r0 + 1} after win (got ${r1})`;
      await page.evaluate(() => window.__golf.resetgame());
      const count = await page.evaluate(() => window.__golf.getzombies().length);
      if (count !== r1 - 1) return `expected ${r1 - 1} zombies for round ${r1} (got ${count})`;
    },
  },
  {
    cat: 'Zombie',
    name: 'Zombie catches wizard — gameLost becomes true',
    async run(page) {
      // Place zombie right next to wizard's starting position
      const wiz = await page.evaluate(() => window.__golf.getwizard());
      await page.evaluate((w) => {
        // Place zombie 30px away from wizard (just outside catch radius)
        window.__golf.setzombie({ x: w.x + 30, y: w.y, vx: 0, vy: 0, hp: 1, state: 'alive', stunTimer: 0, path: [], repathTimer: 999 });
        // Ensure game is in a non-won, non-lost state
        window.__golf.resetWon();
      }, wiz);
      const result = await page.evaluate(() => {
        for (let i = 0; i < 600; i++) {
          window.__golf.stepAll();
          const state = window.__golf.getstate();
          if (state.gameLost) return { gameLost: true, frames: i };
        }
        return { gameLost: false };
      });
      if (!result.gameLost) return `gameLost should be true when zombie catches wizard`;
    },
  },

  // ── Category 6: Zombie chain collisions ───────────────────────────────────

  {
    cat: 'Zombie chain',
    name: 'Fast zombie overlapping second — second gets pushed',
    async run(page) {
      await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        // zombie[0]: moving fast right, already overlapping zombie[1]
        window.__golf.setzombie({ x: 100, y: 300, vx: 15, vy: 0, hp: 2, state: 'alive', stunTimer: 5, path: [], repathTimer: 999 });
        window.__golf.addzombieraw(118, 300); // dist=18 < 24 → already overlapping
      });
      const result = await page.evaluate(() => {
        window.__golf.stepAll();
        const z1 = window.__golf.getzombies()[1];
        return { vx: z1.vx };
      });
      if (result.vx <= 0) return `second zombie should be pushed right (vx=${result.vx.toFixed(2)})`;
    },
  },
  {
    cat: 'Zombie chain',
    name: 'High-speed chain impact damages second zombie',
    async run(page) {
      await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        window.__golf.setzombie({ x: 100, y: 300, vx: 20, vy: 0, hp: 2, state: 'alive', stunTimer: 5, path: [], repathTimer: 999 });
        window.__golf.addzombieraw(118, 300);
      });
      const result = await page.evaluate(() => {
        window.__golf.stepAll();
        const z1 = window.__golf.getzombies()[1];
        return { hp: z1.hp, state: z1.state };
      });
      if (result.hp >= 2) return `second zombie should take chain damage (hp=${result.hp}, state=${result.state})`;
    },
  },
  {
    cat: 'Zombie chain',
    name: 'Chain cascade: three zombies in a line',
    async run(page) {
      await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        // zombie[0] fast → hits zombie[1] → zombie[1] should hit zombie[2]
        window.__golf.setzombie({ x: 80, y: 300, vx: 25, vy: 0, hp: 2, state: 'alive', stunTimer: 5, path: [], repathTimer: 999 });
        window.__golf.addzombieraw(102, 300); // overlaps z0
        window.__golf.addzombieraw(124, 300); // overlaps z1 after z1 is pushed
      });
      const result = await page.evaluate(() => {
        for (let i = 0; i < 5; i++) window.__golf.stepAll();
        const zs = window.__golf.getzombies();
        return { hp1: zs[1].hp, hp2: zs[2].hp, vx2: zs[2].vx };
      });
      if (result.vx2 <= 0) return `third zombie should have been pushed by cascade (vx=${result.vx2.toFixed(2)})`;
    },
  },

  // ── Category 7: Power-ups ─────────────────────────────────────────────────

  {
    cat: 'Power-ups',
    name: 'Quick Feet — wizard starts walking while ball is moving',
    async run(page) {
      await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        window.__golf.setparam('EARLY_WALK', true);
        // Place wizard at tee (ball start), shoot ball away
        window.__golf.shootball(0, -8);
      });
      // After a few stepAlls the wizard should begin walking
      const result = await page.evaluate(() => {
        for (let i = 0; i < 35; i++) window.__golf.stepAll();
        return { walking: window.__golf.getwizard().walking, ballMoving: window.__golf.getball().moving };
      });
      // Ball must still be moving and wizard should be walking
      if (!result.ballMoving) return 'ball stopped too quickly — test inconclusive';
      if (!result.walking) return 'wizard should be walking toward ball while EARLY_WALK is active';
    },
  },
  {
    cat: 'Power-ups',
    name: 'Ball Catcher — ball stops when it reaches wizard',
    async run(page) {
      await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        window.__golf.setparam('CATCH_BALL', true);
        // Place wizard at a fixed spot, shoot ball toward them from 80px away
        // Wizard stays at ball_start (~90,558). Shoot ball from same x, 80px above, downward.
        window.__golf.setball({ x: 90, y: 478, vx: 0, vy: 3 });
      });
      const result = await page.evaluate(() => {
        for (let i = 0; i < 200; i++) {
          window.__golf.step();
          const b = window.__golf.getball();
          if (!b.moving) return { stopped: true, frames: i };
        }
        const b = window.__golf.getball();
        return { stopped: false, bx: b.x, by: b.y };
      });
      if (!result.stopped) return `ball should have been caught by wizard (ball at ${result.bx?.toFixed(1)},${result.by?.toFixed(1)})`;
    },
  },
  // ── Category 8: Skill tree rules ─────────────────────────────────────────

  {
    cat: 'Skill tree',
    name: 'One-off power-up not offered after acquisition',
    async run(page) {
      await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.setacquired({ earlywalk: 1 }); // maxLevel=1, already maxed
      });
      const eligible = await page.evaluate(() => window.__golf.geteligible());
      if (eligible.includes('earlywalk')) return `earlywalk should not be eligible after acquisition`;
    },
  },
  {
    cat: 'Skill tree',
    name: 'heavyball available without prerequisites',
    async run(page) {
      await page.evaluate(() => window.__golf.fullreset()); // acquired={}
      const eligible = await page.evaluate(() => window.__golf.geteligible());
      if (!eligible.includes('heavyball')) return `heavyball should be eligible from the start`;
    },
  },
  {
    cat: 'Skill tree',
    name: 'fullreset clears acquired and restores PARAMS',
    async run(page) {
      await page.evaluate(() => {
        window.__golf.setacquired({ power: 3, bighole: 2 });
        window.__golf.setparam('HOLE_RADIUS', 99);
        window.__golf.fullreset();
      });
      const result = await page.evaluate(() => ({
        acquired: window.__golf.getacquired(),
        holeRadius: window.__golf.getparam ? window.__golf.getparam('HOLE_RADIUS') : null,
      }));
      if (Object.keys(result.acquired).length > 0)
        return `acquired should be empty after fullreset (got ${JSON.stringify(result.acquired)})`;
    },
  },

  // ── Category 9: Shape enemies ─────────────────────────────────────────────

  {
    cat: 'Shape enemies',
    name: 'addshaperaw spawns correct type and shape fields',
    async run(page) {
      await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        window.__golf.addshaperaw(90,  200, 'triangle');
        window.__golf.addshaperaw(180, 280, 'square');
        window.__golf.addshaperaw(270, 200, 'pentagon');
        window.__golf.addshaperaw(180, 400, 'hexagon');
      });
      const zs = await page.evaluate(() => window.__golf.getzombies());
      for (const [i, shape] of ['triangle','square','pentagon','hexagon'].entries()) {
        const z = zs[i];
        if (z.type !== 'shape') return `enemy ${i} should have type='shape', got '${z.type}'`;
        if (z.shape !== shape) return `enemy ${i} should have shape='${shape}', got '${z.shape}'`;
      }
    },
  },
  {
    cat: 'Shape enemies',
    name: 'Shape enemies have correct HP per shape config',
    async run(page) {
      await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        window.__golf.addshaperaw(90,  200, 'triangle'); // hp:1
        window.__golf.addshaperaw(180, 280, 'square');   // hp:2
        window.__golf.addshaperaw(270, 200, 'pentagon'); // hp:3
        window.__golf.addshaperaw(180, 400, 'hexagon');  // hp:4
      });
      const zs = await page.evaluate(() => window.__golf.getzombies());
      const expected = { triangle:1, square:2, pentagon:3, hexagon:4 };
      for (const [i, shape] of ['triangle','square','pentagon','hexagon'].entries()) {
        const z = zs[i];
        if (z.hp !== expected[shape])
          return `${shape} should have hp=${expected[shape]}, got ${z.hp}`;
      }
    },
  },
  {
    cat: 'Shape enemies',
    name: 'Ball collision kills triangle shape enemy (1 HP)',
    async run(page) {
      await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        // x=270 is right of all rock clusters (clusters end at x=252)
        window.__golf.addshaperaw(270, 300, 'triangle');
        window.__golf.setball({ x: 270, y: 200, vx: 0, vy: 12 });
      });
      const result = await page.evaluate(() => {
        for (let i = 0; i < 60; i++) window.__golf.step();
        const zs = window.__golf.getzombies();
        return { state: zs[0]?.state, hp: zs[0]?.hp };
      });
      if (result.state !== 'gone' && result.hp > 0)
        return `triangle (1HP) should be dead after ball hit (state=${result.state}, hp=${result.hp})`;
    },
  },
  {
    cat: 'Shape enemies',
    name: 'Shape enemies have per-shape collision radius',
    async run(page) {
      // Each shape should have a different radius — ball must be further away
      // from hexagon to miss it than from triangle
      const result = await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        // Triangle r=11, hexagon r=17. Ball at same x, vy toward enemy.
        // Miss triangle at distance 12 (< 11+8=19? no, 12<19 so it hits)
        // Use horizontal offset: offset=14 misses triangle (r=11, ball_r=8 → 19 threshold)
        // but hits hexagon (r=17, ball_r=8 → 25 threshold, 14<25)
        window.__golf.addshaperaw(270, 300, 'triangle'); // r=11, threshold=19
        window.__golf.addshaperaw(270, 450, 'hexagon');  // r=17, threshold=25
        // Shoot ball offset by 20px — misses triangle (20>19) but just misses hexagon (20<25)
        window.__golf.setball({ x: 270 + 20, y: 200, vx: 0, vy: 12 });
        for (let i = 0; i < 80; i++) window.__golf.step();
        const zs = window.__golf.getzombies();
        return { tri: { hp: zs[0].hp, state: zs[0].state }, hex: { hp: zs[1].hp, state: zs[1].state } };
      });
      // Triangle should be untouched (offset 20 > r=11+8=19)
      if (result.tri.hp !== 1)
        return `triangle should be missed at offset 20 (hp=${result.tri.hp})`;
      // Hexagon should be hit (offset 20 < r=17+8=25)
      if (result.hex.hp >= 4)
        return `hexagon should have been hit at offset 20 (hp=${result.hex.hp})`;
    },
  },

  // ── Category 10: Ball reflection ─────────────────────────────────────────

  {
    cat: 'Ball reflection',
    name: 'Zombie — ball bounces back (vy flips after head-on hit)',
    async run(page) {
      // x=270 is clear of all rock clusters.
      // Zombie at (270,290), ball above at (270,240) moving down.
      // ZOMBIE_R=12, BALL_R=8 → contact at ball.y ≈ 270. Ball should reverse vy.
      const result = await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        window.__golf.setzombie({ x:270, y:290, vx:0, vy:0, hp:2, state:'alive', stunTimer:0, path:[], repathTimer:999 });
        window.__golf.setball({ x:270, y:240, vx:0, vy:10 });
        let vyAfter = null;
        for (let i = 0; i < 20; i++) {
          window.__golf.step();
          const b = window.__golf.getball();
          if (b.vy < 0) { vyAfter = b.vy; break; }
        }
        return { vyAfter };
      });
      if (result.vyAfter === null) return `ball vy never became negative — ball did not bounce back`;
    },
  },
  {
    cat: 'Ball reflection',
    name: 'Zombie — ball bounces back (vx flips after horizontal head-on hit)',
    async run(page) {
      const result = await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        // Zombie at (270,300), ball to the left at (220,300) moving right
        window.__golf.setzombie({ x:270, y:300, vx:0, vy:0, hp:2, state:'alive', stunTimer:0, path:[], repathTimer:999 });
        window.__golf.setball({ x:220, y:300, vx:10, vy:0 });
        let vxAfter = null;
        for (let i = 0; i < 20; i++) {
          window.__golf.step();
          const b = window.__golf.getball();
          if (b.vx < 0) { vxAfter = b.vx; break; }
        }
        return { vxAfter };
      });
      if (result.vxAfter === null) return `ball vx never became negative — ball did not bounce back`;
    },
  },
  {
    cat: 'Ball reflection',
    name: 'Square — ball reflects off flat face (not circular)',
    async run(page) {
      // Square with angle=π/4 has a perfectly horizontal top face.
      // Ball shot from directly above should reverse vy (face normal = straight up).
      // A circular-only collision would give the same result for head-on,
      // but we verify the hit and reversal happen correctly.
      const result = await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        window.__golf.addshaperaw(270, 300, 'square');
        window.__golf.setenemyangle(0, Math.PI / 4); // flat top/bottom faces
        // square r=13, BALL_R=8 → top face at y≈290.8; ball starts at y=250 moving down
        window.__golf.setball({ x:270, y:250, vx:0, vy:10 });
        let vyAfter = null;
        for (let i = 0; i < 20; i++) {
          window.__golf.step();
          const b = window.__golf.getball();
          if (b.vy < 0) { vyAfter = b.vy; break; }
        }
        return { vyAfter };
      });
      if (result.vyAfter === null) return `ball vy never became negative — square face reflection failed`;
    },
  },
  {
    cat: 'Ball reflection',
    name: 'Square — glancing hit produces non-zero vx component (face deflects sideways)',
    async run(page) {
      // Hit the top face of the square at an angle: ball comes from upper-left (vx>0, vy>0).
      // After face reflection off horizontal top face, vy should flip but vx should stay positive.
      const result = await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        window.__golf.addshaperaw(270, 310, 'square');
        window.__golf.setenemyangle(0, Math.PI / 4); // flat top face at y≈297
        // Ball from upper-left, moving diagonally down-right
        window.__golf.setball({ x:255, y:260, vx:3, vy:8 });
        let snapshotAtBounce = null;
        for (let i = 0; i < 30; i++) {
          window.__golf.step();
          const b = window.__golf.getball();
          if (b.vy < 0) { snapshotAtBounce = { vx: b.vx, vy: b.vy }; break; }
        }
        return snapshotAtBounce;
      });
      if (!result) return `ball never bounced off square`;
      if (result.vx <= 0) return `vx should stay positive after top-face reflection (vx=${result.vx.toFixed(2)})`;
      if (result.vy >= 0) return `vy should flip negative after top-face reflection (vy=${result.vy.toFixed(2)})`;
    },
  },
  {
    cat: 'Ball reflection',
    name: 'Fast ball does not tunnel through zombie',
    async run(page) {
      // Ball shot at speed 25 (≈3× BALL_R) — old code would skip the enemy.
      // Ball starts 80px above zombie; without sub-step detection it would overshoot.
      const result = await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        window.__golf.setzombie({ x:270, y:320, vx:0, vy:0, hp:2, state:'alive', stunTimer:0, path:[], repathTimer:999 });
        window.__golf.setball({ x:270, y:240, vx:0, vy:25 });
        for (let i = 0; i < 10; i++) window.__golf.step();
        const z = window.__golf.getzombies()[0];
        const b = window.__golf.getball();
        return { hp: z.hp, ballY: b.y, ballVy: b.vy };
      });
      if (result.hp >= 2) return `zombie hp unchanged — fast ball tunnelled through (ballY=${result.ballY.toFixed(1)}, vy=${result.ballVy.toFixed(1)})`;
    },
  },
  {
    cat: 'Ball reflection',
    name: 'Shape default angles — triangle apex up, square grid-aligned, hexagon flat-sided',
    async run(page) {
      const result = await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        window.__golf.addshaperaw(100, 100, 'triangle');
        window.__golf.addshaperaw(100, 200, 'square');
        window.__golf.addshaperaw(100, 300, 'pentagon');
        window.__golf.addshaperaw(100, 400, 'hexagon');
        const zs = window.__golf.getzombies();
        return zs.map(z => ({ shape: z.shape, angle: z.angle }));
      });
      const PI = Math.PI;
      const expected = { triangle: -PI/2, square: PI/4, pentagon: -PI/2, hexagon: 0 };
      for (const z of result) {
        const exp = expected[z.shape];
        if (Math.abs(z.angle - exp) > 0.001)
          return `${z.shape} should start at angle ${exp.toFixed(3)}, got ${z.angle.toFixed(3)}`;
      }
    },
  },

  // ── Category 11: Comprehensive angle/speed — zombie ──────────────────────

  // Helper used by many tests below: shoot ball toward zombie, run N frames,
  // check that (a) zombie took damage and (b) velocity reversed in approach axis.
  // Encodes the full check inline via page.evaluate so each test is self-contained.

  {
    cat: 'Angle/speed — zombie',
    name: 'Speed 30 — straight down: no tunnel, ball bounces up',
    async run(page) {
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        window.__golf.setzombie({ x:270, y:310, vx:0, vy:0, hp:2, state:'alive', stunTimer:0, path:[], repathTimer:999 });
        window.__golf.setball({ x:270, y:230, vx:0, vy:30 });
        let vyAfter = null;
        for (let i = 0; i < 8; i++) { window.__golf.step(); const b = window.__golf.getball(); if (b.vy < 0) { vyAfter = b.vy; break; } }
        return { hp: window.__golf.getzombies()[0].hp, vyAfter };
      });
      if (r.hp >= 2) return `ball tunnelled — zombie hp unchanged`;
      if (r.vyAfter === null) return `zombie hit but ball vy never reversed (ball didn't bounce back)`;
    },
  },
  {
    cat: 'Angle/speed — zombie',
    name: 'Speed 30 — straight up: no tunnel, ball bounces down',
    async run(page) {
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        window.__golf.setzombie({ x:270, y:230, vx:0, vy:0, hp:2, state:'alive', stunTimer:0, path:[], repathTimer:999 });
        window.__golf.setball({ x:270, y:310, vx:0, vy:-30 });
        let vyAfter = null;
        for (let i = 0; i < 8; i++) { window.__golf.step(); const b = window.__golf.getball(); if (b.vy > 0) { vyAfter = b.vy; break; } }
        return { hp: window.__golf.getzombies()[0].hp, vyAfter };
      });
      if (r.hp >= 2) return `ball tunnelled — zombie hp unchanged`;
      if (r.vyAfter === null) return `ball vy never reversed positive (ball didn't bounce back)`;
    },
  },
  {
    cat: 'Angle/speed — zombie',
    name: 'Speed 30 — straight right: no tunnel, ball bounces left',
    async run(page) {
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        window.__golf.setzombie({ x:220, y:300, vx:0, vy:0, hp:2, state:'alive', stunTimer:0, path:[], repathTimer:999 });
        window.__golf.setball({ x:140, y:300, vx:30, vy:0 });
        let vxAfter = null;
        for (let i = 0; i < 8; i++) { window.__golf.step(); const b = window.__golf.getball(); if (b.vx < 0) { vxAfter = b.vx; break; } }
        return { hp: window.__golf.getzombies()[0].hp, vxAfter };
      });
      if (r.hp >= 2) return `ball tunnelled — zombie hp unchanged`;
      if (r.vxAfter === null) return `ball vx never reversed (ball didn't bounce back)`;
    },
  },
  {
    cat: 'Angle/speed — zombie',
    name: 'Speed 30 — straight left: no tunnel, ball bounces right',
    async run(page) {
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        window.__golf.setzombie({ x:140, y:300, vx:0, vy:0, hp:2, state:'alive', stunTimer:0, path:[], repathTimer:999 });
        window.__golf.setball({ x:220, y:300, vx:-30, vy:0 });
        let vxAfter = null;
        for (let i = 0; i < 8; i++) { window.__golf.step(); const b = window.__golf.getball(); if (b.vx > 0) { vxAfter = b.vx; break; } }
        return { hp: window.__golf.getzombies()[0].hp, vxAfter };
      });
      if (r.hp >= 2) return `ball tunnelled — zombie hp unchanged`;
      if (r.vxAfter === null) return `ball vx never reversed (ball didn't bounce back)`;
    },
  },
  {
    cat: 'Angle/speed — zombie',
    name: 'Speed 28 — diagonal (down-right): hit detected, vx and vy both reverse',
    async run(page) {
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        // Ball approaching zombie from upper-left at 45°; zombie directly below-right
        window.__golf.setzombie({ x:270, y:310, vx:0, vy:0, hp:2, state:'alive', stunTimer:0, path:[], repathTimer:999 });
        const spd = 20; // vx=vy=20 → speed≈28
        window.__golf.setball({ x:215, y:255, vx:spd, vy:spd });
        let snapshot = null;
        for (let i = 0; i < 10; i++) {
          window.__golf.step();
          const b = window.__golf.getball();
          if (b.vx < 0 && b.vy < 0) { snapshot = { vx: b.vx, vy: b.vy }; break; }
        }
        return { hp: window.__golf.getzombies()[0].hp, snapshot };
      });
      if (r.hp >= 2) return `ball tunnelled — zombie hp unchanged`;
      if (!r.snapshot) return `vx and vy never both reversed (ball didn't bounce back diagonally)`;
    },
  },
  {
    cat: 'Angle/speed — zombie',
    name: 'Speed 35 — extreme speed: sub-stepping catches the collision',
    async run(page) {
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        window.__golf.setzombie({ x:270, y:310, vx:0, vy:0, hp:2, state:'alive', stunTimer:0, path:[], repathTimer:999 });
        window.__golf.setball({ x:270, y:220, vx:0, vy:35 });
        for (let i = 0; i < 6; i++) window.__golf.step();
        return { hp: window.__golf.getzombies()[0].hp };
      });
      if (r.hp >= 2) return `extreme-speed ball tunnelled through zombie`;
    },
  },
  {
    cat: 'Angle/speed — zombie',
    name: 'Moving zombie: walking toward ball — collision still detected',
    async run(page) {
      // Zombie starts far, has vx set to simulate walking fast toward the ball.
      // We use setzombie with vx so it moves during stepAll().
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        // Place zombie to the right, ball moving slowly left — zombie walks right (away)
        // Instead: place zombie just outside range with a velocity toward ball
        window.__golf.setzombie({ x:310, y:300, vx:-8, vy:0, hp:2, state:'alive', stunTimer:0, path:[], repathTimer:999 });
        window.__golf.setball({ x:220, y:300, vx:5, vy:0 });
        for (let i = 0; i < 8; i++) window.__golf.stepAll();
        return { hp: window.__golf.getzombies()[0].hp };
      });
      if (r.hp >= 2) return `moving zombie not hit — tunnelled or missed`;
    },
  },

  // ── Category 12: Comprehensive angle/speed — shape enemies ───────────────

  {
    cat: 'Angle/speed — shapes',
    name: 'Speed 30 — triangle flat base hit from below: ball bounces back down',
    async run(page) {
      // Triangle with apex-up has a horizontal base at the bottom (outward normal = down).
      // Ball approaches from below (vy=-30) and should bounce back downward (vy>0).
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        window.__golf.addshaperaw(270, 310, 'triangle'); // base at y≈321.5
        window.__golf.setball({ x:270, y:400, vx:0, vy:-30 });
        let vyAfter = null;
        for (let i = 0; i < 8; i++) { window.__golf.step(); const b = window.__golf.getball(); if (b.vy > 0) { vyAfter = b.vy; break; } }
        return { hp: window.__golf.getzombies()[0].hp, vyAfter };
      });
      if (r.hp >= 1) return `ball tunnelled through triangle base (hp unchanged)`;
      if (r.vyAfter === null) return `triangle base hit but ball vy never reversed to positive`;
    },
  },
  {
    cat: 'Angle/speed — shapes',
    name: 'Speed 30 — flat face of square (top face hit from above)',
    async run(page) {
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        window.__golf.addshaperaw(270, 310, 'square'); // angle=π/4 → flat top
        window.__golf.setball({ x:270, y:230, vx:0, vy:30 });
        let vyAfter = null;
        for (let i = 0; i < 8; i++) { window.__golf.step(); const b = window.__golf.getball(); if (b.vy < 0) { vyAfter = b.vy; break; } }
        return { hp: window.__golf.getzombies()[0].hp, vyAfter };
      });
      if (r.hp >= 2) return `ball tunnelled through square face (hp unchanged)`;
      if (r.vyAfter === null) return `square hit but ball vy never reversed`;
    },
  },
  {
    cat: 'Angle/speed — shapes',
    name: 'Speed 30 — hexagon flat face from above',
    async run(page) {
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        window.__golf.addshaperaw(270, 310, 'hexagon'); // angle=0 → flat top face
        window.__golf.setball({ x:270, y:220, vx:0, vy:30 });
        let vyAfter = null;
        for (let i = 0; i < 8; i++) { window.__golf.step(); const b = window.__golf.getball(); if (b.vy < 0) { vyAfter = b.vy; break; } }
        return { hp: window.__golf.getzombies()[0].hp, vyAfter };
      });
      if (r.hp >= 4) return `ball tunnelled through hexagon (hp unchanged)`;
      if (r.vyAfter === null) return `hexagon hit but ball vy never reversed`;
    },
  },
  {
    cat: 'Angle/speed — shapes',
    name: 'Speed 28 — diagonal hit on pentagon',
    async run(page) {
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        window.__golf.addshaperaw(270, 310, 'pentagon');
        window.__golf.setball({ x:215, y:255, vx:20, vy:20 }); // 45° down-right
        let bounced = false;
        for (let i = 0; i < 10; i++) {
          window.__golf.step();
          const b = window.__golf.getball();
          if (b.vx < 0 || b.vy < 0) { bounced = true; break; }
        }
        return { hp: window.__golf.getzombies()[0].hp, bounced };
      });
      if (r.hp >= 3) return `ball tunnelled through pentagon (hp unchanged)`;
      if (!r.bounced) return `pentagon hit but ball velocity never deflected`;
    },
  },
  {
    cat: 'Angle/speed — shapes',
    name: 'Fast ball does not tunnel through hexagon (inside-polygon SAT fallback)',
    async run(page) {
      // Hexagon r=17, inscribed radius ≈14.7.  At speed 30 the ball can jump from
      // outside the bounding sphere to inside the polygon in one sub-step — the
      // SAT inside-polygon fallback must detect and push it back out.
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        window.__golf.addshaperaw(270, 310, 'hexagon'); // hp=4
        window.__golf.setball({ x:270, y:230, vx:0, vy:30 });
        for (let i = 0; i < 6; i++) window.__golf.step();
        const z = window.__golf.getzombies()[0];
        const b = window.__golf.getball();
        return { hp: z.hp, ballY: b.y, vy: b.vy };
      });
      if (r.hp >= 4) return `fast ball tunnelled through hexagon (hp=${r.hp}, ballY=${r.ballY.toFixed(1)})`;
    },
  },
  {
    cat: 'Angle/speed — shapes',
    name: 'Fast ball does not tunnel through square (inside-polygon SAT fallback)',
    async run(page) {
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        window.__golf.addshaperaw(270, 310, 'square'); // hp=2
        window.__golf.setball({ x:270, y:230, vx:0, vy:35 });
        for (let i = 0; i < 6; i++) window.__golf.step();
        const z = window.__golf.getzombies()[0];
        return { hp: z.hp, ballY: window.__golf.getball().y };
      });
      if (r.hp >= 2) return `fast ball tunnelled through square (hp=${r.hp}, ballY=${r.ballY.toFixed(1)})`;
    },
  },
  {
    cat: 'Angle/speed — shapes',
    name: 'Square corner hit — ball deflects (push-out is correct at corners)',
    async run(page) {
      // Square angle=π/4, corner at upper-right: (270+13*cos(π/4+3π/2), 310+13*sin(…))
      // = approx (279.2, 300.8). Ball approaches corner from upper-right.
      const r = await page.evaluate(() => {
        window.__golf.fullreset(); window.__golf.usebaselevel();
        window.__golf.addshaperaw(270, 310, 'square'); // angle=π/4
        // Upper-right corner is at ~(279, 301). Approach from upper-right.
        window.__golf.setball({ x:310, y:270, vx:-20, vy:20 });
        let deflected = false;
        for (let i = 0; i < 10; i++) {
          window.__golf.step();
          const b = window.__golf.getball();
          // After corner hit, at least one velocity component should flip
          if (b.vx > 0 || b.vy < 0) { deflected = true; break; }
        }
        return { hp: window.__golf.getzombies()[0].hp, deflected };
      });
      if (r.hp >= 2) return `ball tunnelled through square corner (hp unchanged)`;
      if (!r.deflected) return `square corner hit but ball was not deflected`;
    },
  },

  // ── Category 13: Multi-angle triangle shots ──────────────────────────────
  // Triangle (apex up, r=11) at (270, 310).  Shoot from 8 compass directions
  // at 3 speeds.  Every hit must cause the ball to deflect — i.e. its velocity
  // component along the approach axis must reverse sign.
  // We place the ball 60px away along each approach axis so it always hits.

  ...(() => {
    const SX = 270, SY = 310, DIST = 60;
    const dirs = [
      { name: 'N',  ang: -Math.PI/2 },
      { name: 'NE', ang: -Math.PI/4 },
      { name: 'E',  ang: 0          },
      { name: 'SE', ang:  Math.PI/4 },
      { name: 'S',  ang:  Math.PI/2 },
      { name: 'SW', ang:  3*Math.PI/4 },
      { name: 'W',  ang:  Math.PI   },
      { name: 'NW', ang: -3*Math.PI/4 },
    ];
    const speeds = [8, 18, 30];
    const tests = [];
    for (const { name, ang } of dirs) {
      for (const spd of speeds) {
        // Ball starts DIST px away in the opposite direction of approach
        const startX = SX - Math.cos(ang) * DIST;
        const startY = SY - Math.sin(ang) * DIST;
        const vx = Math.cos(ang) * spd;
        const vy = Math.sin(ang) * spd;
        tests.push({
          cat: 'Triangle multi-angle',
          name: `Triangle — approach from ${name} speed ${spd}: ball deflects`,
          async run(page) {
            const cfg = { SX, SY, startX, startY, vx, vy, ang };
            const r = await page.evaluate((c) => {
              window.__golf.fullreset(); window.__golf.usebaselevel();
              window.__golf.addshaperaw(c.SX, c.SY, 'triangle');
              window.__golf.setball({ x: c.startX, y: c.startY, vx: c.vx, vy: c.vy });
              // Dominant axis of approach
              const axisIsX = Math.abs(c.vx) >= Math.abs(c.vy);
              const initComponent = axisIsX ? c.vx : c.vy;
              let deflected = false;
              for (let i = 0; i < 20; i++) {
                window.__golf.step();
                const b = window.__golf.getball();
                const comp = axisIsX ? b.vx : b.vy;
                // Deflected = velocity component on approach axis flipped sign
                if (Math.sign(comp) !== Math.sign(initComponent) && Math.abs(comp) > 0.5) {
                  deflected = true; break;
                }
              }
              const z = window.__golf.getzombies()[0];
              return { deflected, hp: z.hp };
            }, cfg);
            if (r.hp >= 1) return `ball missed triangle entirely (hp=${r.hp})`;
            if (!r.deflected) return `triangle hit but ball was not deflected (kept going same direction)`;
          },
        });
      }
    }
    return tests;
  })(),

  // ── Category 14: Off-centre hits on triangle ─────────────────────────────
  // Same 8 compass directions, but the ball trajectory is shifted LATERALLY
  // (perpendicular to the approach axis) so it clips a face or corner rather
  // than hitting dead-centre.  Offsets of ±5 px and ±9 px are used; ±9 is
  // close to the triangle's inscribed radius (≈5.5 px) so it reliably hits
  // a corner rather than a flat face.

  ...(() => {
    const SX = 270, SY = 310, DIST = 60, SPD = 18;
    const dirs = [
      { name: 'N',  ang: -Math.PI/2 },
      { name: 'NE', ang: -Math.PI/4 },
      { name: 'E',  ang: 0          },
      { name: 'SE', ang:  Math.PI/4 },
      { name: 'S',  ang:  Math.PI/2 },
      { name: 'SW', ang:  3*Math.PI/4 },
      { name: 'W',  ang:  Math.PI   },
      { name: 'NW', ang: -3*Math.PI/4 },
    ];
    const offsets = [5, 9];  // lateral pixels to shift the trajectory
    const tests = [];
    for (const { name, ang } of dirs) {
      // Perpendicular (lateral) unit vector: rotate approach by +90°
      const perpX = -Math.sin(ang), perpY = Math.cos(ang);
      for (const off of offsets) {
        // Ball starts DIST px back along approach axis, shifted +off laterally.
        // The trajectory passes off-centre through the shape's bounding area.
        const startX = SX - Math.cos(ang) * DIST + perpX * off;
        const startY = SY - Math.sin(ang) * DIST + perpY * off;
        const vx = Math.cos(ang) * SPD;
        const vy = Math.sin(ang) * SPD;
        tests.push({
          cat: 'Triangle off-centre',
          name: `Triangle — from ${name} offset +${off}px speed ${SPD}: deflects or misses cleanly`,
          async run(page) {
            const cfg = { SX, SY, startX, startY, vx, vy, ang };
            const r = await page.evaluate((c) => {
              window.__golf.fullreset(); window.__golf.usebaselevel();
              window.__golf.addshaperaw(c.SX, c.SY, 'triangle');
              window.__golf.setball({ x: c.startX, y: c.startY, vx: c.vx, vy: c.vy });
              // For off-centre hits the ball may strike at a shallow angle —
              // the dominant component won't reverse, but the velocity DIRECTION
              // must change by at least 15° (genuine deflection vs. pass-through).
              const initAngle = Math.atan2(c.vy, c.vx);
              let deflected = false;
              for (let i = 0; i < 20; i++) {
                window.__golf.step();
                const b = window.__golf.getball();
                if (Math.hypot(b.vx, b.vy) < 1) break; // ball nearly stopped
                let diff = Math.abs(Math.atan2(b.vy, b.vx) - initAngle);
                if (diff > Math.PI) diff = 2 * Math.PI - diff;
                if (diff > 15 * Math.PI / 180) { deflected = true; break; }
              }
              const z = window.__golf.getzombies()[0];
              return { deflected, hp: z.hp };
            }, cfg);
            // If triangle was hit, ball MUST deflect.  If missed entirely, that's fine.
            if (r.hp < 1 && !r.deflected)
              return `triangle hit (offset ${off}px from ${name}) but ball kept going same direction`;
          },
        });
      }
    }
    return tests;
  })(),

  // ── Category 15: Off-centre zombie hits ──────────────────────────────────
  // Zombies are circular, so the reflection normal always points from zombie
  // centre toward ball centre.  Even with a lateral offset the dominant
  // approach component MUST reverse — this is the "bounce back the way it
  // came" guarantee the user expects from every zombie hit.
  // ZOMBIE_R=12, BALL_R=8 → contact radius = 20px.
  // Offsets of 5px and 10px are tested (10px = half the contact radius —
  // still a solid hit, just off-centre).

  ...(() => {
    // ZX=240, ZY=413 is row 11 col 6 (sand).
    // Constraints from BASE_LEVEL rocks (T=36, BALL_R=8):
    //   Row-9 rocks  y=[324,360]: S-approach ball top must be ≥360 → startY≥368 → ZY-DIST≥368.
    //   Row-13 rocks y=[468,504]: N-approach ball bottom must be <468 → startY+8<468 → ZY+DIST<460.
    //   With DIST=45: ZY∈[413,414].  ZY=413 chosen.
    // All 16 start positions (8 compass dirs × offsets +5,+10) land in open sand.
    const SX = 240, SY = 413, DIST = 45, SPD = 18;
    const dirs = [
      { name: 'N',  ang: -Math.PI/2 },
      { name: 'NE', ang: -Math.PI/4 },
      { name: 'E',  ang: 0          },
      { name: 'SE', ang:  Math.PI/4 },
      { name: 'S',  ang:  Math.PI/2 },
      { name: 'SW', ang:  3*Math.PI/4 },
      { name: 'W',  ang:  Math.PI   },
      { name: 'NW', ang: -3*Math.PI/4 },
    ];
    const offsets = [5, 10];
    const tests = [];
    for (const { name, ang } of dirs) {
      const perpX = -Math.sin(ang), perpY = Math.cos(ang);
      for (const off of offsets) {
        const startX = SX - Math.cos(ang) * DIST + perpX * off;
        const startY = SY - Math.sin(ang) * DIST + perpY * off;
        const vx = Math.cos(ang) * SPD;
        const vy = Math.sin(ang) * SPD;
        tests.push({
          cat: 'Zombie off-centre',
          name: `Zombie — from ${name} offset +${off}px speed ${SPD}: bounces back along approach axis`,
          async run(page) {
            const cfg = { SX, SY, startX, startY, vx, vy };
            const r = await page.evaluate((c) => {
              window.__golf.fullreset(); window.__golf.usebaselevel();
              window.__golf.setzombie({ x: c.SX, y: c.SY, vx:0, vy:0, hp:2, state:'alive', stunTimer:0, path:[], repathTimer:999 });
              window.__golf.setball({ x: c.startX, y: c.startY, vx: c.vx, vy: c.vy });
              if (window.__golf.ballOverlapsRock()) return { setupFail: true };
              // "Bounce back the way it came" = velocity component along the original
              // approach direction reverses sign.  More meaningful than checking a single
              // axis: works for any approach angle including diagonals with large offsets.
              const spd = Math.hypot(c.vx, c.vy);
              const apx = c.vx / spd, apy = c.vy / spd; // unit approach direction
              let bouncedBack = false;
              for (let i = 0; i < 20; i++) {
                window.__golf.step();
                const b = window.__golf.getball();
                const comp = b.vx * apx + b.vy * apy; // positive = still going same way
                if (comp < -0.5) { bouncedBack = true; break; }
              }
              const z = window.__golf.getzombies()[0];
              return { bouncedBack, hp: z.hp };
            }, cfg);
            if (r.setupFail) return `start position (${startX.toFixed(0)},${startY.toFixed(0)}) is inside a rock — adjust DIST or offset`;
            if (r.hp >= 2) return `ball missed zombie entirely (hp=${r.hp})`;
            if (!r.bouncedBack) return `zombie hit but ball did not bounce back along approach axis`;
          },
        });
      }
    }
    return tests;
  })(),

];

// ── Runner ────────────────────────────────────────────────────────────────────

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(FILE);
  await page.waitForTimeout(400);

  console.log('\nDesert Golf — Physics Tests');
  console.log('═'.repeat(52));

  let passed = 0, failed = 0;
  let currentCat = '';

  for (let i = 0; i < TESTS.length; i++) {
    const t = TESTS[i];
    if (t.cat !== currentCat) {
      currentCat = t.cat;
      console.log(`\n  ${currentCat}`);
    }
    let failure;
    try {
      failure = await t.run(page);
    } catch (e) {
      failure = `threw: ${e.message}`;
    }
    if (failure) {
      console.log(`  ✗ ${String(i + 1).padStart(2)}. ${t.name}`);
      console.log(`       → ${failure}`);
      failed++;
    } else {
      console.log(`  ✓ ${String(i + 1).padStart(2)}. ${t.name}`);
      passed++;
    }
  }

  console.log('\n' + '═'.repeat(52));
  const total = passed + failed;
  if (failed === 0) {
    console.log(`  Passed: ${passed} / ${total} ✓\n`);
  } else {
    console.log(`  Passed: ${passed} / ${total}   Failed: ${failed} ✗\n`);
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
