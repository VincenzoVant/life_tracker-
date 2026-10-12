import { Hono } from 'hono';
import { BackupSettingsInput, type ErrorBody } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { parse } from '../../lib/validate.js';
import { getBackupStatus, runBackup, saveBackupSettings } from './service.js';

export function backupRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(getBackupStatus(ctx)));
  app.post('/run', async (c) => {
    try {
      const { file } = await runBackup(ctx);
      return c.json({ file });
    } catch (err) {
      const body: ErrorBody = {
        error: { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) },
      };
      return c.json(body, 500);
    }
  });
  app.put('/settings', async (c) => {
    const input = parse(BackupSettingsInput, await c.req.json().catch(() => undefined));
    return c.json(saveBackupSettings(ctx, input));
  });
  return app;
}
