import { expect, test } from 'vitest';
import { epley1rm } from '../src/index.js';

test('epley1rm estimates and rounds to one decimal', () => {
  expect(epley1rm(100, 3)).toBe(110);
  expect(epley1rm(102.5, 2)).toBe(109.3);
  expect(epley1rm(100, 1)).toBe(103.3);
});
