-- One company, two explicitly provisioned roles. No client can choose its role.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;

create type public.app_role as enum ('manager', 'executor');
create type public.task_status as enum ('new', 'in_progress', 'in_review', 'accepted', 'rework');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 160),
  role public.app_role not null
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  address text not null check (char_length(address) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  deleted_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 10000),
  assignee_id uuid not null references public.profiles(id) on delete restrict,
  status public.task_status not null default 'new',
  author_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  deleted_at timestamptz
);

create table public.task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  from_status public.task_status,
  to_status public.task_status not null,
  comment text check (char_length(comment) <= 5000),
  created_at timestamptz not null default clock_timestamp()
);

create index tasks_project_live_idx on public.tasks(project_id) where deleted_at is null;
create index tasks_assignee_live_idx on public.tasks(assignee_id, created_at desc) where deleted_at is null;
create index tasks_author_idx on public.tasks(author_id);
create index history_task_time_idx on public.task_history(task_id, created_at, id);
create index history_actor_idx on public.task_history(actor_id);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;

-- These read helpers avoid mutually recursive RLS policies. Their owner is the
-- migration owner; they never accept a caller-supplied user ID or role.
create function private.current_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create function private.can_read_project(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_id and p.deleted_at is null
      and (
        private.current_role() = 'manager'::public.app_role
        or (private.current_role() = 'executor'::public.app_role and exists (
          select 1 from public.tasks t
          where t.project_id = p.id and t.assignee_id = (select auth.uid()) and t.deleted_at is null
        ))
      )
  );
$$;

create function private.can_read_task(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t join public.projects p on p.id = t.project_id
    where t.id = p_id and t.deleted_at is null and p.deleted_at is null
      and (
        private.current_role() = 'manager'::public.app_role
        or (private.current_role() = 'executor'::public.app_role and t.assignee_id = (select auth.uid()))
      )
  );
$$;

create policy profiles_read on public.profiles for select to authenticated
  using ((select private.current_role()) is not null);
create policy projects_read on public.projects for select to authenticated
  using (private.can_read_project(id));
create policy tasks_read on public.tasks for select to authenticated
  using (private.can_read_task(id));
create policy history_read on public.task_history for select to authenticated
  using (private.can_read_task(task_id));

