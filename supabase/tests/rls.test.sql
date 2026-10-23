-- RLS va huquqlar testi (MIGRATION-PLAN.md 2-faza). Butunlay tranzaksiya ichida va oxirida ROLLBACK —
-- haqiqiy Supabase loyihasida ham iz qoldirmaydi. Sinov ma'lumotlari belgili: @test.kodim.uz, [TEST], TEST.
-- Xato bo'lsa `assert`/`raise` bilan to'xtaydi.
begin;

-- Kutilgan xato: SQL bajarilganda aynan shu SQLSTATE (yoki xabar) chiqishi kerak.
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

-- Kim sifatida: sub = foydalanuvchi id, rol = authenticated.
create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;


-- ---------- Ma'lumotlar (postgres sifatida) ----------
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-4000-a000-00000000000a', 'a@test.kodim.uz', false),
  ('00000000-0000-4000-a000-00000000000b', 'b@test.kodim.uz', false),
  ('00000000-0000-4000-a000-00000000000c', 'admin@test.kodim.uz', false),
  ('00000000-0000-4000-a000-00000000000d', 'disabled@test.kodim.uz', false),
  ('00000000-0000-4000-a000-0000000000e1', null, true);

-- 4-fazadagi auth trigger o'qituvchi qatorini o'zi yaratishi mumkin — shuning uchun upsert.
insert into public.teachers (id, name, email, role, disabled) values
  ('00000000-0000-4000-a000-00000000000a', 'TEST A', 'a@test.kodim.uz', 'TEACHER', false),
  ('00000000-0000-4000-a000-00000000000b', 'TEST B', 'b@test.kodim.uz', 'TEACHER', false),
  ('00000000-0000-4000-a000-00000000000c', 'TEST Admin', 'admin@test.kodim.uz', 'ADMIN', false),
  ('00000000-0000-4000-a000-00000000000d', 'TEST Bloklangan', 'disabled@test.kodim.uz', 'TEACHER', true)
on conflict (id) do update set name = excluded.name, role = excluded.role, disabled = excluded.disabled;

insert into public.exams (id, teacher_id, title, status, duration_min, code) values
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-00000000000a', '[TEST] A qoralama', 'DRAFT', 60, null),
  ('00000000-0000-4000-b000-0000000000a2', '00000000-0000-4000-a000-00000000000a', '[TEST] A jarayonda', 'RUNNING', 60, '990001'),
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-00000000000b', '[TEST] B qoralama', 'DRAFT', 60, null);

insert into public.tasks (exam_id, "order", title, type) values
  ('00000000-0000-4000-b000-0000000000a2', 1, 'TEST topshiriq', 'EXERCISE');

insert into public.attempts (id, exam_id, student_uid, student_name, status, teacher_score, ai_score) values
  ('00000000-0000-4000-c000-0000000000e1', '00000000-0000-4000-b000-0000000000a2',
   '00000000-0000-4000-a000-0000000000e1', 'TEST Oquvchi', 'WORKING', 90, 70);

insert into public.attempt_files (attempt_id, path, content, sha1) values
  ('00000000-0000-4000-c000-0000000000e1', 'index.html', '<p>', 'x');

-- Daraja va exam_id klientdan emas: trigger to'ldiradi.
insert into public.events (id, attempt_id, exam_id, type, severity, details) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-0000000000e1',
   '00000000-0000-4000-b000-0000000000b1', 'BLOCKED_COMMAND', 'INFO', '{}');
do $$ begin
  assert (select severity from public.events where id = '00000000-0000-4000-d000-000000000001') = 'DANGER',
    'event darajasi event_types dan olinadi';
  assert (select exam_id from public.events where id = '00000000-0000-4000-d000-000000000001') = '00000000-0000-4000-b000-0000000000a2',
    'event exam_id attempt dan olinadi';
end $$;
select pg_temp.expect_error($$insert into public.events (attempt_id, exam_id, type, severity)
  values ('00000000-0000-4000-c000-0000000000e1', '00000000-0000-4000-b000-0000000000a2', 'NOT_A_TYPE', 'INFO')$$, 'P0002');

insert into public.penalties (attempt_id, points, reason, teacher_id) values
  ('00000000-0000-4000-c000-0000000000e1', 15, 'TEST jarima', '00000000-0000-4000-a000-00000000000a');

do $$ begin
  assert (select public.final_score(a) from public.attempts a where a.id = '00000000-0000-4000-c000-0000000000e1') = 75,
    'final_score = teacher_score - jarimalar';
  assert (select count(*) from public.event_types where not client_allowed) = 6, 'server-only turlar: 6 ta';
end $$;

-- ---------- O'qituvchi A ----------
select pg_temp.login('00000000-0000-4000-a000-00000000000a');
set local role authenticated;

do $$ begin
  assert (select count(*) from public.exams) = 2, 'A faqat o''z 2 imtihonini ko''radi';
  assert not exists (select 1 from public.exams where teacher_id = '00000000-0000-4000-a000-00000000000b'), 'A B ning imtihonini ko''rmaydi';
  assert (select count(*) from public.teachers) = 1, 'A faqat o''zini ko''radi';
  assert (select count(*) from public.attempts) = 1, 'A o''z imtihonidagi ishni ko''radi';
  assert (select count(*) from public.events) = 1, 'A o''z imtihoni eventlarini ko''radi';
  assert (select count(*) from public.penalties) = 1, 'A jarimalarni ko''radi';
end $$;

