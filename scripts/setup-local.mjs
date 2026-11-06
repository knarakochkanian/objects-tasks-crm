import { mkdir, writeFile } from 'node:fs/promises';
import { localStatus, runCli } from './local-stack.mjs';

try {
  console.log('Запускаю отдельный Supabase для CRM…');
  await runCli([
    'start',
    '-x',
    'realtime,storage-api,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,studio,postgres-meta',
  ]);
  const status = localStatus();
  await mkdir('.local', { recursive: true });
  await writeFile(
    '.env.local',
    `VITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_ANON_KEY=${status.ANON_KEY}\n`,
    { mode: 0o600 },
  );
  console.log('Локальное подключение настроено. Административный ключ не записывался во фронтенд.');
  await import('./seed.mjs');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
