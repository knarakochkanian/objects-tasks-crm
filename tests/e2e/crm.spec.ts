import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

type Account = { id: string; email: string; password: string; name: string };
const accounts = JSON.parse(readFileSync('.local/test-accounts.json', 'utf8')) as Record<
  string,
  Account
>;
const url = process.env.VITE_SUPABASE_URL!;
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
  throw new Error('E2E tests require local Supabase.');
const clients: Record<string, SupabaseClient> = {};
const projectIds = new Set<string>();

function data<T = any>(response: { data: T; error: any }): NonNullable<T> {
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}
async function login(page: Page, who: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(accounts[who].email);
  await page.getByLabel('Пароль', { exact: true }).fill(accounts[who].password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
}
async function fixture(who = 'executor1') {
  const project = data(
    await clients.manager.rpc('create_project', {
      p_name: `Браузерная проверка ${randomUUID().slice(0, 8)}`,
      p_address: 'Ереван, Тестовая улица, 12',
    }),
  );
  projectIds.add(project.id);
  const task = data(
    await clients.manager.rpc('create_task', {
      p_project_id: project.id,
      p_title: `Проверить перекрытие ${randomUUID().slice(0, 8)}`,
      p_description: 'Проверить соответствие рабочему чертежу.',
      p_assignee_id: accounts[who].id,
    }),
  );
  return { project, task };
}
async function transition(who: string, task: any, status: string, comment: string | null = null) {
  return data(
    await clients[who].rpc('transition_task', {
      p_id: task.id,
      p_to_status: status,
      p_comment: comment,
      p_expected_version: task.version,
    }),
  );
}

test.beforeAll(async () => {
  for (const who of ['manager', 'manager2', 'executor1', 'executor2']) {
    const client = createClient(url, process.env.VITE_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    data(await client.auth.signInWithPassword(accounts[who]));
    clients[who] = client;
  }
});
test.afterAll(async () => {
  for (const id of projectIds) {
    const current = data(
      await clients.manager.from('projects').select('version').eq('id', id).maybeSingle(),
    );
    if (current)
      data(
        await clients.manager.rpc('delete_project', {
          p_id: id,
          p_expected_version: current.version,
        }),
      );
  }
  await Promise.all(
    Object.values(clients).map((client) => client.auth.signOut({ scope: 'local' })),
  );
});

test('login errors are visible; session survives reload; logout clears the previous role', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(accounts.manager.email);
  await page.getByLabel('Пароль', { exact: true }).fill('Deliberately-Wrong-Password!');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Неверный email или пароль');
  await page.getByLabel('Пароль', { exact: true }).fill(accounts.manager.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Объекты', exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Создать объект', exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await login(page, 'executor1');
  await expect(page.getByRole('heading', { name: 'Мои задачи', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Объекты', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Создать объект', exact: true })).toHaveCount(0);
});

test('manager creates, edits and removes an object and task through the interface', async ({
  page,
}) => {
  await login(page, 'manager');
  const name = `Монтажный участок ${randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: 'Создать объект', exact: true }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название объекта').fill(name);
  await dialog.getByLabel('Адрес', { exact: true }).fill('Ереван, проспект Комитаса, 42');
  await dialog.getByRole('button', { name: 'Создать объект', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  projectIds.add(new URL(page.url()).pathname.split('/').at(-1)!);
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Адрес', { exact: true }).fill('Ереван, проспект Комитаса, 44');
  await dialog.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(page.getByText('Ереван, проспект Комитаса, 44', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Создать задачу', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название задачи').fill('Проверить установку опалубки');
  await dialog.getByLabel(/Описание/).fill('Сверить отметки по проекту.');
  await dialog.getByLabel('Исполнитель', { exact: true }).selectOption(accounts.executor1.id);
  await dialog.getByRole('button', { name: 'Создать задачу', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Проверить установку опалубки', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название задачи').fill('Проверить опалубку второго этажа');
  await dialog.getByLabel('Исполнитель', { exact: true }).selectOption(accounts.executor2.id);
  await dialog.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Проверить опалубку второго этажа', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(accounts.executor2.name, { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Удалить задачу', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText('Проверить опалубку второго этажа', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Удалить объект', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Объекты', exact: true })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
});

test('executor and manager complete rework cycle with mandatory comment and persisted history', async ({
  browser,
}) => {
  const { task } = await fixture();
  const executorContext = await browser.newContext();
  const managerContext = await browser.newContext();
  const executor = await executorContext.newPage();
  const manager = await managerContext.newPage();
  // Keep this handoff asynchronous even on a fast local database.
  await manager.route('**/rest/v1/rpc/transition_task', async (route) => {
    if (route.request().postDataJSON()?.p_to_status === 'rework')
      await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  try {
    await login(executor, 'executor1');
    await executor.goto(`/tasks/${task.id}`);
    await expect(executor.getByRole('button', { name: 'Редактировать', exact: true })).toHaveCount(
      0,
    );
    await executor.getByRole('button', { name: 'Взять в работу', exact: true }).click();
    await executor.getByRole('button', { name: 'Отправить на проверку', exact: true }).click();
    await expect(executor.getByRole('status')).toHaveText('Статус задачи обновлён.');
    await expect(executor.locator('.title-status')).toContainText('На проверке');
    await expect(executor.getByRole('button', { name: 'Принять задачу', exact: true })).toHaveCount(
      0,
    );
    await login(manager, 'manager');
    await manager.goto(`/tasks/${task.id}`);
    await manager.getByRole('button', { name: 'Вернуть на доработку', exact: true }).click();
    const comment = manager.getByLabel(/Комментарий/);
    await expect(comment).toBeVisible();
    await expect(manager.getByRole('alert')).toBeVisible();
    expect(
      data(await clients.manager.from('tasks').select('status').eq('id', task.id).single()).status,
    ).toBe('in_review');
    await comment.fill('Уточните отметки и приложите результат повторной проверки.');
    await manager.getByRole('button', { name: 'Вернуть на доработку', exact: true }).click();
    await expect(manager.getByRole('status')).toHaveText('Статус задачи обновлён.');
    await expect(manager.locator('.title-status')).toContainText('На доработке');
    await expect(
      manager
        .locator('.history-list')
        .getByText('Уточните отметки и приложите результат повторной проверки.', { exact: true }),
    ).toBeVisible();
    await executor.reload();
    await expect(
      executor
        .locator('.history-list')
        .getByText('Уточните отметки и приложите результат повторной проверки.', { exact: true }),
    ).toBeVisible();
    await executor.getByRole('button', { name: /Взять в работу|Продолжить работу/ }).click();
    await executor.getByRole('button', { name: 'Отправить на проверку', exact: true }).click();
    await expect(executor.getByRole('status')).toHaveText('Статус задачи обновлён.');
    await expect(executor.locator('.title-status')).toContainText('На проверке');
    await manager.reload();
    await manager.getByRole('button', { name: 'Принять задачу', exact: true }).click();
    await expect(manager.getByRole('status')).toHaveText('Статус задачи обновлён.');
    await expect(manager.locator('.title-status')).toContainText('Принята');
    await expect(manager.getByRole('button', { name: 'Принять задачу', exact: true })).toHaveCount(
      0,
    );
    await executor.reload();
    await expect(executor.getByRole('button', { name: 'Взять в работу', exact: true })).toHaveCount(
      0,
    );
    const persisted = data(
      await clients.manager.from('tasks').select('status').eq('id', task.id).single(),
    );
    expect(persisted.status).toBe('accepted');
    const history = data(
      await clients.executor1
        .from('task_history')
        .select('*')
        .eq('task_id', task.id)
        .order('created_at'),
    );
    expect(history.map((entry: any) => entry.to_status)).toEqual([
      'new',
      'in_progress',
      'in_review',
      'rework',
      'in_progress',
      'in_review',
      'accepted',
    ]);
    expect(history[3].comment).toBe('Уточните отметки и приложите результат повторной проверки.');
  } finally {
    await executorContext.close();
    await managerContext.close();
  }
});

test('foreign task deep links stay inaccessible, including on mobile', async ({ page }) => {
  const { task, project } = await fixture('executor2');
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'executor1');
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByRole('heading', { name: /Задача недоступна/ })).toBeVisible();
  await expect(page.getByText(task.title, { exact: true })).toHaveCount(0);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole('heading', { name: /Объект недоступен/ })).toBeVisible();
  await page.goto('/my-tasks');
  await expect(page.getByRole('heading', { name: 'Мои задачи', exact: true })).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
});

test('stale acceptance is rejected visibly and refreshed data can be acted on', async ({
  page,
}) => {
  let { task } = await fixture();
  task = await transition('executor1', task, 'in_progress');
  task = await transition('executor1', task, 'in_review');
  await login(page, 'manager');
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByRole('button', { name: 'Принять задачу', exact: true })).toBeVisible();
  data(
    await clients.manager2.rpc('update_task', {
      p_id: task.id,
      p_project_id: task.project_id,
      p_title: task.title,
      p_description: 'Описание уточнено другим постановщиком.',
      p_assignee_id: task.assignee_id,
      p_expected_version: task.version,
    }),
  );
  await page.getByRole('button', { name: 'Принять задачу', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('уже изменена');
  await expect(
    page.getByText('Описание уточнено другим постановщиком.', { exact: true }),
  ).toBeVisible();
  const unchanged = data(
    await clients.manager.from('tasks').select('status').eq('id', task.id).single(),
  );
  expect(unchanged.status).toBe('in_review');
  await page.getByRole('button', { name: 'Принять задачу', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Принять задачу', exact: true })).toHaveCount(0);
});
