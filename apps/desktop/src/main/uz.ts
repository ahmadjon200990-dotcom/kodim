// Main process'dan renderer'ga boradigan o'zbekcha xabarlar.
export const uz = {
  notConnected: "Server bilan aloqa yo'q. Internetni tekshiring",
  timeout: "Server javob bermadi, qayta urinib ko'ring",
  noWorkspace: "Ish papkasi hali tayyor emas",
  readonly: "Bu fayl faqat o'qish uchun",
  locked: "Imtihon vaqti tugagan, o'zgartirib bo'lmaydi",
  invalidName: "Nom noto'g'ri",
  exists: "Bunday nomli fayl yoki papka allaqachon bor",
  notFound: "Fayl topilmadi",
  ignoredPath: "Bu papkada fayl yaratib bo'lmaydi",
  failed: "Amalni bajarib bo'lmadi",
  tooManyTerminals: "Terminallar soni 5 tadan oshmasligi kerak",
  terminalFailed: "Terminalni ochib bo'lmadi",
  urlNotAllowed: "Bu manzil ruxsat etilmagan. Faqat localhost va Figma ochiladi",
} as const;
