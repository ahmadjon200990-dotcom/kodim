-- Kodim: tasks — SELECT uchun bitta policy (advisor: multiple_permissive_policies). insert/update/delete alohida.
-- Eski `tasks_write` (for all) policy keyingi migratsiyada olib tashlanadi.
create policy tasks_insert on public.tasks for insert to authenticated
  with check ((select private.owns_exam(exam_id))
    and exists (select 1 from public.exams e where e.id = exam_id and e.status = 'DRAFT'));
create policy tasks_update on public.tasks for update to authenticated
  using ((select private.owns_exam(exam_id))
    and exists (select 1 from public.exams e where e.id = exam_id and e.status = 'DRAFT'))
  with check ((select private.owns_exam(exam_id))
    and exists (select 1 from public.exams e where e.id = exam_id and e.status = 'DRAFT'));
create policy tasks_delete on public.tasks for delete to authenticated
  using ((select private.owns_exam(exam_id))
    and exists (select 1 from public.exams e where e.id = exam_id and e.status = 'DRAFT'));
