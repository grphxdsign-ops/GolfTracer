/**
 * Tracer path geometry: centripetal Catmull-Rom smoothing through the
 * observations, monotone-in-time resampling, and scaling from analysis
 * resolution back to native video resolution.
 */
import type {
  BallTrack,
  TracerPath,
  TracerStyle,
  TrackPoint,
} from '../../../types/tracking';

export interface PathSample {
  t: number;
  x: number;
  y: number;
}

export const DEFAULT_TRACER_STYLE: TracerStyle = {
  color: '#FF3B1F',
  glowColor: 'rgba(255, 122, 41, 0.55)',
  strokeWidth: 4,
  glowWidth: 14,
};

const EPS = 1e-6;

function dist(a: PathSample, b: PathSample): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Evaluate one centripetal Catmull-Rom segment (Barry–Goldman pyramid)
 * between p1 and p2 at u ∈ [0, 1].
 */
function crSegment(
  p0: PathSample,
  p1: PathSample,
  p2: PathSample,
  p3: PathSample,
  u: number,
): { x: number; y: number } {
  // Centripetal knots: t_{i+1} = t_i + |p_{i+1} - p_i|^0.5.
  const t0 = 0;
  const t1 = t0 + Math.max(Math.sqrt(dist(p0, p1)), EPS);
  const t2 = t1 + Math.max(Math.sqrt(dist(p1, p2)), EPS);
  const t3 = t2 + Math.max(Math.sqrt(dist(p2, p3)), EPS);
  const t = t1 + u * (t2 - t1);

  const lerp = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    ta: number,
    tb: number,
  ): { x: number; y: number } => {
    const w = (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
  };

  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/**
 * Sample a centripetal Catmull-Rom spline through `control` (ordered by t)
 * at each timestamp in `sampleTs`. Timestamps outside the control range are
 * clamped to the endpoints. Passes exactly through every control point.
 */
export function catmullRomSample(
  control: PathSample[],
  sampleTs: number[],
): { x: number; y: number }[] {
  if (control.length === 0) {
    return sampleTs.map(() => ({ x: 0, y: 0 }));
  }
  if (control.length === 1) {
    const p = control[0]!;
    return sampleTs.map(() => ({ x: p.x, y: p.y }));
  }

  const first = control[0]!;
  const last = control[control.length - 1]!;
  let seg = 0;
  return sampleTs.map((ts) => {
    if (ts <= first.t) return { x: first.x, y: first.y };
    if (ts >= last.t) return { x: last.x, y: last.y };
    // sampleTs is expected monotone; advance the segment cursor, but reset if
    // a caller passes unsorted timestamps.
    if (seg > 0 && ts < control[seg]!.t) seg = 0;
    while (seg < control.length - 2 && control[seg + 1]!.t <= ts) seg++;
    const p1 = control[seg]!;
    const p2 = control[seg + 1]!;
    if (ts >= p2.t) return { x: p2.x, y: p2.y };
    const p0 = control[Math.max(0, seg - 1)]!;
    const p3 = control[Math.min(control.length - 1, seg + 2)]!;
    const u = (ts - p1.t) / Math.max(p2.t - p1.t, EPS);
    return crSegment(p0, p1, p2, p3, u);
  });
}

/**
 * Resample a track to exactly `targetCount` points evenly spaced in time,
 * with strictly increasing timestamps (monotone-in-time by construction).
 * A point is marked interpolated when its nearest source point was.
 */
export function resampleByTime(
  points: TrackPoint[],
  targetCount = 120,
): TrackPoint[] {
  if (points.length <= 1 || targetCount < 2) {
    return points.map((p) => ({ ...p }));
  }
  const t0 = points[0]!.timestampMs;
  const t1 = points[points.length - 1]!.timestampMs;
  if (t1 <= t0) {
    return [{ ...points[0]! }];
  }
  const out: TrackPoint[] = [];
  let src = 0;
  for (let i = 0; i < targetCount; i++) {
    const ts = t0 + ((t1 - t0) * i) / (targetCount - 1);
    while (
      src < points.length - 2 &&
      points[src + 1]!.timestampMs <= ts
    ) {
      src++;
    }
    const a = points[src]!;
    const b = points[Math.min(points.length - 1, src + 1)]!;
    const span = Math.max(b.timestampMs - a.timestampMs, EPS);
    const w = Math.max(0, Math.min(1, (ts - a.timestampMs) / span));
    out.push({
      timestampMs: ts,
      x: a.x + (b.x - a.x) * w,
      y: a.y + (b.y - a.y) * w,
      interpolated: w < 0.5 ? a.interpolated : b.interpolated,
    });
  }
  return out;
}

/**
 * Build the renderable tracer path from a BallTrack: resample the smoothed
 * path to ~120 points and scale from analysis resolution back to the native
 * video resolution.
 */
export function buildTracerPath(
  track: BallTrack,
  style: Partial<TracerStyle> = {},
  nativeSize?: { width: number; height: number },
): TracerPath {
  const resampled = resampleByTime(track.smoothedPath, 120);
  const sx = nativeSize && track.frameWidth > 0 ? nativeSize.width / track.frameWidth : 1;
  const sy =
    nativeSize && track.frameHeight > 0 ? nativeSize.height / track.frameHeight : 1;
  const points = resampled.map((p) => ({
    ...p,
    x: p.x * sx,
    y: p.y * sy,
  }));
  let apexIndex = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.y < points[apexIndex]!.y) apexIndex = i;
  }
  return {
    points,
    apexIndex,
    style: { ...DEFAULT_TRACER_STYLE, ...style },
  };
}
