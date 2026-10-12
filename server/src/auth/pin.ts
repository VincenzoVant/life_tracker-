import { hash, verify } from '@node-rs/argon2';

export function hashPin(pin: string): Promise<string> {
  return hash(pin);
}

export async function verifyPin(hashed: string, pin: string): Promise<boolean> {
  try {
    return await verify(hashed, pin);
  } catch {
    return false;
  }
}
