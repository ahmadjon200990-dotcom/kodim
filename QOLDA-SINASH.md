# Kodim — qo'lda sinash yo'riqnomasi

Bu yo'riqnoma server + panel + 2 ta desktop o'quvchi bilan to'liq imtihonni o'tkazishni va har bir
ogohlantirishni tekshirishni ko'rsatadi. Barchasi bitta kompyuterda sinaladi (2-o'quvchi uchun ilovaning
ikkinchi nusxasini ochib bo'lmaydi — single instance; shuning uchun 2-o'quvchini boshqa kompyuterda yoki
VM'da oching, yoki bitta o'quvchi bilan sinang).

Bitta kompyuterda 2-o'quvchi o'rniga soxta o'quvchi skriptidan foydalanish mumkin (server build qilingan bo'lsin):

```bash
node apps/server/dist/dev/fake-student.js 123456 "Vali Aliyev"
```

Skript ulangan holda turadi; terminalga `close` yozsangiz — ilova yopilgandek (APP_CLOSED), `quit` — internet
uzilgandek (10 s dan keyin DISCONNECTED). Xuddi shu ism bilan boshqa `deviceId` (3-argument) bilan qayta kirsa —
DEVICE_CHANGED; imtihon boshlangandan keyin yangi ism bilan kirsa — LATE_JOIN.

## 0. Tayyorgarlik (bir marta)

```bash
pnpm install
pnpm seed
```

Seed quyidagilarni yaratadi:
- **Admin:** `apps/server/.env` dagi `ADMIN_EMAIL` / `ADMIN_PASSWORD` (`admin@kodim.uz`).
- **Demo o'qituvchi:** `demo@kodim.uz` / `demo12345`.
- **Demo imtihon:** "Demo: JavaScript va Figma" (1 JS mashq + 1 Figma topshiriq).

Bazada eski sinov imtihonlari bo'lsa va toza boshlamoqchi bo'lsangiz (barcha ma'lumot o'chadi):

```bash
pnpm --filter @exam-ide/server exec prisma migrate reset --force
```

So'ng yana `pnpm seed`.

## 1. Serverni ishga tushirish

```bash
pnpm build:panel
pnpm --filter @exam-ide/server build
node apps/server/dist/index.js
```

Yoki tez (dev) usul — 2 ta terminalda:

```bash
pnpm dev:server
```

```bash
pnpm dev:panel
```

Dev'da panel `http://localhost:5273`, build'da esa `http://localhost:8080` da ochiladi.

## 2. O'qituvchi panelida imtihonni tayyorlash

