/*
 * Marchlings — main.js (browser only)
 * Ties engine + renderer + audio together. Owns the loop, HUD and level flow.
 */
(function () {
  'use strict';
  const E = window.Engine;
  const { levels } = window.Levels;
  const A = window.GameAudio;

  const SKILL_INFO = [
    { key: 'climber', label: 'Climber', hot: '1' },
    { key: 'floater', label: 'Floater', hot: '2' },
    { key: 'bomber',  label: 'Bomber',  hot: '3' },
    { key: 'blocker', label: 'Blocker', hot: '4' },
    { key: 'builder', label: 'Builder', hot: '5' },
    { key: 'basher',  label: 'Basher',  hot: '6' },
    { key: 'miner',   label: 'Miner',   hot: '7' },
    { key: 'digger',  label: 'Digger',  hot: '8' },
  ];

  const canvas = document.getElementById('game');
  const renderer = new window.Renderer(canvas, 2);

  const dom = {
    skills: document.getElementById('skills'),
    statSaved: document.getElementById('stat-saved'),
    statOut: document.getElementById('stat-out'),
    statNeed: document.getElementById('stat-need'),
    statTime: document.getElementById('stat-time'),
    statRate: document.getElementById('stat-rate'),
    levelName: document.getElementById('level-name'),
    pause: document.getElementById('btn-pause'),
    ff: document.getElementById('btn-ff'),
    nuke: document.getElementById('btn-nuke'),
    rateUp: document.getElementById('btn-rate-up'),
    rateDown: document.getElementById('btn-rate-down'),
    mute: document.getElementById('btn-mute'),
    overlay: document.getElementById('overlay'),
    selname: document.getElementById('sel-skill'),
  };

  let world = null;
  let levelIndex = 0;
  let selected = 'digger';
  let paused = false;
  let fast = false;
  let mode = 'briefing'; // briefing | playing | over
  let acc = 0;
  let last = 0;
  const STEP_MS = 1000 / E.FPS;
  let skillButtons = {};

  // ---- level lifecycle ----------------------------------------------------
  function loadLevel(i) {
    levelIndex = ((i % levels.length) + levels.length) % levels.length;
    const lvl = levels[levelIndex];
    world = new E.World(lvl);
    renderer.setWorld(world);
    selected = firstAvailableSkill() || 'digger';
    paused = false; fast = false;
    dom.pause.textContent = '❚❚ Pause';
    dom.ff.classList.remove('on');
    dom.levelName.textContent = `${levelIndex + 1}. ${lvl.name}`;
    buildSkillPanel();
    showBriefing(lvl);
    mode = 'briefing';
    updateHUD();
  }

  function firstAvailableSkill() {
    for (const s of SKILL_INFO) if (world.skills[s.key] > 0) return s.key;
    return null;
  }

  function showBriefing(lvl) {
    dom.overlay.className = 'show';
    dom.overlay.innerHTML = `
      <div class="card">
        <h1>Level ${levelIndex + 1}</h1>
        <h2>${lvl.name}</h2>
        <p class="hint">${lvl.hint || ''}</p>
        <p class="goal">Save <b>${lvl.required}</b> of <b>${lvl.count}</b> marchlings
           before time runs out.</p>
        <button id="ov-start" class="big">Start ▶</button>
        <div class="navrow">
          <button id="ov-prev">◀ Prev</button>
          <button id="ov-next">Skip ▶</button>
        </div>
      </div>`;
    document.getElementById('ov-start').onclick = beginPlay;
    document.getElementById('ov-prev').onclick = () => loadLevel(levelIndex - 1);
    document.getElementById('ov-next').onclick = () => loadLevel(levelIndex + 1);
  }

  function beginPlay() {
    A.resume();
    dom.overlay.className = '';
    world.start();
    mode = 'playing';
  }

  function showResult() {
    mode = 'over';
    const won = world.won;
    A.play(won ? 'win' : 'lose');
    const pct = Math.round((world.saved / world.total) * 100);
    dom.overlay.className = 'show';
    dom.overlay.innerHTML = `
      <div class="card">
        <h1 class="${won ? 'good' : 'bad'}">${won ? 'Level Cleared!' : 'Try Again'}</h1>
        <p class="goal">You saved <b>${world.saved}</b> of ${world.total}
           (${pct}%). Needed ${world.required}.</p>
        <button id="ov-go" class="big">${won ? 'Next Level ▶' : 'Retry ⟲'}</button>
        <div class="navrow">
          <button id="ov-retry">Retry ⟲</button>
          <button id="ov-menu">Level Select</button>
        </div>
      </div>`;
    document.getElementById('ov-go').onclick = () =>
      loadLevel(won ? levelIndex + 1 : levelIndex);
    document.getElementById('ov-retry').onclick = () => loadLevel(levelIndex);
    document.getElementById('ov-menu').onclick = showMenu;
  }

  function showMenu() {
    mode = 'over';
    dom.overlay.className = 'show';
    const items = levels.map((l, i) =>
      `<button class="lvl" data-i="${i}">${i + 1}. ${l.name}</button>`).join('');
    dom.overlay.innerHTML = `
      <div class="card">
        <h1>Marchlings</h1>
        <p class="hint">Guide the little wanderers safely home.</p>
        <div class="levelgrid">${items}</div>
      </div>`;
    dom.overlay.querySelectorAll('.lvl').forEach(b =>
      b.onclick = () => loadLevel(parseInt(b.dataset.i, 10)));
  }

  // ---- skill panel --------------------------------------------------------
  function buildSkillPanel() {
    dom.skills.innerHTML = '';
    skillButtons = {};
    for (const s of SKILL_INFO) {
      const b = document.createElement('button');
      b.className = 'skill';
      b.dataset.key = s.key;
      b.innerHTML =
        `<span class="hot">${s.hot}</span>
         <span class="lab">${s.label}</span>
         <span class="cnt" id="cnt-${s.key}">0</span>`;
      b.onclick = () => selectSkill(s.key);
      dom.skills.appendChild(b);
      skillButtons[s.key] = b;
    }
    refreshSelection();
  }

  function selectSkill(key) {
    if (world.skills[key] <= 0) return;
    selected = key;
    A.play('select');
    refreshSelection();
  }

  function refreshSelection() {
    for (const s of SKILL_INFO) {
      const b = skillButtons[s.key];
      if (!b) continue;
      b.classList.toggle('selected', s.key === selected);
      b.classList.toggle('empty', world.skills[s.key] <= 0);
    }
    const info = SKILL_INFO.find(s => s.key === selected);
    dom.selname.textContent = info ? info.label : '—';
  }

  // ---- HUD ----------------------------------------------------------------
  function updateHUD() {
    dom.statSaved.textContent = world.saved;
    dom.statOut.textContent = world.lems.filter(l => l.alive).length;
    dom.statNeed.textContent = world.required;
    const secs = Math.ceil(world.time / E.FPS);
    const mm = String(Math.floor(secs / 60)).padStart(1, '0');
    const ss = String(secs % 60).padStart(2, '0');
    dom.statTime.textContent = `${mm}:${ss}`;
    dom.statRate.textContent = world.releaseRate;
    for (const s of SKILL_INFO) {
      const c = document.getElementById('cnt-' + s.key);
      if (c) c.textContent = world.skills[s.key];
    }
  }

  // ---- input --------------------------------------------------------------
  function canvasToLogical(ev) {
    const r = canvas.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width * world.terrain.w;
    const y = (ev.clientY - r.top) / r.height * world.terrain.h;
    return { x, y };
  }

  canvas.addEventListener('mousemove', ev => {
    if (!world) return;
    const p = canvasToLogical(ev);
    renderer.hover = world.pick(p.x, p.y, 5);
  });
  canvas.addEventListener('mouseleave', () => { renderer.hover = null; });

  canvas.addEventListener('click', ev => {
    if (mode !== 'playing' || !world) return;
    const p = canvasToLogical(ev);
    const lem = world.pick(p.x, p.y, 6);
    if (lem && world.assign(lem, selected)) {
      A.play('assign');
      refreshSelection();
    }
  });

  window.addEventListener('keydown', ev => {
    const info = SKILL_INFO.find(s => s.hot === ev.key);
    if (info) { selectSkill(info.key); return; }
    if (ev.key === ' ') { ev.preventDefault(); togglePause(); }
    else if (ev.key === 'f' || ev.key === 'F') toggleFast();
    else if (ev.key === 'n' || ev.key === 'N') doNuke();
    else if (ev.key === 'Enter' && mode === 'briefing') beginPlay();
  });

  function togglePause() {
    if (mode !== 'playing') return;
    paused = !paused;
    dom.pause.textContent = paused ? '▶ Resume' : '❚❚ Pause';
  }
  function toggleFast() {
    fast = !fast;
    dom.ff.classList.toggle('on', fast);
  }
  function doNuke() {
    if (mode !== 'playing' || !world) return;
    world.nuke();
  }

  dom.pause.onclick = togglePause;
  dom.ff.onclick = toggleFast;
  dom.nuke.onclick = doNuke;
  dom.rateUp.onclick = () => { if (world) world.releaseRate = Math.min(99, world.releaseRate + 5); };
  dom.rateDown.onclick = () => { if (world) world.releaseRate = Math.max(world.minRate, world.releaseRate - 5); };
  dom.mute.onclick = () => {
    A.setMuted(!A.isMuted());
    dom.mute.textContent = A.isMuted() ? '🔇' : '🔊';
  };

  // ---- loop ---------------------------------------------------------------
  function processEvents() {
    for (const e of world.events) {
      if (e.type === 'win') showResult();
      else if (e.type === 'lose') showResult();
      else A.play(e.type);
    }
    world.events.length = 0;
  }

  function frame(now) {
    if (!last) last = now;
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250;

    if (mode === 'playing' && !paused) {
      acc += dt;
      const steps = fast ? 3 : 1;
      while (acc >= STEP_MS) {
        for (let k = 0; k < steps && !world.finished; k++) world.step();
        acc -= STEP_MS;
        processEvents();
        if (world.finished) { acc = 0; break; }
      }
      updateHUD();
    }

    if (world) renderer.draw(now);
    requestAnimationFrame(frame);
  }

  // ---- boot ---------------------------------------------------------------
  const params = new URLSearchParams(location.search);
  const startLevel = params.has('level') ? parseInt(params.get('level'), 10) : 0;
  loadLevel(startLevel);
  if (params.has('auto')) beginPlay(); // headless/demo auto-start
  if (params.has('steps')) {           // deterministic pre-sim for screenshots
    const n = parseInt(params.get('steps'), 10) || 0;
    for (let i = 0; i < n && !world.finished; i++) { world.step(); processEvents(); }
    updateHUD();
  }
  requestAnimationFrame(frame);
  // expose for debugging
  window._mg = { get world() { return world; }, loadLevel };
})();
