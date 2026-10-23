# Kodim — Supabase sozlamalari (foydalanuvchi bajaradi)

Loyiha: `kodim`, ref `prkrhitgkjyuwyipqimw`, URL `https://prkrhitgkjyuwyipqimw.supabase.co`.
Dashboard: https://supabase.com/dashboard/project/prkrhitgkjyuwyipqimw

Bu fayl ko'chish davomida to'ldirib boriladi (MIGRATION-PLAN.md 12-bo'lim, 6-qaror).

## 1. Anonim kirish (o'quvchilar uchun)

1. ✅ (2026-10-23) Authentication → Sign In / Providers → **"Allow anonymous sign-ins"** — yoqing, Save.
2. ✅ (300) Authentication → Rate Limits → **anonim kirishlar soni** (standart 30/soat bitta IP'dan) — kamida **300** qiling.
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

## 5. Qo'lda bajariladigan qadamlar (MCP qila olmaydi) — ro'yxat

Supabase MCP `drop`/`delete` va `auth.users` ga yozishni avtomatik rad etadi; Dashboard sozlamalari ham sizda.
Bajarilganini ✅ bilan belgilang (yoki Claude'ga ayting).

| # | Nima | Qayerda | Holat |
|---|---|---|---|
| 1 | `supabase/scripts/sql-editor-once.sql` (tasks_write, spike qoldiqlari) | SQL Editor | ✅ 2026-10-23 |
| 2 | `supabase/tests/rls.test.sql` haqiqiy bazada | SQL Editor | ✅ 2026-10-23 |
| 3 | `supabase/migrations/20261023072849_exam_rpcs_editor.sql` (`save_exam`, `delete_penalty` — ichida `delete` bor) | SQL Editor | ⏳ |
| 4 | Admin foydalanuvchi (3-bo'lim) + `make-admin.sql` | Authentication → Users, SQL Editor | ⏳ |
| 5 | Google OAuth (2-bo'lim) | Google Cloud + Authentication | ⏳ |
| 6 | `supabase/tests/rpc.test.sql`, `views.test.sql`, `student.test.sql` haqiqiy bazada (3-qadamdan keyin) | SQL Editor | ⏳ |
| 7 | `supabase/migrations/20261023075345_student_rpcs_editor.sql` (`sync_files`) — **o'quvchi avtosaqlashi shusiz ishlamaydi** | SQL Editor | ⏳ |
| 8 | `supabase/tests/sync.test.sql` (7-qadamdan keyin) | SQL Editor | ⏳ |
| 9 | `supabase/scripts/cleanup-test-data.sql` (`[TEST] E2E` sinov ma'lumotlari; oxirgi qatorni `commit;` qiling) — xohlagan payt | SQL Editor | ⏳ |
