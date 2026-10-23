-- Kodim: save_exam va delete_penalty (5-faza). Supabase MCP `delete` bor funksiyalarni avtomatik rad etadi —
-- foydalanuvchi SQL Editor'da bajaradi (keyin migratsiya tarixiga qo'shiladi). Qolgan RPC'lar — exam_rpcs.

/**
 * Imtihonni yaratish (p_exam_id null) yoki tahrirlash (faqat DRAFT) + topshiriqlarni almashtirish — bitta tranzaksiyada.
 * Panel ExamInput (zod) bilan tekshiradi va starter_files/readonly_files ni shared/examFiles.ts bilan tayyorlaydi.
 * p_exam kalitlari ustun nomlari bilan (snake_case); p_tasks: [{title, description, type, figma_url, images, expected_output}].
 */
create function public.save_exam(p_exam_id uuid, p_exam jsonb, p_tasks jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_exam public.exams;
begin
  if not private.is_active_teacher() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) = 0 then
    raise exception 'TASKS_REQUIRED' using errcode = 'P0001';
  end if;

  if p_exam_id is null then
    insert into public.exams (teacher_id, title, duration_min, template, starter_files, reference_files, criteria,
      ai_enabled, ai_model, allowed_packages, allowed_commands, allowed_shells, readonly_files)
    values (
      (select auth.uid()),
      p_exam ->> 'title',
      (p_exam ->> 'duration_min')::int,
      coalesce(p_exam ->> 'template', 'EMPTY')::public.exam_template,
      coalesce(p_exam -> 'starter_files', '[]'),
      coalesce(p_exam -> 'reference_files', '[]'),
      coalesce(p_exam -> 'criteria', '[]'),
      coalesce((p_exam ->> 'ai_enabled')::boolean, false),
      coalesce(p_exam ->> 'ai_model', 'DEFAULT'),
      coalesce(p_exam -> 'allowed_packages', '[]'),
      coalesce(p_exam -> 'allowed_commands', '[]'),
      coalesce(p_exam -> 'allowed_shells', '[]'),
      coalesce(p_exam -> 'readonly_files', '[]')
    )
    returning id into v_id;
  else
    v_exam := private.owned_exam_for_update(p_exam_id);
    if v_exam.status <> 'DRAFT' then
      raise exception 'EXAM_NOT_EDITABLE' using errcode = 'P0001';
    end if;
    update public.exams set
      title = p_exam ->> 'title',
      duration_min = (p_exam ->> 'duration_min')::int,
      template = coalesce(p_exam ->> 'template', 'EMPTY')::public.exam_template,
      starter_files = coalesce(p_exam -> 'starter_files', '[]'),
      reference_files = coalesce(p_exam -> 'reference_files', '[]'),
      criteria = coalesce(p_exam -> 'criteria', '[]'),
      ai_enabled = coalesce((p_exam ->> 'ai_enabled')::boolean, false),
      ai_model = coalesce(p_exam ->> 'ai_model', 'DEFAULT'),
      allowed_packages = coalesce(p_exam -> 'allowed_packages', '[]'),
      allowed_commands = coalesce(p_exam -> 'allowed_commands', '[]'),
      allowed_shells = coalesce(p_exam -> 'allowed_shells', '[]'),
      readonly_files = coalesce(p_exam -> 'readonly_files', '[]')
    where id = p_exam_id;
    v_id := p_exam_id;
    delete from public.tasks where exam_id = v_id;
  end if;

  insert into public.tasks (exam_id, "order", title, description, type, figma_url, images, expected_output)
  select v_id, t.ord::int, t.v ->> 'title', coalesce(t.v ->> 'description', ''), (t.v ->> 'type')::public.task_type,
    nullif(t.v ->> 'figma_url', ''), coalesce(t.v -> 'images', '[]'), nullif(t.v ->> 'expected_output', '')
  from jsonb_array_elements(p_tasks) with ordinality as t(v, ord);

  return v_id;
end;
$$;


create function public.delete_penalty(p_penalty_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_attempt uuid;
begin
  select attempt_id into v_attempt from public.penalties where id = p_penalty_id;
  if v_attempt is null or not private.owns_attempt(v_attempt) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  delete from public.penalties where id = p_penalty_id;
  -- Panel kartasi yangilansin (realtime migratsiyasidagi yordamchi; jarima qo'shilganda — trigger).
  perform realtime.send(jsonb_build_object('examId', e.exam_id, 'attempt', private.attempt_summary_json(v_attempt)),
    'attempt:update', 'exam:' || e.exam_id, true)
  from public.attempts e where e.id = v_attempt;
end;
$$;

revoke execute on function public.save_exam(uuid, jsonb, jsonb), public.delete_penalty(uuid) from public, anon;
grant execute on function public.save_exam(uuid, jsonb, jsonb), public.delete_penalty(uuid) to authenticated;
