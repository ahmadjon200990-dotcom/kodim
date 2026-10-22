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
  asosiy sababi. *Kerak:* watch javobida oxirgi eventlar, qayta ulanishda birlashtirish. — tuzatildi ✅ (`exam:watch` oxirgi 300 eventni qaytaradi, panel id bo'yicha birlashtiradi; sinov: sahifa eventlardan keyin ochildi — 7 ta ogohlantirish tarixdan ko'rindi)
- **A2. Imtihon boshlanganda yozish uchun fayl ochilmaydi.** Faqat `savollar.md` (faqat o'qish) ochiladi, fokus
  terminalga ketadi. *Kerak:* `savollar.md` + asosiy fayl (index.html / script.js / src/App.jsx) ochilsin, kursor
  asosiy faylda. — tuzatildi ✅ (`savollar.md` + asosiy fayl ochiladi, faol tab — asosiy fayl; avtomatik ochilgan terminal fokusni olmaydi; sinov: `index.html` faol, fokus editorda)
- **A3. AI yoqilgan imtihon GRADING holatida abadiy qoladi va o'chirib bo'lmaydi.** AI baholash (8-bosqich) hali
  yo'q, lekin `aiEnabled` standart `true`. Natijada imtihonlar ro'yxati "Baholanmoqda" bilan to'ladi.
  *Kerak:* grader yo'qligida imtihon FINISHED ga o'tsin, o'quvchilarda "AI hali ulanmagan" belgisi. — tuzatildi ✅ (`AI_GRADER_READY=false` bo'lsa FINISHED + `aiError`; server ishga tushganda osilib qolganlar ham tuzatiladi; sinov: 12 ta GRADING → FINISHED, o'chirish 204)

### MUHIM
- **B1. Panel formasi xatolari umumiy:** "Kiritilgan ma'lumotlar noto'g'ri" — qaysi maydon ekani yo'q; server
  `issues` ichida esa inglizcha matn ("Too small: expected number to be >=1"). *Kerak:* maydon nomi + oddiy
  o'zbekcha sabab. — tuzatildi ✅ (`shared/src/zod-uz.ts` — global o'zbekcha xabarlar; panel `lib/errors.ts` maydon nomi bilan: "Imtihon nomi: to'ldirilishi shart", "1-topshiriq, nomi: to'ldirilishi shart")
- **B2. Desktop ilova VS Code'ga o'xshamaydi:** Activity Bar, fayl ikonkalari, breadcrumbs, status bar
  (qator:ustun, til, vaqt), o'lchamni sudrab o'zgartirish, F2/Delete, Emmet, Ctrl+P yo'q. — **keyingi sessiya (desktop dizayni)**
- **B3. Seed va konfiguratsiyada eski nom:** `demo@exam-ide.local`, `admin@exam-ide.local`; Excel `creator`
  qattiq yozilgan. *Kerak:* `@kodim.uz`, nom `BRAND` dan. — tuzatildi ✅ (`demo@kodim.uz`, `admin@kodim.uz` — seed, `.env.example`, lokal `.env`, smoke, hujjatlar; Excel `creator` = `BRAND.name`)
- **B4. Panelda brauzerning `confirm/prompt/alert` oynalari** (Boshlash, Tugatish, Bekor qilish, Boshqa jarima)
  — eski ko'rinish, ba'zi muhitlarda (sinovdagi ichki brauzer) bloklanib, "Boshlash" ishlamay qoldi.
  *Kerak:* o'z modal oynalari va toast xabarlar. — **keyingi sessiya (panel dizayni)**
- **B5. Jonli oqim TERMINAL_COMMAND (INFO) bilan to'lib ketadi** — muhim DANGER/WARN pastga suriladi (100 ta
  chegara). *Kerak:* oqimda INFO buyruqlarni yashirish/filtr, batafsil sahifada to'liq tarix. — tuzatildi ✅ (oqimda terminal buyruqlari standart yashirin, "Buyruqlarni ko'rsatish" tanlovi va yashirinlar soni; batafsil sahifada to'liq tarix)
- **B6. Natijalar jadvalida AI holati ustuni yo'q** (CLAUDE.md 7.5: baholanmoqda/tayyor/xato). — tuzatildi ✅ ("AI holati": Tayyor / Xato (sababi tooltipda) / Baholanmoqda / O'chiq)
- **B7. Panel telefon ekranida buziladi:** jadval sahifadan chiqib ketadi, menyu siqiladi. — **keyingi sessiya (panel dizayni)**
- **B8. Jonli sahifada yangi ogohlantirish ajralib ko'rinmaydi** (rang bor, lekin "yangi" urg'usi va toast
  yo'q). — **keyingi sessiya (panel dizayni)** — ma'lumot tayyor: `LiveAlert.fresh` va `lastLoud`

