-- Sinov ma'lumotlarini o'chirish (MIGRATION-PLAN.md 12-bo'lim, 1-qaror). Faqat belgililar:
--   o'qituvchilar  — email `*@test.kodim.uz` (auth.users bilan; imtihonlari, figma kesh — cascade)
--   imtihonlar     — nomi `[TEST] …` (topshiriqlar, ishlar, fayllar, eventlar, jarimalar — cascade)
--   o'quvchilar    — ismi `TEST …` (har qanday imtihonda) va ularning anonim auth foydalanuvchilari
--
-- Standart rejim — DRY RUN: hammasi tranzaksiyada bajariladi, nima o'chishi sanab ko'rsatiladi va ROLLBACK.
-- Haqiqatan o'chirish: oxirgi qatordagi `rollback;` ni `commit;` ga almashtiring.
-- Storage obyektlari SQL bilan o'chirilmaydi (Supabase taqiqlaydi) — ro'yxati chiqariladi, Storage API/Dashboard'da o'chiring.
begin;

create temp table cleanup_teachers on commit drop as
  select t.id, t.figma_secret_id from public.teachers t where t.email ilike '%@test.kodim.uz';

create temp table cleanup_exams on commit drop as
  select e.id from public.exams e
  where e.title like '[TEST]%' or e.teacher_id in (select id from cleanup_teachers);

create temp table cleanup_attempts on commit drop as
  select a.id, a.student_uid from public.attempts a
  where a.exam_id in (select id from cleanup_exams) or a.student_name ilike 'TEST %';

-- Anonim o'quvchi foydalanuvchilari: faqat sinov ishlari bo'lganlari (haqiqiy ishi bor bo'lsa qoladi).
create temp table cleanup_students on commit drop as
  select distinct c.student_uid as id from cleanup_attempts c
  join auth.users u on u.id = c.student_uid and u.is_anonymous
  where not exists (
    select 1 from public.attempts a where a.student_uid = c.student_uid and a.id not in (select id from cleanup_attempts)
  );

select 'teachers' as jadval, count(*) as soni from cleanup_teachers
union all select 'exams', count(*) from cleanup_exams
union all select 'attempts', count(*) from cleanup_attempts
union all select 'events', count(*) from public.events where attempt_id in (select id from cleanup_attempts)
union all select 'penalties', count(*) from public.penalties where attempt_id in (select id from cleanup_attempts)
union all select 'attempt_files', count(*) from public.attempt_files where attempt_id in (select id from cleanup_attempts)
union all select 'figma_caches', count(*) from public.figma_caches where teacher_id in (select id from cleanup_teachers)
union all select 'auth.users (o''qituvchi)', count(*) from cleanup_teachers
union all select 'auth.users (anonim o''quvchi)', count(*) from cleanup_students;

-- Storage'da o'chirilishi kerak bo'lgan papkalar (exam-assets/<examId>/…, figma/<teacherId>/…)
select 'exam-assets/' || id || '/' as storage_prefix from cleanup_exams
union all select 'figma/' || id || '/' from cleanup_teachers;

-- Vault sirlari (o'qituvchi Figma tokeni) — Vault mavjud bo'lsa.
do $$
begin
  if to_regclass('vault.secrets') is not null then
    execute 'delete from vault.secrets where id in (select figma_secret_id from cleanup_teachers where figma_secret_id is not null)';
  end if;
  if to_regclass('public.audit_log') is not null then
    execute 'delete from public.audit_log where actor_id in (select id from cleanup_teachers)';
  end if;
end $$;

delete from public.attempts where id in (select id from cleanup_attempts);
delete from public.exams where id in (select id from cleanup_exams);
delete from auth.users where id in (select id from cleanup_teachers) or id in (select id from cleanup_students);

-- Tekshiruv: belgili qatorlar qolmadi (hammasi 0 bo'lishi kerak)
select
  (select count(*) from public.teachers where email ilike '%@test.kodim.uz') as teachers_qoldi,
  (select count(*) from public.exams where title like '[TEST]%') as exams_qoldi,
  (select count(*) from public.attempts where student_name ilike 'TEST %') as attempts_qoldi;

rollback;
