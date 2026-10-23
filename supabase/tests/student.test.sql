-- O'quvchi RPC'lari testi (6-faza): kirish qoidalari, rate limit, heartbeat, eventlar, sync, topshirish. ROLLBACK bilan.
begin;

create function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'KUTILGAN XATO CHIQMADI (%): %', p_code, p_sql;
exception when others then
  if sqlerrm like 'KUTILGAN XATO CHIQMADI%' then raise; end if;
  if sqlstate <> p_code and sqlerrm <> p_code then
    raise exception 'Boshqa xato (kutilgan %, chiqdi % %): %', p_code, sqlstate, sqlerrm, p_sql;
  end if;
end;
$$;
create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', true)::text, true);
$$;
grant execute on function pg_temp.expect_error(text, text), pg_temp.login(uuid) to authenticated, anon;
create temp table r (k text primary key, v jsonb);
grant all on r to authenticated, anon;

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-4000-a000-00000000000a', 'a@test.kodim.uz', false),
  ('00000000-0000-4000-a000-0000000000e1', null, true),
  ('00000000-0000-4000-a000-0000000000e2', null, true),
  ('00000000-0000-4000-a000-0000000000e3', null, true);
insert into public.teachers (id, name, email) values ('00000000-0000-4000-a000-00000000000a', 'TEST A', 'a@test.kodim.uz')
on conflict (id) do nothing;
insert into public.exams (id, teacher_id, title, status, duration_min, code, started_at, ends_at, starter_files, readonly_files, allowed_commands) values
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-00000000000a', '[TEST] Jarayonda', 'RUNNING', 60, '990002',
   now() - interval '10 minutes', now() + interval '50 minutes',
   '[{"path": "index.html", "content": "<p>"}]', '[{"path": "savollar.md", "content": "# T"}]', '["npm run"]'),
  ('00000000-0000-4000-b000-0000000000a2', '00000000-0000-4000-a000-00000000000a', '[TEST] Qoralama', 'DRAFT', 60, null, null, null, '[]', '[]', '[]');

-- ---------- Kech kirgan o'quvchi ----------
select pg_temp.login('00000000-0000-4000-a000-0000000000e1');
set local role authenticated;
insert into r values ('j1', public.student_join('990002', '  TEST   Ali  ', 'device-aaaa-1111'));
do $$ declare j jsonb := (select v from r where k = 'j1'); begin
  assert (j ->> 'ok')::boolean, 'kirdi: ' || j::text;
  assert j -> 'exam' ->> 'title' = '[TEST] Jarayonda' and j -> 'exam' -> 'allowedCommands' = '["npm run"]', 'ExamPublic';
  assert not (j -> 'exam' ? 'criteria') and not (j -> 'exam' ? 'reference_files'), 'baholash ma''lumotlari yo''q';
  assert j -> 'state' ->> 'phase' = 'WORKING', 'kech kelgan — darhol WORKING';
  assert jsonb_array_length(j -> 'state' -> 'files') = 2, 'savollar.md + index.html';
  assert (j -> 'state' ->> 'joinedCount')::int = 1, 'kirganlar soni';
end $$;
-- shu sessiya qayta kirsa — o'sha ish, yangi event yo'q
insert into r values ('j1b', public.student_join('990002', 'TEST Ali', 'device-aaaa-1111'));
do $$ begin
  assert (select v -> 'attemptId' from r where k = 'j1b') = (select v -> 'attemptId' from r where k = 'j1'), 'o''sha ish';
end $$;
insert into r values ('bad', public.student_join('123456', 'TEST Ali', 'device-aaaa-1111'));
insert into r values ('inv', public.student_join('12', 'T', 'x'));
do $$ begin
  assert (select v ->> 'error' from r where k = 'bad') = 'BAD_CODE', 'noto''g''ri kod';
  assert (select v ->> 'error' from r where k = 'inv') = 'INVALID_INPUT', 'yaroqsiz kiritma';
end $$;
reset role;

do $$ declare v_id uuid := (select (v ->> 'attemptId')::uuid from r where k = 'j1'); begin
  assert (select status from public.attempts where id = v_id) = 'WORKING', 'WORKING';
  assert (select student_name from public.attempts where id = v_id) = 'TEST Ali', 'ism bo''shliqlari tozalandi';
  assert (select string_agg(type, ',' order by created_at) from public.events where attempt_id = v_id) = 'LATE_JOIN', 'faqat LATE_JOIN';
  assert (select (details ->> 'minutesAfterStart')::int from public.events where attempt_id = v_id) = 10, 'necha daqiqa kech';
end $$;

-- ---------- Boshqa kompyuter, o'sha ism ----------
select pg_temp.login('00000000-0000-4000-a000-0000000000e2');
set local role authenticated;
insert into r values ('taken', public.student_join('990002', 'test ali', 'device-bbbb-2222'));
reset role;
update public.attempts set last_seen_at = now() - interval '1 minute' where student_name = 'TEST Ali';
select pg_temp.login('00000000-0000-4000-a000-0000000000e2');
set local role authenticated;
insert into r values ('j2', public.student_join('990002', 'test ali', 'device-bbbb-2222'));
do $$ begin
  assert (select v ->> 'error' from r where k = 'taken') = 'NAME_TAKEN', 'jonli ulanish bor — ism band';
  assert (select v -> 'attemptId' from r where k = 'j2') = (select v -> 'attemptId' from r where k = 'j1'), 'ism bo''yicha o''sha ish';
