-- @remote-only (lokal PGlite'da pg_cron yo'q)
-- Kodim: exam_tick har 2 soniyada (pg_cron sekundlik jadval — 1-faza spike'ida Free'da tasdiqlangan).
select cron.schedule('kodim-exam-tick', '2 seconds', 'select private.exam_tick()');
