export declare const CATEGORIES: readonly ['study', 'work', 'startup', 'workout', 'meal', 'meal_prep', 'rest', 'social', 'errand', 'appointment', 'other'];
export type Category = (typeof CATEGORIES)[number];
export declare const CATEGORY_META: Record<Category, {
    label: string;
    color: string;
    gcalColorId: string;
}>;
export declare const EVENING_START_DEFAULT = "19:00";
export declare const SLEEP_START_DEFAULT = "23:30";
export declare const REVIEW_PROMPT_TIME_DEFAULT = "20:00";
