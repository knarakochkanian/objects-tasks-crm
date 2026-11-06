import { Navigate } from 'react-router-dom';
import { ErrorNotice, Loading } from '../../components/UI';
import { useProfiles, useProjects, useTasks } from '../../lib/queries';
import { useAuth } from '../auth/AuthProvider';
import { TaskList } from './TaskList';

export function MyTasksPage() {
  const { profile } = useAuth();
  const tasks = useTasks();
  const projects = useProjects();
  const profiles = useProfiles();
  if (profile?.role !== 'executor') return <Navigate to="/projects" replace />;
  const ownTasks = (tasks.data ?? []).filter((task) => task.assignee_id === profile.id);
  const loading = tasks.isPending || projects.isPending || profiles.isPending;
  const error = tasks.error || projects.error || profiles.error;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Мои задачи</h1>
          <p>Ваши задачи по всем объектам в одном списке.</p>
        </div>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice
          error={error}
          retry={() => {
            void tasks.refetch();
            void projects.refetch();
            void profiles.refetch();
          }}
        />
      ) : (
        <>
          <div className="task-summary">
            <div>
              <span className="summary-number">
                {
                  ownTasks.filter((task) => task.status === 'new' || task.status === 'rework')
                    .length
                }
              </span>
              <span>Ожидают начала</span>
            </div>
            <div>
              <span className="summary-number">
                {ownTasks.filter((task) => task.status === 'in_progress').length}
              </span>
              <span>В работе</span>
            </div>
            <div>
              <span className="summary-number">
                {ownTasks.filter((task) => task.status === 'in_review').length}
              </span>
              <span>На проверке</span>
            </div>
            <div>
              <span className="summary-number">
                {ownTasks.filter((task) => task.status === 'accepted').length}
              </span>
              <span>Приняты</span>
            </div>
          </div>
          <section className="content-panel">
            <TaskList
              tasks={ownTasks}
              projects={projects.data}
              profiles={profiles.data}
              showProject
              emptyDescription="Руководитель назначит вам задачи, и они появятся в этом списке."
            />
          </section>
        </>
      )}
    </>
  );
}
