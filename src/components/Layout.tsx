import { useState } from 'react';
import { Building2, ClipboardList, LogOut, ShieldCheck } from 'lucide-react';
import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { client } from '../lib/supabase';
import { initials } from '../lib/format';
import { Brand, Button, ErrorNotice, Loading } from './UI';

export function Layout() {
  const { session, profile, loading, error, retry } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<unknown>(null);
  async function logout() {
    setSigningOut(true);
    setLogoutError(null);
    try {
      const result = await client().auth.signOut({ scope: 'local' });
      if (result.error) throw result.error;
    } catch (failure) {
      setLogoutError(failure);
    } finally {
      setSigningOut(false);
    }
  }
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile || error)
    return (
      <main className="access-state">
        <Brand />
        <h1>Не удалось открыть рабочее пространство</h1>
        <ErrorNotice
          error={error || 'Для учётной записи не назначена роль. Обратитесь к руководителю.'}
          retry={error ? retry : undefined}
        />
        <Button variant="secondary" pending={signingOut} onClick={() => void logout()}>
          Выйти
        </Button>
      </main>
    );
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Основная навигация">
          <NavLink to="/projects">
            <Building2 size={20} aria-hidden="true" />
            Объекты
          </NavLink>
          {profile.role === 'executor' && (
            <NavLink to="/my-tasks">
              <ClipboardList size={20} aria-hidden="true" />
              Мои задачи
            </NavLink>
          )}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={19} aria-hidden="true" />
          <p>
            {profile.role === 'manager'
              ? 'Все объекты и задачи вашей команды'
              : 'Ваши задачи и связанные с ними объекты'}
          </p>
        </div>
        <div className="sidebar-user">
          <div className="avatar">{initials(profile.full_name)}</div>
          <div className="user-info">
            <strong>{profile.full_name}</strong>
            <span>{profile.role === 'manager' ? 'Постановщик' : 'Исполнитель'}</span>
          </div>
          <button
            className="icon-button"
            aria-label="Выйти"
            title="Выйти"
            disabled={signingOut}
            onClick={() => void logout()}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>Рабочее пространство</span>
          <span className="role-marker">
            <span className="dot" />
            {profile.role === 'manager' ? 'Управление строительством' : 'Личный кабинет'}
          </span>
        </header>
        <main className="main-content">
          <ErrorNotice error={logoutError} />
          <Outlet key={session.user.id} />
        </main>
        <footer className="app-footer">
          Контур стройки<span>От задачи к результату</span>
        </footer>
      </div>
    </div>
  );
}
