import { z } from 'zod';
export const PinSchema = z.string().regex(/^\d{4,8}$/, 'PIN must be 4-8 digits');
export const SetupInput = z.object({ pin: PinSchema });
export const LoginInput = z.object({ pin: PinSchema });
export const ChangePinInput = z.object({ currentPin: PinSchema, newPin: PinSchema });
