-- Kodim: o'qituvchi RPC'lari (MIGRATION-PLAN.md 5-faza) — eski REST yo'llari bilan bir xil qoidalar
-- (apps/server/src/routes/exams.ts, attempts.ts). Xatolar: `raise exception '<KOD>'` — panel `uz.ts` da o'zbekchaga.
-- Kodlar: NOT_FOUND, NOT_AUTHORIZED, EXAM_NOT_EDITABLE, EXAM_MUST_BE_DRAFT, EXAM_MUST_BE_LOBBY, EXAM_MUST_BE_RUNNING,
-- TASKS_REQUIRED, CODE_GENERATION_FAILED, INVALID_MINUTES, ATTEMPT_NOT_IN_EXAM, EVENT_NOT_FOUND, ALREADY_ANNULLED,
-- NOT_ANNULLED, UNKNOWN_CRITERION, CRITERION_OVER_WEIGHT.
-- Jonli xabarlar (Realtime broadcast) — 7-faza trigger'lari; 15 s topshirish — 8-faza (pg_cron).

-- PUBLIC uchun EXECUTE — Postgres'ning global standarti; sxema darajasidagi default privileges uni olib tashlay olmaydi.
-- Endi har yangi funksiya hech kimga ochiq emas, faqat aniq GRANT bilan.
alter default privileges for role postgres revoke execute on functions from public;

-- Boshlang'ich fayllar serverda (start/late-join) ham yoziladi — xeshni klient hisoblaydi, server yozganda bo'sh satr.
alter table public.attempt_files alter column sha1 set default '';

/** Joriy o'qituvchiga tegishli imtihon (qulf bilan). Begona yoki yo'q bo'lsa — NOT_FOUND (mavjudligi oshkor qilinmaydi). */
create function private.owned_exam_for_update(p_exam_id uuid) returns public.exams
language plpgsql security definer set search_path = '' as $$
declare
  v public.exams;
