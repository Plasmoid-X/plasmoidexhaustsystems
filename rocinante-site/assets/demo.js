// Rocinante demo: pick a department, then use copies of the app's real screens as that person.
// The copies are made by rocinante-site-tools/snap.js into /demo/<id>/<n>.html (+ /demo/<id>.json, the page
// list); /demo/frame.js runs inside each one and reports which page is showing.
(function () {
  const DEPTS = [
    { id: "captain", dept: "Captain", who: "Captain", blurb: "Every department on one page, certificates, the crew rotation and the Captain's Safe." },
    { id: "bridge", dept: "Bridge", who: "Chief Officer", blurb: "Navigation equipment, safety and ISM records, the deck log and the deck team's work." },
    { id: "engineering", dept: "Engineering", who: "Chief Engineer", blurb: "Planned maintenance by running hours, the SWBS vessel database, spares and the engine room log." },
    { id: "deck", dept: "Deck", who: "Bosun", blurb: "Tenders, mooring and life-saving equipment, rounds and the jobs for the deck crew." },
    { id: "interior", dept: "Interior", who: "Chief Stewardess", blurb: "Guest areas, laundry, the wine cellar, interior stores and housekeeping tasks." },
  ];

  // Home page: one card per department, each opening the demo signed in as that person.
  const home = document.getElementById("dept-list");
  if (home) home.innerHTML = DEPTS.map((d) => `<li><a href="/demo#${d.id}"><strong>${d.dept}</strong><span class="who">as the ${d.who}</span><span class="blurb">${d.blurb}</span><span class="go">Open ›</span></a></li>`).join("");

  const viewer = document.getElementById("viewer");
  if (!viewer) return;

  const $ = (id) => document.getElementById(id);
  const pick = $("pick"), cards = $("dept-cards"), tabs = $("dept-tabs"), browser = $("browser"), screen = $("screen"), frame = $("frame");
  const address = $("address"), spotsBtn = $("show-spots"), coach = $("coach"), coachText = $("coach-text"), tryList = $("try-list");
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  const saved = store.get("rocinante-demo-device");
  let device = saved === "p" || saved === "c" ? saved : (matchMedia("(max-width: 680px)").matches ? "p" : "c");
  let scheme = store.get("rocinante-demo-scheme") === "dark" ? "d" : "l";
  let showLinks = false;
  let data = null, persona = null;
  let showing = null; // "<id>/<n>" the frame last reported
  const cache = new Map();

  cards.innerHTML = DEPTS.map((d) => `<li><a class="dept-card" href="#${d.id}"><span class="dept-name">${d.dept}</span><span class="dept-who">as the ${d.who}</span><span class="dept-blurb">${d.blurb}</span><span class="go">Open ›</span></a></li>`).join("");
  tabs.innerHTML = DEPTS.map((d) => `<a href="#${d.id}" data-id="${d.id}"><strong>${d.dept}</strong><span>${d.who === d.dept ? "Whole Vessel" : d.who}</span></a>`).join("");

  const load = (id) => {
    if (!cache.has(id)) cache.set(id, fetch(`/demo/${id}.json`).then((r) => { if (!r.ok) throw new Error(); return r.json(); }));
    return cache.get(id);
  };
  const send = (msg) => { try { frame.contentWindow.postMessage(msg, location.origin); } catch {} };

  // The frame is drawn at a real computer or phone width and scaled to fit, so the app lays itself out properly.
  function fit() {
    const phone = device === "p";
    browser.classList.toggle("is-phone", phone);
    browser.classList.toggle("is-dark", scheme === "d");
    const w = screen.clientWidth, h = screen.clientHeight;
    const logical = phone ? 390 : Math.max(w, 1280);
    const scale = Math.min(1, w / logical);
    frame.style.width = `${logical}px`;
    frame.style.height = `${h / scale}px`;
    frame.style.transform = scale === 1 ? "" : `scale(${scale})`;
  }

  function setPressed() {
    document.querySelectorAll("[data-device]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.device === device)));
    document.querySelectorAll("[data-scheme]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scheme === scheme)));
    spotsBtn.setAttribute("aria-pressed", String(showLinks));
    tabs.querySelectorAll("a").forEach((a) => a.setAttribute("aria-current", String(persona && a.dataset.id === persona.id)));
    const cur = persona && tabs.querySelector(`[data-id="${persona.id}"]`);
    if (cur) tabs.scrollLeft += cur.getBoundingClientRect().left - tabs.getBoundingClientRect().left - (tabs.clientWidth - cur.offsetWidth) / 2;
  }

  function renderTry() {
    const want = [[/^\/dashboard$/, "Dashboard"], [/^\/tasks$/, "Tasks"], [/^\/tasks\/[^?]+$/, null], [/^\/category\/[^/]+\/system\/[^?]+$/, null],
      [/^\/departments$/, "Departments Overview"], [/^\/logbook$/, "Logbook"], [/^\/rounds$/, "Rounds"], [/^\/cellar$/, "Wine Cellar"], [/^\/inventory$/, "Inventory"], [/^\/rotation$/, "Crew Rotation"], [/^\/obligations$/, "Certificates"]];
    const items = [];
    for (const [re, label] of want) {
      const i = data.pages.findIndex((p) => re.test(p.path));
      if (i >= 0 && !items.some((x) => x.i === i)) items.push({ i, label: label || data.pages[i].title });
      if (items.length >= 7) break;
    }
    tryList.innerHTML = items.map((x) => `<li><a href="#${persona.id}/${x.i}">${x.label}</a></li>`).join("");
  }

  function showCoach() {
    const key = `rocinante-demo-coach2-${device}`;
    if (store.get(key)) { coach.hidden = true; return; }
    coachText.textContent = device === "p"
      ? `You're signed in as the ${persona.who}, on a phone. Scroll, tap Menu, and open anything, just as on board.`
      : `You're signed in as the ${persona.who}. Use the menu on the left and open anything, just as on board.`;
    coach.hidden = false;
    $("coach-ok").onclick = () => { store.set(key, "1"); coach.hidden = true; };
  }

  async function route() {
    const [id, rest] = location.hash.slice(1).split("/");
    const d = DEPTS.find((x) => x.id === id);
    if (!d) { pick.hidden = false; viewer.hidden = true; persona = null; showing = null; document.title = "Rocinante Demo | Try It as Your Department"; return; }
    let json;
    try { json = await load(id); } catch { pick.hidden = false; viewer.hidden = true; return; }
    const changed = persona !== d;
    persona = d; data = json;
    const n = Math.min(Math.max(parseInt(rest || "0", 10) || 0, 0), data.pages.length - 1);
    pick.hidden = true; viewer.hidden = false;
    fit(); setPressed();
    if (showing !== `${id}/${n}`) {
      showing = `${id}/${n}`;
      const url = `/demo/${id}/${n}.html`;
      // replace(): the address bar's own history entry already stands for this page.
      if (frame.contentWindow && frame.src) frame.contentWindow.location.replace(url); else frame.src = url;
    }
    if (changed) { renderTry(); showCoach(); viewer.scrollIntoView({ block: "start" }); }
  }

  // The frame says which page it is showing (after a click inside it, or Back).
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data || e.data.rocinante !== "page") return;
    const m = e.data;
    showing = `${m.who}/${m.n}`;
    address.textContent = "m-y-example.vessel" + m.path;
    document.title = `${m.title} · ${(DEPTS.find((d) => d.id === m.who) || {}).dept || ""} | Rocinante Demo`;
    if (location.hash !== `#${showing}`) history.replaceState(null, "", `#${showing}`);
    if (!persona || persona.id !== m.who) route();
    if (showLinks) send({ rocinante: "links", on: true });
  });

  document.querySelectorAll("[data-device]").forEach((b) => b.addEventListener("click", () => {
    device = b.dataset.device; store.set("rocinante-demo-device", device);
    fit(); setPressed(); if (persona) showCoach();
  }));
  document.querySelectorAll("[data-scheme]").forEach((b) => b.addEventListener("click", () => {
    scheme = b.dataset.scheme; store.set("rocinante-demo-scheme", scheme === "d" ? "dark" : "light");
    fit(); setPressed(); send({ rocinante: "theme" });
  }));
  $("go-back").addEventListener("click", () => history.back());
  $("go-home").addEventListener("click", () => { if (persona) location.hash = `${persona.id}/0`; });
  spotsBtn.addEventListener("click", () => { showLinks = !showLinks; setPressed(); send({ rocinante: "links", on: showLinks }); });
  window.addEventListener("resize", fit);
  window.addEventListener("hashchange", route);
  route();
})();
