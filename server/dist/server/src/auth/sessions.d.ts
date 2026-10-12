import type { Ctx } from '../ctx.js';
export declare const SESSION_TTL_SECONDS: number;
export declare function createSession(ctx: Ctx): {
    token: string;
    expiresAt: Date;
};
export declare function findSession(ctx: Ctx, token: string): {
    id: string;
} | null;
export declare function deleteSession(ctx: Ctx, token: string): void;
export declare function deleteAllSessions(ctx: Ctx): void;