1. Brauzerda panelni oching (`http://localhost:8080`), `demo@kodim.uz` / `demo12345` bilan kiring.
2. **Imtihonlar** ro'yxatida demo imtihon turibdi. Xohlasangiz **Yangi imtihon** bilan o'zingiznikini yarating
   (mezonlar yig'indisi 100 bo'lishini tekshiring — 100 bo'lmasa saqlanmaydi).
3. Demo imtihonda **Ochish** tugmasini bosing → **6 xonali kod** chiqadi. Bu sahifa — jonli kuzatuv.
4. Ovozli signal ishlashi uchun sahifada bir marta biror joyni bosing (brauzer audio uchun foydalanuvchi
   harakatini talab qiladi).

## 3. Desktop ilovani ishga tushirish (o'quvchi)

```bash
pnpm start:desktop
```

(Yoki build qilib: `pnpm --filter @exam-ide/desktop build`, keyin `apps/desktop/node_modules/.bin/electron apps/desktop`.)

1. Ilovada **6 xonali kod** va **ism** kiriting → kutish ekraniga tushasiz.
2. Panelda o'quvchi jonli ko'rinadi ("Kutmoqda"). 2-o'quvchini boshqa kompyuterda xuddi shunday kiriting.
3. Panelda **▶ Boshlash** → hamma o'quvchida bir vaqtda ish maydoni ochiladi, timer ketadi.

## 4. Oddiy ish oqimini sinash

- Editorda `script.js` ni oching, kod yozing → 5 soniyada serverga saqlanadi (panelda ko'rinmaydi, lekin
  Natijalar → Batafsil → Fayllar da ko'rasiz).
- Terminalda `node -v`, `npm install` ishlatib ko'ring.
- **Go Live** (pastki o'ng, status panelda): ish papkasi ichki brauzerda ochiladi (HTML shablon bo'lsa).
- `dizaynlar/2-profil-kartasi.md` ni oching → yuqorida **Dizaynni ochish** tugmasi → Figma ichki brauzerda.
- Timer oxirgi 5 daqiqada qizil bo'ladi. **Topshirish** tugmasi (tasdiq bilan) yoki vaqt tugashi → editor
  qulflanadi, "Topshirildi" ekrani.

## 5. Himoyani tekshirish (desktop ilovada, imtihon davomida)

| Sinov | Qanday | Kutilgan natija |
|---|---|---|
| **Print Screen** | PrtScn bosing, Paint'ga qo'ying | Kodim oynasi o'rni qora/bo'sh (yoki umuman yo'q) |
| **Win+Shift+S** | Snipping Tool bilan Kodim oynasini olishga urining | Oyna tasvirga tushmaydi |
| **Notepad'dan paste** | Notepad'da matn yozing, nusxalang (Ctrl+C); Kodim editorida Ctrl+V | Hech narsa qo'yilmaydi; panelda "Tashqaridan nusxalash urinishi" (PASTE_BLOCKED) |
| **Ilova ichida copy/paste** | Editorda matnni belgilab Ctrl+C, boshqa joyga Ctrl+V | Ishlaydi (ichki clipboard) |
| **Ilovadan tashqariga paste** | Kodim'da nusxalang, Notepad'ga Ctrl+V | Hech narsa qo'yilmaydi (tizim clipboard'iga yozilmaydi) |
| **Faylni sudrab tashlash** | Ish stolidan faylni Kodim oynasiga sudrang | Qabul qilinmaydi (drag&drop bloklangan) |
| **F12 / DevTools** | F12, Ctrl+Shift+I bosing | Ochilmaydi |
| **Ctrl+R** | Sahifani yangilashga urining | Ishlamaydi |
| **Menyu** | Alt bosing / menyu qidiring | Menyu yo'q |
| **Ikkinchi nusxa** | `electron` ni yana ishga tushiring | Darhol yopiladi, birinchi oyna fokuslanadi |
| **savollar.md tahriri** | Editorda ochib yozishga urining | readOnly; fayl tizimida ham o'zgartirib bo'lmaydi |

## 6. Ogohlantirishlarni chaqirish (har birini alohida)

Har bir harakatdan keyin **panelning o'ng tomonidagi ogohlantirishlar oqimiga** qarang (yangi DANGER/WARN
da ovozli signal). Har ogohlantirish yonida −5 / −10 / Boshqa… / Bekor qilish tugmalari.

| Ogohlantirish | Qanday chaqiriladi |
|---|---|
| **FOCUS_LOST** (oynadan chiqdi) | Kodim oynasini kichraytiring yoki boshqa oynaga o'ting, so'ng qayting. Davomiyligi (soniya) bilan yoziladi. |
| **FORBIDDEN_PROCESS** (taqiqlangan dastur) | Imtihon davomida Chrome/Telegram/VS Code oching (yoki boshlanishidan oldin ochiq bo'lsin). |
| **EXTRA_DISPLAY** (qo'shimcha monitor) | Ikkinchi monitor ulangan holda imtihonni boshlang. |
| **TERMINAL_COMMAND** | Terminalda istalgan buyruq (masalan `ls`, `node -v`). Panelda o'quvchi tarixida ko'rinadi. |
| **DANGEROUS_COMMAND** (xavfli buyruq) | Terminalda `git clone https://...` yoki `curl ...` yoki `code .`. |
| **UNKNOWN_PACKAGE** (noma'lum paket) | Terminalda `npm install lodash` (ruxsatlar ro'yxatida yo'q paket). `npm install react` — ruxsatli, ogohlantirish bermaydi. |
| **EXTERNAL_FILE_CHANGE** (tashqi fayl o'zgarishi) | Boshqa muharrir/Explorer orqali ish papkasidagi faylni o'zgartiring. (Ish papkasi: `%APPDATA%\Kodim\workspaces\<attemptId>` — odatda yashirin.) Editor orqali yozish bu ogohlantirishni bermaydi. |
| **READONLY_TAMPER** | `savollar.md` ni fayl tizimida (read-only atributni olib) o'zgartiring yoki o'chiring → darhol tiklanadi va ogohlantirish ketadi. |
| **LARGE_INSERT** (katta matn) | Bir amalda 200+ belgi qo'shing (masalan tashqi autocomplete/snippet). Oddiy yozish va ichki paste buni bermaydi. |
| **PASTE_BLOCKED** | 5-bo'limdagi "Notepad'dan paste". |
| **DISCONNECTED / RECONNECTED** | Internetni (yoki serverni) 10+ soniya uzing, so'ng qayting. |
| **APP_CLOSED** | Ilovani butunlay yoping (X). Panelda darhol ko'rinadi. |
| **DEVICE_CHANGED** | O'sha ism bilan **boshqa kompyuterdan** qayta kiring. |
| **LATE_JOIN** | Imtihon boshlangandan **keyin** yangi o'quvchi kirsin. |

## 7. Jarima, vaqt, bekor qilish

- Ogohlantirish yonidagi **−5 / −10** → o'sha o'quvchiga jarima. **Boshqa…** → son va sabab so'raydi.
- **Bekor qilish** → ishni 0 ball qiladi (tasdiq bilan), keyin **Qaytarish** mumkin.
- Yuqorida **Vaqt qo'shish: +5/+10/+15 (Hammaga)**; o'quvchi kartasida **+5'** (faqat o'shanga).
- O'quvchida timer darhol yangilanadi.

## 8. Natijalar va baholash

1. Imtihon tugashi (vaqt yoki **Imtihonni tugatish**) → **Natijalar** sahifasi.
2. Jadval: AI ball, o'qituvchi ball, jarima, yakuniy ball, holat, ogohlantirishlar. Ustun sarlavhasini bosib
   saralang. **Excel yuklab olish** → `.xlsx` fayl.
3. **Batafsil**: mezonlar bo'yicha ballni qo'lda qo'ying/o'zgartiring + izoh, umumiy izoh, **Saqlash**.
   O'ngda **Monaco diff** (o'quvchi kodi ↔ namuna yechim, fayl tablari). Pastda eventlar va jarimalar tarixi.
4. **Baho o'quvchiga ko'rinmaydi** — faqat panelda.

> Eslatma: AI baholash **8-bosqichda** ulanadi. Hozir AI ball bo'sh (—) va "AI bilan qayta baholash" tugmasi
> xabar beradi. O'qituvchi qo'lda baholashi to'liq ishlaydi.

## 9. Admin

Admin akkaunt bilan kiring (`.env` dagi `ADMIN_EMAIL`). Yuqorida **O'qituvchilar** bo'limi paydo bo'ladi —
o'qituvchi qo'shish/o'chirish. Oddiy o'qituvchida bu bo'lim ko'rinmaydi.
