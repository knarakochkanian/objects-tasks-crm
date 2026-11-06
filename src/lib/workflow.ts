import type { Profile, Task, TaskStatus, ProjectInput, TaskInput } from './types';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  in_review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
};
export const STATUSES = Object.keys(STATUS_LABELS) as TaskStatus[];
export interface TransitionAction {
  status: TaskStatus;
  label: string;
}

export function availableTransitions(
  profile: Profile,
  task: Pick<Task, 'status' | 'assignee_id'>,
): TransitionAction[] {
  if (profile.role === 'manager')
    return task.status === 'in_review'
      ? [
          { status: 'accepted', label: 'Принять задачу' },
          { status: 'rework', label: 'Вернуть на доработку' },
        ]
      : [];
  if (task.assignee_id !== profile.id) return [];
  if (task.status === 'new' || task.status === 'rework')
    return [{ status: 'in_progress', label: 'Взять в работу' }];
  if (task.status === 'in_progress')
    return [{ status: 'in_review', label: 'Отправить на проверку' }];
  return [];
}
export function validateProject(input: ProjectInput): string | null {
  if (!input.name.trim()) return 'Укажите название объекта.';
  if (input.name.trim().length > 160)
    return 'Название объекта должно быть не длиннее 160 символов.';
  if (!input.address.trim()) return 'Укажите адрес объекта.';
  if (input.address.trim().length > 300) return 'Адрес должен быть не длиннее 300 символов.';
  return null;
}
export function validateTask(input: TaskInput): string | null {
  if (!input.title.trim()) return 'Укажите название задачи.';
  if (input.title.trim().length > 200)
    return 'Название задачи должно быть не длиннее 200 символов.';
  if (input.description.trim().length > 10000)
    return 'Описание должно быть не длиннее 10 000 символов.';
  if (!input.project_id) return 'Выберите объект.';
  if (!input.assignee_id) return 'Назначьте исполнителя.';
  return null;
}
export function validateTransition(status: TaskStatus, comment: string): string | null {
  if (comment.trim().length > 5000) return 'Комментарий должен быть не длиннее 5 000 символов.';
  return status === 'rework' && !comment.trim() ? 'Напишите, что нужно доработать.' : null;
}
