export interface Clock {
    now(): Date;
}
export declare const systemClock: Clock;
export declare function fixedClock(iso: string): Clock & {
    set(iso: string): void;
};
