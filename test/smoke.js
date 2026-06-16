/*
 * Marchlings — headless smoke test.  Run:  node test/smoke.js
 * Exercises the pure engine: spawning, walking, every skill, hazards, win/lose.
 */
const Engine = require('../js/engine.js');
const { levels } = require('../js/levels.js');
const { World, Terrain, Lem, S } = Engine;

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

// Build a tiny flat test world with a wide floor.
function flatWorld(opts = {}) {
  const level = {
    name: 'test', width: 200, height: 100,
    count: opts.count || 5, required: 1, time: 100, releaseRate: 50,
    entrance: { x: 20, y: 60, dir: 1 },
    exit: opts.exit || { x: 180, y: 2, w: 4, h: 4 }, // unreachable by default
    skills: opts.skills || {},
    terrain: opts.terrain || [{ shape: 'rect', x: 0, y: 80, w: 200, h: 20, type: 'dirt' }],
    water: opts.water || [],
  };
  // ensure every skill key exists
  for (const k of Engine.SKILLS) if (level.skills[k] == null) level.skills[k] = 0;
  return new World(level);
}

function run(world, n) { for (let i = 0; i < n; i++) world.step(); }

// ---------------------------------------------------------------------------
section('Terrain');
{
  const t = new Terrain(50, 50);
  t.fillRect(10, 10, 10, 10, 1);
  ok('fillRect marks solid', t.solid(12, 12) === true);
  ok('air is not solid', t.solid(0, 0) === false);
  ok('side walls solid', t.solid(-1, 5) === true && t.solid(50, 5) === true);
  ok('below world not solid', t.solid(5, 99) === false);
  t.erase(12, 12);
  ok('erase clears dirt', t.solid(12, 12) === false);
  t.fillRect(30, 30, 5, 5, 2);
  ok('steel survives erase', (t.erase(31, 31) === false) && t.solid(31, 31) === true);
  t.eraseCircle(15, 15, 3);
  ok('eraseCircle removes a blob', t.solid(15, 15) === false);
}

// ---------------------------------------------------------------------------
section('Spawning & walking');
{
  const w = flatWorld({ count: 3 });
  w.start();
  run(w, 200);
  ok('all marchlings spawned', w.spawned === 3);
  const firstY = w.lems[0].y;
  ok('marchling landed on floor', firstY <= 80 && firstY >= 70);
  ok('walker moved sideways', w.lems[0].x !== 20);
}

// ---------------------------------------------------------------------------
section('Faller / splat / floater');
{
  // High drop onto floor -> splat without floater.
  const w = flatWorld({ count: 1 });
  w.start();
  const l = new Lem(50, 5);
  l.state = S.FALLER;
  w.lems.push(l); w.spawned++;
  run(w, 80);
  ok('long fall splats', l.state === S.SPLAT || l.state === S.DEAD);

  const w2 = flatWorld({ count: 1 });
  w2.start();
  const f = new Lem(50, 5); f.state = S.FALLER; f.canFloat = true;
  w2.lems.push(f); w2.spawned++;
  run(w2, 200);
  ok('floater survives the same fall', f.state === S.WALKER || f.state === S.SAVED || f.alive);
}

// ---------------------------------------------------------------------------
section('Digger');
{
  const w = flatWorld({ count: 1, skills: { digger: 1 } });
  w.start();
  const l = new Lem(50, 79); l.state = S.WALKER;
  w.lems.push(l); w.spawned++;
  ok('digger assigned', w.assign(l, 'digger') === true);
  const startY = l.y;
  run(w, 60);
  ok('digger tunnelled downward', l.y > startY);
  ok('digger removed terrain', w.terrain.solid(50, startY + 1) === false);
}

// ---------------------------------------------------------------------------
section('Basher');
{
  const w = flatWorld({
    count: 1, skills: { basher: 1 },
    terrain: [
      { shape: 'rect', x: 0, y: 80, w: 200, h: 20, type: 'dirt' },
      { shape: 'rect', x: 80, y: 60, w: 20, h: 20, type: 'dirt' }, // wall
    ],
  });
  w.start();
  const l = new Lem(79, 79); l.state = S.WALKER; l.dir = 1; // adjacent to the wall
  w.lems.push(l); w.spawned++;
  w.assign(l, 'basher');
  ok('became basher', l.state === S.BASHER);
  run(w, 60);
  ok('basher carved into the wall', w.terrain.solid(85, 70) === false || l.x > 85);
}

// ---------------------------------------------------------------------------
section('Builder');
{
  const w = flatWorld({ count: 1, skills: { builder: 1 } });
  w.start();
  const l = new Lem(50, 79); l.state = S.WALKER; l.dir = 1;
  w.lems.push(l); w.spawned++;
  w.assign(l, 'builder');
  ok('became builder', l.state === S.BUILDER);
  const startY = l.y;
  let minY = startY;
  for (let i = 0; i < 120; i++) { w.step(); if (l.y < minY) minY = l.y; }
  ok('builder rose while building', minY < startY);
  ok('builder placed bricks (type 3)', (() => {
    for (let y = 0; y < w.terrain.h; y++)
      for (let x = 0; x < w.terrain.w; x++)
        if (w.terrain.get(x, y) === 3) return true;
    return false;
  })());
}

