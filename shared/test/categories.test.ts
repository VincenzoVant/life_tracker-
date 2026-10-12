import { expect, test } from 'vitest';
import { CATEGORIES, CATEGORY_META } from '../src/index.js';

test('every category has meta with a hex color and gcal color id 1..11', () => {
  for (const c of CATEGORIES) {
    expect(CATEGORY_META[c].color).toMatch(/^#[0-9a-f]{6}$/);
    expect(Number(CATEGORY_META[c].gcalColorId)).toBeGreaterThanOrEqual(1);
    expect(Number(CATEGORY_META[c].gcalColorId)).toBeLessThanOrEqual(11);
  }
  expect(CATEGORY_META.study).toEqual({ label: 'Study', color: '#3f51b5', gcalColorId: '9' });
});
