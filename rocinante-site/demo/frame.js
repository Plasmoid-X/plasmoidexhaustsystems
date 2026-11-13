// Runs inside each copied page of the demo (see rocinante-site-tools/snap.js). The page is the app's real HTML
// without its scripts; this makes it behave: light/dark, the phone menu, links to the other copies, and a note
// when someone presses something that would save or change data.
(function () {
  var D = window.DEMO || {}, root = document.documentElement;
  function theme() {
    var s = "light";
    try { if (localStorage.getItem("rocinante-demo-scheme") === "dark") s = "dark"; } catch (e) {}
    root.setAttribute("data-theme", s);
  }
  theme();
  // Opened on its own (a search result, a copied address): show it inside the demo instead.
  if (window.top === window) { location.replace("/demo#" + D.who + "/" + D.n); return; }
  function tell(type) { parent.postMessage({ rocinante: type, who: D.who, n: D.n, path: D.path, title: D.title }, location.origin); }
  try { if (sessionStorage.getItem("rocinante-demo-links") === "1") root.classList.add("demo-links"); } catch (e) {}

  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.rocinante === "theme") theme();
    if (e.data.rocinante === "links") {
      root.classList.toggle("demo-links", !!e.data.on);
      try { sessionStorage.setItem("rocinante-demo-links", e.data.on ? "1" : "0"); } catch (err) {}
    }
  });

  var toastEl, toastTimer;
  function toast(text) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "demo-toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.textContent = text;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("on"); }, 3200);
  }

  var OPEN = ["block", "sm:fixed", "sm:inset-y-0", "sm:left-0", "sm:z-40", "sm:shadow-pop", "lg:relative", "lg:shadow-none"];
  function toggleMenu() {
    var menu = document.getElementById("app-menu");
    if (!menu) return;
    var open = menu.classList.contains("hidden");
    menu.classList.toggle("hidden", !open);
    OPEN.forEach(function (c) { menu.classList.toggle(c, open); });
    document.querySelectorAll('button[aria-controls="app-menu"]').forEach(function (b) { b.setAttribute("aria-expanded", String(open)); });
    if (open) window.scrollTo(0, 0);
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    var a = t.closest("a[href]");
    if (a) {
      var kind = a.getAttribute("data-demo");
      if (kind) { e.preventDefault(); toast(kind === "out" ? "That link leaves the vessel's system, so it's switched off here." : "That page isn't part of this demo."); return; }
      // The live site serves a copy at its address without ".html"; going straight there saves a redirect.
      var href = a.getAttribute("href");
      if (/^\d+\.html$/.test(href) && !/^(localhost|127\.)/.test(location.hostname) && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); location.href = href.slice(0, -5); }
      return;
    }
    if (t.closest("summary")) return;
    var b = t.closest('button, [role="button"], input[type="submit"], input[type="button"]');
    if (!b) return;
    if (b.getAttribute("aria-controls") === "app-menu") { e.preventDefault(); toggleMenu(); return; }
    if (/^\s*[‹←<]?\s*Back\s*$/.test(b.textContent || "")) { e.preventDefault(); history.back(); return; }
    e.preventDefault();
    e.stopPropagation();
    toast("Buttons are switched off in the demo, so nothing here can be saved or changed.");
  }, true);
  document.addEventListener("submit", function (e) {
    e.preventDefault();
    toast("Saving and searching are switched off in the demo.");
  }, true);

  // Keep the menu where it was scrolled to from one page to the next.
  function scrollers() { return [].slice.call(document.querySelectorAll("#app-menu, #app-menu *")); }
  window.addEventListener("pagehide", function () {
    try {
      var keep = [];
      scrollers().forEach(function (el, i) { if (el.scrollTop > 0) keep.push([i, el.scrollTop]); });
      sessionStorage.setItem("rocinante-demo-menu-" + D.who, JSON.stringify(keep));
    } catch (e) {}
  });
  document.addEventListener("DOMContentLoaded", function () {
    try {
      var all = scrollers();
      JSON.parse(sessionStorage.getItem("rocinante-demo-menu-" + D.who) || "[]").forEach(function (k) { if (all[k[0]]) all[k[0]].scrollTop = k[1]; });
    } catch (e) {}
    tell("page");
  });
})();