### KICHIK
- **C1. Panel login bo'sh maydon bilan yuboriladi** — mijoz tomonida tekshiruv yo'q. — **keyingi sessiya (panel dizayni)**
- **C2. Yuklanish holatlari faqat "Yuklanmoqda…" matni** — skeletlar yo'q. — **keyingi sessiya (panel dizayni)**
- **C3. "O'z fayllarim" (CUSTOM) shabloni panelda yo'q** — **keyingi sessiya** (fayllarni qo'lda kiritish; .zip — yo'q)
- **C4. Desktop fayllar daraxti har 3 s so'rov yuboradi** — watcher eventlari bilan darhol yangilansin.
  — **keyingi sessiya (desktop dizayni)**
- **C5. Soxta o'quvchi bir marta sababsiz qayta ulandi** (server log'da xato yo'q). Klient o'zi jim qayta
  ulanadi, event yo'qolmaydi (navbat). Kuzatishda qoldi.
- **C6. Sinov vositasi (CDP) oyna kichraytirilganda osilib qoladi** — mahsulot muammosi emas.
- **C7. Lokal baza sinovlar orasida tozalanmagan.** `prisma migrate reset` AI agent ishlatganda foydalanuvchining
  aniq roziligini talab qiladi va jim rad etgan — shuning uchun panelda eski "Smoke"/"Curl" imtihonlar va eski
  `demo@exam-ide.local` / `admin@exam-ide.local` akkauntlari qolgan. Toza baza kerak bo'lsa, o'zingiz ishga tushiring:
  `pnpm --filter @exam-ide/server exec prisma migrate reset --force`, keyin `pnpm seed`.

## Keyingi sessiya (foydalanuvchi qarori: dizayn alohida)
- **B2, C4 — desktop:** VS Code Dark Modern UI (Activity Bar, fayl ikonkalari, breadcrumbs, status bar, sudraladigan
  panellar, F2/Delete, Emmet, Ctrl+P, chiroyli bo'sh holat, kirish/kutish/topshirildi ekranlari).
- **B4, B7, B8, C1, C2, C3 — panel:** o'z modal/toast oynalari, telefon ekrani, yangi ogohlantirish urg'usi,
  skeletlar, login tekshiruvi, CUSTOM shablon.

## Qolgan (sababi bilan)
- **AI baholash** — 8-bosqich (rejada alohida). Hozir "AI hali ulanmagan" deb aniq ko'rsatiladi.
- **.zip yuklash** (CUSTOM shablon, namuna yechim) — vaqt cheklovi; fayllar qo'lda kiritiladi.
- **EXTRA_DISPLAY** — ikkinchi monitorda qo'lda sinash kerak.

---

## Demo Day 2 (2026-10-20) — 0-bo'lim talablari

Barchasi bajarildi va real Electron (CDP, port 9222) + panel (ichki brauzer) orqali sinaldi. To'liq tavsif: `CLAUDE.md` → "Demo Day 2" yozuvi. Qisqa holat:

| Talab | Holat | Izoh |
|---|---|---|
| 0. Panel abadiy yuklanish | ✅ | `useLoad`, `PageMessage`; yo'q imtihon/ish → topilmadi; buzuq token → login; tarmoq xatosi → login |
| 1. Desktop VS Code ko'rinishi | ✅ | Activity Bar, ikonkalar, tablar, breadcrumbs, minimap, status bar, sudraladigan panellar, shortcutlar, Emmet, rasm/markdown ko'rinishi, F2/Delete/DnD |
| 2. Shablon va muhit | ✅ | Vue/TS/Node/Python shablonlar; node/npm/python aniqlash; ENV_MISSING; bo'sh papka = faqat savollar.md |
| 3. Terminal ruxsati | ✅ | `checkCommand`, zanjirlash/aylanib o'tish bloki, ruxsatsiz paket bloki, busy'da raw; sinaldi (curl/CHAINING/UNKNOWN_PACKAGE/allowed) |
| 4. Ogohlantirishlar | ✅ | 8 yangi tur; panel filtr (daraja+tur), fresh urg'u; BLOCKED/UNKNOWN sinaldi |
| 5. Desktop oqimi | ✅ | Qoidalar ekrani, 5/1 daq banner, topshirgach 10 s → login + tozalash; sinaldi |
| 6. Panel SaaS | ✅ | modal/toast, skelet, bo'sh/xato, telefon, dizayn rasm yuklash, "Kodni ko'rish" |

**Haqiqiy sinov natijalari (desktop):** kirish → qoidalar → kutish → boshlash → VS Code ish maydoni (status barda node/npm/python ✓) → terminal: curl=NOT_ALLOWED, `node -v; echo hi`=CHAINING, `npm i lodash`=UNKNOWN_PACKAGE (bloklandi), `node -v`=ishladi → FORBIDDEN_PROCESS + FOCUS_LOST keldi → savollar.md markdown ko'rinishi → Topshirish → "Topshirildi" → 10 s → login (ish papkasi o'chdi).

