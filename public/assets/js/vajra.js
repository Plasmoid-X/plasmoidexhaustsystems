// The Vajra, drawn live: two linked stainless spheres with a section cut out towards the viewer. Intake air (blue)
// spirals down the inner chamber around a sealed core in each sphere; exhaust (orange) spirals up the outer chamber
// the other way and warms it through the wall. Built from the owner's description of the system, not from CAD:
// every size is in DIMENSIONS below, so a drawing only has to change those numbers.
import * as THREE from "three";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";
import { EffectComposer } from "./vendor/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/postprocessing/RenderPass.js";
import { BokehPass } from "./vendor/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "./vendor/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "./vendor/postprocessing/OutputPass.js";
import { ShaderPass } from "./vendor/postprocessing/ShaderPass.js";

// ---- DIMENSIONS (the outer sphere's radius is 1) ----
const C = 1.2; // each sphere's centre is this far above / below the middle
const RO = 1.0, RI = 0.74, RC = 0.36; // outer shell, inner chamber wall, sealed core
const NECK_O = 0.36, NECK_I = 0.2; // the neck between the spheres: exhaust jacket, air passage
const T_O = 0.045, T_I = 0.035; // wall thickness: outer shell, inner wall
const PIPE = 0.2, PORT = 0.21; // air pipe at the poles, exhaust ports on the sides
const VIEW = THREE.MathUtils.degToRad(24); // where the viewer stands, turned from straight ahead
const HALF = THREE.MathUtils.degToRad(54); // half the width of the section cut out
const BG = 0x0b1c17; // comes out as the page's #050d0a after the lens's tone mapping

const stage = document.getElementById("vajra");
if (stage) start(stage);

