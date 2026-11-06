import { describe, expect, it } from 'vitest';
import {
  availableTransitions,
  validateProject,
  validateTask,
  validateTransition,
} from './workflow';
import type { Profile, Task, TaskStatus } from './types';

const executor: Profile = { id: 'executor-1', full_name: 'Иван', role: 'executor' };
const manager: Profile = { id: 'manager-1', full_name: 'Анна', role: 'manager' };
const task = (
  status: TaskStatus,
  assignee_id = executor.id,
): Pick<Task, 'status' | 'assignee_id'> => ({ status, assignee_id });

describe('available task actions', () => {
  it.each([
    ['new', ['in_progress']],
    ['in_progress', ['in_review']],
    ['in_review', []],
    ['accepted', []],
    ['rework', ['in_progress']],
  ] as const)(
    'gives the assigned executor only permitted transitions from %s',
    (status, expected) => {
      expect(availableTransitions(executor, task(status)).map((action) => action.status)).toEqual(
        expected,
      );
    },
  );
  it.each(['new', 'in_progress', 'in_review', 'accepted', 'rework'] as const)(
    'gives no actions on another executor’s %s task',
    (status) => {
      expect(availableTransitions(executor, task(status, 'someone-else'))).toEqual([]);
    },
  );
  it('lets managers accept or request rework only during review', () => {
    expect(availableTransitions(manager, task('in_review')).map((action) => action.status)).toEqual(
      ['accepted', 'rework'],
    );
    for (const status of ['new', 'in_progress', 'accepted', 'rework'] as const) {
      expect(availableTransitions(manager, task(status))).toEqual([]);
    }
  });
});

describe('form validation', () => {
  it('requires a non-whitespace rework comment', () => {
    expect(validateTransition('rework', '  \n ')).toBeTruthy();
    expect(validateTransition('rework', 'Уточнить размеры')).toBeNull();
    expect(validateTransition('accepted', '')).toBeNull();
  });
  it('rejects empty fields before object creation', () => {
    expect(validateProject({ name: ' ', address: 'ул. Новая, 12' })).toBeTruthy();
    expect(validateProject({ name: 'Дом', address: ' ' })).toBeTruthy();
    expect(validateProject({ name: 'Дом', address: 'ул. Новая, 12' })).toBeNull();
  });
  it('rejects fields longer than database limits', () => {
    expect(validateProject({ name: 'x'.repeat(161), address: 'Адрес' })).toBeTruthy();
    expect(validateProject({ name: 'Объект', address: 'x'.repeat(301) })).toBeTruthy();
    expect(
      validateTask({ title: 'x'.repeat(201), description: '', project_id: 'p', assignee_id: 'e' }),
    ).toBeTruthy();
    expect(
      validateTask({
        title: 'Задача',
        description: 'x'.repeat(10001),
        project_id: 'p',
        assignee_id: 'e',
      }),
    ).toBeTruthy();
    expect(validateTransition('in_review', 'x'.repeat(5001))).toBeTruthy();
  });
  it('requires a selected object and assignee', () => {
    const data = {
      title: 'Проверить фасад',
      description: '',
      project_id: 'object-1',
      assignee_id: 'executor-1',
    };
    expect(validateTask(data)).toBeNull();
    expect(validateTask({ ...data, title: '  ' })).toBeTruthy();
    expect(validateTask({ ...data, project_id: '' })).toBeTruthy();
    expect(validateTask({ ...data, assignee_id: '' })).toBeTruthy();
  });
});
