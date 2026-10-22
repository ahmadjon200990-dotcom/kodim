// Yuklab olish tugmasi: oxirgi versiya /downloads/latest.json dan.
(async () => {
  const btns = document.querySelectorAll("[data-download]");
  const meta = document.querySelectorAll("[data-download-meta]");
  try {
    const res = await fetch("/downloads/latest.json", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const latest = await res.json();
    const mb = (latest.size / 1024 / 1024).toFixed(0);
    btns.forEach((b) => b.setAttribute("href", latest.url));
    meta.forEach((m) => (m.textContent = `Versiya ${latest.version} · Windows 10/11 · ${mb} MB`));
  } catch {
    btns.forEach((b) => {
      b.setAttribute("aria-disabled", "true");
      b.classList.add("is-disabled");
      b.removeAttribute("href");
    });
    meta.forEach((m) => (m.textContent = "Yuklab olish tez orada — o'qituvchingizdan so'rang"));
  }
})();

// FAQ: bittasi ochilsa, qolganlari yopiladi.
document.querySelectorAll(".faq details").forEach((d) =>
  d.addEventListener("toggle", () => {
    if (d.open) document.querySelectorAll(".faq details").forEach((o) => o !== d && (o.open = false));
  }),
);
