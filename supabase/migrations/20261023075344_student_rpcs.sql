-- Kodim: o'quvchi RPC'lari (MIGRATION-PLAN.md 4/6-faza) — eski socket /student qoidalari bilan bir xil
-- (apps/server/src/realtime/student.ts). O'quvchi = anonim Supabase foydalanuvchisi (auth.uid() = attempts.student_uid).
-- sync_files (fayllarni o'chiradi) — student_rpcs_editor (SQL Editor). 15 s topshirish va uzilish — 8-faza (pg_cron).

-- ---------- Yordamchilar ----------

/** Server yozadigan event (daraja va exam_id — events_fill trigger'idan). */
create function private.add_event(p_attempt_id uuid, p_type text, p_details jsonb default '{}') returns uuid
language sql security definer set search_path = '' as $$
  insert into public.events (attempt_id, exam_id, type, severity, details)
  select p_attempt_id, a.exam_id, p_type, 'INFO', coalesce(p_details, '{}') from public.attempts a where a.id = p_attempt_id
  returning id;
$$;

/** Rate limit: oynada `p_limit` dan oshsa false; `p_block` berilsa shuncha vaqt bloklanadi. */
create function private.rl_hit(p_key text, p_limit int, p_window interval, p_block interval default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v private.rate_limits;
begin
  insert into private.rate_limits as r (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case when r.window_start + p_window < now() then 1 else r.count + 1 end,
    window_start = case when r.window_start + p_window < now() then now() else r.window_start end
  returning * into v;
  if v.count > p_limit then
    if p_block is not null then
      update private.rate_limits set blocked_until = now() + p_block where key = p_key;
    end if;
    return false;
  end if;
  return true;
end;
$$;

/** Blok tugashigacha qolgan soniyalar (0 — bloklanmagan). */
create function private.rl_blocked(p_key text) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(greatest(0, ceil(extract(epoch from (r.blocked_until - now()))))::int, 0)
  from private.rate_limits r where r.key = p_key
  union all select 0 limit 1;
$$;

/** So'rov IP manzili (PostgREST: Supabase gateway X-Forwarded-For'ning birinchisi). */
create function private.client_ip() returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(trim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), ''), 'unknown');
$$;

create function private.normalize_name(p_name text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'));
$$;

/** Joriy o'quvchining ishi (qulf bilan) — begona bo'lsa NOT_FOUND. */
create function private.own_attempt_for_update(p_attempt_id uuid) returns public.attempts
language plpgsql security definer set search_path = '' as $$
declare
  v public.attempts;
begin
  select * into v from public.attempts where id = p_attempt_id and student_uid = (select auth.uid()) for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

/** O'quvchiga ko'rinadigan imtihon (ExamPublic) — baholar, namuna, mezonlar yo'q. */
create function private.exam_public(e public.exams) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'title', e.title, 'durationMin', e.duration_min, 'template', e.template, 'status', e.status,
    'allowedPackages', e.allowed_packages, 'allowedCommands', e.allowed_commands, 'allowedShells', e.allowed_shells);
$$;

/** O'quvchi holati (StudentState): phase, joinedCount, endsAt (+extra), serverNow, ending, files (faqat WORKING). */
create function private.student_state(a public.attempts, p_with_files boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'phase', case a.status when 'JOINED' then 'LOBBY' when 'WORKING' then 'WORKING' else 'SUBMITTED' end,
    'joinedCount', (select count(*) from public.attempts x where x.exam_id = a.exam_id),
    'endsAt', e.ends_at + make_interval(mins => a.extra_minutes),
    'serverNow', now(),
    'ending', a.ending_at is not null,
    'files', case when p_with_files and a.status = 'WORKING' then
      coalesce(e.readonly_files, '[]') || coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('path', f.path, 'content', f.content, 'encoding', f.encoding)) order by f.path)
        from public.attempt_files f
        where f.attempt_id = a.id and not (f.path = 'savollar.md' or f.path = 'dizaynlar' or f.path like 'dizaynlar/%')
      ), '[]')
    end)
  from public.exams e where e.id = a.exam_id;
$$;

-- ---------- RPC'lar ----------

/**
 * Kirish: kod + ism + qurilma. Xatoda exception emas, {ok:false, error} — rate limit hisoblari saqlanib qolsin.
 * Xatolar: INVALID_INPUT, TOO_MANY {retryAfterSec}, BAD_CODE, NAME_TAKEN.
 */
