-- Kodim: sync_files (6-faza). Ichida `delete` (o'chirilgan fayllar) — Supabase MCP rad etadi, SQL Editor'da bajariladi.
-- Eski attempt:sync qoidalari: har fayl alohida tekshiriladi, yaroqsizlari `rejected[]` da qaytadi, qolganlari saqlanadi.
-- Sabablar: INVALID_PATH, IGNORED, READONLY, TOO_LARGE (> 1 MB), TOO_MANY_FILES (> 300). BINARY — klientda (jsonb \u0000 ni qabul qilmaydi).

create function public.sync_files(p_attempt_id uuid, p_files jsonb default '[]', p_deleted jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.attempts;
  v_rejected jsonb := '[]';
  v_count int;
  f jsonb;
  d text;
  v_path text;
  v_bytes bigint;
  v_new boolean;
begin
  v := private.own_attempt_for_update(p_attempt_id);
  if v.status <> 'WORKING' then
    raise exception 'NOT_WORKING' using errcode = 'P0001';
  end if;

  for d in select jsonb_array_elements_text(coalesce(p_deleted, '[]')) loop
    if d = 'savollar.md' or d = 'dizaynlar' or d like 'dizaynlar/%' then
      v_rejected := v_rejected || jsonb_build_object('path', d, 'reason', 'READONLY');
    else
      delete from public.attempt_files where attempt_id = p_attempt_id and path = d;
    end if;
  end loop;

  select count(*) into v_count from public.attempt_files where attempt_id = p_attempt_id;
  for f in select * from jsonb_array_elements(coalesce(p_files, '[]')) loop
    v_path := f ->> 'path';
    v_bytes := case when f ->> 'encoding' = 'base64'
      then (length(f ->> 'content') * 3) / 4
      else octet_length(convert_to(coalesce(f ->> 'content', ''), 'UTF8')) end;
    if v_path is null or length(v_path) not between 1 and 260 or v_path like '/%' or position('\' in v_path) > 0
       or '..' = any(string_to_array(v_path, '/')) then
      v_rejected := v_rejected || jsonb_build_object('path', coalesce(v_path, ''), 'reason', 'INVALID_PATH');
    elsif string_to_array(v_path, '/') && array['node_modules', '.git', 'dist', 'build', '.vite']
       or regexp_replace(v_path, '^.*/', '') in ('package-lock.json', 'pnpm-lock.yaml', 'yarn.lock') then
      v_rejected := v_rejected || jsonb_build_object('path', v_path, 'reason', 'IGNORED');
    elsif v_path = 'savollar.md' or v_path = 'dizaynlar' or v_path like 'dizaynlar/%' then
      v_rejected := v_rejected || jsonb_build_object('path', v_path, 'reason', 'READONLY');
    elsif v_bytes > 1048576 then
      v_rejected := v_rejected || jsonb_build_object('path', v_path, 'reason', 'TOO_LARGE');
    elsif not exists (select 1 from public.attempt_files where attempt_id = p_attempt_id and path = v_path) and v_count >= 300 then
      v_rejected := v_rejected || jsonb_build_object('path', v_path, 'reason', 'TOO_MANY_FILES');
    else
      insert into public.attempt_files (attempt_id, path, content, encoding, sha1, updated_at)
      values (p_attempt_id, v_path, coalesce(f ->> 'content', ''), nullif(f ->> 'encoding', ''), coalesce(f ->> 'sha1', ''), now())
      on conflict (attempt_id, path) do update
        set content = excluded.content, encoding = excluded.encoding, sha1 = excluded.sha1, updated_at = now()
      returning (xmax = 0) into v_new; -- yangi qator bo'lsa hisob oshadi
      if v_new then v_count := v_count + 1; end if;
    end if;
  end loop;

  update public.attempts set last_seen_at = now(), connected = true where id = p_attempt_id;
  return jsonb_build_object('rejected', v_rejected);
end;
$$;

revoke execute on function public.sync_files(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.sync_files(uuid, jsonb, jsonb) to authenticated;