function start(stage) {
  const canvas = stage.querySelector("canvas");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    stage.classList.add("no-webgl");
    return;
  }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = matchMedia("(max-width: 900px)").matches;
  let pixelRatio = Math.min(devicePixelRatio || 1, small ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 10, 20);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 1.1;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 60);

  // ---- Textures made here, so nothing has to be downloaded ----
  function texture(size, paint, repeatX = 1, repeatY = 1) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    paint(c.getContext("2d"), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  // Brushed steel: fine lines running around the part.
  const brushed = (rx, ry) => texture(512, (g, s) => {
    g.fillStyle = "#8a8a8a"; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const y = Math.random() * s, v = 96 + Math.random() * 110;
      g.strokeStyle = `rgba(${v},${v},${v},${0.1 + Math.random() * 0.22})`;
      g.lineWidth = 0.5 + Math.random() * 1.1;
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + (Math.random() - 0.5) * 3); g.stroke();
    }
  }, rx, ry);
  // A weld bead: overlapping ripples along its length.
  const bead = texture(256, (g, s) => {
    g.fillStyle = "#777"; g.fillRect(0, 0, s, s);
    for (let x = -10; x < s + 10; x += 9) {
      const grad = g.createRadialGradient(x, s / 2, 1, x, s / 2, 16);
      grad.addColorStop(0, "#d8d8d8"); grad.addColorStop(1, "rgba(60,60,60,0)");
      g.fillStyle = grad; g.beginPath(); g.ellipse(x, s / 2, 13, s * 0.62, 0, 0, Math.PI * 2); g.fill();
    }
  }, 90, 1);

  const shellTex = brushed(1, 5), pipeTex = brushed(1, 14);
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xd4d9db, metalness: 1, roughness: 0.34, roughnessMap: shellTex, bumpMap: shellTex, bumpScale: 0.35,
    anisotropy: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.4, side: THREE.DoubleSide });
  const pipeMat = new THREE.MeshPhysicalMaterial({ color: 0xc9cfd2, metalness: 1, roughness: 0.38, roughnessMap: pipeTex, bumpMap: pipeTex, bumpScale: 0.3, anisotropy: 0.5 });
  const cutFace = new THREE.MeshStandardMaterial({ color: 0xc2c8cb, metalness: 1, roughness: 0.42, side: THREE.DoubleSide });
  const weld = new THREE.MeshStandardMaterial({ color: 0x8f969a, metalness: 1, roughness: 0.6, bumpMap: bead, bumpScale: 1.6 });
  const boltMat = new THREE.MeshStandardMaterial({ color: 0x9aa1a5, metalness: 1, roughness: 0.3 });
  const gasket = new THREE.MeshStandardMaterial({ color: 0x15191b, metalness: 0.2, roughness: 0.9 });
  const coreMat = new THREE.MeshPhysicalMaterial({ color: 0xe9edef, metalness: 1, roughness: 0.06 });
  // Inside the chambers the steel is dark and heat-stained, so the two flows read against it.
  const liningOuter = new THREE.MeshStandardMaterial({ color: 0x14181a, metalness: 0.6, roughness: 0.7, envMapIntensity: 0.2, side: THREE.DoubleSide });
  const liningInner = new THREE.MeshStandardMaterial({ color: 0x10171c, metalness: 0.6, roughness: 0.65, envMapIntensity: 0.2, side: THREE.DoubleSide });
  // The wall between the two flows glows where the exhaust heats it: hottest low down, where the exhaust comes in.
  const heat = { value: 0 };
  const hotWall = new THREE.MeshStandardMaterial({ color: 0x1d1512, metalness: 0.7, roughness: 0.55, envMapIntensity: 0.25, emissive: 0xff5a14, emissiveIntensity: 1, side: THREE.DoubleSide });
  hotWall.onBeforeCompile = (sh) => {
    sh.uniforms.uHeatTime = heat;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vHeatY;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvHeatY = position.y;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vHeatY; uniform float uHeatTime;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        float hy = (vHeatY + ${(C + RI).toFixed(2)}) / ${(2 * (C + RI)).toFixed(2)};
        float glow = mix(0.5, 0.1, smoothstep(0.0, 1.0, hy));
        glow *= 0.72 + 0.28 * sin(hy * 26.0 - uHeatTime * 1.6);
        totalEmissiveRadiance *= glow;`);
  };

  const model = new THREE.Group();
  scene.add(model);
  const PHI0 = VIEW + HALF, PHI_LEN = Math.PI * 2 - HALF * 2; // everything turned around the axis leaves the section open
  const SEG = 144;
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); model.add(m); return m; };
  const lathe = (pts, mat) => add(new THREE.LatheGeometry(pts, SEG, PHI0, PHI_LEN), mat);

  // One outline turned around the vertical axis: sphere, neck, sphere. `stub` is the opening at each pole.
  function outline(r, neck, stub) {
    const pts = [], a0 = Math.asin(stub / r), a1 = Math.PI - Math.asin(neck / r), N = 80;
    for (let i = 0; i <= N; i++) { const a = a0 + ((a1 - a0) * i) / N; pts.push(new THREE.Vector2(r * Math.sin(a), C + r * Math.cos(a))); }
    for (let i = N; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / N; pts.push(new THREE.Vector2(r * Math.sin(a), -C - r * Math.cos(a))); }
    return pts;
  }
  // A wall with real thickness: an outer skin, an inner skin, and a flat face on each cut edge.
  function wall(r, neck, stub, t, outside, inside) {
    const a = outline(r, neck, stub), b = outline(r - t, neck - t, stub);
    lathe(a, outside);
    lathe(b, inside);
    const face = new THREE.ShapeGeometry(new THREE.Shape([...a, ...b.slice().reverse()]));
    for (const phi of [PHI0, PHI0 + PHI_LEN]) add(face, cutFace).rotation.y = phi - Math.PI / 2;
  }
  wall(RO, NECK_O, PIPE + 0.03, T_O, steel, liningOuter);
  wall(RI, NECK_I + T_I, PIPE, T_I, hotWall, liningInner);

  for (const y of [C, -C]) add(new THREE.SphereGeometry(RC, 72, 56), coreMat).position.y = y;

  // Weld seams: where each sphere's two halves meet, and where the neck joins.
  function seam(radius, y, size = 0.016) {
    const ring = [];
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 2; ring.push(new THREE.Vector2(radius + Math.cos(a) * size, y + Math.sin(a) * size)); }
    lathe(ring, weld);
  }
  const neckJoin = C - Math.sqrt(RO * RO - NECK_O * NECK_O);
  seam(RO, C); seam(RO, -C); seam(NECK_O + 0.012, neckJoin, 0.02); seam(NECK_O + 0.012, -neckJoin, 0.02);

  // Pipes, and bolted flanges where they join the unit.
  function pipe(points, r) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.35);
    add(new THREE.TubeGeometry(curve, 110, r, 36), pipeMat);
  }
  const UP = new THREE.Vector3(0, 1, 0);
  function flange(pos, dir, r) {
    const g = new THREE.Group();
    g.position.set(...pos);
    g.quaternion.setFromUnitVectors(UP, new THREE.Vector3(...dir).normalize());
    const R = r * 1.62, plate = new THREE.CylinderGeometry(R, R, 0.05, 56);
    for (const y of [-0.031, 0.031]) { const m = new THREE.Mesh(plate, pipeMat); m.position.y = y; g.add(m); }
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.985, R * 0.985, 0.012, 56), gasket));
    const head = new THREE.CylinderGeometry(0.034, 0.034, 0.03, 6), shank = new THREE.CylinderGeometry(0.016, 0.016, 0.19, 10);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2, x = Math.cos(a) * r * 1.32, z = Math.sin(a) * r * 1.32;
      for (const y of [-0.071, 0.071]) { const m = new THREE.Mesh(head, boltMat); m.position.set(x, y, z); g.add(m); }
      const s = new THREE.Mesh(shank, boltMat); s.position.set(x, 0, z); g.add(s);
    }
    model.add(g);
  }
  const top = C + RO;
  pipe([[0, top - 0.3, 0], [0, top + 0.5, 0], [-0.25, top + 1.0, 0], [-1.0, top + 1.25, 0], [-4.2, top + 1.25, 0]], PIPE);
  flange([0, top + 0.12, 0], [0, 1, 0], PIPE);
  pipe([[0, -top + 0.3, 0], [0, -top - 0.5, 0], [0.25, -top - 1.0, 0], [1.0, -top - 1.25, 0], [4.2, -top - 1.25, 0]], PIPE);
  flange([0, -top - 0.12, 0], [0, 1, 0], PIPE);
  function port(sign) {
    // sign 1: low on the left (exhaust in). sign -1: high on the right (exhaust out). Both leave towards the back.
    const dir = new THREE.Vector3(-sign * 0.82, -sign * 0.42, -0.38).normalize();
    const c = new THREE.Vector3(0, -sign * C, 0);
    const p = (k) => c.clone().addScaledVector(dir, k).toArray();
    const end = c.clone().addScaledVector(dir, 2.0).add(new THREE.Vector3(-sign * 3.6, -sign * 0.05, -0.8)).toArray();
    pipe([p(0.9), p(1.4), p(1.8), end], PORT);
    flange(p(1.16), dir.toArray(), PORT);
    // A weld where the port meets the sphere.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(PORT + 0.012, 0.02, 10, 48), weld);
    ring.position.set(...p(Math.sqrt(RO * RO - PORT * PORT) + 0.005));
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    model.add(ring);
  }
  port(1);
  port(-1);

  // Light: a studio around it, plus the colour each flow throws on the steel near it.
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 6);
  const rim = new THREE.DirectionalLight(0x9fd6ff, 2.6); rim.position.set(-6, 2, -3);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(-4, -1, 5);
  scene.add(key, rim, fill);
  const warm = new THREE.PointLight(0xff6a2a, 2.0, 3.0, 2); warm.position.set(0.75, -C, 0.75);
  const cold = new THREE.PointLight(0x5fb8ff, 1.4, 2.4, 2); cold.position.set(0.3, C + 0.1, 0.45);
  model.add(warm, cold);

  // ---- The two flows. Each is thousands of soft points whose path is worked out on the graphics card: long
  // overlapping trails make streamlines, and large faint puffs give the gas its body. ----
  const flowVertex = /* glsl */ `
    attribute float aSeed; attribute float aLane; attribute float aSpeed; attribute float aTrail;
    uniform float uTime, uKind, uSize, uScale, uTrail;
    varying float vAlpha; varying float vLane;
    const float C = ${C.toFixed(3)}, RO = ${(RO - T_O).toFixed(3)}, RI = ${RI.toFixed(3)}, RIN = ${(RI - T_I).toFixed(3)}, RC = ${RC.toFixed(3)};
    const float NECK_O = ${(NECK_O - T_O).toFixed(3)}, NECK_W = ${(NECK_I + T_I).toFixed(3)}, NECK_I = ${NECK_I.toFixed(3)};
    float ring(float r, float y) { float d = min(abs(y - C), abs(y + C)); return sqrt(max(r * r - d * d, 0.0)); }
    void main() {
      float t = fract(aSeed * 13.7 + uTime * aSpeed) - aTrail * uTrail;
      float fade = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.93, t);
      t = clamp(t, 0.0, 1.0);
      float span = uKind < 0.5 ? C + RIN + 0.3 : C + RO * 0.84;
      float y = uKind < 0.5 ? mix(span, -span, t) : mix(-span, span, t); // air goes down, exhaust comes up
      float r;
      if (uKind < 0.5) {
        float core = ring(RC, y), wallIn = max(ring(RIN, y), NECK_I);
        r = mix(core + 0.04, max(wallIn - 0.045, core + 0.045), aLane);
        if (abs(y) > C + RIN - 0.03) r = min(r, ${(PIPE - 0.05).toFixed(3)});
      } else {
        float wallOut = max(ring(RI, y), NECK_W), shell = max(ring(RO, y), NECK_O);
        r = mix(wallOut + 0.04, max(shell - 0.04, wallOut + 0.045), aLane);
      }
      // Gas doesn't run on rails: each streamline wanders a little.
      r += 0.014 * sin(t * 61.0 + aSeed * 40.0 + uTime * 0.9) * smoothstep(0.1, 0.3, r);
      float turns = uKind < 0.5 ? 9.0 : 7.0;
      // The swirl tightens where the chamber narrows, like a tornado.
      float a = aSeed * 6.2832 * 5.0 + (uKind < 0.5 ? 1.0 : -1.0) * (t * turns * 6.2832 + 1.4 / (r + 0.25)) + 0.1 * sin(t * 23.0 + aSeed * 17.0);
      vec4 mv = modelViewMatrix * vec4(r * cos(a), y, r * sin(a), 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = min(uSize * uScale * (1.0 - aTrail * 0.55) / -mv.z, 96.0);
      vAlpha = fade * pow(1.0 - aTrail, 1.3);
      vLane = aLane;
    }`;
  const flowFragment = /* glsl */ `
    uniform vec3 uColorA, uColorB; uniform float uOpacity, uSoft;
    varying float vAlpha; varying float vLane;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float a = pow(max(1.0 - d, 0.0), uSoft);
      gl_FragColor = vec4(mix(uColorA, uColorB, vLane), a * vAlpha * uOpacity);
    }`;
  const flows = [], body = [];
  function flow({ kind, streaks, trail, length, a, b, size, opacity, speed, soft }) {
    const n = streaks * trail;
    const seed = new Float32Array(n), lane = new Float32Array(n), spd = new Float32Array(n), tr = new Float32Array(n);
    for (let s = 0; s < streaks; s++) {
      const sd = Math.random(), l = Math.random(), v = speed * (0.75 + Math.random() * 0.5);
      for (let k = 0; k < trail; k++) { const i = s * trail + k; seed[i] = sd; lane[i] = l; spd[i] = v; tr[i] = trail > 1 ? k / (trail - 1) : 0; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.setAttribute("aLane", new THREE.BufferAttribute(lane, 1));
    g.setAttribute("aSpeed", new THREE.BufferAttribute(spd, 1));
    g.setAttribute("aTrail", new THREE.BufferAttribute(tr, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);
    const m = new THREE.ShaderMaterial({
      vertexShader: flowVertex, fragmentShader: flowFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uKind: { value: kind }, uSize: { value: size }, uScale: { value: 1 }, uTrail: { value: length }, uSoft: { value: soft },
        uOpacity: { value: 0 }, uColorA: { value: new THREE.Color(a) }, uColorB: { value: new THREE.Color(b) } },
    });
    m.userData.opacity = opacity;
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    model.add(pts);
    flows.push(m);
    if (trail === 1) body.push(pts);
  }
  const few = small ? 0.6 : 1;
  // Streamlines
  flow({ kind: 0, streaks: Math.round(95 * few), trail: 150, length: 0.1, a: 0xb4e6ff, b: 0x2f8cff, size: 4.8, opacity: 0.24, speed: 0.05, soft: 1.6 });
  flow({ kind: 1, streaks: Math.round(150 * few), trail: 150, length: 0.1, a: 0xffcf7a, b: 0xff4a1c, size: 5.2, opacity: 0.19, speed: 0.04, soft: 1.6 });
  // Body
  flow({ kind: 0, streaks: Math.round(420 * few), trail: 1, length: 0, a: 0x7fc8ff, b: 0x2a6fe0, size: 30, opacity: 0.034, speed: 0.045, soft: 2.2 });
  flow({ kind: 1, streaks: Math.round(620 * few), trail: 1, length: 0, a: 0xff9a45, b: 0xe23a10, size: 30, opacity: 0.03, speed: 0.036, soft: 2.2 });

  // ---- Lens: a little depth of field, and bloom on what glows ----
  // Only the two flows and the hot wall bloom. They are drawn once on their own, with the steel turned black so it
  // still hides what is behind it, blurred, and added over the finished picture.
  const glowComposer = new EffectComposer(renderer);
  glowComposer.renderToScreen = false;
  glowComposer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.3, 0.0);
  glowComposer.addPass(bloom);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 10, aperture: 0.00016, maxblur: 0.006 });
  bokeh.enabled = !small;
  composer.addPass(bokeh);
  const addGlow = new ShaderPass(new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, tGlow: { value: glowComposer.renderTarget2.texture } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform sampler2D tDiffuse, tGlow; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv) + texture2D(tGlow, vUv); }",
  }), "tDiffuse");
  composer.addPass(addGlow);
  composer.addPass(new OutputPass());
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, fog: false });
  const blackBg = new THREE.Color(0x000000), realBg = scene.background;
  const dulled = [];
  model.traverse((o) => { if (o.isMesh && o.material !== hotWall) dulled.push(o); });
  function renderGlow() {
    if (!bloom.enabled) return;
    for (const o of dulled) { o.userData.keep = o.material; o.material = black; }
    for (const o of body) o.visible = false; // the streamlines glow; the faint body of the gas doesn't
    scene.background = blackBg;
    glowComposer.render();
    scene.background = realBg;
    for (const o of body) o.visible = true;
    for (const o of dulled) o.material = o.userData.keep;
  }
  // For tuning: ?bloom=0 or ?dof=0 in the address switches an effect off.
  const q = new URLSearchParams(location.search);
  if (q.get("bloom") === "0") { bloom.enabled = false; addGlow.enabled = false; }
  if (q.get("dof") === "0") bokeh.enabled = false;

  // ---- Labels: fixed points on the model, placed over the canvas each frame ----
  const at = (a) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  const toViewer = at(VIEW + THREE.MathUtils.degToRad(30));
  const anchors = {
    air: toViewer.clone().multiplyScalar(0.53).add(new THREE.Vector3(0, C + 0.28, 0)),
    core: toViewer.clone().multiplyScalar(RC).add(new THREE.Vector3(0, C - 0.1, 0)),
    exhaust: toViewer.clone().multiplyScalar(0.84).add(new THREE.Vector3(0, -C - 0.05, 0)),
  };
  const labels = [...stage.querySelectorAll("[data-anchor]")].map((el) => ({ el, at: anchors[el.dataset.anchor] })).filter((l) => l.at);
  const v = new THREE.Vector3(), edge = new THREE.Vector3(), right = new THREE.Vector3();
  function placeLabels() {
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    for (const l of labels) {
      v.copy(l.at).applyMatrix4(model.matrixWorld).project(camera);
      const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
      // The line runs from the point to just clear of the unit's right-hand edge.
      edge.set(0, l.at.y, 0).addScaledVector(right, RO * 1.08).project(camera);
      l.el.style.transform = `translate(${x}px, ${y}px)`;
      l.el.style.setProperty("--lead", `${Math.max(24, ((edge.x + 1) / 2) * w - x + 18)}px`);
    }
  }

  // ---- Size, pointer, loop ----
  let w = 0, h = 0, dist = 12;
  function resize() {
    w = stage.clientWidth; h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    glowComposer.setPixelRatio(pixelRatio * 0.5);
    glowComposer.setSize(w, h);
    camera.aspect = w / h;
    // Keep both spheres in view whatever the shape of the stage; the pipes run off the edges.
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    dist = Math.max(2.95 / tan, 2.05 / (tan * camera.aspect));
    scene.fog.near = dist + 0.6; scene.fog.far = dist + 6.5;
    bokeh.uniforms.focus.value = dist;
    bokeh.uniforms.aspect.value = camera.aspect;
    for (const m of flows) m.uniforms.uScale.value = h * pixelRatio * 0.012;
    draw();
  }
  let px = 0, py = 0, tx = 0, ty = 0;
  if (!reduce) addEventListener("pointermove", (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });

  const clock = new THREE.Clock();
  let time = 4, intro = reduce || q.get("still") === "1" ? 1 : 0, shown = false; // ?still=1 skips the reveal
  function draw() {
    // The reveal: the camera settles in, the unit turns to face the viewer, and the flows come up.
    const e = 1 - Math.pow(1 - intro, 4);
    const d = dist * (1.22 - 0.22 * e);
    camera.position.set(d * Math.sin(VIEW) * 0.985, d * 0.17, d * Math.cos(VIEW) * 0.985);
    camera.lookAt(0.25, 0, 0);
    camera.updateProjectionMatrix();
    heat.value = time;
    const lit = Math.max(0, (e - 0.35) / 0.65);
    for (const m of flows) { m.uniforms.uTime.value = time; m.uniforms.uOpacity.value = m.userData.opacity * lit; }
    hotWall.emissiveIntensity = lit;
    warm.intensity = 2.0 * lit; cold.intensity = 1.4 * lit;
    model.rotation.y = px * 0.5 + Math.sin(time * 0.22) * (reduce ? 0 : 0.05) - (1 - e) * 0.55;
    model.rotation.x = py * 0.16;
    model.updateMatrixWorld();
    renderGlow();
    composer.render();
    placeLabels();
    if (!shown && (intro > 0.45 || reduce)) { shown = true; stage.classList.add("is-live"); }
  }

  // If the device struggles, give up the lens effects before giving up smoothness.
  let frames = 0, spent = 0, step = 0;
  function tune(dt) {
    if (step > 2 || (frames += 1) < 20) return;
    spent += dt;
    if (frames < 80) return;
    const avg = spent / 60;
    frames = 0; spent = 0;
    if (avg < 0.03) { step = 9; return; }
    step += 1;
    if (step === 1) bokeh.enabled = false;
    else if (step === 2) { pixelRatio = Math.min(pixelRatio, 1); resize(); }
    else { bloom.enabled = false; addGlow.enabled = false; }
  }

  let visible = true, raf = 0;
  function frame() {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    intro = Math.min(1, intro + dt / 2.8);
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    draw();
    tune(dt);
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!reduce && !raf) { clock.getDelta(); raf = requestAnimationFrame(frame); } };
  stage.classList.add("is-3d");
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(stage);
  document.addEventListener("visibilitychange", kick);
  resize();
  kick();
}