create function public.student_join(p_code text, p_name text, p_device_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_ip text := private.client_ip();
  v_device_key text;
  v_blocked int;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_exam public.exams;
  v_attempt public.attempts;
  v_created boolean := false;
  v_by_name boolean := false;
  v_prev_device text;
  v_was_disconnected boolean;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if coalesce(p_code, '') !~ '^[0-9]{6}$' or length(v_name) not between 2 and 60
     or length(coalesce(trim(p_device_id), '')) not between 8 and 100 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_INPUT');
  end if;

  -- Kodni taxmin qilishdan himoya (eski lib/rateLimit.ts bilan bir xil sonlar)
  v_device_key := v_ip || ' ' || trim(p_device_id);
  v_blocked := greatest(private.rl_blocked('jf:dev:' || v_device_key), private.rl_blocked('jf:ip:' || v_ip), private.rl_blocked('jf:all'));
  if v_blocked > 0 then
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY', 'retryAfterSec', v_blocked);
  end if;
  if not private.rl_hit('j:ip:' || v_ip, 60, interval '1 minute') or not private.rl_hit('j:code:' || p_code, 200, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY', 'retryAfterSec', 60);
  end if;

  select * into v_exam from public.exams where code = p_code and status in ('LOBBY', 'RUNNING');
  if not found then
    perform private.rl_hit('jf:dev:' || v_device_key, 10, interval '10 minutes', interval '30 minutes');
    perform private.rl_hit('jf:ip:' || v_ip, 50, interval '10 minutes', interval '30 minutes');
    perform private.rl_hit('jf:all', 300, interval '1 minute', interval '1 minute');
    return jsonb_build_object('ok', false, 'error', 'BAD_CODE');
  end if;

  -- 1) shu sessiya, 2) ism bo'yicha (sessiya yo'qolgan bo'lsa), 3) yangi o'quvchi
  select * into v_attempt from public.attempts where exam_id = v_exam.id and student_uid = v_uid for update;
  if not found then
    select * into v_attempt from public.attempts
    where exam_id = v_exam.id and private.normalize_name(student_name) = private.normalize_name(v_name)
    order by created_at limit 1 for update;
    if found then
      -- Boshqa jonli ilova shu ism bilan ishlayapti (heartbeat yangi) — rad.
      if v_attempt.connected and v_attempt.last_seen_at > now() - interval '15 seconds' then
        return jsonb_build_object('ok', false, 'error', 'NAME_TAKEN');
      end if;
      v_by_name := true;
      update public.attempts set student_uid = v_uid where id = v_attempt.id;
    end if;
  end if;

  if v_attempt.id is null then
    insert into public.attempts (exam_id, student_uid, student_name, device_id, status)
    values (v_exam.id, v_uid, v_name, trim(p_device_id), case when v_exam.status = 'RUNNING' then 'WORKING' else 'JOINED' end::public.attempt_status)
    returning * into v_attempt;
    v_created := true;
    if v_exam.status = 'RUNNING' then
      -- Imtihon boshlangandan keyin kirgan o'quvchi darhol ishlaydi.
      insert into public.attempt_files (attempt_id, path, content, encoding)
      select v_attempt.id, f ->> 'path', f ->> 'content', f ->> 'encoding' from jsonb_array_elements(v_exam.starter_files) f
      on conflict (attempt_id, path) do nothing;
    end if;
  end if;

  v_prev_device := v_attempt.device_id;
  v_was_disconnected := not v_attempt.connected;
  update public.attempts set connected = true, last_seen_at = now(), device_id = trim(p_device_id)
  where id = v_attempt.id returning * into v_attempt;

  if v_created and v_exam.status = 'RUNNING' and v_exam.started_at is not null then
    perform private.add_event(v_attempt.id, 'LATE_JOIN',
      jsonb_build_object('minutesAfterStart', round(extract(epoch from (now() - v_exam.started_at)) / 60)));
  end if;
  if not v_created and v_prev_device is not null and v_prev_device <> trim(p_device_id) then
    perform private.add_event(v_attempt.id, 'DEVICE_CHANGED',
      jsonb_build_object('byName', v_by_name, 'previousDeviceId', v_prev_device, 'deviceId', trim(p_device_id)));
  end if;
  if not v_created and v_attempt.status = 'WORKING' and v_exam.status = 'RUNNING' and (v_was_disconnected or v_by_name) then
    perform private.add_event(v_attempt.id, 'RECONNECTED', jsonb_build_object('byName', v_by_name, 'afterDisconnect', v_was_disconnected));
  end if;

  return jsonb_build_object('ok', true, 'attemptId', v_attempt.id, 'exam', private.exam_public(v_exam),
    'state', private.student_state(v_attempt, true));
