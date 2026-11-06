import { useMemo, useState } from 'react';
import { ArrowUpRight, Building2, ClipboardList, MapPin, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ProjectCardLink } from '../../components/ProjectCardLink';
import { Button, EmptyState, ErrorNotice, Loading } from '../../components/UI';
import { useProjects, useTasks } from '../../lib/queries';
import { taskCount } from '../../lib/format';
import { useAuth } from '../auth/AuthProvider';
import { ProjectForm } from './ProjectForm';

export function ProjectsPage() {
  const { profile } = useAuth();
  const projects = useProjects();
  const tasks = useTasks();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const filtered = useMemo(
    () =>
      (projects.data ?? []).filter((project) =>
        `${project.name} ${project.address}`
          .toLocaleLowerCase('ru')
          .includes(search.trim().toLocaleLowerCase('ru')),
      ),
    [projects.data, search],
  );
  const allTasks = tasks.data ?? [];
  const manager = profile?.role === 'manager';
  const loading = projects.isPending || tasks.isPending;
  const failed = projects.error || tasks.error;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Объекты</h1>
          <p>
            {manager
              ? 'Стройки, команда и текущие задачи.'
              : 'Объекты, на которых вам назначены задачи.'}
          </p>
        </div>
        {manager && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden="true" />
            Создать объект
          </Button>
        )}
      </div>
      {loading ? (
        <Loading />
      ) : failed ? (
        <ErrorNotice
          error={failed}
          retry={() => {
            void projects.refetch();
            void tasks.refetch();
          }}
        />
      ) : (
        <>
          <div className="overview-strip">
            <div>
              <Building2 size={20} aria-hidden="true" />
              <span>
                <strong>{projects.data?.length ?? 0}</strong> объектов
              </span>
            </div>
            <div>
              <ClipboardList size={20} aria-hidden="true" />
              <span>
                <strong>{allTasks.filter((task) => task.status !== 'accepted').length}</strong>{' '}
                открытых задач
              </span>
            </div>
            <div className="review-summary">
              <span className="dot" />
              <span>
                <strong>{allTasks.filter((task) => task.status === 'in_review').length}</strong> на
                проверке
              </span>
            </div>
          </div>
          {!!projects.data?.length && (
            <div className="section-heading">
              <h2>
                Все объекты <span>{projects.data.length}</span>
              </h2>
              <label className="search-field">
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">Поиск объектов</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Название или адрес"
                />
              </label>
            </div>
          )}
          {filtered.length ? (
            <div className="project-grid">
              {filtered.map((project) => {
                const projectTasks = allTasks.filter((task) => task.project_id === project.id);
                const accepted = projectTasks.filter((task) => task.status === 'accepted').length;
                const review = projectTasks.filter((task) => task.status === 'in_review').length;
                return (
                  <ProjectCardLink key={project.id} to={`/projects/${project.id}`}>
                    <div className="project-card-top">
                      <span className="project-symbol">
                        <Building2 size={25} aria-hidden="true" />
                      </span>
                      <ArrowUpRight size={20} className="card-arrow" aria-hidden="true" />
                    </div>
                    <h3>{project.name}</h3>
                    <p className="project-address">
                      <MapPin size={15} aria-hidden="true" />
                      <span>{project.address}</span>
                    </p>
                    <div className="project-card-bottom">
                      <span>{taskCount(projectTasks.length)}</span>
                      {review > 0 && <span className="review-label">{review} на проверке</span>}
                    </div>
                    <div
                      className="progress-track"
                      aria-label={`Принято ${accepted} из ${projectTasks.length} задач`}
                    >
                      <span
                        style={{
                          width: `${projectTasks.length ? (accepted / projectTasks.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="progress-caption">
                      Принято {accepted} из {projectTasks.length}
                    </span>
                  </ProjectCardLink>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title={search ? 'Объекты не найдены' : 'Объектов пока нет'}
              description={
                search
                  ? 'Попробуйте другое название или адрес.'
                  : manager
                    ? 'Создайте первый объект и начните назначать задачи команде.'
                    : 'Когда вам назначат задачу, её объект появится здесь.'
              }
            />
          )}
        </>
      )}
      {creating && (
        <ProjectForm
          onClose={() => setCreating(false)}
          onSaved={(project) => {
            setCreating(false);
            navigate(`/projects/${project.id}`);
          }}
        />
      )}
    </>
  );
}
