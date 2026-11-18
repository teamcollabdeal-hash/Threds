-- MultiThreads — базова схема
-- Запуск: supabase db push  (або вставити в SQL Editor)


-- ───────────── Ролі користувачів панелі ─────────────
create type app_role as enum ('owner', 'admin', 'editor', 'viewer');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role app_role not null default 'viewer',
  created_at timestamptz not null default now()
);

-- Перший зареєстрований користувач стає owner, решта — viewer
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, role)
  values (new.id, new.email,
    case when (select count(*) from profiles) = 0 then 'owner'::app_role else 'viewer'::app_role end);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create or replace function current_role_rank() returns int
language sql stable security definer set search_path = public as $$
  select case role when 'owner' then 4 when 'admin' then 3 when 'editor' then 2 when 'viewer' then 1 else 0 end
  from profiles where id = auth.uid()
$$;

-- ───────────── Мережеві конфігурації ─────────────
create type proxy_protocol as enum ('http', 'https', 'socks5');
create type net_status as enum ('unknown', 'ok', 'error');

create table network_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  protocol proxy_protocol not null,
  host text not null,
  port int not null check (port between 1 and 65535),
  username text,
  status net_status not null default 'unknown',
  last_checked_at timestamptz,
  last_latency_ms int,
  last_error text,
  created_at timestamptz not null default now()
);

-- ───────────── Акаунти Threads ─────────────
create type account_status as enum ('active', 'paused', 'auth_error', 'rate_limited', 'disconnected');

