/**
 * Estimation tests: Nelder–Mead on Rosenbrock, launch-condition recovery
 * from synthetic pixel tracks (simulator output projected through a known
 * CameraModel plus 1px noise), and the estimateDistance method ladder.
 *
 * Synthetic tracks are generated locally by projecting the physics
 * simulator's own output — this module never imports from tracking/capture.
 */
import type { BallTrack, TrackPoint, TrackQuality } from '../../../types';

import { nelderMead } from '../estimate/neldermead';
import { fitLaunchFromTrack } from '../estimate/launchFit';
import { estimateDistance } from '../estimate/estimateDistance';
import { buildCalibration, metersPerPixelAt } from '../calibration/calibrate';
import {
  simulateFlight,
  type LaunchConditions,
  type TrajectoryPoint,
} from '../physics/simulator';

const FRAME = { width: 1920, height: 1080 };
const VIDEO_META = { ...FRAME, fps: 240 };

// ---------------------------------------------------------------------------
// Synthetic track generation
// ---------------------------------------------------------------------------

/** Deterministic pseudo-random generator (LCG) for repeatable noise. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff; // [0, 1)
  };
}

function trajectoryAt(
  traj: TrajectoryPoint[],
  t: number,
): { x: number; y: number } {
  const first = traj[0]!;
  if (t <= first.t) {
    return { x: first.x, y: first.y };
  }
  for (let i = 1; i < traj.length; i++) {
    if (traj[i]!.t >= t) {
      const a = traj[i - 1]!;
      const b = traj[i]!;
      const f = (t - a.t) / (b.t - a.t || 1e-9);
      return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
    }
  }
  const last = traj[traj.length - 1]!;
  return { x: last.x, y: last.y };
}

interface SyntheticTrackOptions {
  launch: LaunchConditions;
  /** Meters per pixel at the ball plane (must match the CameraModel). */
  metersPerPixel: number;
  originPx: { x: number; y: number };
  fps: number;
  numPoints: number;
  noisePx: number;
  quality?: TrackQuality;
  seed?: number;
}

function makeSyntheticTrack(opts: SyntheticTrackOptions): BallTrack {
  const flight = simulateFlight(opts.launch);
  const rng = makeRng(opts.seed ?? 42);
  const noise = () => (rng() * 2 - 1) * opts.noisePx;
  const impactTimestampMs = 1000;

  const smoothedPath: TrackPoint[] = [];
  for (let i = 0; i < opts.numPoints; i++) {
    const t = i / opts.fps;
    const sim = trajectoryAt(flight.trajectory, t);
    smoothedPath.push({
      timestampMs: impactTimestampMs + (i * 1000) / opts.fps,
      x: opts.originPx.x + sim.x / opts.metersPerPixel + noise(),
      y: opts.originPx.y - sim.y / opts.metersPerPixel + noise(),
      interpolated: false,
    });
  }

  let apexPointIndex = 0;
  for (let i = 1; i < smoothedPath.length; i++) {
    if (smoothedPath[i]!.y < smoothedPath[apexPointIndex]!.y) {
      apexPointIndex = i;
    }
  }

  return {
    observations: smoothedPath.map((p, i) => ({
      frameIndex: i,
      timestampMs: p.timestampMs,
      cx: p.x,
      cy: p.y,
      radiusPx: 4,
      confidence: 0.9,
    })),
    smoothedPath,
    impactFrameIndex: 0,
    impactTimestampMs,
    apexPointIndex,
    frameWidth: FRAME.width,
    frameHeight: FRAME.height,
    quality: opts.quality ?? 'high',
  };
}

// ---------------------------------------------------------------------------
// Nelder–Mead
// ---------------------------------------------------------------------------

describe('nelderMead', () => {
  it('minimizes the Rosenbrock function from the classic start', () => {
    const rosenbrock = (v: number[]) => {
      const x = v[0]!;
      const y = v[1]!;
      return (1 - x) ** 2 + 100 * (y - x * x) ** 2;
    };
    const result = nelderMead(rosenbrock, [-1.2, 1], {
      step: 0.5,
      maxIterations: 5000,
      fTolerance: 1e-12,
      xTolerance: 1e-8,
    });
    expect(result.x[0]!).toBeCloseTo(1, 3);
    expect(result.x[1]!).toBeCloseTo(1, 3);
    expect(result.fx).toBeLessThan(1e-6);
  });

  it('converges on a simple quadratic bowl', () => {
    const f = (x: number[]) => (x[0]! - 3) ** 2 + (x[1]! + 2) ** 2 + 7;
    const result = nelderMead(f, [0, 0], { step: 1 });
    expect(result.converged).toBe(true);
    expect(result.x[0]!).toBeCloseTo(3, 4);
    expect(result.x[1]!).toBeCloseTo(-2, 4);
    expect(result.fx).toBeCloseTo(7, 6);
  });
});

