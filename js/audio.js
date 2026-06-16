/*
 * Marchlings — audio.js (browser only)
 * Tiny WebAudio blip engine. No assets. Degrades silently if unsupported.
 */
(function () {
  'use strict';
  let ctx = null;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { ctx = null; }
    return ctx;
  }

  function blip(freq, dur, type, vol) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.value = vol == null ? 0.06 : vol;
    o.connect(g); g.connect(ac.destination);
    const t = ac.currentTime;
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
  }

  function sweep(f0, f1, dur, type, vol) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || 'sawtooth';
    const t = ac.currentTime;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.value = vol == null ? 0.06 : vol;
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + dur);
  }

  const Audio = {
    resume() { const ac = ensure(); if (ac && ac.state === 'suspended') ac.resume(); },
    setMuted(m) { muted = m; },
    isMuted() { return muted; },
    // event -> sound
    play(name) {
      switch (name) {
        case 'assign':  blip(660, 0.06, 'square', 0.05); break;
        case 'select':  blip(880, 0.03, 'square', 0.04); break;
        case 'spawn':   blip(520, 0.04, 'triangle', 0.035); break;
        case 'exit':    sweep(600, 1200, 0.18, 'sine', 0.06); break;
        case 'splat':   blip(90, 0.12, 'sawtooth', 0.07); break;
        case 'drown':   sweep(400, 120, 0.25, 'sine', 0.05); break;
        case 'explode': sweep(220, 50, 0.3, 'sawtooth', 0.09); break;
        case 'build':   blip(1000, 0.02, 'square', 0.025); break;
        case 'win':     sweep(523, 1046, 0.5, 'triangle', 0.08); break;
        case 'lose':    sweep(330, 110, 0.6, 'sawtooth', 0.07); break;
      }
    },
  };

  window.GameAudio = Audio;
})();
