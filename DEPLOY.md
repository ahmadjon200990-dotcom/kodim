# Kodim — serverga joylash (deploy)

Natija:
- **https://kodim.uz** — landing sahifa (`apps/landing`), "Windows uchun yuklab olish" tugmasi (`/downloads/latest.json`).
- **https://teacher.kodim.uz** — o'qituvchi paneli + API + Socket.io (bitta Node server).
- HTTPS avtomatik (Caddy + Let's Encrypt), SQLite doimiy Docker volume'da, har kuni 03:00 da zaxira.

Domen konfiguratsiya qiymati: `.env` dagi `DOMAIN` (standart `kodim.uz`). Boshqa domen bo'lsa, faqat shu qiymat o'zgaradi
(+ desktop build'da `SERVER_URL`, landing build'da `PANEL_URL` — pastda).

---

## 1. Kerakli narsalar

| Nima | Tavsiya |
|---|---|
| VPS | Ubuntu 22.04/24.04, 2 vCPU, 2–4 GB RAM, 30 GB disk (masalan Uzbekistondagi hosting: Uztelecom, AHOST, Beeline Cloud yoki Hetzner/DigitalOcean) |
| Domen | `kodim.uz` (cctld.uz akkreditatsiyalangan registratorlaridan biri orqali: masalan ahost.uz, webspace.uz, uzinfocom) |
| Portlar | 80 va 443 ochiq (Let's Encrypt va HTTPS uchun) |

## 2. DNS yozuvlari

Registrator panelida (VPS IP manzili, masalan `203.0.113.10`):

| Turi | Nomi | Qiymati |
|---|---|---|
| A | `@` (kodim.uz) | `203.0.113.10` |
| A | `teacher` | `203.0.113.10` |
| A | `www` | `203.0.113.10` |
| AAAA | (agar VPS da IPv6 bo'lsa, xuddi shu nomlar) | IPv6 manzil |

Tekshirish: `nslookup teacher.kodim.uz` → VPS IP. DNS tarqalishi 5 daqiqadan bir necha soatgacha.

## 3. Serverni tayyorlash (bir marta)

```bash
ssh root@203.0.113.10
apt update && apt upgrade -y
# Docker + compose plagin
curl -fsSL https://get.docker.com | sh
# Xavfsizlik devori
apt install -y ufw && ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
# Kod
git clone <repo-manzili> /opt/kodim && cd /opt/kodim
```

## 4. Muhit o'zgaruvchilari (`/opt/kodim/.env`)

```bash
cp .env.production.example .env
openssl rand -base64 48   # → JWT_SECRET
openssl rand -base64 48   # → DATA_ENCRYPTION_KEY
nano .env
```

| O'zgaruvchi | Qiymat | Izoh |
|---|---|---|
| `DOMAIN` | `kodim.uz` | Caddy shu domen va `teacher.` subdomeni uchun sertifikat oladi |
| `ACME_EMAIL` | sizning email | Let's Encrypt xabarlari |
| `JWT_SECRET` | ≥32 belgi tasodifiy | production'da qisqa/`change-me` bo'lsa server ishga tushmaydi |
| `DATA_ENCRYPTION_KEY` | tasodifiy | o'qituvchilarning Figma tokenlarini shifrlaydi |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | favqulodda admin | har ishga tushishda yangilanadi; Google ishlamasa ham kirish |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 5-bo'lim | bo'sh bo'lsa "Google orqali kirish" tugmasi ko'rinmaydi |
| `LOG_LEVEL` | `info` | JSON loglar: `docker compose logs -f server` |

`PUBLIC_URL`, `DATABASE_URL`, `TRUST_PROXY`, `NODE_ENV` — `docker-compose.yml` o'zi qo'yadi.

## 5. Google OAuth (o'qituvchilar Google bilan kiradi)

1. https://console.cloud.google.com → yangi loyiha (masalan "Kodim").
2. **APIs & Services → OAuth consent screen**: User type **External**, ilova nomi "Kodim Panel", support email,
   Authorized domains: `kodim.uz`. Scopes: `openid`, `email`, `profile` (sezgir emas — tekshiruv shart emas). **Publish app** (Production).
3. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://teacher.kodim.uz`
   - Authorized redirect URIs: **`https://teacher.kodim.uz/api/auth/google/callback`**
   - (lokal sinov uchun qo'shimcha: `http://localhost:8080` va `http://localhost:8080/api/auth/google/callback`)
4. Client ID va Client secret → `.env` dagi `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` → `docker compose up -d`.

Qoidalar: birinchi Google kirishi **TEACHER** akkaunt yaratadi; shu email bilan oldindan yaratilgan akkaunt bo'lsa — unga bog'lanadi;
admin "O'qituvchilar" sahifasida bloklaydi / admin qiladi; bloklangan akkaunt kira olmaydi (eski tokenlari ham ishlamaydi).

## 6. Ishga tushirish

```bash
cd /opt/kodim
docker compose up -d --build
docker compose ps
docker compose logs -f server        # "Server listening" va migratsiyalar
curl -I https://kodim.uz             # 200
curl https://teacher.kodim.uz/api/health   # {"ok":true,"name":"Kodim"}
```

Birinchi kirish: https://teacher.kodim.uz → `ADMIN_EMAIL` / `ADMIN_PASSWORD` (yoki Google).

## 7. Windows ilovasini (`.exe`) chiqarish

Windows kompyuterda (repo ichida):

```bash
pnpm install
pnpm --filter @exam-ide/desktop dist            # standart server: https://teacher.kodim.uz
# boshqa domen: node apps/desktop/scripts/dist.mjs https://teacher.boshqa.uz
```

Natija: `apps/desktop/release/Kodim-Setup-<versiya>.exe` va `apps/desktop/release/latest.json` (versiya, hajm, sha256).
Ikkalasini serverga yuklang:

```bash
scp apps/desktop/release/Kodim-Setup-1.0.0.exe apps/desktop/release/latest.json root@203.0.113.10:/opt/kodim/deploy/downloads/
```

Landing tugmasi darhol yangi versiyani ko'rsatadi (`/downloads/latest.json` keshlanmaydi). Yangi versiya: `apps/desktop/package.json`
dagi `version` ni oshiring → `dist` → ikkala faylni yuklang.

> Kod imzosi (code signing) yo'q — Windows SmartScreen "Noma'lum nashriyotchi" deydi ("Batafsil → Baribir ishga tushirish").
> Imzo uchun OV/EV sertifikat kerak (keyingi bosqich).

## 8. Yangilash

```bash
cd /opt/kodim && git pull && docker compose up -d --build
```

Migratsiyalar server ishga tushganda avtomatik (`prisma migrate deploy`). Yangilashdan oldin qo'lda zaxira: 9-bo'lim.

## 9. Zaxira va tiklash

- Avtomatik: har kuni 03:00 → `/opt/kodim/deploy/backups/kodim-YYYY-MM-DD_HHMM.db.gz` (14 kun saqlanadi).
- Qo'lda: `docker compose exec backup sh /backup.sh`
- Serverdan tashqariga nusxa (tavsiya): `rsync -a root@203.0.113.10:/opt/kodim/deploy/backups/ ./kodim-backups/`

Tiklash:

```bash
cd /opt/kodim
docker compose stop server
gunzip -k deploy/backups/kodim-2026-10-22_0300.db.gz
docker compose run --rm -v "$PWD/deploy/backups:/b" --entrypoint sh server -c "cp /b/kodim-2026-10-22_0300.db /data/kodim.db"
docker compose start server
```

## 10. Maxfiy kalitlarni almashtirish

| Kalit | Qanday | Natija |
|---|---|---|
| `JWT_SECRET` | yangi qiymat → `docker compose up -d` | barcha o'qituvchilar qayta kiradi; o'quvchilar ta'sirlanmaydi |
| `DATA_ENCRYPTION_KEY` | yangi qiymat → restart | eski Figma tokenlari o'qilmaydi — o'qituvchilar Sozlamalarda tokenni qayta kiritadi (keshlangan dizaynlar qoladi) |
| `ADMIN_PASSWORD` | yangi qiymat → restart | admin paroli yangilanadi |
| `GOOGLE_CLIENT_SECRET` | Google Console'da yangi secret → `.env` → restart | — |

Kalit oshkor bo'lsa: darhol almashtiring va `docker compose logs server | grep login` bilan shubhali kirishlarni tekshiring.

## 11. Xavfsizlik (nima sozlangan)

- HTTPS majburiy (Caddy), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, panel uchun qat'iy CSP.
- CORS: faqat `https://teacher.<DOMAIN>` (desktop ilova socket'i Node'dan — brauzer emas).
- Rate limit (xotirada): o'qituvchi login — IP bo'yicha 10/5 daq, email bo'yicha 8 xato/15 daq; Google — 30/5 daq;
  o'quvchi kirishi — qurilma bo'yicha 10 noto'g'ri kod → 30 daq blok, IP bo'yicha 50 noto'g'ri kod, butun server bo'yicha 300/daq,
  bitta kodga 200/daq (6 xonali kodni taxmin qilib topish amalda imkonsiz).
- So'rov hajmi: oddiy so'rov 1 MB, imtihon (tayyor papka, rasmlar) 40 MB, Caddy 45 MB, socket 25 MB.
- Loglar JSON (pino), `authorization`/`cookie` yashirilgan.
- SQLite `kodim-data` volume'da; konteyner `kodim` foydalanuvchisi bilan (root emas).

## 12. Lokal sinov (domensiz)

**Docker bilan:** `DOMAIN=localhost` (`.env`) → `docker compose up -d --build` → https://localhost (landing) va
https://teacher.localhost (panel). Caddy lokal sertifikat beradi — brauzer ogohlantirishini qabul qiling.
`GOOGLE_*` uchun redirect URI: `https://teacher.localhost/api/auth/google/callback`.

**Docker'siz (Windows):**

```bash
pnpm install && pnpm -r build
pnpm --filter @exam-ide/server exec prisma migrate deploy && pnpm seed
node apps/server/dist/index.js                 # panel + API: http://localhost:8080
node apps/landing/build.mjs                    # landing: apps/landing/dist (istalgan statik server bilan)
```

Desktop ilovada (login ekrani → ⚙) server manzilini `http://localhost:8080` yoki o'qituvchi kompyuterining LAN manzili
(`http://192.168.1.10:8080`) qilib qo'ying — internetsiz sinf uchun.

## 13. Figma tokeni (o'qituvchi)

Panel → **Sozlamalar → Figma integratsiyasi**: figma.com → Settings → Security → Personal access tokens → Generate new token
(ruxsatlar: File content — Read only, Current user — Read). Token serverda shifrlanadi. Figma fayl token egasiga ochiq bo'lishi kerak.
Figma'ning API limitlari qattiq (ayniqsa View/Collab o'rinlarda) — dizaynlar keshlanadi; Figma'da o'zgartirsangiz imtihon sahifasida "Yangilash".