// ---------------------------------------------------------------------------
// Launch fit
// ---------------------------------------------------------------------------

describe('fitLaunchFromTrack', () => {
  it(
    'recovers a synthetic 7-iron launch within 5% speed / 1.5 deg angle',
    () => {
      const trueLaunch: LaunchConditions = {
        ballSpeedMph: 115,
        launchAngleDeg: 18.5,
        backspinRpm: 6500,
      };
      const model = buildCalibration(
        { club: '7-iron', cameraAngle: 'face-on', ballRadiusAtAddressPx: 4 },
        VIDEO_META,
      );
      const mpp = metersPerPixelAt(model);
      const track = makeSyntheticTrack({
        launch: trueLaunch,
        metersPerPixel: mpp,
        originPx: { x: 200, y: 900 },
        fps: VIDEO_META.fps,
        numPoints: 40,
        noisePx: 1,
      });

      const fit = fitLaunchFromTrack(track, model, '7-iron');
      expect(fit.converged).toBe(true);
      expect(fit.usedPoints).toBe(40);
      expect(
        Math.abs(fit.launch.ballSpeedMph - trueLaunch.ballSpeedMph) /
          trueLaunch.ballSpeedMph,
      ).toBeLessThan(0.05);
      expect(
        Math.abs(fit.launch.launchAngleDeg - trueLaunch.launchAngleDeg),
      ).toBeLessThan(1.5);
      expect(fit.pixelRms).toBeLessThan(fit.rmsThreshold);
    },
    30000,
  );

  it('does not converge on a track with too few points', () => {
    const model = buildCalibration(
      { club: 'driver', cameraAngle: 'face-on', ballRadiusAtAddressPx: 4 },
      VIDEO_META,
    );
    const track = makeSyntheticTrack({
      launch: { ballSpeedMph: 150, launchAngleDeg: 12, backspinRpm: 2500 },
      metersPerPixel: metersPerPixelAt(model),
      originPx: { x: 200, y: 900 },
      fps: VIDEO_META.fps,
      numPoints: 3,
      noisePx: 0,
    });
    const fit = fitLaunchFromTrack(track, model, 'driver');
    expect(fit.converged).toBe(false);
    // Falls back to the club prior means.
    expect(fit.launch.ballSpeedMph).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// estimateDistance method ladder
// ---------------------------------------------------------------------------

describe('estimateDistance', () => {
  it(
    "selects 'physics-fit' when the launch fit converges without homography",
    () => {
      const trueLaunch: LaunchConditions = {
        ballSpeedMph: 115,
        launchAngleDeg: 18.5,
        backspinRpm: 6500,
      };
      const calibration = {
        club: '7-iron' as const,
        cameraAngle: 'face-on' as const,
        ballRadiusAtAddressPx: 4,
      };
      const model = buildCalibration(calibration, VIDEO_META);
      const track = makeSyntheticTrack({
        launch: trueLaunch,
        metersPerPixel: metersPerPixelAt(model),
        originPx: { x: 200, y: 900 },
        fps: VIDEO_META.fps,
        numPoints: 40,
        noisePx: 1,
      });

      const estimate = estimateDistance(track, calibration, VIDEO_META);
      expect(estimate.method).toBe('physics-fit');

      const trueCarry = simulateFlight(trueLaunch).carryYards;
      expect(
        Math.abs(estimate.carryYards - trueCarry) / trueCarry,
      ).toBeLessThan(0.1);
      expect(estimate.totalYards).toBeGreaterThan(estimate.carryYards);
      expect(estimate.confidence).toBeGreaterThan(0.3);
      expect(estimate.confidence).toBeLessThanOrEqual(1);
      expect(estimate.ballSpeedMph).toBeDefined();
      expect(estimate.launchAngleDeg).toBeDefined();
    },
    30000,
  );

  it("selects 'homography' when references and a landing point exist", () => {
    const calibration = {
      club: 'driver' as const,
      cameraAngle: 'down-the-line' as const,
      referencePoints: [
        // image px -> world yards: x' = (x-100)/10, z' = (500-y)/10
        { imageX: 100, imageY: 500, worldXYards: 0, worldZYards: 0, label: 'tee' },
        { imageX: 300, imageY: 500, worldXYards: 20, worldZYards: 0, label: 'a' },
        { imageX: 300, imageY: 300, worldXYards: 20, worldZYards: 20, label: 'b' },
        { imageX: 100, imageY: 300, worldXYards: 0, worldZYards: 20, label: 'c' },
      ],
    };

    // Sparse track (fit cannot converge) with a tracked landing pixel that
    // maps to world (150, 30) yards -> carry ~152.97 yd.
    const impactTimestampMs = 1000;
    const smoothedPath: TrackPoint[] = [
      { timestampMs: 1000, x: 110, y: 490, interpolated: false },
      { timestampMs: 1100, x: 400, y: 380, interpolated: false },
      { timestampMs: 3000, x: 1600, y: 200, interpolated: false },
    ];
    const track: BallTrack = {
      observations: [],
      smoothedPath,
      impactFrameIndex: 0,
      impactTimestampMs,
      apexPointIndex: 1,
      landingPointIndex: 2,
      frameWidth: FRAME.width,
      frameHeight: FRAME.height,
      quality: 'high',
    };

    const estimate = estimateDistance(track, calibration, VIDEO_META);
    expect(estimate.method).toBe('homography');
    expect(estimate.carryYards).toBeCloseTo(Math.hypot(150, 30), 1);
    expect(estimate.totalYards).toBeGreaterThan(estimate.carryYards);
    expect(estimate.confidence).toBeGreaterThan(0.6);
  });

  it("falls back to 'club-prior' with confidence <= 0.3 on unusable tracks", () => {
    const calibration = {
      club: 'pitching-wedge' as const,
      cameraAngle: 'face-on' as const,
    };
    const track: BallTrack = {
      observations: [],
      smoothedPath: [
        { timestampMs: 1000, x: 200, y: 900, interpolated: false },
        { timestampMs: 1008, x: 210, y: 890, interpolated: true },
        { timestampMs: 1016, x: 220, y: 880, interpolated: true },
      ],
      impactFrameIndex: 0,
      impactTimestampMs: 1000,
      apexPointIndex: 2,
      frameWidth: FRAME.width,
      frameHeight: FRAME.height,
      quality: 'low',
    };

    const estimate = estimateDistance(track, calibration, VIDEO_META);
    expect(estimate.method).toBe('club-prior');
    expect(estimate.confidence).toBeLessThanOrEqual(0.3);
    // The fallback carry must sit in the club's published amateur band.
    expect(estimate.carryYards).toBeGreaterThanOrEqual(85);
    expect(estimate.carryYards).toBeLessThanOrEqual(125);
  });

  it('confidence ranks homography above club-prior for the same quality', () => {
    // Reuse the homography scenario, then strip references to force the
    // fallback, and compare confidences.
    const referencePoints = [
      { imageX: 100, imageY: 500, worldXYards: 0, worldZYards: 0, label: 'tee' },
      { imageX: 300, imageY: 500, worldXYards: 20, worldZYards: 0, label: 'a' },
      { imageX: 300, imageY: 300, worldXYards: 20, worldZYards: 20, label: 'b' },
      { imageX: 100, imageY: 300, worldXYards: 0, worldZYards: 20, label: 'c' },
    ];
    const track: BallTrack = {
      observations: [],
      smoothedPath: [
        { timestampMs: 1000, x: 110, y: 490, interpolated: false },
        { timestampMs: 1100, x: 400, y: 380, interpolated: false },
        { timestampMs: 3000, x: 1600, y: 200, interpolated: false },
      ],
      impactFrameIndex: 0,
      impactTimestampMs: 1000,
      apexPointIndex: 1,
      landingPointIndex: 2,
      frameWidth: FRAME.width,
      frameHeight: FRAME.height,
      quality: 'medium',
    };

    const withRefs = estimateDistance(
      track,
      { club: 'driver', cameraAngle: 'behind', referencePoints },
      VIDEO_META,
    );
    const withoutRefs = estimateDistance(
      track,
      { club: 'driver', cameraAngle: 'behind' },
      VIDEO_META,
    );
    expect(withRefs.method).toBe('homography');
    expect(withoutRefs.method).toBe('club-prior');
    expect(withRefs.confidence).toBeGreaterThan(withoutRefs.confidence);
  });
});
