// The home page's hero: the Vajra, drawn live, with a section cut out towards the viewer. Intake air (blue) spirals
// down the inner chamber around a sealed core in each sphere; exhaust (orange) spirals up the outer chamber the other
// way and warms it through the wall. The model itself is in vajra-core.js, built to the owner's CAD.
import * as THREE from "three";
import { createStage, buildVajra, createLens, createTuner, C, RO, RC, VIEW } from "./vajra-core.js";

const stage = document.getElementById("vajra");
if (stage) start(stage);

function start(stage) {
  const S = createStage(stage.querySelector("canvas"));
  if (!S) { stage.classList.add("no-webgl"); return; }
  const { scene, camera, reduce } = S;
  const vajra = buildVajra(S);
  const model = vajra.model;
  scene.add(model);
  const lens = createLens(S);

  // ---- Labels: fixed points on the model, placed over the canvas each frame ----
  const at = (a) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  const toViewer = at(VIEW + THREE.MathUtils.degToRad(18));
  const anchors = {
    air: toViewer.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, C + 0.3, 0)),
    core: toViewer.clone().multiplyScalar(RC).add(new THREE.Vector3(0, C - 0.1, 0)),
    exhaust: toViewer.clone().multiplyScalar(0.83).add(new THREE.Vector3(0, -C + 0.42, 0)),
  };
  const labels = [...stage.querySelectorAll("[data-anchor]")].map((el) => ({ el, at: anchors[el.dataset.anchor] })).filter((l) => l.at);
  const v = new THREE.Vector3(), edge = new THREE.Vector3(), right = new THREE.Vector3();
  function placeLabels() {
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    for (const l of labels) {
      v.copy(l.at).applyMatrix4(model.matrixWorld).project(camera);
      const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
      // The line runs from the point to just clear of the unit's right-hand edge.
      edge.set(0, l.at.y, 0).addScaledVector(right, RO * 1.1).project(camera);
      l.el.style.transform = `translate(${x}px, ${y}px)`;
      l.el.style.setProperty("--lead", `${Math.max(24, ((edge.x + 1) / 2) * w - x + 18)}px`);
    }
  }

  // ---- Size, pointer, loop ----
  let w = 0, h = 0, dist = 12;
  function resize() {
    w = stage.clientWidth; h = stage.clientHeight;
    if (!w || !h) return;
    lens.setSize(w, h);
    camera.aspect = w / h;
    // Keep both spheres in view whatever the shape of the stage; the pipes run off the edges.
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    dist = Math.max(2.75 / tan, 2.15 / (tan * camera.aspect));
    scene.fog.near = dist + 0.6; scene.fog.far = dist + 6.5;
    vajra.scale(h * S.pixelRatio * 0.012);
    draw();
  }
  let px = 0, py = 0, tx = 0, ty = 0;
  if (!reduce) addEventListener("pointermove", (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });

  const clock = new THREE.Clock();
  // ?still=1 in the address skips the reveal.
  let time = 4, intro = reduce || new URLSearchParams(location.search).get("still") === "1" ? 1 : 0, shown = false;
  function draw() {
    // The reveal: the camera settles in, the unit turns to face the viewer, and the flows come up.
    const e = 1 - Math.pow(1 - intro, 4);
    const d = dist * (1.22 - 0.22 * e);
    camera.position.set(d * Math.sin(VIEW) * 0.985, d * 0.17, d * Math.cos(VIEW) * 0.985);
    camera.lookAt(0.34, 0, 0);
    camera.updateProjectionMatrix();
    vajra.set(time, Math.max(0, (e - 0.35) / 0.65));
    model.rotation.y = px * 0.5 + Math.sin(time * 0.22) * (reduce ? 0 : 0.05) - (1 - e) * 0.55;
    model.rotation.x = py * 0.16;
    model.updateMatrixWorld();
    lens.render();
    placeLabels();
    if (!shown && (intro > 0.45 || reduce)) { shown = true; stage.classList.add("is-live"); }
  }

  const tune = createTuner(S, lens, resize);
  let visible = true, raf = 0;
  function frame() {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    intro = Math.min(1, intro + dt / 2.8);
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    draw();
    tune();
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
