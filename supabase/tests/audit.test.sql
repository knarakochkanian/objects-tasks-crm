-- Complements the HTTP tests: read-only API visibility cannot prove physical
-- audit retention. This suite runs in a transaction and rolls every fixture back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-manager@db-test.invalid'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-executor@db-test.invalid');
insert into public.profiles (id, full_name, role) values
  ('10000000-0000-4000-8000-000000000001', 'Тестовый постановщик', 'manager'),
  ('10000000-0000-4000-8000-000000000002', 'Тестовый исполнитель', 'executor');

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
create temporary table audit_test_state (project_id uuid, task1_id uuid, task2_id uuid);
insert into audit_test_state (project_id) select (public.create_project('Проверка аудита', 'Тестовый адрес')).id;
update audit_test_state set task1_id = (public.create_task(project_id, 'Удаление задачи', '', '10000000-0000-4000-8000-000000000002')).id;
update audit_test_state set task2_id = (public.create_task(project_id, 'Удаление объекта', '', '10000000-0000-4000-8000-000000000002')).id;

select is((select count(*) from public.task_history where task_id = (select task1_id from audit_test_state)), 1::bigint,
  'Creation is recorded by the database');
select public.delete_task(task1_id, 1) from audit_test_state;
select is((select count(*) from public.task_history where task_id = (select task1_id from audit_test_state)), 1::bigint,
  'Deleting a task physically retains its complete history');
select ok((select deleted_at is not null from public.tasks where id = (select task1_id from audit_test_state)),
  'Task deletion is logical');
select public.delete_project(project_id, 1) from audit_test_state;
select is((select count(*) from public.task_history where task_id in (select task1_id from audit_test_state union all select task2_id from audit_test_state)), 2::bigint,
  'Deleting a project physically retains both task histories');
select ok((select deleted_at is not null from public.tasks where id = (select task2_id from audit_test_state)),
  'Project deletion logically deletes its remaining tasks');

select throws_ok(
  'insert into public.task_history(task_id, actor_id, to_status) select task1_id, ''10000000-0000-4000-8000-000000000001'', ''accepted'' from audit_test_state',
  '42501', 'История формируется автоматически и не может быть изменена.',
  'Even a direct owner INSERT cannot forge history without a task trigger');
select throws_ok(
  'update public.task_history set comment = ''подделка'' where task_id = (select task1_id from audit_test_state)',
  '42501', 'История формируется автоматически и не может быть изменена.',
  'Audit rows cannot be updated, even by a direct owner statement');
select throws_ok(
  'delete from public.task_history where task_id = (select task1_id from audit_test_state)',
  '42501', 'История формируется автоматически и не может быть изменена.',
  'Audit rows cannot be deleted, even by a direct owner statement');

select ok(not has_table_privilege('authenticated', 'public.task_history', 'INSERT, UPDATE, DELETE, TRUNCATE'),
  'Authenticated users have no history mutation or TRUNCATE privilege');
select ok(not has_table_privilege('service_role', 'public.task_history', 'INSERT, UPDATE, DELETE, TRUNCATE'),
  'The API service role also has no history mutation or TRUNCATE privilege');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'INSERT, UPDATE, DELETE'),
  'Users cannot provision or elevate their own role');
select ok(not has_function_privilege('anon', 'public.transition_task(uuid, public.task_status, text, integer)', 'EXECUTE'),
  'Unauthenticated API callers cannot invoke transitions');

select * from finish();
rollback;
