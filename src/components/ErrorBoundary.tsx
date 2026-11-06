import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Brand, Button } from './UI';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('Application error', error, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="access-state">
          <Brand />
          <h1>Не удалось открыть страницу</h1>
          <p>Обновите приложение. Если ошибка повторится, обратитесь к руководителю.</p>
          <Button onClick={() => window.location.reload()}>Обновить страницу</Button>
        </main>
      );
    return this.props.children;
  }
}
