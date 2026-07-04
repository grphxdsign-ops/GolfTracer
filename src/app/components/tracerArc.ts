/**
 * Tracer-arc geometry — the shape shared by the static logomark (TracerMark)
 * and the loading animation (TracerLoader), so the two can never drift
 * (docs/DESIGN.md §1.1).
 *
 * The arc is a ball-flight tracer: a fat ember bulb at the impact end
 * (param 0) sweeping ~215° through the bottom and up the right to a thin
 * white-gold head thread near top center (param 1), width tapering with
 * (1−t)^1.6 — matching docs/brand/logomark-master.png. All values live in a
 * 100×100 viewport; renderers scale.
 */
import { tracer } from '../theme';

export const VIEWPORT = 100;
/** Arc center, sized so the glow never clips the viewport. */
const CX = 46;
const CY = 46;
/** Sweep: bulb at 135° through bottom (90°) and right (0°) to −80°. */
const START_DEG = 135;
const SWEEP_DEG = 215;
/** Radius eases inward toward the head — a comet, not a compass circle. */
const R_START = 38;
const R_DRIFT = 4;
/** Half-width taper: ~6.4 at the bulb to a 0.6 thread at the head. */
const W_MAX = 6.4;
const W_MIN = 0.6;
/** Samples across the full arc; sub-ranges keep the same count (denser). */
export const ARC_SAMPLES = 40;

/** Ember gradient stops, tail (impact) → mid → white-gold head (§6 recipe). */
export const ARC_COLORS = [tracer.tail, tracer.mid, tracer.head] as const;
export const ARC_POSITIONS = [0, 0.55, 1] as const;

export interface ArcPoint {
  /** Centerline point. */
  p: { x: number; y: number };
  /** Outward unit normal (radial). */
  n: { x: number; y: number };
  /** Half-width of the trail here. */
  w: number;
}

/** Sample the arc centerline, normal, and half-width at param t ∈ [0, 1]. */
export function arcPoint(t: number): ArcPoint {
  const theta = ((START_DEG - SWEEP_DEG * t) * Math.PI) / 180;
  const r = R_START - R_DRIFT * t;
  const n = { x: Math.cos(theta), y: Math.sin(theta) };
  return {
    p: { x: CX + r * n.x, y: CY + r * n.y },
    n,
    w: W_MIN + W_MAX * Math.pow(1 - t, 1.6),
  };
}

/**
 * Filled tapered-crescent SVG path over the sub-range [tStart, tEnd] — outer
 * edge out, inner edge back, closed. The full mark is (0, 1); the loader
 * reveals it head-first by growing tEnd from 0 → 1.
 */
export function buildCrescentPath(tStart = 0, tEnd = 1): string {
  const outer: Array<{ x: number; y: number }> = [];
  const inner: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const t = tStart + ((tEnd - tStart) * i) / ARC_SAMPLES;
    const { p, n, w } = arcPoint(t);
    outer.push({ x: p.x + n.x * w, y: p.y + n.y * w });
    inner.push({ x: p.x - n.x * w, y: p.y - n.y * w });
  }
  const fmt = (pt: { x: number; y: number }) =>
    `${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
  const forward = outer.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${fmt(pt)}`);
  const back = inner.reverse().map((pt) => `L ${fmt(pt)}`);
  return `${forward.join(' ')} ${back.join(' ')} Z`;
}

/** Impact end (fat bulb) and head end (thin thread), precomputed. */
export const BULB = arcPoint(0);
export const HEAD = arcPoint(1);