begin
  if not private.owns_exam(p_exam_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v from public.exams where id = p_exam_id for update;
  return v;
end;
$$;

create function private.owned_attempt_for_update(p_attempt_id uuid) returns public.attempts
language plpgsql security definer set search_path = '' as $$
declare
  v public.attempts;
begin
  if not private.owns_attempt(p_attempt_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v from public.attempts where id = p_attempt_id for update;
  return v;
end;
$$;

-- ---------- Imtihon ----------


/** Kutish xonasini ochish: DRAFT → LOBBY, faol imtihonlar orasida takrorlanmas 6 xonali kod. */
create function public.open_exam(p_exam_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_exam public.exams;
  v_code text;
begin
  v_exam := private.owned_exam_for_update(p_exam_id);
  if v_exam.status <> 'DRAFT' then
    raise exception 'EXAM_MUST_BE_DRAFT' using errcode = 'P0001';
  end if;
  for i in 1..20 loop
    v_code := (100000 + floor(random() * 900000))::int::text;
    begin
      update public.exams set status = 'LOBBY', code = v_code where id = p_exam_id;
      return v_code;
    exception when unique_violation then
      -- band kod — qayta urinish
    end;
  end loop;
  raise exception 'CODE_GENERATION_FAILED' using errcode = 'P0001';
end;
$$;

/** Boshlash: LOBBY → RUNNING; kutayotganlar WORKING bo'ladi va boshlang'ich fayllarni oladi. */
create function public.start_exam(p_exam_id uuid) returns public.exams
language plpgsql security definer set search_path = '' as $$
declare
  v_exam public.exams;
begin
  v_exam := private.owned_exam_for_update(p_exam_id);
  if v_exam.status <> 'LOBBY' then
    raise exception 'EXAM_MUST_BE_LOBBY' using errcode = 'P0001';
  end if;
  update public.exams
  set status = 'RUNNING', started_at = now(), ends_at = now() + make_interval(mins => duration_min)
  where id = p_exam_id
  returning * into v_exam;

  insert into public.attempt_files (attempt_id, path, content, encoding)
  select a.id, f ->> 'path', f ->> 'content', f ->> 'encoding'
  from public.attempts a
  cross join lateral jsonb_array_elements(v_exam.starter_files) f
  where a.exam_id = p_exam_id and a.status = 'JOINED'
  on conflict (attempt_id, path) do nothing;

  update public.attempts set status = 'WORKING' where exam_id = p_exam_id and status = 'JOINED';
  return v_exam;
end;
$$;

/** Vaqt qo'shish: hammaga (exams.ends_at) yoki bitta o'quvchiga (attempts.extra_minutes). */
create function public.extend_exam(p_exam_id uuid, p_minutes int, p_attempt_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_exam public.exams;
  v_extra int;
begin
  v_exam := private.owned_exam_for_update(p_exam_id);
  if v_exam.status <> 'RUNNING' or v_exam.ends_at is null then
    raise exception 'EXAM_MUST_BE_RUNNING' using errcode = 'P0001';
  end if;
  if p_minutes is null or p_minutes not between 1 and 180 then
    raise exception 'INVALID_MINUTES' using errcode = 'P0001';
  end if;
  if p_attempt_id is not null then
    update public.attempts set extra_minutes = extra_minutes + p_minutes
    where id = p_attempt_id and exam_id = p_exam_id
    returning extra_minutes into v_extra;
    if not found then
      raise exception 'ATTEMPT_NOT_IN_EXAM' using errcode = 'P0002';
    end if;
    return jsonb_build_object('attempt_id', p_attempt_id, 'extra_minutes', v_extra, 'ends_at', v_exam.ends_at);
  end if;
  update public.exams set ends_at = ends_at + make_interval(mins => p_minutes) where id = p_exam_id
  returning * into v_exam;
  return jsonb_build_object('ends_at', v_exam.ends_at);
end;
$$;

/** Muddatidan oldin tugatish: ends_at = hozir, ishlayotganlar uchun 15 s topshirish boshlanadi (8-faza tick). */
create function public.finish_exam(p_exam_id uuid) returns public.exams
language plpgsql security definer set search_path = '' as $$
declare
  v_exam public.exams;
begin
  v_exam := private.owned_exam_for_update(p_exam_id);
  if v_exam.status <> 'RUNNING' then
    raise exception 'EXAM_MUST_BE_RUNNING' using errcode = 'P0001';
  end if;
  update public.exams set ends_at = now() where id = p_exam_id returning * into v_exam;
  update public.attempts set ending_at = now()
  where exam_id = p_exam_id and status = 'WORKING' and ending_at is null;
  return v_exam;
end;
$$;

-- ---------- Ish (attempt) ----------

create function public.add_penalty(p_attempt_id uuid, p_points int, p_reason text, p_event_id uuid default null)
returns public.penalties
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.penalties;
begin
  perform private.owned_attempt_for_update(p_attempt_id);
  if p_event_id is not null and not exists (
    select 1 from public.events e where e.id = p_event_id and e.attempt_id = p_attempt_id
  ) then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.penalties (attempt_id, points, reason, event_id, teacher_id)
  values (p_attempt_id, p_points, trim(p_reason), p_event_id, (select auth.uid()))
  returning * into v_p;
  return v_p;
end;
$$;


create function public.annul_attempt(p_attempt_id uuid) returns public.attempts
language plpgsql security definer set search_path = '' as $$
declare
  v public.attempts;
begin
  v := private.owned_attempt_for_update(p_attempt_id);
  if v.status = 'ANNULLED' then
    raise exception 'ALREADY_ANNULLED' using errcode = 'P0001';
  end if;
  update public.attempts set status = 'ANNULLED' where id = p_attempt_id returning * into v;
  return v;
end;
$$;

/** Bekor qilishni qaytarish: imtihon davom etsa va topshirmagan bo'lsa — WORKING, aks holda SUBMITTED. */
create function public.unannul_attempt(p_attempt_id uuid) returns public.attempts
language plpgsql security definer set search_path = '' as $$
declare
  v public.attempts;
  v_status public.exam_status;
begin
  v := private.owned_attempt_for_update(p_attempt_id);
  if v.status <> 'ANNULLED' then
    raise exception 'NOT_ANNULLED' using errcode = 'P0001';
  end if;
  select status into v_status from public.exams where id = v.exam_id;
  update public.attempts
  set status = case when v.submitted_at is not null or v_status <> 'RUNNING' then 'SUBMITTED' else 'WORKING' end::public.attempt_status
  where id = p_attempt_id returning * into v;
  return v;
end;
$$;

/**
 * O'qituvchi bahosi (GradeInput): {teacherScore?: int|null, teacherComment?: text|null, criteria?: [{name, score, comment}]}.
 * Kalit yo'q — o'zgarmaydi; teacherScore: null — o'qituvchi bahosi olib tashlanadi (AI bahosi bo'lsa — AI, aks holda NONE).
 * criteria berilib teacherScore berilmasa — ball mezonlar yig'indisi.
 */
create function public.grade_attempt(p_attempt_id uuid, p_input jsonb) returns public.attempts
language plpgsql security definer set search_path = '' as $$
declare
  v public.attempts;
  v_criteria jsonb;
  v_has_score boolean := p_input ? 'teacherScore';
  v_score int := (p_input ->> 'teacherScore')::int;
  v_clearing boolean;
  c jsonb;
  d jsonb;
begin
  v := private.owned_attempt_for_update(p_attempt_id);
  if v_score is not null and v_score not between 0 and 100 then
    raise exception 'INVALID_SCORE' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_input -> 'criteria') = 'array' then
    v_criteria := '[]';
    for c in select * from jsonb_array_elements(p_input -> 'criteria') loop
      d := null;
      select e into d from public.exams x, jsonb_array_elements(x.criteria) e
      where x.id = v.exam_id and e ->> 'name' = c ->> 'name';
      if d is null then
        raise exception 'UNKNOWN_CRITERION' using errcode = 'P0001', detail = c ->> 'name';
      end if;
      if (c ->> 'score')::int > (d ->> 'weight')::int or (c ->> 'score')::int < 0 then
        raise exception 'CRITERION_OVER_WEIGHT' using errcode = 'P0001', detail = c ->> 'name';
      end if;
      v_criteria := v_criteria || jsonb_build_object('name', c ->> 'name', 'weight', (d ->> 'weight')::int,
        'score', (c ->> 'score')::int, 'comment', coalesce(c ->> 'comment', ''));
    end loop;
    if not v_has_score then
      select sum((x ->> 'score')::int) into v_score from jsonb_array_elements(v_criteria) x;
      v_has_score := true;
    end if;
  end if;
  v_clearing := v_has_score and v_score is null;

  update public.attempts set
    teacher_score = case when v_has_score then v_score else teacher_score end,
    teacher_comment = case when p_input ? 'teacherComment' then p_input ->> 'teacherComment' else teacher_comment end,
    teacher_criteria = case when v_clearing then null when v_criteria is not null then v_criteria else teacher_criteria end,
    graded_by = case
      when v_clearing then (case when ai_score is not null then 'AI' else 'NONE' end)::public.graded_by
      else 'TEACHER' end
  where id = p_attempt_id
  returning * into v;
  return v;
end;
$$;

revoke execute on function private.owned_exam_for_update(uuid), private.owned_attempt_for_update(uuid) from public, anon, authenticated;
revoke execute on function
  public.open_exam(uuid), public.start_exam(uuid),
  public.extend_exam(uuid, int, uuid), public.finish_exam(uuid),
  public.add_penalty(uuid, int, text, uuid),
  public.annul_attempt(uuid), public.unannul_attempt(uuid), public.grade_attempt(uuid, jsonb)
from public, anon;
grant execute on function
  public.open_exam(uuid), public.start_exam(uuid),
  public.extend_exam(uuid, int, uuid), public.finish_exam(uuid),
  public.add_penalty(uuid, int, text, uuid),
  public.annul_attempt(uuid), public.unannul_attempt(uuid), public.grade_attempt(uuid, jsonb)
to authenticated;
