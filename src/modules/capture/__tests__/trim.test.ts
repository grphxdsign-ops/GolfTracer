import {
  clampTrimWindow,
  computeTrimWindow,
  MIN_TRIM_SPAN_MS,
  POST_IMPACT_MS,
  PRE_IMPACT_MS,
} from '../logic/trim';

describe('computeTrimWindow', () => {
  it('builds (impact-2s, impact+9s) in the middle of a long clip', () => {
    expect(computeTrimWindow(30000, 10000)).toEqual({
      startMs: 10000 - PRE_IMPACT_MS,
      endMs: 10000 + POST_IMPACT_MS,
    });
  });

  it('clamps the start at the beginning of the clip', () => {
    expect(computeTrimWindow(30000, 1000)).toEqual({ startMs: 0, endMs: 10000 });
  });

  it('clamps the end at the clip duration', () => {
    expect(computeTrimWindow(12000, 10000)).toEqual({ startMs: 8000, endMs: 12000 });
  });

  it('clamps an impact guess outside the clip', () => {
    expect(computeTrimWindow(10000, 25000)).toEqual({ startMs: 8000, endMs: 10000 });
    expect(computeTrimWindow(10000, -500)).toEqual({ startMs: 0, endMs: 9000 });
  });

  it('covers a short clip entirely when no guess is provided', () => {
    expect(computeTrimWindow(5000)).toEqual({ startMs: 0, endMs: 5000 });
  });

  it('defaults the guess early in a long clip', () => {
    // Guess defaults to 2s in, so the window starts at 0 and keeps 9s after.
    expect(computeTrimWindow(60000)).toEqual({
      startMs: 0,
      endMs: PRE_IMPACT_MS + POST_IMPACT_MS,
    });
  });

  it('handles zero-length clips', () => {
    expect(computeTrimWindow(0)).toEqual({ startMs: 0, endMs: 0 });
  });
});

describe('clampTrimWindow', () => {
  it('passes through an in-range window', () => {
    expect(clampTrimWindow({ startMs: 1000, endMs: 8000 }, 10000)).toEqual({
      startMs: 1000,
      endMs: 8000,
    });
  });

  it('clamps handles dragged past the video edges', () => {
    expect(clampTrimWindow({ startMs: -2000, endMs: 15000 }, 10000)).toEqual({
      startMs: 0,
      endMs: 10000,
    });
  });

  it('keeps a minimum span when handles collide', () => {
    const w = clampTrimWindow({ startMs: 5000, endMs: 5000 }, 10000);
    expect(w.endMs - w.startMs).toBe(MIN_TRIM_SPAN_MS);
    expect(w.startMs).toBe(5000);
  });

  it('keeps the window inside the clip when colliding at the end', () => {
    const w = clampTrimWindow({ startMs: 9900, endMs: 9950 }, 10000);
    expect(w.endMs).toBeLessThanOrEqual(10000);
    expect(w.startMs).toBeGreaterThanOrEqual(0);
    expect(w.endMs - w.startMs).toBe(MIN_TRIM_SPAN_MS);
  });
});
