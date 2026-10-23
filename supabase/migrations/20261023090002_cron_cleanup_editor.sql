-- @remote-only
-- Kodim: pg_cron har ishga tushishni cron.job_run_details ga yozadi (2 s → kuniga ~43 ming qator).
-- Har kecha bir kundan eskisini tozalaymiz. Ichida o'chirish bor — Supabase MCP rad etadi, SQL Editor'da bajariladi.
select cron.schedule('kodim-cron-cleanup', '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '1 day'$$);
