-- O'qituvchi RPC'lari testi (5-faza). ROLLBACK bilan; sinov ma'lumotlari belgili (@test.kodim.uz, [TEST], TEST).
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
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.expect_error(text, text), pg_temp.login(uuid) to authenticated, anon;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-4000-a000-00000000000a', 'a@test.kodim.uz', false),
  ('00000000-0000-4000-a000-00000000000b', 'b@test.kodim.uz', false),
  ('00000000-0000-4000-a000-0000000000e1', null, true),
  ('00000000-0000-4000-a000-0000000000e2', null, true);
insert into public.teachers (id, name, email) values
  ('00000000-0000-4000-a000-00000000000a', 'TEST A', 'a@test.kodim.uz'),
  ('00000000-0000-4000-a000-00000000000b', 'TEST B', 'b@test.kodim.uz')
on conflict (id) do nothing;

-- ---------- O'qituvchi A: yaratish va tahrirlash ----------
select pg_temp.login('00000000-0000-4000-a000-00000000000a');
set local role authenticated;

insert into ids values ('exam', public.save_exam(null,
  '{"title": "[TEST] RPC", "duration_min": 30, "template": "HTML",
    "starter_files": [{"path": "index.html", "content": "<p>"}, {"path": "logo.png", "content": "iVBO", "encoding": "base64"}],
    "criteria": [{"name": "HTML", "weight": 60, "description": ""}, {"name": "CSS", "weight": 40, "description": ""}],
    "readonly_files": [{"path": "savollar.md", "content": "# T"}]}',
  '[{"title": "Birinchi", "type": "EXERCISE"}, {"title": "Ikkinchi", "type": "FIGMA", "figma_url": "https://www.figma.com/design/abcdefghij/x"}]'));

do $$ declare v_id uuid := (select v from ids where k = 'exam'); begin
  assert (select status from public.exams where id = v_id) = 'DRAFT', 'yangi imtihon DRAFT';
  assert (select teacher_id from public.exams where id = v_id) = '00000000-0000-4000-a000-00000000000a', 'egasi A';
  assert (select string_agg(title, ',' order by "order") from public.tasks where exam_id = v_id) = 'Birinchi,Ikkinchi', 'topshiriqlar tartibi';
end $$;

-- tahrirlash: topshiriqlar almashtiriladi
select public.save_exam((select v from ids where k = 'exam'),
  '{"title": "[TEST] RPC 2", "duration_min": 45, "template": "HTML",
    "starter_files": [{"path": "index.html", "content": "<p>"}],
    "criteria": [{"name": "HTML", "weight": 60, "description": ""}, {"name": "CSS", "weight": 40, "description": ""}]}',
  '[{"title": "Yagona", "type": "EXERCISE"}]');
do $$ declare v_id uuid := (select v from ids where k = 'exam'); begin
  assert (select duration_min from public.exams where id = v_id) = 45, 'tahrirlandi';
  assert (select count(*) from public.tasks where exam_id = v_id) = 1, 'topshiriqlar almashtirildi';
end $$;
select pg_temp.expect_error(format($$select public.save_exam(%L, '{"title": "x", "duration_min": 5}', '[]')$$,
  (select v from ids where k = 'exam')), 'TASKS_REQUIRED');

-- ochish
insert into ids values ('code_holder', null);
do $$ declare v_code text; begin
  v_code := public.open_exam((select v from ids where k = 'exam'));
  assert v_code ~ '^[1-9][0-9]{5}$', 'kod 6 xonali: ' || v_code;
  assert (select status from public.exams where id = (select v from ids where k = 'exam')) = 'LOBBY', 'LOBBY';
end $$;
select pg_temp.expect_error(format($$select public.open_exam(%L)$$, (select v from ids where k = 'exam')), 'EXAM_MUST_BE_DRAFT');
select pg_temp.expect_error(format($$select public.save_exam(%L, '{"title": "x", "duration_min": 5}', '[{"title": "a", "type": "EXERCISE"}]')$$,
  (select v from ids where k = 'exam')), 'EXAM_NOT_EDITABLE');
select pg_temp.expect_error(format($$select public.extend_exam(%L, 5)$$, (select v from ids where k = 'exam')), 'EXAM_MUST_BE_RUNNING');
reset role;

-- ---------- Boshqa o'qituvchi va o'quvchi ----------
select pg_temp.login('00000000-0000-4000-a000-00000000000b');
set local role authenticated;
select pg_temp.expect_error(format($$select public.start_exam(%L)$$, (select v from ids where k = 'exam')), 'NOT_FOUND');
select pg_temp.expect_error(format($$select public.save_exam(%L, '{"title": "x", "duration_min": 5}', '[{"title": "a", "type": "EXERCISE"}]')$$,
  (select v from ids where k = 'exam')), 'NOT_FOUND');
reset role;

select pg_temp.login('00000000-0000-4000-a000-0000000000e1');
set local role authenticated;
select pg_temp.expect_error($$select public.save_exam(null, '{"title": "[TEST] o''quvchi", "duration_min": 5}', '[{"title": "a", "type": "EXERCISE"}]')$$, 'NOT_AUTHORIZED');
select pg_temp.expect_error(format($$select public.open_exam(%L)$$, (select v from ids where k = 'exam')), 'NOT_FOUND');
reset role;

select set_config('request.jwt.claims', '', true);
set local role anon;
select pg_temp.expect_error(format($$select public.open_exam(%L)$$, (select v from ids where k = 'exam')), '42501');
reset role;