**Qolgan (sababi bilan):** AI baholash (8), `.exe` build/deploy (10), Ctrl+\ editor split (vaqt), dizayn rasm bilan AI baholash, screenshot — telefon kamerasi (fizik cheklov). Baza avtomatik tozalanmagan (eski test yozuvlar qolishi mumkin; `prisma migrate reset` + `pnpm seed` foydalanuvchi qo'lida).

---

## Demo Day 3 (2026-10-20) — real sinov muammolari va audit

Sinov: server + panel (ichki brauzer) + real Electron (CDP, port 9222). To'liq oqim: imtihon yaratish (rasm + tayyor papka
.zip) → kod → o'quvchi kirdi → qoidalar → boshlash → kod yozish, fayl yaratish/nusxalash/ko'chirish, terminal (node REPL,
bloklangan buyruqlar), tashqi o'zgarish → panelda kodni ko'rish → tugatish → avtomatik qaytish → topshirilgan ishlar,
baholash, zip, Excel.

### Foydalanuvchi topganlari
| # | Muammo | Sabab | Holat |
|---|---|---|---|
| 1 | Yozayotganda kursor fayl boshiga sakraydi | watcher o'z avtosaqlashimizni ham `onDiskChange` qilib yuborardi → renderer eskiroq disk matnini `setValue` qilardi | ✅ `scripts/typing-test.mjs`: oldin 4/4 xato → 4/4 OK |
| 2 | Emmet / takliflar / snippetlar | `emmet-monaco-es` Monaco 0.57 da ishlamadi | ✅ o'z modul (`editorFeatures.ts`), real yozib sinaldi |
| 2 | Linked editing, split editor (Ctrl+\, chetga sudrash) | yo'q edi | ✅ |
| 3 | Fayllar paneli to'liq menyusi, rasm ko'rinishi | yo'q edi | ✅ |
| 4 | Brauzer to'liq ekran ↔ yon panel, Esc | yo'q edi | ✅ |
| 5 | Dizayn rasmi saqlanmaydi | forma rasmlarni faqat FIGMA turida yuborardi, server ham faqat FIGMA'da saqlardi | ✅ har turda |
| 5 | Mezonlar majburiy | — | ✅ ixtiyoriy, AI bilan birga yashirin |
| 5 | Tayyor papka (.zip/papka, binarlar) | yo'q edi | ✅ 20 MB, aniq xatolar |
| 6 | Topshirilgan ishlar, zip, faqat o'qituvchi baholashi | yo'q edi | ✅ |
| 7 | UI'da "Demo" | seed nomlari | ✅ |

### O'zim topganlarim
- **KRITIK — ma'lumot yo'qolishi xavfi:** tahrirlanmagan model ham tab yopilganda / topshirishda / ko'chirishda diskka
  yozilardi. Sinovda bir marta `index.html` bo'sh matn bilan bosilib ketdi (aniq ketma-ketligi takrorlanmadi). Endi faqat
  foydalanuvchi tahrirlagan ("dirty") fayl yoziladi. ✅
- **KRITIK:** avtomatik qaytishdan keyin oldingi imtihonning Monaco modellari xotirada qolardi — keyingi imtihondagi shu
  nomli fayl eski matn bilan ochilardi. Ish maydoni yopilganda `disposeAll()`. ✅
- **MUHIM:** terminal `node` REPL'da kiritma buyruq deb tekshirilib bloklanardi (ConPTY ekranni qayta chizganda eski "PS ~>"
  qatori "prompt qaytdi" deb tanilardi). Endi prompt'da OSC 633;A belgisi. Sinaldi: node → `6*7` → `.exit` → `curl` bloklandi. ✅
