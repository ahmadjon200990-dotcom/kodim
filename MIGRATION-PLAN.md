# Kodim → Supabase: ko'chirish rejasi

> Holat: **TASDIQLANDI (2026-10-22)** — 12-bo'limdagi qarorlar bilan.
> Branch: `supabase`. Eski versiya: tag `v1-local` (d79583e). Supabase loyihasi: `kodim`, ref `prkrhitgkjyuwyipqimw`, Free, Singapur.
> Ushbu reja va CLAUDE.md o'rtasida ziddiyat bo'lsa, ko'chish davomida shu reja ustun (keyin CLAUDE.md yangilanadi).

## 0. Maqsad va chegaralar

- `apps/server` (Fastify + Socket.io + Prisma/SQLite) o'rniga **faqat Supabase**: Postgres + RLS, Auth (Google + admin parol), Realtime, Database Functions (RPC), Edge Functions, Storage, pg_cron.
- Panel va landing — **Vercel** (statik). Domen hozircha yo'q: `*.vercel.app` va `prkrhitgkjyuwyipqimw.supabase.co`.
- Desktop ilova o'zgaradi faqat **transport qatlamida** (`main/session.ts` va unga yaqinlar). Himoya, terminal, kuzatuv, editor — tegilmaydi.
- Mahsulot xatti-harakati o'zgarmaydi: CLAUDE.md 0-bo'limdagi barcha qoidalar (eventlar, darajalar, timer, 15 s topshirish, qayta kirish, DEVICE_CHANGED …) aynan saqlanadi. Yangi funksiya qo'shilmaydi — faqat foydalanuvchi so'ragan admin bo'limlari (9-faza).
- `apps/server` 12-faza (to'liq sinov) o'tgunga qadar o'chirilmaydi — namuna sifatida qoladi.

### Free plan cheklovlari (rejaga ta'siri)
| Cheklov | Ta'siri | Yechim |
|---|---|---|
| Storage: bitta fayl ≤ 50 MB, jami 1 GB | `.exe` 119 MB — sig'maydi | `.exe` **GitHub Releases** da (yoki boshqa), Supabase'da faqat `releases` jadvali (versiya, URL, sha256) |
| Edge Function chaqiruvlari 500K/oy | Har 5 s sync Edge Function bo'lsa — tez tugaydi | "Issiq yo'l" (sync, event, heartbeat) — **Postgres RPC** (PostgREST, limitga kirmaydi). Edge Function faqat tashqi HTTP/maxfiy kalit kerak joyda |
| Realtime: 200 bir vaqtdagi ulanish, 2M xabar/oy | O'quv markaz uchun yetarli (≈ 30–60 o'quvchi) | Bitta o'quvchi = bitta kanal; TERMINAL_COMMAND kabi INFO eventlar ham bitta broadcast |
| 1 hafta faolsizlikda loyiha **pauza** bo'ladi | Demo oldidan uxlab qolishi mumkin | DEPLOY-SUPABASE.md da ogohlantirish + qo'lda "Restore"; kerak bo'lsa Pro |
| Avtomatik zaxira yo'q | SQLite'dagi kunlik backup yo'qoladi | GitHub Actions `pg_dump` (kunlik, artefakt) — repo kerak (ochiq savol 2) |
| Anonim kirish rate limit (standart 30/soat/IP) | Bitta sinf = bitta NAT IP | Dashboard'da limitni oshirish (DEPLOY-SUPABASE.md da qadam) |

## 1. Arxitektura xaritasi (eski → yangi)

