-- Stale versions and moved-task conflicts are business errors, not transient
-- PostgreSQL serialization failures. PT409 returns HTTP 409 without PostgREST
-- retrying the transaction. CREATE OR REPLACE preserves existing privileges.
create or replace function private.check_version(p_actual integer, p_expected integer) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_expected is null then
    raise exception 'Не указана версия записи. Обновите страницу.' using errcode = '22023';
  end if;
  if p_actual <> p_expected then
    raise exception 'Запись уже изменена другим пользователем. Обновите страницу и повторите действие.' using errcode = 'PT409';
  end if;
end;
$$;

create or replace function private.lock_task(p_id uuid) returns public.tasks
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
    raise exception 'Задача перемещена. Обновите страницу.' using errcode = 'PT409';
  end if;
  return v_task;
end;
$$;

create or replace function private.guard_task() returns trigger
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
    raise exception 'Некорректная версия задачи.' using errcode = 'PT409';
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

create or replace function public.update_task(p_id uuid, p_project_id uuid, p_title text, p_description text, p_assignee_id uuid, p_expected_version integer) returns public.tasks
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
    raise exception 'Задача перемещена. Обновите страницу.' using errcode = 'PT409';
  end if;
  perform private.check_version(v_result.version, p_expected_version);
  update public.tasks set project_id = p_project_id, title = p_title, description = p_description,
    assignee_id = p_assignee_id, version = version + 1 where id = p_id returning * into v_result;
  return v_result;
end;
$$;
