export declare function hashPin(pin: string): Promise<string>;
export declare function verifyPin(hashed: string, pin: string): Promise<boolean>;
