-- Business conflicts must terminate as HTTP 409 rather than being retried as
-- PostgreSQL serialization failures. Every fixture is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

select throws_ok($$select private.check_version(2, 1)$$, 'PT409', null,
  'A stale version returns the non-retryable conflict code');
select lives_ok($$select private.check_version(2, 2)$$,
  'The current version remains valid');
select throws_ok($$select private.check_version(2, null)$$, '22023', null,
  'A missing version remains a validation error');

insert into auth.users (id, instance_id, aud, role, email)
values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conflict-manager@db-test.invalid'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conflict-executor@db-test.invalid');
insert into public.profiles (id, full_name, role) values
  ('20000000-0000-4000-8000-000000000001', 'Тестовый постановщик', 'manager'),
  ('20000000-0000-4000-8000-000000000002', 'Тестовый исполнитель', 'executor');

set local request.jwt.claims = '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}';
create temporary table conflict_test_state (project_id uuid, task_id uuid);
insert into conflict_test_state (project_id)
  select (public.create_project('Проверка конфликта', 'Тестовый адрес')).id;
update conflict_test_state set task_id = (public.create_task(project_id, 'Исходная задача', '', '20000000-0000-4000-8000-000000000002')).id;

select throws_ok(
  $$update public.tasks set title = 'Недопустимое изменение', version = version + 2
    where id = (select task_id from conflict_test_state)$$,
  'PT409', null, 'The defensive trigger also rejects an invalid version without a retryable error');
select is((select version from public.tasks where id = (select task_id from conflict_test_state)), 1,
  'A rejected version update leaves the stored version unchanged');
select is((select title from public.tasks where id = (select task_id from conflict_test_state)), 'Исходная задача',
  'A rejected version update cannot partially change task contents');
select is((select count(*) from public.task_history where task_id = (select task_id from conflict_test_state)), 1::bigint,
  'A rejected version update creates no history entry');

select * from finish();
rollback;
