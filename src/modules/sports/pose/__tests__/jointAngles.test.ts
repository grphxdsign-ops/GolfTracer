/**
 * Joint-angle tests: exact angles on constructed skeletons, the both-sides
 * joint-angle table, and finite-difference angular velocity correctness
 * (exact for linear series everywhere, for quadratics at interior points).
 */
import { POSE_LANDMARKS, type PoseFrame } from '../PoseAdapter';
import { skeletonKeypoints } from '../fakePoseEstimator';
import {
  angularVelocityDegPerS,
  computeJointAngleTable,
  jointAngleDeg,
} from '../jointAngles';

describe('jointAngleDeg', () => {
  it('measures a right angle', () => {
    expect(
      jointAngleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }),
    ).toBeCloseTo(90, 9);
  });

  it('measures straight (180) and folded (0) configurations', () => {
    expect(
      jointAngleDeg({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }),
    ).toBeCloseTo(180, 9);
    // acos loses precision near +/-1, so the folded case is only ~1e-4 deg.
    expect(
      jointAngleDeg({ x: 2, y: 2 }, { x: 0, y: 0 }, { x: 4, y: 4 }),
    ).toBeCloseTo(0, 3);
  });

  it('measures an exact 45 degree construction', () => {
    expect(
      jointAngleDeg({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }),
    ).toBeCloseTo(45, 9);
  });

  it('uses z when provided', () => {
    expect(
      jointAngleDeg(
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
      ),
    ).toBeCloseTo(90, 9);
  });

  it('returns 0 for degenerate zero-length segments', () => {
    expect(
      jointAngleDeg({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }),
    ).toBe(0);
  });
});

describe('computeJointAngleTable', () => {
  it('is exact on a constructed skeleton', () => {
    // Left side: perfectly straight vertical chain (all 180); right side:
    // knee bent 90 degrees, hip at 90, ankle at 90.
    const keypoints = skeletonKeypoints({
      leftShoulder: { x: 100, y: 100 },
      leftHip: { x: 100, y: 200 },
      leftKnee: { x: 100, y: 300 },
      leftAnkle: { x: 100, y: 400 },
      leftFootIndex: { x: 100, y: 500 },
      rightShoulder: { x: 200, y: 100 },
      rightHip: { x: 200, y: 200 },
      rightKnee: { x: 300, y: 200 }, // thigh horizontal: hip angle 90
      rightAnkle: { x: 300, y: 300 }, // shank vertical: knee angle 90
      rightFootIndex: { x: 400, y: 300 }, // foot horizontal: ankle angle 90
    });
    const pose: PoseFrame = { frameIndex: 0, timestampMs: 0, keypoints };

    const table = computeJointAngleTable(pose);
    expect(table.left.shoulderHip).toBeCloseTo(180, 9);
    expect(table.left.hipKnee).toBeCloseTo(180, 9);
    expect(table.left.kneeAnkle).toBeCloseTo(180, 9);
    expect(table.right.shoulderHip).toBeCloseTo(90, 9);
    expect(table.right.hipKnee).toBeCloseTo(90, 9);
    expect(table.right.kneeAnkle).toBeCloseTo(90, 9);
  });

  it('reads the correct BlazePose indices', () => {
    // Sanity-pin a few canonical BlazePose indices the table depends on.
    expect(POSE_LANDMARKS.leftShoulder).toBe(11);
    expect(POSE_LANDMARKS.rightShoulder).toBe(12);
    expect(POSE_LANDMARKS.leftHip).toBe(23);
    expect(POSE_LANDMARKS.rightHip).toBe(24);
    expect(POSE_LANDMARKS.leftKnee).toBe(25);
    expect(POSE_LANDMARKS.rightAnkle).toBe(28);
    expect(POSE_LANDMARKS.rightFootIndex).toBe(32);
  });

  it('throws on a truncated keypoint array', () => {
    const pose: PoseFrame = {
      frameIndex: 0,
      timestampMs: 0,
      keypoints: [{ x: 0, y: 0, visibility: 1 }],
    };
    expect(() => computeJointAngleTable(pose)).toThrow(/missing keypoint/);
  });
});

describe('angularVelocityDegPerS', () => {
  it('handles empty and single-sample series', () => {
    expect(angularVelocityDegPerS([])).toEqual([]);
    expect(angularVelocityDegPerS([{ timestampMs: 0, angleDeg: 45 }])).toEqual([0]);
  });

  it('is exact everywhere for a linear ramp', () => {
    // 90 deg over 300 ms = 300 deg/s.
    const series = [0, 100, 200, 300].map((t) => ({
      timestampMs: t,
      angleDeg: 45 + 0.3 * t,
    }));
    const velocity = angularVelocityDegPerS(series);
    expect(velocity).toHaveLength(4);
    for (const v of velocity) {
      expect(v).toBeCloseTo(300, 9);
    }
  });

  it('central differences are exact for a quadratic at interior samples', () => {
    // angle(t) = 0.5 * (t/10)^2 deg with t in ms: d(angle)/dt = 10*t deg/s
    // (t in s). Central difference is exact for quadratics.
    const angle = (tMs: number): number => 0.005 * tMs * tMs * 0.001;
    const series = [0, 40, 80, 120, 160].map((t) => ({
      timestampMs: t,
      angleDeg: angle(t),
    }));
    const velocity = angularVelocityDegPerS(series);
    for (let i = 1; i < series.length - 1; i++) {
      const exact = 2 * 0.005 * series[i]!.timestampMs * 0.001 * 1000;
      expect(velocity[i]).toBeCloseTo(exact, 9);
    }
  });

  it('rejects non-increasing timestamps', () => {
    expect(() =>
      angularVelocityDegPerS([
        { timestampMs: 100, angleDeg: 0 },
        { timestampMs: 100, angleDeg: 10 },
      ]),
    ).toThrow(/strictly increasing/);
  });
});
