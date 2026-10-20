// Event tafsilotlarini o'qituvchi uchun tushunarli o'zbekcha matnga aylantirish (jonli oqim va batafsil sahifa).
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

function duration(sec: unknown): string {
  const s = Number(sec);
  if (!Number.isFinite(s) || s <= 0) return "";
  if (s < 60) return `${s} soniya`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} daqiqa ${r} soniya` : `${m} daqiqa`;
}

const PASTE_SOURCE: Record<string, string> = {
  editor: "editorga",
  terminal: "terminalga",
  input: "maydonga",
  browser: "ichki brauzerga",
};

const SHOT_SOURCE: Record<string, string> = {
  printscreen: "PrintScreen tugmasi",
  snipping: "Ekran qirqish vositasi (Win+Shift+S)",
};

export function eventSummary(type: string, details: unknown): string {
  const d = (details && typeof details === "object" ? details : {}) as Record<string, unknown>;
  switch (type) {
    case "FOCUS_LOST": {
      const dur = duration(d.durationSec);
      return dur ? `Boshqa oynada ${dur} bo'ldi` : "Boshqa oynaga o'tdi (hali qaytmadi)";
    }
    case "WINDOW_MINIMIZED": {
      const dur = duration(d.durationSec);
      return dur ? `Ilova ${dur} kichraytirilgan holda turdi` : "Ilovani kichraytirdi (hali qaytmadi)";
    }
    case "FORBIDDEN_PROCESS":
      return `Ochilgan dastur: ${str(d.process)}`;
    case "EXTRA_DISPLAY":
      return `${str(d.count)} ta monitor ulangan`;
    case "DANGEROUS_COMMAND":
      return `Buyruq: ${str(d.line)}`;
    case "BLOCKED_COMMAND":
      return `Bajarilmadi: ${str(d.line)}${d.reason ? ` — ${str(d.reasonText ?? d.reason)}` : ""}`;
    case "TERMINAL_COMMAND":
      return str(d.line);
    case "UNKNOWN_PACKAGE":
      return `Ruxsatsiz paket: ${Array.isArray(d.packages) ? d.packages.join(", ") : ""}${d.blocked ? " (o'rnatilmadi)" : ""}`;
    case "EXTERNAL_FILE_CHANGE":
      return `${d.created ? "Tashqaridan fayl paydo bo'ldi" : "Fayl tashqaridan o'zgardi"}: ${str(d.path)}${d.size !== undefined ? ` (${str(d.size)} bayt)` : ""}`;
    case "READONLY_TAMPER":
      return `${d.removed ? "O'chirishga urindi" : "O'zgartirishga urindi"}: ${str(d.path)} (tiklandi)`;
    case "LARGE_INSERT":
      return `Bir zumda ${str(d.chars)} belgi qo'shildi`;
    case "PASTE_BLOCKED":
      return `Tashqaridan ${PASTE_SOURCE[str(d.source)] ?? ""} ${str(d.length)} belgi qo'yishga urindi (bloklandi)`;
    case "COPY_OUT_ATTEMPT":
      return `${str(d.chars)} belgi nusxalab, ${str(d.afterSec)} soniyadan keyin ilovadan chiqdi`;
    case "SCREENSHOT_ATTEMPT":
      return SHOT_SOURCE[str(d.source)] ?? "Ekran rasmini olishga urindi";
    case "DROP_BLOCKED":
      return d.files ? `Tashqaridan ${str(d.files)} ta fayl tashlashga urindi (bloklandi)` : "Tashqaridan matn tashlashga urindi (bloklandi)";
    case "DEVTOOLS_ATTEMPT":
      return `Bloklangan tugma: ${str(d.key)}`;
    case "BROWSER_BLOCKED":
      return `Ruxsatsiz sayt: ${str(d.url)}`;
    case "ENV_MISSING":
      return `Kompyuterda yo'q: ${Array.isArray(d.missing) ? d.missing.join(", ") : ""}`;
    case "DISCONNECTED":
      return "Internet/server aloqasi 10 soniyadan ko'proq uzildi";
    case "RECONNECTED":
      return d.byName ? "Ism bo'yicha qayta kirdi" : "Aloqa tiklandi";
    case "APP_CLOSED":
      return "Ilovani yopdi";
    case "DEVICE_CHANGED":
      return d.byName ? "Boshqa kompyuterdan, shu ism bilan kirdi" : "Boshqa kompyuterdan kirdi";
    case "LATE_JOIN":
      return `Boshlangandan ${str(d.minutesAfterStart)} daqiqa keyin kirdi`;
    case "AI_INJECTION":
      return "Kod ichida AI'ga ko'rsatma yozilgan";
    default:
      return "";
  }
}
