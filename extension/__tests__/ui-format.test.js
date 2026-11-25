import { describe, it, expect } from 'vitest';
import { formatNumber } from '../lib/ui-format.js';

describe('formatNumber', () => {
  it('formats millions, thousands and small numbers', () => {
    expect(formatNumber(1500000)).toBe('1.5M');
    expect(formatNumber(2500)).toBe('2.5K');
    expect(formatNumber(999)).toBe('999');
  });
});
