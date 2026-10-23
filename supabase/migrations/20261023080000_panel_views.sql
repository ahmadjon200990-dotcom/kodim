-- Kodim: panel ro'yxatlari uchun view'lar (5-faza) — N+1 so'rovsiz. security_invoker: RLS chaqiruvchi nomidan ishlaydi.

create view public.attempt_summaries with (security_invoker = true) as
select
  a.id, a.exam_id, a.student_name, a.status, a.connected, a.extra_minutes, a.last_seen_at, a.submitted_at,
  a.ai_score, a.ai_error, a.teacher_score, a.teacher_comment, a.teacher_criteria, a.graded_by, a.created_at,
  coalesce((select sum(p.points) from public.penalties p where p.attempt_id = a.id), 0)::int as penalty_total,
  (select count(*) from public.events e where e.attempt_id = a.id and e.severity in ('WARN', 'DANGER'))::int as warning_count,
  public.final_score(a) as final_score
from public.attempts a;

create view public.exam_list with (security_invoker = true) as
select
  e.id, e.title, e.status, e.code, e.duration_min, e.started_at, e.ends_at, e.created_at, e.teacher_id,
  t.name as teacher_name,
  (select count(*) from public.attempts a where a.exam_id = e.id)::int as attempt_count,
  (select count(*) from public.tasks k where k.exam_id = e.id)::int as task_count
from public.exams e
left join public.teachers t on t.id = e.teacher_id;

revoke all on public.attempt_summaries, public.exam_list from anon, authenticated;
grant select on public.attempt_summaries, public.exam_list to authenticated;
