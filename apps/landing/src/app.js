
const RELEASE_URL =
  "https://github.com/ahmadjon200990-dotcom/kodim/releases/download/v1.0.0/Kodim-Setup-1.0.0.exe";

const VERSION = "1.0.0";
const FILE_SIZE_MB = 114;

(() => {
  const btns = document.querySelectorAll("[data-download]");
  const meta = document.querySelectorAll("[data-download-meta]");

  btns.forEach((btn) => {
    btn.setAttribute("href", RELEASE_URL);
    btn.setAttribute("download", "Kodim-Setup-1.0.0.exe");
    btn.removeAttribute("aria-disabled");
    btn.classList.remove("is-disabled");
  });

  meta.forEach((el) => {
    el.textContent = `Versiya ${VERSION} · Windows 10/11 · ${FILE_SIZE_MB} MB`;
  });
})();

// FAQ: bittasi ochilsa, qolganlari yopiladi.
document.querySelectorAll(".faq details").forEach((d) =>
  d.addEventListener("toggle", () => {
    if (d.open) {
      document.querySelectorAll(".faq details").forEach((o) => {
        if (o !== d) o.open = false;
      });
    }
  }),
);
