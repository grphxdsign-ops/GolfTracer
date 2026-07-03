import { makeSoccerScene } from '../../testutils/soccerScene';
import type { BallWorldPoint } from '../ballWorld';
import { detectGoalCross } from '../goalCross';

describe('detectGoalCross', () => {
  it('flags a centered strong take as a GOAL with the truth crossing coords', () => {
    const scene = makeSoccerScene({ speedKmh: 75, elevationDeg: 12 });
    const result = detectGoalCross(scene.truth.worldPoints, scene.goal);

    expect(result.crossed).toBe(true);
    expect(result.isGoal).toBe(true);
    expect(result.missedBy).toBe('none');

    // Kick from x = 3.96 aimed straight down the pitch: crossing x stays put.
    expect(result.xM).toBeCloseTo(3.96, 1);
    // Crossing height: ~1 m, well under the 2.44 m bar.
    expect(result.yM).toBeGreaterThan(0.5);
    expect(result.yM).toBeLessThan(scene.goal.heightM);
    expect(result.timestampMs).toBeGreaterThan(scene.truth.kickTimestampMs);
  });

  it('flags a wide take as crossed but NOT a goal, with the miss side', () => {
    // 25° right of straight from 11 m out → crosses ~5 m right of the kick.
    const scene = makeSoccerScene({ speedKmh: 75, elevationDeg: 12, azimuthDeg: 25 });
    const result = detectGoalCross(scene.truth.worldPoints, scene.goal);

    expect(result.crossed).toBe(true);
    expect(result.isGoal).toBe(false);
    expect(result.missedBy).toBe('right');
    expect(result.xM).toBeGreaterThan(scene.goal.widthM);
  });

  it('flags an over-the-bar take', () => {
    const scene = makeSoccerScene({ speedKmh: 75, elevationDeg: 30 });
    const result = detectGoalCross(scene.truth.worldPoints, scene.goal);

    expect(result.crossed).toBe(true);
    expect(result.isGoal).toBe(false);
    expect(result.missedBy).toBe('over');
    expect(result.yM).toBeGreaterThan(scene.goal.heightM);
  });

  it('reports no crossing when the weak take lands short of the goal', () => {
    const scene = makeSoccerScene({ speedKmh: 45, elevationDeg: 10 });
    const last = scene.truth.worldPoints[scene.truth.worldPoints.length - 1]!;
    expect(last.zM).toBeGreaterThan(0); // sanity: truly landed short

    const result = detectGoalCross(scene.truth.worldPoints, scene.goal);
    expect(result.crossed).toBe(false);
    expect(result.isGoal).toBe(false);
    expect(result.xM).toBeUndefined();
  });

  it('interpolates the crossing between straddling frames', () => {
    const mk = (zM: number, xM: number, yM: number, t: number): BallWorldPoint => ({
      frameIndex: Math.round(t / 10),
      timestampMs: t,
      xM,
      yM,
      zM,
      distanceToGoalLineM: Math.max(0, zM),
      rangeM: 10,
      ballDiameterPx: 8,
    });
    const result = detectGoalCross(
      [mk(1, 3.0, 1.0, 100), mk(-1, 4.0, 1.4, 110)],
      { widthM: 7.32, heightM: 2.44 },
    );
    expect(result.crossed).toBe(true);
    expect(result.isGoal).toBe(true);
    expect(result.xM).toBeCloseTo(3.5, 6);
    expect(result.yM).toBeCloseTo(1.2, 6);
    expect(result.timestampMs).toBeCloseTo(105, 6);
  });
});
