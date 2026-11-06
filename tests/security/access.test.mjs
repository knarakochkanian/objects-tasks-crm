import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';

// These are real authenticated HTTP requests, never mocked database responses.
// Refuse cloud targets: tests intentionally exercise destructive permissions.
const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
assert.ok(url && anonKey, 'Run npm run setup:local first to configure local Supabase.');
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname),
  'Security tests are allowed only against a local Supabase instance.',
);

const clients = {};
const users = {};
const projects = new Set();
const anonymous = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const statuses = ['new', 'in_progress', 'in_review', 'accepted', 'rework'];
const allowed = {
  manager: new Set(['in_review:accepted', 'in_review:rework']),
  executor1: new Set(['new:in_progress', 'in_progress:in_review', 'rework:in_progress']),
  executor2: new Set(),
};

function result(response, context = 'API operation') {
  assert.equal(response.error, null, `${context}: ${response.error?.message}`);
  assert.ok(response.data, `${context}: expected returned record`);
  return response.data;
}

async function transition(client, task, next, comment = null) {
  return client.rpc('transition_task', {
    p_id: task.id,
    p_to_status: next,
    p_comment: comment,
    p_expected_version: task.version,
  });
}

async function makeProject() {
  const project = result(
    await clients.manager.rpc('create_project', {
      p_name: `Security test ${randomUUID()}`,
      p_address: 'Локальная тестовая площадка',
    }),
    'create project',
  );
  projects.add(project.id);
  return project;
}

async function makeTask(project, assignee = users.executor1.id, title = 'Проверить монтаж') {
  return result(
    await clients.manager.rpc('create_task', {
      p_project_id: project.id,
      p_title: title,
      p_description: 'Тест контроля доступа через публичный API.',
      p_assignee_id: assignee,
    }),
    'create task',
  );
}

async function atStatus(project, status) {
  let task = await makeTask(project);
  if (status !== 'new') task = result(await transition(clients.executor1, task, 'in_progress'));
  if (['in_review', 'accepted', 'rework'].includes(status)) {
    task = result(await transition(clients.executor1, task, 'in_review'));
  }
  if (status === 'accepted') task = result(await transition(clients.manager, task, 'accepted'));
  if (status === 'rework')
    task = result(await transition(clients.manager, task, 'rework', 'Исправить крепление'));
  return task;
}

async function getTask(id, client = clients.manager) {
  return result(await client.from('tasks').select('*').eq('id', id).single(), 'read task');
}

async function history(id, client = clients.manager) {
  return result(
    await client
      .from('task_history')
      .select('*')
      .eq('task_id', id)
      .order('created_at', { ascending: true }),
    'read history',
  );
}

async function expectHidden(client, table, id) {
  const response = await client.from(table).select('*').eq('id', id);
  assert.equal(response.error, null, response.error?.message);
  assert.deepEqual(response.data, [], `${table} ${id} should be hidden`);
}

function expectDenied(response, context) {
  assert.ok(response.error, `${context}: operation unexpectedly succeeded`);
}

function expectConflict(response, context) {
  assert.ok(response.error, `${context}: must reject the conflicting request`);
  assert.equal(response.status, 409, `${context}: must return an HTTP conflict without retries`);
  assert.equal(response.error.code, 'PT409', `${context}: must use a non-retryable conflict code`);
}

before(async () => {
  const accounts = JSON.parse(
    await readFile(new URL('../../.local/test-accounts.json', import.meta.url), 'utf8'),
  );
  for (const name of ['manager', 'manager2', 'executor1', 'executor2']) {
    assert.ok(accounts[name]?.email && accounts[name]?.password, `Missing account ${name}`);
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const auth = result(await client.auth.signInWithPassword(accounts[name]), `login ${name}`);
    assert.ok(auth.user?.id, `No authenticated user for ${name}`);
    clients[name] = client;
    users[name] = auth.user;
  }
});

after(async () => {
  // Only test-owned objects are removed; no existing user data is touched.
  for (const id of projects) {
    const response = await clients.manager
      ?.from('projects')
      .select('version')
      .eq('id', id)
      .maybeSingle();
    if (response?.data) {
      const deletion = await clients.manager.rpc('delete_project', {
        p_id: id,
        p_expected_version: response.data.version,
      });
      assert.equal(deletion.error, null, `fixture cleanup: ${deletion.error?.message}`);
    }
  }
  await Promise.all(
    Object.values(clients).map((client) => client.auth.signOut({ scope: 'local' })),
  );
});

