# Kodim — Supabase sozlamalari (foydalanuvchi bajaradi)

Loyiha: `kodim`, ref `prkrhitgkjyuwyipqimw`, URL `https://prkrhitgkjyuwyipqimw.supabase.co`.
Dashboard: https://supabase.com/dashboard/project/prkrhitgkjyuwyipqimw

Bu fayl ko'chish davomida to'ldirib boriladi (MIGRATION-PLAN.md 12-bo'lim, 6-qaror).

## 1. Anonim kirish (o'quvchilar uchun)

1. Authentication → Sign In / Providers → **"Allow anonymous sign-ins"** — yoqing, Save.
2. Authentication → Rate Limits → **anonim kirishlar soni** (standart 30/soat bitta IP'dan) — kamida **300** qiling.
   Sabab: bitta sinf bitta NAT IP'dan chiqadi; har imtihonda har o'quvchi yangi anonim foydalanuvchi.

## 2. Google bilan kirish (o'qituvchilar)

### 2.1 Google Cloud Console
1. https://console.cloud.google.com → yangi loyiha (masalan `Kodim`).
2. APIs & Services → **OAuth consent screen** → User type: **External** → ilova nomi `Kodim Panel`, support email, developer email → Scopes: `email`, `profile`, `openid` (standart) → Save.
   Sinov bosqichida "Testing" holatida qolsa, faqat "Test users"ga qo'shilganlar kira oladi — hamma o'qituvchi kirishi uchun **Publish app** ("In production") qiling.
3. APIs & Services → **Credentials** → Create credentials → **OAuth client ID** → Application type: **Web application**, nom `Kodim Supabase`.
   - Authorized JavaScript origins:
     - `https://kodim-panel.vercel.app`
     - `http://localhost:5273`
   - Authorized redirect URIs:
     - `https://prkrhitgkjyuwyipqimw.supabase.co/auth/v1/callback`
4. Create → **Client ID** va **Client Secret** ni nusxalang (hech kimga yubormang, chatga ham yozmang).

### 2.2 Supabase Dashboard
1. Authentication → Sign In / Providers → **Google** → Enable, Client ID va Client Secret ni kiriting → Save.
2. Authentication → **URL Configuration**:
   - Site URL: `https://kodim-panel.vercel.app`
   - Redirect URLs (Add URL): `https://kodim-panel.vercel.app/auth/callback`, `http://localhost:5273/auth/callback`

Birinchi Google kirishi avtomatik `TEACHER` rolini beradi (`supabase/migrations/…_auth.sql`).

## 3. Admin akkaunti (email + parol)

1. Authentication → Users → **Add user** → Create new user: email (masalan `admin@kodim.uz`), kuchli parol, **Auto Confirm User** ✓.
2. SQL Editor'da `supabase/scripts/make-admin.sql` (email'ni almashtiring) — yoki Claude'ga ayting, MCP orqali bajaradi.

## 4. Pauza va zaxira (Free plan)

- 1 hafta faolsizlikda loyiha **pauza** bo'ladi: Dashboard → loyiha → **Restore project**. Demo/imtihondan 1 kun oldin tekshiring.
- Avtomatik zaxira yo'q — kunlik `pg_dump` GitHub Actions orqali (repo ulangach sozlanadi, `GITHUB.md`).
