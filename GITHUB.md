# GitHub'ga ulash (private repo)

Bu qadamlarni bir marta bajarasiz. `gh` CLI shart emas: repo brauzerda yaratiladi, kod esa oddiy `git` bilan yuklanadi.

## 1. Brauzerda repo yaratish

1. https://github.com saytiga kiring (akkauntingiz `ahmadjon200990-dotcom` bo'lsa kerak, yuqori o'ng burchakda ko'rinadi).
2. O'ng yuqoridagi **+** → **New repository**.
3. Sozlamalar:
   - **Repository name:** `kodim`
   - **Private** ni tanlang.
   - **README, .gitignore, license qo'shmang** — hammasi bo'sh qolsin (bizda ular bor, aks holda ziddiyat chiqadi).
4. **Create repository** ni bosing. Ochilgan sahifadagi manzilni nusxalang, masalan
   `https://github.com/ahmadjon200990-dotcom/kodim.git`.

## 2. Yuklashdan oldin tekshiruv (maxfiy fayllar)

`exam-ide` papkasida terminalda:

```bash
git ls-files | grep -iE '(^|/)\.env($|\.)|\.db$|\.exe$|release/'
```

Natijada faqat `.env.example` va `.env.production.example` chiqishi kerak (ularda haqiqiy kalit yo'q). Boshqa fayl chiqsa — **to'xtang** va Claude'ga ayting.

Tekshirilgan (2026-10-22): `.env`, `apps/server/.env`, `*.db`, `release/` (`.exe`), `node_modules/` — `.gitignore` da va git tarixida yo'q.

## 3. Ulash va yuklash

Quyidagi buyruqlarni ketma-ket bajaring (manzilni 1-qadamdagisiga almashtiring):

```bash
git remote add origin https://github.com/ahmadjon200990-dotcom/kodim.git
```

```bash
git push -u origin main
```

Birinchi push'da **Git Credential Manager** oynasi chiqadi → **Sign in with your browser** → brauzerda GitHub'ga ruxsat bering. Keyingi safar so'ramaydi.

```bash
git push -u origin supabase
```

```bash
git push origin v1-local
```

## 4. Natijani tekshirish

- GitHub'da repo sahifasida **Private** belgisi bor.
- Fayllar ichida `.env` yoki `data.db` **yo'q**.
- Branch tanlagichda `main` va `supabase`, **Tags** da `v1-local` ko'rinadi.

## 5. Keyinchalik (Claude o'zi aytadi)

- **Releases:** `.exe` (119 MB) shu repo'ning Releases bo'limiga yuklanadi. Private repo relizini faqat ruxsati borlar yuklab oladi — landing'dan ommaviy yuklab olish uchun 11-fazada yo'l tanlanadi.
- **Vercel:** akkauntni GitHub bilan ochasiz va shu repo'ni ulaysiz (`kodim` — landing, `kodim-panel` — panel).
- **Zaxira (GitHub Actions):** Supabase bazasi paroli repo'ning **Settings → Secrets and variables → Actions** bo'limiga yoziladi. Kodga yoki faylga hech qachon yozilmaydi.
