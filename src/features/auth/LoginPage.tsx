import { useId, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight, Building2, ClipboardCheck, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { Brand, Button, ErrorNotice, Loading } from '../../components/UI';
import { client } from '../../lib/supabase';
import { useAuth } from './AuthProvider';
import { ConstructionScene } from '../../components/ConstructionScene';

export function LoginPage() {
  const { session, profile, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const passwordId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (loading) return <Loading />;
  if (session)
    return <Navigate to={profile?.role === 'executor' ? '/my-tasks' : '/projects'} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await client().auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-intro">
        <Brand />
        <div className="login-story">
          <span className="site-line" aria-hidden="true" />
          <h1>
            У каждого объекта
            <br />
            есть следующий шаг.
          </h1>
          <p>
            Ставьте задачи, следите за работой
            <br className="desktop-only" /> и принимайте результат в одном месте.
          </p>
          <ConstructionScene />
          <div className="login-capabilities">
            <span>
              <Building2 size={20} aria-hidden="true" />
              Объекты под контролем
            </span>
            <span>
              <ClipboardCheck size={20} aria-hidden="true" />
              Понятный путь задачи
            </span>
          </div>
        </div>
        <p className="intro-footer">Рабочее пространство строительной команды</p>
      </section>
      <section className="login-form-area">
        <div className="login-form-wrap">
          <span className="login-lock">
            <LockKeyhole size={23} aria-hidden="true" />
          </span>
          <h2>Вход в рабочее пространство</h2>
          <p className="muted">Используйте учётную запись вашей компании.</p>
          <form onSubmit={submit} className="form-stack">
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="name@company.ru"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={pending}
              />
            </label>
            <div className="form-field">
              <label htmlFor={passwordId}>Пароль</label>
              <div className="password-field">
                <input
                  id={passwordId}
                  name="password"
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Введите пароль"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={pending}
                />
                <button
                  type="button"
                  className="icon-button password-toggle"
                  aria-label={passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}
                  title={passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}
                  aria-controls={passwordId}
                  disabled={pending}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  {passwordVisible ? (
                    <EyeOff size={19} aria-hidden="true" />
                  ) : (
                    <Eye size={19} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            <ErrorNotice error={error} />
            <Button type="submit" pending={pending}>
              Войти
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
          </form>
          <p className="login-help">
            Нет доступа? Обратитесь к руководителю.
            <br />
            Самостоятельная регистрация закрыта.
          </p>
        </div>
      </section>
    </main>
  );
}
