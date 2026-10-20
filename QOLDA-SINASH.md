# Kodim — qo'lda sinash yo'riqnomasi (Demo Day 2)

Bu ro'yxat barcha yangi talablarni (CLAUDE.md 0-bo'lim) qamrab oladi. Tartib bo'yicha yuring.

## 0. Tayyorlash

```bash
# 1) Toza baza (ixtiyoriy, lekin tavsiya etiladi — eski test imtihonlardan xoli)
pnpm --filter @exam-ide/server exec prisma migrate reset --force
pnpm seed

# 2) Build
pnpm -r build
pnpm --filter @exam-ide/panel build     # panel server/public ga tushadi

# 3) Server (panelni ham beradi)
node apps/server/dist/index.js
# yoki: pnpm dev:server
```

Demo o'qituvchi: `demo@kodim.uz` / `demo12345`. Admin: `.env` dagi `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

Desktop ilovani ishga tushirish: `pnpm start:desktop` (build + preview).
Sinov uchun CDP bilan: `cd apps/desktop && npx electron . --remote-debugging-port=9222`.
Ikkinchi o'quvchi (ixtiyoriy): `node apps/server/dist/dev/fake-student.js <kod> <ism> [deviceId]`.

---

## 1. Panel — abadiy yuklanish yo'q (0-talab)

Brauzerda `http://localhost:8080` ni oching, o'qituvchi sifatida kiring.

- [ ] Manzil qatoriga `/exams/yoq/live` yozing → **"Imtihon topilmadi"** + "Imtihonlar ro'yxatiga" tugmasi (abadiy yuklanish emas).
- [ ] `/attempts/yoq`, `/exams/yoq/results`, `/exams/yoq/edit` → mos "topilmadi" xabari.
- [ ] DevTools konsolda `localStorage.setItem('kodim.token','buzuq'); location.reload()` → login sahifasiga qaytadi (abadiy yuklanish emas).
- [ ] Serverni to'xtatib, sahifani yangilang → login ekrani (yuklanish emas). Serverni qayta yoqing.

## 2. Panel — SaaS dizayn (6-talab)

- [ ] Yon menyu, kartalar, badge'lar, ko'k asos — bir xil uslub.
- [ ] Imtihon o'chirishda brauzer `confirm` emas, **o'z modal oynasi**; muvaffaqiyatda **toast** chiqadi.
- [ ] Imtihonlar ro'yxati yuklanayotganda **skelet** ko'rinadi; imtihon yo'q bo'lsa chiroyli bo'sh holat.
- [ ] Oynani tor qiling (telefon kengligi) → jadval kartaga aylanadi, menyu buzilmaydi.
- [ ] Login: bo'sh/email noto'g'ri → maydon tekshiruvi xabari.

## 3. Imtihon yaratish — shablon, buyruqlar, rasm (2, 3, 6-talab)

"Yangi imtihon":

- [ ] Shablon grid: Bo'sh, HTML/CSS/JS, React+Vite, **Vue+Vite, TypeScript, Node.js, Python**, "muhit kerak/kerak emas" belgisi.
- [ ] "Ruxsat etilgan terminal buyruqlari" bo'limi: **Frontend / Node.js / Python to'plamlari**, qo'lda buyruq qo'shish, o'chirish.
- [ ] Figma topshiriq qo'shing → **dizayn rasm yuklash** (drag&drop yoki tanlash), oldindan ko'rish, o'chirish. Figma havolasi YOKI rasm bo'lmasa — saqlashda xato.
- [ ] Mezonlar yig'indisi 100 bo'lmasa — xato. Saqlang.

## 4. Desktop — kirish va qoidalar (5-talab)

- [ ] Ilova kod + ism ekrani bilan ochiladi.
- [ ] Kutish xonasini oching (panel), kod bilan kiring → **"Imtihon qoidalari" ekrani**, "Tushundim" bosilgach kutish xonasi/ish maydoni.
- [ ] Status Bar'da internet/server belgisi va **node/npm/python** holati.

## 5. Desktop — VS Code ko'rinishi (1-talab)

Imtihonni boshlang (panel → "Boshlash").

- [ ] Activity Bar (Explorer, Qidiruv), fayl ikonkalari (turga qarab rangli), `savollar.md`/`dizaynlar` qulf belgisi.
- [ ] Tablar, breadcrumbs, minimap, ko'k Status Bar (Qator:Ustun, til, qolgan vaqt).
- [ ] Panellar chegarasini sudrab o'lchamini o'zgartirish (sidebar / terminal / brauzer).
- [ ] Klaviatura: **Ctrl+`** (terminal), **Ctrl+B** (sidebar), **Ctrl+Shift+E/F**, **Ctrl+P** (fayl qidirish), **Ctrl+Shift+P** (buyruqlar palitrasi), **Ctrl+N/S/W**, **Ctrl+Tab**, **Ctrl+=/−** (masshtab), **Alt+Z** (o'rash).
- [ ] FileTree: **F2** nomlash, **Delete** o'chirish (tasdiq bilan), o'ng menyu; faylni papkaga **sudrab ko'chirish** (ilova ichida).
- [ ] Rasm fayli (png/jpg/svg) editorда **rasm** sifatida ochiladi; `savollar.md` **markdown ko'rinishida** (tabdagi "Manba/Ko'rinish" yoki Ctrl+Shift+V).
- [ ] Emmet: HTML faylda `div.box>ul>li*3` + Tab → kengayadi; teg/qavs avtoyopiladi.

## 6. Desktop — terminal ruxsati (3-talab)

Terminalda (pastdagi kiritma qatoriga yozib Enter):

- [ ] `curl http://example.com` → **bajarilmaydi**, qizil xabar "...ruxsat etilmagan...", panelda **Ruxsatsiz buyruq (bloklandi)** (DANGER).
- [ ] `node -v; echo hi` → **CHAINING** bloklanadi (zanjirlash ruxsat etilmagan).
- [ ] `npm install lodash` (lodash ruxsatsiz) → bloklanadi, **Ruxsatsiz paket** (WARN) + bloklangan buyruq.
- [ ] `node -v` → **ishlaydi** (ruxsat etilgan), versiya chiqadi.
- [ ] `npm create vite@latest` → interaktiv savollar (busy rejimda javob yoziladi). ↑↓ tarix, Tab to'ldirish, Ctrl+C to'xtatish.

