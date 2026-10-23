-- sync_files testi (6-faza): saqlash, o'chirish, rad etish sabablari, begona ish. ROLLBACK bilan.
begin;
create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.login(uuid) to authenticated;
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-4000-a000-00000000000a', 'a@test.kodim.uz', false),
  ('00000000-0000-4000-a000-0000000000e1', null, true),
  ('00000000-0000-4000-a000-0000000000e2', null, true);
insert into public.teachers (id, name, email) values ('00000000-0000-4000-a000-00000000000a', 'TEST A', 'a@test.kodim.uz') on conflict (id) do nothing;
insert into public.exams (id, teacher_id, title, status, duration_min) values
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-00000000000a', '[TEST] Sync', 'RUNNING', 60);
insert into public.attempts (id, exam_id, student_uid, student_name, status) values
  ('00000000-0000-4000-c000-0000000000e1', '00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-0000000000e1', 'TEST Ali', 'WORKING');
insert into public.attempt_files (attempt_id, path, content) values ('00000000-0000-4000-c000-0000000000e1', 'old.js', '1');

select pg_temp.login('00000000-0000-4000-a000-0000000000e1');
set local role authenticated;
do $$ declare r jsonb; reasons text; begin
  r := public.sync_files('00000000-0000-4000-c000-0000000000e1', jsonb_build_array(
    jsonb_build_object('path', 'index.html', 'content', '<p>salom</p>', 'sha1', 'abc'),
    jsonb_build_object('path', 'img/logo.png', 'content', 'iVBORw0KGgo=', 'encoding', 'base64'),
    jsonb_build_object('path', 'node_modules/x/index.js', 'content', '1'),
    jsonb_build_object('path', 'package-lock.json', 'content', '{}'),
    jsonb_build_object('path', 'savollar.md', 'content', 'buzildi'),
    jsonb_build_object('path', '../evil.js', 'content', '1'),
    jsonb_build_object('path', 'big.txt', 'content', repeat('a', 1048577))
  ), '["old.js", "dizaynlar/1.md"]');
  select string_agg(x ->> 'path' || '=' || (x ->> 'reason'), ',' order by x ->> 'path') into reasons from jsonb_array_elements(r -> 'rejected') x;
  assert reasons = '../evil.js=INVALID_PATH,big.txt=TOO_LARGE,dizaynlar/1.md=READONLY,node_modules/x/index.js=IGNORED,package-lock.json=IGNORED,savollar.md=READONLY',
    'rad etilganlar: ' || reasons;
  assert (select string_agg(path, ',' order by path) from public.attempt_files where attempt_id = '00000000-0000-4000-c000-0000000000e1') = 'img/logo.png,index.html',
    'saqlandi va o''chirildi';
  assert (select encoding from public.attempt_files where path = 'img/logo.png') = 'base64', 'binar base64';
  -- qayta yuborish — yangilanadi
  r := public.sync_files('00000000-0000-4000-c000-0000000000e1', '[{"path": "index.html", "content": "<p>yangi</p>"}]', '[]');
  assert (select content from public.attempt_files where path = 'index.html') = '<p>yangi</p>', 'yangilandi';
end $$;
reset role;

-- 300 fayl chegarasi
insert into public.attempt_files (attempt_id, path, content)
select '00000000-0000-4000-c000-0000000000e1', 'f' || g || '.txt', '' from generate_series(1, 297) g; -- + 2 mavjud = 299
select pg_temp.login('00000000-0000-4000-a000-0000000000e1');
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.sync_files('00000000-0000-4000-c000-0000000000e1', '[{"path": "a.txt", "content": ""}, {"path": "b.txt", "content": ""}, {"path": "index.html", "content": "ok"}]', '[]');
  assert r -> 'rejected' = '[{"path": "b.txt", "reason": "TOO_MANY_FILES"}]', '300 dan oshmaydi, mavjud fayl yangilanadi: ' || r::text;
end $$;
reset role;

select pg_temp.login('00000000-0000-4000-a000-0000000000e2');
set local role authenticated;
do $$ begin
  perform public.sync_files('00000000-0000-4000-c000-0000000000e1', '[{"path": "x.js", "content": "hack"}]', '[]');
  raise exception 'begona ishga yozildi';
exception when others then
  if sqlerrm <> 'NOT_FOUND' then raise; end if;
end $$;
reset role;
rollback;
