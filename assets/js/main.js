// TEAM AIC { AI Circle } — site behaviour
// Mobile nav toggle, active link highlight, footer year.

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("siteNav");

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");
      toggle.classList.toggle("open", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("open");
        toggle.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  const current = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".site-nav a, .subnav a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === current) {
      a.classList.add("active");
    }
  });

  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
});
