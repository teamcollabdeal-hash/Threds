-- Режим без окремого сервера: Supabase pg_cron щохвилини викликає /api/cron/tick на Vercel.
-- Публікація розбита на короткі кроки (створити контейнер → на наступному тіку опублікувати),
-- тож жоден виклик не чекає довше за кілька секунд.

alter table publications add column if not exists child_containers text[] not null default '{}';
alter table publications add column if not exists processing_started_at timestamptz;

-- Захоплює публікації, у яких настав час: не більше ОДНІЄЇ на акаунт і лише для акаунтів,
-- у яких зараз немає публікації в процесі.
create or replace function claim_due_publications(p_limit int default 20)
returns table (id uuid, account_id uuid, attempts int)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select distinct on (p.account_id) p.id
    from publications p
    join accounts a on a.id = p.account_id
    where p.status = 'scheduled'
      and p.scheduled_at <= now()
      and (p.next_attempt_at is null or p.next_attempt_at <= now())
      and a.status in ('active', 'rate_limited')
      and not exists (select 1 from publications q where q.account_id = p.account_id and q.status in ('queued','publishing'))
    order by p.account_id, coalesce(p.next_attempt_at, p.scheduled_at)
  ), due as (
    select p.id from publications p join candidates c on c.id = p.id
    order by coalesce(p.next_attempt_at, p.scheduled_at)
    limit p_limit
    for update of p skip locked
  )
  update publications p set status = 'queued'
  from due where p.id = due.id
  returning p.id, p.account_id, p.attempts;
end $$;
revoke execute on function claim_due_publications(int) from anon, authenticated;

-- Службові відмітки останніх запусків обслуговування
insert into app_settings (key, value) values ('maintenance', '{}') on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────
-- ЗАПУСК ПЛАНУВАЛЬНИКА (виконати ОДИН раз, підставивши свій домен і CRON_SECRET):
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('multithreads-tick', '* * * * *', $cron$
--   select net.http_post(
--     url := 'https://ВАШ-ДОМЕН.vercel.app/api/cron/tick',
--     headers := '{"Authorization": "Bearer ВАШ_CRON_SECRET"}'::jsonb,
--     timeout_milliseconds := 55000
--   );
-- $cron$);
--
-- Перевірити:  select * from cron.job_run_details order by start_time desc limit 5;
-- Зупинити:    select cron.unschedule('multithreads-tick');
-- ─────────────────────────────────────────────────────────────
