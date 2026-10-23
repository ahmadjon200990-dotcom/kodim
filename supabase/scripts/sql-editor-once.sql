-- Bir martalik: Supabase MCP `drop`/`delete` ni avtomatik rad etadi — shu faylni Dashboard → SQL Editor'da bajaring.
-- 1) migratsiya 20261023051035_drop_tasks_write.sql (advisor: multiple_permissive_policies)
drop policy if exists tasks_write on public.tasks;

-- 2) 1-faza spike qoldiqlari
select cron.unschedule(jobname) from cron.job where jobname = 'spike-tick';
drop policy if exists spike_private_read on realtime.messages;
drop schema if exists spike cascade;

-- 3) Spike'larda yaratilgan anonim foydalanuvchilar (hech qanday ishi yo'q anonimlar)
delete from auth.users u
where u.is_anonymous and not exists (select 1 from public.attempts a where a.student_uid = u.id);

-- 4) Tekshiruv
select
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_write') as tasks_write_qoldi,
  to_regnamespace('spike') as spike_sxema,
  (select count(*) from auth.users where is_anonymous) as anonimlar;
