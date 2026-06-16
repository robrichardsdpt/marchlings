/*
 * Marchlings — render.js (browser only)
 * Draws the pixel terrain (from the engine mask) and the marchlings.
 * Supports a horizontally-scrolling camera so levels can be wider than the view.
 */
(function () {
  'use strict';
  const E = window.Engine;
  const S = E.S, LEM_H = E.LEM_H;
  const VIEW_W = 480; // logical viewport width (levels wider than this scroll)

  // Per-state tunic colours.
  const BODY = {
    [S.WALKER]: '#36d97b',
    [S.FALLER]: '#36d97b',
    [S.CLIMBER]: '#4fd6e6',
    [S.BLOCKER]: '#ff5a52',
    [S.BUILDER]: '#ffd23f',
    [S.BASHER]: '#ff9f1c',
    [S.MINER]: '#ff9f1c',
    [S.DIGGER]: '#ff9f1c',
    [S.EXITER]: '#9be7ff',
    [S.SPLAT]: '#8a5a44',
    [S.DROWNER]: '#5aa9e6',
    [S.EXPLODE]: '#ffe066',
  };
  const SKIN = '#ffdcb1';
  const LEG = '#6b5234';

  function hash(x, y) {
    let h = (x * 73856093) ^ (y * 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    return (h & 255) / 255;
  }
  function darken(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) * f | 0;
    const g = ((n >> 8) & 255) * f | 0;
    const b = (n & 255) * f | 0;
    return `rgb(${r},${g},${b})`;
  }
  const MOVING = { [S.WALKER]: 1, [S.CLIMBER]: 1, [S.BUILDER]: 1, [S.BASHER]: 1, [S.MINER]: 1 };

  class Renderer {
    constructor(canvas, scale) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.scale = scale || 2;
      this.world = null;
      this.hover = null;
      this.cam = { x: 0 };
      this.viewW = VIEW_W;
    }

    setWorld(world) {
      this.world = world;
      const t = world.terrain, s = this.scale;
      this.viewW = Math.min(VIEW_W, t.w);
      this.canvas.width = this.viewW * s;
      this.canvas.height = t.h * s;
      this.off = document.createElement('canvas');
      this.off.width = t.w; this.off.height = t.h;
      this.octx = this.off.getContext('2d');
      this.img = this.octx.createImageData(t.w, t.h);
      this.paintAll();
      this.ctx.imageSmoothingEnabled = false;
      this.cam.x = 0;
      this.centerOn(world.entrance.x);
    }

    // ---- camera ----
    maxCam() { return Math.max(0, this.world.terrain.w - this.viewW); }
    canScroll() { return this.maxCam() > 0; }
    clampCam() { this.cam.x = Math.max(0, Math.min(this.maxCam(), Math.round(this.cam.x))); }
    scrollBy(dx) { this.cam.x += dx; this.clampCam(); }
    centerOn(wx) { this.cam.x = wx - this.viewW / 2; this.clampCam(); }

    // ---- terrain bitmap ----
    colorFor(v, x, y) {
      if (v === 0) return [0, 0, 0, 0];
      if (v === 2) { const n = 60 + hash(x, y) * 25; return [n + 25, n + 28, n + 34, 255]; }
      if (v === 3) { const band = (y % 4 === 0) ? -25 : 0; return [196 + band, 92 + band, 56 + band, 255]; }
      const n = hash(x, y);
      return [96 + n * 40, 64 + n * 34, 38 + n * 26, 255];
    }
    setPixel(x, y, v) {
      const c = this.colorFor(v, x, y);
      const i = (y * this.off.width + x) * 4;
      this.img.data[i] = c[0]; this.img.data[i + 1] = c[1];
      this.img.data[i + 2] = c[2]; this.img.data[i + 3] = c[3];
    }
    paintAll() {
      const t = this.world.terrain;
      for (let y = 0; y < t.h; y++)
        for (let x = 0; x < t.w; x++)
          this.setPixel(x, y, t.mask[y * t.w + x]);
      this.octx.putImageData(this.img, 0, 0);
      t.dirty.length = 0;
    }
    flushDirty() {
      const t = this.world.terrain;
      if (!t.dirty.length) return;
      for (const packed of t.dirty) {
        const x = packed & 0xffff, y = packed >>> 16;
        this.setPixel(x, y, t.mask[y * t.w + x]);
      }
      this.octx.putImageData(this.img, 0, 0);
      t.dirty.length = 0;
    }

    // ---- main draw ----
    draw(time) {
      const ctx = this.ctx, w = this.world, t = w.terrain, s = this.scale;
      const W = this.canvas.width, H = this.canvas.height;
      const cx = this.cam.x;

      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1a2238');
      g.addColorStop(1, '#39476b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      this.flushDirty();
      ctx.drawImage(this.off, cx, 0, this.viewW, t.h, 0, 0, W, H);

      this.drawEntrance(ctx, s, time, cx);
      this.drawExit(ctx, s, time, cx);

      for (const l of w.lems) {
        if (l.state === S.DEAD || l.state === S.SAVED) continue;
        const px = (l.x - cx) * s;
        if (px < -20 || px > W + 20) continue;
        this.drawLem(ctx, l, s, time, px, l.y * s);
      }
      if (this.hover && this.hover.alive) {
        const px = (this.hover.x - cx) * s;
        if (px >= -10 && px <= W + 10) this.drawHover(ctx, this.hover, s, px);
      }
    }

    drawEntrance(ctx, s, time, cx) {
      const e = this.world.entrance;
      const x = (e.x - cx) * s, y = e.y * s;
      ctx.fillStyle = '#b0b8d0';
      ctx.fillRect(x - 12, y - 26, 24, 8);
      ctx.fillStyle = '#7a86b8';
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 18); ctx.lineTo(x + 12, y - 18);
      ctx.lineTo(x + 6, y); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2de1c2';
      ctx.fillRect(x - 5, y - 16, 10, 4);
    }

    drawExit(ctx, s, time, cx) {
      const e = this.world.exit;
      const x = (e.x - cx) * s, y = e.y * s, w = e.w * s, h = e.h * s;
      const pulse = 0.5 + 0.5 * Math.sin(time / 300);
      ctx.fillStyle = '#1d6b4f';
      ctx.fillRect(x - 3, y - 6, w + 6, h + 6);
      const grd = ctx.createLinearGradient(x, y, x, y + h);
      grd.addColorStop(0, `rgba(80,255,180,${0.65 + 0.3 * pulse})`);
      grd.addColorStop(1, 'rgba(20,120,90,0.9)');
      ctx.fillStyle = grd;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = `rgba(180,255,220,${0.4 + 0.4 * pulse})`;
      ctx.fillRect(x + w / 2 - 1, y, 2, h);
    }

    // A small pixel-art creature: skin head with a coloured cap (tunic),
    // a tunic torso, swinging arms and an animated two-frame walk.
    drawLem(ctx, l, s, time, px, py) {
      const tunic = BODY[l.state] || '#36d97b';
      const hair = darken(tunic, 0.55);
      const pr = (dx, dy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px + dx * s, py + dy * s, w * s, h * s); };
      const moving = MOVING[l.state];
      const phase = (l.frame >> 2) & 1;

      // legs
      if (l.state === S.FALLER || l.state === S.EXITER) {
        pr(-2, -2, 1, 2, LEG); pr(1, -2, 1, 2, LEG);
      } else if (moving) {
        if (phase) { pr(-2, -2, 1, 2, LEG); pr(1, -3, 1, 2, LEG); }
        else { pr(-2, -3, 1, 2, LEG); pr(1, -2, 1, 2, LEG); }
      } else {
        pr(-2, -2, 1, 2, LEG); pr(1, -2, 1, 2, LEG);
      }

      // torso
      pr(-2, -7, 5, 5, tunic);
      // arms (swing with stride)
      const armUp = moving && phase ? -1 : 0;
      pr(-3, -6 + armUp, 1, 3, tunic);
      pr(2, -6 - armUp, 1, 3, tunic);
      // head + cap + face
      pr(-1, -9, 3, 2, SKIN);
      pr(-1, -10, 3, 1, hair);
      pr(l.dir > 0 ? 1 : -1, -8, 1, 1, '#15212c'); // eye on facing side

      // ---- state extras ----
      if (l.state === S.BLOCKER) {
        pr(-4, -6, 2, 2, tunic); pr(2, -6, 2, 2, tunic); // arms thrust out
        pr(-1, -8, 1, 1, '#15212c'); pr(1, -8, 1, 1, '#15212c'); // stern eyes
      }
      if (l.canClimb && l.state !== S.BLOCKER) pr(-2, -10, 1, 1, '#4fd6e6'); // climber tag
      if (l.canFloat && l.state === S.FALLER) {
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = Math.max(1, s);
        ctx.beginPath();
        ctx.moveTo(px - 6 * s, py - 12 * s); ctx.lineTo(px + 6 * s, py - 12 * s); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px - 6 * s, py - 12 * s); ctx.lineTo(px, py - 15 * s);
        ctx.lineTo(px + 6 * s, py - 12 * s); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px, py - 12 * s); ctx.lineTo(px, py - 10 * s); ctx.stroke();
      }
      if (l.bomb >= 0) {
        const n = Math.ceil(l.bomb / E.FPS);
        ctx.fillStyle = (Math.floor(time / 120) % 2) ? '#fff' : '#ff3b30';
        ctx.font = `bold ${7 * s}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(String(n), px, py - 12 * s);
      }
      if (l.state === S.EXPLODE) {
        ctx.fillStyle = 'rgba(255,200,80,0.85)';
        const r = (6 - l.dieTimer) * 3 * s;
        ctx.beginPath();
        ctx.arc(px, py - 4 * s, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawHover(ctx, l, s, px) {
      const py = l.y * s;
      const bw = 8 * s, bh = (LEM_H + 3) * s;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(1, s / 2);
      ctx.strokeRect(px - bw / 2, py - bh, bw, bh + 2);
    }

    // ---- minimap (drawn by main.js into its own canvas) ----
    drawMinimap(mctx, mw, mh) {
      const t = this.world.terrain;
      mctx.clearRect(0, 0, mw, mh);
      mctx.fillStyle = '#0a0f1c';
      mctx.fillRect(0, 0, mw, mh);
      mctx.imageSmoothingEnabled = false;
      mctx.drawImage(this.off, 0, 0, t.w, t.h, 0, 0, mw, mh);
      // exit + entrance
      const sx = mw / t.w, sy = mh / t.h;
      mctx.fillStyle = '#2de1c2';
      mctx.fillRect(this.world.exit.x * sx - 1, this.world.exit.y * sy - 1, 3, 3);
      // marchling dots
      mctx.fillStyle = '#36d97b';
      for (const l of this.world.lems) {
        if (!l.alive) continue;
        mctx.fillRect(l.x * sx, l.y * sy - 1, 1.5, 2);
      }
      // viewport box
      mctx.strokeStyle = 'rgba(255,255,255,0.85)';
      mctx.lineWidth = 1;
      mctx.strokeRect(this.cam.x * sx + 0.5, 0.5, this.viewW * sx - 1, mh - 1);
    }
  }

  window.Renderer = Renderer;
  window.Renderer.VIEW_W = VIEW_W;
})();
