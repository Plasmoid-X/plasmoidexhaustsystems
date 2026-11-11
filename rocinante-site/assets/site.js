// Rocinante site: the tour list on the home page, the demo player, and the enquiry form.
(function () {
  const tours = window.TOURS || [];
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // Home page: list the tours, each linking into the demo.
  const list = document.getElementById("tour-list");
  if (list) {
    tours.forEach((t, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<a href="/demo.html#${t.id}"><span class="n">${i + 1}</span><span><strong></strong><span class="who"></span></span><span class="go">${t.steps.length} steps ›</span></a>`;
      li.querySelector("strong").textContent = t.title;
      li.querySelector(".who").textContent = `${t.who}. ${t.summary}`;
      list.appendChild(li);
    });
  }

  // Demo player.
  const stage = document.getElementById("stage");
  if (stage && tours.length) {
    const img = document.getElementById("stage-img");
    const picker = document.getElementById("tour-picker");
    const els = {
      count: document.getElementById("step-count"), title: document.getElementById("step-title"),
      text: document.getElementById("step-text"), prev: document.getElementById("prev"),
      next: document.getElementById("next"), dots: document.getElementById("dots"),
    };
    let tour = tours.find((t) => t.id === location.hash.slice(1)) || tours[0];
    let i = 0;

    tours.forEach((t) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.id = t.id;
      b.innerHTML = "<strong></strong><span></span>";
      b.querySelector("strong").textContent = t.title;
      b.querySelector("span").textContent = t.who;
      b.addEventListener("click", () => { tour = t; i = 0; history.replaceState(null, "", `#${t.id}`); render(true); });
      li.appendChild(b);
      picker.appendChild(li);
    });

    // Preload the current tour's pictures so stepping through is instant.
    const preload = (t) => t.steps.forEach((s) => { const p = new Image(); p.src = `/img/${s.shot}.webp`; });

    function render(focusStage) {
      const s = tour.steps[i];
      picker.querySelectorAll("button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.id === tour.id)));
      stage.classList.toggle("is-phone", !!tour.phone);
      img.src = `/img/${s.shot}.webp`;
      img.width = s.w; img.height = s.h;
      img.alt = `${s.title}: ${s.text}`;
      stage.querySelectorAll(".hotspot").forEach((h) => h.remove());
      const last = i === tour.steps.length - 1;
      if (s.hotspot && !last) {
        const h = document.createElement("button");
        h.className = "hotspot";
        h.type = "button";
        h.setAttribute("aria-label", "Go to the next step");
        const pad = 0.006;
        Object.assign(h.style, {
          left: `${(s.hotspot.x - pad) * 100}%`, top: `${(s.hotspot.y - pad) * 100}%`,
          width: `${(s.hotspot.w + pad * 2) * 100}%`, height: `${(s.hotspot.h + pad * 2) * 100}%`,
        });
        h.addEventListener("click", go(1));
        stage.appendChild(h);
      }
      els.count.textContent = `${tour.title} · Step ${i + 1} of ${tour.steps.length}`;
      els.title.textContent = s.title;
      els.text.textContent = s.text;
      els.prev.disabled = i === 0;
      els.next.textContent = last ? (tours.indexOf(tour) < tours.length - 1 ? "Next Tour" : "Enquire") : "Next";
      els.dots.innerHTML = tour.steps.map((_, k) => `<span class="${k <= i ? "on" : ""}"></span>`).join("");
      preload(tour);
      if (focusStage) stage.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function go(d) {
      return () => {
        const ni = i + d;
        if (ni < 0) return;
        if (ni >= tour.steps.length) {
          const n = tours.indexOf(tour) + 1;
          if (n < tours.length) { tour = tours[n]; i = 0; history.replaceState(null, "", `#${tour.id}`); render(true); }
          else location.href = "/#enquire";
          return;
        }
        i = ni;
        render(false);
      };
    }
    els.prev.addEventListener("click", go(-1));
    els.next.addEventListener("click", go(1));
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") go(1)();
      if (e.key === "ArrowLeft") go(-1)();
    });
    window.addEventListener("hashchange", () => {
      const t = tours.find((x) => x.id === location.hash.slice(1));
      if (t && t !== tour) { tour = t; i = 0; render(true); }
    });
    render(false);
  }

  // Enquiry form: send without leaving the page; without JavaScript it posts normally.
  const form = document.getElementById("enquiry-form");
  if (form && window.fetch) {
    const status = document.getElementById("form-status");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true; btn.textContent = "Sending…";
      status.className = "form-status"; status.textContent = "";
      try {
        const res = await fetch(form.action, { method: "POST", headers: { Accept: "application/json" }, body: new FormData(form) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) throw new Error();
        form.reset();
        status.className = "form-status ok";
        status.textContent = "Thank you. We've got your enquiry and will reply by email.";
      } catch {
        status.className = "form-status err";
        status.textContent = "That didn't send. Please try again in a moment.";
      } finally {
        btn.disabled = false; btn.textContent = "Send Enquiry";
      }
    });
  }
})();
