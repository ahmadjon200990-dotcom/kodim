-- Kodim: Figma PAT ma'lumotlari faqat server tomonda, private sxemada shifrlangan holda saqlanadi.
-- public.teachers.figma_secret_id faqat private.teacher_figma_secrets.idga ishora qiladi.
-- Raw token hech qachon public jadvalga yozilmaydi, API javobiga yoki front-endga qaytarilmaydi.

create schema if not exists private;

create table if not exists private.teacher_figma_secrets (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade unique,
  encrypted_secret text not null,
  figma_handle text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teacher_figma_secrets_teacher_id_idx
  on private.teacher_figma_secrets (teacher_id);

create or replace function private.touch_teacher_figma_secrets_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger teacher_figma_secrets_touch
before update on private.teacher_figma_secrets
for each row execute function private.touch_teacher_figma_secrets_updated_at();

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant select, insert, update, delete on private.teacher_figma_secrets to authenticated;

alter table private.teacher_figma_secrets enable row level security;

create policy teacher_figma_secrets_select on private.teacher_figma_secrets for select to authenticated
  using (teacher_id = (select auth.uid()));

create policy teacher_figma_secrets_write on private.teacher_figma_secrets for insert to authenticated
  with check (teacher_id = (select auth.uid()));

create policy teacher_figma_secrets_update on private.teacher_figma_secrets for update to authenticated
  using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));

create policy teacher_figma_secrets_delete on private.teacher_figma_secrets for delete to authenticated
  using (teacher_id = (select auth.uid()));

-- public teachers jadvali faqat handle va secret pointerini saqlaydi; raw token yo'q.
-- Agar mavjud bo'lsa, autentifikatsiya qilingan o'qituvchi uchun eski figma_secret_id yozuvini tozalab qo'yish foydali.
create or replace function private.clear_teacher_figma_secret(p_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.teacher_figma_secrets where teacher_id = p_teacher_id;
  update public.teachers
  set figma_handle = null,
      figma_secret_id = null
  where id = p_teacher_id;
end;
$$;

revoke execute on function private.clear_teacher_figma_secret(uuid) from public, anon;
grant execute on function private.clear_teacher_figma_secret(uuid) to authenticated;
