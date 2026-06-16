# Marchlings 🐾

A **lemming-style pixel puzzle game** in the spirit of the old-school classic.
Hundreds of little wanderers stream out of a hatch and march mindlessly toward
danger. You can't control them directly — instead you hand out **skills** so the
crowd carves, climbs, bridges and blocks its own way to the exit.

Built in **vanilla JavaScript with zero dependencies**. Just open it in a browser.

```
open index.html      # macOS
# or serve the folder:  npx serve .
```

## How to play

1. Marchlings drop from the hatch and walk until they hit a wall (turn around),
   a ledge (fall), or the exit (saved!).
2. Pick a **skill** from the bottom bar (or press number keys **1–8**), then
   **click a marchling** to assign it. Each skill has a limited supply.
3. Save the required number before the clock runs out to clear the level.

### The eight skills

| # | Skill | What it does |
|---|-------|--------------|
| 1 | **Climber** | Permanently lets a marchling scale vertical walls. |
| 2 | **Floater** | Permanently lets it drift down safely from any height. |
| 3 | **Bomber**  | 5-second countdown, then it explodes — blasting a hole in the terrain. |
| 4 | **Blocker** | Stands still and turns back everyone who bumps into it. |
| 5 | **Builder** | Lays a staircase of 12 bricks diagonally upward. |
| 6 | **Basher**  | Tunnels horizontally through dirt. |
| 7 | **Miner**   | Carves a diagonal shaft down and forward. |
| 8 | **Digger**  | Digs straight down through the floor. |

**Steel** (the grey blocks) is indestructible — bashers, miners, diggers and
bombers all stop at it. Water and bottomless pits are deadly.

### Controls

- **Click skill → click marchling** to assign.
- **Space** pause · **F** fast-forward · **N** nuke (detonate everyone).
- **Rate –/+** change how fast marchlings pour out of the hatch.
- On wide levels, **scroll** with the **arrow keys / A·D**, by pushing the pointer
  to the screen edges, or by **clicking/dragging the minimap**.

## Levels

Ten handcrafted stages, each introducing a skill and ramping up. The final two —
**The Long March** and **Citadel of the Marchlings** — are big, horizontally
**scrolling** levels with a live minimap.

## Project layout

```
index.html        markup + HUD
styles.css        retro UI styling
js/engine.js      pure simulation (terrain mask, marchling physics, all skills)
js/levels.js      the campaign (terrain built from primitives)
js/render.js      canvas renderer (pixel terrain + sprites)
js/audio.js       tiny WebAudio blip engine
js/main.js        game loop, HUD wiring, input, level flow
test/smoke.js     headless engine tests — run with `npm test`
```

`engine.js` and `levels.js` are pure logic with no DOM, so the whole simulation
runs and is tested under Node.

## Development

```
npm test          # runs the headless engine smoke tests (71 checks)
```

For a deterministic gameplay screenshot you can auto-start and pre-simulate via
URL params: `index.html?auto=1&level=7&steps=200`.

## License

MIT