- **MUHIM:** >1 MB fayllar sync'da "o'chirilgan" deb serverdan o'chirilardi (`snapshot(present)`). ✅
- **MUHIM:** o'quvchi qo'shgan binar fayllar serverga bormasdi (topshirilgan ishda yo'qolardi) — endi base64. ✅
- **KICHIK:** qayta ulanishda faol tab boshqa faylga almashardi; boshlanganda faqat savollar.md ochiladi (0.2). ✅
- **KICHIK:** panel "Kodni ko'rish" va Batafsil sahifada rasmlar yashirin edi. ✅
- **KICHIK:** ko'chirish/nusxalash watcher'da soxta EXTERNAL_FILE_CHANGE berishi mumkin edi (`markTree`). ✅
- **Kuzatuvda:** terminal orqali o'chirilgan fayl tabi ochiq qoladi; yozilsa fayl qayta yaratiladi (VS Code ham shunday).
- **Sinov vositasi:** bir vaqtda ikkita CDP sinov skripti ishlasa, kiritmalar aralashadi — ketma-ket ishga tushiring.

---

## Mahsulotga tayyorlash (2026-10-21/22) — yakuniy to'liq sinov (6-qism)

Sinov: server (dev + production rejimi) + soxta Figma API (`apps/server/src/dev/fake-figma.ts`) + panel (ichki brauzer) +
desktop (dev build, CDP) + o'rnatilgan `Kodim-Setup-1.0.0.exe` (SendKeys bilan) + 3 o'quvchi (desktop "Ali Valiyev",
soxta "Bobur Toshev", kech kirgan "Kamola Rahimova"). Imtihon: JS mashq + Figma dizayn (inspect) + tayyor papka (CUSTOM, binar logo).

### Oqim natijasi
| Qadam | Natija |
|---|---|
| Admin/o'qituvchi email+parol kirishi, Google tugmasi (sozlangan bo'lsa), OAuth state tekshiruvi | ✅ |
| Imtihon yaratish (CUSTOM papka + Figma) → Figma holati READY, 2 freym | ✅ |
| Kutish xonasi → qoidalar → boshlash; 2 o'quvchi bir vaqtda | ✅ |
| Emmet (`div.karta>h2+p`), dizayn inspect (masofa, rang, shrift, CSS, nusxalash) | ✅ |
| PowerShell: `node -v` ✓; `npm i lodash` → UNKNOWN_PACKAGE+BLOCKED; `node -v; iwr x` → CHAINING; `node -e x` → INLINE_CODE | ✅ |
| Git Bash: `ls`, `node -v` ✓; `eval`, `$(…)`, `bash -c` → bloklandi; node REPL ishlaydi | ✅ |
| cmd: jarayon paytida `curl` → TYPEAHEAD bloklandi | ✅ |
| Jarima −10, vaqt +5 (hammaga) va +3 (bitta o'quvchiga) — desktop taymeri yangilandi | ✅ |
| Panel "Imtihonni tugatish" (o'z modal oynasi) → 15 s → hammasi SUBMITTED → desktop "topshirildi" → 10 s → login, ish papkasi o'chdi | ✅ |
| Baholash 85/70, yakuniy 85 − 10 = 75, baholanmagan ajratilgan; .zip (har o'quvchi papkasi, binar bilan, savollar.md/dizaynlar yo'q); Excel | ✅ |
| O'rnatilgan .exe: ishga tushdi, debug flag → darhol chiqdi (CDP yopiq), RunAsNode ishlamadi, kirish → terminal (node-pty) → yozish → sync → F12 → topshirish | ✅ |

### Ogohlantirishlar (shu sinovda)
✅ FORBIDDEN_PROCESS, PASTE_BLOCKED, DROP_BLOCKED, EXTERNAL_FILE_CHANGE, READONLY_TAMPER (fayl tiklandi), BROWSER_BLOCKED,
WINDOW_MINIMIZED (davomiylik bilan), FOCUS_LOST, BLOCKED_COMMAND, UNKNOWN_PACKAGE, TERMINAL_COMMAND, APP_CLOSED, DEVICE_CHANGED,
RECONNECTED, LATE_JOIN, DEVTOOLS_ATTEMPT (o'rnatilgan .exe'da F12). ➖ SCREENSHOT_ATTEMPT va EXTRA_DISPLAY — avtomatik sinab bo'lmaydi
(tizim tugmasi / ikkinchi monitor); COPY_OUT_ATTEMPT — avtomatik sinovda oyna fokusini ushlab bo'lmadi (mantiq o'zgarmagan, Demo Day 2 da sinalgan).

### Topilgan va tuzatilgan
- **KRITIK — terminal "type-ahead" aylanib o'tish.** Jarayon ishlayotganda (masalan `node -v` sekin ishga tushganda) yozilgan qator
  "interaktiv javob" sifatida tekshiruvsiz yuborilardi; jarayon stdin'ni o'qimasa, qator konsol buferida qolib, jarayon tugagach
  shell uni **buyruq sifatida bajarardi** — sinovda `curl https://chatgpt.com` shunday ishladi va o'qituvchiga hech narsa bormadi.
  Tuzatish: PowerShell prompt'ida `FlushInputBuffer()`, bash'da `PROMPT_COMMAND` bilan stdin bo'shatiladi, cmd'da busy paytida ham
  `checkCommand` (faqat `y`/`n`/`1` kabi qisqa javoblar o'tadi); busy belgisi jarayonlar daraxti bilan tasdiqlanadi (doimiy PowerShell
  yordamchisi, ~0.5 s) — prompt belgisi kechiksa ham qator tekshiruvdan o'tadi; jarayonga yuborilgan kiritma ham TERMINAL_COMMAND
  (`input: true`) bo'lib o'qituvchiga ko'rinadi. Sinaldi: uchala shell'da `node sekin.js` paytida `curl` → bajarilmadi; REPL ishlaydi.
- **MUHIM:** ichki brauzer manzil satriga yozilgan ruxsatsiz sayt (chatgpt.com) rad etilardi, lekin `BROWSER_BLOCKED` yuborilmasdi. ✅
- **MUHIM:** o'quvchi kodi bo'yicha bloklash IP bo'yicha edi — bitta sinf NAT ortida bo'lsa, bir o'quvchining 10 ta xato kodi butun
  sinfni 30 daqiqaga bloklardi. Endi qurilma (IP+deviceId) bo'yicha 10, IP bo'yicha 50, server bo'yicha 300/daq. ✅
- **MUHIM:** production'da seed ma'lum parolli namuna o'qituvchini (`demo12345`) yaratardi — endi faqat `SEED_DEMO=1` bo'lsa. ✅
- **MUHIM:** o'qituvchi materiallari (savollar.md, dizaynlar, Figma PNG'lar) har o'quvchi ishida bazada nusxalanardi — endi faqat
  o'quvchi fayllari saqlanadi, materiallar yuborishda qo'shiladi (keshlanadi). ✅