| Hozir (`apps/server`) | Supabase'da |
|---|---|
| Prisma schema + 6 migratsiya | `supabase/migrations/*.sql` (MCP `apply_migration` bilan qo'llanadi, repoda saqlanadi) |
| JWT + bcrypt (o'qituvchi), Google OAuth (o'zimiz) | **Supabase Auth**: Google provider + email/parol (faqat seed admin). `teachers.id = auth.users.id` |
| O'quvchi tokeni (`Attempt.token`) | **Anonim Supabase sessiyasi** (`signInAnonymously`) — `attempts.student_uid = auth.uid()`. Refresh token desktop `store`da (hozirgi token o'rnida) |
| REST `/api/exams…`, `/api/attempts…` | Oddiy CRUD — supabase-js + **RLS**; holat o'zgartiruvchi amallar — `security definer` **RPC** (`open_exam`, `start_exam`, `extend_exam`, `finish_exam`, `annul_attempt`, `grade_attempt`, `add_penalty` …) |
| Socket `/student`: `student:join`, `attempt:sync`, `event:report`, `attempt:submit` | RPC: `student_join`, `sync_files`, `report_event`, `submit_attempt`, `heartbeat` |
| Socket `/teacher`: `exam:watch`, `lobby:update`, `attempt:update`, `event:new` | **Realtime Broadcast** (private kanal `exam:<id>`), DB trigger'lardan `realtime.send` / `realtime.broadcast_changes`. Boshlang'ich holat — oddiy SELECT (oxirgi 300 event) |
| Socket `exam:started`, `exam:ended`, `time:sync`, `lobby:count` | Broadcast private kanal `attempt:<id>` va `exam:<id>:students` (DB'dan yuboriladi). Vaqt: `server_now()` RPC + `endsAt` (klient faqat ko'rsatadi, kompyuter soati ishlatilmaydi — ofset hisoblanadi) |
| `services/runtime.ts` — har 1 s tick, 15 s topshirish taymeri (xotirada) | **pg_cron** (sekundlik jadval, `'2 seconds'`): `exam_tick()` — `ending_at` ustuni bilan (xotira yo'q, server qayta ishga tushishi muammosi yo'qoladi) |
| Disconnect (10 s) / APP_CLOSED (socket.disconnect) | `heartbeat()` har 5 s; pg_cron `last_seen_at < now() - 15 s` → `connected=false` + DISCONNECTED; ilova yopilishida `report_app_closed()` RPC (best effort). Panelda onlayn nuqta — Realtime **Presence** |
| `lib/rateLimit.ts` (xotirada) | `rate_limits` jadvali + `student_join` ichida tekshiruv (qurilma/IP/kod, bloklash) |
| `lib/crypto.ts` (Figma token AES-GCM) | **Supabase Vault** (`vault.secrets`), faqat Edge Function service role bilan o'qiydi |
| `services/figma.ts` | Edge Function `figma-sync` (Deno), PNG'lar Storage `figma` bucket'iga |
| `services/templates.ts`, `workspace.ts` (`savollar.md`, `dizaynlar/`) | `packages/shared` ga ko'chiriladi (sof TS). Panel imtihonni saqlashda `starter_files` va o'qituvchi materiallarini tayyorlab yozadi; `start_exam` sof SQL bo'lib qoladi |
| `Task.images` (dataUrl JSON bazada) | Storage `exam-assets` bucket (`<examId>/images/...`), jadvalda faqat yo'l |
| `services/export.ts` (exceljs), `archive.ts` (zip) | **Panelda brauzerda** (exceljs + JSZip), ma'lumot RLS orqali — server kerak emas |
| Caddy, Docker, rate limit, CSP | Vercel (`vercel.json` sarlavhalar/CSP), Supabase o'zi HTTPS |
| `seed.ts` | `supabase/seed.sql` + bir martalik admin yaratish skripti (Auth Admin API) |

