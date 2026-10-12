import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';
import { takeUnmatchedCalls } from './mockApi';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(takeUnmatchedCalls(), 'unmatched mockApi calls (production code may have swallowed the error)').toEqual([]);
});
