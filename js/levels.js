/*
 * Marchlings — levels.js
 * Handcrafted campaign. Terrain is built from primitives so the engine can
 * rasterize the exact same collision mask in Node and in the browser.
 *
 * Level fields:
 *   name, width, height
 *   count     - total marchlings
 *   required  - how many must be saved to win
 *   time      - seconds on the clock
 *   releaseRate - 1..99 spawn speed (higher = faster)
 *   entrance  - {x, y, dir}
 *   exit      - {x, y, w, h}
 *   skills    - { climber, floater, bomber, blocker, builder, basher, miner, digger }
 *   terrain   - [ {shape:'rect'|'tri'|'circle', type:'dirt'|'steel', ...} ]
 *   water     - optional [ {x,y,w,h} ] deadly zones
 *   hint      - one-line tip shown before the level
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.Levels = mod;
})(this, function () {
  'use strict';

  const W = 480, H = 270;
  const r = (x, y, w, h, type) => ({ shape: 'rect', x, y, w, h, type: type || 'dirt' });

  const levels = [

    // 1 — Just walk. Teaches goal/exit/saving.
    {
      name: 'A Gentle Stroll',
      width: W, height: H,
      count: 10, required: 6, time: 240, releaseRate: 45,
      entrance: { x: 60, y: 165, dir: 1 },
      exit: { x: 392, y: 196, w: 18, h: 24 },
      skills: { climber: 0, floater: 0, bomber: 0, blocker: 0, builder: 0, basher: 0, miner: 0, digger: 0 },
      hint: 'They walk on their own. Just let them reach the door.',
      terrain: [ r(0, 220, W, 50), r(40, 200, 90, 20) ],
    },

    // 2 — Digger: break through a floor.
    {
      name: 'Down We Go',
      width: W, height: H,
      count: 12, required: 8, time: 240, releaseRate: 40,
      entrance: { x: 70, y: 90, dir: 1 },
      exit: { x: 220, y: 232, w: 18, h: 24 },
      skills: { climber: 0, floater: 0, bomber: 0, blocker: 0, builder: 0, basher: 0, miner: 0, digger: 2 },
      hint: 'A Digger tunnels straight down. Drop them onto the exit floor.',
      terrain: [
        r(40, 120, 200, 18),          // upper ledge they spawn onto
        r(0, 256, W, 14),             // bottom floor with the exit
        r(0, 138, 10, 120, 'steel'),
        r(470, 138, 10, 120, 'steel'),
      ],
    },

    // 3 — Basher: dig sideways through a wall.
    {
      name: 'Through The Wall',
      width: W, height: H,
      count: 14, required: 9, time: 240, releaseRate: 45,
      entrance: { x: 50, y: 165, dir: 1 },
      exit: { x: 410, y: 196, w: 18, h: 24 },
      skills: { climber: 0, floater: 0, bomber: 0, blocker: 0, builder: 0, basher: 2, miner: 0, digger: 0 },
      hint: 'A Basher carves a horizontal tunnel. Punch through the pillar.',
      terrain: [
        r(0, 220, W, 50),
        r(220, 120, 40, 100),         // the dirt wall to bash
        r(0, 200, 90, 20),
        r(390, 200, 90, 20),
      ],
    },

    // 4 — Blocker: hold the line so others turn back from the pit.
    {
      name: 'Hold The Line',
      width: W, height: H,
      count: 16, required: 10, time: 240, releaseRate: 50,
      entrance: { x: 60, y: 165, dir: 1 },
      exit: { x: 36, y: 196, w: 18, h: 24 },
      skills: { climber: 0, floater: 0, bomber: 0, blocker: 2, builder: 0, basher: 0, miner: 0, digger: 0 },
      hint: 'The exit is behind you. A Blocker bounces the crowd back the other way.',
      terrain: [
        r(0, 220, 250, 50),
        r(20, 200, 120, 20),
        r(300, 250, 180, 20),
      ],
      water: [ { x: 250, y: 254, w: 50, h: 16 } ],
    },

    // 5 — Builder: bridge a deadly gap.
    {
      name: 'Mind The Gap',
      width: W, height: H,
      count: 16, required: 11, time: 260, releaseRate: 45,
      entrance: { x: 50, y: 165, dir: 1 },
      exit: { x: 410, y: 196, w: 18, h: 24 },
      skills: { climber: 0, floater: 0, bomber: 0, blocker: 1, builder: 3, basher: 0, miner: 0, digger: 0 },
      hint: 'A Builder lays a staircase of bricks. Span the chasm.',
      terrain: [
        r(0, 220, 200, 50),
        r(20, 200, 120, 20),
        r(280, 220, 200, 50),
        r(360, 200, 100, 20),
      ],
      water: [ { x: 200, y: 254, w: 80, h: 16 } ],
    },

    // 6 — Climber + Floater: up the cliff and safely down.
    {
      name: 'Heights & Depths',
      width: W, height: H,
      count: 18, required: 12, time: 280, releaseRate: 45,
      entrance: { x: 40, y: 80, dir: 1 },
      exit: { x: 360, y: 232, w: 18, h: 24 },
      skills: { climber: 3, floater: 3, bomber: 0, blocker: 1, builder: 0, basher: 0, miner: 0, digger: 0 },
      hint: 'Climbers scale walls; Floaters drift down unharmed. Use both.',
      terrain: [
        r(0, 110, 120, 18),           // start ledge
        r(120, 40, 24, 180),          // tall wall to climb
        r(120, 40, 160, 16),          // high plateau
        r(0, 256, W, 14),             // bottom floor + exit
        r(0, 56, 8, 200, 'steel'),
      ],
    },

    // 7 — Miner: cut a diagonal ramp down to the exit.
    {
      name: 'The Long Descent',
      width: W, height: H,
      count: 20, required: 13, time: 280, releaseRate: 50,
      entrance: { x: 50, y: 70, dir: 1 },
      exit: { x: 300, y: 240, w: 18, h: 24 },
      skills: { climber: 0, floater: 0, bomber: 1, blocker: 2, builder: 1, basher: 0, miner: 2, digger: 1 },
      hint: 'A Miner carves a diagonal shaft. Bombers clear stubborn rock.',
      terrain: [
        r(0, 120, 180, 130),
        r(20, 100, 120, 20),
        r(180, 230, 300, 40),
        r(150, 150, 30, 100, 'steel'),  // steel lip — mine around it
      ],
    },

    // 8 — Everything. The big finish.
    {
      name: 'Grand Gauntlet',
      width: W, height: H,
      count: 24, required: 16, time: 320, releaseRate: 50,
      entrance: { x: 36, y: 60, dir: 1 },
      exit: { x: 440, y: 232, w: 18, h: 24 },
      skills: { climber: 4, floater: 4, bomber: 2, blocker: 3, builder: 4, basher: 3, miner: 3, digger: 3 },
      hint: 'No hints. Use everything you have learned.',
      terrain: [
        r(0, 90, 110, 18),
        r(90, 40, 22, 170),            // wall (climb)
        r(90, 40, 120, 14),            // plateau
        r(210, 54, 40, 130),           // dirt block (bash/mine)
        r(250, 150, 120, 16),          // mid ledge
        r(300, 150, 18, 60, 'steel'),  // steel pillar
        r(370, 200, 40, 16),
        r(0, 256, W, 14),              // bottom floor + exit
        r(150, 256, 40, 14, 'steel'),
      ],
      water: [ { x: 110, y: 254, w: 40, h: 14 } ],
    },

    // 9 — A wide level: the camera scrolls. The long march east.
    {
      name: 'The Long March',
      width: 900, height: H,
      count: 24, required: 15, time: 360, releaseRate: 45,
      entrance: { x: 50, y: 165, dir: 1 },
      exit: { x: 838, y: 196, w: 18, h: 24 },
      skills: { climber: 3, floater: 3, bomber: 1, blocker: 2, builder: 4, basher: 3, miner: 1, digger: 1 },
      hint: 'A wide world — scroll with the minimap, arrow keys, or screen edges. Bridge the gaps, breach the walls.',
      terrain: [
        r(40, 200, 90, 20),
        r(0, 220, 300, 50),
        r(340, 220, 220, 50),         // gap with water at 300..340
        r(540, 140, 30, 80),          // dirt wall — climb or bash
        r(560, 220, 340, 50),
        r(720, 200, 60, 20),
        r(290, 220, 12, 50, 'steel'),
        r(560, 200, 8, 20, 'steel'),
      ],
      water: [ { x: 302, y: 254, w: 38, h: 16 } ],
    },

    // 10 — Big finale: wide AND tall obstacles. Everything goes.
    {
      name: 'Citadel of the Marchlings',
      width: 960, height: H,
      count: 30, required: 18, time: 420, releaseRate: 50,
      entrance: { x: 40, y: 60, dir: 1 },
      exit: { x: 900, y: 196, w: 18, h: 24 },
      skills: { climber: 5, floater: 5, bomber: 3, blocker: 4, builder: 5, basher: 4, miner: 4, digger: 4 },
      hint: 'The grand citadel. Use every trick you know to bring them home.',
      terrain: [
        r(0, 90, 110, 18),            // start ledge
        r(90, 40, 22, 170),           // wall to climb
        r(90, 40, 150, 14),           // plateau
        r(250, 54, 40, 140),          // dirt column (bash / mine)
        r(300, 150, 150, 16),         // mid ledge
        r(360, 150, 18, 70, 'steel'), // steel pillar
        r(480, 200, 120, 16),
        r(620, 120, 30, 130),         // tall dirt wall
        r(700, 220, 260, 50),         // right floor (with exit)
        r(0, 256, 600, 14),           // bottom-left floor
        r(150, 256, 40, 14, 'steel'),
      ],
      water: [ { x: 110, y: 254, w: 40, h: 14 }, { x: 600, y: 254, w: 100, h: 16 } ],
    },
  ];

  return { levels };
});
