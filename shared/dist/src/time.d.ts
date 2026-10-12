export declare function addDays(date: string, n: number): string;
export declare function isoWeekday(date: string): 1 | 2 | 3 | 4 | 5 | 6 | 7;
export declare function localDateOf(instant: Date, tz: string): string;
export declare function localTimeOf(instant: Date, tz: string): string;
export declare function zonedToUtc(date: string, time: string, tz: string): Date;
export declare function dayRangeUtc(date: string, tz: string): {
    start: Date;
    end: Date;
};
export declare function weekStartOf(instant: Date, tz: string): string;
export declare function weekRangeUtc(weekStart: string, tz: string): {
    start: Date;
    end: Date;
};
export declare function weekDates(weekStart: string): string[];
export declare function minutesBetween(a: Date | string, b: Date | string): number;
