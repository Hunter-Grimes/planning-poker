import { describe, it, expect } from 'vitest';
import { randomId } from '../../src/lib/id';

describe('randomId', () => {
  it('returns a non-empty string', () => {
    expect(randomId().length).toBeGreaterThan(0);
  });

  it('returns a unique value across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => randomId()));
    expect(ids.size).toBe(100);
  });
});
