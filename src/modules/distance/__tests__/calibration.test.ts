/**
 * Calibration math tests: pinhole relations, homography DLT round trips and
 * degeneracy rejection, linear solvers, and the buildCalibration ladder.
 */
import {
  SingularMatrixError,
  solveLeastSquares,
  solveLinearSystem,
} from '../calibration/linalg';
import {
  distanceFromBallDiameter,
  focalLengthPxFromFov,
  focalPxFromKnownDistance,
  metersPerPixelFromBallRadius,
} from '../calibration/pinhole';
import {
  applyHomography,
  computeHomography,
  type PointPair,
} from '../calibration/homography';
import {
  buildCalibration,
  metersPerPixelAt,
  scaleSource,
  DEFAULT_HFOV_DEG,
} from '../calibration/calibrate';
import { BALL_DIAMETER_M } from '../physics/constants';
import type { CalibrationInput } from '../../../types';

const VIDEO_META = { width: 1920, height: 1080, fps: 120 };

describe('linalg', () => {
  it('solves a well-conditioned square system', () => {
    const x = solveLinearSystem(
      [
        [2, 1, -1],
        [-3, -1, 2],
        [-2, 1, 2],
      ],
      [8, -11, -3],
    );
    expect(x[0]).toBeCloseTo(2, 8);
    expect(x[1]).toBeCloseTo(3, 8);
    expect(x[2]).toBeCloseTo(-1, 8);
  });

  it('throws SingularMatrixError on a singular system', () => {
    expect(() =>
      solveLinearSystem(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toThrow(SingularMatrixError);
  });

  it('least squares recovers an exact solution of a consistent tall system', () => {
    // y = 3x + 2 sampled at x = 0..4.
    const A = [0, 1, 2, 3, 4].map((x) => [x, 1]);
    const b = [2, 5, 8, 11, 14];
    const sol = solveLeastSquares(A, b);
    expect(sol[0]).toBeCloseTo(3, 8);
    expect(sol[1]).toBeCloseTo(2, 8);
  });
});

describe('pinhole', () => {
  it('computes focal length from FOV: 90deg over 1000px -> 500px', () => {
    expect(focalLengthPxFromFov(90, 1000)).toBeCloseTo(500, 6);
  });

  it('recovers the focal length from a known ball at a known distance', () => {
    const focal = 1500;
    const distanceM = 8;
    // Forward-project the ball to a pixel radius, then invert both ways.
    const radiusPx = (focal * BALL_DIAMETER_M) / (2 * distanceM);
    expect(distanceFromBallDiameter(focal, radiusPx)).toBeCloseTo(distanceM, 8);
    expect(focalPxFromKnownDistance(distanceM, radiusPx)).toBeCloseTo(focal, 8);
  });

  it('meters-per-pixel at ball depth equals ball diameter over pixel diameter', () => {
    expect(metersPerPixelFromBallRadius(4)).toBeCloseTo(
      BALL_DIAMETER_M / 8,
      10,
    );
  });

  it('rejects invalid input', () => {
    expect(() => focalLengthPxFromFov(0, 1000)).toThrow();
    expect(() => focalLengthPxFromFov(180, 1000)).toThrow();
    expect(() => distanceFromBallDiameter(1500, 0)).toThrow();
  });
});

describe('homography', () => {
  const H_TRUE = [
    [1.2, 0.15, 40],
    [-0.08, 0.95, -12],
    [0.0004, 0.0002, 1],
  ];

  const makePairs = (points: { x: number; y: number }[]): PointPair[] =>
    points.map((src) => ({ src, dst: applyHomography(H_TRUE, src) }));

  it('round-trips 4 known points exactly', () => {
    const pairs = makePairs([
      { x: 100, y: 100 },
      { x: 900, y: 120 },
      { x: 850, y: 700 },
      { x: 150, y: 650 },
    ]);
    const result = computeHomography(pairs);
    expect(result.rmsError).toBeLessThan(1e-6);
    for (const pair of pairs) {
      const mapped = applyHomography(result.H, pair.src);
      expect(mapped.x).toBeCloseTo(pair.dst.x, 5);
      expect(mapped.y).toBeCloseTo(pair.dst.y, 5);
    }
  });

  it('fits 6 points in least squares and generalizes to unseen points', () => {
    const pairs = makePairs([
      { x: 50, y: 80 },
      { x: 1800, y: 90 },
      { x: 1700, y: 1000 },
      { x: 120, y: 950 },
      { x: 960, y: 540 },
      { x: 400, y: 300 },
    ]);
    const result = computeHomography(pairs);
    expect(result.rmsError).toBeLessThan(1e-6);
    // Unseen probe point.
    const probe = { x: 777, y: 444 };
    const expected = applyHomography(H_TRUE, probe);
    const mapped = applyHomography(result.H, probe);
    expect(mapped.x).toBeCloseTo(expected.x, 4);
    expect(mapped.y).toBeCloseTo(expected.y, 4);
  });

  it('reports per-pair reprojection errors', () => {
    const pairs = makePairs([
      { x: 100, y: 100 },
      { x: 900, y: 120 },
      { x: 850, y: 700 },
      { x: 150, y: 650 },
    ]);
    const result = computeHomography(pairs);
    expect(result.reprojectionErrors).toHaveLength(4);
    expect(result.maxError).toBeGreaterThanOrEqual(result.rmsError * 0.5);
  });

  it('rejects fewer than 4 pairs', () => {
    const pairs = makePairs([
      { x: 100, y: 100 },
      { x: 900, y: 120 },
      { x: 850, y: 700 },
    ]);
    expect(() => computeHomography(pairs)).toThrow(/at least 4/);
  });

  it('rejects degenerate collinear source points', () => {
    // All source points on the line y = x.
    const pairs: PointPair[] = [
      { src: { x: 0, y: 0 }, dst: { x: 0, y: 0 } },
      { src: { x: 100, y: 100 }, dst: { x: 10, y: 0 } },
      { src: { x: 200, y: 200 }, dst: { x: 20, y: 0 } },
      { src: { x: 300, y: 300 }, dst: { x: 30, y: 0 } },
    ];
    expect(() => computeHomography(pairs)).toThrow(SingularMatrixError);
  });
});

describe('buildCalibration ladder', () => {
  const base: CalibrationInput = {
    club: '7-iron',
    cameraAngle: 'face-on',
  };

  it('prefers an explicit focal length', () => {
    const model = buildCalibration(
      { ...base, focalLengthPx: 1234, horizontalFovDeg: 70 },
      VIDEO_META,
    );
    expect(model.focalLengthPx).toBe(1234);
    expect(model.focalSource).toBe('explicit');
  });

  it('derives focal length from FOV when no explicit value', () => {
    const model = buildCalibration({ ...base, horizontalFovDeg: 90 }, VIDEO_META);
    expect(model.focalLengthPx).toBeCloseTo(960, 4);
    expect(model.focalSource).toBe('fov');
  });

  it('falls back to the default 60deg FOV', () => {
    const model = buildCalibration(base, VIDEO_META);
    expect(model.focalSource).toBe('default');
    expect(model.focalLengthPx).toBeCloseTo(
      focalLengthPxFromFov(DEFAULT_HFOV_DEG, VIDEO_META.width),
      6,
    );
  });

  it('uses the ball-diameter anchor for scale and camera distance', () => {
    const model = buildCalibration(
      { ...base, ballRadiusAtAddressPx: 4 },
      VIDEO_META,
    );
    expect(scaleSource(model)).toBe('ball-anchor');
    expect(model.cameraDistanceSource).toBe('ball-anchor');
    expect(metersPerPixelAt(model)).toBeCloseTo(BALL_DIAMETER_M / 8, 10);
    expect(model.cameraDistanceM).toBeCloseTo(
      (model.focalLengthPx * BALL_DIAMETER_M) / 8,
      8,
    );
  });

  it('builds a homography from 4+ reference points', () => {
    const model = buildCalibration(
      {
        ...base,
        referencePoints: [
          // image px -> world yards: x' = (x-100)/10, z' = (500-y)/10
          { imageX: 100, imageY: 500, worldXYards: 0, worldZYards: 0, label: 'tee' },
          { imageX: 300, imageY: 500, worldXYards: 20, worldZYards: 0, label: 'm1' },
          { imageX: 300, imageY: 300, worldXYards: 20, worldZYards: 20, label: 'm2' },
          { imageX: 100, imageY: 300, worldXYards: 0, worldZYards: 20, label: 'm3' },
        ],
      },
      VIDEO_META,
    );
    expect(model.homography).toBeDefined();
    expect(model.homography?.rmsError ?? 1).toBeLessThan(1e-6);
    const world = applyHomography(model.homography!.H, { x: 200, y: 400 });
    expect(world.x).toBeCloseTo(10, 5);
    expect(world.y).toBeCloseTo(10, 5);
  });

  it('ignores degenerate reference points instead of failing', () => {
    const model = buildCalibration(
      {
        ...base,
        referencePoints: [
          { imageX: 0, imageY: 0, worldXYards: 0, worldZYards: 0, label: 'a' },
          { imageX: 10, imageY: 10, worldXYards: 1, worldZYards: 0, label: 'b' },
          { imageX: 20, imageY: 20, worldXYards: 2, worldZYards: 0, label: 'c' },
          { imageX: 30, imageY: 30, worldXYards: 3, worldZYards: 0, label: 'd' },
        ],
      },
      VIDEO_META,
    );
    expect(model.homography).toBeUndefined();
    expect(scaleSource(model)).toBe('assumed-depth');
  });

  it('assumed-depth scale equals cameraDistance / focal', () => {
    const model = buildCalibration(base, VIDEO_META);
    expect(metersPerPixelAt(model)).toBeCloseTo(
      model.cameraDistanceM / model.focalLengthPx,
      12,
    );
  });

  it('timeScale is 1 for normal video (recordedFps absent or equal)', () => {
    expect(buildCalibration(base, VIDEO_META).timeScale).toBe(1);
    expect(
      buildCalibration(base, { ...VIDEO_META, recordedFps: VIDEO_META.fps })
        .timeScale,
    ).toBe(1);
  });

  it('timeScale is fps/recordedFps for slow-motion clips', () => {
    const model = buildCalibration(base, {
      width: 1920,
      height: 1080,
      fps: 30,
      recordedFps: 240,
    });
    expect(model.timeScale).toBeCloseTo(0.125, 12);
  });

  it('timeScale falls back to 1 on nonsensical fps metadata', () => {
    const model = buildCalibration(base, {
      width: 1920,
      height: 1080,
      fps: 0,
      recordedFps: 240,
    });
    expect(model.timeScale).toBe(1);
  });
});
