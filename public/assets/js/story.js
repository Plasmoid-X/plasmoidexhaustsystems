// "Follow the air": the whole system drawn live, with a camera that visits its six stages. It plays through once
// when it comes into view, then stops; Play, Back, Next and the numbered buttons run it by hand. The page scrolls
// past it like any other section.
// The Vajra is the CAD-accurate one from vajra-core.js. The UV ionizer, the bubbler, the pipe runs, the turbo and the
// engine are drawn from the owner's description to show how the system is connected: not to scale, not from CAD.
// The system is sealed, so every run here is joined end to end: nothing is left open except the filtered intake and
// the exhaust outlet. Without WebGL the section stays as the diagram and list that are in the HTML.
import * as THREE from "three";
import { createStage, buildVajra, createLens, createTuner, makeFlange, C, AIR_R, AIR_OFF, EXH_R, EXH_OFF, STUB } from "./vajra-core.js";

const section = document.querySelector("[data-story]");
const q = new URLSearchParams(location.search);
if (section) {
  section.classList.add("is-story");
  // Build the scene only when the reader is about to reach it.
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); start(); } }, { rootMargin: "100% 0px" });
  io.observe(section);
}

function start() {
  const pin = section.querySelector(".story-pin");
  const S = createStage(section.querySelector(".story-canvas"));
  if (!S) { section.classList.remove("is-story"); return; }
  const { scene, camera, small, reduce } = S;
  const { pipeMat, boltMat, steel } = S.mats;
  scene.fog = null; // the hero fades its far pipes into the dark; here everything has to stay visible from far back
  camera.far = 200;

  const vajra = buildVajra(S);
  scene.add(vajra.model);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const add = (geo, mat, parent = scene) => { const m = new THREE.Mesh(geo, mat); parent.add(m); return m; };
  const UP = V(0, 1, 0);
  const along = (m, dir) => { m.quaternion.setFromUnitVectors(UP, dir.clone().normalize()); return m; };

  // ---- Materials for the parts around the Vajra ----
  // The pipe runs are drawn see-through, so the flow inside them can be followed.
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xc4d6de, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 });
  const tank = new THREE.MeshPhysicalMaterial({ color: 0xd4e6ee, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.8 });
  const water = new THREE.MeshPhysicalMaterial({ color: 0x2f86c8, metalness: 0, roughness: 0.1, transparent: true, opacity: 0.34, depthWrite: false });
  const paint = new THREE.MeshStandardMaterial({ color: 0x1f3d3c, metalness: 0.35, roughness: 0.5 });
  const paintLight = new THREE.MeshStandardMaterial({ color: 0x2d7479, metalness: 0.35, roughness: 0.45 });
  const castIron = new THREE.MeshStandardMaterial({ color: 0x4b3a33, metalness: 0.7, roughness: 0.75 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xc8d0d4, metalness: 1, roughness: 0.38 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0e1214, metalness: 0.5, roughness: 0.7 });
  const pleat = new THREE.MeshStandardMaterial({ color: 0xd9d4c2, metalness: 0, roughness: 0.9 });
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9a5cff).multiplyScalar(2.6) });
  led.userData.glows = true;

  // ---- Pipe runs: straight lengths joined by bends ----
  function run(points, rad = 0.5) {
    const P = points.map((p) => V(...p)), path = new THREE.CurvePath();
    let prev = P[0];
    for (let i = 1; i < P.length; i++) {
      const cur = P[i], next = P[i + 1];
      if (!next) { path.add(new THREE.LineCurve3(prev, cur)); break; }
      const a = cur.clone().sub(prev).normalize(), b = next.clone().sub(cur).normalize();
      const r = Math.min(rad, cur.distanceTo(prev) / 2, next.distanceTo(cur) / 2);
      const p0 = cur.clone().addScaledVector(a, -r), p1 = cur.clone().addScaledVector(b, r);
      path.add(new THREE.LineCurve3(prev, p0));
      path.add(new THREE.QuadraticBezierCurve3(p0, cur, p1));
      prev = p1;
    }
    return path;
  }
  /** How far along a run (0..1) a condition first becomes true: where it reaches a lid, a joint, a wall. */
  function where(path, test) {
    for (let i = 0; i <= 600; i++) if (test(path.getPointAt(i / 600))) return i / 600;
    return 1;
  }
  /** A steel collar round a pipe: a clamp, a gland where it passes through a lid, the end of a fitting. */
  function collar(pos, dir, r, len = 0.16, k = 1.14) {
    const m = along(add(new THREE.CylinderGeometry(r * k, r * k, len, 48), pipeMat), dir);
    m.position.copy(pos);
    return m;
  }
  /**
   * A see-through pipe along a run, from `from` to `to` (fractions of the run). Each end is finished with a collar,
   * or with a bolted flange where it meets one of the Vajra's flanged stubs (start / end: "flange").
   */
  function pipe(path, r, { from = 0, to = 1, start = "collar", end = "collar" } = {}) {
    const curve = new THREE.Curve();
    curve.getPoint = (u, t) => path.getPointAt(from + (to - from) * u, t);
    curve.getTangent = (u, t) => path.getTangentAt(from + (to - from) * u, t);
    const m = add(new THREE.TubeGeometry(curve, 200, r, 36), glass);
    m.userData.noGlow = true;
    m.renderOrder = 2;
    const p0 = path.getPointAt(from), t0 = path.getTangentAt(from), p1 = path.getPointAt(to), t1 = path.getTangentAt(to);
    if (start === "flange") scene.add(makeFlange(S, p0, t0.clone().negate(), r)); else if (start) collar(p0, t0, r);
    if (end === "flange") scene.add(makeFlange(S, p1, t1, r)); else if (end) collar(p1, t1, r);
  }

  // ---- Flow along a run: soft points carried round the pipe's centre line ----
  const pointMat = (color, size, opacity) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uColorB: { value: new THREE.Color(color) }, uSize: { value: size }, uScale: { value: 1 }, uOpacity: { value: opacity } },
    vertexShader: "attribute float aAlpha, aMix; uniform float uSize, uScale; varying float vA, vM; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(uSize * uScale / -mv.z, 80.0); vA = aAlpha; vM = aMix; }",
    fragmentShader: "uniform vec3 uColor, uColorB; uniform float uOpacity; varying float vA, vM; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(mix(uColor, uColorB, vM), pow(max(1.0 - d, 0.0), 1.4) * vA * uOpacity); }",
  });
  const streams = [];
  /** colorB + turnAt: the flow changes colour that far along the run (the air once the UV light has ionized it). */
  function stream(path, r, { color, colorB, turnAt = 0.5, count = 26, trail = 26, gap = 0.006, size = 3.2, opacity = 0.3, speed = 0.09, turns = 5, fadeIn = 0.04, fadeOut = 0.04 }) {
    const SMP = 260, pts = path.getSpacedPoints(SMP), fr = path.computeFrenetFrames(SMP, false);
    const n = count * trail, pos = new Float32Array(n * 3), alpha = new Float32Array(n), mix = new Float32Array(n);
    const seeds = Array.from({ length: count }, () => ({ ph: Math.random(), a0: Math.random() * 6.283, rad: Math.sqrt(Math.random()) * r * 0.72, v: speed * (0.8 + Math.random() * 0.4) }));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    g.setAttribute("aMix", new THREE.BufferAttribute(mix, 1));
    g.boundingSphere = new THREE.Sphere(V(0, 0, 0), 60);
    const mat = pointMat(color, size, opacity);
    if (colorB) mat.uniforms.uColorB.value.set(colorB);
    const points = new THREE.Points(g, mat);
    points.frustumCulled = false;
    scene.add(points);
    streams.push({
      mat,
      update(time) {
        let i = 0;
        for (const s of seeds) {
          for (let k = 0; k < trail; k++, i++) {
            let t = (s.ph + time * s.v - k * gap) % 1; if (t < 0) t += 1;
            const f = t * SMP, i0 = Math.min(Math.floor(f), SMP - 1), w = f - i0;
            const p = pts[i0], q2 = pts[i0 + 1], N = fr.normals[i0], B = fr.binormals[i0];
            const a = s.a0 + t * turns * 6.283, c = Math.cos(a) * s.rad, d = Math.sin(a) * s.rad;
            pos[i * 3] = p.x + (q2.x - p.x) * w + N.x * c + B.x * d;
            pos[i * 3 + 1] = p.y + (q2.y - p.y) * w + N.y * c + B.y * d;
            pos[i * 3 + 2] = p.z + (q2.z - p.z) * w + N.z * c + B.z * d;
            alpha[i] = Math.pow(1 - k / trail, 1.3) * Math.min(1, t / fadeIn) * Math.min(1, (1 - t) / fadeOut);
            mix[i] = colorB ? Math.min(1, Math.max(0, (t - turnAt) * 6 + 0.5)) : 0;
          }
        }
        g.attributes.position.needsUpdate = true;
        g.attributes.aAlpha.needsUpdate = true;
        if (colorB) g.attributes.aMix.needsUpdate = true;
      },
    });
  }
  const few = small ? 0.6 : 1;
  const AIR = 0xdfeefc, IONIZED = 0xb18cff, PLASMOID = 0x7fc4ff, WARMED = 0x9fb6ff, HOT = 0xff6a24, COOLED = 0xd99a6a;

  // ---- 2. The bubbler: a sealed, clear column of water. Air comes down a dip tube and bubbles up through it. ----
  const ION = V(-3.9, -2.9, -2.3), ION_R = 0.82, ION_H = 3.3, WATER = ION_H * 0.52;
  const LID = ION.y + ION_H, DIP_X = ION.x - 0.38, OUT_X = ION.x + 0.38, DIP_R = 0.1;
  {
    const g = new THREE.Group();
    g.position.copy(ION);
    scene.add(g);
    const body = add(new THREE.CylinderGeometry(ION_R, ION_R, ION_H, 72, 1, true), tank, g);
    body.position.y = ION_H / 2; body.userData.noGlow = true; body.renderOrder = 3;
    const wtr = add(new THREE.CylinderGeometry(ION_R * 0.97, ION_R * 0.97, WATER, 72), water, g);
    wtr.position.y = WATER / 2 + 0.02; wtr.userData.noGlow = true; wtr.renderOrder = 1;
    for (const y of [-0.07, ION_H + 0.07]) add(new THREE.CylinderGeometry(ION_R * 1.1, ION_R * 1.1, 0.14, 72), steel, g).position.y = y; // base and lid
    for (let i = 0; i < 4; i++) { // the rods that clamp the lid down on the column
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      add(new THREE.CylinderGeometry(0.028, 0.028, ION_H + 0.34, 12), boltMat, g).position.set(Math.cos(a) * ION_R * 1.03, ION_H / 2, Math.sin(a) * ION_R * 1.03);
    }
    // The diffuser on the end of the dip tube, low in the water.
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 28), alloy, g).position.set(DIP_X - ION.x, 0.26, 0);
    // The filter under the outlet, which keeps the water out of the engine.
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 40), alloy, g).position.set(OUT_X - ION.x, ION_H - 0.15, 0);
  }
  // Bubbles leave the diffuser and spread as they rise.
  const bubbles = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uFrom: { value: V(DIP_X, ION.y + 0.34, ION.z) }, uMid: { value: ION.x }, uRise: { value: WATER - 0.36 }, uRad: { value: ION_R * 0.74 } },
    vertexShader: `attribute vec3 aSeed; uniform float uTime, uScale, uRise, uRad, uMid; uniform vec3 uFrom; varying float vA;
      void main() {
        float t = fract(aSeed.x + uTime * (0.16 + aSeed.y * 0.14));
        float spread = smoothstep(0.0, 0.45, t);
        float ang = aSeed.z * 6.2832, rr = sqrt(fract(aSeed.x * 7.31)) * uRad;
        vec3 p = vec3(mix(uFrom.x, uMid + cos(ang) * rr, spread) + sin(t * 17.0 + aSeed.x * 30.0) * 0.03, uFrom.y + t * uRise, uFrom.z + sin(ang) * rr * spread + cos(t * 13.0 + aSeed.y * 20.0) * 0.03);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.5 + aSeed.y) * (0.6 + t * 0.7) * 9.0 * uScale / -mv.z;
        vA = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.94, t);
      }`,
    fragmentShader: "varying float vA; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.86, d) * (0.18 + 0.82 * smoothstep(0.5, 0.95, d)); gl_FragColor = vec4(0.86, 0.95, 1.0, a * vA * 0.85); }",
  });
  {
    const n = Math.round(170 * few), seed = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) seed[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
    const pts = new THREE.Points(g, bubbles);
    pts.frustumCulled = false; pts.userData.noGlow = true; pts.renderOrder = 2;
    scene.add(pts);
  }

  // ---- The engine and its turbocharger (a sketch of one, to show where the system connects) ----
  const TURBO = V(3.0, -2.8, 0), COMP_Z = -0.62, TURB_Z = EXH_OFF, ENGINE = V(5.2, -3.75, -0.5);
  {
    const e = new THREE.Group();
    e.position.copy(ENGINE);
    scene.add(e);
    // Blocks with eased edges, so they catch the light like castings instead of looking like crates.
    const box = (w, h, d, x, y, z, mat, r = 0.06) => {
      const sh = new THREE.Shape(), hw = w / 2 - r, hh = h / 2 - r;
      sh.moveTo(-hw, -h / 2); sh.lineTo(hw, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh); sh.lineTo(w / 2, hh); sh.quadraticCurveTo(w / 2, h / 2, hw, h / 2);
      sh.lineTo(-hw, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh); sh.lineTo(-w / 2, -hh); sh.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2);
      const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 4, curveSegments: 8 });
      g.translate(0, 0, -(d - 2 * r) / 2);
      const m = add(g, mat, e); m.position.set(x, y, z); return m;
    };
    box(3.5, 1.25, 1.5, 0, 0, 0, paint); // block
    box(3.2, 0.5, 1.2, 0, -0.85, 0, dark); // sump
    box(3.4, 0.36, 1.3, 0, 0.8, 0, paint); // head
    box(3.2, 0.26, 0.9, 0, 1.1, 0, paintLight, 0.09); // rocker cover
    for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 20), alloy, e).position.set(-1.3 + i * 0.52, 1.27, 0); // caps
    for (let i = 0; i < 7; i++) box(0.07, 1.0, 0.06, -1.56 + i * 0.52, 0, 0.77, paint, 0.02); // ribs on the block's side
    const fly = add(new THREE.CylinderGeometry(0.82, 0.82, 0.4, 56), paint, e); fly.rotation.z = Math.PI / 2; fly.position.set(1.95, -0.05, 0);
    for (const [r, x, y, z] of [[0.3, -1.82, -0.25, 0], [0.16, -1.82, 0.45, 0.35], [0.13, -1.82, 0.4, -0.4]]) { // pulleys on the front
      const p = add(new THREE.CylinderGeometry(r, r, 0.12, 40), alloy, e); p.rotation.z = Math.PI / 2; p.position.set(x, y, z);
    }
    add(new THREE.CylinderGeometry(0.15, 0.15, 0.46, 32), alloy, e).position.set(0.9, -0.5, 0.92); // oil filter
    for (const x of [-1.2, 1.2]) for (const z of [-0.85, 0.85]) box(0.5, 0.16, 0.3, x, -1.18, z, dark, 0.03); // feet
    // Exhaust manifold along the front: it runs on past the block into the turbine housing.
    const log = add(new THREE.CylinderGeometry(0.17, 0.17, 3.6, 28), castIron, e); log.rotation.z = Math.PI / 2; log.position.set(-0.3, 0.92, 0.95);
    for (let i = 0; i < 6; i++) { const b = add(new THREE.CylinderGeometry(0.1, 0.1, 0.36, 16), castIron, e); b.rotation.x = Math.PI / 2; b.position.set(-1.3 + i * 0.52, 0.9, 0.78); }
    // Intake manifold along the back, with the branch into each cylinder.
    const intake = add(new THREE.CylinderGeometry(0.16, 0.16, 3.3, 28), alloy, e); intake.rotation.z = Math.PI / 2; intake.position.set(-0.1, 0.86, -0.92);
    for (let i = 0; i < 6; i++) { const b = add(new THREE.CylinderGeometry(0.085, 0.085, 0.32, 16), alloy, e); b.rotation.x = Math.PI / 2; b.position.set(-1.3 + i * 0.52, 0.86, -0.78); }
  }
  {
    // Turbine (exhaust side, cast iron) and compressor (air side, alloy) on one shaft.
    add(new THREE.TorusGeometry(0.4, 0.22, 24, 56), castIron).position.set(TURBO.x, TURBO.y, TURB_Z);
    add(new THREE.CylinderGeometry(0.34, 0.34, 0.36, 40), castIron).rotateX(Math.PI / 2).position.set(TURBO.x, TURBO.y, TURB_Z);
    add(new THREE.CylinderGeometry(EXH_R * 1.12, EXH_R * 1.12, 0.3, 40), castIron).position.set(TURBO.x, TURBO.y + 0.5, TURB_Z); // the turbine's outlet
    add(new THREE.TorusGeometry(0.36, 0.19, 24, 56), alloy).position.set(TURBO.x, TURBO.y, COMP_Z);
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.32, 40), alloy).rotateX(Math.PI / 2).position.set(TURBO.x, TURBO.y, COMP_Z);
    add(new THREE.CylinderGeometry(0.14, 0.14, TURB_Z - COMP_Z, 24), dark).rotateX(Math.PI / 2).position.set(TURBO.x, TURBO.y, (TURB_Z + COMP_Z) / 2); // the shaft's housing
    add(new THREE.CylinderGeometry(AIR_R * 1.12, AIR_R * 1.12, 0.3, 32), alloy).rotateX(Math.PI / 2).position.set(TURBO.x, TURBO.y, COMP_Z - 0.26); // the compressor's inlet
    add(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 28), alloy).position.set(TURBO.x + 0.1, TURBO.y + 0.5, COMP_Z); // …and its outlet
  }

  // ---- The runs. Each is the path its flow follows; the pipe is drawn over the part of it outside the units. ----
  const yAir = C + AIR_OFF, yExh = C + EXH_OFF, UV_Y = LID + 0.85, IN_X = -8.3;
  // 1. Fresh air in through a filter, along the UV ionizer tube, and down the dip tube into the water.
  const airIn = run([[IN_X, UV_Y, ION.z], [DIP_X, UV_Y, ION.z], [DIP_X, ION.y + 0.3, ION.z]], 0.36);
  const UV_R = 0.2, uvEnd = where(airIn, (p) => p.x > DIP_X - 0.55), atLid = where(airIn, (p) => p.x > DIP_X - 0.01 && p.y < LID + 0.14);
  pipe(airIn, UV_R, { to: uvEnd, start: null }); // the UV tube
  pipe(airIn, DIP_R * 1.5, { from: uvEnd, to: atLid, start: null }); // the bend down to the lid
  pipe(airIn, DIP_R, { from: atLid, to: 0.985, start: null, end: null }); // the dip tube, inside the bubbler
  collar(airIn.getPointAt(uvEnd), airIn.getTangentAt(uvEnd), UV_R, 0.2, 1.2); // the reducer at the end of the UV tube
  {
    // The air filter on the intake: a pleated element between two end caps.
    const fx = IN_X - 0.42;
    const el = along(add(new THREE.CylinderGeometry(0.36, 0.36, 0.7, 40, 1), pleat), V(1, 0, 0)); el.position.set(fx, UV_Y, ION.z);
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; const rib = add(new THREE.BoxGeometry(0.7, 0.03, 0.02), pleat); rib.position.set(fx, UV_Y + Math.cos(a) * 0.365, ION.z + Math.sin(a) * 0.365); rib.rotation.x = a; }
    for (const dx of [-0.37, 0.37]) along(add(new THREE.CylinderGeometry(0.39, 0.39, 0.05, 40), pipeMat), V(1, 0, 0)).position.set(fx + dx, UV_Y, ION.z);
    collar(V(IN_X + 0.02, UV_Y, ION.z), V(1, 0, 0), UV_R, 0.14);
    // The UV ionizer: rings of small LEDs along the tube, shining inwards.
    const dot = new THREE.SphereGeometry(0.024, 10, 8), x0 = IN_X + 0.45, x1 = DIP_X - 0.75, rings = 9;
    for (let k = 0; k < rings; k++) {
      const x = x0 + ((x1 - x0) * k) / (rings - 1);
      along(add(new THREE.CylinderGeometry(UV_R * 1.07, UV_R * 1.07, 0.07, 40, 1, true), pipeMat), V(1, 0, 0)).position.set(x, UV_Y, ION.z);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + k * 0.4; add(dot, led).position.set(x, UV_Y + Math.cos(a) * UV_R * 0.9, ION.z + Math.sin(a) * UV_R * 0.9); }
    }
    const haze = along(add(new THREE.CylinderGeometry(UV_R * 0.92, UV_R * 0.92, x1 - x0 + 0.3, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x8a4dff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })), V(1, 0, 0));
    haze.position.set((x0 + x1) / 2, UV_Y, ION.z); haze.userData.noGlow = true;
    for (const f of [0.2, 0.8]) { const l = new THREE.PointLight(0x9a5cff, 1.4, 2.4, 2); l.position.set(x0 + (x1 - x0) * f, UV_Y, ION.z + 0.1); scene.add(l); }
  }
  stream(airIn, UV_R * 0.9, { color: AIR, colorB: IONIZED, turnAt: 0.22, count: Math.round(22 * few), trail: 22, gap: 0.008, size: 2.8, opacity: 0.3, speed: 0.1, turns: 2, fadeOut: 0.02 });
  // 2-3. Plasmoids leave the water, pass the filter, go out through the lid and across to the Vajra's upper air port.
  const toVajra = run([[OUT_X, ION.y + WATER + 0.05, ION.z], [OUT_X, yAir, ION.z], [-AIR_OFF, yAir, ION.z], [-AIR_OFF, yAir, -STUB]], 0.42);
  pipe(toVajra, AIR_R, { from: where(toVajra, (p) => p.y > LID + 0.14), end: "flange" });
  stream(toVajra, AIR_R, { color: PLASMOID, count: Math.round(34 * few), trail: 26, gap: 0.004, size: 3.0, opacity: 0.3, speed: 0.07, turns: 6, fadeIn: 0.08, fadeOut: 0.03 });
  // 5. Warmed plasmoids from the lower air port round to the turbo's compressor.
  const toTurbo = run([[AIR_OFF, -yAir, -STUB], [AIR_OFF, -yAir, -2.5], [TURBO.x, -yAir, -2.5], [TURBO.x, TURBO.y, -2.5], [TURBO.x, TURBO.y, COMP_Z - 0.3]], 0.42);
  pipe(toTurbo, AIR_R, { start: "flange", end: null });
  stream(toTurbo, AIR_R, { color: WARMED, count: Math.round(34 * few), trail: 26, gap: 0.004, size: 3.0, opacity: 0.3, speed: 0.07, turns: 6 });
  // …and on from the compressor into the engine's intake manifold.
  const inX = ENGINE.x - 0.1 - 1.65 + 0.12, inY = ENGINE.y + 0.86, inZ = ENGINE.z - 0.92;
  const toEngine = run([[TURBO.x + 0.1, TURBO.y + 0.5, COMP_Z], [TURBO.x + 0.1, -1.95, COMP_Z], [TURBO.x + 0.1, -1.95, inZ], [TURBO.x + 0.1, inY, inZ], [inX, inY, inZ]], 0.24);
  pipe(toEngine, 0.15, { from: 0.04, start: null, end: null });
  stream(toEngine, 0.12, { color: WARMED, count: Math.round(12 * few), trail: 18, gap: 0.01, size: 2.4, opacity: 0.26, speed: 0.2, turns: 2 });
  // 4. Hot exhaust from the turbine up into the Vajra's lower exhaust port.
  const fromEngine = run([[TURBO.x, TURBO.y + 0.55, TURB_Z], [TURBO.x, -yExh, TURB_Z], [STUB, -yExh, TURB_Z]], 0.5);
  pipe(fromEngine, EXH_R, { start: null, end: "flange" });
  stream(fromEngine, EXH_R * 0.9, { color: HOT, count: Math.round(40 * few), trail: 26, gap: 0.006, size: 3.4, opacity: 0.3, speed: 0.11, turns: 3 });
  // 6. Cooler exhaust from the upper exhaust port, away and out of the boat.
  const out = run([[-STUB, yExh, EXH_OFF], [-3.0, yExh, EXH_OFF], [-3.0, 11, EXH_OFF]], 0.6);
  pipe(out, EXH_R, { to: 0.9, start: "flange" });
  stream(out, EXH_R * 0.9, { color: COOLED, count: Math.round(40 * few), trail: 26, gap: 0.005, size: 3.4, opacity: 0.2, speed: 0.07, turns: 3, fadeOut: 0.3 });

  const lens = createLens(S);

  // ---- Names on the parts ----
  const places = { ionizer: V((IN_X + DIP_X) / 2, UV_Y + 0.42, ION.z), bubbler: V(ION.x + 1.25, ION.y + 1.4, ION.z), vajra: V(0, C + 1.25, 0), turbo: V(TURBO.x, TURBO.y + 1.05, COMP_Z), engine: V(5.6, -2.25, -0.5) };
  const tags = [...section.querySelectorAll("[data-tag]")].map((el) => ({ el, at: places[el.dataset.tag] })).filter((t) => t.at);
  const poster = q.get("poster") === "1"; // for making a still: no words to leave room for, no tags
  if (poster) section.classList.add("is-poster");
  const tv = new THREE.Vector3();
  function placeTags() {
    for (const t of tags) {
      tv.copy(t.at).project(camera);
      // Not behind the camera, not at the very edge, and not under the words.
      const on = !poster && tv.z < 1 && Math.abs(tv.x) < 0.96 && Math.abs(tv.y) < 0.92 && (camera.aspect > 1.15 ? tv.x > -0.12 : tv.y > -0.1 && tv.y < 0.74);
      t.el.style.opacity = on ? 1 : 0;
      t.el.style.transform = `translate(${((tv.x + 1) / 2) * w}px, ${((1 - tv.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  // ---- The camera's stops: where it stands and what it looks at for each stage (0 is the whole system) ----
  const SHOTS = [
    { pos: [2.4, 1.4, 27], look: [1.5, -0.5, -0.6], air: 1, exh: 1, slide: 0.19 },
    { pos: [-7.9, 2.6, 5.6], look: [-7.45, 1.15, -2.3], air: 1, exh: 0.5 }, // 1 the UV ionizer
    { pos: [-1.9, 0.5, 5.6], look: [-3.9, -1.0, -2.3], air: 1, exh: 0.5 }, // 2 the bubbler
    { pos: [2.6, 2.6, 8.8], look: [0.55, 0.7, 0], air: 1.25, exh: 0.3 }, // 3 the Vajra: the air's spiral
    { pos: [2.0, -1.6, 7.6], look: [0, -0.75, 0], air: 0.45, exh: 1.35 }, // 4 heat exchange: the exhaust's spiral
    { pos: [6.6, 0.7, 8.4], look: [3.6, -2.6, -0.6], air: 1, exh: 0.8 }, // 5 into the engine
    { pos: [-2.0, 4.2, 12.5], look: [-1.3, 3.1, 0.3], air: 0.5, exh: 1.2 }, // 6 exhaust out
  ].map((s) => ({ pos: V(...s.pos), look: V(...s.look), air: s.air, exh: s.exh, slide: poster ? 0 : s.slide ?? 0.22 }));
  if (poster) { SHOTS[0].pos.set(1.2, 3.0, 20.5); SHOTS[0].look.set(-0.85, -0.2, -0.6); }

  // ---- The player: which stage is showing, moving between them, and playing through once ----
  const steps = [...section.querySelectorAll(".story-steps > li")];
  const rail = section.querySelector(".story-rail");
  const playBtn = section.querySelector("[data-story-play]"), backBtn = section.querySelector("[data-story-back]"), nextBtn = section.querySelector("[data-story-next]");
  const TRAVEL = reduce ? 0 : 2.6, HOLD = 7;
  let stage = Math.min(6, Math.max(0, parseInt(q.get("stage") || "0", 10) || 0)), playing = false, played = false, holdFor = 0;
  const cam = { pos: SHOTS[stage].pos.clone(), look: SHOTS[stage].look.clone(), air: SHOTS[stage].air, exh: SHOTS[stage].exh, slide: SHOTS[stage].slide };
  let move = null; // { from, to, t }
  function show() {
    steps.forEach((li, i) => li.classList.toggle("is-on", i + 1 === stage));
    section.classList.toggle("is-opening", stage === 0);
    section.classList.toggle("is-ending", stage === 6);
    section.classList.toggle("is-playing", playing);
    if (rail) [...rail.querySelectorAll("button")].forEach((b, i) => b.setAttribute("aria-current", String(i + 1 === stage)));
    if (playBtn) { playBtn.textContent = playing ? "Pause" : played && stage === 0 ? "Replay" : "Play"; playBtn.setAttribute("aria-pressed", String(playing)); }
    if (backBtn) backBtn.disabled = stage <= 1;
    if (nextBtn) nextBtn.disabled = stage >= 6;
  }
  function go(n) {
    stage = Math.min(6, Math.max(0, n));
    move = { from: { pos: cam.pos.clone(), look: cam.look.clone(), air: cam.air, exh: cam.exh, slide: cam.slide }, to: SHOTS[stage], t: 0 };
    holdFor = HOLD;
    show();
    if (reduce) kick();
  }
  const stop = () => { playing = false; show(); };
  function play() {
    playing = true;
    go(stage >= 6 ? 1 : stage + 1);
  }
  if (rail) {
    rail.innerHTML = steps.map((li, i) => `<li><button type="button" aria-current="false"><span>${i + 1}</span><em>${li.querySelector("h3").textContent}</em></button></li>`).join("");
    [...rail.querySelectorAll("button")].forEach((b, i) => b.addEventListener("click", () => { playing = false; go(i + 1); }));
  }
  if (playBtn) playBtn.addEventListener("click", () => (playing ? stop() : play()));
  if (backBtn) backBtn.addEventListener("click", () => { playing = false; go(stage - 1); });
  if (nextBtn) nextBtn.addEventListener("click", () => { playing = false; go(stage + 1); });
  pin.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { playing = false; go(stage + 1); } else if (e.key === "ArrowLeft") { playing = false; go(Math.max(1, stage - 1)); }
  });

  // ---- Size and loop ----
  let w = 0, h = 0;
  function resize() {
    w = pin.clientWidth; h = pin.clientHeight;
    if (!w || !h) return;
    lens.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const s = h * S.pixelRatio * 0.012;
    vajra.scale(s);
    for (const st of streams) st.mat.uniforms.uScale.value = s;
    bubbles.uniforms.uScale.value = s;
    if (reduce) draw(0);
  }
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3(), fwd = new THREE.Vector3(), side = new THREE.Vector3(), upv = new THREE.Vector3();
  const clock = new THREE.Clock();
  let time = 2;
  function draw(dt) {
    if (move) {
      move.t = TRAVEL ? Math.min(1, move.t + dt / TRAVEL) : 1;
      const t = move.t, e = t * t * t * (t * (t * 6 - 15) + 10), a = move.from, b = move.to;
      cam.pos.lerpVectors(a.pos, b.pos, e); cam.look.lerpVectors(a.look, b.look, e);
      cam.air = a.air + (b.air - a.air) * e; cam.exh = a.exh + (b.exh - a.exh) * e; cam.slide = a.slide + (b.slide - a.slide) * e;
      if (t >= 1) move = null;
    } else if (playing) {
      holdFor -= dt;
      if (holdFor <= 0) {
        if (stage >= 6) { played = true; playing = false; go(0); } // back to the whole system, and stop
        else go(stage + 1);
      }
    }
    // A narrow screen stands further back; and the picture is slid aside to leave room for the words.
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    wantPos.copy(cam.pos).sub(cam.look).multiplyScalar(Math.min(2.7, Math.max(1, 1.5 / camera.aspect))).add(cam.look);
    wantLook.copy(cam.look);
    const d = wantPos.distanceTo(wantLook);
    fwd.copy(wantLook).sub(wantPos).normalize(); side.crossVectors(fwd, UP).normalize(); upv.crossVectors(side, fwd);
    if (camera.aspect > 1.15) { const s = -2 * d * tan * camera.aspect * cam.slide; wantPos.addScaledVector(side, s); wantLook.addScaledVector(side, s); }
    else if (!poster) { const s = -2 * d * tan * 0.2; wantPos.addScaledVector(upv, s); wantLook.addScaledVector(upv, s); }
    camera.position.copy(wantPos);
    if (!reduce && !poster) camera.position.addScaledVector(side, Math.sin(time * 0.3) * 0.12).addScaledVector(upv, Math.cos(time * 0.23) * 0.08); // it never sits quite still
    camera.lookAt(wantLook);
    vajra.set(time, 1, cam.air, cam.exh);
    bubbles.uniforms.uTime.value = time;
    for (const st of streams) st.update(time);
    lens.render();
    placeTags();
  }
  const tune = createTuner(S, lens, resize);
  let visible = false, raf = 0;
  function frame() {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    draw(dt);
    if (reduce) return; // for people who ask for less motion: one picture per stage, redrawn only when it changes
    tune();
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) { clock.getDelta(); raf = requestAnimationFrame(frame); } };
  new ResizeObserver(resize).observe(pin);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(section);
  // Play through once, the first time most of it is on screen.
  if (!reduce && !poster && q.get("stage") === null) {
    const once = new IntersectionObserver(([e]) => { if (e.isIntersecting) { once.disconnect(); setTimeout(() => { if (stage === 0 && !move) play(); }, 1400); } }, { threshold: 0.6 });
    once.observe(pin);
  }
  document.addEventListener("visibilitychange", kick);
  show();
  resize();
  section.classList.add("is-drawn");
}
