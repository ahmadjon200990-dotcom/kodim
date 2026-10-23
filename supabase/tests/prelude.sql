-- Faqat lokal sinov (PGlite) uchun: Supabase muhitining minimal nusxasi. Haqiqiy loyihada ishga tushirilmaydi.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text,
  is_anonymous boolean not null default false,
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Supabase'dagi bilan bir xil: JWT da'volari `request.jwt.claims` sozlamasidan.
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role';
$$;

-- Supabase public sxemadagi yangi obyektlarga standart huquq beradi — migratsiyalar shuni hisobga oladi.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