test('anonymous callers cannot read company data or invoke mutations', async () => {
  for (const table of ['profiles', 'projects', 'tasks', 'task_history']) {
    const response = await anonymous.from(table).select('*').limit(1);
    assert.ok(response.error || response.data?.length === 0, `Anonymous read leaked ${table}`);
  }
  expectDenied(
    await anonymous.rpc('create_project', {
      p_name: 'Anonymous injection',
      p_address: 'Nowhere',
    }),
    'anonymous create project',
  );
});

test('public email registration is disabled at Auth API level', async () => {
  const response = await anonymous.auth.signUp({
    email: `signup-blocked-${randomUUID()}@example.test`,
    password: `Blocked-${randomUUID()}-9!`,
  });
  expectDenied(response, 'public signup');
  assert.equal(
    response.error.code,
    'signup_disabled',
    'Signup must be disabled, not merely rate-limited',
  );
  assert.equal(response.data.session, null);
  assert.equal(response.data.user, null);
});

test('an executor sees only own tasks, their history and participating objects', async () => {
  const shared = await makeProject();
  const hiddenProject = await makeProject();
  const owned = await makeTask(shared);
  const foreignShared = await makeTask(shared, users.executor2.id, 'Чужая задача на общем объекте');
  const foreignHidden = await makeTask(hiddenProject, users.executor2.id, 'Чужая стройка');
  assert.equal((await getTask(owned.id, clients.executor1)).id, owned.id);
  assert.equal(
    result(await clients.executor1.from('projects').select('*').eq('id', shared.id).single()).id,
    shared.id,
  );
  for (const task of [foreignShared, foreignHidden]) {
    await expectHidden(clients.executor1, 'tasks', task.id);
    const rows = result(
      await clients.executor1.from('task_history').select('*').eq('task_id', task.id),
    );
    assert.deepEqual(rows, [], 'Foreign task history must be hidden');
  }
  await expectHidden(clients.executor1, 'projects', hiddenProject.id);
  const nested = result(
    await clients.executor1
      .from('projects')
      .select('id,tasks(id,title)')
      .eq('id', shared.id)
      .single(),
  );
  assert.deepEqual(
    nested.tasks.map((task) => task.id),
    [owned.id],
    'Nested API select must preserve task RLS',
  );
});

test('executors cannot create, edit, delete or reassign through RPC', async () => {
  const project = await makeProject();
  const task = await makeTask(project);
  const operations = [
    ['create_project', { p_name: 'Forbidden', p_address: 'Forbidden' }],
    [
      'update_project',
      {
        p_id: project.id,
        p_name: 'Forbidden',
        p_address: 'Forbidden',
        p_expected_version: project.version,
      },
    ],
    ['delete_project', { p_id: project.id, p_expected_version: project.version }],
    [
      'create_task',
      {
        p_project_id: project.id,
        p_title: 'Forbidden',
        p_description: '',
        p_assignee_id: users.executor1.id,
      },
    ],
    [
      'update_task',
      {
        p_id: task.id,
        p_project_id: project.id,
        p_title: 'Forbidden',
        p_description: '',
        p_assignee_id: users.executor2.id,
        p_expected_version: task.version,
      },
    ],
    ['delete_task', { p_id: task.id, p_expected_version: task.version }],
  ];
  for (const [method, args] of operations) {
    expectDenied(await clients.executor1.rpc(method, args), `executor ${method}`);
  }
  const unchanged = await getTask(task.id);
  assert.equal(unchanged.title, task.title);
  assert.equal(unchanged.assignee_id, users.executor1.id);
  assert.equal(unchanged.version, task.version);
});

