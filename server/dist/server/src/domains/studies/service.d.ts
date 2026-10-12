import { CourseInput, CourseUpdateInput, type Course } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
export declare function listCourses(ctx: Ctx, opts?: {
    includeArchived?: boolean;
}): Course[];
export declare function getCourse(ctx: Ctx, id: string): Course;
export declare function createCourse(ctx: Ctx, input: CourseInput): Course;
export declare function updateCourse(ctx: Ctx, id: string, input: CourseUpdateInput): Course;
export declare function archiveCourse(ctx: Ctx, id: string): Course;
