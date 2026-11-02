// Animated system diagram: two vortices drawn in 3D on a canvas over the
// diagram image (coordinates are the image's own 700 x 847 pixels).
// Intake air swirls clockwise and drifts down; exhaust swirls the other way
// in the outer shell and drifts up. Each streak runs round a tilted circle,
// so the near side is bright and thick, the far side faint and hidden behind
// the stainless core.
(function () {
  const W = 700, H = 847;
  const TOP = { x: 437, y: 223 }, BOT = { x: 437, y: 558 };
  const CORE_R = 44;          // sealed stainless core
  const TILT = 0.3;           // how far we look down on the vortex
  const TUBE = { y0: 296, y1: 488 };

  // Radius of each vortex at height y.
  const sphereR = (y, c, r) => {
    const h = y - c.y;
    return Math.abs(h) < r ? Math.sqrt(r * r - h * h) : 0;
  };
  const inTube = (y) => y > TUBE.y0 && y < TUBE.y1;
  const intakeR = (y) => Math.max(
    0.8 * sphereR(y, TOP, 79), 0.8 * sphereR(y, BOT, 79), inTube(y) ? 11 : 0);
  const exhaustR = (y) => Math.max(
    sphereR(y, TOP, 96), sphereR(y, BOT, 96), inTube(y) ? 25.5 : 0);

  const FLOWS = [
    { radius: intakeR, from: 150, to: 632, drift: 13, spin: 1.5, count: 34,
      rgb: "14, 92, 186", front: 0.95, back: 0.3, width: 3,
      // stays in the blue chamber of each sphere and the tube's blue core
      clip: (ctx) => {
        ctx.arc(TOP.x, TOP.y, 79, 0, Math.PI * 2);
        ctx.moveTo(BOT.x + 79, BOT.y);
        ctx.arc(BOT.x, BOT.y, 79, 0, Math.PI * 2);
        ctx.rect(424, 290, 27, 200);
      } },
    { radius: exhaustR, from: 662, to: 130, drift: -11, spin: -1.2, count: 64,
      rgb: "196, 18, 24", front: 0.95, back: 0.35, width: 3,
      // stays in the orange shell of each sphere and the tube's orange sides
      clip: (ctx) => {
        for (const c of [TOP, BOT]) {
          ctx.moveTo(c.x + 104, c.y);
          ctx.arc(c.x, c.y, 104, 0, Math.PI * 2, false);
          ctx.moveTo(c.x + 87, c.y);
          ctx.arc(c.x, c.y, 87, 0, Math.PI * 2, true);
        }
        ctx.rect(405, 300, 12, 180);
        ctx.rect(457, 300, 11, 180);
      } },
  ];

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
        f.clip(ctx);
        ctx.clip();
        for (const pt of particles) {
          if (pt.f === f) drawStreak(pt);
        }
        ctx.restore();
      }
    }

    function drawStreak(pt) {
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
          if (prev && !hiddenByCore(p) && !hiddenByCore(prev)) {
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
