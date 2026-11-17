// "Follow the air": the whole system drawn live, and a camera that moves through its six stages as the page scrolls.
// The Vajra is the CAD-accurate one from vajra-core.js. The ionizer, the pipe runs, the turbo and the engine are
// drawn from the owner's description to show how the system is connected: they are not to scale and not from CAD.
// Without WebGL, or for people who ask for reduced motion, the section stays as the diagram and list it is in the HTML.
import * as THREE from "three";
import { createStage, buildVajra, createLens, createTuner, makeFlange, C, AIR_R, AIR_OFF, EXH_R, EXH_OFF, STUB } from "./vajra-core.js";

const section = document.querySelector("[data-story]");
const HEADER = 76;
if (section && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  section.classList.add("is-story");
  // Build the scene only when the reader is about to reach it.
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); start(); } }, { rootMargin: "120% 0px" });
  io.observe(section);
}

function start() {
  const pin = section.querySelector(".story-pin");
  const S = createStage(section.querySelector(".story-canvas"));
  if (!S) { section.classList.remove("is-story"); return; }
  const { scene, camera, small } = S;
  const { pipeMat, boltMat, steel } = S.mats;
  scene.fog = null; // the hero fades its far pipes into the dark; here everything has to stay visible from far back
  camera.far = 200;

  const vajra = buildVajra(S);
  scene.add(vajra.model);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const add = (geo, mat, parent = scene) => { const m = new THREE.Mesh(geo, mat); parent.add(m); return m; };
  const UP = V(0, 1, 0);

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
  const uv = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9a5cff).multiplyScalar(2.4) });
  uv.userData.glows = true;

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
  function collar(pos, dir, r, len = 0.16) {
    const m = add(new THREE.CylinderGeometry(r * 1.14, r * 1.14, len, 48), pipeMat);
    m.position.copy(pos);
    m.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  }
  /** A see-through pipe along a run, with a steel collar at each end. `from`/`to` trim the drawn pipe (0..1). */
  function pipe(path, r, { from = 0, to = 1, flangeEnd = false } = {}) {
    const part = { getPointAt: (u, t) => path.getPointAt(from + (to - from) * u, t), getTangentAt: (u, t) => path.getTangentAt(from + (to - from) * u, t) };
    const curve = new THREE.Curve();
    curve.getPoint = (u, t) => part.getPointAt(u, t);
    curve.getTangent = (u, t) => part.getTangentAt(u, t);
    const m = add(new THREE.TubeGeometry(curve, 180, r, 36), glass);
    m.userData.noGlow = true;
    m.renderOrder = 2;
    collar(path.getPointAt(from), path.getTangentAt(from), r);
    if (flangeEnd) scene.add(makeFlange(S, path.getPointAt(to), path.getTangentAt(to), r));
    else collar(path.getPointAt(to), path.getTangentAt(to), r);
  }

  // ---- Flow along a run: soft points carried round the pipe's centre line ----
  const pointMat = (color, size, opacity) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uScale: { value: 1 }, uOpacity: { value: opacity } },
    vertexShader: "attribute float aAlpha; uniform float uSize, uScale; varying float vA; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(uSize * uScale / -mv.z, 80.0); vA = aAlpha; }",
    fragmentShader: "uniform vec3 uColor; uniform float uOpacity; varying float vA; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(uColor, pow(max(1.0 - d, 0.0), 1.4) * vA * uOpacity); }",
  });
  const streams = [];
  function stream(path, r, { color, count = 26, trail = 26, gap = 0.006, size = 3.2, opacity = 0.3, speed = 0.09, turns = 5, fadeIn = 0.04, fadeOut = 0.04 }) {
    const SMP = 260, pts = path.getSpacedPoints(SMP), fr = path.computeFrenetFrames(SMP, false);
    const n = count * trail, pos = new Float32Array(n * 3), alpha = new Float32Array(n);
    const seeds = Array.from({ length: count }, () => ({ ph: Math.random(), a0: Math.random() * 6.283, rad: Math.sqrt(Math.random()) * r * 0.72, v: speed * (0.8 + Math.random() * 0.4) }));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    g.boundingSphere = new THREE.Sphere(V(0, 0, 0), 40);
    const mat = pointMat(color, size, opacity);
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
            const p = pts[i0], q = pts[i0 + 1], N = fr.normals[i0], B = fr.binormals[i0];
            const a = s.a0 + t * turns * 6.283, c = Math.cos(a) * s.rad, d = Math.sin(a) * s.rad;
            pos[i * 3] = p.x + (q.x - p.x) * w + N.x * c + B.x * d;
            pos[i * 3 + 1] = p.y + (q.y - p.y) * w + N.y * c + B.y * d;
            pos[i * 3 + 2] = p.z + (q.z - p.z) * w + N.z * c + B.z * d;
            alpha[i] = Math.pow(1 - k / trail, 1.3) * Math.min(1, t / fadeIn) * Math.min(1, (1 - t) / fadeOut);
          }
        }
        g.attributes.position.needsUpdate = true;
        g.attributes.aAlpha.needsUpdate = true;
      },
    });
  }
  const few = small ? 0.6 : 1;
  const AIR = 0xdfeefc, PLASMOID = 0x7fc4ff, WARMED = 0x9fb6ff, HOT = 0xff6a24, COOLED = 0xd99a6a;

  // ---- 2. The ionizer: a clear column of water with a UV lamp above it ----
  const ION = V(-3.9, -2.9, -2.3), ION_R = 0.82, ION_H = 3.3, WATER = ION_H * 0.46;
  {
    const g = new THREE.Group();
    g.position.copy(ION);
    scene.add(g);
    const body = add(new THREE.CylinderGeometry(ION_R, ION_R, ION_H, 72, 1, true), tank, g);
    body.position.y = ION_H / 2; body.userData.noGlow = true; body.renderOrder = 3;
    const wtr = add(new THREE.CylinderGeometry(ION_R * 0.97, ION_R * 0.97, WATER, 72), water, g);
    wtr.position.y = WATER / 2 + 0.02; wtr.userData.noGlow = true; wtr.renderOrder = 1;
    for (const y of [-0.07, ION_H + 0.07]) add(new THREE.CylinderGeometry(ION_R * 1.1, ION_R * 1.1, 0.14, 72), steel, g).position.y = y;
    for (let i = 0; i < 4; i++) { // the rods that clamp the two end plates together
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const rod = add(new THREE.CylinderGeometry(0.028, 0.028, ION_H + 0.34, 12), boltMat, g);
      rod.position.set(Math.cos(a) * ION_R * 1.03, ION_H / 2, Math.sin(a) * ION_R * 1.03);
    }
    // The pipe the air bubbles out of, low in the water.
    const sparger = add(new THREE.CylinderGeometry(0.05, 0.05, ION_R * 1.5, 16), pipeMat, g);
    sparger.rotation.z = Math.PI / 2; sparger.position.y = 0.3;
    // The UV lamp, and the light it throws on the water.
    const lamp = add(new THREE.TorusGeometry(ION_R * 0.5, 0.045, 12, 64), uv, g);
    lamp.rotation.x = Math.PI / 2; lamp.position.y = ION_H - 0.38;
    const cone = add(new THREE.CylinderGeometry(ION_R * 0.5, ION_R * 0.9, ION_H - 0.38 - WATER, 48, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x8a4dff, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), g);
    cone.position.y = WATER + (ION_H - 0.38 - WATER) / 2; cone.userData.noGlow = true;
    const glow = new THREE.PointLight(0x9a5cff, 2.2, 3.2, 2); glow.position.y = ION_H - 0.6; g.add(glow);
    // The filter under the outlet, which keeps the water out of the engine.
    const filter = add(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 40), alloy, g); filter.position.y = ION_H - 0.13;
  }
  // Bubbles rising through the water.
  const bubbles = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uBase: { value: V(ION.x, ION.y + 0.32, ION.z) }, uRise: { value: WATER - 0.34 }, uRad: { value: ION_R * 0.7 } },
    vertexShader: `attribute vec3 aSeed; uniform float uTime, uScale, uRise, uRad; uniform vec3 uBase; varying float vA;
      void main() {
        float t = fract(aSeed.x + uTime * (0.16 + aSeed.y * 0.14));
        float along = aSeed.z * 2.0 - 1.0;
        vec3 p = uBase + vec3(along * uRad + sin(t * 17.0 + aSeed.x * 30.0) * 0.035, t * uRise, (fract(aSeed.x * 7.31) - 0.5) * uRad * 0.9 * sqrt(1.0 - along * along) + cos(t * 13.0 + aSeed.y * 20.0) * 0.035);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.5 + aSeed.y) * (0.7 + t * 0.6) * 9.0 * uScale / -mv.z;
        vA = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.94, t);
      }`,
    fragmentShader: "varying float vA; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.86, d) * (0.18 + 0.82 * smoothstep(0.5, 0.95, d)); gl_FragColor = vec4(0.86, 0.95, 1.0, a * vA * 0.85); }",
  });
  {
    const n = Math.round(150 * few), seed = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) seed[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
    const pts = new THREE.Points(g, bubbles);
    pts.frustumCulled = false; pts.userData.noGlow = true; pts.renderOrder = 2;
    scene.add(pts);
  }

  // ---- The engine and its turbocharger (a sketch of one, to show where the system connects) ----
  const TURBO = V(3.0, -2.8, 0), COMP_Z = -0.62, TURB_Z = EXH_OFF;
  {
    const e = new THREE.Group();
    e.position.set(5.2, -3.75, -0.5);
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
    const filter = add(new THREE.CylinderGeometry(0.15, 0.15, 0.46, 32), alloy, e); filter.position.set(0.9, -0.5, 0.92); // oil filter
    for (const x of [-1.2, 1.2]) for (const z of [-0.85, 0.85]) box(0.5, 0.16, 0.3, x, -1.18, z, dark, 0.03); // feet
    // Exhaust manifold along the front, feeding the turbine.
    const log = add(new THREE.CylinderGeometry(0.17, 0.17, 3.2, 28), castIron, e); log.rotation.z = Math.PI / 2; log.position.set(-0.25, 0.86, 0.95);
    for (let i = 0; i < 6; i++) { const b = add(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 16), castIron, e); b.rotation.x = Math.PI / 2; b.position.set(-1.3 + i * 0.52, 0.86, 0.78); }
    // Intake manifold along the back.
    const intake = add(new THREE.CylinderGeometry(0.15, 0.15, 3.0, 28), alloy, e); intake.rotation.z = Math.PI / 2; intake.position.set(0, 0.86, -0.92);
    for (let i = 0; i < 6; i++) { const b = add(new THREE.CylinderGeometry(0.085, 0.085, 0.3, 16), alloy, e); b.rotation.x = Math.PI / 2; b.position.set(-1.3 + i * 0.52, 0.86, -0.78); }
  }
  {
    // Turbine (exhaust side, cast iron) and compressor (air side, alloy) on one shaft.
    const turbine = add(new THREE.TorusGeometry(0.36, 0.19, 24, 56), castIron); turbine.position.set(TURBO.x, TURBO.y, TURB_Z);
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 40), castIron).rotateX(Math.PI / 2).position.set(TURBO.x, TURBO.y, TURB_Z);
    const comp = add(new THREE.TorusGeometry(0.34, 0.17, 24, 56), alloy); comp.position.set(TURBO.x, TURBO.y, COMP_Z);
    add(new THREE.CylinderGeometry(0.28, 0.28, 0.3, 40), alloy).rotateX(Math.PI / 2).position.set(TURBO.x, TURBO.y, COMP_Z);
    add(new THREE.CylinderGeometry(0.13, 0.13, TURB_Z - COMP_Z, 24), dark).rotateX(Math.PI / 2).position.set(TURBO.x, TURBO.y, (TURB_Z + COMP_Z) / 2);
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 32), alloy).rotateX(Math.PI / 2).position.set(TURBO.x, TURBO.y, COMP_Z - 0.2); // compressor inlet
  }

  // ---- The runs between them. Each is the path its flow follows; the pipe is drawn over the part outside the units. ----
  const yAir = C + AIR_OFF, yExh = C + EXH_OFF;
  // 1. Fresh air into the bottom of the ionizer.
  const airIn = run([[-7.2, ION.y + 0.3, ION.z], [ION.x - ION_R * 0.75, ION.y + 0.3, ION.z]]);
  pipe(airIn, 0.16, { to: 0.86 });
  stream(airIn, 0.13, { color: AIR, count: Math.round(14 * few), trail: 18, gap: 0.012, size: 2.6, opacity: 0.22, speed: 0.16, turns: 1 });
  // 2-3. Plasmoids rise off the water, out of the top of the ionizer and across to the Vajra's upper air port.
  const top = ION.y + ION_H;
  const toVajra = run([[ION.x, ION.y + WATER, ION.z], [ION.x, yAir, ION.z], [-AIR_OFF, yAir, ION.z], [-AIR_OFF, yAir, -STUB]], 0.42);
  const lenV = toVajra.getLength(), inTank = (top - (ION.y + WATER)) / lenV;
  pipe(toVajra, AIR_R, { from: inTank + 0.005, flangeEnd: true });
  stream(toVajra, AIR_R, { color: PLASMOID, count: Math.round(34 * few), trail: 26, gap: 0.004, size: 3.0, opacity: 0.3, speed: 0.07, turns: 6, fadeIn: 0.08, fadeOut: 0.03 });
  // 5. Warmed plasmoids from the lower air port round to the turbo's compressor.
  const toTurbo = run([[AIR_OFF, -yAir, -STUB], [AIR_OFF, -yAir, -2.5], [TURBO.x, -yAir, -2.5], [TURBO.x, TURBO.y, -2.5], [TURBO.x, TURBO.y, COMP_Z - 0.28]], 0.42);
  pipe(toTurbo, AIR_R);
  stream(toTurbo, AIR_R, { color: WARMED, count: Math.round(34 * few), trail: 26, gap: 0.004, size: 3.0, opacity: 0.3, speed: 0.07, turns: 6 });
  // …and on from the compressor into the engine's intake.
  const toEngine = run([[TURBO.x + 0.25, TURBO.y + 0.36, COMP_Z], [TURBO.x + 0.25, -2.89, COMP_Z], [TURBO.x + 0.25, -2.89, -1.42], [3.9, -2.89, -1.42]], 0.25);
  pipe(toEngine, 0.13);
  stream(toEngine, 0.11, { color: WARMED, count: Math.round(12 * few), trail: 18, gap: 0.01, size: 2.4, opacity: 0.26, speed: 0.2, turns: 2 });
  // 4. Hot exhaust from the turbine up into the Vajra's lower exhaust port.
  const fromEngine = run([[TURBO.x, TURBO.y + 0.4, TURB_Z], [TURBO.x, -yExh, TURB_Z], [STUB, -yExh, TURB_Z]], 0.5);
  pipe(fromEngine, EXH_R * 0.86);
  stream(fromEngine, EXH_R * 0.8, { color: HOT, count: Math.round(40 * few), trail: 26, gap: 0.006, size: 3.4, opacity: 0.3, speed: 0.11, turns: 3 });
  // 6. Cooler exhaust from the upper exhaust port, away and out of the boat.
  const out = run([[-STUB, yExh, EXH_OFF], [-3.0, yExh, EXH_OFF], [-3.0, 11, EXH_OFF]], 0.6);
  pipe(out, EXH_R * 0.86, { to: 0.9 });
  stream(out, EXH_R * 0.8, { color: COOLED, count: Math.round(40 * few), trail: 26, gap: 0.005, size: 3.4, opacity: 0.2, speed: 0.07, turns: 3, fadeOut: 0.3 });

  const lens = createLens(S);

  // ---- Names on the parts ----
  const tags = [...section.querySelectorAll("[data-tag]")].map((el) => ({ el, at: { ionizer: V(ION.x, top + 0.45, ION.z), vajra: V(0, C + 1.25, 0), turbo: V(TURBO.x, TURBO.y + 0.85, COMP_Z), engine: V(5.6, -2.3, -0.5) }[el.dataset.tag] })).filter((t) => t.at);
  const tv = new THREE.Vector3();
  function placeTags() {
    for (const t of tags) {
      tv.copy(t.at).project(camera);
      // Not behind the camera, not at the very edge, and not under the words.
      const on = tv.z < 1 && Math.abs(tv.x) < 0.96 && Math.abs(tv.y) < 0.92 && (camera.aspect > 1.15 ? tv.x > -0.12 : tv.y > -0.1 && tv.y < 0.74);
      t.el.style.opacity = on ? 1 : 0;
      t.el.style.transform = `translate(${((tv.x + 1) / 2) * w}px, ${((1 - tv.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  // ---- The camera's stops: where it stands and what it looks at for each stage (0 is the opening view) ----
  const SHOTS = [
    { pos: [1.9, 1.0, 23.5], look: [1.0, -0.9, -0.6], air: 1, exh: 1, slide: 0.19 },
    { pos: [-4.6, -1.5, 5.4], look: [-3.7, -2.25, -2.3], air: 1, exh: 0.5 }, // 1 air in
    { pos: [-2.2, -0.3, 4.4], look: [-3.9, -1.5, -2.3], air: 1, exh: 0.5 }, // 2 ionizer
    { pos: [2.6, 2.6, 8.8], look: [0.55, 0.7, 0], air: 1.25, exh: 0.3 }, // 3 the Vajra: the air's spiral
    { pos: [2.0, -1.6, 7.6], look: [0, -0.75, 0], air: 0.45, exh: 1.35 }, // 4 heat exchange: the exhaust's spiral
    { pos: [6.6, 0.7, 8.4], look: [3.6, -2.6, -0.6], air: 1, exh: 0.8 }, // 5 into the engine
    { pos: [-2.0, 4.2, 12.5], look: [-1.3, 3.1, 0.3], air: 0.5, exh: 1.2 }, // 6 exhaust out
  ].map((s) => ({ pos: V(...s.pos), look: V(...s.look), air: s.air, exh: s.exh, slide: s.slide ?? 0.22 }));

  // ---- Scroll: how far through the section the reader is, as a stage number from 0 to 6 ----
  const steps = [...section.querySelectorAll(".step-key li")];
  const rail = section.querySelector(".story-rail");
  let stageNow = -1;
  function progress() {
    const r = section.getBoundingClientRect(), span = r.height - pin.offsetHeight;
    const p = span > 0 ? Math.min(1, Math.max(0, (HEADER - r.top) / span)) : 0;
    return Math.min(6, p * 6.35);
  }
  function showStage(f) {
    const n = Math.max(1, Math.min(6, Math.round(f)));
    const on = f < 0.45 ? 0 : n;
    if (on === stageNow) return;
    stageNow = on;
    steps.forEach((li, i) => li.classList.toggle("is-on", i + 1 === on));
    section.classList.toggle("is-opening", on === 0);
    section.classList.toggle("is-ending", on === 6);
    if (rail) [...rail.children].forEach((b, i) => b.firstElementChild.setAttribute("aria-current", String(i + 1 === on)));
  }
  if (rail) {
    rail.innerHTML = steps.map((li, i) => `<li><button type="button" aria-current="false"><span>${i + 1}</span><em>${li.querySelector("h3").textContent}</em></button></li>`).join("");
    [...rail.querySelectorAll("button")].forEach((b, i) => b.addEventListener("click", () => {
      const span = section.offsetHeight - pin.offsetHeight;
      scrollTo({ top: section.getBoundingClientRect().top + scrollY - HEADER + ((i + 1) / 6.35) * span + 2, behavior: "smooth" });
    }));
  }

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
  }
  const pos = SHOTS[0].pos.clone(), look = SHOTS[0].look.clone(), wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  const fwd = new THREE.Vector3(), side = new THREE.Vector3(), upv = new THREE.Vector3();
  let air = 1, exh = 1, first = true;
  const snap = new URLSearchParams(location.search).get("snap") === "1"; // for checking each stop: no easing between them
  const clock = new THREE.Clock();
  let time = 2;
  function draw(dt) {
    const f = progress();
    showStage(f);
    const i = Math.min(5, Math.floor(f)), t = f - i;
    const e = t * t * t * (t * (t * 6 - 15) + 10); // linger at each stop, move between them
    const a = SHOTS[i], b = SHOTS[i + 1];
    wantPos.lerpVectors(a.pos, b.pos, e); wantLook.lerpVectors(a.look, b.look, e);
    // A narrow screen stands further back; and the picture is slid aside to leave room for the words.
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    wantPos.sub(wantLook).multiplyScalar(Math.min(2.7, Math.max(1, 1.5 / camera.aspect))).add(wantLook);
    const d = wantPos.distanceTo(wantLook);
    fwd.copy(wantLook).sub(wantPos).normalize(); side.crossVectors(fwd, UP).normalize(); upv.crossVectors(side, fwd);
    const slide = a.slide + (b.slide - a.slide) * e;
    if (camera.aspect > 1.15) { const s = -2 * d * tan * camera.aspect * slide; wantPos.addScaledVector(side, s); wantLook.addScaledVector(side, s); }
    else { const s = -2 * d * tan * 0.2; wantPos.addScaledVector(upv, s); wantLook.addScaledVector(upv, s); }
    const k = first || snap ? 1 : 1 - Math.exp(-dt * 3.2);
    first = false;
    pos.lerp(wantPos, k); look.lerp(wantLook, k);
    air += (a.air + (b.air - a.air) * e - air) * k; exh += (a.exh + (b.exh - a.exh) * e - exh) * k;
    camera.position.copy(pos);
    if (!snap) camera.position.addScaledVector(side, Math.sin(time * 0.3) * 0.12).addScaledVector(upv, Math.cos(time * 0.23) * 0.08); // it never sits quite still
    camera.lookAt(look);
    vajra.set(time, 1, air, exh);
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
    tune();
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) { clock.getDelta(); raf = requestAnimationFrame(frame); } };
  new ResizeObserver(resize).observe(pin);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(section);
  document.addEventListener("visibilitychange", kick);
  resize();
  section.classList.add("is-drawn");
}
