import { describe, expect, it } from 'vitest';
import { shuffle } from '../src';

describe('shuffle', () => {
  it('keeps every element and does not touch the input', () => {
    const xs = [1, 2, 3, 4, 5];
    const out = shuffle(xs);
    expect([...out].sort()).toEqual(xs);
    expect(xs).toEqual([1, 2, 3, 4, 5]);
  });

  it('is roughly uniform', () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 8000; i++) counts[shuffle([0, 1, 2, 3])[0]]++;
    for (const c of counts) expect(c).toBeGreaterThan(1700);
  });
});