## 7. Desktop — barcha ogohlantirishlar (4-talab)

Har birini chaqirib, **panel jonli oqimida** ism bilan, o'zbekcha, to'g'ri rangda (DANGER qizil / WARN sariq / INFO kulrang) ko'rinishini tekshiring. Panelda daraja va tur **filtri**, yangi kelgani **ajralib** turadi, DANGER/WARN'da **ovoz**.

- [ ] Boshqa oynaga o'tish → **Boshqa oynaga o'tdi** (qaytganda davomiylik).
- [ ] Ilovani kichraytirish → **Ilovani kichraytirdi**.
- [ ] Chrome/Telegram/VS Code ochish → **Taqiqlangan dastur**.
- [ ] PrintScreen yoki Win+Shift+S → **Screenshot urinishi**.
- [ ] Tashqaridan matn nusxalab Ctrl+V → **Tashqaridan qo'yish urinishi**.
- [ ] Ilova ichida nusxalab, 10 s ichida boshqa oynaga o'tish → **Tashqariga nusxalash urinishi**.
- [ ] Ish maydoniga tashqaridan fayl sudrab tashlash → **Tashqaridan sudrab tashlash**.
- [ ] Bloklangan buyruq (6-bo'lim) → **Ruxsatsiz buyruq**.
- [ ] Ruxsatsiz paket → **Ruxsatsiz paket**.
- [ ] Tashqi fayl o'zgarishi (terminaldan ruxsatsiz yoki boshqa dastur) → **Tashqi fayl o'zgarishi**.
- [ ] `savollar.md` ni o'zgartirishga urinish → **Himoyalangan faylga tegildi** (fayl tiklanadi).
- [ ] F12 / Ctrl+Shift+I / Ctrl+R → **DevTools tugmasi** (tugma baribir bloklangan).
- [ ] Ichki brauzerда `example.com` → **Ruxsatsiz sayt**.
- [ ] Ikkinchi monitor ulangan bo'lsa → **Qo'shimcha monitor**.
- [ ] Ilovani yopish → **Ilovani yopdi**; internet uzish → **Internet uzildi** / **Qayta ulandi**.
- [ ] Boshqa `deviceId` dan kirish → **Boshqa qurilmadan kirdi**; boshlangandan keyin kirish → **Kech keldi**.
- [ ] Kerakli muhit yo'q shablon (masalan Python kompyuterda yo'q) → **Dasturlash muhiti yo'q**.

## 8. Desktop — vaqt, topshirish, qaytish (5-talab)

- [ ] Tugashiga 5 va 1 daqiqa qolganda **banner** ogohlantirish (1 daqiqada qizil).
- [ ] "Topshirish" yoki vaqt tugashi → **"Imtihoningiz topshirildi"** ekrani ~10 s → avtomatik **kod+ism ekraniga** qaytadi; lokal ish papkasi tozalanadi.

## 9. Jonli kuzatuv va kodni ko'rish (6-talab)

- [ ] Panel "Jonli kuzatuv": o'quvchi kartalari (onlayn/uzilgan/topshirgan), ogohlantirish/jarima soni, DANGER'da karta ajralib turadi.
- [ ] "Kodni ko'rish" → o'quvchining joriy kodi (faqat o'qish, fayllar bo'yicha).
- [ ] Ogohlantirish yonida −5 / −10 / Boshqa (modal) / Bekor qilish (modal). Jarima → yakuniy ball qayta hisoblanadi.

## 10. Natijalar va Excel

- [ ] Natijalar jadvali: AI holati, jarima, yakuniy ball, ogohlantirish; saralash; telefon ekrani.
- [ ] "Excel yuklab olish" → `.xlsx` yuklanadi.
- [ ] Batafsil: mezon bo'yicha ball tahrirlash + izoh, jarimalar, eventlar tarixi (buyruqlarni yashirish/ko'rsatish), fayllar diff (o'quvchi ↔ namuna).

---

## Ma'lum cheklovlar (hakamlarга)

- Telefon kamerasi bilan ekranni suratga olishni dastur to'xtata olmaydi — o'qituvchi nazorati qoplaydi.
- AI baholash (8-bosqich) hali ulanmagan — natijalarда "AI hali ulanmagan", o'qituvchi qo'lda baholaydi.
- Fayl ikonkalari — VS Code'ga yaqin yengil to'plam (to'liq vscode-icons shrifti emas).
- `.exe` build va deploy — 10-bosqich.
