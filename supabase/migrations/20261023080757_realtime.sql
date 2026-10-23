-- Kodim: Realtime (MIGRATION-PLAN.md 7-faza). Barcha kanallar private; xabarlarni faqat DB trigger'lari yuboradi
-- (realtime.messages'ga INSERT policy yo'q — klient broadcast qila olmaydi).
--   exam:<id>            — o'qituvchi: attempt:update {examId, attempt: AttemptSummary}, event:new {examId, studentName, event},
--                          exam:update {exam: ExamLive} (eski socket /teacher shakllari)
--   exam:<id>:students   — o'quvchilar: lobby:count {joinedCount}, nudge {} (holat o'zgardi — heartbeat qiling)
--   attempt:<id>         — bitta o'quvchi: nudge {} (vaqt qo'shildi, topshirish boshlandi, bekor qilindi ...)

-- ---------- Yordamchilar ----------

/** Mavzudan uuid (n-qism); yaroqsiz bo'lsa null. */
create function private.topic_uuid(p_topic text, p_n int) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(p_topic, ':', p_n) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_topic, ':', p_n)::uuid end;
$$;

/** Joriy foydalanuvchi shu imtihonning o'quvchisimi (attempts RLS'siz). */
create function private.is_exam_student(p_exam_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attempts a where a.exam_id = p_exam_id and a.student_uid = (select auth.uid()));
$$;

create function private.attempt_summary_json(p_attempt_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'studentName', s.student_name, 'status', s.status, 'connected', s.connected,
    'extraMinutes', s.extra_minutes, 'lastSeenAt', s.last_seen_at, 'submittedAt', s.submitted_at,
    'aiScore', s.ai_score, 'aiError', s.ai_error, 'teacherScore', s.teacher_score, 'gradedBy', s.graded_by,
    'penaltyTotal', s.penalty_total, 'warningCount', s.warning_count, 'finalScore', s.final_score)
  from public.attempt_summaries s where s.id = p_attempt_id;
$$;

/** ExamLive: ExamPublic + kod, vaqtlar, AI. */
create function private.exam_live_json(e public.exams) returns jsonb
language sql stable set search_path = '' as $$
  select private.exam_public(e) || jsonb_build_object(
    'code', e.code, 'startedAt', e.started_at, 'endsAt', e.ends_at, 'aiEnabled', e.ai_enabled);
$$;

-- ---------- Trigger'lar ----------

create function private.broadcast_attempt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Heartbeat (faqat last_seen_at) panelga yuborilmaydi — Free plan xabar limiti.
  if tg_op = 'INSERT' or (old.status, old.connected, old.extra_minutes, old.submitted_at, old.teacher_score, old.ai_score,
      old.graded_by, old.ending_at, old.student_name, old.teacher_comment)
    is distinct from (new.status, new.connected, new.extra_minutes, new.submitted_at, new.teacher_score, new.ai_score,
      new.graded_by, new.ending_at, new.student_name, new.teacher_comment) then
    perform realtime.send(jsonb_build_object('examId', new.exam_id, 'attempt', private.attempt_summary_json(new.id)),
      'attempt:update', 'exam:' || new.exam_id, true);
  end if;
  if tg_op = 'INSERT' then
    perform realtime.send(jsonb_build_object('joinedCount', (select count(*) from public.attempts a where a.exam_id = new.exam_id)),
      'lobby:count', 'exam:' || new.exam_id || ':students', true);
  elsif (old.status, old.extra_minutes, old.ending_at, old.student_uid) is distinct from (new.status, new.extra_minutes, new.ending_at, new.student_uid) then
    perform realtime.send('{}'::jsonb, 'nudge', 'attempt:' || new.id, true);
  end if;
  return null;
end;
$$;
create trigger attempts_broadcast after insert or update on public.attempts
  for each row execute function private.broadcast_attempt();

create function private.broadcast_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object(
      'examId', new.exam_id,
      'studentName', (select a.student_name from public.attempts a where a.id = new.attempt_id),
      'event', jsonb_build_object('id', new.id, 'attemptId', new.attempt_id, 'type', new.type, 'severity', new.severity,
        'details', new.details, 'createdAt', new.created_at)),
    'event:new', 'exam:' || new.exam_id, true);
  -- Ogohlantirishlar soni kartada yangilansin.
  if tg_op = 'INSERT' and new.severity <> 'INFO' then
    perform realtime.send(jsonb_build_object('examId', new.exam_id, 'attempt', private.attempt_summary_json(new.attempt_id)),
      'attempt:update', 'exam:' || new.exam_id, true);
  end if;
  return null;
end;
$$;
create trigger events_broadcast after insert or update on public.events
  for each row execute function private.broadcast_event();

create function private.broadcast_exam() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.status, old.code, old.started_at, old.ends_at) is distinct from (new.status, new.code, new.started_at, new.ends_at) then
    perform realtime.send(jsonb_build_object('exam', private.exam_live_json(new)), 'exam:update', 'exam:' || new.id, true);
    perform realtime.send('{}'::jsonb, 'nudge', 'exam:' || new.id || ':students', true);
  end if;
  return null;
end;
$$;
create trigger exams_broadcast after update on public.exams
  for each row execute function private.broadcast_exam();

create function private.broadcast_penalty() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt uuid := coalesce(new.attempt_id, old.attempt_id);
  v_exam uuid := (select a.exam_id from public.attempts a where a.id = v_attempt);
begin
  if v_exam is not null then
    perform realtime.send(jsonb_build_object('examId', v_exam, 'attempt', private.attempt_summary_json(v_attempt)),
      'attempt:update', 'exam:' || v_exam, true);
  end if;
  return null;
end;
$$;
create trigger penalties_broadcast after insert on public.penalties
  for each row execute function private.broadcast_penalty();

revoke execute on function private.topic_uuid(text, int), private.attempt_summary_json(uuid), private.exam_live_json(public.exams),
  private.broadcast_attempt(), private.broadcast_event(), private.broadcast_exam(), private.broadcast_penalty()
from public, anon, authenticated;
revoke execute on function private.is_exam_student(uuid) from public, anon;
grant execute on function private.is_exam_student(uuid), private.topic_uuid(text, int) to authenticated;

-- ---------- Kanal ruxsatlari (private kanalga obuna = realtime.messages SELECT) ----------

create policy kodim_channels_read on realtime.messages for select to authenticated
using (
  case
    when (select realtime.topic()) ~ '^exam:[0-9a-f-]{36}$'
      then (select private.owns_exam(private.topic_uuid(realtime.topic(), 2)))
    when (select realtime.topic()) ~ '^exam:[0-9a-f-]{36}:students$'
      then (select private.is_exam_student(private.topic_uuid(realtime.topic(), 2)))
    when (select realtime.topic()) ~ '^attempt:[0-9a-f-]{36}$'
      then (select private.is_own_attempt(private.topic_uuid(realtime.topic(), 2)))
    else false
  end
);
