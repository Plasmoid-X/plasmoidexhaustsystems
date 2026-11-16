// The Vajra, drawn live: two linked stainless spheres cut open towards the viewer. Intake air (blue) spirals down
// the inner chamber around a sealed core in each sphere; exhaust (orange) spirals up the outer chamber the other way
// and warms it through the wall. Built from the owner's description of the system, not from CAD.
import * as THREE from "three";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

const stage = document.getElementById("vajra");
if (stage) start(stage);

function start(stage) {
  const canvas = stage.querySelector("canvas");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    stage.classList.add("no-webgl");
    return;
  }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 1.15;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

  // ---- Dimensions (the outer sphere's radius is 1) ----
  const C = 1.2; // each sphere's centre is this far above / below the middle
  const RO = 1.0, RI = 0.74, RC = 0.36; // outer shell, inner chamber wall, sealed core
  const NECK_O = 0.36, NECK_I = 0.2; // the neck between the spheres: exhaust jacket, air passage
  const PIPE = 0.2;

  // The cut: the quarter facing the viewer is removed from both walls.
  const VIEW = THREE.MathUtils.degToRad(24); // where the viewer stands, turned from straight ahead
  const HALF = THREE.MathUtils.degToRad(54); // half the width of the opening
  const at = (a) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  const planes = [
    new THREE.Plane(at(VIEW - HALF + Math.PI / 2).negate(), 0),
    new THREE.Plane(at(VIEW + HALF - Math.PI / 2).negate(), 0),
  ];
  const clip = { clippingPlanes: planes, clipIntersection: true };

  const steel = new THREE.MeshPhysicalMaterial({ color: 0xd3d8da, metalness: 1, roughness: 0.16, clearcoat: 0.25, clearcoatRoughness: 0.3, ...clip });
  const steelInside = new THREE.MeshStandardMaterial({ color: 0x0d1418, metalness: 0.3, roughness: 0.85, envMapIntensity: 0.08, side: THREE.BackSide, ...clip });
  const wall = new THREE.MeshPhysicalMaterial({ color: 0xbfc6c9, metalness: 1, roughness: 0.3, emissive: 0xff5a1f, emissiveIntensity: 0.1, ...clip });
  const wallInside = new THREE.MeshStandardMaterial({ color: 0x0b1217, metalness: 0.3, roughness: 0.85, envMapIntensity: 0.08, side: THREE.BackSide, ...clip });
  const coreMat = new THREE.MeshPhysicalMaterial({ color: 0xe6eaec, metalness: 1, roughness: 0.07 });
  const pipeMat = new THREE.MeshPhysicalMaterial({ color: 0xc4cacd, metalness: 1, roughness: 0.24 });

  const model = new THREE.Group();
  scene.add(model);

  // One profile turned around the vertical axis: sphere, neck, sphere.
  function shellProfile(r, neck, stub) {
    const pts = [];
    const a0 = Math.asin(stub / r), a1 = Math.PI - Math.asin(neck / r);
    const N = 72;
    for (let i = 0; i <= N; i++) { const a = a0 + ((a1 - a0) * i) / N; pts.push(new THREE.Vector2(r * Math.sin(a), C + r * Math.cos(a))); }
    for (let i = N; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / N; pts.push(new THREE.Vector2(r * Math.sin(a), -C - r * Math.cos(a))); }
    return pts.reverse(); // this order turns the faces outwards
  }
  function shell(r, neck, stub, front, back) {
    const g = new THREE.LatheGeometry(shellProfile(r, neck, stub), 128);
    model.add(new THREE.Mesh(g, front), new THREE.Mesh(g, back));
  }
  shell(RO, NECK_O, PIPE + 0.03, steel, steelInside);
  shell(RI, NECK_I, PIPE, wall, wallInside);

  for (const y of [C, -C]) {
    const core = new THREE.Mesh(new THREE.SphereGeometry(RC, 64, 48), coreMat);
    core.position.y = y;
    model.add(core);
  }

  // Pipes: air in at the top, plasmoids out at the bottom, exhaust in low on the left, exhaust out high on the right.
  function pipe(points, r) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.35);
    model.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, r, 32), pipeMat));
  }
  function flange(pos, dir, r) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.45, r * 1.45, 0.07, 48), pipeMat);
    m.position.set(...pos);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
    model.add(m);
  }
  const top = C + RO;
  pipe([[0, top - 0.3, 0], [0, top + 0.45, 0], [-0.25, top + 0.95, 0], [-1.0, top + 1.2, 0], [-3.4, top + 1.2, 0]], PIPE);
  flange([0, top + 0.05, 0], [0, 1, 0], PIPE);
  pipe([[0, -top + 0.3, 0], [0, -top - 0.45, 0], [0.25, -top - 0.95, 0], [1.0, -top - 1.2, 0], [3.4, -top - 1.2, 0]], PIPE);
  flange([0, -top - 0.05, 0], [0, 1, 0], PIPE);
  const port = (sign) => {
    // sign 1: low on the left (exhaust in). sign -1: high on the right (exhaust out).
    const dir = new THREE.Vector3(-sign * 0.82, -sign * 0.42, -0.38).normalize();
    const c = new THREE.Vector3(0, -sign * C, 0);
    const p = (k) => c.clone().addScaledVector(dir, k).toArray();
    const end = c.clone().addScaledVector(dir, 2.0).add(new THREE.Vector3(-sign * 3.2, -sign * 0.05, -0.6)).toArray();
    pipe([p(0.9), p(1.35), p(1.75), end], 0.21);
    flange(p(1.03), dir.toArray(), 0.21);
  };
  port(1); // exhaust in: lower sphere, left
  port(-1); // exhaust out: upper sphere, right

  // A little warmth and cold from inside, so the cut faces pick up the two flows.
  const warm = new THREE.PointLight(0xff6a2a, 1.6, 3.0, 2); warm.position.set(0.75, -C, 0.75);
  const cold = new THREE.PointLight(0x5fb8ff, 1.2, 2.4, 2); cold.position.set(0.3, C + 0.1, 0.45);
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 6);
  const rim = new THREE.DirectionalLight(0x9fd6ff, 2.4); rim.position.set(-6, 2, -3);
  const fill = new THREE.DirectionalLight(0xffffff, 0.9); fill.position.set(-4, -1, 5);
  model.add(warm, cold);
  scene.add(key, rim, fill);

  // ---- The two flows: streaks of points whose path is worked out on the graphics card ----
  const flowVertex = /* glsl */ `
    attribute float aSeed; attribute float aLane; attribute float aSpeed; attribute float aTrail;
    uniform float uTime, uKind, uSize, uScale;
    varying float vAlpha; varying float vLane;
    const float C = ${C.toFixed(3)}, RO = ${RO.toFixed(3)}, RI = ${RI.toFixed(3)}, RC = ${RC.toFixed(3)};
    const float NECK_O = ${NECK_O.toFixed(3)}, NECK_I = ${NECK_I.toFixed(3)};
    float ring(float r, float y) { float d = min(abs(y - C), abs(y + C)); return sqrt(max(r * r - d * d, 0.0)); }
    void main() {
      float t = fract(aSeed * 13.7 + uTime * aSpeed) - aTrail * 0.05;
      float fade = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.94, t);
      t = clamp(t, 0.0, 1.0);
      float span = uKind < 0.5 ? C + RI + 0.25 : C + RO * 0.86;
      // Air goes down, exhaust comes up.
      float y = uKind < 0.5 ? mix(span, -span, t) : mix(-span, span, t);
      float inner = max(ring(RI, y), NECK_I);
      float r;
      if (uKind < 0.5) {
        float core = ring(RC, y);
        r = mix(core + 0.045, max(inner - 0.05, core + 0.05), aLane);
        if (abs(y) > C + RI - 0.02) r = min(r, ${(PIPE - 0.05).toFixed(3)});
      } else {
        float outer = max(ring(RO, y), NECK_O);
        r = mix(inner + 0.05, max(outer - 0.045, inner + 0.055), aLane);
      }
      // The swirl tightens where the chamber narrows, like a tornado.
      float turns = uKind < 0.5 ? 9.0 : 7.0;
      float a = aSeed * 6.2832 * 5.0 + (uKind < 0.5 ? 1.0 : -1.0) * (t * turns * 6.2832 + 1.4 / (r + 0.25));
      vec3 p = vec3(r * cos(a), y, r * sin(a));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uSize * uScale * (1.0 - aTrail * 0.7) / -mv.z;
      vAlpha = fade * pow(1.0 - aTrail, 1.6);
      vLane = aLane;
    }`;
  const flowFragment = /* glsl */ `
    uniform vec3 uColorA, uColorB; uniform float uOpacity;
    varying float vAlpha; varying float vLane;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(mix(uColorA, uColorB, vLane), a * a * vAlpha * uOpacity);
    }`;
  const flows = [];
  function flow(kind, streaks, trail, colorA, colorB, size, opacity, speed) {
    const n = streaks * trail;
    const seed = new Float32Array(n), lane = new Float32Array(n), spd = new Float32Array(n), tr = new Float32Array(n);
    for (let s = 0; s < streaks; s++) {
      const a = Math.random(), l = Math.random(), v = speed * (0.75 + Math.random() * 0.5);
      for (let k = 0; k < trail; k++) { const i = s * trail + k; seed[i] = a; lane[i] = l; spd[i] = v; tr[i] = k / (trail - 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.setAttribute("aLane", new THREE.BufferAttribute(lane, 1));
    g.setAttribute("aSpeed", new THREE.BufferAttribute(spd, 1));
    g.setAttribute("aTrail", new THREE.BufferAttribute(tr, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    const m = new THREE.ShaderMaterial({
      vertexShader: flowVertex, fragmentShader: flowFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uKind: { value: kind }, uSize: { value: size }, uScale: { value: 1 }, uOpacity: { value: opacity },
        uColorA: { value: new THREE.Color(colorA) }, uColorB: { value: new THREE.Color(colorB) } },
    });
    const pts = new THREE.Points(g, m);
    model.add(pts);
    flows.push(m);
  }
  flow(0, 120, 90, 0xa6e2ff, 0x2f8cff, 6.0, 0.5, 0.055);
  flow(1, 200, 90, 0xffc46b, 0xff4a1c, 6.4, 0.38, 0.045);

  // ---- Labels: fixed points on the model, placed over the canvas each frame ----
  const dirToViewer = at(VIEW + THREE.MathUtils.degToRad(30));
  const anchors = {
    air: new THREE.Vector3().copy(dirToViewer).multiplyScalar(0.55).add(new THREE.Vector3(0, C + 0.28, 0)),
    core: new THREE.Vector3().copy(dirToViewer).multiplyScalar(RC).add(new THREE.Vector3(0, C - 0.1, 0)),
    exhaust: new THREE.Vector3().copy(dirToViewer).multiplyScalar(0.88).add(new THREE.Vector3(0, -C - 0.05, 0)),
  };
  const labels = [...stage.querySelectorAll("[data-anchor]")].map((el) => ({ el, at: anchors[el.dataset.anchor] })).filter((l) => l.at);
  const v = new THREE.Vector3(), edge = new THREE.Vector3(), right = new THREE.Vector3();
  function placeLabels(w, h) {
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    for (const l of labels) {
      v.copy(l.at).applyMatrix4(model.matrixWorld).project(camera);
      const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
      // The line runs from the point to just clear of the unit's right-hand edge.
      edge.set(0, l.at.y, 0).addScaledVector(right, RO * 1.08).project(camera);
      l.el.style.transform = `translate(${x}px, ${y}px)`;
      l.el.style.setProperty("--lead", `${Math.max(24, ((edge.x + 1) / 2) * w - x + 18)}px`);
    }
    stage.classList.add("is-live");
  }

  // ---- Size, pointer, loop ----
  let w = 0, h = 0;
  function resize() {
    w = stage.clientWidth; h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole unit in view whatever the shape of the stage.
    const tall = 2.95, wide = 2.05;
    const dist = Math.max(tall / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), wide / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    camera.position.set(dist * Math.sin(VIEW) * 0.985, dist * 0.17, dist * Math.cos(VIEW) * 0.985);
    camera.lookAt(0.25, 0, 0);
    camera.updateProjectionMatrix();
    for (const m of flows) m.uniforms.uScale.value = h * renderer.getPixelRatio() * 0.012;
    draw();
  }
  let px = 0, py = 0, tx = 0, ty = 0;
  if (!reduce) {
    addEventListener("pointermove", (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  }
  const clock = new THREE.Clock();
  let time = 4;
  function draw() {
    for (const m of flows) m.uniforms.uTime.value = time;
    model.rotation.y = px * 0.5 + Math.sin(time * 0.22) * (reduce ? 0 : 0.05);
    model.rotation.x = py * 0.16;
    model.updateMatrixWorld();
    renderer.render(scene, camera);
    placeLabels(w, h);
  }
  let visible = true, raf = 0;
  function frame() {
    raf = 0;
    if (!visible || document.hidden) return;
    time += Math.min(clock.getDelta(), 0.05);
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    draw();
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!reduce && !raf) { clock.getDelta(); raf = requestAnimationFrame(frame); } };
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(stage);
  document.addEventListener("visibilitychange", kick);
  resize();
  kick();
}
