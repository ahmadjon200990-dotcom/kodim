# Kodim — Audit (Demo Day oldidan)

Sinov sharoiti: server (build) + panel (server beradi) + desktop ilova (Electron, real oyna) + 2 ta soxta o'quvchi
(`apps/server/src/dev/fake-student.ts`, ikkinchi kompyuter o'rniga — bitta kompyuterda ilovaning ikkinchi nusxasi
single-instance tufayli ochilmaydi). To'liq oqim: login → imtihon (JS mashq + Figma) → kod → 3 o'quvchi →
boshlash → terminal / fayl / qoidabuzarliklar → vaqt → jarima → tugash → natijalar → batafsil → Excel.

Muhimlik: **KRITIK** — demo'da ko'rinadigan buzilish yoki ma'lumot yo'qolishi; **MUHIM** — sezilarli noqulaylik
yoki chalg'ituvchi holat; **KICHIK** — sayqal.

## Ogohlantirishlar — haqiqiy sinov natijasi

| Event | Natija | Izoh |
|---|---|---|
| FORBIDDEN_PROCESS | ✅ keldi | chrome/claude/telegram/code — boshlanishda |
| TERMINAL_COMMAND | ✅ keldi | |
| DANGEROUS_COMMAND | ✅ keldi | `curl` |
| UNKNOWN_PACKAGE | ⚠️ serverga keldi, panelda ko'rinmadi | A1 ga qarang |
| EXTERNAL_FILE_CHANGE | ✅ keldi | |
| READONLY_TAMPER | ✅ keldi, fayl tiklandi | |
| PASTE_BLOCKED | ✅ keldi | |
| FOCUS_LOST | ✅ keldi, davomiylik bilan | |
| LATE_JOIN | ✅ keldi | |
| APP_CLOSED | ✅ keldi | |
| DEVICE_CHANGED | ✅ keldi | |
| DISCONNECTED / RECONNECTED | ✅ keldi | |
| EXTRA_DISPLAY | ➖ sinab bo'lmadi | bu kompyuterda 1 monitor; mantiq oddiy |
| LARGE_INSERT | ➖ amalda chiqmaydi | barcha paste yo'llari ichki; yozish harf-harf. To'g'ri — false positive yo'q |

## Topilgan muammolar

### KRITIK
- **A1. Panel qayta ulanganda / sahifa yangilanganda ogohlantirishlar yo'qoladi.** `exam:watch` faqat imtihon va
  o'quvchilarni qaytaradi, eventlar tarixini emas. Socket qisqa uzilib qayta ulansa, o'sha paytdagi eventlar
  (sinovda `npm i lodash` → UNKNOWN_PACKAGE) panelga hech qachon kelmaydi; sahifani yangilasa oqim bo'm-bo'sh
  ("Hozircha ogohlantirish yo'q", bazada esa 20+ event). Bu "ba'zi ogohlantirishlar kelmayapti" muammosining
  asosiy sababi. *Kerak:* watch javobida oxirgi eventlar, qayta ulanishda birlashtirish. — ⏳
- **A2. Imtihon boshlanganda yozish uchun fayl ochilmaydi.** Faqat `savollar.md` (faqat o'qish) ochiladi, fokus
  terminalga ketadi. *Kerak:* `savollar.md` + asosiy fayl (index.html / script.js / src/App.jsx) ochilsin, kursor
  asosiy faylda. — ⏳
- **A3. AI yoqilgan imtihon GRADING holatida abadiy qoladi va o'chirib bo'lmaydi.** AI baholash (8-bosqich) hali
  yo'q, lekin `aiEnabled` standart `true`. Natijada imtihonlar ro'yxati "Baholanmoqda" bilan to'ladi.
  *Kerak:* grader yo'qligida imtihon FINISHED ga o'tsin, o'quvchilarda "AI hali ulanmagan" belgisi. — ⏳

### MUHIM
- **B1. Panel formasi xatolari umumiy:** "Kiritilgan ma'lumotlar noto'g'ri" — qaysi maydon ekani yo'q; server
  `issues` ichida esa inglizcha matn ("Too small: expected number to be >=1"). *Kerak:* maydon nomi + oddiy
  o'zbekcha sabab. — ⏳
- **B2. Desktop ilova VS Code'ga o'xshamaydi:** Activity Bar, fayl ikonkalari, breadcrumbs, status bar
  (qator:ustun, til, vaqt), o'lchamni sudrab o'zgartirish, F2/Delete, Emmet, Ctrl+P yo'q. — ⏳
- **B3. Seed va konfiguratsiyada eski nom:** `demo@exam-ide.local`, `admin@exam-ide.local`; Excel `creator`
  qattiq yozilgan. *Kerak:* `@kodim.uz`, nom `BRAND` dan. — ⏳
- **B4. Panelda brauzerning `confirm/prompt/alert` oynalari** (Boshlash, Tugatish, Bekor qilish, Boshqa jarima)
  — eski ko'rinish, ba'zi muhitlarda (sinovdagi ichki brauzer) bloklanib, "Boshlash" ishlamay qoldi.
  *Kerak:* o'z modal oynalari va toast xabarlar. — ⏳
- **B5. Jonli oqim TERMINAL_COMMAND (INFO) bilan to'lib ketadi** — muhim DANGER/WARN pastga suriladi (100 ta
  chegara). *Kerak:* oqimda INFO buyruqlarni yashirish/filtr, batafsil sahifada to'liq tarix. — ⏳
- **B6. Natijalar jadvalida AI holati ustuni yo'q** (CLAUDE.md 7.5: baholanmoqda/tayyor/xato). — ⏳
- **B7. Panel telefon ekranida buziladi:** jadval sahifadan chiqib ketadi, menyu siqiladi. — ⏳
- **B8. Jonli sahifada yangi ogohlantirish ajralib ko'rinmaydi** (rang bor, lekin "yangi" urg'usi va toast
  yo'q). — ⏳

### KICHIK
- **C1. Panel login bo'sh maydon bilan yuboriladi** — mijoz tomonida tekshiruv yo'q. — ⏳
- **C2. Yuklanish holatlari faqat "Yuklanmoqda…" matni** — skeletlar yo'q. — ⏳
- **C3. "O'z fayllarim" (CUSTOM) shabloni panelda yo'q** — ⏳ (fayllarni qo'lda kiritish; .zip — yo'q)
- **C4. Desktop fayllar daraxti har 3 s so'rov yuboradi** — watcher eventlari bilan darhol yangilansin.
  — ⏳
- **C5. Soxta o'quvchi bir marta sababsiz qayta ulandi** (server log'da xato yo'q). Klient o'zi jim qayta
  ulanadi, event yo'qolmaydi (navbat). Kuzatishda qoldi.
- **C6. Sinov vositasi (CDP) oyna kichraytirilganda osilib qoladi** — mahsulot muammosi emas.

## Qolgan (sababi bilan)
- **AI baholash** — 8-bosqich (rejada alohida). Hozir "AI hali ulanmagan" deb aniq ko'rsatiladi.
- **.zip yuklash** (CUSTOM shablon, namuna yechim) — vaqt cheklovi; fayllar qo'lda kiritiladi.
- **EXTRA_DISPLAY** — ikkinchi monitorda qo'lda sinash kerak.
