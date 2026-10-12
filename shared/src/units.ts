export type WeightUnit = 'kg' | 'lbs';

export const KG_PER_LB = 0.45359237;

export const kgToLbs = (kg: number): number => kg / KG_PER_LB;
export const lbsToKg = (lbs: number): number => lbs * KG_PER_LB;

const round = (n: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Rounds a weight (already in `unit`) to 0.1 for display. */
export const roundDisplay = (n: number): number => round(n, 1);

/** Converts a stored kilogram value to `unit`, unrounded. */
export const fromKg = (kg: number, unit: WeightUnit): number => (unit === 'lbs' ? kgToLbs(kg) : kg);

/** "100 kg" / "220.5 lbs": one decimal at most, no trailing .0. */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${roundDisplay(fromKg(kg, unit))} ${unit}`;
}

/** Converts a value typed in `unit` to storage kilograms (2 decimals). */
export const toKg = (value: number, unit: WeightUnit): number => round(unit === 'lbs' ? lbsToKg(value) : value, 2);
