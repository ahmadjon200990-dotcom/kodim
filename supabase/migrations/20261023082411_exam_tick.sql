-- Kodim: taymer (MIGRATION-PLAN.md 5-bo'lim, 8-faza) — eski services/runtime.ts (xotiradagi 1 s tick) o'rniga.
-- pg_cron har 2 soniyada chaqiradi (exam_tick_schedule migratsiyasi). Hamma holat bazada — server qayta ishga tushishi muammosi yo'q.
-- Jonli xabarlar Realtime trigger'laridan (attempts/exams o'zgarishi) — bu yerda alohida yuborilmaydi.
-- Vaqt sinxroni: har heartbeat endsAt + serverNow qaytaradi (alohida time:sync shart emas).

create function private.exam_tick() returns void
language plpgsql set search_path = '' as $$
begin
  -- 1) Vaqti tugagan o'quvchilar: 15 s topshirish boshlanadi (klient oxirgi sync'ni yuboradi va qulflanadi).
  update public.attempts a set ending_at = now()
  from public.exams e
  where e.id = a.exam_id and e.status = 'RUNNING' and e.ends_at is not null
    and a.status = 'WORKING' and a.ending_at is null
    and e.ends_at + make_interval(mins => a.extra_minutes) <= now();

  -- 2) 15 s o'tdi — topshirildi (klient javob bermasa ham, oxirgi snapshot bilan).
  update public.attempts set status = 'SUBMITTED', submitted_at = now(), connected = false
  where status = 'WORKING' and ending_at is not null and ending_at + interval '15 seconds' <= now();

  -- 3) Hech kim ishlamayapti va vaqt o'tdi — imtihon yakunlandi, kod bo'shatiladi (AI baholash bu versiyada o'chiq).
  update public.exams e set status = 'FINISHED', code = null
  where e.status in ('RUNNING', 'GRADING') and e.ends_at is not null and e.ends_at <= now()
    and not exists (select 1 from public.attempts a where a.exam_id = e.id and a.status = 'WORKING');

  -- 4) Heartbeat 15 s dan eski — uzilgan. Ishlayotgan bo'lsa DISCONNECTED (bir marta: connected bayrog'i).
  with lost as (
    update public.attempts set connected = false
    where connected and last_seen_at < now() - interval '15 seconds'
    returning id, exam_id, status, ending_at, last_seen_at
  )
  insert into public.events (attempt_id, exam_id, type, severity, details)
  select l.id, l.exam_id, 'DISCONNECTED', 'INFO',
    jsonb_build_object('reason', 'heartbeat', 'lastSeenAt', l.last_seen_at, 'afterMs', 15000)
  from lost l
  where l.status = 'WORKING' and l.ending_at is null;
end;
$$;

revoke execute on function private.exam_tick() from public, anon, authenticated;
