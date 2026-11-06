import { useState } from 'react';
import { Check, Clock3, Pencil, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BackLink,
  Button,
  ConfirmDelete,
  EmptyState,
  ErrorNotice,
  Loading,
} from '../../components/UI';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useCrmMutation, useHistory, useProfiles, useProjects, useTask } from '../../lib/queries';
import type { Task, TaskStatus } from '../../lib/types';
import { availableTransitions, validateTransition } from '../../lib/workflow';
import { useAuth } from '../auth/AuthProvider';
import { StatusBadge } from './StatusBadge';
import { TaskForm } from './TaskForm';

export function TaskPage() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const task = useTask(id);
  const projects = useProjects();
  const profiles = useProfiles();
  const history = useHistory(id);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [comment, setComment] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const transition = useCrmMutation(
    ({ task: value, status, note }: { task: Task; status: TaskStatus; note: string }) =>
      api.transition(value, status, note),
  );
  const remove = useCrmMutation((value: Task) => api.deleteTask(value));
  if (task.isPending || projects.isPending || profiles.isPending) return <Loading />;
  const error = task.error || projects.error || profiles.error;
  if (error)
    return (
      <ErrorNotice
        error={error}
        retry={() => {
          void task.refetch();
          void projects.refetch();
          void profiles.refetch();
        }}
      />
    );
  const data = task.data;
  if (!data || !profile)
    return (
      <>
        <BackLink to={profile?.role === 'executor' ? '/my-tasks' : '/projects'}>
          Назад к работе
        </BackLink>
        <EmptyState
          title="Задача недоступна"
          description="Возможно, задача удалена, передана другому исполнителю или у вас нет доступа к ней."
        />
      </>
    );
  const project = projects.data?.find((value) => value.id === data.project_id);
  const names = new Map(profiles.data?.map((person) => [person.id, person.full_name]));
  const actions = availableTransitions(profile, data);
  const manager = profile.role === 'manager';
  const latestRework = history.data?.find((entry) => entry.to_status === 'rework');
  async function changeStatus(status: TaskStatus) {
    if (transition.isPending) return;
    const issue = validateTransition(status, comment);
    setValidation(issue);
    setSuccess('');
    if (issue) return;
    try {
      await transition.mutateAsync({ task: data!, status, note: comment });
      setComment('');
      setSuccess('Статус задачи обновлён.');
    } catch {
      /* The current card is refetched and the error remains visible. */
    }
  }
  async function deleteTask() {
    try {
      await remove.mutateAsync(data!);
      navigate(`/projects/${data!.project_id}`, { replace: true });
    } catch {
      /* Error shown in dialog. */
    }
  }
  return (
    <>
      <BackLink to={`/projects/${data.project_id}`}>{project?.name ?? 'К объекту'}</BackLink>
      <div className="page-heading detail-heading">
        <div>
          <div className="title-status">
            <StatusBadge status={data.status} />
            <span className="muted small">Задача</span>
          </div>
          <h1 className="task-page-title">{data.title}</h1>
        </div>
        {manager && (
          <div className="button-group">
            <Button
              variant="secondary"
              disabled={transition.isPending}
              onClick={() => setEditing(true)}
            >
              <Pencil size={16} aria-hidden="true" />
              Редактировать
            </Button>
            <button
              className="icon-button destructive-icon"
              aria-label="Удалить задачу"
              title="Удалить задачу"
              disabled={transition.isPending}
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>
      {success && (
        <p className="success-notice" role="status">
          <Check size={18} aria-hidden="true" />
          {success}
        </p>
      )}
      <div className="task-detail-grid">
        <div className="task-primary">
          <section className="content-panel task-description-panel">
            <h2>Описание задачи</h2>
            <p className={`description-text ${data.description ? '' : 'muted'}`}>
              {data.description || 'Описание не добавлено.'}
            </p>
            {data.status === 'rework' && latestRework?.comment && (
              <div className="rework-note">
                <strong>Что нужно доработать</strong>
                <p>{latestRework.comment}</p>
              </div>
            )}
          </section>
          {actions.length > 0 && (
            <section className="content-panel task-actions">
              <h2>{manager ? 'Проверка результата' : 'Следующий шаг'}</h2>
              <p className="muted">
                {manager
                  ? 'Примите выполненную работу или напишите, что нужно исправить.'
                  : data.status === 'in_progress'
                    ? 'Закончили работу? Передайте результат постановщику.'
                    : 'Начните выполнение, когда будете готовы.'}
              </p>
              <label>
                Комментарий{' '}
                <span className="label-hint">
                  {manager ? 'обязателен при возврате' : 'необязательно'}
                </span>
                <textarea
                  rows={3}
                  name="comment"
                  value={comment}
                  maxLength={5000}
                  disabled={transition.isPending}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={
                    manager
                      ? 'Что нужно уточнить или исправить?'
                      : 'Дополнительная информация по задаче'
                  }
                />
              </label>
              <ErrorNotice error={validation || transition.error} />
              <div className="action-buttons">
                {actions.map((action) => (
                  <Button
                    key={action.status}
                    variant={action.status === 'rework' ? 'secondary' : 'primary'}
                    pending={transition.isPending && transition.variables?.status === action.status}
                    disabled={transition.isPending}
                    onClick={() => void changeStatus(action.status)}
                  >
                    {action.status === 'accepted' && <Check size={17} aria-hidden="true" />}
                    {action.label}
                  </Button>
                ))}
              </div>
            </section>
          )}
          {!actions.length && transition.error && <ErrorNotice error={transition.error} />}
          <section className="content-panel history-panel">
            <h2>История задачи</h2>
            <p className="muted">Все изменения статуса, от новых к ранним.</p>
            {history.isPending ? (
              <Loading />
            ) : history.error ? (
              <ErrorNotice error={history.error} retry={() => void history.refetch()} />
            ) : history.data?.length ? (
              <ol className="history-list">
                {history.data.map((entry) => (
                  <li key={entry.id}>
                    <span className="history-marker">
                      <Clock3 size={14} aria-hidden="true" />
                    </span>
                    <div className="history-entry">
                      <div className="history-statuses">
                        {entry.from_status ? (
                          <>
                            <StatusBadge status={entry.from_status} />
                            <span className="history-arrow" aria-label="переведена в">
                              →
                            </span>
                          </>
                        ) : (
                          <span className="created-label">Задача создана</span>
                        )}
                        <StatusBadge status={entry.to_status} />
                      </div>
                      <p className="history-meta">
                        <strong>{names.get(entry.actor_id) ?? 'Участник команды'}</strong>
                        <time dateTime={entry.created_at}>{formatDate(entry.created_at)}</time>
                      </p>
                      {entry.comment && <p className="history-comment">{entry.comment}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">Изменений статуса пока нет.</p>
            )}
          </section>
        </div>
        <aside className="content-panel task-metadata">
          <h2>Детали</h2>
          <dl>
            <div>
              <dt>Объект</dt>
              <dd>
                <Link to={`/projects/${data.project_id}`}>{project?.name ?? 'Объект'}</Link>
              </dd>
            </div>
            <div>
              <dt>Исполнитель</dt>
              <dd>{names.get(data.assignee_id) ?? 'Исполнитель'}</dd>
            </div>
            <div>
              <dt>Постановщик</dt>
              <dd>{names.get(data.author_id) ?? 'Постановщик'}</dd>
            </div>
            <div>
              <dt>Создана</dt>
              <dd>{formatDate(data.created_at)}</dd>
            </div>
            <div>
              <dt>Последнее изменение</dt>
              <dd>{formatDate(data.updated_at)}</dd>
            </div>
          </dl>
        </aside>
      </div>
      {editing && (
        <TaskForm task={data} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      )}
      {deleting && (
        <ConfirmDelete
          title="Удалить задачу?"
          description={`Задача «${data.title}» исчезнет из рабочего пространства. Её история сохранится в базе. Восстановление через интерфейс недоступно.`}
          pending={remove.isPending}
          error={remove.error}
          onClose={() => {
            setDeleting(false);
            remove.reset();
          }}
          onConfirm={() => void deleteTask()}
        />
      )}
    </>
  );
}