test('direct table mutation cannot bypass RPC or elevate profile role', async () => {
  const project = await makeProject();
  const task = await makeTask(project);
  for (const client of [clients.executor1, clients.manager]) {
    expectDenied(
      await client.from('tasks').update({ status: 'accepted' }).eq('id', task.id),
      'direct task status update',
    );
    expectDenied(
      await client
        .from('tasks')
        .update({ author_id: users.executor2.id, created_at: '2000-01-01T00:00:00Z' })
        .eq('id', task.id),
      'forged author/date',
    );
    expectDenied(await client.from('tasks').delete().eq('id', task.id), 'direct task delete');
    expectDenied(
      await client.from('tasks').insert({
        project_id: project.id,
        title: 'Injected',
        description: '',
        assignee_id: users.executor1.id,
        author_id: users.executor2.id,
        status: 'accepted',
      }),
      'direct task insert',
    );
    expectDenied(
      await client.from('projects').update({ name: 'Injected' }).eq('id', project.id),
      'direct project update',
    );
    expectDenied(
      await client.from('projects').delete().eq('id', project.id),
      'direct project delete',
    );
    expectDenied(
      await client.from('projects').insert({ name: 'Injected', address: 'Injected' }),
      'direct project insert',
    );
    expectDenied(
      await client.from('profiles').update({ role: 'manager' }).eq('id', users.executor1.id),
      'role escalation',
    );
    expectDenied(
      await client
        .from('profiles')
        .insert({ id: randomUUID(), full_name: 'Injected', role: 'manager' }),
      'profile insert',
    );
    expectDenied(
      await client.from('profiles').delete().eq('id', users.executor1.id),
      'profile deletion',
    );
  }
  assert.equal((await getTask(task.id)).status, 'new');
  assert.equal(
    result(
      await clients.manager.from('profiles').select('role').eq('id', users.executor1.id).single(),
    ).role,
    'executor',
  );
});

for (const role of ['manager', 'executor1', 'executor2']) {
  test(`database enforces all 25 status combinations for ${role}`, async () => {
    const project = await makeProject();
    for (const from of statuses) {
      for (const to of statuses) {
        const task = await atStatus(project, from);
        const beforeHistory = await history(task.id);
        const response = await transition(clients[role], task, to, 'Проверочный комментарий');
        const label = `${role}: ${from} → ${to}`;
        if (allowed[role].has(`${from}:${to}`)) {
          const updated = result(response, label);
          assert.equal(updated.status, to, label);
          assert.equal(updated.version, task.version + 1, label);
          const events = await history(task.id);
          assert.equal(events.length, beforeHistory.length + 1, label);
          assert.equal(events.at(-1).actor_id, users[role].id, label);
        } else {
          expectDenied(response, label);
          const unchanged = await getTask(task.id);
          assert.equal(unchanged.status, from, label);
          assert.equal(unchanged.version, task.version, label);
          assert.equal((await history(task.id)).length, beforeHistory.length, label);
        }
      }
    }
  });
}

test('return for rework rejects every blank comment without partial changes', async () => {
  const project = await makeProject();
  const task = await atStatus(project, 'in_review');
  const beforeHistory = await history(task.id);
  // ECMAScript whitespace includes BOM and NBSP; the direct API must reject
  // invisible comments exactly as the browser's trim() validation does.
  const unicodeWhitespace =
    '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
  for (const comment of [
    null,
    '',
    '   ',
    '\t',
    '\n',
    ' \t\n\r ',
    '\ufeff',
    '\u00a0',
    unicodeWhitespace,
  ]) {
    expectDenied(
      await transition(clients.manager, task, 'rework', comment),
      'empty rework comment',
    );
    assert.equal((await getTask(task.id)).status, 'in_review');
    assert.equal((await history(task.id)).length, beforeHistory.length);
  }
  const updated = result(
    await transition(
      clients.manager2,
      task,
      'rework',
      `${unicodeWhitespace}Устранить перекос${unicodeWhitespace}`,
    ),
  );
  assert.equal(updated.status, 'rework');
  assert.equal((await history(task.id)).at(-1).comment, 'Устранить перекос');
});

test('history records the full lifecycle with trustworthy actors and timestamps', async () => {
  const project = await makeProject();
  const startedAt = Date.now() - 2000;
  let task = await makeTask(project);
  task = result(await transition(clients.executor1, task, 'in_progress'));
  task = result(await transition(clients.executor1, task, 'in_review', 'Монтаж завершён'));
  task = result(await transition(clients.manager2, task, 'rework', 'Исправить крепёж'));
  task = result(await transition(clients.executor1, task, 'in_progress'));
  task = result(await transition(clients.executor1, task, 'in_review'));
  task = result(await transition(clients.manager, task, 'accepted'));
  const events = await history(task.id);
  assert.deepEqual(
    events.map((event) => [event.from_status, event.to_status, event.actor_id, event.comment]),
    [
      [null, 'new', users.manager.id, null],
      ['new', 'in_progress', users.executor1.id, null],
      ['in_progress', 'in_review', users.executor1.id, 'Монтаж завершён'],
      ['in_review', 'rework', users.manager2.id, 'Исправить крепёж'],
      ['rework', 'in_progress', users.executor1.id, null],
      ['in_progress', 'in_review', users.executor1.id, null],
      ['in_review', 'accepted', users.manager.id, null],
    ],
  );
  assert.equal(new Set(events.map((event) => event.id)).size, events.length);
  for (const event of events) {
    assert.ok(
      Date.parse(event.created_at) >= startedAt &&
        Date.parse(event.created_at) <= Date.now() + 2000,
    );
  }
  assert.deepEqual(await history(task.id, clients.executor1), events);
  assert.equal(task.author_id, users.manager.id);
  assert.equal(
    (await getTask(task.id)).status,
    'accepted',
    'Status must persist in a separate read',
  );
});