-- O'quvchilar kirdi (6-fazada student_join qiladi)
insert into public.attempts (id, exam_id, student_uid, student_name) values
  ('00000000-0000-4000-c000-0000000000e1', (select v from ids where k = 'exam'), '00000000-0000-4000-a000-0000000000e1', 'TEST Ali'),
  ('00000000-0000-4000-c000-0000000000e2', (select v from ids where k = 'exam'), '00000000-0000-4000-a000-0000000000e2', 'TEST Vali');

-- ---------- Boshlash, vaqt, jarima, bekor, baho, tugatish ----------
select pg_temp.login('00000000-0000-4000-a000-00000000000a');
set local role authenticated;

do $$ declare e public.exams; begin
  e := public.start_exam((select v from ids where k = 'exam'));
  assert e.status = 'RUNNING' and e.ends_at = e.started_at + interval '45 minutes', 'RUNNING, ends_at = start + 45 daq';
  assert (select count(*) from public.attempts where exam_id = e.id and status = 'WORKING') = 2, 'hamma WORKING';
  assert (select count(*) from public.attempt_files where attempt_id = '00000000-0000-4000-c000-0000000000e1') = 1, 'boshlang''ich fayl yozildi';
end $$;
select pg_temp.expect_error(format($$select public.start_exam(%L)$$, (select v from ids where k = 'exam')), 'EXAM_MUST_BE_LOBBY');

do $$ declare v_id uuid := (select v from ids where k = 'exam'); v_before timestamptz; r jsonb; begin
  v_before := (select ends_at from public.exams where id = v_id);
  r := public.extend_exam(v_id, 10);
  assert (select ends_at from public.exams where id = v_id) = v_before + interval '10 minutes', 'hammaga +10';
  r := public.extend_exam(v_id, 5, '00000000-0000-4000-c000-0000000000e1');
  assert (r ->> 'extra_minutes')::int = 5, 'bitta o''quvchiga +5';
end $$;
select pg_temp.expect_error(format($$select public.extend_exam(%L, 0)$$, (select v from ids where k = 'exam')), 'INVALID_MINUTES');
select pg_temp.expect_error(format($$select public.extend_exam(%L, 5, '00000000-0000-4000-c000-000000000099')$$, (select v from ids where k = 'exam')), 'ATTEMPT_NOT_IN_EXAM');

do $$ declare p public.penalties; begin
  p := public.add_penalty('00000000-0000-4000-c000-0000000000e1', 10, '  TEST jarima ');
  assert p.reason = 'TEST jarima' and p.teacher_id = '00000000-0000-4000-a000-00000000000a', 'jarima yozildi';
  perform public.add_penalty('00000000-0000-4000-c000-0000000000e1', 5, 'TEST');
  perform public.delete_penalty(p.id);
  assert (select coalesce(sum(points), 0) from public.penalties where attempt_id = '00000000-0000-4000-c000-0000000000e1') = 5, 'bittasi o''chirildi';
end $$;
select pg_temp.expect_error($$select public.add_penalty('00000000-0000-4000-c000-0000000000e1', 5, 'x', '00000000-0000-4000-d000-000000000099')$$, 'EVENT_NOT_FOUND');
select pg_temp.expect_error($$select public.add_penalty('00000000-0000-4000-c000-0000000000e1', 0, 'x')$$, '23514');

do $$ declare a public.attempts; begin
  a := public.annul_attempt('00000000-0000-4000-c000-0000000000e2');
  assert a.status = 'ANNULLED', 'bekor qilindi';
  a := public.unannul_attempt('00000000-0000-4000-c000-0000000000e2');
  assert a.status = 'WORKING', 'imtihon davom etmoqda — WORKING';
end $$;
select pg_temp.expect_error($$select public.unannul_attempt('00000000-0000-4000-c000-0000000000e2')$$, 'NOT_ANNULLED');

do $$ declare a public.attempts; begin
  a := public.grade_attempt('00000000-0000-4000-c000-0000000000e1',
    '{"criteria": [{"name": "HTML", "score": 50, "comment": "yaxshi"}, {"name": "CSS", "score": 30}], "teacherComment": "Zo''r"}');
  assert a.teacher_score = 80 and a.graded_by = 'TEACHER' and a.teacher_comment = 'Zo''r', 'mezonlar yig''indisi = 80';
  assert (a.teacher_criteria -> 0 ->> 'weight')::int = 60, 'mezon og''irligi imtihondan';
  assert (select public.final_score(x) from public.attempts x where x.id = a.id) = 75, 'yakuniy = 80 - 5';
  a := public.grade_attempt(a.id, '{"teacherScore": 90}');
  assert a.teacher_score = 90 and a.teacher_comment = 'Zo''r', 'faqat ball o''zgardi';
  a := public.grade_attempt(a.id, '{"teacherScore": null}');
  assert a.teacher_score is null and a.teacher_criteria is null and a.graded_by = 'NONE', 'baho olib tashlandi';
end $$;
select pg_temp.expect_error($$select public.grade_attempt('00000000-0000-4000-c000-0000000000e1', '{"criteria": [{"name": "JS", "score": 1}]}')$$, 'UNKNOWN_CRITERION');
select pg_temp.expect_error($$select public.grade_attempt('00000000-0000-4000-c000-0000000000e1', '{"criteria": [{"name": "CSS", "score": 41}]}')$$, 'CRITERION_OVER_WEIGHT');
select pg_temp.expect_error($$select public.grade_attempt('00000000-0000-4000-c000-0000000000e1', '{"teacherScore": 101}')$$, 'INVALID_SCORE');

do $$ declare e public.exams; begin
  e := public.finish_exam((select v from ids where k = 'exam'));
  assert e.ends_at <= now(), 'ends_at = hozir';
  assert (select count(*) from public.attempts where exam_id = e.id and ending_at is not null) = 2, '15 s topshirish boshlandi';
end $$;
reset role;

rollback;
