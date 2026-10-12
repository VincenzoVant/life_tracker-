import { z } from 'zod';
export declare const PinSchema: z.ZodString;
export declare const SetupInput: z.ZodObject<{
    pin: z.ZodString;
}, z.core.$strip>;
export type SetupInput = z.infer<typeof SetupInput>;
export declare const LoginInput: z.ZodObject<{
    pin: z.ZodString;
}, z.core.$strip>;
export type LoginInput = z.infer<typeof LoginInput>;
export declare const ChangePinInput: z.ZodObject<{
    currentPin: z.ZodString;
    newPin: z.ZodString;
}, z.core.$strip>;
export type ChangePinInput = z.infer<typeof ChangePinInput>;
export interface AuthStatus {
    pinSet: boolean;
    authenticated: boolean;
}
