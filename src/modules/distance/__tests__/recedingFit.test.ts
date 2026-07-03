/**
 * Receding-ball depth rung tests, recreating field evidence #4: a 30 fps
 * behind/down-the-line clip where the ball rises a few hundred pixels with
 * hyperbolic-like deceleration — geometrically hopeless for the planar fit
 * but recoverable through the perspective reprojection model.
 *
 * Synthetic tracks are generated ONLY by projecting the physics simulator's
 * own output through the same behind-camera pinhole formula the fitter
 * uses (never hand-drawn curves); the decline-matrix synthetics exist only
 * to exercise rejection and never reach the optimizer.
 */
import type { BallTrack, TrackPoint, TrackQuality } from '../../../types';

import { fitLaunchFromTrack } from '../estimate/launchFit';
import {
  fitRecedingLaunch,
  RECEDING_MIN_POINTS,
} from '../estimate/recedingFit';
import { buildCalibration } from '../calibration/calibrate';
import { focalLengthPxFromFov } from '../calibration/pinhole';
import {
  simulateFlight,
  type LaunchConditions,
  type TrajectoryPoint,
} from '../physics/simulator';

/** 1080x1920 portrait frame (evidence clip after rotation). */
const FRAME = { width: 1080, height: 1920 };
const VIDEO_META = { ...FRAME, fps: 30 };

/** Ground truth: amateur-typical driver strike. */
const TRUE_LAUNCH: LaunchConditions = {
  ballSpeedMph: 150,
  launchAngleDeg: 12,
  backspinRpm: 2500,
};
/** Behind-camera geometry: 10 m behind the ball, 1.6 m off the ground. */
const D0_M = 10;
const HC_M = 1.6;
const FOCAL_PX = focalLengthPxFromFov(60, FRAME.width);

// ---------------------------------------------------------------------------
// Synthetic track generation (behind-camera pinhole projection)
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

function trackFromPath(smoothedPath: TrackPoint[]): BallTrack {
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
    impactTimestampMs: smoothedPath[0]!.timestampMs,
    apexPointIndex,
    frameWidth: FRAME.width,
    frameHeight: FRAME.height,
    quality: 'high',
  };
}

interface BehindTrackOptions {
  numPoints: number;
  noisePx: number;
  fps?: number;
  seed?: number;
}

/**
 * Project the simulated TRUE_LAUNCH flight through the behind-camera
 * pinhole: v(t) = cy + f * (hc - y(t)) / (d0 + x(t)), u(t) constant on the
 * optical axis (lateral ~ 0 by construction).
 */
function makeBehindTrack(opts: BehindTrackOptions): BallTrack {
  const flight = simulateFlight(TRUE_LAUNCH);
  const fps = opts.fps ?? VIDEO_META.fps;
  const rng = makeRng(opts.seed ?? 42);
  const noise = () => (rng() * 2 - 1) * opts.noisePx;
  const impactTimestampMs = 1000;

  const smoothedPath: TrackPoint[] = [];
  for (let i = 0; i < opts.numPoints; i++) {
    const t = i / fps;
    const sim = trajectoryAt(flight.trajectory, t);
    smoothedPath.push({
      timestampMs: impactTimestampMs + (i * 1000) / fps,
      x: FRAME.width / 2 + noise(),
      y:
        FRAME.height / 2 +
        (FOCAL_PX * (HC_M - sim.y)) / (D0_M + sim.x) +
        noise(),
      interpolated: false,
    });
  }
  return trackFromPath(smoothedPath);
}

/** Hand-built pixel rows for the decline matrix (rejection only, no fit). */
function makePixelTrack(rows: number[]): BallTrack {
  const impactTimestampMs = 1000;
  const smoothedPath: TrackPoint[] = rows.map((v, i) => ({
    timestampMs: impactTimestampMs + (i * 1000) / VIDEO_META.fps,
    x: FRAME.width / 2,
    y: v,
    interpolated: false,
  }));
  return trackFromPath(smoothedPath);
}

const CALIBRATION = {
  club: 'driver' as const,
  cameraAngle: 'behind' as const,
  horizontalFovDeg: 60,
};

// ---------------------------------------------------------------------------
// Evidence #4 recreation: planar fails, receding fit recovers the launch
// ---------------------------------------------------------------------------

