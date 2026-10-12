import { hash, verify } from '@node-rs/argon2';
export function hashPin(pin) {
    return hash(pin);
}
export async function verifyPin(hashed, pin) {
    try {
        return await verify(hashed, pin);
    }
    catch {
        return false;
    }
}
