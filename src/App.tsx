import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Brand, EmptyState, Loading } from './components/UI';
import { useAuth } from './features/auth/AuthProvider';
import { LoginPage } from './features/auth/LoginPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { ProjectPage } from './features/projects/ProjectPage';
import { TaskPage } from './features/tasks/TaskPage';
import { MyTasksPage } from './features/tasks/MyTasksPage';
import { isConfigured } from './lib/supabase';

function Home() {
  const { profile, loading } = useAuth();
  if (loading) return <Loading />;
  return <Navigate to={profile?.role === 'executor' ? '/my-tasks' : '/projects'} replace />;
}
export function App() {
  if (!isConfigured)
    return (
      <main className="access-state">
        <Brand />
        <h1>Подключите рабочее пространство</h1>
        <p>
          Подключение к базе ещё не настроено. Выполните шаги локального запуска из README проекта и
          перезапустите приложение.
        </p>
      </main>
    );
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectPage />} />
        <Route path="/tasks/:id" element={<TaskPage />} />
        <Route path="/my-tasks" element={<MyTasksPage />} />
        <Route
          path="*"
          element={
            <EmptyState title="Страница не найдена" description="Выберите нужный раздел в меню." />
          }
        />
      </Route>
    </Routes>
  );
}
