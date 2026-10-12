import { z } from 'zod';

export const PinSchema = z.string().regex(/^\d{4,8}$/, 'PIN must be 4-8 digits');

export const SetupInput = z.object({ pin: PinSchema });
export type SetupInput = z.infer<typeof SetupInput>;

export const LoginInput = z.object({ pin: PinSchema });
export type LoginInput = z.infer<typeof LoginInput>;

export const ChangePinInput = z.object({ currentPin: PinSchema, newPin: PinSchema });
export type ChangePinInput = z.infer<typeof ChangePinInput>;

export interface AuthStatus {
  pinSet: boolean;
  authenticated: boolean;
}
