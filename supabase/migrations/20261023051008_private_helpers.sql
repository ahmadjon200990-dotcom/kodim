-- Kodim: advisor tuzatishlari (2-faza). Yordamchi security definer funksiyalar va rate_limits API'da ochiq
-- bo'lmagan `private` sxemaga (/rest/v1/rpc orqali chaqirib bo'lmaydi). Policy'lar funksiyaga OID bilan bog'langan —
-- ko'chirishdan keyin ham ishlaydi.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_active_teacher() set schema private;
alter function public.is_admin() set schema private;
alter function public.owns_exam(uuid) set schema private;
alter function public.owns_attempt(uuid) set schema private;
alter function public.is_own_attempt(uuid) set schema private;

create or replace function private.owns_attempt(p_attempt_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.owns_exam((select a.exam_id from public.attempts a where a.id = p_attempt_id));
$$;

alter table public.rate_limits set schema private;
