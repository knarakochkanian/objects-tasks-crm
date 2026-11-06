import { useMemo, useState } from 'react';
import { ArrowUpRight, Search, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/UI';
import { formatDate } from '../../lib/format';
import type { Profile, Project, Task } from '../../lib/types';
import { STATUSES, STATUS_LABELS } from '../../lib/workflow';
import { StatusBadge } from './StatusBadge';

export function TaskList({
  tasks,
  projects = [],
  profiles = [],
  showProject = false,
  emptyDescription = 'Новые задачи появятся здесь.',
}: {
  tasks: Task[];
  projects?: Project[];
  profiles?: Profile[];
  showProject?: boolean;
  emptyDescription?: string;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const filtered = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (status === 'all' || task.status === status) &&
          task.title.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')),
      ),
    [tasks, search, status],
  );
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]));
  if (!tasks.length) return <EmptyState title="Задач пока нет" description={emptyDescription} />;
  return (
    <>
      <div className="table-toolbar">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Поиск задач</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Найти задачу"
          />
        </label>
        <label className="status-filter">
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span className="sr-only">Статус задачи</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Все статусы</option>
            {STATUSES.map((value) => (
              <option value={value} key={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filtered.length ? (
        <div className="table-scroll">
          <table className="task-table">
            <thead>
              <tr>
                <th>Задача</th>
                {showProject && <th>Объект</th>}
                <th>Статус</th>
                <th>Исполнитель</th>
                <th>Создана</th>
                <th>
                  <span className="sr-only">Открыть</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={task.id}>
                  <td>
                    <Link className="task-title" to={`/tasks/${task.id}`}>
                      {task.title}
                    </Link>
                    {task.description && (
                      <span className="table-description">{task.description}</span>
                    )}
                  </td>
                  {showProject && (
                    <td>
                      <Link className="muted-link" to={`/projects/${task.project_id}`}>
                        {projectNames.get(task.project_id) ?? 'Объект'}
                      </Link>
                    </td>
                  )}
                  <td>
                    <StatusBadge status={task.status} />
                  </td>
                  <td>
                    <span className="person-name">
                      {names.get(task.assignee_id) ?? 'Исполнитель'}
                    </span>
                  </td>
                  <td className="date-cell">{formatDate(task.created_at, false)}</td>
                  <td>
                    <Link
                      className="icon-link"
                      to={`/tasks/${task.id}`}
                      aria-label={`Открыть задачу «${task.title}»`}
                    >
                      <ArrowUpRight size={19} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Ничего не найдено"
          description="Попробуйте другой запрос или выберите другой статус."
        />
      )}
    </>
  );
}
