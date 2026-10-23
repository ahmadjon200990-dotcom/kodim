-- Kodim: Supabase Auth bog'lanishi (MIGRATION-PLAN.md 4-faza).
-- Birinchi kirish (Google yoki email/parol) → teachers qatori, rol TEACHER. Anonim foydalanuvchi (o'quvchi) — o'qituvchi emas.
-- Admin: Dashboard'da email/parol foydalanuvchi yaratiladi, so'ng supabase/scripts/make-admin.sql.

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_anonymous or new.email is null then
    return new;
  end if;
  insert into public.teachers (id, name, email)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)), 100),
    lower(new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

/** Panelda "oxirgi kirish" (admin bo'limi). */
create function public.handle_user_sign_in() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.teachers set last_login_at = new.last_sign_in_at where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_sign_in after update of last_sign_in_at on auth.users
  for each row when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.handle_user_sign_in();

revoke execute on function public.handle_new_user(), public.handle_user_sign_in() from public, anon, authenticated;
