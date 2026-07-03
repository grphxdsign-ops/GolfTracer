import {
  buildTracerPath,
  catmullRomSample,
  DEFAULT_TRACER_STYLE,
  resampleByTime,
} from '../tracerGeometry';
import type { BallTrack, TrackPoint } from '../../../../types/tracking';

function parabolaPoints(count: number, frameMs = 10): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      timestampMs: i * frameMs,
      x: 100 + 6 * i,
      y: 220 - 13 * i + 0.25 * i * i,
      interpolated: i % 7 === 3,
    });
  }
  return points;
}

function trackOf(points: TrackPoint[]): BallTrack {
  let apex = 0;
  points.forEach((p, i) => {
    if (p.y < points[apex]!.y) apex = i;
  });
  return {
    observations: [],
    smoothedPath: points,
    impactFrameIndex: 0,
    impactTimestampMs: points[0]?.timestampMs ?? 0,
    apexPointIndex: apex,
    frameWidth: 480,
    frameHeight: 270,
    quality: 'high',
  };
}

describe('catmullRomSample', () => {
  it('passes through control points and interpolates between them', () => {
    const control = [
      { t: 0, x: 0, y: 0 },
      { t: 10, x: 10, y: 20 },
      { t: 20, x: 20, y: 25 },
      { t: 30, x: 30, y: 15 },
    ];
    const out = catmullRomSample(control, [0, 10, 20, 30, 15]);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[1]!.x).toBeCloseTo(10, 6);
    expect(out[1]!.y).toBeCloseTo(20, 6);
    expect(out[2]!.x).toBeCloseTo(20, 6);
    expect(out[3]!.y).toBeCloseTo(15, 6);
    // Midpoint lands between neighbours.
    expect(out[4]!.x).toBeGreaterThan(10);
    expect(out[4]!.x).toBeLessThan(20);
    expect(out[4]!.y).toBeGreaterThan(20);
  });

  it('clamps samples outside the control range', () => {
    const control = [
      { t: 5, x: 1, y: 2 },
      { t: 15, x: 3, y: 4 },
    ];
    const out = catmullRomSample(control, [0, 100]);
    expect(out[0]).toEqual({ x: 1, y: 2 });
    expect(out[1]).toEqual({ x: 3, y: 4 });
  });

  it('handles empty and single-point control sets', () => {
    expect(catmullRomSample([], [1, 2])).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(catmullRomSample([{ t: 1, x: 7, y: 8 }], [0, 9])).toEqual([
      { x: 7, y: 8 },
      { x: 7, y: 8 },
    ]);
  });
});

describe('resampleByTime', () => {
  it('produces exactly the target count with strictly increasing timestamps', () => {
    const out = resampleByTime(parabolaPoints(57), 120);
    expect(out).toHaveLength(120);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.timestampMs).toBeGreaterThan(out[i - 1]!.timestampMs);
    }
    // Endpoints preserved.
    expect(out[0]!.timestampMs).toBe(0);
    expect(out[119]!.timestampMs).toBe(560);
    expect(out[0]!.x).toBeCloseTo(100);
    expect(out[119]!.x).toBeCloseTo(100 + 6 * 56);
  });

  it('linearly interpolates positions between source points', () => {
    const points: TrackPoint[] = [
      { timestampMs: 0, x: 0, y: 0, interpolated: false },
      { timestampMs: 100, x: 100, y: 50, interpolated: false },
    ];
    const out = resampleByTime(points, 5);
    expect(out.map((p) => p.x)).toEqual([0, 25, 50, 75, 100]);
    expect(out.map((p) => p.y)).toEqual([0, 12.5, 25, 37.5, 50]);
  });

  it('passes short inputs through', () => {
    const one = parabolaPoints(1);
    expect(resampleByTime(one, 120)).toEqual(one);
  });
});

describe('buildTracerPath', () => {
  it('resamples to ~120 monotone points and scales to native resolution', () => {
    const track = trackOf(parabolaPoints(57));
    const tracer = buildTracerPath(track, {}, { width: 1920, height: 1080 });
    expect(tracer.points).toHaveLength(120);
    const sx = 1920 / 480;
    const sy = 1080 / 270;
    expect(tracer.points[0]!.x).toBeCloseTo(100 * sx);
    expect(tracer.points[0]!.y).toBeCloseTo(220 * sy);
    for (let i = 1; i < tracer.points.length; i++) {
      expect(tracer.points[i]!.timestampMs).toBeGreaterThan(
        tracer.points[i - 1]!.timestampMs,
      );
    }
    expect(tracer.style).toEqual(DEFAULT_TRACER_STYLE);
  });

  it('finds the apex (min y) in the resampled path', () => {
    const track = trackOf(parabolaPoints(57));
    const tracer = buildTracerPath(track);
    const apex = tracer.points[tracer.apexIndex]!;
    for (const p of tracer.points) {
      expect(apex.y).toBeLessThanOrEqual(p.y);
    }
    // Truth apex at i = 26 → t = 260ms.
    expect(Math.abs(apex.timestampMs - 260)).toBeLessThan(15);
  });

  it('merges style overrides over the broadcast default', () => {
    const track = trackOf(parabolaPoints(10));
    const tracer = buildTracerPath(track, { color: '#00FF00', glowWidth: 20 });
    expect(tracer.style.color).toBe('#00FF00');
    expect(tracer.style.glowWidth).toBe(20);
    expect(tracer.style.strokeWidth).toBe(DEFAULT_TRACER_STYLE.strokeWidth);
    expect(tracer.style.glowColor).toBe(DEFAULT_TRACER_STYLE.glowColor);
  });

  it('handles an empty smoothed path', () => {
    const track = trackOf([]);
    const tracer = buildTracerPath(track);
    expect(tracer.points).toEqual([]);
    expect(tracer.apexIndex).toBe(0);
  });
});