describe('fitRecedingLaunch', () => {
  it(
    'recovers the evidence-#4 launch (12 points, 30 fps, 1.5px noise) ' +
      'where the planar fit cannot converge',
    () => {
      const model = buildCalibration(CALIBRATION, VIDEO_META);
      expect(model.focalLengthPx).toBeCloseTo(FOCAL_PX, 6);
      expect(model.cameraDistanceM).toBe(D0_M);

      const track = makeBehindTrack({ numPoints: 12, noisePx: 1.5 });
      // Evidence signature: a few hundred px of decelerating image rise.
      const rise =
        track.smoothedPath[0]!.y -
        track.smoothedPath[track.smoothedPath.length - 1]!.y;
      expect(rise).toBeGreaterThan(150);
      expect(rise).toBeLessThan(600);

      // The planar (face-on projection) fit interprets the rise as ~1 m of
      // fronto-parallel motion and must not converge.
      const planar = fitLaunchFromTrack(track, model, 'driver');
      expect(planar.converged).toBe(false);

      const rfit = fitRecedingLaunch(track, model, 'driver');
      expect(rfit.converged).toBe(true);
      expect(rfit.declineReason).toBeUndefined();
      expect(rfit.usedPoints).toBe(12);
      expect(rfit.pixelRms).toBeLessThanOrEqual(rfit.rmsThreshold);
      expect(
        Math.abs(rfit.launch.ballSpeedMph - TRUE_LAUNCH.ballSpeedMph) /
          TRUE_LAUNCH.ballSpeedMph,
      ).toBeLessThan(0.15);

      const trueCarry = simulateFlight(TRUE_LAUNCH).carryYards;
      const fitCarry = simulateFlight(rfit.launch).carryYards;
      expect(Math.abs(fitCarry - trueCarry) / trueCarry).toBeLessThan(0.15);
    },
    30000,
  );

  it(
    'tightens to 10% speed / 12% carry on a richer 20-point track',
    () => {
      const model = buildCalibration(CALIBRATION, VIDEO_META);
      const track = makeBehindTrack({ numPoints: 20, noisePx: 1.5 });

      const rfit = fitRecedingLaunch(track, model, 'driver');
      expect(rfit.converged).toBe(true);
      expect(
        Math.abs(rfit.launch.ballSpeedMph - TRUE_LAUNCH.ballSpeedMph) /
          TRUE_LAUNCH.ballSpeedMph,
      ).toBeLessThan(0.1);

      const trueCarry = simulateFlight(TRUE_LAUNCH).carryYards;
      const fitCarry = simulateFlight(rfit.launch).carryYards;
      expect(Math.abs(fitCarry - trueCarry) / trueCarry).toBeLessThan(0.12);
    },
    30000,
  );

  it(
    'recovers the camera height within 0.5 m on the noiseless case',
    () => {
      // No cameraHeightM hint — hc must come out of the fit itself.
      const model = buildCalibration(CALIBRATION, VIDEO_META);
      expect(model.cameraHeightM).toBeUndefined();
      const track = makeBehindTrack({ numPoints: 12, noisePx: 0 });

      const rfit = fitRecedingLaunch(track, model, 'driver');
      expect(rfit.converged).toBe(true);
      expect(Math.abs(rfit.cameraHeightM - HC_M)).toBeLessThan(0.5);
    },
    30000,
  );

  // -------------------------------------------------------------------------
  // Decline matrix
  // -------------------------------------------------------------------------

  it("declines face-on views with 'camera-angle'", () => {
    const model = buildCalibration(
      { ...CALIBRATION, cameraAngle: 'face-on' },
      VIDEO_META,
    );
    const track = makeBehindTrack({ numPoints: 12, noisePx: 0 });
    const rfit = fitRecedingLaunch(track, model, 'driver');
    expect(rfit.converged).toBe(false);
    expect(rfit.declineReason).toBe('camera-angle');
    // Falls back to the club prior means.
    expect(rfit.launch.ballSpeedMph).toBe(150);
  });

  it("declines short tracks with 'too-few-points'", () => {
    expect(RECEDING_MIN_POINTS).toBe(8);
    const model = buildCalibration(CALIBRATION, VIDEO_META);
    const track = makeBehindTrack({ numPoints: 7, noisePx: 0 });
    const rfit = fitRecedingLaunch(track, model, 'driver');
    expect(rfit.converged).toBe(false);
    expect(rfit.declineReason).toBe('too-few-points');
    expect(rfit.usedPoints).toBe(7);
  });

  it("declines failed-quality tracks with 'too-few-points'", () => {
    const model = buildCalibration(CALIBRATION, VIDEO_META);
    const track: BallTrack = {
      ...makeBehindTrack({ numPoints: 12, noisePx: 0 }),
      quality: 'failed' as TrackQuality,
    };
    const rfit = fitRecedingLaunch(track, model, 'driver');
    expect(rfit.converged).toBe(false);
    expect(rfit.declineReason).toBe('too-few-points');
  });

  it("declines constant-rate (non-decelerating) rises with 'not-receding'", () => {
    const model = buildCalibration(CALIBRATION, VIDEO_META);
    // Steady 30 px/frame upward: planar-like motion, no depth signature.
    const rows: number[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push(1100 - 30 * i);
    }
    const rfit = fitRecedingLaunch(makePixelTrack(rows), model, 'driver');
    expect(rfit.converged).toBe(false);
    expect(rfit.declineReason).toBe('not-receding');
  });

  it("declines oscillating vertical motion with 'not-receding'", () => {
    const model = buildCalibration(CALIBRATION, VIDEO_META);
    // Rows bounce up and down: more than one non-upward step.
    const rows: number[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push(900 + (i % 2 === 0 ? -25 : 25));
    }
    const rfit = fitRecedingLaunch(makePixelTrack(rows), model, 'driver');
    expect(rfit.converged).toBe(false);
    expect(rfit.declineReason).toBe('not-receding');
  });
});
