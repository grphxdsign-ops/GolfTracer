/**
 * DTW tests: self-alignment is the identity with zero cost, and aligning a
 * time-warped copy of a curve recovers the warp within a small tolerance.
 */
import { dtwAlign } from '../dtw';

/** Smooth 2-D test curve on t in [0, 1]. */
const curve = (t: number): number[] => [
  40 * Math.sin(2 * Math.PI * t),
  25 * Math.cos(3 * Math.PI * t) + 10 * t,
];

const sample = (n: number, warp: (t: number) => number): number[][] =>
  Array.from({ length: n }, (_, i) => curve(warp(i / (n - 1))));

describe('dtwAlign', () => {
  it('aligns a sequence to itself with zero cost and the identity map', () => {
    const seq = sample(50, (t) => t);
    const result = dtwAlign(seq, seq);
    expect(result.cost).toBeCloseTo(0, 9);
    for (let i = 0; i < seq.length; i++) {
      expect(result.map[i]).toBe(i);
    }
  });

  it('recovers a monotone time warp on a warped copy', () => {
    const n = 60;
    const warp = (t: number): number => t * t; // slow start, fast finish
    const reference = sample(n, (t) => t);
    const query = sample(n, warp);
    const { map, path } = dtwAlign(query, reference);

    // The path must be monotone in both indices.
    for (let k = 1; k < path.length; k++) {
      expect(path[k]![0]).toBeGreaterThanOrEqual(path[k - 1]![0]);
      expect(path[k]![1]).toBeGreaterThanOrEqual(path[k - 1]![1]);
    }
    // Endpoints are pinned.
    expect(path[0]).toEqual([0, 0]);
    expect(path[path.length - 1]).toEqual([n - 1, n - 1]);

    // The per-query map should recover the warp within a few samples.
    for (let i = 0; i < n; i++) {
      const expected = warp(i / (n - 1)) * (n - 1);
      expect(Math.abs(map[i]! - expected)).toBeLessThanOrEqual(3);
      if (i > 0) {
        expect(map[i]!).toBeGreaterThanOrEqual(map[i - 1]!);
      }
    }
  });

  it('rejects empty sequences', () => {
    expect(() => dtwAlign([], [[0]])).toThrow(/non-empty/);
    expect(() => dtwAlign([[0]], [])).toThrow(/non-empty/);
  });
});
