/* Background effects for the city themes: leaves and river light
   (Pittsburgh), night trains on elevated tracks (Tokyo), rain in fog
   (Edinburgh) and snow (Sapporo). Each one is optional and off until
   switched on in Options.

   One canvas behind everything, drawn at a capped frame rate and at most
   1.5x pixel density, paused while the window is hidden. That keeps the cost
   small even when Anki draws in software. */

(function () {
  "use strict";

  const NAMES = {
    pittsburgh: { name: "Leaves and river light", note: "A few leaves drift down, and gold light glints on the rivers." },
    tokyo: { name: "Night trains", note: "Elevated tracks along the bottom, with trains passing now and then." },
    edinburgh: { name: "Rain in the fog", note: "Dark rain falls through slow banks of fog." },
    sapporo: { name: "Snowfall", note: "Light snow falls behind the cards." },
  };

  let host = null, canvas = null, ctx = null;
  let kind = null, parts = [], raf = 0, last = 0, w = 0, h = 0, dpr = 1, t0 = 0;
  let sprites = {};
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ------------------------------------------------------------ sprites
  // Everything soft is drawn once into a small canvas and stamped after that.

  function sprite(size, draw) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    draw(c.getContext("2d"), size);
    return c;
  }
  function glow(size, rgb, a) {
    return sprite(size, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, "rgba(" + rgb + "," + a + ")");
      r.addColorStop(0.45, "rgba(" + rgb + "," + a * 0.55 + ")");
      r.addColorStop(1, "rgba(" + rgb + ",0)");
      g.fillStyle = r;
      g.fillRect(0, 0, s, s);
    });
  }
  function leaf(rgb) {
    return sprite(40, (g) => {
      g.translate(20, 20);
      g.fillStyle = "rgb(" + rgb + ")";
      g.beginPath();
      g.moveTo(0, -15);
      g.bezierCurveTo(10, -9, 10, 7, 0, 15);
      g.bezierCurveTo(-10, 7, -10, -9, 0, -15);
      g.fill();
      g.strokeStyle = "rgba(255,248,230,0.55)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, -12);
      g.lineTo(0, 17);
      g.stroke();
    });
  }

  // ------------------------------------------------------------ effects

  const FX = {
    pittsburgh: {
      fps: 30,
      init() {
        sprites.leaves = sprites.leaves || ["201,161,74", "184,112,74", "106,76,140", "122,150,104", "214,176,96"].map(leaf);
        const n = Math.round(Math.min(16, Math.max(8, (w * h) / 60000)));
        for (let i = 0; i < n; i++) parts.push(this.make(true));
        // glints on the two rivers of the bridges drawing (themes.css: the
        // bottom 110px, viewBox 0 0 1200 150, rivers at about y 124-143)
        this.glints = [];
        const m = Math.round(Math.min(70, Math.max(26, w / 18)));
        for (let i = 0; i < m; i++) {
          this.glints.push({
            x: rnd(0, w), row: rnd(122, 144), len: rnd(6, 26), v: rnd(4, 12),
            ph: rnd(0, 6.3), sp: rnd(0.6, 1.6), a: rnd(0.25, 0.6), gold: Math.random() < 0.8,
          });
        }
      },
      make(anywhere) {
        return {
          x: rnd(-40, w + 40), y: anywhere ? rnd(-40, h) : rnd(-80, -30),
          vy: rnd(14, 26), sway: rnd(18, 42), freq: rnd(0.25, 0.5), ph: rnd(0, 6.3),
          rot: rnd(0, 6.3), spin: rnd(-0.9, 0.9), s: rnd(0.6, 1.05),
          img: sprites.leaves[(Math.random() * sprites.leaves.length) | 0], a: rnd(0.4, 0.62),
        };
      },
      step(dt, t) {
        ctx.lineCap = "round";
        for (const gl of this.glints) {
          gl.x += gl.v * dt;
          if (gl.x > w + 30) gl.x = -30;
          const y = h - 110 + (gl.row / 150) * 110 + Math.sin(gl.x / 70 + gl.row) * 1.2;
          const a = gl.a * Math.max(0, Math.sin(t * gl.sp + gl.ph));
          if (a < 0.02) continue;
          ctx.strokeStyle = gl.gold ? "rgba(201, 161, 74," + a + ")" : "rgba(107, 148, 104," + a + ")";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(gl.x, y);
          ctx.lineTo(gl.x + gl.len, y);
          ctx.stroke();
        }
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          p.y += p.vy * dt;
          p.rot += p.spin * dt;
          if (p.y > h + 40) parts[i] = this.make(false);
          const x = p.x + Math.sin(t * p.freq + p.ph) * p.sway;
          // a leaf turning over looks narrower
          const flipX = Math.cos(t * p.freq * 1.7 + p.ph);
          ctx.save();
          ctx.globalAlpha = p.a;
          ctx.translate(x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(p.s * (0.35 + 0.65 * Math.abs(flipX)), p.s);
          ctx.drawImage(p.img, -20, -20);
          ctx.restore();
        }
      },
    },

    // Tokyo: elevated tracks along the bottom (concrete viaducts on piers,
    // catenary masts and wires), with trains passing now and then
    tokyo: {
      fps: 30,
      LINES: ["128,194,65", "241,90,34", "0,178,229", "255,212,0"], // green, orange, sky blue, yellow line colours
      init() {
        // far to near: [deck height as a share of h, scale, opacity]
        this.tracks = [[0.78, 0.55, 0.55], [0.86, 0.75, 0.75], [0.985, 0.9, 0.95]].map(([fy, s, a], i) => ({
          y: h * fy, s, a, dir: i % 2 ? -1 : 1, train: null, wait: rnd(1, 6) + i * 2,
        }));
        // the viaducts never move: draw them once
        this.bg = document.createElement("canvas");
        this.bg.width = Math.round(w * dpr);
        this.bg.height = Math.round(h * dpr);
        const g = this.bg.getContext("2d");
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const tr of this.tracks) this.viaduct(g, tr);
      },
      viaduct(g, tr) {
        const { y, s, a } = tr, deck = 9 * s;
        g.globalAlpha = a;
        // piers, slightly tapered, down to the bottom
        g.fillStyle = "#070c1d";
        for (let x = (17 * s) % (96 * s); x < w + 20; x += 96 * s) {
          g.beginPath();
          g.moveTo(x - 5 * s, y + deck); g.lineTo(x + 5 * s, y + deck);
          g.lineTo(x + 6.5 * s, h); g.lineTo(x - 6.5 * s, h); g.closePath(); g.fill();
        }
        // deck girder with a lit top edge and a parapet
        g.fillStyle = "#0a1128";
        g.fillRect(0, y, w, deck);
        g.fillStyle = "rgba(150, 185, 255, 0.28)";
        g.fillRect(0, y, w, 1);
        g.fillStyle = "rgba(150, 185, 255, 0.12)";
        g.fillRect(0, y + deck - 1, w, 1);
        g.fillRect(0, y - 3.5 * s, w, 1);
        // catenary masts with a crossarm, and the wires sagging between them
        const top = y - 34 * s, gap = 128 * s;
        g.strokeStyle = "rgba(120, 150, 210, 0.55)";
        g.lineWidth = Math.max(1, 1.6 * s);
        for (let x = (40 * s) % gap; x < w + gap; x += gap) {
          g.beginPath();
          g.moveTo(x, y); g.lineTo(x, top);
          g.moveTo(x - 2 * s, top + 4 * s); g.lineTo(x + 26 * s, top + 4 * s);
          g.stroke();
        }
        g.strokeStyle = "rgba(150, 180, 235, 0.35)";
        g.lineWidth = 0.7;
        for (const off of [5, 11]) {
          g.beginPath();
          for (let x = (40 * s) % gap - gap; x < w + gap; x += gap) {
            g.moveTo(x + 10 * s, top + off * s);
            g.quadraticCurveTo(x + 10 * s + gap / 2, top + (off + 4) * s, x + 10 * s + gap, top + off * s);
          }
          g.stroke();
        }
        g.globalAlpha = 1;
      },
      launch(tr) {
        const s = tr.s, cars = 6 + ((Math.random() * 5) | 0), cw = 64 * s;
        const len = cars * cw;
        tr.train = {
          cars, cw, len, x: tr.dir > 0 ? -len - 20 : w + 20,
          v: rnd(150, 240) * s * tr.dir, line: this.LINES[(Math.random() * this.LINES.length) | 0],
        };
      },
      drawTrain(tr) {
        const t = tr.train, s = tr.s, top = tr.y - 17 * s, bh = 14 * s;
        ctx.globalAlpha = tr.a;
        for (let c = 0; c < t.cars; c++) {
          const x = t.x + c * t.cw;
          if (x > w + 10 || x + t.cw < -10) continue;
          // stainless body with the line colour as a stripe
          ctx.fillStyle = "#7d889c";
          ctx.fillRect(x + 1.5 * s, top, t.cw - 3 * s, bh);
          ctx.fillStyle = "rgba(" + t.line + ",0.95)";
          ctx.fillRect(x + 1.5 * s, top + bh * 0.68, t.cw - 3 * s, Math.max(1.5, 2.2 * s));
          // lit windows, doors in between
          ctx.fillStyle = "rgba(255, 238, 200, 0.9)";
          for (let k = 0; k < 4; k++) ctx.fillRect(x + (6 + k * 14.5) * s, top + 3 * s, 9 * s, 4.5 * s);
          ctx.fillStyle = "rgba(30, 38, 58, 0.9)";
          for (let k = 0; k < 3; k++) ctx.fillRect(x + (16.5 + k * 14.5) * s, top + 2.5 * s, 2.5 * s, bh - 4 * s);
        }
        // headlight in front, tail lights behind
        const front = t.v > 0 ? t.x + t.len : t.x, back = t.v > 0 ? t.x : t.x + t.len;
        const fx = front + (t.v > 0 ? 2 : -2) * s;
        const glow = ctx.createRadialGradient(fx, top + bh * 0.7, 0, fx, top + bh * 0.7, 26 * s);
        glow.addColorStop(0, "rgba(255, 245, 215, 0.55)");
        glow.addColorStop(1, "rgba(255, 245, 215, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(fx - 26 * s, top + bh * 0.7 - 26 * s, 52 * s, 52 * s);
        ctx.fillStyle = "rgba(255, 60, 50, 0.9)";
        ctx.fillRect(back + (t.v > 0 ? 1 : -3) * s, top + bh * 0.6, 2 * s, 2 * s);
        // the window light spills onto the deck below
        ctx.fillStyle = "rgba(255, 230, 180, 0.08)";
        ctx.fillRect(Math.max(0, t.x), tr.y, Math.min(w, t.x + t.len) - Math.max(0, t.x), 9 * s);
        ctx.globalAlpha = 1;
      },
      step(dt) {
        ctx.drawImage(this.bg, 0, 0, w, h);
        for (const tr of this.tracks) {
          if (!tr.train) {
            tr.wait -= dt;
            if (tr.wait <= 0) this.launch(tr);
            continue;
          }
          const t = tr.train;
          t.x += t.v * dt;
          if ((t.v > 0 && t.x > w + 30) || (t.v < 0 && t.x + t.len < -30)) {
            tr.train = null;
            tr.wait = rnd(4, 12);
            continue;
          }
          this.drawTrain(tr);
        }
      },
    },

    // Edinburgh: dark rain falling through slow fog
    edinburgh: {
      fps: 30,
      init() {
        sprites.fog = sprites.fog || glow(128, "214,214,210", 0.85);
        this.fog = [];
        for (let i = 0; i < 6; i++) {
          this.fog.push({
            x: rnd(-0.3, 1.1) * w, y: rnd(0.05, 0.95) * h,
            rw: rnd(0.5, 0.85) * Math.max(w, 500), rh: rnd(0.25, 0.42) * Math.max(h, 400),
            v: rnd(6, 14) * (Math.random() < 0.3 ? -1 : 1), a: rnd(0.22, 0.38),
            breathe: rnd(0.05, 0.12), ph: rnd(0, 6.3),
          });
        }
        const n = Math.round(Math.min(120, Math.max(45, (w * h) / 8000)));
        for (let i = 0; i < n; i++) parts.push(this.drop(true));
      },
      drop(anywhere) {
        const z = Math.random(); // depth: near drops are longer, faster and brighter
        return { x: rnd(-60, w), y: anywhere ? rnd(-h * 0.2, h) : rnd(-120, -20), v: 380 + z * 420, len: 10 + z * 16, z };
      },
      step(dt, t) {
        for (const p of this.fog) {
          p.x += p.v * dt;
          if (p.v > 0 && p.x - p.rw / 2 > w) p.x = -p.rw / 2;
          if (p.v < 0 && p.x + p.rw / 2 < 0) p.x = w + p.rw / 2;
          ctx.globalAlpha = p.a * (0.75 + 0.25 * Math.sin(t * p.breathe + p.ph));
          ctx.drawImage(sprites.fog, p.x - p.rw / 2, p.y - p.rh / 2, p.rw, p.rh);
        }
        ctx.globalAlpha = 1;
        const slant = 0.09;
        ctx.lineCap = "round";
        // three depths, each stroked in one pass
        for (const [lo, hi, a, lw] of [[0, 0.45, 0.13, 0.8], [0.45, 0.8, 0.2, 1], [0.8, 1.01, 0.3, 1.3]]) {
          ctx.beginPath();
          for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            if (p.z < lo || p.z >= hi) continue;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.len * slant, p.y + p.len);
          }
          ctx.strokeStyle = "rgba(208, 212, 216," + a + ")";
          ctx.lineWidth = lw;
          ctx.stroke();
        }
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          p.y += p.v * dt;
          p.x += p.v * dt * slant;
          if (p.y > h + 20 || p.x > w + 40) parts[i] = this.drop(false);
        }
      },
    },

    sapporo: {
      fps: 30,
      init() {
        sprites.flake = sprites.flake || glow(16, "246,248,252", 1);
        const n = Math.round(Math.min(70, Math.max(26, (w * h) / 14000)));
        for (let i = 0; i < n; i++) parts.push(this.make(true));
      },
      make(anywhere) {
        const z = Math.random(); // depth: near flakes are bigger and faster
        return {
          x: rnd(0, w), y: anywhere ? rnd(-10, h) : rnd(-30, -6),
          r: 1.6 + z * z * 4.2, vy: 14 + z * 34, sway: 6 + z * 14,
          freq: rnd(0.3, 0.7), ph: rnd(0, 6.3), a: 0.35 + z * 0.5,
        };
      },
      step(dt, t) {
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          p.y += p.vy * dt;
          if (p.y > h + 8) parts[i] = this.make(false);
          const x = p.x + Math.sin(t * p.freq + p.ph) * p.sway + t * 4 % w;
          ctx.globalAlpha = p.a;
          ctx.drawImage(sprites.flake, ((x % (w + 10)) + w + 10) % (w + 10) - 5 - p.r, p.y - p.r, p.r * 2, p.r * 2);
        }
        ctx.globalAlpha = 1;
      },
    },
  };

  // ------------------------------------------------------------ running

  function size() {
    if (!canvas) return;
    const r = host.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
    if (nw === w && nh === h) return;
    w = nw; h = nh;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (kind) { parts = []; FX[kind].init(); }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const fx = FX[kind];
    if (!fx || document.hidden) return;
    if (now - last < 1000 / fx.fps - 2) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    fx.step(dt, (now - t0) / 1000);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    kind = null;
    parts = [];
    if (canvas) { canvas.hidden = true; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }

  function start(theme) {
    if (!FX[theme]) { stop(); return; }
    if (!canvas) {
      host = document.querySelector(".qz-atmos");
      if (!host) return;
      canvas = document.createElement("canvas");
      canvas.className = "qz-fx";
      host.appendChild(canvas);
      ctx = canvas.getContext("2d");
      new ResizeObserver(size).observe(host);
    }
    if (kind === theme && raf) return;
    stop();
    kind = theme;
    canvas.hidden = false;
    w = h = 0;
    size();
    last = t0 = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // A still backdrop some themes draw once (not an effect, always shown):
  // Edinburgh's faint marbled-endpaper combing over weathered stone.
  let back = null, backTheme = null, backTimer = 0;
  const BACKDROPS = {
    edinburgh(g, W, H) {
      let seed = 17;
      const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let y0 = -20; y0 < H + 20; y0 += 6) {
        const ph = Math.sin(y0 / 37) * 3 + y0 / 60, amp = 6 + 5 * Math.sin(y0 / 23);
        const gold = r() > 0.86;
        g.strokeStyle = gold ? "rgba(190, 160, 100, 0.07)" : "rgba(232, 228, 220," + (0.02 + r() * 0.03) + ")";
        g.lineWidth = 0.8 + r() * 1.2;
        g.beginPath();
        for (let x = 0; x <= W; x += 6) {
          const y = y0 + amp * Math.sin(x / 30 + ph) + 3 * Math.sin(x / 11 + ph * 2);
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
    },
  };
  function drawBackdrop() {
    if (!back || !backTheme) return;
    const r = back.parentNode.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, 1.5);
    back.width = Math.max(1, Math.round(r.width * d));
    back.height = Math.max(1, Math.round(r.height * d));
    const g = back.getContext("2d");
    g.setTransform(d, 0, 0, d, 0, 0);
    BACKDROPS[backTheme](g, r.width, r.height);
  }
  function backdrop(theme) {
    if (!back) {
      const atmos = document.querySelector(".qz-atmos");
      if (!atmos) return;
      back = document.createElement("canvas");
      back.className = "qz-backdrop";
      atmos.insertBefore(back, atmos.querySelector(".qz-fx"));
      new ResizeObserver(() => {
        clearTimeout(backTimer);
        backTimer = setTimeout(drawBackdrop, 150);
      }).observe(atmos);
    }
    backTheme = BACKDROPS[theme] ? theme : null;
    back.hidden = !backTheme;
    drawBackdrop();
  }

  window.QZ_FX = { NAMES, start, stop, backdrop };
})();