**Nega "issiq yo'l" Edge Function emas:** sync/event/heartbeat har o'quvchidan sekundiga ~0.5 so'rov; RPC — tezroq (cold start yo'q), Free limitga kirmaydi, RLS va tranzaksiya bitta joyda.

## 2. Ma'lumotlar modeli (Postgres)

`public` sxemada, nomlar snake_case. Enumlar Prisma'dagi bilan bir xil (Postgres `enum`).

```
teachers        id uuid PK → auth.users(id) on delete cascade, name, email, role teacher_role,
                disabled bool, figma_secret_id uuid? (vault), figma_handle?, last_login_at, created_at
exams           id uuid, teacher_id → teachers, title, code char(6)? UNIQUE, status, duration_min,
                started_at?, ends_at?, template, starter_files jsonb, reference_files jsonb, criteria jsonb,
                ai_enabled bool default false, ai_model text, allowed_packages jsonb,
                allowed_commands jsonb, allowed_shells jsonb, readonly_files jsonb (savollar.md + dizaynlar, panel tayyorlaydi),
                created_at
tasks           id uuid, exam_id, "order", title, description, type, figma_url?, images jsonb ([{name, path}] — Storage),
                expected_output?
attempts        id uuid, exam_id, student_uid uuid (auth.users, anonim), student_name, device_id?, status,
                extra_minutes, connected, last_seen_at, ending_at? (15 s topshirish boshlangan payt), submitted_at?,
                ai_score?, ai_result?, ai_error?, teacher_score?, teacher_comment?, teacher_criteria?, graded_by, created_at
attempt_files   attempt_id, path, content text, encoding text?, sha1, updated_at   PK(attempt_id, path)
events          id uuid, attempt_id, exam_id (filtr/RLS uchun denormalizatsiya), type, severity, details jsonb, created_at
penalties       id uuid, attempt_id, points, reason, event_id? (set null), teacher_id, created_at
event_types     type PK, severity, client_allowed bool        -- shared/events.ts dan generatsiya
figma_caches    id, teacher_id, url, status, error?, data jsonb?, fetched_at?, updated_at   UNIQUE(teacher_id, url)
figma_images    cache_id, frame_id, format, scale, storage_path   PK(cache_id, frame_id)
rate_limits     key text PK, count int, window_start, blocked_until?
-- 9-faza (admin):
app_settings    key PK, value jsonb, updated_by, updated_at
releases        id, version, url, size, sha256, notes, published bool, created_at
audit_log       id, actor_id?, action, target?, details jsonb, created_at
```

O'zgarishlar sababi:
- `Attempt.files Json` → **`attempt_files` jadvali**: har 5 s butun snapshot (300 fayl × ≤1 MB) qatorini qayta yozmaslik uchun; sync faqat o'zgarganlarni upsert qiladi.
- `Attempt.token` yo'q — o'rniga `student_uid` (anonim auth).
- `attempts.ending_at` — xotiradagi 15 s taymer o'rniga.
- `events.exam_id` — Realtime va RLS filtri uchun.
- O'qituvchi materiallari (`savollar.md`, `dizaynlar/`) hozir ham attempt'da saqlanmaydi — `exams.readonly_files` (panel saqlashda yaratadi).
- Constraint'lar: `code ~ '^[0-9]{6}$'`, `points > 0`, `teacher_score between 0 and 100`, `duration_min between 1 and 600`, `extra_minutes >= 0`.
- Indekslar: `attempts(exam_id)`, `events(exam_id, created_at desc)`, `events(attempt_id, created_at)`, `penalties(attempt_id)`, `exams(teacher_id)`.
- `computeFinalScore` — `shared` da qoladi + SQL `final_score(attempt)` (Excel/natijalar uchun bir xil formula, test bilan solishtiriladi).

Tiplar: MCP `generate_typescript_types` → `packages/shared/src/db.types.ts` (generatsiya qilinadi, qo'lda tahrirlanmaydi).

## 3. Xavfsizlik: RLS matritsasi

Yordamchi funksiyalar (`security definer`, `stable`, `search_path=''`): `is_admin()`, `is_active_teacher()`, `owns_exam(exam_id)`, `student_attempt_id()`.

| Jadval | O'qituvchi (o'zi) | Admin | O'quvchi (anonim) | anon (kirmagan) |
|---|---|---|---|---|
| teachers | o'z qatori (o'qish, `name` tahrir) | hammasi | — | — |
| exams | o'zi: CRUD (tahrir faqat DRAFT — trigger) | hammasi | **to'g'ridan-to'g'ri yo'q** — faqat `student_join`/`student_state` RPC qaytargan ommaviy ko'rinish (`ExamPublic`) | — |
| tasks | o'z imtihonlari | hammasi | — (RPC orqali) | — |
| attempts | o'z imtihonlari: o'qish; yozish faqat RPC | hammasi | o'z qatori: o'qish (baho ustunlarisiz — view) | — |
| attempt_files | o'qish | o'qish | o'z fayllari: o'qish; yozish faqat `sync_files` | — |
| events | o'qish | o'qish | yozish faqat `report_event` | — |
| penalties | o'z imtihonlari: CRUD (RPC) | hammasi | — | — |
| figma_*, rate_limits, app_settings, audit_log | figma: o'zi o'qish | app_settings/audit/releases | — | releases: `published` o'qish (landing) |

