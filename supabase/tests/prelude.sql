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
  last_sign_in_at timestamptz,
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

-- Realtime (Supabase'dagi bilan bir xil interfeys): send() xabarni realtime.messages'ga yozadi (testlar o'qiydi),
-- topic() — `realtime.topic` sozlamasi (Realtime server obuna tekshiruvida o'rnatadi).
create schema realtime;
grant usage on schema realtime to anon, authenticated, service_role;
create table realtime.messages (
  id bigserial primary key,
  topic text not null,
  extension text not null default 'broadcast',
  event text,
  payload jsonb,
  private boolean default false,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
grant select on realtime.messages to authenticated;
create function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '');
$$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language sql as $$
  insert into realtime.messages (topic, event, payload, private) values (topic, event, payload, private);
$$;