end;
$$;

/** Holat (fayllarsiz yoki bilan) — qayta ulanish va zaxira polling uchun. */
create function public.student_state(p_attempt_id uuid, p_with_files boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.attempts;
begin
  select * into v from public.attempts where id = p_attempt_id and student_uid = (select auth.uid());
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  return private.student_state(v, p_with_files);
end;
$$;

/** Har 5 s: "tirikman" + vaqt sinxroni. Uzilgan deb belgilangan bo'lsa — RECONNECTED. */
create function public.heartbeat(p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.attempts;
  v_was_disconnected boolean;
begin
  v := private.own_attempt_for_update(p_attempt_id);
  v_was_disconnected := not v.connected;
  update public.attempts set connected = true, last_seen_at = now() where id = p_attempt_id returning * into v;
  if v_was_disconnected and v.status = 'WORKING' then
    perform private.add_event(v.id, 'RECONNECTED', jsonb_build_object('byName', false, 'afterDisconnect', true));
  end if;
  return private.student_state(v, false);
end;
$$;

/** Klient eventi: faqat client_allowed turlar; daraja bazadan. p_event_id — mavjud eventni to'ldirish (FOCUS_LOST davomiyligi). */
create function public.report_event(p_attempt_id uuid, p_type text, p_details jsonb default '{}', p_event_id uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v public.attempts;
  v_id uuid;
begin
  v := private.own_attempt_for_update(p_attempt_id);
  if v.status not in ('JOINED', 'WORKING') then
    raise exception 'NOT_WORKING' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_details, '{}')) <> 'object' or length(coalesce(p_details, '{}')::text) > 10000 then
    raise exception 'INVALID_DETAILS' using errcode = 'P0001';
  end if;
  if p_event_id is not null then
    update public.events set details = details || coalesce(p_details, '{}')
    where id = p_event_id and attempt_id = p_attempt_id returning id into v_id;
    if v_id is null then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    return v_id;
  end if;
  if not exists (select 1 from public.event_types t where t.type = p_type and t.client_allowed) then
    raise exception 'EVENT_TYPE_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return private.add_event(p_attempt_id, p_type, p_details);
end;
$$;

/** "Topshirish": 15 s topshirish boshlanadi (oxirgi sync uchun), so'ng pg_cron SUBMITTED qiladi. */
create function public.submit_attempt(p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.attempts;
begin
  v := private.own_attempt_for_update(p_attempt_id);
  if v.status <> 'WORKING' then
    raise exception 'NOT_WORKING' using errcode = 'P0001';
  end if;
  update public.attempts set ending_at = coalesce(ending_at, now()) where id = p_attempt_id returning * into v;
  return private.student_state(v, false);
end;
$$;

/** Ilova yopildi (best effort, desktop before-quit). Topshirish jarayonida bo'lsa — event yo'q. */
create function public.report_app_closed(p_attempt_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.attempts;
begin
  v := private.own_attempt_for_update(p_attempt_id);
  update public.attempts set connected = false, last_seen_at = now() where id = p_attempt_id;
  if v.status = 'WORKING' and v.ending_at is null then
    perform private.add_event(v.id, 'APP_CLOSED', jsonb_build_object('reason', 'client namespace disconnect'));
  end if;
end;
$$;

revoke execute on function private.add_event(uuid, text, jsonb), private.rl_hit(text, int, interval, interval),
  private.rl_blocked(text), private.client_ip(), private.normalize_name(text), private.own_attempt_for_update(uuid),
  private.exam_public(public.exams), private.student_state(public.attempts, boolean)
from public, anon, authenticated;
revoke execute on function public.student_join(text, text, text), public.student_state(uuid, boolean),
  public.heartbeat(uuid), public.report_event(uuid, text, jsonb, uuid), public.submit_attempt(uuid),
  public.report_app_closed(uuid)
from public, anon;
grant execute on function public.student_join(text, text, text), public.student_state(uuid, boolean),
  public.heartbeat(uuid), public.report_event(uuid, text, jsonb, uuid), public.submit_attempt(uuid),
  public.report_app_closed(uuid)
to authenticated;