Muhim qoidalar:
- **Baholar o'quvchiga ko'rinmaydi**: o'quvchi `attempts` ni faqat `student_attempt_view` (status, ends_at, extra_minutes) orqali ko'radi; `ai_*`, `teacher_*` ustunlari yo'q. Testda tekshiriladi.
- Disabled o'qituvchi: `is_active_teacher()` false → hech narsa ko'rmaydi + admin funksiyasi Auth'da `ban_duration` qo'yadi (sessiyasi ham yangilanmaydi).
- `report_event` server-only turlarni (`DISCONNECTED`, `RECONNECTED`, `APP_CLOSED`, `AI_INJECTION`, `DEVICE_CHANGED`, `LATE_JOIN`) rad etadi; daraja `event_types` dan, klientdan emas.
- `service_role` kaliti faqat Edge Function muhitida. Desktop va panelda faqat **publishable (anon) key**.
- Realtime: barcha kanallar **private**, `realtime.messages` ga RLS (o'qituvchi faqat o'z `exam:<id>` kanali, o'quvchi faqat o'z `attempt:<id>` va `exam:<id>:students`).
- Storage: `exam-assets` private (o'qituvchi o'zining; o'quvchi faqat o'z imtihoni RUNNING bo'lsa o'qiydi), `figma` private, `releases` — kerak bo'lmasa yaratilmaydi (.exe tashqarida).
- MCP `get_advisors` (security + performance) har faza oxirida — ogohlantirishsiz bo'lishi shart.

## 4. O'quvchi oqimi (desktop) — batafsil

