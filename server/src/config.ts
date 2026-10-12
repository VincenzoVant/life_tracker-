import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AppConfig {
  dataDir: string;
  port: number;
  defaultTimezone: string;
  allowedOrigins: string[];
  webDist: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const port = env.LT_PORT ? Number(env.LT_PORT) : 4280;
  const dataDir = env.LT_DATA_DIR ?? join(env.HOME ?? '.', 'LifeTracker');
  const allowedOrigins = [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    'http://localhost:5173',
  ];
  if (env.LT_PUBLIC_ORIGIN) allowedOrigins.push(env.LT_PUBLIC_ORIGIN);
  const dist = fileURLToPath(new URL('../../web/dist', import.meta.url));
  return {
    dataDir,
    port,
    defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    allowedOrigins,
    webDist: existsSync(dist) ? dist : null,
  };
}
