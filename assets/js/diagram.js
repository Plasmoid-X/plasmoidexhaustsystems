// Animated system diagram: two vortices drawn in 3D on a canvas over the
// diagram (coordinates are the drawing's own 700 x 905 units).
// Intake air swirls clockwise and drifts down; exhaust swirls the other way
// in the outer shell and drifts up. Each streak runs round a tilted circle,
// so the near side is bright and thick, the far side faint and hidden behind
// the stainless core.
(function () {
  const W = 700, H = 905;
  const TOP = { x: 437, y: 223 }, BOT = { x: 437, y: 558 };
  const CORE_R = 44;          // sealed stainless core
  const TILT = 0.3;           // how far we look down on the vortex

  // Radius of each vortex at height y.
  const sphereR = (y, c, r) => {
    const h = y - c.y;
    return Math.abs(h) < r ? Math.sqrt(r * r - h * h) : 0;
  };
  const inTube = (y) => y > TOP.y && y < BOT.y;

  // The vessel is a cross-section: each passage is one shape made of both
  // spheres joined by the neck. These match the drawing's layers.
  function body(ctx, r, half) {
    for (const c of [TOP, BOT]) {
      ctx.moveTo(c.x + r, c.y);
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    }
    ctx.rect(TOP.x - half, TOP.y, half * 2, BOT.y - TOP.y);
  }
  const ORANGE = [114, 36];   // exhaust passage (outer), out to the thin outer wall
  const DIVIDER = [86, 18];   // wall between the passages
  const BLUE = [80, 14];      // intake passage (inner)

  const intakeR = (y) => Math.max(
    0.8 * sphereR(y, TOP, 79), 0.8 * sphereR(y, BOT, 79), inTube(y) ? 10 : 0);
  const exhaustR = (y) => Math.max(
    sphereR(y, TOP, 101), sphereR(y, BOT, 101), inTube(y) ? 27 : 0);

  const FLOWS = [
    // exhaust first, so the divider can be cleared before the intake is drawn
    { radius: exhaustR, from: 662, to: 130, drift: -22, spin: -2.4, count: 110,
      rgb: "196, 18, 24", front: 0.62, back: 0.24, width: 4.4,
      inside: ORANGE, outside: DIVIDER },
    { radius: intakeR, from: 150, to: 632, drift: 26, spin: 3, count: 34,
      rgb: "14, 92, 186", front: 0.95, back: 0.3, width: 3,
      inside: BLUE },
  ];

  // Pipe runs, in the direction of flow (same routes and 24-unit bends as
  // the drawing). Each is sampled into points with a normal for the swirl.
  const PIPE_R = 6.5, PIPE_SPEED = 75, PIPE_SPIN = 11;
  const PIPE_RUNS = [
    { flow: 1, pts: [[24, 731], [84, 731]] },
    { flow: 1, pts: [[155, 478], [155, 218], [358, 218]] },
    { flow: 1, pts: [[437, 640], [437, 768], [492, 768]] },
    { flow: 0, pts: [[596, 742], [596, 563], [556, 563]] },
    { flow: 0, pts: [[556, 218], [624, 218], [624, 146]] },
  ];
  function samplePipe(pts, r = 24) {
    const out = [];
    const push = (x, y) => out.push({ x, y });
    const toward = (a, b, d) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      return [a[0] + dx / L * d, a[1] + dy / L * d];
    };
    const line = (a, b) => {
      const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
      for (let i = 0; i < n; i++) push(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n);
    };
    let start = pts[0];
    for (let i = 1; i < pts.length - 1; i++) {
      const p1 = toward(pts[i], pts[i - 1], r), p2 = toward(pts[i], pts[i + 1], r);
      line(start, p1);
      for (let j = 0; j < 16; j++) {
        const u = j / 16, v = 1 - u;
        push(v * v * p1[0] + 2 * v * u * pts[i][0] + u * u * p2[0], v * v * p1[1] + 2 * v * u * pts[i][1] + u * u * p2[1]);
      }
      start = p2;
    }
    line(start, pts[pts.length - 1]);
    push(...pts[pts.length - 1]);
    let len = 0;
    out.forEach((p, i) => {
      if (i) len += Math.hypot(p.x - out[i - 1].x, p.y - out[i - 1].y);
      p.s = len;
      const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      p.nx = -dy / L; p.ny = dx / L;
    });
    return { points: out, length: len };
  }
  function pointAt(pipe, s) {
    const pts = pipe.points;
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].s <= s) lo = m; else hi = m; }
    return pts[lo];
  }

  function init(wrap) {
    const canvas = wrap.querySelector(".diagram-swirl");
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const particles = [];
    FLOWS.forEach((f) => {
      for (let i = 0; i < f.count; i++) {
        particles.push({ f, theta: Math.random() * Math.PI * 2,
          y: f.from + (f.to - f.from) * (i + Math.random()) / f.count });
      }
    });

    const pipeParticles = [];
    PIPE_RUNS.forEach((run) => {
      const pipe = Object.assign(samplePipe(run.pts), { flow: FLOWS[run.flow] });
      const n = Math.round(pipe.length / 16);
      for (let i = 0; i < n; i++) {
        pipeParticles.push({ pipe, s: pipe.length * (i + Math.random()) / n, theta: Math.random() * Math.PI * 2 });
      }
    });

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth, h = wrap.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform((w * dpr) / W, 0, 0, (h * dpr) / H, 0, 0);
    }

    const project = (theta, y, r) => ({
      x: TOP.x + r * Math.cos(theta),
      y: y + r * TILT * Math.sin(theta),
      depth: Math.sin(theta),       // +1 nearest the viewer, -1 furthest
    });
    const hiddenByCore = (p) =>
      p.depth < 0 && [TOP, BOT].some((c) => Math.hypot(p.x - c.x, p.y - c.y) < CORE_R);

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = "round";
      for (const f of FLOWS) {
        ctx.save();
        ctx.beginPath();
        body(ctx, ...f.inside);
        ctx.clip();
        for (const pt of particles) {
          if (pt.f === f) drawStreak(pt);
        }
        if (f.outside) {
          // keep the exhaust out of the divider and the intake passage
          ctx.globalCompositeOperation = "destination-out";
          ctx.beginPath();
          body(ctx, ...f.outside);
          // and off the intake pipes that cross the outer chamber
          ctx.rect(316, 205, 46, 26);
          ctx.rect(424, 632, 26, 54);
          ctx.fill();
        }
        ctx.restore();
      }

      // The exhaust passage surrounds the intake passage, so the near half of
      // the exhaust swirl passes in front of the blue (spheres and neck).
      // Drawn last, but kept off the intake pipes that cross the chamber.
      ctx.save();
      ctx.beginPath();
      body(ctx, ...ORANGE);
      reverseRect(316, 205, 46, 26);
      reverseRect(424, 632, 26, 54);
      ctx.clip();
      for (const pt of particles) {
        if (pt.f === FLOWS[0]) drawStreak(pt, (p) => p.depth > 0);
      }
      ctx.restore();

      // Gas in the pipes, swirling along them like in the Vajra.
      for (const pp of pipeParticles) drawPipeStreak(pp);
    }

    // A rectangle wound the other way, to cut a hole in a clip path.
    function reverseRect(x, y, w, h) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w, y);
      ctx.closePath();
    }

    function drawPipeStreak(pp) {
      const pipe = pp.pipe, f = pipe.flow;
      const SEGS = 14, ARC = 1.8;
      let prev = null;
      for (let k = SEGS; k >= 0; k--) {
        const back = ARC * (k / SEGS);
        const t = pp.theta - back;
        const s = pp.s - back * PIPE_SPEED / PIPE_SPIN;
        if (s < 0) { prev = null; continue; }
        const at = pointAt(pipe, s);
        const p = { x: at.x + at.nx * PIPE_R * Math.cos(t), y: at.y + at.ny * PIPE_R * Math.cos(t), depth: Math.sin(t) };
        if (prev) {
          const near = (p.depth + 1) / 2;
          const a = (f.back + (f.front - f.back) * near) * (1 - k / SEGS);
          ctx.strokeStyle = `rgba(${f.rgb}, ${a.toFixed(3)})`;
          ctx.lineWidth = 2.6 * (0.45 + 0.75 * near);
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        prev = p;
      }
    }

    function drawStreak(pt, only) {
      const SEGS = 22, ARC = 1.7;  // trail length in radians
      {
        const f = pt.f;
        let prev = null;
        for (let k = SEGS; k >= 0; k--) {
          const t = pt.theta - Math.sign(f.spin) * ARC * (k / SEGS);
          const y = pt.y - f.drift * (ARC * (k / SEGS)) / Math.abs(f.spin);
          const r = f.radius(y);
          if (r < 2) { prev = null; continue; }
          const p = project(t, y, r);
          if (prev && !hiddenByCore(p) && !hiddenByCore(prev) && (!only || (only(p) && only(prev)))) {
            const near = (p.depth + 1) / 2;                      // 0 far .. 1 near
            const fade = 1 - k / SEGS;                           // head bright, tail fades
            const a = (f.back + (f.front - f.back) * near) * fade;
            ctx.strokeStyle = `rgba(${f.rgb}, ${a.toFixed(3)})`;
            ctx.lineWidth = f.width * (0.45 + 0.75 * near);
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }
          prev = p;
        }
      }
    }

    function step(dt) {
      for (const pt of particles) {
        const f = pt.f;
        pt.theta += f.spin * dt;
        pt.y += f.drift * dt;
        if ((f.drift > 0 && pt.y > f.to) || (f.drift < 0 && pt.y < f.to)) {
          pt.y = f.from;
          pt.theta = Math.random() * Math.PI * 2;
        }
      }
      for (const pp of pipeParticles) {
        pp.theta += PIPE_SPIN * dt;
        pp.s += PIPE_SPEED * dt;
        if (pp.s > pp.pipe.length) pp.s -= pp.pipe.length;
      }
    }

    resize();
    draw();
    window.addEventListener("resize", () => { resize(); draw(); });
    if (reduce) return;

    let running = false, last = 0;
    function frame(now) {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      step(dt);
      draw();
      requestAnimationFrame(frame);
    }
    const start = () => { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } };
    const stop = () => { running = false; };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? start() : stop())))
        .observe(wrap);
    } else {
      start();
    }
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  }

  document.addEventListener("DOMContentLoaded", () =>
    document.querySelectorAll(".diagram-anim").forEach(init));
})();
