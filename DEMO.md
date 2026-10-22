# Kodim — 5 daqiqalik jonli demo

## Tayyorgarlik (demodan 30 daqiqa oldin)

| Nima | Qanday |
|---|---|
| Server + panel | `node apps/server/dist/index.js` (yoki deploy qilingan https://teacher.kodim.uz) |
| Figma | Sozlamalarda Figma tokeni saqlangan, imtihon sahifasida "Figma dizaynlari: Tayyor" |
| Imtihon | "Frontend imtihon": 1 JS mashq + 1 Figma topshiriq + tayyor papka (logo bilan). Qoralama holatida |
| O'quvchi kompyuteri | Kodim o'rnatilgan, server manzili to'g'ri (⚙), Chrome/Telegram **ochiq** (ogohlantirish chiqishi uchun) |
| Ikkinchi o'quvchi | ikkinchi kompyuter yoki `node apps/server/dist/dev/fake-student.js <kod> "Bobur Toshev"` |
| Ekran | Proyektorda panel (Jonli kuzatuv), yonida o'quvchi noutbuki |
| Ovoz | Panel tabida ovoz yoqilgan (ogohlantirish signali) |

## Ssenariy

| Vaqt | Nima qilinadi | Nima deyiladi |
|---|---|---|
| 0:00–0:30 | Landing (kodim.uz) | "O'quv markazlarida kompyuterdagi imtihonda ChatGPT'dan nusxa olish 5 soniya. Kodim — buni yopadigan imtihon muharriri." |
| 0:30–1:00 | Panel → imtihon → **Kutish xonasini ochish** → katta 6 xonali kod | "O'qituvchi Google bilan kiradi, imtihonni yaratadi: topshiriqlar, Figma dizayn, tayyor papka, ruxsat etilgan buyruqlar." |
| 1:00–1:40 | O'quvchi: kod + ism → **qoidalar** → kutish. Panelda o'quvchi paydo bo'ladi → **Boshlash** | "Hamma bir vaqtda boshlaydi, vaqt serverda — kompyuter soatini o'zgartirib bo'lmaydi." |
| 1:40–2:30 | O'quvchi: `index.html` da `div.karta>h2+p` + Tab (Emmet); `dizaynlar/` → **Dizayn ko'rish** → tugmani bosish → o'lcham/rang/shrift, boshqa elementga olib borish → masofa | "VS Code'dagidek muharrir. Figma'ga kirish shart emas — dizayn o'lchamlari shu yerda." |
| 2:30–3:30 | Qoidabuzarliklar: (1) brauzerdan matn nusxalab **Ctrl+V** → hech narsa qo'yilmaydi; (2) terminalda `curl https://chatgpt.com` → qizil "ruxsat etilmagan"; (3) ichki brauzerda `chatgpt.com` → rad; (4) Alt+Tab bilan Telegram'ga o'tish | Proyektorga ishora: har biri ovozli signal bilan **ism va tushuntirish** bilan panelga keladi; qizil = jiddiy, sariq = ogohlantirish. |
| 3:30–4:00 | Panel: ogohlantirish yonida **−10** jarima, o'quvchiga **+5 daq** | "O'qituvchi darhol jarima qo'yadi yoki vaqt qo'shadi." |
| 4:00–4:30 | **Imtihonni tugatish** → o'quvchida "topshirildi" → 10 s → kirish ekrani | "Vaqt tugasa avtomatik topshiriladi, kompyuterda hech narsa qolmaydi." |
| 4:30–5:00 | **Topshirilgan ishlar**: o'quvchi papkasi, kod, ball 85 → yakuniy 75 (jarima ayirildi); **.zip** va **Excel** | "Ishlarni yig'ish va baholash — bir joyda. Rahmat!" |

## Zaxira reja

| Muammo | Nima qilish |
|---|---|
| Internet yo'q | Server noutbukda: `node apps/server/dist/index.js`; o'quvchi ilovasida ⚙ → `http://<noutbuk IP>:8080` (bir Wi-Fi) yoki shu kompyuterda `http://localhost:8080` |
| Figma yuklanmadi (limit/token) | Topshiriqdagi yuklangan dizayn **rasmi** bilan ko'rsatish; "Jonli Figma" tugmasi |
| Ikkinchi kompyuter ishlamadi | `fake-student.js` bilan ikkinchi o'quvchi; stdin'ga `event FOCUS_LOST` yoki `close` (APP_CLOSED) |
| Ovoz chiqmadi | Panel tabini bir marta bosing (brauzer avtoovozni bloklaydi) |
| O'quvchi ilovasi qotdi | Yopib qayta oching → o'sha kod va ism → ish tiklanadi (panelda "Ilovani yopdi" va "Qayta ulandi" — bu ham demo) |
| Hammasi ishlamasa | `docs/screenshots/after/` dagi skrinshotlar va shu ssenariy bo'yicha gapirish |

## Hakamlarning ehtimoliy 10 savoli

1. **Telefon bilan ekranni suratga olsa-chi?** — Hech qanday dastur kamerani to'xtata olmaydi; screenshot tugmalari bloklanadi va qayd etiladi, oyna ekran yozuvidan himoyalangan. Telefon — o'qituvchi nazorati.
2. **Ikkinchi kompyuter yoki virtual mashina?** — Boshqa qurilmadan kirish (`DEVICE_CHANGED`) aniqlanadi. VM aniqlash — keyingi versiya.
3. **Terminal ochiq — internetdan yuklab olsa?** — Faqat o'qituvchi ruxsat bergan buyruqlar ishlaydi; zanjirlash, boshqa shell, `node -e`, ruxsatsiz paketlar bloklanadi va har biri o'qituvchiga boradi. Har shell (PowerShell, cmd, bash) o'z sintaksisi bilan tekshiriladi.
4. **Internet uzilsa ish yo'qoladimi?** — Yo'q: ish kompyuterda saqlanadi, har 5 s serverga; qayta ulanganda davom etadi, vaqt serverda.
5. **AI bilan baholaysizmi?** — Bu versiyada baholashni o'qituvchi qiladi (adolatli va tushunarli); AI baholash kodi tayyorlangan, keyingi versiyada yoqiladi.
6. **Necha o'quvchigacha?** — Bitta server bir necha sinfni ko'taradi (Socket.io, SQLite); sinovda 3 o'quvchi bir vaqtda; yuklama asosan sync (faqat o'zgargan fayllar).
7. **Ma'lumotlar xavfsizmi?** — HTTPS, qat'iy CORS, rate limit (6 xonali kodni taxmin qilish bloklanadi), Figma tokeni shifrlangan, kunlik zaxira.
8. **O'qituvchi qanday ulanadi?** — Google akkaunti bilan — birinchi kirishda akkaunt yaratiladi; admin bloklaydi/ko'taradi.
9. **Faqat frontendmi?** — Shablonlar: HTML, React+Vite, Vue, TypeScript, Node.js, Python va o'z papkangiz; terminal to'plamlari: Frontend, Node, Python.
10. **Qanday tarqatiladi?** — O'quvchi ilovasi kodim.uz dan yuklab olinadi (Windows o'rnatuvchi), panel — brauzerda, server — bitta VPS (Docker, avtomatik HTTPS).