create function private.clean_text(p_text text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(p_text, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
$$;

create function private.require_manager() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.current_role() is distinct from 'manager'::public.app_role then
    raise exception 'Действие доступно только постановщику.' using errcode = '42501';
  end if;
end;
$$;

create function private.check_version(p_actual integer, p_expected integer) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_expected is null then
    raise exception 'Не указана версия записи. Обновите страницу.' using errcode = '22023';
  end if;
  if p_actual <> p_expected then
    raise exception 'Запись уже изменена другим пользователем. Обновите страницу и повторите действие.' using errcode = '40001';
  end if;
end;
$$;

-- Parent locks are acquired before task locks in every write RPC. A project
-- deletion takes FOR UPDATE, so creating/moving/transitioning a task cannot race
-- with deletion. KEY SHARE still allows independent tasks to change concurrently.
create function private.lock_project(p_id uuid) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare v_project public.projects;
begin
  select * into v_project from public.projects where id = p_id for key share;
  if not found or v_project.deleted_at is not null then
    raise exception 'Объект не найден или удалён.' using errcode = 'P0002';
  end if;
  return v_project;
end;
$$;

create function private.lock_task(p_id uuid) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare v_task public.tasks; v_project_id uuid;
begin
  -- Do not let an unauthorized caller learn whether a foreign task exists.
  if not private.can_read_task(p_id) then
    raise exception 'Задача не найдена или доступ запрещён.' using errcode = '42501';
  end if;
  select project_id into v_project_id from public.tasks where id = p_id;
  perform private.lock_project(v_project_id);
  select * into v_task from public.tasks where id = p_id for update;
  -- Re-check the locked row itself: a STABLE read helper can retain the statement
  -- snapshot while a concurrent reassignment commits during the lock wait.
  if not found or v_task.deleted_at is not null
    or (private.current_role() is distinct from 'manager'::public.app_role
      and (private.current_role() is distinct from 'executor'::public.app_role or v_task.assignee_id <> auth.uid())) then
    raise exception 'Задача не найдена или доступ запрещён.' using errcode = '42501';
  end if;
  if v_task.project_id <> v_project_id then
    raise exception 'Задача перемещена. Обновите страницу.' using errcode = '40001';
  end if;
  return v_task;
end;
$$;

create function private.check_assignee(p_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_id and role = 'executor') then
    raise exception 'Выберите существующего исполнителя.' using errcode = '22023';
  end if;
end;
$$;

create function private.validate_transition(p_from public.task_status, p_to public.task_status, p_assignee uuid, p_comment text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_role public.app_role := private.current_role();
begin
  if v_role = 'executor' and p_assignee = auth.uid() then
    if (p_from = 'new' and p_to = 'in_progress')
      or (p_from = 'in_progress' and p_to = 'in_review')
      or (p_from = 'rework' and p_to = 'in_progress') then
      return;
    end if;
  elsif v_role = 'manager' then
    if p_from = 'in_review' and p_to = 'accepted' then return; end if;
    if p_from = 'in_review' and p_to = 'rework' then
      if private.clean_text(p_comment) is null then
        raise exception 'Укажите комментарий для доработки.' using errcode = '22023';
      end if;
      return;
    end if;
  end if;
  raise exception 'Этот переход статуса недоступен.' using errcode = '22023';
end;
$$;

-- Defense in depth: even a later accidentally granted table UPDATE cannot
-- create a forbidden transition, change an author, or edit another user's task.
create function private.guard_task() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_comment text := private.clean_text(current_setting('crm.transition_comment', true));
begin
  if tg_op = 'DELETE' then
    raise exception 'Задачи удаляются только с сохранением истории.' using errcode = '42501';
  end if;
  if auth.uid() is null or private.current_role() is null then
    raise exception 'Необходим вход в систему.' using errcode = '42501';
  end if;
  new.title := private.clean_text(new.title);
  if new.title is null or char_length(new.title) > 200 then
    raise exception 'Название задачи должно содержать от 1 до 200 символов.' using errcode = '22023';
  end if;
  if new.description is null or char_length(new.description) > 10000 then
    raise exception 'Описание должно содержать не более 10000 символов.' using errcode = '22023';
  end if;
  perform private.check_assignee(new.assignee_id);
  if not exists (select 1 from public.projects where id = new.project_id and deleted_at is null) then
    raise exception 'Объект не найден или удалён.' using errcode = 'P0002';
  end if;
  if tg_op = 'INSERT' then
    perform private.require_manager();
    if new.status <> 'new' or new.author_id <> auth.uid() or new.deleted_at is not null or new.version <> 1 then
      raise exception 'Недопустимые данные новой задачи.' using errcode = '22023';
    end if;
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    return new;
  end if;
  if old.deleted_at is not null then
    raise exception 'Удалённую задачу нельзя изменить.' using errcode = '42501';
  end if;
  if new.id <> old.id or new.author_id <> old.author_id or new.created_at <> old.created_at then
    raise exception 'Автора и дату создания задачи нельзя изменить.' using errcode = '42501';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'Некорректная версия задачи.' using errcode = '40001';
  end if;
  if new.status is distinct from old.status then
    -- A status action cannot simultaneously change assignment or task contents.
    if row(new.project_id, new.title, new.description, new.assignee_id, new.deleted_at)
      is distinct from row(old.project_id, old.title, old.description, old.assignee_id, old.deleted_at) then
      raise exception 'Изменение статуса выполняется отдельно от редактирования.' using errcode = '22023';
    end if;
    perform private.validate_transition(old.status, new.status, old.assignee_id, v_comment);
    if char_length(v_comment) > 5000 then
      raise exception 'Комментарий должен содержать не более 5000 символов.' using errcode = '22023';
    end if;
  else
    perform private.require_manager();
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create function private.append_task_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_history(task_id, actor_id, from_status, to_status)
      values (new.id, auth.uid(), null, new.status);
  elsif old.status is distinct from new.status then
    insert into public.task_history(task_id, actor_id, from_status, to_status, comment)
      values (new.id, auth.uid(), old.status, new.status,
        private.clean_text(current_setting('crm.transition_comment', true)));
  end if;
  return new;
end;
$$;

create function private.guard_history() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- History inserts are allowed only from the nested task audit trigger.
  if tg_op <> 'INSERT' or pg_trigger_depth() < 2 then
    raise exception 'История формируется автоматически и не может быть изменена.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tasks_guard before insert or update or delete on public.tasks
  for each row execute function private.guard_task();
create trigger tasks_audit after insert or update on public.tasks
  for each row execute function private.append_task_history();
create trigger task_history_immutable before insert or update or delete on public.task_history
  for each row execute function private.guard_history();

create function public.create_project(p_name text, p_address text) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare v_result public.projects; v_name text := private.clean_text(p_name); v_address text := private.clean_text(p_address);
begin
  perform private.require_manager();
  if v_name is null or char_length(v_name) > 160 or v_address is null or char_length(v_address) > 300 then
    raise exception 'Укажите название объекта (до 160 символов) и адрес (до 300 символов).' using errcode = '22023';
  end if;
  insert into public.projects(name, address) values (v_name, v_address) returning * into v_result;
  return v_result;
end;
$$;

create function public.update_project(p_id uuid, p_name text, p_address text, p_expected_version integer) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare v_result public.projects; v_name text := private.clean_text(p_name); v_address text := private.clean_text(p_address);
begin
  perform private.require_manager();
  select * into v_result from public.projects where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Объект не найден или удалён.' using errcode = 'P0002'; end if;
  perform private.check_version(v_result.version, p_expected_version);
  if v_name is null or char_length(v_name) > 160 or v_address is null or char_length(v_address) > 300 then
    raise exception 'Укажите название объекта (до 160 символов) и адрес (до 300 символов).' using errcode = '22023';
  end if;
  update public.projects set name = v_name, address = v_address, version = version + 1, updated_at = clock_timestamp()
    where id = p_id returning * into v_result;
  return v_result;
end;
$$;

create function public.delete_project(p_id uuid, p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_project public.projects; v_deleted_at timestamptz := clock_timestamp();
begin
  perform private.require_manager();
  select * into v_project from public.projects where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Объект не найден или удалён.' using errcode = 'P0002'; end if;
  perform private.check_version(v_project.version, p_expected_version);
  update public.tasks set deleted_at = v_deleted_at, version = version + 1 where project_id = p_id and deleted_at is null;
  update public.projects set deleted_at = v_deleted_at, version = version + 1, updated_at = clock_timestamp() where id = p_id;
end;
$$;

create function public.create_task(p_project_id uuid, p_title text, p_description text, p_assignee_id uuid) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare v_result public.tasks;
begin
  perform private.require_manager();
  perform private.lock_project(p_project_id);
  insert into public.tasks(project_id, title, description, assignee_id, author_id)
    values (p_project_id, p_title, p_description, p_assignee_id, auth.uid()) returning * into v_result;
  return v_result;
end;
$$;

create function public.update_task(p_id uuid, p_project_id uuid, p_title text, p_description text, p_assignee_id uuid, p_expected_version integer) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare v_result public.tasks; v_old_project_id uuid; v_lock_id uuid;
begin
  perform private.require_manager();
  select project_id into v_old_project_id from public.tasks where id = p_id and deleted_at is null;
  if not found then raise exception 'Задача не найдена или удалена.' using errcode = 'P0002'; end if;
  -- Deterministic parent lock order also permits moving tasks in opposite directions.
  for v_lock_id in select distinct x from unnest(array[v_old_project_id, p_project_id]) as x order by x loop
    perform private.lock_project(v_lock_id);
  end loop;
  select * into v_result from public.tasks where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Задача не найдена или удалена.' using errcode = 'P0002'; end if;
  if v_result.project_id <> v_old_project_id then
    raise exception 'Задача перемещена. Обновите страницу.' using errcode = '40001';
  end if;
  perform private.check_version(v_result.version, p_expected_version);
  update public.tasks set project_id = p_project_id, title = p_title, description = p_description,
    assignee_id = p_assignee_id, version = version + 1 where id = p_id returning * into v_result;
  return v_result;
end;
$$;

create function public.delete_task(p_id uuid, p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_task public.tasks;
begin
  perform private.require_manager();
  v_task := private.lock_task(p_id);
  perform private.check_version(v_task.version, p_expected_version);
  update public.tasks set deleted_at = clock_timestamp(), version = version + 1 where id = p_id;
end;
$$;

create function public.transition_task(p_id uuid, p_to_status public.task_status, p_comment text default null, p_expected_version integer default null) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare v_task public.tasks; v_comment text := private.clean_text(p_comment);
begin
  v_task := private.lock_task(p_id);
  perform private.check_version(v_task.version, p_expected_version);
  if p_to_status is null then raise exception 'Укажите новый статус.' using errcode = '22023'; end if;
  if char_length(v_comment) > 5000 then
    raise exception 'Комментарий должен содержать не более 5000 символов.' using errcode = '22023';
  end if;
  perform private.validate_transition(v_task.status, p_to_status, v_task.assignee_id, v_comment);
  -- Transaction-scoped, inaccessible through the REST API; the trigger records it.
  perform set_config('crm.transition_comment', coalesce(v_comment, ''), true);
  update public.tasks set status = p_to_status, version = version + 1 where id = p_id returning * into v_task;
  perform set_config('crm.transition_comment', '', true);
  return v_task;
end;
$$;

-- Supabase's default public-schema grants are deliberately replaced. RLS is
-- only for reads; writes are never available directly, even to a manager.
revoke all on public.profiles, public.projects, public.tasks, public.task_history from public, anon, authenticated;
grant select on public.profiles, public.projects, public.tasks, public.task_history to authenticated;
grant all on public.profiles to service_role;
revoke insert, update, delete, truncate, references, trigger on public.task_history from service_role;

revoke all on all functions in schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.current_role(), private.can_read_project(uuid), private.can_read_task(uuid) to authenticated;

revoke all on function public.create_project(text, text), public.update_project(uuid, text, text, integer),
  public.delete_project(uuid, integer), public.create_task(uuid, text, text, uuid),
  public.update_task(uuid, uuid, text, text, uuid, integer), public.delete_task(uuid, integer),
  public.transition_task(uuid, public.task_status, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.create_project(text, text), public.update_project(uuid, text, text, integer),
  public.delete_project(uuid, integer), public.create_task(uuid, text, text, uuid),
  public.update_task(uuid, uuid, text, text, uuid, integer), public.delete_task(uuid, integer),
  public.transition_task(uuid, public.task_status, text, integer) to authenticated;

-- Future functions must opt in explicitly instead of inheriting PUBLIC execution.
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

comment on table public.task_history is 'Append-only database-generated status history; retained on logical deletion.';
comment on function public.transition_task(uuid, public.task_status, text, integer) is 'Validates role, assignment, allowed transition and version; writes status and history atomically.';
