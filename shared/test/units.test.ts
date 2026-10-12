import { expect, test } from 'vitest';
import { KG_PER_LB, formatWeight, kgToLbs, lbsToKg, toKg } from '../src/index.js';

test('constants and raw conversions', () => {
  expect(KG_PER_LB).toBe(0.45359237);
  expect(kgToLbs(100)).toBeCloseTo(220.462, 3);
  expect(lbsToKg(220.462262)).toBeCloseTo(100, 4);
});
test('formatWeight rounds to 0.1 and drops trailing .0', () => {
  expect(formatWeight(100, 'kg')).toBe('100 kg');
  expect(formatWeight(100, 'lbs')).toBe('220.5 lbs');
  expect(formatWeight(102.5, 'kg')).toBe('102.5 kg');
  expect(formatWeight(102.06, 'lbs')).toBe('225 lbs');
});
test('toKg converts lbs to kg rounded to 2 decimals and passes kg through', () => {
  expect(toKg(225, 'lbs')).toBe(102.06);
  expect(toKg(100, 'kg')).toBe(100);
});
test('225 lbs round-trips through storage', () => {
  expect(formatWeight(toKg(225, 'lbs'), 'lbs')).toBe('225 lbs');
});