test('neither role can forge, edit or delete history through the API', async () => {
  const project = await makeProject();
  const task = await makeTask(project);
  const events = await history(task.id);
  for (const client of [clients.executor1, clients.manager]) {
    expectDenied(
      await client.from('task_history').insert({
        task_id: task.id,
        actor_id: users.manager.id,
        from_status: 'new',
        to_status: 'accepted',
        comment: 'Forged',
        created_at: '2000-01-01T00:00:00Z',
      }),
      'history insert',
    );
    expectDenied(
      await client.from('task_history').update({ comment: 'Tampered' }).eq('id', events[0].id),
      'history update',
    );
    expectDenied(
      await client.from('task_history').delete().eq('id', events[0].id),
      'history delete',
    );
  }
  assert.deepEqual(await history(task.id), events);
});

test('task edits preserve authorship and status; reassignment immediately changes visibility', async () => {
  const project = await makeProject();
  let task = await atStatus(project, 'in_progress');
  const original = { ...task };
  task = result(
    await clients.manager2.rpc('update_task', {
      p_id: task.id,
      p_project_id: project.id,
      p_title: 'Новое название',
      p_description: 'Уточнённое описание',
      p_assignee_id: users.executor2.id,
      p_expected_version: task.version,
    }),
  );
  assert.equal(task.title, 'Новое название');
  assert.equal(task.description, 'Уточнённое описание');
  assert.equal(task.author_id, original.author_id);
  assert.equal(task.created_at, original.created_at);
  assert.equal(task.status, 'in_progress');
  assert.equal(task.version, original.version + 1);
  await expectHidden(clients.executor1, 'tasks', task.id);
  await expectHidden(clients.executor1, 'projects', project.id);
  assert.deepEqual(
    result(await clients.executor1.from('task_history').select('*').eq('task_id', task.id)),
    [],
  );
  expectDenied(await transition(clients.executor1, task, 'in_review'), 'old assignee transition');
  assert.equal((await getTask(task.id, clients.executor2)).assignee_id, users.executor2.id);
  assert.equal((await history(task.id, clients.executor2)).length, 2);
  assert.equal(result(await transition(clients.executor2, task, 'in_review')).status, 'in_review');
});

test('stale versions block task edits, transitions and deletion', async () => {
  const project = await makeProject();
  const original = await makeTask(project);
  const current = result(
    await clients.manager.rpc('update_task', {
      p_id: original.id,
      p_project_id: project.id,
      p_title: 'Обновлено руководителем',
      p_description: '',
      p_assignee_id: users.executor1.id,
      p_expected_version: original.version,
    }),
  );
  expectConflict(
    await clients.manager2.rpc('update_task', {
      p_id: original.id,
      p_project_id: project.id,
      p_title: 'Устаревший экран',
      p_description: '',
      p_assignee_id: users.executor2.id,
      p_expected_version: original.version,
    }),
    'stale task edit',
  );
  expectConflict(await transition(clients.executor1, original, 'in_progress'), 'stale transition');
  expectConflict(
    await clients.manager.rpc('delete_task', {
      p_id: original.id,
      p_expected_version: original.version,
    }),
    'stale task deletion',
  );
  expectDenied(
    await clients.executor1.rpc('transition_task', {
      p_id: original.id,
      p_to_status: 'in_progress',
    }),
    'missing expected version',
  );
  assert.equal((await getTask(original.id)).title, current.title);
  assert.equal((await getTask(original.id)).status, 'new');
});