update public.exams set title = '[TEST] B buzildi' where id = '00000000-0000-4000-b000-0000000000b1';
update public.exams set title = '[TEST] A tahrirlandi' where id = '00000000-0000-4000-b000-0000000000a1';
select pg_temp.expect_error($$update public.exams set title = 'x' where id = '00000000-0000-4000-b000-0000000000a2'$$, 'EXAM_NOT_EDITABLE');
select pg_temp.expect_error($$update public.exams set status = 'RUNNING' where id = '00000000-0000-4000-b000-0000000000a1'$$, '42501');
select pg_temp.expect_error($$update public.exams set code = '123456' where id = '00000000-0000-4000-b000-0000000000a1'$$, '42501');
select pg_temp.expect_error($$insert into public.exams (teacher_id, title, duration_min)
  values ('00000000-0000-4000-a000-00000000000b', '[TEST] begona', 10)$$, '42501');
insert into public.exams (teacher_id, title, duration_min) values ('00000000-0000-4000-a000-00000000000a', '[TEST] A yangi', 10);
delete from public.exams where id = '00000000-0000-4000-b000-0000000000a2'; -- RUNNING: o'chmaydi
select pg_temp.expect_error($$insert into public.tasks (exam_id, "order", title, type)
  values ('00000000-0000-4000-b000-0000000000a2', 2, 'x', 'EXERCISE')$$, '42501');
insert into public.tasks (exam_id, "order", title, type) values ('00000000-0000-4000-b000-0000000000a1', 1, 'TEST', 'EXERCISE');
select pg_temp.expect_error($$update public.attempts set teacher_score = 100$$, '42501');
select pg_temp.expect_error($$insert into public.penalties (attempt_id, points, reason, teacher_id)
  values ('00000000-0000-4000-c000-0000000000e1', 5, 'x', '00000000-0000-4000-a000-00000000000a')$$, '42501');
select pg_temp.expect_error($$update public.teachers set role = 'ADMIN'$$, '42501');
update public.teachers set name = 'TEST A yangi';
reset role;

do $$ begin
  assert (select title from public.exams where id = '00000000-0000-4000-b000-0000000000b1') = '[TEST] B qoralama', 'A B ni tahrirlay olmadi';
  assert (select title from public.exams where id = '00000000-0000-4000-b000-0000000000a1') = '[TEST] A tahrirlandi', 'A o''z qoralamasini tahrirladi';
  assert exists (select 1 from public.exams where id = '00000000-0000-4000-b000-0000000000a2'), 'RUNNING imtihon o''chmadi';
  assert (select name from public.teachers where id = '00000000-0000-4000-a000-00000000000a') = 'TEST A yangi', 'o''z ismini o''zgartirdi';
  assert (select role from public.teachers where id = '00000000-0000-4000-a000-00000000000a') = 'TEACHER', 'rol o''zgarmadi';
end $$;

-- ---------- Admin ----------
select pg_temp.login('00000000-0000-4000-a000-00000000000c');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.exams) = 4, 'admin hamma imtihonni ko''radi';
  assert (select count(*) from public.teachers) = 4, 'admin hamma o''qituvchini ko''radi';
end $$;
reset role;

-- ---------- Bloklangan o'qituvchi ----------
select pg_temp.login('00000000-0000-4000-a000-00000000000d');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.exams) = 0, 'bloklangan o''qituvchi hech narsa ko''rmaydi';
end $$;
select pg_temp.expect_error($$insert into public.exams (teacher_id, title, duration_min)
  values ('00000000-0000-4000-a000-00000000000d', '[TEST] bloklangan', 10)$$, '42501');
reset role;

-- ---------- O'quvchi (anonim foydalanuvchi) ----------
select pg_temp.login('00000000-0000-4000-a000-0000000000e1');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.exams) = 0, 'o''quvchi imtihonlarni to''g''ridan-to''g''ri ko''rmaydi';
  assert (select count(*) from public.attempts) = 0, 'o''quvchi baholarni (attempts) ko''rmaydi';
  assert (select count(*) from public.events) = 0, 'o''quvchi eventlarni ko''rmaydi';
  assert (select count(*) from public.penalties) = 0, 'o''quvchi jarimalarni ko''rmaydi';
  assert (select count(*) from public.teachers) = 0, 'o''quvchi o''qituvchilarni ko''rmaydi';
  assert (select count(*) from public.attempt_files) = 1, 'o''quvchi o''z fayllarini ko''radi';
end $$;
select pg_temp.expect_error($$insert into public.events (attempt_id, exam_id, type, severity)
  values ('00000000-0000-4000-c000-0000000000e1', '00000000-0000-4000-b000-0000000000a2', 'FOCUS_LOST', 'INFO')$$, '42501');
select pg_temp.expect_error($$insert into public.exams (teacher_id, title, duration_min)
  values ('00000000-0000-4000-a000-0000000000e1', '[TEST] o''quvchi', 10)$$, '42501');
select pg_temp.expect_error($$insert into public.attempt_files (attempt_id, path, content, sha1)
  values ('00000000-0000-4000-c000-0000000000e1', 'a.js', '1', 'x')$$, '42501');
reset role;

-- ---------- anon (kirmagan) ----------
select set_config('request.jwt.claims', '', true);
set local role anon;
select pg_temp.expect_error($$select * from public.exams$$, '42501');
select pg_temp.expect_error($$select * from public.attempts$$, '42501');
select pg_temp.expect_error($$select public.is_admin()$$, '42501');
reset role;

rollback;
