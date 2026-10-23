-- Kodim: ruxsatlar va RLS (MIGRATION-PLAN.md 3-bo'lim).
-- Holat o'zgartiruvchi amallar (ochish, boshlash, baholash, jarima, o'quvchi RPC'lari) — keyingi migratsiyalarda
-- `security definer` funksiyalar. Bu yerda: klient to'g'ridan-to'g'ri nimani o'qiy/yoza olishi.

-- ---------- Yordamchi funksiyalar ----------

create function public.is_active_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teachers t where t.id = (select auth.uid()) and not t.disabled
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teachers t where t.id = (select auth.uid()) and t.role = 'ADMIN' and not t.disabled
  );
$$;

/** Imtihon shu o'qituvchiniki (yoki admin). Bloklangan o'qituvchi hech narsa ko'rmaydi. */
create function public.owns_exam(p_exam_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.exams e
    join public.teachers t on t.id = (select auth.uid()) and not t.disabled
    where e.id = p_exam_id and (e.teacher_id = t.id or t.role = 'ADMIN')
  );
$$;

create function public.owns_attempt(p_attempt_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.owns_exam((select a.exam_id from public.attempts a where a.id = p_attempt_id));
$$;

/** Ish joriy (anonim) o'quvchiniki — attempts RLS'siz tekshiruv. */
create function public.is_own_attempt(p_attempt_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attempts a where a.id = p_attempt_id and a.student_uid = (select auth.uid()));
$$;

revoke execute on function public.is_active_teacher(), public.is_admin(), public.owns_exam(uuid), public.owns_attempt(uuid),
  public.is_own_attempt(uuid) from public, anon;
grant execute on function public.is_active_teacher(), public.is_admin(), public.owns_exam(uuid), public.owns_attempt(uuid),
  public.is_own_attempt(uuid) to authenticated;

-- ---------- Yakuniy ball (shared/score.ts → computeFinalScore bilan bir xil, test bilan solishtiriladi) ----------

create function public.final_score(a public.attempts) returns int
language sql stable set search_path = '' as $$
  select case
    when a.status = 'ANNULLED' then 0
    else greatest(0, coalesce(a.teacher_score, a.ai_score, 0)
      - coalesce((select sum(p.points)::int from public.penalties p where p.attempt_id = a.id), 0))
  end;
$$;
revoke execute on function public.final_score(public.attempts) from public, anon;
grant execute on function public.final_score(public.attempts) to authenticated;

-- ---------- Jadval huquqlari (Supabase standart "grant all" o'rniga aniq ro'yxat) ----------

revoke all on all tables in schema public from anon, authenticated;

grant select on public.teachers to authenticated;
grant update (name) on public.teachers to authenticated;

grant select, delete on public.exams to authenticated;
-- status, code, started_at, ends_at — faqat RPC orqali
grant insert (teacher_id, title, duration_min, template, starter_files, reference_files, criteria, ai_enabled,
  ai_model, allowed_packages, allowed_commands, allowed_shells, readonly_files) on public.exams to authenticated;
grant update (title, duration_min, template, starter_files, reference_files, criteria, ai_enabled,
  ai_model, allowed_packages, allowed_commands, allowed_shells, readonly_files) on public.exams to authenticated;

grant select, insert, update, delete on public.tasks to authenticated;

-- Yozish faqat RPC orqali (baholash, jarima, sync, eventlar)
grant select on public.attempts, public.attempt_files, public.events, public.penalties,
  public.event_types, public.figma_caches, public.figma_images to authenticated;

-- ---------- RLS ----------

alter table public.teachers enable row level security;
alter table public.exams enable row level security;
alter table public.tasks enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_files enable row level security;
alter table public.event_types enable row level security;
alter table public.events enable row level security;
alter table public.penalties enable row level security;
alter table public.figma_caches enable row level security;
alter table public.figma_images enable row level security;
alter table public.rate_limits enable row level security; -- siyosat yo'q: faqat security definer funksiyalar

create policy teachers_select on public.teachers for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy teachers_update_self on public.teachers for update to authenticated
  using (id = (select auth.uid()) and not disabled)
  with check (id = (select auth.uid()));

create policy exams_select on public.exams for select to authenticated
  using ((select public.owns_exam(id)));
create policy exams_insert on public.exams for insert to authenticated
  with check (teacher_id = (select auth.uid()) and (select public.is_active_teacher()));
create policy exams_update on public.exams for update to authenticated
  using ((select public.owns_exam(id)))
  with check ((select public.owns_exam(id)));
create policy exams_delete on public.exams for delete to authenticated
  using ((select public.owns_exam(id)) and status in ('DRAFT', 'FINISHED'));

create policy tasks_select on public.tasks for select to authenticated
  using ((select public.owns_exam(exam_id)));
create policy tasks_write on public.tasks for all to authenticated
  using ((select public.owns_exam(exam_id))
    and exists (select 1 from public.exams e where e.id = exam_id and e.status = 'DRAFT'))
  with check ((select public.owns_exam(exam_id))
    and exists (select 1 from public.exams e where e.id = exam_id and e.status = 'DRAFT'));

-- O'quvchi attempts jadvalini to'g'ridan-to'g'ri ko'rmaydi (baholar yashirin) — holatni RPC beradi.
create policy attempts_select on public.attempts for select to authenticated
  using ((select public.owns_exam(exam_id)));

create policy attempt_files_select on public.attempt_files for select to authenticated
  using ((select public.owns_attempt(attempt_id)) or (select public.is_own_attempt(attempt_id)));

create policy event_types_select on public.event_types for select to authenticated using (true);

create policy events_select on public.events for select to authenticated
  using ((select public.owns_exam(exam_id)));

create policy penalties_select on public.penalties for select to authenticated
  using ((select public.owns_attempt(attempt_id)));

create policy figma_caches_select on public.figma_caches for select to authenticated
  using (teacher_id = (select auth.uid()) and (select public.is_active_teacher()));
create policy figma_images_select on public.figma_images for select to authenticated
  using (exists (
    select 1 from public.figma_caches c
    where c.id = cache_id and c.teacher_id = (select auth.uid()) and (select public.is_active_teacher())
  ));

-- ---------- Triggerlar ----------

/** Imtihon faqat DRAFT holatida tahrirlanadi (klient roli uchun; RPC'lar egasi nomidan ishlaydi). */
create function public.exams_guard_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and old.status <> 'DRAFT' then
    raise exception 'EXAM_NOT_EDITABLE' using errcode = 'P0001', hint = 'Imtihonni faqat qoralama holatida tahrirlash mumkin';
  end if;
  if new.teacher_id <> old.teacher_id then
    raise exception 'EXAM_OWNER_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger exams_guard_update before update on public.exams
  for each row execute function public.exams_guard_update();

/** Event darajasi va imtihoni klientdan emas, bazadan olinadi. */
create function public.events_fill() returns trigger
language plpgsql set search_path = '' as $$
begin
  select et.severity into strict new.severity from public.event_types et where et.type = new.type;
  select a.exam_id into strict new.exam_id from public.attempts a where a.id = new.attempt_id;
  return new;
end;
$$;
create trigger events_fill before insert on public.events
  for each row execute function public.events_fill();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger figma_caches_touch before update on public.figma_caches
  for each row execute function public.touch_updated_at();

revoke execute on function public.exams_guard_update(), public.events_fill(), public.touch_updated_at() from public, anon, authenticated;
