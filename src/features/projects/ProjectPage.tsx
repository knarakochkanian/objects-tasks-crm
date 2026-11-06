import { useState } from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BackLink,
  Button,
  ConfirmDelete,
  EmptyState,
  ErrorNotice,
  Loading,
} from '../../components/UI';
import { api } from '../../lib/api';
import { useCrmMutation, useProfiles, useProject, useTasks } from '../../lib/queries';
import type { Project } from '../../lib/types';
import { taskCount } from '../../lib/format';
import { useAuth } from '../auth/AuthProvider';
import { TaskList } from '../tasks/TaskList';
import { TaskForm } from '../tasks/TaskForm';
import { ProjectForm } from './ProjectForm';

export function ProjectPage() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const project = useProject(id);
  const tasks = useTasks();
  const profiles = useProfiles();
  const [editing, setEditing] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useCrmMutation((value: Project) => api.deleteProject(value));
  const navigate = useNavigate();
  const manager = profile?.role === 'manager';
  if (project.isPending || tasks.isPending || profiles.isPending) return <Loading />;
  const error = project.error || tasks.error || profiles.error;
  if (error)
    return (
      <ErrorNotice
        error={error}
        retry={() => {
          void project.refetch();
          void tasks.refetch();
          void profiles.refetch();
        }}
      />
    );
  const data = project.data;
  if (!data)
    return (
      <>
        <BackLink to="/projects">Все объекты</BackLink>
        <EmptyState
          title="Объект недоступен"
          description="Возможно, объект удалён или у вас нет доступа к нему."
        />
      </>
    );
  const projectTasks = (tasks.data ?? []).filter((task) => task.project_id === data.id);
  async function deleteProject() {
    try {
      await remove.mutateAsync(data!);
      navigate('/projects', { replace: true });
    } catch {
      /* Error shown in dialog. */
    }
  }
  return (
    <>
      <BackLink to="/projects">Все объекты</BackLink>
      <div className="page-heading detail-heading">
        <div>
          <h1>{data.name}</h1>
          <p className="address-line">
            <MapPin size={17} aria-hidden="true" />
            {data.address}
          </p>
        </div>
        {manager && (
          <div className="button-group">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil size={16} aria-hidden="true" />
              Редактировать
            </Button>
            <button
              className="icon-button destructive-icon"
              aria-label="Удалить объект"
              title="Удалить объект"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>
      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <h2>Задачи объекта</h2>
            <p>
              {taskCount(projectTasks.length)}
              {!manager && ' назначены вам'}
            </p>
          </div>
          {manager && (
            <Button onClick={() => setCreatingTask(true)}>
              <Plus size={17} aria-hidden="true" />
              Создать задачу
            </Button>
          )}
        </div>
        <TaskList
          tasks={projectTasks}
          profiles={profiles.data}
          emptyDescription={
            manager
              ? 'Создайте задачу и назначьте ответственного исполнителя.'
              : 'На этом объекте вам пока не назначены задачи.'
          }
        />
      </section>
      {editing && (
        <ProjectForm
          project={data}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
      {creatingTask && (
        <TaskForm
          projectId={data.id}
          onClose={() => setCreatingTask(false)}
          onSaved={(task) => {
            setCreatingTask(false);
            navigate(`/tasks/${task.id}`);
          }}
        />
      )}
      {deleting && (
        <ConfirmDelete
          title="Удалить объект?"
          description={`Объект «${data.name}» и все его задачи исчезнут из рабочего пространства. История сохранится в базе. Восстановление через интерфейс недоступно.`}
          pending={remove.isPending}
          error={remove.error}
          onClose={() => {
            setDeleting(false);
            remove.reset();
          }}
          onConfirm={() => void deleteProject()}
        />
      )}
    </>
  );
}
