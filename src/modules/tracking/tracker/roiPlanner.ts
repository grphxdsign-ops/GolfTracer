/**
 * ROI planning from a single user tap on the ball.
 *
 * Field evidence showed that impact detection and tracker seeding are
 * different jobs needing different boxes: the strike energy (club sweeping
 * through, ball leaving) lives in a tight box around the tee, while the first
 * clean post-impact detection appears in a tall corridor ABOVE the tee. Within
 * ±0.3s of impact the ground level around the tee is full of clutter — the
 * clubhead, the tumbling tee, the ball's shadow — so the seed corridor's
 * bottom edge deliberately sits above the tap point to exclude all of it.
 *
 * Coordinate space: whatever `dims` is in. The pipeline calls this with
 * analysis-frame dimensions and a tap point already scaled into that space,
 * so both returned ROIs are analysis-pixel ROIs there; callers passing native
 * dimensions get native-pixel ROIs.
 */
import { clampRoi, type Roi } from '../vision/imageOps';

export interface BallRois {
  /** Tight box around the tee where strike energy lives (impact detection). */
  impactRoi: Roi;
  /** Upward corridor above the tee where the tracker seeds. */
  seedRoi: Roi;
}

/** Impact-box half-size as a fraction of min(width, height). */
const IMPACT_HALF_FRACTION = 0.08;
/** Corridor width as a fraction of min(width, height). */
const SEED_WIDTH_FRACTION = 0.36;
/** Corridor bottom margin above the tap, as a fraction of min(w, h). */
const SEED_BOTTOM_MARGIN_FRACTION = 0.05;
/** Corridor height as a fraction of frame height. */
const SEED_SPAN_FRACTION = 0.55;
/** Corridor never starts above this fraction of the frame height. */
const SEED_TOP_FRACTION = 0.05;

/**
 * Derive the impact box and seed corridor from one tap on the ball. `point`
 * and `dims` must share a coordinate space; both ROIs come back clamped to
 * `dims`.
 */
export function deriveRoisFromBallPoint(
  point: { x: number; y: number },
  dims: { width: number; height: number },
): BallRois {
  const s = Math.min(dims.width, dims.height);

  const impactHalf = IMPACT_HALF_FRACTION * s;
  const impactRoi = clampRoi(
    {
      x: point.x - impactHalf,
      y: point.y - impactHalf,
      w: 2 * impactHalf,
      h: 2 * impactHalf,
    },
    dims.width,
    dims.height,
  );

  // Corridor bottom sits ABOVE the tap so ground-level clutter (tumbling tee,
  // drifting shadow) can never win the seed.
  const seedWidth = SEED_WIDTH_FRACTION * s;
  const seedBottom = point.y - SEED_BOTTOM_MARGIN_FRACTION * s;
  const seedTop = Math.max(
    SEED_TOP_FRACTION * dims.height,
    point.y - SEED_SPAN_FRACTION * dims.height,
  );
  const seedRoi = clampRoi(
    {
      x: point.x - seedWidth / 2,
      y: seedTop,
      w: seedWidth,
      h: seedBottom - seedTop,
    },
    dims.width,
    dims.height,
  );

  return { impactRoi, seedRoi };
}