end $$;
reset role;
do $$ declare v_id uuid := (select (v ->> 'attemptId')::uuid from r where k = 'j1'); begin
  assert (select student_uid from public.attempts where id = v_id) = '00000000-0000-4000-a000-0000000000e2', 'ish yangi sessiyaga o''tdi';
  assert (select string_agg(type, ',' order by type) from public.events where attempt_id = v_id) = 'DEVICE_CHANGED,LATE_JOIN,RECONNECTED',
    'DEVICE_CHANGED + RECONNECTED';
end $$;

-- ---------- Eski sessiya endi begona; yangi sessiya ishlaydi ----------
select pg_temp.login('00000000-0000-4000-a000-0000000000e1');
set local role authenticated;
select pg_temp.expect_error(format($$select public.heartbeat(%L)$$, (select v ->> 'attemptId' from r where k = 'j1')), 'NOT_FOUND');
reset role;

select pg_temp.login('00000000-0000-4000-a000-0000000000e2');
set local role authenticated;
do $$ declare v_id uuid := (select (v ->> 'attemptId')::uuid from r where k = 'j1'); s jsonb; e uuid; begin
  s := public.heartbeat(v_id);
  assert s ->> 'phase' = 'WORKING' and not (s ->> 'ending')::boolean and s -> 'files' = 'null', 'heartbeat holati';
  e := public.report_event(v_id, 'FOCUS_LOST', '{"blur": true}');
  perform public.report_event(v_id, 'FOCUS_LOST', '{"durationSec": 12}', e);
  insert into r values ('focus', to_jsonb(e));
end $$;
select pg_temp.expect_error(format($$select public.report_event(%L, 'DEVICE_CHANGED', '{}')$$, (select v ->> 'attemptId' from r where k = 'j1')), 'EVENT_TYPE_NOT_ALLOWED');
select pg_temp.expect_error(format($$select public.report_event(%L, 'NO_SUCH', '{}')$$, (select v ->> 'attemptId' from r where k = 'j1')), 'EVENT_TYPE_NOT_ALLOWED');
select pg_temp.expect_error(format($$select public.report_event(%L, 'FOCUS_LOST', '[1]')$$, (select v ->> 'attemptId' from r where k = 'j1')), 'INVALID_DETAILS');
reset role;
do $$ begin
  assert (select details from public.events where id = (select (v #>> '{}')::uuid from r where k = 'focus')) = '{"blur": true, "durationSec": 12}',
    'event tafsiloti to''ldirildi';
  assert (select severity from public.events where id = (select (v #>> '{}')::uuid from r where k = 'focus')) = 'WARN', 'daraja bazadan';
end $$;

-- ---------- Rate limit: noto'g'ri kod bilan ko'p urinish ----------
select pg_temp.login('00000000-0000-4000-a000-0000000000e3');
set local role authenticated;
do $$ declare j jsonb; begin
  for i in 1..11 loop j := public.student_join('000000', 'TEST Hacker', 'device-cccc-3333'); end loop;
  j := public.student_join('990002', 'TEST Hacker', 'device-cccc-3333');
  assert j ->> 'error' = 'TOO_MANY' and (j ->> 'retryAfterSec')::int > 1700, 'qurilma 30 daqiqaga bloklandi: ' || j::text;
end $$;
-- qoralama imtihonga kirib bo'lmaydi (kod yo'q)
reset role;

-- ---------- Topshirish va ilova yopilishi ----------
select pg_temp.login('00000000-0000-4000-a000-0000000000e2');
set local role authenticated;
do $$ declare v_id uuid := (select (v ->> 'attemptId')::uuid from r where k = 'j1'); s jsonb; begin
  perform public.report_app_closed(v_id);
  s := public.submit_attempt(v_id);
  assert (s ->> 'ending')::boolean, 'topshirish boshlandi';
  perform public.report_app_closed(v_id); -- topshirish jarayonida — APP_CLOSED yozilmaydi
end $$;
reset role;
do $$ declare v_id uuid := (select (v ->> 'attemptId')::uuid from r where k = 'j1'); begin
  assert (select count(*) from public.events where attempt_id = v_id and type = 'APP_CLOSED') = 1, 'APP_CLOSED bir marta';
  assert (select ending_at from public.attempts where id = v_id) is not null, 'ending_at';
  assert not (select connected from public.attempts where id = v_id), 'uzilgan';
end $$;

-- ---------- anon (kirmagan) ----------
select set_config('request.jwt.claims', '', true);
set local role anon;
select pg_temp.expect_error($$select public.student_join('990002', 'TEST X', 'device-dddd-4444')$$, '42501');
reset role;

rollback;
