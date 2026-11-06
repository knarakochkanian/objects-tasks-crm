import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

export const cli = resolve('node_modules/.bin/supabase');
export function localStatus() {
  let status;
  try {
    status = JSON.parse(
      execFileSync(cli, ['status', '--output', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  } catch {
    throw new Error(
      'Локальный Supabase недоступен. Запустите Docker и выполните npm run setup:local.',
    );
  }
  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY)
    throw new Error('Supabase не вернул ключи локального проекта. Проверьте версию CLI.');
  if (!status.API_URL || !['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname)) {
    throw new Error('Скрипт разрешён только для локального Supabase.');
  }
  return status;
}

export async function runCli(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cli, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    const timer = setInterval(
      () => console.log('Supabase запускается: первый запуск скачивает контейнеры…'),
      30_000,
    );
    child.on('error', (error) => {
      clearInterval(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearInterval(timer);
      if (code === 0) return resolvePromise();
      // CLI may include credentials in its output; never forward unfiltered logs.
      const safe = output
        .split('\n')
        .filter((line) => /error|failed|denied|cannot|not running|port.*use|unhealthy/i.test(line))
        .filter((line) => !/key|token|secret|password|postgresql:\/\//i.test(line))
        .slice(-12)
        .join('\n');
      reject(
        new Error(
          `Supabase завершился с кодом ${code}. ${safe || 'Проверьте, что Docker запущен и имеет доступ к сети.'}`,
        ),
      );
    });
  });
}
