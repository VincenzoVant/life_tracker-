import type { Ctx } from '../../ctx.js';
export declare function getSetting<T>(ctx: Ctx, key: string, fallback: T): T;
export declare function setSetting(ctx: Ctx, key: string, value: unknown): void;
export declare function getTimezone(ctx: Ctx): string;
