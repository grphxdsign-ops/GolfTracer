import type { TrackPoint } from '../../../types/tracking';
import { MAX_TRACE_POINTS, normalizeTrace, traceToBox } from '../tracePreview';

const path = (n: number): TrackPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    timestampMs: i * 10,
    x: (i / (n - 1)) * 1920,
    y: 1080 - (i / (n - 1)) * 900,
    interpolated: false,
  }));

describe('normalizeTrace', () => {
  it('normalizes into 0..1 frame space and caps the point count', () => {
    const out = normalizeTrace(path(200), 1920, 1080)!;
    expect(out.length).toBeLessThanOrEqual(MAX_TRACE_POINTS + 1);
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
    // The flight head (last tracked point) always survives sampling.
    expect(out[out.length - 1]).toEqual({ x: 1, y: expect.closeTo(1 / 6, 5) });
  });

  it('returns undefined for paths too short to redraw honestly', () => {
    expect(normalizeTrace(path(2), 1920, 1080)).toBeUndefined();
    expect(normalizeTrace([], 1920, 1080)).toBeUndefined();
  });

  it('returns undefined for degenerate frame dims', () => {
    expect(normalizeTrace(path(10), 0, 1080)).toBeUndefined();
  });

  it('keeps short paths intact', () => {
    const out = normalizeTrace(path(5), 1920, 1080)!;
    expect(out).toHaveLength(5);
  });
});

describe('traceToBox', () => {
  it('fits the trace bounding box into the padded box', () => {
    const pts = [
      { x: 0.2, y: 0.9 },
      { x: 0.5, y: 0.4 },
      { x: 0.8, y: 0.5 },
    ];
    const out = traceToBox(pts, 100, 50, 5);
    expect(out[0]).toEqual({ x: 5, y: 45 });
    expect(out[2]!.x).toBe(95);
    // All points inside the padded box.
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(5);
      expect(p.x).toBeLessThanOrEqual(95);
      expect(p.y).toBeGreaterThanOrEqual(5);
      expect(p.y).toBeLessThanOrEqual(45);
    }
  });

  it('survives a degenerate (single-point-span) trace', () => {
    const out = traceToBox([{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }], 60, 60, 6);
    for (const p of out) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
