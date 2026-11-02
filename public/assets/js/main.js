// Mobile nav toggle
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".menu-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    const setOpen = (open) => {
      links.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      toggle.innerHTML = open ? "&times;" : "&#9776;";
    };
    toggle.addEventListener("click", () => setOpen(!links.classList.contains("open")));
    links.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => setOpen(false))
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && links.classList.contains("open")) {
        setOpen(false);
        toggle.focus();
      }
    });
    document.addEventListener("click", (e) => {
      if (links.classList.contains("open") && !links.contains(e.target) && !toggle.contains(e.target)) {
        setOpen(false);
      }
    });
  }

  // Reveal-on-scroll. Content is visible without this script; CSS only hides
  // [data-reveal] when <html> has the "js" class and motion is allowed.
  const revealEls = document.querySelectorAll("[data-reveal]");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce && "IntersectionObserver" in window && revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealEls.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i, 5) * 60}ms`;
      io.observe(el);
    });
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  // Basic client-side validation feedback for the enquiry form (progressive enhancement;
  // actual submission handled by the form's own action/service).
  const form = document.querySelector("#enquiry-form");
  if (form) {
    form.addEventListener("submit", () => {
      const submitBtn = form.querySelector("button[type=submit]");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending…";
      }
    });
  }
});