// ---------------------------------------------------------------------------
section('Blocker');
{
  const w = flatWorld({ count: 1, skills: { blocker: 1 } });
  w.start();
  const b = new Lem(100, 79); b.state = S.WALKER;
  w.lems.push(b); w.spawned++;
  w.assign(b, 'blocker');
  ok('became blocker', b.state === S.BLOCKER);
  const walker = new Lem(90, 79); walker.state = S.WALKER; walker.dir = 1;
  w.lems.push(walker); w.spawned++;
  run(w, 40);
  ok('walker turned at blocker', walker.dir === -1);
}

// ---------------------------------------------------------------------------
section('Miner');
{
  const w = flatWorld({ count: 1, skills: { miner: 1 } });
  w.start();
  const l = new Lem(50, 79); l.state = S.WALKER; l.dir = 1;
  w.lems.push(l); w.spawned++;
  w.assign(l, 'miner');
  const sx = l.x, sy = l.y;
  run(w, 40);
  ok('miner moved diagonally down', l.x > sx && l.y > sy);
}

// ---------------------------------------------------------------------------
section('Bomber');
{
  const w = flatWorld({ count: 1, skills: { bomber: 1 } });
  w.start();
  const l = new Lem(50, 79); l.state = S.WALKER;
  w.lems.push(l); w.spawned++;
  w.assign(l, 'bomber');
  ok('bomb armed', l.bomb > 0);
  run(w, Engine.FPS * 6);
  ok('bomber detonated & died', l.state === S.DEAD || l.state === S.EXPLODE);
  ok('explosion cleared terrain', w.terrain.solid(50, 79) === false);
}

// ---------------------------------------------------------------------------
section('Climber');
{
  const w = flatWorld({
    count: 1, skills: { climber: 1 },
    terrain: [
      { shape: 'rect', x: 0, y: 80, w: 200, h: 20, type: 'dirt' },
      { shape: 'rect', x: 70, y: 30, w: 10, h: 50, type: 'dirt' }, // tall wall
    ],
  });
  w.start();
  const l = new Lem(65, 79); l.state = S.WALKER; l.dir = 1; l.canClimb = true;
  w.lems.push(l); w.spawned++;
  let climbMinY = l.y;
  for (let i = 0; i < 80; i++) { w.step(); if (l.y < climbMinY) climbMinY = l.y; }
  ok('climber scaled the wall', climbMinY < 60);
}

// ---------------------------------------------------------------------------
section('Exit & Water');
{
  const w = flatWorld({ count: 1, exit: { x: 60, y: 74, w: 12, h: 16 } });
  w.start();
  const l = new Lem(64, 79); l.state = S.WALKER;
  w.lems.push(l); w.spawned++;
  run(w, 20);
  ok('reaching exit saves', w.saved >= 1);

  const w2 = flatWorld({
    count: 1,
    terrain: [{ shape: 'rect', x: 0, y: 80, w: 200, h: 20, type: 'dirt' }],
    water: [{ x: 60, y: 78, w: 20, h: 12 }],
  });
  w2.start();
  const d = new Lem(64, 79); d.state = S.WALKER;
  w2.lems.push(d); w2.spawned++;
  run(w2, 30);
  ok('water drowns', d.state === S.DROWNER || d.state === S.DEAD);
}

// ---------------------------------------------------------------------------
section('Campaign integrity');
{
  ok('there are levels', levels.length >= 6);
  let totalSteps = 0;
  for (const lvl of levels) {
    const w = new World(lvl);
    ok(lvl.name + ': required <= count', lvl.required <= lvl.count);
    ok(lvl.name + ': has exit', !!lvl.exit);
    ok(lvl.name + ': spawn point not buried', !w.terrain.solid(lvl.entrance.x, lvl.entrance.y));
    w.start();
    // run a full minute of simulation; must never throw
    let threw = false;
    try { for (let i = 0; i < Engine.FPS * 60; i++) { w.step(); totalSteps++; } }
    catch (e) { threw = true; console.error('   threw on ' + lvl.name + ': ' + e.message); }
    ok(lvl.name + ': simulates without error', !threw);
    ok(lvl.name + ': everyone eventually spawns', w.spawned === lvl.count);
  }
  console.log('  (' + totalSteps + ' total simulation steps executed)');
}

// Level 1 should be auto-winnable (pure walking).
section('Level 1 is solvable by walking');
{
  const w = new World(levels[0]);
  w.start();
  for (let i = 0; i < Engine.FPS * 120 && !w.finished; i++) w.step();
  ok('level 1 saves the required count', w.saved >= levels[0].required);
}

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(40));
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed === 0 ? 0 : 1);
