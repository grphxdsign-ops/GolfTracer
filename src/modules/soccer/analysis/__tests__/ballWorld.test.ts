import { getSportProfile } from '../../../sports/engine/sportProfile';
import { makeSoccerScene } from '../../testutils/soccerScene';
import {
  ballWorldFromObservations,
  solveCameraPoseFromGoal,
} from '../ballWorld';

const BALL_DIAMETER_M = getSportProfile('soccer').ball.diameterM;

describe('solveCameraPoseFromGoal', () => {
  it('recovers the synthetic camera pose from the goal corner boxes', () => {
    const scene = makeSoccerScene({ speedKmh: 75, elevationDeg: 12 });
    const pose = solveCameraPoseFromGoal(
      scene.goalDetection,
      scene.goal,
      scene.intrinsics,
    );
    // The scene camera looks straight down -z from (3.66, 1.4, 18) in the
    // left-post world frame: R = [[1,0,0],[0,-1,0],[0,0,-1]], t = -R·C.
    expect(pose.t.x).toBeCloseTo(-3.66, 4);
    expect(pose.t.y).toBeCloseTo(1.4, 4);
    expect(pose.t.z).toBeCloseTo(18, 4);
    expect(pose.R[0]![0]!).toBeCloseTo(1, 6);
    expect(pose.R[1]![1]!).toBeCloseTo(-1, 6);
    expect(pose.R[2]![2]!).toBeCloseTo(-1, 6);
  });
});

describe('ballWorldFromObservations', () => {
  it('recovers per-frame world XYZ and distance-to-goal-line on exact observations', () => {
    const scene = makeSoccerScene({ speedKmh: 75, elevationDeg: 12 });
    const pose = solveCameraPoseFromGoal(
      scene.goalDetection,
      scene.goal,
      scene.intrinsics,
    );
    const world = ballWorldFromObservations(
      scene.truth.observations,
      pose,
      scene.intrinsics,
      BALL_DIAMETER_M,
    );

    expect(world.length).toBe(scene.truth.worldPoints.length);
    for (let i = 0; i < world.length; i++) {
      const got = world[i]!;
      const want = scene.truth.worldPoints[i]!;
      expect(got.xM).toBeCloseTo(want.xM, 2);
      expect(got.yM).toBeCloseTo(want.yM, 2);
      expect(got.zM).toBeCloseTo(want.zM, 2);
      expect(got.distanceToGoalLineM).toBeCloseTo(want.distanceToGoalLineM, 2);
      expect(got.rangeM).toBeCloseTo(want.rangeM, 2);
    }

    // The measure_plan readout: ~11 m to the goal line at contact, receding
    // monotonically toward the goal.
    const first = world[0]!;
    expect(first.distanceToGoalLineM).toBeGreaterThan(10);
    expect(first.distanceToGoalLineM).toBeLessThan(12);
    for (let i = 1; i < world.length; i++) {
      expect(world[i]!.zM).toBeLessThan(world[i - 1]!.zM + 1e-6);
    }
    // The apparent ball diameter shrinks as the ball recedes.
    expect(world[world.length - 1]!.ballDiameterPx).toBeLessThan(
      first.ballDiameterPx,
    );
  });

  it('clamps distance-to-goal-line at 0 once the ball is behind the line', () => {
    const scene = makeSoccerScene({ speedKmh: 75, elevationDeg: 12 });
    const pose = solveCameraPoseFromGoal(
      scene.goalDetection,
      scene.goal,
      scene.intrinsics,
    );
    const world = ballWorldFromObservations(
      scene.truth.observations,
      pose,
      scene.intrinsics,
      BALL_DIAMETER_M,
    );
    const behind = world.filter((p) => p.zM < 0);
    expect(behind.length).toBeGreaterThan(0);
    for (const p of behind) {
      expect(p.distanceToGoalLineM).toBe(0);
    }
  });

  it('skips degenerate zero-radius observations', () => {
    const scene = makeSoccerScene({ speedKmh: 60, elevationDeg: 10 });
    const pose = solveCameraPoseFromGoal(
      scene.goalDetection,
      scene.goal,
      scene.intrinsics,
    );
    const obs = [...scene.truth.observations];
    obs[0] = { ...obs[0]!, radiusPx: 0 };
    const world = ballWorldFromObservations(obs, pose, scene.intrinsics, BALL_DIAMETER_M);
    expect(world.length).toBe(obs.length - 1);
  });
});
