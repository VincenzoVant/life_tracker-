import { z } from 'zod';
import { type WorkoutType } from './blocks.js';
export declare const WorkoutDetails: z.ZodObject<{
    intensity: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodOptional<z.ZodString>;
    gymFocus: z.ZodOptional<z.ZodString>;
    cardioKind: z.ZodOptional<z.ZodString>;
    distanceKm: z.ZodOptional<z.ZodNumber>;
    sportName: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type WorkoutDetails = z.infer<typeof WorkoutDetails>;
export interface WorkoutSession {
    id: string;
    blockId: string | null;
    type: WorkoutType;
    date: string;
    durationMinutes: number;
    intensity: number | null;
    notes: string | null;
    gymFocus: string | null;
    cardioKind: string | null;
    distanceKm: number | null;
    sportName: string | null;
    /** Computed, never stored: round(durationMinutes*60/distanceKm) for cardio with a distance. */
    paceSecPerKm: number | null;
}
export declare const SessionInput: z.ZodObject<{
    intensity: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodOptional<z.ZodString>;
    gymFocus: z.ZodOptional<z.ZodString>;
    cardioKind: z.ZodOptional<z.ZodString>;
    distanceKm: z.ZodOptional<z.ZodNumber>;
    sportName: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<{
        cardio: "cardio";
        gym: "gym";
        sport: "sport";
    }>;
    date: z.ZodString;
    durationMinutes: z.ZodNumber;
}, z.core.$strip>;
export type SessionInput = z.infer<typeof SessionInput>;
export declare const SessionUpdateInput: z.ZodObject<{
    intensity: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    gymFocus: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    cardioKind: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    distanceKm: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    sportName: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    type: z.ZodOptional<z.ZodEnum<{
        cardio: "cardio";
        gym: "gym";
        sport: "sport";
    }>>;
    date: z.ZodOptional<z.ZodString>;
    durationMinutes: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type SessionUpdateInput = z.infer<typeof SessionUpdateInput>;
export declare const SessionListQuery: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
}, z.core.$strip>;
export type SessionListQuery = z.infer<typeof SessionListQuery>;
export interface Lift {
    id: string;
    name: string;
    sortOrder: number;
}
export declare const LiftInput: z.ZodObject<{
    name: z.ZodString;
}, z.core.$strip>;
export type LiftInput = z.infer<typeof LiftInput>;
export interface TopSet {
    id: string;
    liftId: string;
    date: string;
    weightKg: number;
    reps: number;
    notes: string | null;
}
/** Date defaults to today (local) when omitted. */
export declare const TopSetInput: z.ZodObject<{
    date: z.ZodOptional<z.ZodString>;
    weightKg: z.ZodNumber;
    reps: z.ZodNumber;
    notes: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type TopSetInput = z.infer<typeof TopSetInput>;
export interface PRs {
    heaviest: TopSet | null;
    bestE1rm: {
        value: number;
        set: TopSet;
    } | null;
}
export interface LiftSummary {
    lift: Lift;
    prs: PRs;
    lastSet: TopSet | null;
}
