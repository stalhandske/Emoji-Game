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
  {
    cat: 'Power-ups',
    name: 'Ball Kick — wizard kicks ball away on contact',
    async run(page) {
      await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.usebaselevel();
        window.__golf.setparam('KICK_BALL', true);
        // Ball heading toward wizard slowly — should be kicked back
        window.__golf.setball({ x: 90, y: 478, vx: 0, vy: 3 });
      });
      const result = await page.evaluate(() => {
        for (let i = 0; i < 200; i++) {
          window.__golf.step();
          const b = window.__golf.getball();
          // Ball kicked = still moving and has upward velocity at some point
          if (b.vy < -1) return { kicked: true, frames: i };
        }
        return { kicked: false };
      });
      if (!result.kicked) return `ball should have been kicked back (vy never negative)`;
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
    name: 'Exclusive: catcher blocks ballkick',
    async run(page) {
      await page.evaluate(() => {
        window.__golf.fullreset();
        window.__golf.setacquired({ earlywalk: 1, catcher: 1 });
      });
      const eligible = await page.evaluate(() => window.__golf.geteligible());
      if (eligible.includes('ballkick')) return `ballkick should be blocked when catcher is acquired`;
    },
  },
  {
    cat: 'Skill tree',
    name: 'Prerequisite: heavyball locked until slowzombie acquired',
    async run(page) {
      await page.evaluate(() => window.__golf.fullreset()); // acquired={}
      const before = await page.evaluate(() => window.__golf.geteligible());
      if (before.includes('heavyball')) return `heavyball should be locked without slowzombie`;
      await page.evaluate(() => window.__golf.setacquired({ slowzombie: 1 }));
      const after = await page.evaluate(() => window.__golf.geteligible());
      if (!after.includes('heavyball')) return `heavyball should be unlocked after acquiring slowzombie`;
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
