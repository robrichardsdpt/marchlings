/*
 * Marchlings — engine.js
 * Pure simulation. No DOM, no canvas. Works in the browser and in Node.
 *
 * The terrain is a pixel mask (Uint8Array, row-major):
 *   0 = empty / air
 *   1 = destructible terrain (can be dug, bashed, mined, exploded, built over)
 *   2 = steel (indestructible) — stops diggers/bashers/miners/bombers
 *   3 = brick (placed by builders; destructible like 1 but tracked separately)
 *
 * Coordinates are in "logical" pixels. A marchling's (x, y) is the position of
 * its feet: the lowest body pixel. The body occupies rows [y - LEM_H + 1 .. y].
 * The marchling stands when the pixel directly below the feet, (x, y + 1), is solid.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.Engine = mod;
})(this, function () {
  'use strict';

  // ---- Tunables -----------------------------------------------------------
  const FPS = 30;            // simulation ticks per second
  const LEM_H = 9;           // marchling height in px
  const LEM_W = 4;           // marchling width in px (half-width used for hit test)
  const MAX_STEP_UP = 6;     // walkers auto-climb obstacles up to this tall
  const MAX_STEP_DOWN = 4;   // walkers step down up to this; more => start falling
  const FALL_SPEED = 3;      // px/tick while falling
  const FLOAT_SPEED = 1;     // px/tick while floating
  const SPLAT_DIST = 50;     // fatal fall distance (without a floater)
  const BUILD_PERIOD = 9;    // ticks between bricks
  const BUILD_BRICKS = 12;   // bricks a builder carries
  const BRICK_W = 6;         // brick width in px
  const BASH_PERIOD = 5;
  const MINE_PERIOD = 5;
  const DIG_PERIOD = 5;
  const BOMB_SECONDS = 5;    // bomber countdown
  const BLOCK_RANGE = 4;     // how far a blocker's field reaches sideways

  // ---- States -------------------------------------------------------------
  const S = {
    WALKER: 'walker',
    FALLER: 'faller',
    CLIMBER: 'climber',
    BLOCKER: 'blocker',
    BUILDER: 'builder',
    BASHER: 'basher',
    MINER: 'miner',
    DIGGER: 'digger',
    DROWNER: 'drowner',
    SPLAT: 'splat',     // landed too hard — dying
    EXPLODE: 'explode', // bomber detonating
    EXITER: 'exiter',   // reached the exit — being saved
    DEAD: 'dead',
    SAVED: 'saved',
  };

  // Skills the player can assign (climber & floater are permanent attributes).
  const SKILLS = ['climber', 'floater', 'bomber', 'blocker', 'builder', 'basher', 'miner', 'digger'];

  // ---- Terrain ------------------------------------------------------------
  class Terrain {
    constructor(w, h) {
      this.w = w;
      this.h = h;
      this.mask = new Uint8Array(w * h); // 0 air
      this.dirty = [];                   // list of {x,y} pixels changed since last render flush
    }

    solid(x, y) {
      x |= 0; y |= 0;
      if (x < 0 || x >= this.w) return true;   // side walls are solid
      if (y < 0) return false;                 // open sky
      if (y >= this.h) return false;           // bottomless pit (death)
      return this.mask[y * this.w + x] !== 0;
    }

    get(x, y) {
      x |= 0; y |= 0;
      if (x < 0 || x >= this.w || y < 0 || y >= this.h) return 0;
      return this.mask[y * this.w + x];
    }

    set(x, y, v) {
      x |= 0; y |= 0;
      if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
      const i = y * this.w + x;
      if (this.mask[i] === v) return;
      this.mask[i] = v;
      this.dirty.push((y << 16) | x); // packed for the renderer
    }

    // Remove only destructible material (1 or 3). Steel (2) is untouched.
    erase(x, y) {
      x |= 0; y |= 0;
      if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
      const i = y * this.w + x;
      const v = this.mask[i];
      if (v === 1 || v === 3) {
        this.mask[i] = 0;
        this.dirty.push((y << 16) | x);
        return true;
      }
      return false;
    }

    eraseRect(x0, y0, w, h) {
      let any = false;
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++)
          if (this.erase(x, y)) any = true;
      return any;
    }

    eraseCircle(cx, cy, r) {
      const r2 = r * r;
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy <= r2) this.erase(x, y);
        }
    }

    fillRect(x0, y0, w, h, v) {
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) this.set(x, y, v);
    }

    // True if the column in front of (x) has any destructible material across the body rows.
    destructibleColumn(x, footY) {
      for (let y = footY - LEM_H + 1; y <= footY; y++) {
        const v = this.get(x, y);
        if (v === 1 || v === 3) return true;
      }
      return false;
    }

    // True if any steel blocks the column (so bashers/miners/diggers must stop).
    steelColumn(x, footY) {
      for (let y = footY - LEM_H + 1; y <= footY; y++) {
        if (this.get(x, y) === 2) return true;
      }
      return false;
    }
  }

  // ---- Marchling ----------------------------------------------------------
  let _id = 1;
  class Lem {
    constructor(x, y) {
      this.id = _id++;
      this.x = x;
      this.y = y;
      this.dir = 1;             // 1 = right, -1 = left
      this.state = S.FALLER;
      this.fallDist = 0;
      this.frame = 0;          // animation/timer frame
      this.canClimb = false;
      this.canFloat = false;
      this.bricks = 0;
      this.bomb = -1;          // frames until explosion, -1 = no timer
      this.dieTimer = 0;       // frames left in a death/exit animation
    }
    get alive() {
      return this.state !== S.DEAD && this.state !== S.SAVED;
    }
    // Is this marchling a valid target for the given skill right now?
    assignable(skill) {
      if (!this.alive) return false;
      switch (skill) {
        case 'climber': return !this.canClimb;
        case 'floater': return !this.canFloat;
        case 'bomber':  return this.bomb < 0 && this.state !== S.EXITER;
        case 'blocker': return this.state === S.WALKER;
        case 'builder': return this.state === S.WALKER || this.state === S.BASHER ||
                               this.state === S.MINER || this.state === S.DIGGER;
        case 'basher':  return this.state === S.WALKER;
        case 'miner':   return this.state === S.WALKER;
        case 'digger':  return this.state === S.WALKER;
        default: return false;
      }
    }
  }

  // ---- World --------------------------------------------------------------
  class World {
    constructor(level) {
      this.level = level;
      this.terrain = new Terrain(level.width, level.height);
      this.buildTerrain(level);

      this.lems = [];
      this.blockers = [];     // active blocker marchlings
      this.entrance = level.entrance;   // {x, y}
      this.exit = level.exit;           // {x, y, w, h}
      this.water = level.water || [];   // [{x,y,w,h}] deadly zones

      this.total = level.count;
      this.spawned = 0;
      this.saved = 0;
      this.dead = 0;
      this.required = level.required;

      this.releaseRate = level.releaseRate; // higher = faster spawn
      this.minRate = level.minRate || 1;
      this.spawnTimer = 0;
      this.spawnOpen = false;        // hatch animation gate
      this.hatchTimer = Math.round(FPS * 1.2);

      this.skills = Object.assign({}, level.skills); // remaining counts
      this.time = (level.time || 300) * FPS;         // frames left
      this.tick = 0;
      this.started = false;
      this.finished = false;
      this.nuking = false;

      this.events = []; // transient effects for renderer/audio: {type,x,y}
    }

    buildTerrain(level) {
      const t = this.terrain;
      for (const p of level.terrain) {
        const v = p.type === 'steel' ? 2 : 1;
        if (p.shape === 'rect') t.fillRect(p.x, p.y, p.w, p.h, v);
        else if (p.shape === 'tri') this._fillTri(p, v);
        else if (p.shape === 'circle') this._fillCircle(p, v);
      }
    }
    _fillTri(p, v) {
      // right triangle ramp; dir 'left' or 'right' for which side the hypotenuse rises
      const t = this.terrain;
      for (let yy = 0; yy < p.h; yy++) {
        const frac = yy / p.h;
        const cut = Math.round(p.w * frac);
        if (p.dir === 'right') t.fillRect(p.x + cut, p.y + yy, p.w - cut, 1, v);
        else t.fillRect(p.x, p.y + yy, p.w - cut, 1, v);
      }
    }
    _fillCircle(p, v) {
      const t = this.terrain, r2 = p.r * p.r;
      for (let y = -p.r; y <= p.r; y++)
        for (let x = -p.r; x <= p.r; x++)
          if (x * x + y * y <= r2) t.set(p.x + x, p.y + y, v);
    }

    // Player presses GO.
    start() { this.started = true; }

    // Assign a skill to a marchling. Returns true if applied.
    assign(lem, skill) {
      if (!lem || !this.skills[skill] || this.skills[skill] <= 0) return false;
      if (!lem.assignable(skill)) return false;
      switch (skill) {
        case 'climber': lem.canClimb = true; break;
        case 'floater': lem.canFloat = true; break;
        case 'bomber':  lem.bomb = BOMB_SECONDS * FPS; break;
        case 'blocker': this._becomeBlocker(lem); break;
        case 'builder': lem.state = S.BUILDER; lem.bricks = BUILD_BRICKS; lem.frame = 0; break;
        case 'basher':  lem.state = S.BASHER; lem.frame = 0; break;
        case 'miner':   lem.state = S.MINER; lem.frame = 0; break;
        case 'digger':  lem.state = S.DIGGER; lem.frame = 0; break;
      }
      this.skills[skill]--;
      this.events.push({ type: 'assign', x: lem.x, y: lem.y, skill });
      return true;
    }

    _becomeBlocker(lem) {
      lem.state = S.BLOCKER;
      if (this.blockers.indexOf(lem) < 0) this.blockers.push(lem);
    }

    // Pick the topmost living marchling near a logical point (for clicking).
    pick(px, py, radius) {
      radius = radius || 6;
      let best = null, bestD = Infinity;
      for (const l of this.lems) {
        if (!l.alive) continue;
        const cx = l.x, cy = l.y - (LEM_H >> 1);
        const dx = cx - px, dy = cy - py;
        const d = dx * dx + dy * dy;
        if (d < bestD && Math.abs(dx) <= LEM_W + radius && Math.abs(dy) <= LEM_H) {
          bestD = d; best = l;
        }
      }
      return best;
    }

    // Trigger all remaining marchlings to explode (the classic nuke).
    nuke() {
      this.nuking = true;
      this.spawnOpen = false;
    }

    blockedBy(x, y, dir) {
      for (const b of this.blockers) {
        if (b.state !== S.BLOCKER) continue;
        if (Math.abs(y - b.y) > LEM_H) continue;
        if (dir > 0 && x >= b.x - BLOCK_RANGE && x < b.x) return true;
        if (dir < 0 && x <= b.x + BLOCK_RANGE && x > b.x) return true;
      }
      return false;
    }

    inExit(x, y) {
      const e = this.exit;
      return x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h;
    }
    inWater(x, y) {
      for (const w of this.water) {
        if (x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h) return true;
      }
      return false;
    }

    // ---- main step --------------------------------------------------------
    step() {
      if (this.finished) return;
      this.tick++;
      if (this.started && this.time > 0) this.time--;

      // Nuke: arm each remaining marchling's timer in sequence for a cascade.
      if (this.nuking) {
        for (const l of this.lems) {
          if (l.alive && l.bomb < 0) { l.bomb = (1 + (this.tick % 8)) * 3; break; }
        }
      }

      // Hatch opens shortly after start.
      if (this.started && !this.spawnOpen && !this.nuking) {
        if (--this.hatchTimer <= 0) this.spawnOpen = true;
      }

      // Spawning.
      if (this.spawnOpen && this.spawned < this.total) {
        if (this.spawnTimer <= 0) {
          this.spawnOne();
          // releaseRate 1..99 -> interval frames
          this.spawnTimer = Math.max(2, Math.round((100 - this.releaseRate) / 4));
        } else this.spawnTimer--;
      }

      // Update marchlings.
      for (const l of this.lems) {
        if (!l.alive) continue;
        this.updateLem(l);
      }

      // Drop dead blockers from the active list.
      this.blockers = this.blockers.filter(b => b.state === S.BLOCKER);

      // Win/lose bookkeeping.
      const active = this.lems.some(l => l.alive);
      if ((this.spawned >= this.total && !active) || this.time <= 0) {
        if (!this.finished) {
          this.finished = true;
          this.won = this.saved >= this.required;
          this.events.push({ type: this.won ? 'win' : 'lose' });
        }
      }
    }

    spawnOne() {
      const l = new Lem(this.entrance.x, this.entrance.y);
      l.state = S.FALLER;
      l.dir = this.entrance.dir || 1;
      this.lems.push(l);
      this.spawned++;
      this.events.push({ type: 'spawn', x: l.x, y: l.y });
    }

    updateLem(l) {
      // Bomb countdown runs in every state.
      if (l.bomb > 0) {
        l.bomb--;
        if (l.bomb === 0) { this.explode(l); return; }
      }

      switch (l.state) {
        case S.WALKER:  this.walk(l); break;
        case S.FALLER:  this.fall(l); break;
        case S.CLIMBER: this.climb(l); break;
        case S.BLOCKER: this.block(l); break;
        case S.BUILDER: this.build(l); break;
        case S.BASHER:  this.bash(l); break;
        case S.MINER:   this.mine(l); break;
        case S.DIGGER:  this.dig(l); break;
        case S.SPLAT:
        case S.DROWNER:
        case S.EXPLODE:
        case S.EXITER:
          if (--l.dieTimer <= 0) this.finishLem(l);
          break;
      }
      l.frame++;

      // Hazards & exit apply after movement (skip transient states).
      if (l.state === S.WALKER || l.state === S.FALLER || l.state === S.CLIMBER) {
        if (this.inExit(l.x, l.y)) { this.startExit(l); return; }
        if (this.inWater(l.x, l.y)) { this.startDrown(l); return; }
        if (l.y > this.terrain.h + 8) this.kill(l); // fell off the world
      }
    }

    startExit(l) {
      l.state = S.EXITER; l.dieTimer = 8; l.bomb = -1;
      this.events.push({ type: 'exit', x: l.x, y: l.y });
    }
    startDrown(l) {
      l.state = S.DROWNER; l.dieTimer = 16;
      this.events.push({ type: 'drown', x: l.x, y: l.y });
    }
    kill(l) { l.state = S.DEAD; this.dead++; }

    finishLem(l) {
      if (l.state === S.EXITER) { l.state = S.SAVED; this.saved++; }
      else { l.state = S.DEAD; this.dead++; }
    }

    explode(l) {
      this.terrain.eraseCircle(l.x, l.y - 4, 9);
      l.state = S.EXPLODE; l.dieTimer = 6; l.bomb = -1;
      this.events.push({ type: 'explode', x: l.x, y: l.y - 4 });
    }

    // ---- behaviours -------------------------------------------------------
    grounded(l) {
      const t = this.terrain;
      return t.solid(l.x, l.y + 1);
    }

    walk(l) {
      const t = this.terrain;

      // If the floor vanished beneath us, fall.
      if (!this.grounded(l)) {
        // small step-down search first
        let d = 1;
        while (d <= MAX_STEP_DOWN && !t.solid(l.x, l.y + d)) d++;
        if (d > MAX_STEP_DOWN) { l.state = S.FALLER; l.fallDist = 0; return; }
        l.y += d - 1;
        return;
      }

      const nx = l.x + l.dir;

      // Blocker fields turn us back.
      if (this.blockedBy(nx, l.y, l.dir)) { l.dir = -l.dir; return; }

      if (t.solid(nx, l.y)) {
        // obstacle at foot level — try to step up
        let up = 0;
        while (up <= MAX_STEP_UP && t.solid(nx, l.y - up)) up++;
        if (up > MAX_STEP_UP) {
          if (l.canClimb) { l.state = S.CLIMBER; return; }
          l.dir = -l.dir; // wall — turn around
          return;
        }
        l.x = nx; l.y -= up;
      } else {
        // foot space clear — move; settle onto ground if it drops a little
        l.x = nx;
        if (!t.solid(l.x, l.y + 1)) {
          let d = 1;
          while (d <= MAX_STEP_DOWN && !t.solid(l.x, l.y + d)) d++;
          if (d > MAX_STEP_DOWN) { l.state = S.FALLER; l.fallDist = 0; return; }
          l.y += d - 1;
        }
      }
    }

    fall(l) {
      const t = this.terrain;
      const speed = l.canFloat ? FLOAT_SPEED : FALL_SPEED;
      for (let i = 0; i < speed; i++) {
        if (t.solid(l.x, l.y + 1)) {
          // landed
          if (!l.canFloat && l.fallDist > SPLAT_DIST) {
            l.state = S.SPLAT; l.dieTimer = 8;
            this.events.push({ type: 'splat', x: l.x, y: l.y });
          } else {
            l.state = S.WALKER;
          }
          l.fallDist = 0;
          return;
        }
        l.y++; l.fallDist++;
      }
    }

    climb(l) {
      const t = this.terrain;
      // ceiling bump -> turn and fall
      if (t.solid(l.x, l.y - LEM_H)) {
        l.dir = -l.dir; l.state = S.FALLER; l.fallDist = 0; return;
      }
      // reached the top of the wall? (head clears the obstacle)
      if (!t.solid(l.x + l.dir, l.y - LEM_H + 1)) {
        l.x += l.dir; l.state = S.WALKER; return;
      }
      l.y -= 1; // keep climbing
      if (l.y <= 0) { l.state = S.WALKER; }
    }

    block(l) {
      // Blockers just stand. If the ground is removed, they fall (and stop blocking).
      if (!this.grounded(l)) {
        l.state = S.FALLER; l.fallDist = 0;
      }
    }

    build(l) {
      const t = this.terrain;
      if (l.frame % BUILD_PERIOD !== 0) return;

      if (l.bricks <= 0) { l.state = S.WALKER; return; }

      // Lay a brick at foot level.
      for (let i = 0; i < BRICK_W; i++) t.set(l.x + l.dir * i, l.y, 3);
      l.bricks--;
      this.events.push({ type: 'build', x: l.x, y: l.y });

      // Step up and forward.
      const nx = l.x + l.dir * 2;
      const ny = l.y - 1;
      // wall ahead at head height -> turn around, become walker
      if (t.solid(nx, ny - LEM_H + 1)) { l.dir = -l.dir; l.state = S.WALKER; return; }
      l.x = nx; l.y = ny;
      if (l.bricks === 0) l.state = S.WALKER;
    }

    bash(l) {
      const t = this.terrain;
      if (l.frame % BASH_PERIOD !== 0) {
        if (!this.grounded(l)) { l.state = S.FALLER; l.fallDist = 0; }
        return;
      }
      const fx = l.x + l.dir;
      // steel blocks the bash
      if (t.steelColumn(fx, l.y)) { l.state = S.WALKER; l.dir = -l.dir; return; }
      // nothing left to dig through -> resume walking
      if (!t.destructibleColumn(fx, l.y) && !t.destructibleColumn(fx + l.dir, l.y)) {
        l.state = S.WALKER; return;
      }
      // carve a chunk across the body height, a couple px wide
      for (let k = 1; k <= 2; k++)
        t.eraseRect(l.x + l.dir * k, l.y - LEM_H + 1, 1, LEM_H);
      l.x += l.dir;
      if (!this.grounded(l)) { l.state = S.FALLER; l.fallDist = 0; }
    }

    mine(l) {
      const t = this.terrain;
      if (l.frame % MINE_PERIOD !== 0) return;
      const fx = l.x + l.dir;
      if (t.get(fx, l.y) === 2 || t.get(fx, l.y + 1) === 2) { l.state = S.WALKER; l.dir = -l.dir; return; }
      // carve diagonally down-forward
      t.eraseRect(l.x + l.dir, l.y - LEM_H + 1, 2, LEM_H);
      t.eraseRect(l.x + l.dir, l.y + 1, 3, 2);
      l.x += l.dir; l.y += 1;
      if (l.y >= this.terrain.h) this.kill(l);
    }

    dig(l) {
      const t = this.terrain;
      if (l.frame % DIG_PERIOD !== 0) return;
      // steel floor stops the dig
      let steel = false;
      for (let i = -LEM_W; i <= LEM_W; i++) if (t.get(l.x + i, l.y + 1) === 2) steel = true;
      if (steel) { l.state = S.WALKER; return; }
      const erased = t.eraseRect(l.x - LEM_W, l.y + 1, LEM_W * 2 + 1, 1);
      l.y += 1;
      if (l.y >= this.terrain.h) { this.kill(l); return; }
      // if there's nothing below to dig and we're now airborne, fall
      if (!erased && !this.grounded(l)) { l.state = S.FALLER; l.fallDist = 0; }
    }
  }

  return {
    FPS, LEM_H, LEM_W, SPLAT_DIST, S, SKILLS,
    Terrain, Lem, World,
  };
});