test('two concurrent transitions cannot both commit or create duplicate audit events', async () => {
  const project = await makeProject();
  const task = await makeTask(project);
  const responses = await Promise.all([
    transition(clients.executor1, task, 'in_progress'),
    transition(clients.executor1, task, 'in_progress'),
  ]);
  assert.equal(responses.filter((response) => !response.error).length, 1);
  assert.equal(responses.filter((response) => response.error).length, 1);
  expectConflict(
    responses.find((response) => response.error),
    'concurrent transition loser',
  );
  assert.equal((await getTask(task.id)).version, task.version + 1);
  assert.equal((await history(task.id)).length, 2);
});

test('project stale edits and deletion are rejected; task movement updates object access', async () => {
  const first = await makeProject();
  const second = await makeProject();
  const task = await makeTask(first);
  const changedProject = result(
    await clients.manager2.rpc('update_project', {
      p_id: first.id,
      p_name: 'Новое имя объекта',
      p_address: 'Новый адрес',
      p_expected_version: first.version,
    }),
  );
  assert.equal(changedProject.name, 'Новое имя объекта');
  assert.equal(changedProject.version, first.version + 1);
  expectConflict(
    await clients.manager.rpc('update_project', {
      p_id: first.id,
      p_name: 'Устаревшее имя',
      p_address: 'Старый адрес',
      p_expected_version: first.version,
    }),
    'stale project update',
  );
  expectConflict(
    await clients.manager.rpc('delete_project', {
      p_id: first.id,
      p_expected_version: first.version,
    }),
    'stale project delete',
  );
  const moved = result(
    await clients.manager.rpc('update_task', {
      p_id: task.id,
      p_project_id: second.id,
      p_title: task.title,
      p_description: task.description,
      p_assignee_id: task.assignee_id,
      p_expected_version: task.version,
    }),
  );
  assert.equal(moved.project_id, second.id);
  await expectHidden(clients.executor1, 'projects', first.id);
  assert.equal(
    result(await clients.executor1.from('projects').select('id').eq('id', second.id).single()).id,
    second.id,
  );
});

test('database validates blank names, unknown assignees and manager assignees', async () => {
  const project = await makeProject();
  for (const name of ['', '  ', '\t\n', '\ufeff', '\u00a0']) {
    expectDenied(
      await clients.manager.rpc('create_project', { p_name: name, p_address: 'Адрес' }),
      'blank project name',
    );
    expectDenied(
      await clients.manager.rpc('create_task', {
        p_project_id: project.id,
        p_title: name,
        p_description: '',
        p_assignee_id: users.executor1.id,
      }),
      'blank task title',
    );
  }
  for (const assignee of [users.manager.id, randomUUID()]) {
    expectDenied(
      await clients.manager.rpc('create_task', {
        p_project_id: project.id,
        p_title: 'Некорректный исполнитель',
        p_description: '',
        p_assignee_id: assignee,
      }),
      'invalid assignee',
    );
  }
});

test('deleted tasks disappear from reads and cannot transition, edit or be resurrected', async () => {
  const project = await makeProject();
  const task = await makeTask(project);
  const deletion = await clients.manager2.rpc('delete_task', {
    p_id: task.id,
    p_expected_version: task.version,
  });
  assert.equal(deletion.error, null, deletion.error?.message);
  for (const client of [clients.manager, clients.executor1]) {
    await expectHidden(client, 'tasks', task.id);
    assert.deepEqual(
      result(await client.from('task_history').select('*').eq('task_id', task.id)),
      [],
    );
  }
  await expectHidden(clients.executor1, 'projects', project.id);
  expectDenied(await transition(clients.executor1, task, 'in_progress'), 'deleted task transition');
  expectDenied(
    await clients.manager.rpc('update_task', {
      p_id: task.id,
      p_project_id: project.id,
      p_title: 'Восстановление',
      p_description: '',
      p_assignee_id: users.executor1.id,
      p_expected_version: task.version,
    }),
    'deleted task edit',
  );
  expectDenied(
    await clients.manager.from('tasks').update({ deleted_at: null }).eq('id', task.id),
    'task resurrection',
  );
});

