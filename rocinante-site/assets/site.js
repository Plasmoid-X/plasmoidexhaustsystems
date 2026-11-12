// Rocinante site: the enquiry form (the demo is in demo.js).
(function () {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

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
