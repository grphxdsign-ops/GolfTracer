import { runTracking } from '../../../tracking/tracker/pipeline';
import { getSportProfile } from '../../../sports/engine/sportProfile';
import { makeSoccerScene } from '../../testutils/soccerScene';
import {
  ballWorldFromObservations,
  solveCameraPoseFromGoal,
  type BallWorldPoint,
} from '../ballWorld';
import { computeSpeed } from '../speed';

const BALL_DIAMETER_M = getSportProfile('soccer').ball.diameterM;

function syntheticConstantSpeedTrack(speedMps: number): BallWorldPoint[] {
  const points: BallWorldPoint[] = [];
  for (let i = 0; i < 20; i++) {
    const t = i / 100; // 100 fps
    points.push({
      frameIndex: i,
      timestampMs: t * 1000,
      xM: 0,
      yM: 1,
      zM: 11 - speedMps * t,
      distanceToGoalLineM: Math.max(0, 11 - speedMps * t),
      rangeM: 7,
      ballDiameterPx: 10,
    });
  }
  return points;
}

/** End-to-end recovery: scene → frozen runTracking → world frame → speed. */
async function recoverShotSpeedKmh(speedKmh: number, elevationDeg: number) {
  const scene = makeSoccerScene({ speedKmh, elevationDeg });
  const { track } = await runTracking(scene.frameSource, {
    detector: scene.detector,
    impactRoi: scene.impactRoi,
    seedRoi: scene.seedRoi,
  });
  expect(track.quality).not.toBe('failed');
  expect(track.observations.length).toBeGreaterThan(10);

  const pose = solveCameraPoseFromGoal(
    scene.goalDetection,
    scene.goal,
    scene.intrinsics,
  );
  const world = ballWorldFromObservations(
    track.observations,
    pose,
    scene.intrinsics,
    BALL_DIAMETER_M,
  );
  return computeSpeed(world);
}

describe('computeSpeed', () => {
  it('recovers a constant world speed exactly', () => {
    const result = computeSpeed(syntheticConstantSpeedTrack(20));
    expect(result.shotSpeedMps).toBeCloseTo(20, 6);
    expect(result.shotSpeedKmh).toBeCloseTo(72, 5);
    for (const s of result.series) {
      expect(s.speedMps).toBeCloseTo(20, 6);
    }
  });

  it('applies the slow-motion time scale', () => {
    // Media time dilated 4x (recorded 240fps, played 60fps): timeScale 0.25.
    const result = computeSpeed(syntheticConstantSpeedTrack(20), {
      timeScale: 0.25,
    });
    expect(result.shotSpeedMps).toBeCloseTo(80, 6);
  });

  it('returns an empty result for fewer than 2 points', () => {
    expect(computeSpeed([])).toEqual({
      series: [],
      shotSpeedMps: 0,
      shotSpeedKmh: 0,
      peakIndex: -1,
    });
  });

  it('recovers the 75 km/h strong take within ±8% at a 120fps analog', async () => {
    const speed = await recoverShotSpeedKmh(75, 12);
    expect(Math.abs(speed.shotSpeedKmh - 75) / 75).toBeLessThan(0.08);
    // Per-frame CURRENT SPEED decays after the peak (drag only).
    const last = speed.series[speed.series.length - 1]!;
    expect(last.speedKmh).toBeLessThan(speed.shotSpeedKmh);
  });

  it('recovers the 45 km/h weak take within ±8% at a 120fps analog', async () => {
    const speed = await recoverShotSpeedKmh(45, 10);
    expect(Math.abs(speed.shotSpeedKmh - 45) / 45).toBeLessThan(0.08);
  });
});
