-- Ключі Threads API, введені в панелі (Settings). Шифруються AES-256-GCM; RLS без політик → лише сервер.
create table if not exists app_secrets (
  key text primary key,
  value_enc text not null,
  updated_at timestamptz not null default now()
);
alter table app_secrets enable row level security;
