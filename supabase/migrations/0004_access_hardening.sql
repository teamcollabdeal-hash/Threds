-- Безпека доступу: нові користувачі без доступу до схвалення owner'ом;
-- змінювати ролі може лише owner (раніше admin міг підвищити себе через API).

-- Частина 1 (окремим запуском — нове значення enum має бути закомічене)
alter type app_role add value if not exists 'pending';

-- Частина 2
alter table profiles alter column role set default 'pending';

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, role)
  values (new.id, new.email,
    case when (select count(*) from profiles) = 0 then 'owner'::app_role else 'pending'::app_role end);
  return new;
end $$;

create or replace function current_role_rank() returns int
language sql stable security definer set search_path = public as $$
  select case role::text when 'owner' then 4 when 'admin' then 3 when 'editor' then 2 when 'viewer' then 1 else 0 end
  from profiles where id = auth.uid()
$$;

drop policy if exists profiles_admin on profiles;
create policy profiles_owner on profiles for update
  using (current_role_rank() >= 4)
  with check (current_role_rank() >= 4 and role <> 'owner');
