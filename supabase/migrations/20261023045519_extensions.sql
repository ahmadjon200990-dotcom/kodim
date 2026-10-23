-- @remote-only (lokal PGlite testida o'tkazib yuboriladi)
-- Kodim: pg_cron — exam_tick() taymeri uchun (MIGRATION-PLAN.md 5-bo'lim, sekundlik jadval).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
