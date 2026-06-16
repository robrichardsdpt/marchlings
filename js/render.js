/*
 * Marchlings — render.js (browser only)
 * Draws the pixel terrain (from the engine mask) and the marchlings onto a canvas.
 */
(function () {
  'use strict';
  const E = window.Engine;
  const S = E.S, LEM_H = E.LEM_H;

  // Per-state body colours.
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

  function hash(x, y) {
    let h = (x * 73856093) ^ (y * 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    return (h & 255) / 255;
  }

  class Renderer {
    constructor(canvas, scale) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.scale = scale || 2;
      this.world = null;
      this.hover = null;
    }

    setWorld(world) {
      this.world = world;
      const t = world.terrain;
      this.canvas.width = t.w * this.scale;
      this.canvas.height = t.h * this.scale;
      this.off = document.createElement('canvas');
      this.off.width = t.w; this.off.height = t.h;
      this.octx = this.off.getContext('2d');
      this.img = this.octx.createImageData(t.w, t.h);
      this.paintAll();
      this.ctx.imageSmoothingEnabled = false;
    }

    colorFor(v, x, y) {
      if (v === 0) return [0, 0, 0, 0];
      if (v === 2) { // steel
        const n = 60 + hash(x, y) * 25;
        return [n + 25, n + 28, n + 34, 255];
      }
      if (v === 3) { // brick
        const band = (y % 4 === 0) ? -25 : 0;
        return [196 + band, 92 + band, 56 + band, 255];
      }
      // dirt
      const n = hash(x, y);
      return [96 + n * 40, 64 + n * 34, 38 + n * 26, 255];
    }

    setPixel(x, y, v) {
      const c = this.colorFor(v, x, y);
      const i = (y * this.off.width + x) * 4;
      this.img.data[i] = c[0];
      this.img.data[i + 1] = c[1];
      this.img.data[i + 2] = c[2];
      this.img.data[i + 3] = c[3];
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

    draw(time) {
      const ctx = this.ctx, w = this.world, s = this.scale;
      const W = this.canvas.width, H = this.canvas.height;

      // sky
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1a2238');
      g.addColorStop(1, '#39476b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // terrain
      this.flushDirty();
      ctx.drawImage(this.off, 0, 0, this.off.width, this.off.height, 0, 0, W, H);

      this.drawEntrance(ctx, s, time);
      this.drawExit(ctx, s, time);

      for (const l of w.lems) {
        if (l.state === S.DEAD || l.state === S.SAVED) continue;
        this.drawLem(ctx, l, s, time);
      }

      if (this.hover && this.hover.alive) this.drawHover(ctx, this.hover, s);
    }

    drawEntrance(ctx, s, time) {
      const e = this.world.entrance;
      const x = e.x * s, y = e.y * s;
      ctx.fillStyle = '#b0b8d0';
      ctx.fillRect(x - 14 * s / 2 * 0 - 12, y - 26, 24, 8);
      ctx.fillStyle = '#7a86b8';
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 18);
      ctx.lineTo(x + 12, y - 18);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2de1c2';
      ctx.fillRect(x - 5, y - 16, 10, 4);
    }

    drawExit(ctx, s, time) {
      const e = this.world.exit;
      const x = e.x * s, y = e.y * s, w = e.w * s, h = e.h * s;
      // glowing portal
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

    drawLem(ctx, l, s, time) {
      const px = l.x * s, py = l.y * s;
      const bw = 3 * s, bh = (LEM_H - 1) * s;
      const col = BODY[l.state] || '#36d97b';

      // body
      ctx.fillStyle = col;
      ctx.fillRect(px - bw / 2, py - bh, bw, bh);
      // head
      ctx.fillStyle = '#ffe7c4';
      ctx.fillRect(px - s, py - bh - 2 * s, 2 * s, 2 * s);
      // facing pixel
      ctx.fillStyle = '#222';
      ctx.fillRect(px + (l.dir > 0 ? 0 : -s), py - bh - 1.5 * s, s, s);

      if (l.state === S.BLOCKER) {
        ctx.fillStyle = '#ff5a52';
        ctx.fillRect(px - bw / 2 - 2 * s, py - bh + s, 2 * s, 2 * s);
        ctx.fillRect(px + bw / 2, py - bh + s, 2 * s, 2 * s);
      }
      if (l.canFloat && l.state === S.FALLER) {
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = Math.max(1, s);
        ctx.beginPath();
        ctx.moveTo(px - 5 * s, py - bh - 3 * s);
        ctx.lineTo(px + 5 * s, py - bh - 3 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px, py - bh - 3 * s);
        ctx.lineTo(px, py - bh - s);
        ctx.stroke();
      }
      if (l.canClimb) {
        ctx.fillStyle = '#4fd6e6';
        ctx.fillRect(px - bw / 2, py - bh, s, s);
      }
      if (l.bomb >= 0) {
        const n = Math.ceil(l.bomb / E.FPS);
        ctx.fillStyle = (Math.floor(time / 120) % 2) ? '#fff' : '#ff3b30';
        ctx.font = `bold ${7 * s}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(String(n), px, py - bh - 4 * s);
      }
      if (l.state === S.EXPLODE) {
        ctx.fillStyle = 'rgba(255,200,80,0.8)';
        const r = (6 - l.dieTimer) * 3 * s;
        ctx.beginPath();
        ctx.arc(px, py - 4 * s, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawHover(ctx, l, s) {
      const px = l.x * s, py = l.y * s;
      const bw = 5 * s, bh = (LEM_H + 2) * s;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, s / 2);
      ctx.strokeRect(px - bw / 2, py - bh, bw, bh + 2);
    }
  }

  window.Renderer = Renderer;
})();
