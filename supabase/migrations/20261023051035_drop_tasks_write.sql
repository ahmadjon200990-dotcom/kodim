-- Kodim: eski `tasks_write` (for all) policy — o'rnini tasks_insert/update/delete egalladi.
-- MCP `drop` ni avtomatik rad etadi — foydalanuvchi SQL Editor'da bajaradi (masofaviy migratsiya tarixida bo'lmaydi).
drop policy if exists tasks_write on public.tasks;
