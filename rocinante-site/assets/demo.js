// Rocinante demo: pick a department, then click around pictures of the real app as that person.
// The pictures and the positions of their links are made by rocinante-site-tools/crawl.js into /demo/<id>.json
// and /demo/<id>/<c|cd|p|pd>/<n>.webp (c = computer, p = phone, d = dark).
(function () {
  const DEPTS = [
    { id: "captain", dept: "Captain", who: "Captain", blurb: "Every department on one page, certificates, the crew rotation and the Captain's Safe." },
    { id: "bridge", dept: "Bridge", who: "Chief Officer", blurb: "Navigation equipment, safety and ISM records, the deck log and the deck team's work." },
    { id: "engineering", dept: "Engineering", who: "Chief Engineer", blurb: "Planned maintenance by running hours, the SWBS vessel database, spares and the engine room log." },
    { id: "deck", dept: "Deck", who: "Bosun", blurb: "Tenders, mooring and life-saving equipment, rounds and the jobs for the deck crew." },
    { id: "interior", dept: "Interior", who: "Chief Stewardess", blurb: "Guest areas, laundry, the wine cellar, interior stores and housekeeping tasks." },
  ];
  window.ROCINANTE_DEPTS = DEPTS;

  // Home page: one card per department, each opening the demo signed in as that person.
  const home = document.getElementById("dept-list");
  if (home) home.innerHTML = DEPTS.map((d) => `<li><a href="/demo.html#${d.id}"><strong>${d.dept}</strong><span class="who">as the ${d.who}</span><span class="blurb">${d.blurb}</span><span class="go">Open ›</span></a></li>`).join("");

  const viewer = document.getElementById("viewer");
  if (!viewer) return;

  const $ = (id) => document.getElementById(id);
  const pick = $("pick"), cards = $("dept-cards"), tabs = $("dept-tabs"), screen = $("screen"), shot = $("shot"), img = $("shot-img");
  const address = $("address"), backBtn = $("go-back"), homeBtn = $("go-home"), spotsBtn = $("show-spots");
  const coach = $("coach"), coachText = $("coach-text"), tryList = $("try-list");
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  let device = store.get("rocinante-demo-device") === "p" ? "p" : (store.get("rocinante-demo-device") === "c" ? "c" : (matchMedia("(max-width: 680px)").matches ? "p" : "c"));
  let scheme = store.get("rocinante-demo-scheme") === "dark" ? "d" : "l";
  let data = null, persona = null, at = 0; // at = page index, or "menu" (the phone's menu)
  const cache = new Map();

  cards.innerHTML = DEPTS.map((d) => `<li><a class="dept-card" href="#${d.id}"><span class="dept-name">${d.dept}</span><span class="dept-who">as the ${d.who}</span><span class="dept-blurb">${d.blurb}</span><span class="go">Open ›</span></a></li>`).join("");
  tabs.innerHTML = DEPTS.map((d) => `<a href="#${d.id}" data-id="${d.id}"><strong>${d.dept}</strong><span>${d.who === d.dept ? "Whole Vessel" : d.who}</span></a>`).join("");

  async function load(id) {
    if (!cache.has(id)) cache.set(id, fetch(`/demo/${id}.json`).then((r) => { if (!r.ok) throw new Error(); return r.json(); }));
    return cache.get(id);
  }
  const variant = () => device + (scheme === "d" ? "d" : "");
  const src = (i) => `/demo/${persona.id}/${variant()}/${i}.webp`;
  const pageOf = (i) => (i === "menu" ? null : data.pages[i]);
  const view = (i) => (i === "menu" ? data.menu : data.pages[i][device]);

  // The phone shows its own pages; a page the phone robot couldn't open falls back to the computer picture.
  function picture(i) {
    if (i === "menu") return { url: src("menu"), v: data.menu };
    const p = data.pages[i];
    if (p[device]) return { url: src(i), v: p[device] };
    return { url: `/demo/${persona.id}/c${scheme === "d" ? "d" : ""}/${i}.webp`, v: p.c };
  }

  function setPressed() {
    document.querySelectorAll("[data-device]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.device === device)));
    document.querySelectorAll("[data-scheme]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scheme === scheme)));
    tabs.querySelectorAll("a").forEach((a) => a.setAttribute("aria-current", String(persona && a.dataset.id === persona.id)));
    const cur = persona && tabs.querySelector(`[data-id="${persona.id}"]`);
    if (cur) tabs.scrollLeft += cur.getBoundingClientRect().left - tabs.getBoundingClientRect().left - (tabs.clientWidth - cur.offsetWidth) / 2;
  }

  function render(scrollTop) {
    const pic = picture(at);
    if (!pic.v) return;
    $("browser").classList.toggle("is-phone", device === "p");
    $("browser").classList.toggle("is-dark", scheme === "d");
    img.src = pic.url;
    img.width = pic.v.w; img.height = pic.v.h;
    shot.style.aspectRatio = `${pic.v.w} / ${pic.v.h}`;
    const p = pageOf(at);
    img.alt = at === "menu" ? "The app's menu on a phone." : `${p.title}, as the ${persona.who} sees it.`;
    address.textContent = "m-y-example.vessel" + (at === "menu" ? "/dashboard  ·  menu" : p.path);
    document.title = `${at === "menu" ? "Menu" : p.title} · ${persona.dept} | Rocinante Demo`;
    shot.querySelectorAll(".spot").forEach((s) => s.remove());
    const spots = (pic.v.spots || []).slice();
    // On the phone, the ☰ button opens the menu picture.
    if (device === "p" && data.menuButton && pic.v === view(at)) {
      const [x, y, w, h] = data.menuButton;
      spots.push([x, y / pic.v.h, w, h / pic.v.h, at === "menu" ? "back" : "menu"]);
    }
    const seen = new Set();
    for (const [x, y, w, h, t] of spots) {
      const k = `${x},${y},${t}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const a = document.createElement("a");
      a.className = "spot";
      a.href = t === "back" ? "#" : `#${persona.id}/${t}`;
      if (t === "back") a.addEventListener("click", (e) => { e.preventDefault(); history.back(); });
      a.setAttribute("aria-label", t === "menu" ? "Open the menu" : t === "back" ? "Close the menu" : `Go to ${data.pages[t].title}`);
      Object.assign(a.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
      shot.appendChild(a);
    }
    backBtn.disabled = history.length < 2;
    setPressed();
    if (scrollTop) screen.scrollTop = 0;
    // Fetch the pages this one links to, so the next click is instant.
    setTimeout(() => spots.slice(0, 40).forEach(([, , , , t]) => { if (t === "back") return; const q = picture(t); if (q.v) { const im = new Image(); im.src = q.url; } }), 300);
  }

  function renderTry() {
    const want = [[/^\/dashboard$/, "Dashboard"], [/^\/tasks$/, "Tasks"], [/^\/tasks\/./, null], [/^\/category\/[^/]+\/system\//, null],
      [/^\/departments$/, "Departments overview"], [/^\/logbook$/, "Logbook"], [/^\/rounds$/, "Rounds"], [/^\/inventory$/, "Inventory"], [/^\/cellar$/, "Wine Cellar"], [/^\/rotation$/, "Crew Rotation"]];
    const items = [];
    for (const [re, label] of want) {
      const i = data.pages.findIndex((p) => re.test(p.path));
      if (i >= 0 && !items.some((x) => x.i === i)) items.push({ i, label: label || data.pages[i].title });
      if (items.length >= 6) break;
    }
    if (device === "p" && data.menu) items.splice(1, 0, { i: "menu", label: "The phone menu" });
    tryList.innerHTML = items.map((x) => `<li><a href="#${persona.id}/${x.i}">${x.label}</a></li>`).join("");
  }

  function showCoach() {
    const key = `rocinante-demo-coach-${device}`;
    if (store.get(key)) { coach.hidden = true; return; }
    coachText.textContent = device === "p"
      ? `You're signed in as the ${persona.who}, on a phone. Tap ☰ for the menu, or anything that's a link. "Show Links" marks them all.`
      : `You're signed in as the ${persona.who}. Click the menu on the left or anything that's a link. "Show Links" marks them all.`;
    coach.hidden = false;
    $("coach-ok").onclick = () => { store.set(key, "1"); coach.hidden = true; };
  }

  async function route() {
    const [id, rest] = location.hash.slice(1).split("/");
    const d = DEPTS.find((x) => x.id === id);
    if (!d) { pick.hidden = false; viewer.hidden = true; document.title = "Rocinante Demo | Try It as Your Department"; return; }
    let json;
    try { json = await load(id); } catch { pick.hidden = false; viewer.hidden = true; return; }
    const changed = persona !== d;
    persona = d; data = json;
    const next = rest === "menu" ? (data.menu ? "menu" : 0) : Math.min(Math.max(parseInt(rest || "0", 10) || 0, 0), data.pages.length - 1);
    const moved = changed || next !== at;
    at = next;
    pick.hidden = true; viewer.hidden = false;
    render(moved);
    if (changed) { renderTry(); showCoach(); }
    if (changed) viewer.scrollIntoView({ block: "start" });
  }

  document.querySelectorAll("[data-device]").forEach((b) => b.addEventListener("click", () => {
    device = b.dataset.device; store.set("rocinante-demo-device", device);
    if (at === "menu" && device === "c") { location.hash = `${persona.id}/0`; return; }
    render(false); renderTry(); showCoach();
  }));
  document.querySelectorAll("[data-scheme]").forEach((b) => b.addEventListener("click", () => {
    scheme = b.dataset.scheme; store.set("rocinante-demo-scheme", scheme === "d" ? "dark" : "light");
    render(false);
  }));
  backBtn.addEventListener("click", () => history.back());
  homeBtn.addEventListener("click", () => { location.hash = `${persona.id}/0`; });
  spotsBtn.addEventListener("click", () => {
    const on = !shot.classList.contains("show-spots");
    shot.classList.toggle("show-spots", on);
    spotsBtn.setAttribute("aria-pressed", String(on));
  });
  // A click that misses every link flashes them, so people learn where to click.
  shot.addEventListener("click", (e) => {
    if (e.target.closest(".spot")) return;
    shot.classList.remove("flash"); void shot.offsetWidth; shot.classList.add("flash");
  });
  window.addEventListener("hashchange", route);
  route();
})();
