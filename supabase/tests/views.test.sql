-- Panel view'lari: RLS chaqiruvchi nomidan (A B ning ishlarini ko'rmaydi), hisoblar to'g'ri. ROLLBACK bilan.
begin;
create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.login(uuid) to authenticated;

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-4000-a000-00000000000a', 'a@test.kodim.uz', false),
  ('00000000-0000-4000-a000-00000000000b', 'b@test.kodim.uz', false),
  ('00000000-0000-4000-a000-0000000000e1', null, true);
insert into public.teachers (id, name, email) values
  ('00000000-0000-4000-a000-00000000000a', 'TEST A', 'a@test.kodim.uz'),
  ('00000000-0000-4000-a000-00000000000b', 'TEST B', 'b@test.kodim.uz')
on conflict (id) do update set name = excluded.name;
insert into public.exams (id, teacher_id, title, status, duration_min) values
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-00000000000a', '[TEST] A', 'RUNNING', 10),
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-00000000000b', '[TEST] B', 'RUNNING', 10);
insert into public.tasks (exam_id, "order", title, type) values ('00000000-0000-4000-b000-0000000000a1', 1, 'T', 'EXERCISE');
insert into public.attempts (id, exam_id, student_uid, student_name, status, teacher_score) values
  ('00000000-0000-4000-c000-0000000000a1', '00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-0000000000e1', 'TEST Ali', 'WORKING', 70),
  ('00000000-0000-4000-c000-0000000000b1', '00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-0000000000e1', 'TEST Vali', 'WORKING', 50);
insert into public.events (attempt_id, exam_id, type, severity) values
  ('00000000-0000-4000-c000-0000000000a1', '00000000-0000-4000-b000-0000000000a1', 'FOCUS_LOST', 'INFO'),
  ('00000000-0000-4000-c000-0000000000a1', '00000000-0000-4000-b000-0000000000a1', 'TERMINAL_COMMAND', 'INFO'),
  ('00000000-0000-4000-c000-0000000000a1', '00000000-0000-4000-b000-0000000000a1', 'BLOCKED_COMMAND', 'INFO');
insert into public.penalties (attempt_id, points, reason, teacher_id) values
  ('00000000-0000-4000-c000-0000000000a1', 5, 'TEST', '00000000-0000-4000-a000-00000000000a'),
  ('00000000-0000-4000-c000-0000000000a1', 10, 'TEST', '00000000-0000-4000-a000-00000000000a');

select pg_temp.login('00000000-0000-4000-a000-00000000000a');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.attempt_summaries) = 1, 'A faqat o''z ishini ko''radi';
  assert (select penalty_total from public.attempt_summaries) = 15, 'jarimalar yig''indisi';
  assert (select warning_count from public.attempt_summaries) = 2, 'WARN+DANGER soni (TERMINAL_COMMAND INFO)';
  assert (select final_score from public.attempt_summaries) = 55, 'yakuniy = 70 - 15';
  assert (select count(*) from public.exam_list) = 1, 'A faqat o''z imtihonini ko''radi';
  assert (select attempt_count || '/' || task_count || '/' || teacher_name from public.exam_list) = '1/1/TEST A', 'hisoblar va o''qituvchi';
end $$;
reset role;

select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ begin
  perform 1 from public.exam_list;
  raise exception 'anon view''ni ko''rdi';
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
