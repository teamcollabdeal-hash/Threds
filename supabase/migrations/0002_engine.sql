-- Automation Engine: атомарне захоплення завдань, дедуплікація повторюваних публікацій

create unique index publications_schedule_dedupe
  on publications (schedule_id, account_id, scheduled_at) where schedule_id is not null;

-- Захоплює до p_limit публікацій, у яких настав час, і переводить їх у 'queued'.
-- SKIP LOCKED дозволяє запускати кілька worker-інстансів паралельно.
create or replace function claim_due_publications(p_limit int default 100)
returns table (id uuid, account_id uuid, attempts int)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select p.id from publications p
    join accounts a on a.id = p.account_id
    where p.status = 'scheduled'
      and p.scheduled_at <= now()
      and (p.next_attempt_at is null or p.next_attempt_at <= now())
      and a.status in ('active', 'rate_limited')
    order by coalesce(p.next_attempt_at, p.scheduled_at)
    limit p_limit
    for update of p skip locked
  )
  update publications p set status = 'queued'
  from due where p.id = due.id
  returning p.id, p.account_id, p.attempts;
end $$;

-- Повертає «завислі» завдання (worker впав) у чергу.
create or replace function recover_stale_publications(p_minutes int default 15)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update publications set status = 'scheduled', next_attempt_at = now()
  where status in ('queued', 'publishing') and updated_at < now() - make_interval(mins => p_minutes);
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function claim_due_publications(int) from anon, authenticated;
revoke execute on function recover_stale_publications(int) from anon, authenticated;

-- Статистика мережі для дашборду
create or replace function network_overview()
returns json language sql stable security invoker as $$
  select json_build_object(
    'accounts_total', (select count(*) from accounts),
    'accounts_active', (select count(*) from accounts where status = 'active'),
    'accounts_problem', (select count(*) from accounts where status in ('auth_error','rate_limited','disconnected')),
    'published_total', (select count(*) from publications where status = 'published'),
    'published_24h', (select count(*) from publications where status = 'published' and published_at > now() - interval '24 hours'),
    'scheduled', (select count(*) from publications where status in ('scheduled','queued','publishing')),
    'failed', (select count(*) from publications where status = 'failed'),
    'views_total', (select coalesce(sum(views),0) from publication_insights),
    'likes_total', (select coalesce(sum(likes),0) from publication_insights)
  )
$$;