create table accounts (
  id uuid primary key default gen_random_uuid(),
  threads_user_id text not null unique,
  username text not null,
  display_name text,
  avatar_url text,
  biography text,
  status account_status not null default 'active',
  status_reason text,
  token_expires_at timestamptz,
  token_refreshed_at timestamptz,
  scopes text[] not null default '{}',
  network_config_id uuid references network_configs(id) on delete set null,
  timezone text not null default 'Europe/Kyiv',
  daily_limit int not null default 50 check (daily_limit between 1 and 250),
  min_interval_minutes int not null default 10 check (min_interval_minutes >= 0),
  settings jsonb not null default '{}',
  notes text,
  followers_count int,
  connected_by uuid references auth.users(id),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Секрети: окремі таблиці з RLS без політик → доступні лише service role (сервер/worker)
create table account_secrets (
  account_id uuid primary key references accounts(id) on delete cascade,
  access_token_enc text not null,  -- long-lived токен, AES-256-GCM
  updated_at timestamptz not null default now()
);
create table network_secrets (
  network_config_id uuid primary key references network_configs(id) on delete cascade,
  password_enc text not null
);

create type group_kind as enum ('project', 'country', 'topic');

create table account_groups (
  id uuid primary key default gen_random_uuid(),
  kind group_kind not null,
  name text not null,
  color text not null default '#6366f1',
  created_at timestamptz not null default now(),
  unique (kind, name)
);

create table account_group_members (
  group_id uuid references account_groups(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  primary key (group_id, account_id)
);

-- ───────────── Медіа ─────────────
create table media_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image', 'video')),
  storage_path text,
  public_url text not null,
  mime_type text,
  size_bytes bigint,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ───────────── Кампанії ─────────────
create type campaign_status as enum ('draft', 'active', 'paused', 'completed');

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status campaign_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ───────────── Пости (контент) ─────────────
create table posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete set null,
  text text not null default '' check (char_length(text) <= 500),
  media jsonb not null default '[]',      -- [{url, kind:'image'|'video', asset_id?}]
  link_attachment text,
  topic_tag text,
  source text not null default 'composer', -- composer | bulk | recurring
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────── Публікації (пост × акаунт × час) ─────────────
create type publication_status as enum
  ('draft', 'scheduled', 'queued', 'publishing', 'published', 'failed', 'cancelled', 'paused');

create table publications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  schedule_id uuid,
  scheduled_at timestamptz not null,
  status publication_status not null default 'scheduled',
  attempts int not null default 0,
  next_attempt_at timestamptz,
  container_id text,
  threads_media_id text,
  permalink text,
  error_code text,
  error_message text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index publications_due_idx on publications (status, scheduled_at);
create index publications_account_idx on publications (account_id, status);
create index publications_published_idx on publications (account_id, published_at desc);

-- ───────────── Повторювані розклади ─────────────
create table schedules (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  account_ids uuid[] not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'interval')),
  times text[] not null default '{}',     -- ['09:00','18:30'] у таймзоні розкладу
  weekdays int[] not null default '{}',   -- 1=Пн … 7=Нд (для weekly)
  interval_minutes int,                   -- для interval
  timezone text not null default 'Europe/Kyiv',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  next_run_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table publications add constraint publications_schedule_fk
  foreign key (schedule_id) references schedules(id) on delete set null;

-- ───────────── Аналітика ─────────────
create table publication_insights (
  publication_id uuid primary key references publications(id) on delete cascade,
  views int, likes int, replies int, reposts int, quotes int, shares int,
  fetched_at timestamptz not null default now()
);

create table account_insights (
  account_id uuid references accounts(id) on delete cascade,
  day date not null,
  views int, likes int, replies int, reposts int, quotes int, followers_count int,
  primary key (account_id, day)
);

-- ───────────── Логи ─────────────
create type log_level as enum ('debug', 'info', 'warn', 'error');

create table logs (
  id bigserial primary key,
  level log_level not null default 'info',
  scope text not null,                    -- auth | publish | scheduler | network | token | user
  message text not null,
  account_id uuid references accounts(id) on delete set null,
  publication_id uuid references publications(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index logs_created_idx on logs (created_at desc);
create index logs_account_idx on logs (account_id, created_at desc);

-- ───────────── Налаштування сервісу ─────────────
create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into app_settings (key, value) values
  ('defaults', '{"timezone":"Europe/Kyiv","daily_limit":50,"min_interval_minutes":10,"max_attempts":5}');

-- ───────────── updated_at ─────────────
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_accounts before update on accounts for each row execute function touch_updated_at();
create trigger t_posts before update on posts for each row execute function touch_updated_at();
create trigger t_pubs before update on publications for each row execute function touch_updated_at();

-- ───────────── Агрегати для дашборду ─────────────
create or replace view account_stats with (security_invoker = true) as
select a.id as account_id,
  count(p.*) filter (where p.status = 'published') as published,
  count(p.*) filter (where p.status in ('scheduled','queued','publishing')) as scheduled,
  count(p.*) filter (where p.status = 'failed') as failed,
  count(p.*) filter (where p.status = 'published' and p.published_at > now() - interval '24 hours') as published_24h
from accounts a left join publications p on p.account_id = a.id
group by a.id;

-- ───────────── RLS ─────────────
alter table profiles enable row level security;
alter table network_configs enable row level security;
alter table accounts enable row level security;
alter table account_groups enable row level security;
alter table account_group_members enable row level security;
alter table media_assets enable row level security;
alter table campaigns enable row level security;
alter table posts enable row level security;
alter table publications enable row level security;
alter table schedules enable row level security;
alter table publication_insights enable row level security;
alter table account_insights enable row level security;
alter table logs enable row level security;
alter table app_settings enable row level security;

create policy profiles_self on profiles for select using (id = auth.uid() or current_role_rank() >= 3);
create policy profiles_admin on profiles for update using (current_role_rank() >= 3);

do $$
declare t text;
begin
  foreach t in array array['network_configs','accounts','account_groups','account_group_members','media_assets',
    'campaigns','posts','publications','schedules','publication_insights','account_insights','logs','app_settings']
  loop
    execute format('create policy %I_read on %I for select using (current_role_rank() >= 1)', t, t);
  end loop;
  foreach t in array array['account_groups','account_group_members','media_assets','campaigns','posts','publications','schedules']
  loop
    execute format('create policy %I_write on %I for all using (current_role_rank() >= 2) with check (current_role_rank() >= 2)', t, t);
  end loop;
  foreach t in array array['network_configs','accounts','app_settings']
  loop
    execute format('create policy %I_admin on %I for all using (current_role_rank() >= 3) with check (current_role_rank() >= 3)', t, t);
  end loop;
end $$;

alter table account_secrets enable row level security;   -- без політик навмисно
alter table network_secrets enable row level security;   -- без політик навмисно

-- ───────────── Storage ─────────────
insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict (id) do nothing;
create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and current_role_rank() >= 2);
create policy media_read on storage.objects for select using (bucket_id = 'media');
