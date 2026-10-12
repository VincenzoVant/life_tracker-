import { PreferencesSchema, type Preferences } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { parse } from '../../lib/validate.js';
import { getSetting, setSetting } from '../settings/service.js';

export function getPreferences(ctx: Ctx): Preferences {
  const stored = getSetting<unknown>(ctx, 'preferences', {});
  const r = PreferencesSchema.safeParse(stored);
  return r.success ? r.data : PreferencesSchema.parse({});
}

export function savePreferences(ctx: Ctx, input: unknown): Preferences {
  const prefs = parse(PreferencesSchema, input);
  setSetting(ctx, 'preferences', prefs);
  return prefs;
}
