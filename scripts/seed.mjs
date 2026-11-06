import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from './local-stack.mjs';

const status = localStatus();
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await mkdir('.local', { recursive: true });
let accounts;
try {
  accounts = JSON.parse(await readFile('.local/test-accounts.json', 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  accounts = Object.fromEntries(
    [
      ['manager', 'manager@crm.test', 'Алексей Морозов', 'manager'],
      ['manager2', 'manager2@crm.test', 'Мария Волкова', 'manager'],
      ['executor1', 'ivan@crm.test', 'Иван Петров', 'executor'],
      ['executor2', 'anna@crm.test', 'Анна Смирнова', 'executor'],
    ].map(([key, email, name, role]) => [
      key,
      { email, name, role, password: `Crm-${randomBytes(12).toString('base64url')}!` },
    ]),
  );
}
// Persist generated credentials before any account is created so retries are safe.
await writeFile('.local/test-accounts.json', `${JSON.stringify(accounts, null, 2)}\n`, {
  mode: 0o600,
});
function unwrap(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
const clients = {};
for (const [key, account] of Object.entries(accounts)) {
  // Only local development users are provisioned. Existing passwords are retained.
  const created = await admin.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
  });
  if (
    created.error &&
    !['email_exists', 'email_address_exists'].includes(created.error.code) &&
    !/already.*registered|already.*exists/i.test(created.error.message)
  ) {
    throw new Error(created.error.message);
  }
  const client = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = unwrap(
    await client.auth.signInWithPassword({ email: account.email, password: account.password }),
  );
  account.id = signedIn.user.id;
  unwrap(
    await admin
      .from('profiles')
      .upsert({ id: account.id, full_name: account.name, role: account.role }),
  );
  clients[key] = client;
}
await writeFile('.local/test-accounts.json', `${JSON.stringify(accounts, null, 2)}\n`, {
  mode: 0o600,
});
const existing = unwrap(await clients.manager.from('projects').select('id').limit(1));
if (existing.length === 0) {
  const specs = [
    [
      'ЖК «Северный парк»',
      'Москва, ул. Лесная, 24',
      [
        [
          'Проверить армирование перекрытия',
          'Проверить шаг и диаметр арматуры на третьем этаже. Сверить с рабочими чертежами и зафиксировать замечания.',
          'executor1',
          'new',
        ],
        [
          'Подготовить акт скрытых работ',
          'Собрать документы по гидроизоляции подвала и передать комплект на проверку.',
          'executor1',
          'in_review',
        ],
        [
          'Принять поставку кирпича',
          'Сверить количество и маркировку с накладной. Осмотреть упаковку на повреждения.',
          'executor2',
          'in_progress',
        ],
      ],
    ],
    [
      'Бизнес-центр «Горизонт»',
      'Москва, пр-т Мира, 102',
      [
        [
          'Уточнить схему электропроводки',
          'Обновить схему первого этажа с учётом расположения переговорных.',
          'executor2',
          'rework',
        ],
        [
          'Проверить монтаж вентиляции',
          'Осмотреть крепления и соединения воздуховодов. Подготовить замечания для подрядчика.',
          'executor1',
          'accepted',
        ],
      ],
    ],
    [
      'Складской комплекс «Восток»',
      'Балашиха, шоссе Энтузиастов, 8',
      [
        [
          'Подготовить площадку к приёмке',
          'Проверить ограждение, убрать строительный мусор и обозначить зоны разгрузки.',
          'executor2',
          'new',
        ],
        [
          'Согласовать график бетонных работ',
          'Уточнить время поставки и готовность бригады. Подготовить график на следующую неделю.',
          'executor2',
          'in_review',
        ],
      ],
    ],
  ];
  for (const [name, address, taskSpecs] of specs) {
    const project = unwrap(
      await clients.manager.rpc('create_project', { p_name: name, p_address: address }),
    );
    for (const [title, description, who, target] of taskSpecs) {
      let task = unwrap(
        await clients.manager.rpc('create_task', {
          p_project_id: project.id,
          p_title: title,
          p_description: description,
          p_assignee_id: accounts[who].id,
        }),
      );
      const steps =
        target === 'new'
          ? []
          : target === 'in_progress'
            ? ['in_progress']
            : target === 'in_review'
              ? ['in_progress', 'in_review']
              : ['in_progress', 'in_review', target];
      for (const next of steps) {
        const actor = ['accepted', 'rework'].includes(next) ? clients.manager : clients[who];
        task = unwrap(
          await actor.rpc('transition_task', {
            p_id: task.id,
            p_to_status: next,
            p_comment:
              next === 'rework'
                ? 'Добавьте отдельные линии питания для переговорных и проверьте маркировку.'
                : null,
            p_expected_version: task.version,
          }),
        );
      }
    }
  }
  console.log('Созданы 3 объекта и 7 задач во всех статусах.');
} else {
  console.log('В базе уже есть объекты. Текущие данные сохранены.');
}
console.log(
  'Готово: 2 постановщика и 2 исполнителя. Доступы сохранены в .local/test-accounts.json (файл исключён из Git).',
);
