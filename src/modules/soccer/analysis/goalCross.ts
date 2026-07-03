/**
 * Goal-plane CROSS DETECTOR: finds the first frame pair where the ball's
 * world z crosses the goal plane (z = 0), interpolates the exact crossing
 * coordinates on the plane, and issues the GOAL? verdict against the post
 * and crossbar extents. Emits the store's GoalCrossing shape (x measured
 * from the left post) plus a `missedBy` detail for coaching copy.
 */
import type { WorldAnchorTemplate } from '../../sports/engine/sportProfile';
import type { GoalCrossing } from '../../sports/sportsSessionStore';
import type { BallWorldPoint } from './ballWorld';

export type GoalMiss = 'left' | 'right' | 'over' | 'none';

export interface GoalCrossResult extends GoalCrossing {
  /** Which way a crossing missed ('none' when it was a goal or never crossed). */
  missedBy: GoalMiss;
}

export function detectGoalCross(
  world: BallWorldPoint[],
  goal: Pick<WorldAnchorTemplate, 'widthM' | 'heightM'>,
): GoalCrossResult {
  for (let i = 0; i + 1 < world.length; i++) {
    const a = world[i]!;
    const b = world[i + 1]!;
    if (!(a.zM > 0 && b.zM <= 0)) continue;

    const f = a.zM / (a.zM - b.zM);
    const xM = a.xM + f * (b.xM - a.xM);
    const yM = a.yM + f * (b.yM - a.yM);
    const timestampMs = a.timestampMs + f * (b.timestampMs - a.timestampMs);

    const insidePosts = xM >= 0 && xM <= goal.widthM;
    const underBar = yM >= 0 && yM <= goal.heightM;
    const isGoal = insidePosts && underBar;
    const missedBy: GoalMiss = isGoal
      ? 'none'
      : xM < 0
        ? 'left'
        : xM > goal.widthM
          ? 'right'
          : 'over';

    return { crossed: true, isGoal, xM, yM, timestampMs, missedBy };
  }
  return { crossed: false, isGoal: false, missedBy: 'none' };
}
