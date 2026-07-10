/**
 * Trace persistence helpers — turn a tracked flight path into the compact,
 * normalized polyline stored on ShotRecord.tracePoints, and scale it back
 * out for drawing. Keeping the trace redrawable in history is a deliberate
 * competitive fix: Toptracer's most-repeated complaint is that the rich
 * live trace vanishes from later session review (docs/RESEARCH-APPS.md).
 */
import type { TrackPoint } from '../../types/tracking';
import type { TracePoint } from '../../state/historyStore';

/** Stored ceiling — enough for a smooth redraw, tiny in AsyncStorage. */
export const MAX_TRACE_POINTS = 24;

/**
 * Normalize a tracked path into ≤ MAX_TRACE_POINTS points in 0..1 frame
 * space. Returns undefined when the path is too short to redraw honestly
 * (fewer than 3 points) or the frame dims are degenerate.
 */
export function normalizeTrace(
  path: readonly TrackPoint[],
  frameWidth: number,
  frameHeight: number,
  maxPoints: number = MAX_TRACE_POINTS,
): TracePoint[] | undefined {
  if (path.length < 3 || frameWidth <= 0 || frameHeight <= 0) {
    return undefined;
  }
  const step = Math.max(1, Math.ceil(path.length / maxPoints));
  const sampled: TracePoint[] = [];
  for (let i = 0; i < path.length; i += step) {
    const p = path[i]!;
    sampled.push({
      x: clamp01(p.x / frameWidth),
      y: clamp01(p.y / frameHeight),
    });
  }
  // The head of the flight is the money point — always keep the last one.
  const last = path[path.length - 1]!;
  const tail = sampled[sampled.length - 1]!;
  const lastNorm = {
    x: clamp01(last.x / frameWidth),
    y: clamp01(last.y / frameHeight),
  };
  if (tail.x !== lastNorm.x || tail.y !== lastNorm.y) {
    sampled.push(lastNorm);
  }
  return sampled.length >= 3 ? sampled : undefined;
}

/**
 * Scale normalized trace points into a w×h box with uniform padding,
 * fitting the trace's own bounding box (so short chips and full drives both
 * fill the glyph) while preserving aspect via independent axis stretch —
 * a session glyph is a signature, not a measurement.
 */
export function traceToBox(
  points: readonly TracePoint[],
  w: number,
  h: number,
  pad: number,
): { x: number; y: number }[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const innerW = Math.max(1, w - pad * 2);
  const innerH = Math.max(1, h - pad * 2);
  return points.map((p) => ({
    x: pad + ((p.x - minX) / spanX) * innerW,
    y: pad + ((p.y - minY) / spanY) * innerH,
  }));
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
