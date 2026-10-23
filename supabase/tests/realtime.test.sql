-- Realtime testi (7-faza): trigger xabarlari va private kanal ruxsatlari. ROLLBACK bilan.
-- Haqiqiy bazada realtime.messages Supabase'niki — u yerda faqat ruxsat qismi ma'noga ega (xabarlar jadvalga yozilmasligi mumkin).
begin;
create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
/** Shu foydalanuvchi mavzuga obuna bo'la oladimi (Realtime server shunday tekshiradi: topic o'rnatib SELECT). */
create function pg_temp.can_join(p_topic text) returns boolean language plpgsql as $$
declare n int;
begin
  perform set_config('realtime.topic', p_topic, true);
  select count(*) into n from realtime.messages where topic = p_topic;
  return n > 0;
end;
$$;
grant execute on function pg_temp.login(uuid), pg_temp.can_join(text) to authenticated;

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-4000-a000-00000000000a', 'a@test.kodim.uz', false),
  ('00000000-0000-4000-a000-00000000000b', 'b@test.kodim.uz', false),
  ('00000000-0000-4000-a000-0000000000e1', null, true),
  ('00000000-0000-4000-a000-0000000000e2', null, true);
insert into public.teachers (id, name, email) values
  ('00000000-0000-4000-a000-00000000000a', 'TEST A', 'a@test.kodim.uz'),
  ('00000000-0000-4000-a000-00000000000b', 'TEST B', 'b@test.kodim.uz')
on conflict (id) do nothing;
insert into public.exams (id, teacher_id, title, status, duration_min, code) values
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-00000000000a', '[TEST] RT', 'LOBBY', 30, '990003');

-- O'quvchi kirdi → o'qituvchiga attempt:update, o'quvchilarga lobby:count
insert into public.attempts (id, exam_id, student_uid, student_name) values
  ('00000000-0000-4000-c000-0000000000e1', '00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-0000000000e1', 'TEST Ali');
-- heartbeat (faqat last_seen_at) — xabar yo'q
update public.attempts set last_seen_at = now() + interval '1 second' where id = '00000000-0000-4000-c000-0000000000e1';
-- boshlash → exam:update + nudge; attempt WORKING → attempt:update + nudge
update public.exams set status = 'RUNNING', started_at = now(), ends_at = now() + interval '30 minutes' where id = '00000000-0000-4000-b000-0000000000a1';
update public.attempts set status = 'WORKING' where id = '00000000-0000-4000-c000-0000000000e1';
insert into public.events (attempt_id, exam_id, type, severity, details) values
  ('00000000-0000-4000-c000-0000000000e1', '00000000-0000-4000-b000-0000000000a1', 'BLOCKED_COMMAND', 'INFO', '{"line": "curl x"}');
insert into public.penalties (attempt_id, points, reason, teacher_id) values
  ('00000000-0000-4000-c000-0000000000e1', 5, 'TEST', '00000000-0000-4000-a000-00000000000a');

do $$
declare
  t text := 'exam:00000000-0000-4000-b000-0000000000a1';
  got text;
begin
  select string_agg(topic || ' ' || event, ' | ' order by id) into got from realtime.messages;
  assert got = t || ' attempt:update | ' || t || ':students lobby:count | '
    || t || ' exam:update | ' || t || ':students nudge | '
    || t || ' attempt:update | attempt:00000000-0000-4000-c000-0000000000e1 nudge | '
    || t || ' event:new | ' || t || ' attempt:update | '
    || t || ' attempt:update',
    'xabarlar ketma-ketligi: ' || got;
  assert (select payload -> 'attempt' ->> 'studentName' from realtime.messages where event = 'attempt:update' order by id limit 1) = 'TEST Ali',
    'AttemptSummary shakli';
  assert (select (payload -> 'attempt' ->> 'penaltyTotal')::int from realtime.messages where event = 'attempt:update' order by id desc limit 1) = 5,
    'jarimadan keyin penaltyTotal';
  assert (select payload -> 'event' ->> 'severity' from realtime.messages where event = 'event:new') = 'DANGER', 'event darajasi bazadan';
  assert (select payload ->> 'studentName' from realtime.messages where event = 'event:new') = 'TEST Ali', 'event:new ismi bilan';
  assert (select payload -> 'exam' ->> 'code' from realtime.messages where event = 'exam:update') = '990003', 'ExamLive shakli';
  assert (select (payload ->> 'joinedCount')::int from realtime.messages where event = 'lobby:count') = 1, 'lobby:count';
end $$;

-- ---------- Kanal ruxsatlari ----------
select pg_temp.login('00000000-0000-4000-a000-00000000000a');
set local role authenticated;
do $$ begin
  assert pg_temp.can_join('exam:00000000-0000-4000-b000-0000000000a1'), 'o''qituvchi o''z imtihon kanaliga';
  assert not pg_temp.can_join('attempt:00000000-0000-4000-c000-0000000000e1'), 'o''qituvchi o''quvchi kanaliga emas';
end $$;
reset role;
select pg_temp.login('00000000-0000-4000-a000-00000000000b');
set local role authenticated;
do $$ begin
  assert not pg_temp.can_join('exam:00000000-0000-4000-b000-0000000000a1'), 'begona o''qituvchi kanalga kira olmaydi';
end $$;
reset role;
select pg_temp.login('00000000-0000-4000-a000-0000000000e1');
set local role authenticated;
do $$ begin
  assert pg_temp.can_join('attempt:00000000-0000-4000-c000-0000000000e1'), 'o''quvchi o''z kanaliga';
  assert pg_temp.can_join('exam:00000000-0000-4000-b000-0000000000a1:students'), 'o''quvchi imtihon o''quvchilar kanaliga';
  assert not pg_temp.can_join('exam:00000000-0000-4000-b000-0000000000a1'), 'o''quvchi o''qituvchi kanalini (eventlar, baholar) ko''rmaydi';
  assert not pg_temp.can_join('exam:junk'), 'yaroqsiz mavzu';
end $$;
reset role;
select pg_temp.login('00000000-0000-4000-a000-0000000000e2');
set local role authenticated;
do $$ begin
  assert not pg_temp.can_join('attempt:00000000-0000-4000-c000-0000000000e1'), 'boshqa o''quvchining kanali';
  assert not pg_temp.can_join('exam:00000000-0000-4000-b000-0000000000a1:students'), 'imtihonga kirmagan o''quvchi';
end $$;
-- klient xabar yubora olmaydi (INSERT policy yo'q)
do $$ begin
  insert into realtime.messages (topic, event, payload) values ('attempt:00000000-0000-4000-c000-0000000000e1', 'nudge', '{}');
  raise exception 'klient broadcast qila oldi';
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
