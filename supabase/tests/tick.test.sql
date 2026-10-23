-- exam_tick testi (8-faza): vaqt tugashi → 15 s → SUBMITTED → FINISHED; qo'shimcha vaqt; uzilish. ROLLBACK bilan.
begin;
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-4000-a000-00000000000a', 'a@test.kodim.uz', false),
  ('00000000-0000-4000-a000-0000000000e1', null, true),
  ('00000000-0000-4000-a000-0000000000e2', null, true),
  ('00000000-0000-4000-a000-0000000000e3', null, true);
insert into public.teachers (id, name, email) values ('00000000-0000-4000-a000-00000000000a', 'TEST A', 'a@test.kodim.uz') on conflict (id) do nothing;
insert into public.exams (id, teacher_id, title, status, duration_min, code, started_at, ends_at) values
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-00000000000a', '[TEST] Tick', 'RUNNING', 10, '990004',
   now() - interval '10 minutes', now() - interval '1 second');
insert into public.attempts (id, exam_id, student_uid, student_name, status, extra_minutes, connected, last_seen_at) values
  ('00000000-0000-4000-c000-0000000000e1', '00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-0000000000e1', 'TEST Ali', 'WORKING', 0, true, now()),
  ('00000000-0000-4000-c000-0000000000e2', '00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-0000000000e2', 'TEST Vali', 'WORKING', 5, true, now() - interval '20 seconds'),
  ('00000000-0000-4000-c000-0000000000e3', '00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-0000000000e3', 'TEST Sobir', 'ANNULLED', 0, false, now());

select private.exam_tick();
do $$ begin
  assert (select ending_at is not null from public.attempts where id = '00000000-0000-4000-c000-0000000000e1'), 'Ali: topshirish boshlandi';
  assert (select ending_at is null from public.attempts where id = '00000000-0000-4000-c000-0000000000e2'), 'Vali: qo''shimcha vaqti bor';
  assert (select status from public.attempts where id = '00000000-0000-4000-c000-0000000000e1') = 'WORKING', '15 s hali o''tmadi';
  assert not (select connected from public.attempts where id = '00000000-0000-4000-c000-0000000000e2'), 'Vali: heartbeat 20 s eski — uzilgan';
  assert (select count(*) from public.events where attempt_id = '00000000-0000-4000-c000-0000000000e2' and type = 'DISCONNECTED') = 1, 'DISCONNECTED';
  assert (select severity from public.events where type = 'DISCONNECTED') = 'WARN', 'daraja bazadan';
  assert (select status from public.exams where id = '00000000-0000-4000-b000-0000000000a1') = 'RUNNING', 'hali ishlayotganlar bor';
end $$;
-- takror tick — DISCONNECTED qayta yozilmaydi
select private.exam_tick();
do $$ begin
  assert (select count(*) from public.events where type = 'DISCONNECTED') = 1, 'DISCONNECTED bir marta';
end $$;

-- 15 s o'tdi
update public.attempts set ending_at = now() - interval '16 seconds' where id = '00000000-0000-4000-c000-0000000000e1';
select private.exam_tick();
do $$ begin
  assert (select status from public.attempts where id = '00000000-0000-4000-c000-0000000000e1') = 'SUBMITTED', 'Ali topshirildi';
  assert (select submitted_at is not null from public.attempts where id = '00000000-0000-4000-c000-0000000000e1'), 'submitted_at';
  assert (select status from public.exams where id = '00000000-0000-4000-b000-0000000000a1') = 'RUNNING', 'Vali hali ishlayapti';
end $$;

-- Vali'ning vaqti ham tugadi → topshirish → imtihon yakunlandi
update public.attempts set extra_minutes = 0 where id = '00000000-0000-4000-c000-0000000000e2';
select private.exam_tick();
update public.attempts set ending_at = now() - interval '16 seconds' where id = '00000000-0000-4000-c000-0000000000e2';
select private.exam_tick();
do $$ begin
  assert (select status from public.attempts where id = '00000000-0000-4000-c000-0000000000e2') = 'SUBMITTED', 'Vali topshirildi';
  assert (select status from public.attempts where id = '00000000-0000-4000-c000-0000000000e3') = 'ANNULLED', 'bekor qilingan o''zgarmadi';
  assert (select status || '/' || coalesce(code, 'null') from public.exams where id = '00000000-0000-4000-b000-0000000000a1') = 'FINISHED/null',
    'imtihon yakunlandi, kod bo''shatildi';
  assert (select count(*) from realtime.messages where event = 'exam:update') >= 1, 'panelga exam:update';
end $$;

-- Topshirish paytida uzilsa DISCONNECTED yozilmaydi
insert into public.exams (id, teacher_id, title, status, duration_min, started_at, ends_at) values
  ('00000000-0000-4000-b000-0000000000a2', '00000000-0000-4000-a000-00000000000a', '[TEST] Tick 2', 'RUNNING', 10, now(), now() + interval '10 minutes');
insert into public.attempts (exam_id, student_uid, student_name, status, connected, last_seen_at, ending_at) values
  ('00000000-0000-4000-b000-0000000000a2', '00000000-0000-4000-a000-0000000000e1', 'TEST Ending', 'WORKING', true, now() - interval '20 seconds', now());
select private.exam_tick();
do $$ begin
  assert (select count(*) from public.events where type = 'DISCONNECTED') = 1, 'topshirish paytidagi uzilish — event yo''q';
end $$;
rollback;
