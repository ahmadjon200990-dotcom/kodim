// Ilova nomi va ko'rinadigan brend matnlari faqat shu yerdan o'zgartiriladi.
// Ichki paket nomlari (@exam-ide/*) bunga bog'liq emas.
export const BRAND = {
  /** Texnik identifikator (papka nomlari, session partition). */
  id: "kodim",
  /** O'quvchi ilovasi nomi. */
  name: "Kodim",
  /** O'qituvchi paneli nomi. */
  panelName: "Kodim Panel",
  slogan: "Har bir qator — o'zingniki.",
  domain: "kodim.uz",
  /** Electron appId (Windows). */
  appId: "uz.kodim.desktop",
} as const;
