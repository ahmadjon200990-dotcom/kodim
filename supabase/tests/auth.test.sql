-- Auth trigger testi: birinchi kirish → TEACHER, anonim → o'qituvchi emas, oxirgi kirish yoziladi. ROLLBACK bilan.
begin;

insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-4000-a000-0000000000f1', 'Google.User@test.kodim.uz', false, '{"full_name": "TEST Google Foydalanuvchi"}'),
  ('00000000-0000-4000-a000-0000000000f2', 'parol@test.kodim.uz', false, '{}'),
  ('00000000-0000-4000-a000-0000000000f3', null, true, '{}');

do $$ begin
  assert (select name from public.teachers where id = '00000000-0000-4000-a000-0000000000f1') = 'TEST Google Foydalanuvchi', 'ism metadata dan';
  assert (select email from public.teachers where id = '00000000-0000-4000-a000-0000000000f1') = 'google.user@test.kodim.uz', 'email kichik harfda';
  assert (select role from public.teachers where id = '00000000-0000-4000-a000-0000000000f1') = 'TEACHER', 'birinchi kirish → TEACHER';
  assert (select name from public.teachers where id = '00000000-0000-4000-a000-0000000000f2') = 'parol', 'metadata yo''q → email boshi';
  assert not exists (select 1 from public.teachers where id = '00000000-0000-4000-a000-0000000000f3'), 'anonim o''quvchi o''qituvchi emas';
end $$;

update auth.users set last_sign_in_at = '2026-10-23 10:00+05' where id = '00000000-0000-4000-a000-0000000000f2';
do $$ begin
  assert (select last_login_at from public.teachers where id = '00000000-0000-4000-a000-0000000000f2') = '2026-10-23 10:00+05', 'oxirgi kirish';
end $$;

rollback;
