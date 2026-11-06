import { useId, useState, type FormEvent } from 'react';
import { Button, ErrorNotice, Loading, Modal } from '../../components/UI';
import { api } from '../../lib/api';
import { useCrmMutation, useProfiles, useProjects } from '../../lib/queries';
import type { Task, TaskInput } from '../../lib/types';
import { validateTask } from '../../lib/workflow';

export function TaskForm({
  task,
  projectId,
  onClose,
  onSaved,
}: {
  task?: Task;
  projectId?: string;
  onClose: () => void;
  onSaved: (task: Task) => void;
}) {
  const formId = useId();
  const [original] = useState(task);
  const projects = useProjects();
  const profiles = useProfiles();
  const [input, setInput] = useState<TaskInput>({
    title: task?.title ?? '',
    description: task?.description ?? '',
    project_id: task?.project_id ?? projectId ?? '',
    assignee_id: task?.assignee_id ?? '',
  });
  const [validation, setValidation] = useState<string | null>(null);
  const save = useCrmMutation((values: TaskInput) => api.saveTask(values, original));
  const unavailable =
    projects.isPending || profiles.isPending || projects.isError || profiles.isError;
  const executors = (profiles.data ?? []).filter((profile) => profile.role === 'executor');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending || unavailable) return;
    const issue = validateTask(input);
    setValidation(issue);
    if (issue) return;
    try {
      onSaved(await save.mutateAsync(input));
    } catch {
      /* Mutation error is rendered below. */
    }
  }
  return (
    <Modal
      title={task ? 'Редактировать задачу' : 'Новая задача'}
      onClose={onClose}
      busy={save.isPending}
    >
      <form onSubmit={submit}>
        <div className="modal-body form-stack">
          {unavailable &&
            (projects.isError || profiles.isError ? (
              <ErrorNotice
                error={projects.error || profiles.error}
                retry={() => {
                  void projects.refetch();
                  void profiles.refetch();
                }}
              />
            ) : (
              <Loading />
            ))}
          <div className="form-field">
            <label htmlFor={`${formId}-title`}>Название задачи</label>
            <input
              id={`${formId}-title`}
              autoFocus
              name="title"
              value={input.title}
              onChange={(event) => setInput({ ...input, title: event.target.value })}
              maxLength={200}
              placeholder="Что нужно сделать?"
              required
              disabled={save.isPending}
            />
          </div>
          <div className="form-field">
            <div className="field-label">
              <label htmlFor={`${formId}-description`}>Описание</label>
              <span className="label-hint" id={`${formId}-description-hint`}>
                необязательно
              </span>
            </div>
            <textarea
              id={`${formId}-description`}
              aria-describedby={`${formId}-description-hint`}
              name="description"
              rows={4}
              value={input.description}
              onChange={(event) => setInput({ ...input, description: event.target.value })}
              maxLength={10000}
              placeholder="Опишите результат и важные детали"
              disabled={save.isPending}
            />
          </div>
          <div className="form-field">
            <label htmlFor={`${formId}-project`}>Объект</label>
            <select
              id={`${formId}-project`}
              name="project_id"
              value={input.project_id}
              onChange={(event) => setInput({ ...input, project_id: event.target.value })}
              required
              disabled={save.isPending || unavailable}
            >
              <option value="">Выберите объект</option>
              {projects.data?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`${formId}-assignee`}>Исполнитель</label>
            <select
              id={`${formId}-assignee`}
              name="assignee_id"
              value={input.assignee_id}
              onChange={(event) => setInput({ ...input, assignee_id: event.target.value })}
              required
              disabled={save.isPending || unavailable}
            >
              <option value="">Выберите исполнителя</option>
              {executors.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name}
                </option>
              ))}
            </select>
          </div>
          {!unavailable && executors.length === 0 && (
            <p className="muted">
              Пока нет исполнителей. Добавьте учётную запись через администратора.
            </p>
          )}
          <ErrorNotice error={validation || save.error} />
        </div>
        <footer className="modal-footer">
          <Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="submit"
            pending={save.isPending}
            disabled={unavailable || executors.length === 0}
          >
            {task ? 'Сохранить изменения' : 'Создать задачу'}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
