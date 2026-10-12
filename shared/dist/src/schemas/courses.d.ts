import { z } from 'zod';
export interface Course {
    id: string;
    name: string;
    color: string;
    weeklyGoalMinutes: number;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}
export declare const CourseInput: z.ZodObject<{
    name: z.ZodString;
    color: z.ZodString;
    weeklyGoalMinutes: z.ZodNumber;
}, z.core.$strip>;
export type CourseInput = z.infer<typeof CourseInput>;
export declare const CourseUpdateInput: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    weeklyGoalMinutes: z.ZodOptional<z.ZodNumber>;
    active: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type CourseUpdateInput = z.infer<typeof CourseUpdateInput>;
export declare const CourseListQuery: z.ZodObject<{
    includeArchived: z.ZodOptional<z.ZodEnum<{
        false: "false";
        true: "true";
    }>>;
}, z.core.$strip>;
export type CourseListQuery = z.infer<typeof CourseListQuery>;