- **MUHIM:** terminal bloklash xabari stili faqat bo'lingan (split) terminalda ishlardi (CSS selektor xatosi). ✅
- **MUHIM:** panel telefon kengligida gorizontal toshardi (grid `1fr` min-content). ✅
- **KICHIK:** desktop Explorer/brauzer tugmalarida unicode belgilar (＋ ▣ ⊟ ⟳) — codicon SVG. ✅ Panelda emoji ikonkalar — SVG. ✅
- **KICHIK:** tahrirlab bo'lmaydigan (ochilgan) imtihonda "Saqlash" faol edi va server xatosi chiqardi — endi oldindan ogohlantirish. ✅
- **Build:** electron-builder ikonka konvertori (WASM) bu kompyuterda xotira xatosi berdi — `.ico` o'zimiz yaratamiz (`scripts/make-icon.cjs`). ✅

### Ma'lum cheklovlar / sinab bo'lmaganlar
- Haqiqiy Figma API faqat xato formati bo'yicha tekshirildi (haqiqiy token yo'q) — oqim soxta Figma API bilan to'liq sinaldi.
- Docker/Caddy bu kompyuterda yo'q — `docker compose` sinab bo'lmadi; production rejimi (sarlavhalar, CORS, rate limit, CSP) Node'da sinaldi.
- Haqiqiy Google OAuth (client yo'q) — yo'naltirish, state va xato oqimi sinaldi; token almashish qismi haqiqiy client bilan sinalishi kerak.
- WSL bu kompyuterda o'rnatilmagan — profil faqat mavjud bo'lsa chiqadi; ruxsat qoidalari testlarda.
- cmd'da interaktiv dasturlar (node REPL, `npm create vite` savollari) cheklangan — PowerShell yoki Git Bash tavsiya etiladi; cmd prompt'ida to'liq yo'l ko'rinadi.
- Kod imzosi yo'q — Windows SmartScreen ogohlantiradi.
- Sinov paytida kompyuter uyqu rejimiga o'tganda topshirish kechikdi (ikkala ish bir xil millisekundda) — server taymeri alohida 1 daqiqalik imtihonda aniq ishladi (+15 s).
