import { z } from 'zod';
export interface FixedEvent {
    id: string;
    title: string;
    kind: 'class' | 'work';
    courseId: string | null;
    weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    startTime: string;
    endTime: string;
    validFrom: string;
    validTo: string;
    active: boolean;
}
export declare const FixedEventInput: z.ZodObject<{
    title: z.ZodString;
    kind: z.ZodEnum<{
        class: "class";
        work: "work";
    }>;
    courseId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    weekday: z.ZodNumber;
    startTime: z.ZodString;
    endTime: z.ZodString;
    validFrom: z.ZodString;
    validTo: z.ZodString;
    active: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type FixedEventInput = z.infer<typeof FixedEventInput>;
/** Partial patch; the server re-validates the merged result with FixedEventInput. */
export declare const FixedEventUpdateInput: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    kind: z.ZodOptional<z.ZodEnum<{
        class: "class";
        work: "work";
    }>>;
    courseId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    weekday: z.ZodOptional<z.ZodNumber>;
    startTime: z.ZodOptional<z.ZodString>;
    endTime: z.ZodOptional<z.ZodString>;
    validFrom: z.ZodOptional<z.ZodString>;
    validTo: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.core.$strip>;
export type FixedEventUpdateInput = z.infer<typeof FixedEventUpdateInput>;