1. Ilova ochilishida: saqlangan anonim sessiya bo'lsa tiklanadi, bo'lmasa `signInAnonymously()`.
2. `student_join(code, name, device_id)` RPC:
   - rate limit (qurilma+IP, IP, global — hozirgi qoidalar bilan; IP `request.headers` dan);
   - imtihon LOBBY/RUNNING; attempt topish: `student_uid` → ism (bo'shliq/registrsiz) → yangi;
   - ism bo'yicha topilsa va boshqa jonli ulanish bo'lsa (`connected` + yangi heartbeat) → `409 nameTaken`; aks holda `student_uid` yangisiga o'tkaziladi + `RECONNECTED`;
   - DEVICE_CHANGED, LATE_JOIN, RECONNECTED — hozirgi qoidalar bilan;
   - qaytaradi: `attemptId`, `ExamPublic`, `state` (phase, joinedCount, endsAt, serverNow, files — readonly + attempt_files).
3. Realtime: `attempt:<id>` (exam:ended, time:sync, phase) va `exam:<id>:students` (exam:started, lobby:count) kanallariga obuna.
4. `heartbeat()` har 5 s; `sync_files(files, deleted)` har 5 s (faqat o'zgarganlar; hozirgi `rejected[]` qoidalari aynan SQL'da; 5 MB bo'laklarda).
5. `report_event(type, details, event_id?)` — navbat (offline) mantiqi desktopda o'zgarmaydi.
6. `submit_attempt()` → `ending_at = now()` + broadcast `exam:ended`; pg_cron 15 s dan keyin SUBMITTED.
7. Ilova yopilishi: `report_app_closed()` (await bilan, 1 s timeout), keyin chiqish.
8. Topshirilgach 10 s → kod ekrani; lokal papka o'chiriladi va **anonim sessiyadan chiqiladi** (`signOut`), keyingi imtihonda yangi anonim foydalanuvchi.

Desktop'da o'zgaradigan fayllar: `main/session.ts` (socket.io-client → supabase-js), `main/store.ts` (token → Supabase sessiya saqlash adapteri), `main/index.ts` (yopilish), login ekranidagi ⚙ (server manzili → "Supabase URL + kalit", faqat sinov uchun; standart build'da tikilgan). `SERVER_URL` → `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (build vaqtida). Electron 44 ning Node'ida global `WebSocket` bor — Realtime main process'da ishlaydi (1-fazada spike bilan tasdiqlanadi). Renderer CSP o'zgarmaydi (renderer tarmoqqa chiqmaydi).

## 5. Timer (pg_cron)

`exam_tick()` — har 2 soniyada (pg_cron sekundlik jadval):
1. RUNNING imtihonlarda `ends_at + extra_minutes <= now()` va `ending_at is null` bo'lgan WORKING attempt'lar → `ending_at = now()`, broadcast `exam:ended`.
2. `ending_at + 15 s <= now()` → SUBMITTED, `submitted_at`; panelga `attempt:update`.
3. WORKING qolmagan va `ends_at` o'tgan imtihon → FINISHED (`ai_enabled` bo'lsa ham — AI keyingi versiya), `code = null`, hammaga `exam:ended`.
4. `last_seen_at < now() - 15 s` va `connected` → `connected=false`; WORKING bo'lsa DISCONNECTED (bir marta).
5. Har 30 s (`extract(epoch)` bo'yicha) `time:sync`; `extend_exam` darhol `time:sync` yuboradi.

Ma'lum cheklov saqlanadi: 15 s ichida vaqt qo'shilsa ham topshiriladi (hozirgidek). Aniqlik: ±2 s (hozir ±1 s) — muhim emas, hujjatlanadi.

## 6. Edge Functions (Deno)

| Funksiya | Nima uchun RPC emas | Vazifa |
|---|---|---|
| `figma-sync` | tashqi HTTP + maxfiy token | Figma REST: fayl/tugun daraxti, PNG 2x eksport → Storage `figma`, `figma_caches`. O'zbekcha xato kodlari (`shared/figma.ts`) |
| `figma-token` | Vault'ga yozish, token tekshirish (`/v1/me`) | saqlash/o'chirish, klientga token qaytarilmaydi |
| `admin-users` | Auth Admin API (service role) | o'qituvchini bloklash (ban), rol, o'chirish, seed admin yaratish |

Umumiy kod: `packages/shared` → `supabase/functions/_shared/` ga build skripti bilan nusxalanadi (Deno'da monorepo importi xavfli — spike 1-fazada). Deploy: MCP `deploy_edge_function`. `verify_jwt` yoqilgan; ichida `is_admin`/egalik tekshiruvi.

## 7. Panel o'zgarishlari

- `lib/api.ts` → `lib/supabase.ts` (supabase-js, sessiya localStorage'da — standart). `auth.tsx` → `supabase.auth` (Google `signInWithOAuth`, admin email/parol). `/auth/callback` sahifasi Supabase redirect'iga moslanadi.
- `useExamSocket.ts` → `useExamChannel.ts` (Realtime private kanal + Presence). Hozirgi `LiveAlert.fresh`, `lastLoud`, filtrlar, ovoz — o'zgarmaydi.
- Fayl/rasm yuklash → Storage (≤ 2 MB rasm, CUSTOM ≤ 20 MB / 300 fayl / 6 MB — hozirgi limitlar; DB'ga faqat yo'l).
- Imtihon saqlashda `starter_files` + `readonly_files` tayyorlash (`shared/templates.ts`, `shared/workspace.ts`).
- Excel va zip — brauzerda (exceljs, JSZip). Ustunlar va papka tuzilmasi (`Ism_Familiya`) aynan hozirgidek.
- `0. Abadiy yuklanish yo'q` qoidasi: Supabase xatolari (`PGRST116` → topilmadi, 401/JWT expired → login, Realtime `CHANNEL_ERROR` → xato holati).
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Vercel: SPA rewrite + xavfsiz sarlavhalar (`vercel.json`).

## 8. Admin paneli (9-faza, foydalanuvchi so'ragan)

Faqat ADMIN uchun bo'limlar:
1. **Foydalanuvchilar** — ro'yxat (oxirgi kirish, imtihonlar soni), bloklash/faollashtirish, rol, o'chirish (tasdiq bilan) — `admin-users`.
2. **Sozlamalar** (`app_settings`) — taqiqlangan dasturlar ro'yxati, xavfli buyruq naqshlari, buyruq to'plamlari standartlari. Desktop imtihonga kirishda oladi (`ExamPublic` ichida); bo'sh bo'lsa `shared` dagi standart.
3. **Relizlar** (`releases`) — versiya, yuklab olish havolasi, hajm, sha256, izoh, "chop etilgan". Landing va desktop (keyinchalik yangilanish tekshiruvi) shu jadvaldan o'qiydi. `scripts/dist.mjs` `latest.json` o'rniga SQL/JSON chiqaradi.
4. **Loglar** (`audit_log`) — kirishlar, admin amallari, imtihon holat o'zgarishlari; filtr va sana. Texnik loglar — Supabase Dashboard havolasi.
5. **Zaxira** — oxirgi zaxira holati (GitHub Actions natijasi `app_settings` ga yoziladi) va qo'lda ishga tushirish yo'riqnomasi.

## 9. Landing

- `apps/landing` Vercel'da. "Ilovani yuklab olish" → `releases` (oxirgi `published`), publishable key bilan o'qish.
- "Imtihon boshlash" → panel `…/login` (Google bilan kirish).
- Matn va dizayn o'zgarmaydi.

## 10. Fazalar (har biri alohida commit, o'zbekcha xabar)

Har faza oxirida: `pnpm -r typecheck`, `pnpm -r build`, lint, `pnpm test`, MCP `get_advisors` toza; CLAUDE.md "Holat" yangilanadi.

| # | Faza | Tayyor degani |
|---|---|---|
| 0 | Tayyorgarlik | ✅ tag/branch/MCP. Qoldi: MCP ulanishini tekshirish (yangi sessiyada) |
| 1 | **Spike'lar** (kichik, tashlab yuboriladigan) | Electron main'da supabase-js Realtime private kanal ishlaydi; pg_cron sekundlik jadval ishlaydi; `realtime.send` trigger'dan keladi; Deno'da `shared` importi usuli tanlandi |
| 2 | Schema + RLS + testlar | `supabase/migrations/0001_*.sql…`; `supabase/tests/*.sql` (rollback'li tranzaksiyada `set local role`/`request.jwt.claims` bilan): o'qituvchi A B ning imtihonini ko'rmaydi, o'quvchi baho ko'rmaydi, server-only event rad, DRAFT bo'lmagan imtihon tahrirlanmaydi, `final_score` = `computeFinalScore` |
| 3 | `shared` qayta tashkil | `templates.ts`, `workspace.ts` (savollar.md/dizaynlar) shared'da, testlar; `db.types.ts`; `event_types` generatsiyasi + mosligi testi |
| 4 | Auth | Google provider (foydalanuvchi Google Cloud'da client yaratadi), birinchi kirish → TEACHER (trigger), seed admin, disabled; panel login/logout/callback |
| 5 | Panel → Supabase (CRUD + RPC) | imtihon yaratish/tahrirlash/ochish/boshlash/vaqt/tugatish, jarima, bekor, baholash; Storage yuklash; Excel/zip brauzerda |
| 6 | O'quvchi RPC + desktop transport | `student_join`, `sync_files`, `report_event`, `heartbeat`, `submit_attempt`, `report_app_closed`; `session.ts` qayta yozildi; `fake-student` supabase-js'da |
| 7 | Realtime | panel jonli kuzatuv (lobby, attempt, event, Presence), desktop exam:started/ended/time:sync/lobby:count |
| 8 | Timer + uzilish (pg_cron) | `exam_tick`; 1 daqiqalik imtihon avtomatik tugaydi; DISCONNECTED/RECONNECTED/APP_CLOSED |
| 9 | Figma (Edge Functions + Vault + Storage) | token saqlash, sync, desktop DesignView ishlaydi (`fake-figma` bilan sinov) |
| 10 | Admin panel | 8-bo'limdagi 5 bo'lim |
| 11 | Landing + Vercel | panel va landing `*.vercel.app` da; Supabase Auth redirect URL'lari; desktop production build Supabase'ga ulanadi; `.exe` reliz havolasi |
| 12 | To'liq sinov | o'qituvchi + 2 o'quvchi (o'rnatilgan .exe + fake-student) butun oqim; AUDIT.md, QOLDA-SINASH.md yangilanadi |
| 13 | Tozalash | `apps/server`, Docker/Caddy, `DEPLOY.md` o'chiriladi (v1-local tagida qoladi); `DEPLOY-SUPABASE.md`; CLAUDE.md 3/4/6-bo'limlar Supabase'ga qayta yoziladi; `main` ga merge — foydalanuvchi ruxsati bilan |

### 1-faza natijalari (2026-10-23)
- **Electron main + Realtime:** Electron 44.9 / Node 24.22 da global `WebSocket` bor; supabase-js 2.118 public kanalga obuna bo'ldi, trigger'dan `realtime.send` xabarlari keldi (`apps/desktop/scripts/spike-realtime.cjs`). Kompyuter soati serverdan ~0.4 s oldinda edi — `server_now()` ofseti zarurligi tasdiqlandi. **Private kanal** ham ishladi: anonim sessiya (`signInAnonymously` + `realtime.setAuth()`) `realtime.messages` policy ruxsat bergan mavzuni oldi; policy'siz mavzu → `CHANNEL_ERROR Unauthorized` (`… spike-realtime.cjs private [topic=…]`).
- **MCP cheklovi:** `apply_migration`/`execute_sql` `drop`/`delete`/`auth.users` ga yozishni avtomatik rad etadi (foydalanuvchi chatda rozi bo'lsa ham). Bunday qadamlar — `supabase/scripts/sql-editor-once.sql` kabi fayl, foydalanuvchi SQL Editor'da bajaradi. Shuning uchun haqiqiy bazadagi RLS testi (`rls.test.sql`) ham SQL Editor'da.
- **Advisor `auth_allow_anonymous_sign_ins`:** anonim kirish yoqilgach har `to authenticated` policy uchun chiqadi (Supabase'ning `cron.job` jadvallari uchun ham) — loyiha dizayni bo'yicha kutilgan: o'qituvchi jadvallari `teachers` qatorini talab qiladi, anonimga yopiq (RLS testida tekshiriladi). "Toza" mezonidan istisno.
- **pg_cron:** `'2 seconds'` jadvali Free'da ishlaydi, o'rtacha oraliq 2.01 s (103 tick). `pg_cron` migratsiya bilan yoqildi.
- **Deno + shared:** `supabase/scripts/build-shared.mjs` (esbuild) har modulni alohida minified ESM ga (`supabase/functions/_shared/<modul>.js`) — Edge Function `../_shared/*.js` dan import qiladi; Edge Runtime 1.77.7 (Deno 2.1.4) da ishladi, `verify_jwt` tokensiz 401. Butun index (zod bilan) ~770 KB — shuning uchun faqat kerakli modullar.
- Lokal migratsiya fayllari nomi masofaviy versiyalarga moslandi (`list_migrations`).

### 5-faza qarorlari (2026-10-23)
- **Rasmlar va CUSTOM fayllar hozircha bazada (jsonb), Storage emas** — eski SQLite bilan bir xil limitlar (rasm ≤ 2 MB × 10, CUSTOM ≤ 20 MB). Sabab: o'quvchi papkasi RPC orqali bitta javobda keladi, desktop o'zgarmaydi; Storage keyinchalik hajm muammosi chiqsa.
- Shablon fayllari saqlashda `exams.starter_files` ga tayyor yoziladi (panel, `TEMPLATE_FILES`); o'qituvchi materiallari `exams.readonly_files` (`shared/examFiles.ts`). `start_exam` ularni `attempt_files` ga nusxalaydi.
- Panel sahifalari o'zgarmadi: `lib/api.ts` eski REST yo'llarini `lib/backend.ts` dagi jadval orqali supabase-js'ga o'giradi (view'lar `exam_list`, `attempt_summaries`; RPC'lar). Excel va .zip brauzerda (`lib/exports.ts`, exceljs dinamik import).
- Advisor `authenticated_security_definer_function_executable` — o'qituvchi RPC'lari ataylab chaqiriladi (har biri `private.owns_exam` tekshiradi, anon'ga yopiq). Istisno.
- Postgres'da PUBLIC uchun EXECUTE global standart — `alter default privileges for role postgres revoke execute on functions from public` (exam_rpcs), har funksiyaga aniq GRANT.

Bog'liqliklar: 1 → 2 → (3, 4) → 5 → 6 → 7 → 8 → (9, 10) → 11 → 12 → 13. 9 va 10 parallel bo'lishi mumkin.

## 11. Xavflar

| Xavf | Ta'sir | Choralar |
|---|---|---|
| Electron main'da Realtime/WebSocket muammosi | O'quvchi jonli xabar olmaydi | 1-faza spike; zaxira — 2 s polling `student_state()` RPC |
| pg_cron sekundlik jadval Free'da cheklangan bo'lsa | Timer aniqligi | spike; zaxira — har daqiqada + klient `endsAt` bo'yicha o'zi qulflaydi, server keyin tasdiqlaydi |
| `realtime.messages` RLS xatosi | Begona imtihon eventlari ko'rinishi | 2-faza testlari, 2 o'qituvchi bilan qo'lda sinov |
| Sync hajmi (PostgREST so'rov hajmi) | Katta fayllar rad | hozirgidek 5 MB bo'laklar; limit spike'da o'lchanadi |
| Anonim kirish limiti bitta IP'da | Sinf kira olmaydi | Dashboard'da limitni oshirish, DEPLOY-SUPABASE.md |
| Free loyiha pauzasi / zaxira yo'q | Demo kunida ishlamasligi, ma'lumot yo'qolishi | ogohlantirish, GitHub Actions pg_dump, kerak bo'lsa Pro |
| Ikki tilda takrorlangan qoidalar (TS va SQL: sync cheklovlari, event darajalari) | Nomuvofiqlik | generatsiya skripti + moslik testlari |

## 12. Qarorlar (foydalanuvchi javoblari, 2026-10-22)

1. **Bitta loyiha `kodim`**, alohida dev loyiha yo'q (Free: tashkilotga 2 ta faol loyiha).
   - Barcha sinov ma'lumotlari **aniq belgilanadi**: o'qituvchi email'lari `*@test.kodim.uz`, imtihon nomlari `[TEST] …`, o'quvchi ismlari `TEST …`; jadvallarda belgi yo'q joyda bog'liqlik orqali (imtihon → attempt → event/fayl/jarima) topiladi.
   - `supabase/scripts/cleanup-test-data.sql` — faqat shu belgili ma'lumotlarni o'chiradi (Auth foydalanuvchilari, Storage obyektlari, Vault sirlari, `figma_*`, `audit_log` ham). Avval `dry run` (nima o'chishini sanab ko'rsatadi), keyin o'chirish. 2-fazada yoziladi, 12-faza oxirida ishga tushiriladi va qolgan qatorlar soni tekshiriladi.
2. **GitHub private repo** (`kodim`). `.exe` relizlari — shu repo'ning **GitHub Releases** (private repo relizi faqat ruxsati borlarga ochiladi — landing ommaviy yuklab olishi uchun 11-fazada yo'l tanlanadi: alohida public `kodim-releases` repo yoki repo'ni public qilish; o'shanda foydalanuvchidan so'raladi). Kunlik zaxira — GitHub Actions. Ulash yo'riqnomasi: `GITHUB.md`. Push'dan oldin maxfiy fayllar tekshirildi (`.env`, `*.db`, `release/` ignore'da; tarixda yo'q).
3. **Vercel** — akkaunt GitHub bilan ochiladi. Loyihalar: landing **`kodim`** (`kodim.vercel.app`), panel **`kodim-panel`** (`kodim-panel.vercel.app`). Nom band bo'lsa, foydalanuvchi bilan kelishiladi.
4. **Google OAuth client** — foydalanuvchi o'zi yaratadi. 4-fazada aniq yo'riqnoma beriladi (Google Cloud Console qadamlari, Authorized redirect URI `https://prkrhitgkjyuwyipqimw.supabase.co/auth/v1/callback`, JavaScript origins, Supabase → Auth → URL Configuration: Site URL `https://kodim-panel.vercel.app`, Redirect URLs `https://kodim-panel.vercel.app/auth/callback` va `http://localhost:5273/auth/callback`). Client ID/Secret'ni Supabase Dashboard'ga foydalanuvchi o'zi kiritadi.
5. **Eski SQLite ma'lumotlari ko'chirilmaydi.**
6. **DEPLOY-SUPABASE.md** da Dashboard yo'riqnomalari bo'ladi: anonim kirishni yoqish (Authentication → Sign In / Providers → "Allow anonymous sign-ins") va limitni oshirish (Authentication → Rate Limits → anonim kirishlar soni, bitta sinf bitta IP'dan kirishini hisobga olib), Google provider, URL Configuration, pauzadan tiklash, zaxira.