test('deleted objects hide their tasks and cannot accept new or moved tasks', async () => {
  const project = await makeProject();
  const task = await makeTask(project);
  const otherProject = await makeProject();
  const otherTask = await makeTask(otherProject);
  const deletion = await clients.manager.rpc('delete_project', {
    p_id: project.id,
    p_expected_version: project.version,
  });
  assert.equal(deletion.error, null, deletion.error?.message);
  for (const client of [clients.manager, clients.executor1]) {
    await expectHidden(client, 'projects', project.id);
    await expectHidden(client, 'tasks', task.id);
    assert.deepEqual(
      result(await client.from('task_history').select('*').eq('task_id', task.id)),
      [],
    );
  }
  expectDenied(
    await clients.manager.rpc('create_task', {
      p_project_id: project.id,
      p_title: 'Нельзя создать',
      p_description: '',
      p_assignee_id: users.executor1.id,
    }),
    'task in deleted project',
  );
  expectDenied(
    await clients.manager.rpc('update_task', {
      p_id: otherTask.id,
      p_project_id: project.id,
      p_title: otherTask.title,
      p_description: otherTask.description,
      p_assignee_id: users.executor1.id,
      p_expected_version: otherTask.version,
    }),
    'move task to deleted project',
  );
  expectDenied(
    await transition(clients.executor1, task, 'in_progress'),
    'transition in deleted project',
  );
  expectDenied(
    await clients.manager.from('projects').update({ deleted_at: null }).eq('id', project.id),
    'project resurrection',
  );
});

test('self-editable Auth metadata cannot grant manager permissions', async () => {
  const { error } = await clients.executor1.auth.updateUser({ data: { role: 'manager' } });
  assert.equal(error, null, error?.message);
  try {
    expectDenied(
      await clients.executor1.rpc('create_project', {
        p_name: 'Подмена роли через метаданные',
        p_address: 'Запрещено',
      }),
      'Auth metadata role escalation',
    );
    assert.equal(
      result(
        await clients.executor1
          .from('profiles')
          .select('role')
          .eq('id', users.executor1.id)
          .single(),
      ).role,
      'executor',
    );
  } finally {
    const cleanup = await clients.executor1.auth.updateUser({ data: { role: null } });
    assert.equal(cleanup.error, null, cleanup.error?.message);
  }
});

test('null or malformed status inputs fail without changing task or history', async () => {
  const project = await makeProject();
  const task = await makeTask(project);
  for (const status of [null, 'unknown_status']) {
    expectDenied(await transition(clients.executor1, task, status), `invalid status ${status}`);
  }
  expectDenied(
    await clients.executor1.rpc('transition_task', {
      p_id: task.id,
      p_to_status: 'in_progress',
      p_expected_version: null,
    }),
    'explicit null expected version',
  );
  assert.equal((await getTask(task.id)).status, 'new');
  assert.equal((await history(task.id)).length, 1);
});

test('concurrent reassignment and executor transition cannot both apply to the same version', async () => {
  const project = await makeProject();
  const task = await makeTask(project);
  const [reassignment, progress] = await Promise.all([
    clients.manager.rpc('update_task', {
      p_id: task.id,
      p_project_id: project.id,
      p_title: task.title,
      p_description: task.description,
      p_assignee_id: users.executor2.id,
      p_expected_version: task.version,
    }),
    transition(clients.executor1, task, 'in_progress'),
  ]);
  assert.equal([reassignment, progress].filter((response) => !response.error).length, 1);
  const current = await getTask(task.id);
  assert.equal(current.version, task.version + 1);
  if (!reassignment.error) {
    assert.equal(current.assignee_id, users.executor2.id);
    assert.equal(current.status, 'new');
    assert.equal((await history(task.id)).length, 1);
    await expectHidden(clients.executor1, 'tasks', task.id);
  } else {
    assert.equal(current.assignee_id, users.executor1.id);
    assert.equal(current.status, 'in_progress');
    assert.equal((await history(task.id)).length, 2);
  }
});

test('concurrent project deletion and task creation leave no accessible orphan task', async () => {
  const project = await makeProject();
  const [creation, deletion] = await Promise.all([
    clients.manager.rpc('create_task', {
      p_project_id: project.id,
      p_title: 'Одновременное создание',
      p_description: '',
      p_assignee_id: users.executor1.id,
    }),
    clients.manager2.rpc('delete_project', {
      p_id: project.id,
      p_expected_version: project.version,
    }),
  ]);
  assert.equal(deletion.error, null, deletion.error?.message);
  await expectHidden(clients.manager, 'projects', project.id);
  assert.deepEqual(
    result(await clients.manager.from('tasks').select('*').eq('project_id', project.id)),
    [],
  );
  if (!creation.error) {
    await expectHidden(clients.manager, 'tasks', creation.data.id);
    expectDenied(
      await transition(clients.executor1, creation.data, 'in_progress'),
      'orphan transition',
    );
  }
});
