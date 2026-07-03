/**
 * Fit launch conditions (ball speed, launch angle, backspin) to the early
 * portion of a pixel-space ball track by matching a reprojected physics
 * trajectory against the observed pixels.
 *
 * Pipeline: convert px -> m via the calibration scale ladder, coarse grid
 * search around the club prior (speed +-30%, angle +-8 deg, spin fixed at
 * the prior mean), then Nelder–Mead refinement over all three parameters.
 * The objective is pixel RMS plus a Bayesian regularizer (negative log
 * prior), so sparse/noisy tracks degrade gracefully towards the club prior
 * instead of exploding.
 */
import type { BallTrack, ClubType, TrackPoint } from '../../../types';

import { logPrior, CLUB_PRIORS } from '../physics/clubPriors';
import {
  simulateFlight,
  type LaunchConditions,
  type TrajectoryPoint,
} from '../physics/simulator';
import { metersPerPixelAt, type CameraModel } from '../calibration/calibrate';
import { nelderMead } from './neldermead';

export interface LaunchFitResult {
  launch: LaunchConditions;
  /** Weighted pixel RMS of the best fit. */
  pixelRms: number;
  /** Pixel RMS threshold used for the convergence decision. */
  rmsThreshold: number;
  converged: boolean;
  /** Number of track points used in the fit. */
  usedPoints: number;
  /** Scale used for px -> m conversion. */
  metersPerPixel: number;
}

/** Track points used from the start of flight. */
const MAX_FIT_POINTS = 40;
/** Minimum points for a meaningful fit. */
const MIN_FIT_POINTS = 6;
/** Weight applied to horizontal residuals per camera angle. */
const X_WEIGHT: Record<CameraModel['cameraAngle'], number> = {
  'face-on': 1,
  'down-the-line': 0.3,
  behind: 0.3,
};
/** Regularization strength: px of RMS penalty per unit of -logPrior. */
const PRIOR_LAMBDA = 0.35;

const SPEED_BOUNDS: [number, number] = [20, 230];
const ANGLE_BOUNDS: [number, number] = [0.5, 55];
const SPIN_BOUNDS: [number, number] = [500, 13000];

function clamp(v: number, [lo, hi]: [number, number]): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Linear interpolation of a simulated trajectory at time t (s). */
function trajectoryAt(traj: TrajectoryPoint[], t: number): { x: number; y: number } {
  const first = traj[0]!;
  if (t <= first.t) {
    return { x: first.x, y: first.y };
  }
  const last = traj[traj.length - 1]!;
  if (t >= last.t) {
    // Extrapolate along the final segment (short overhangs only).
    const prev = traj[traj.length - 2] ?? first;
    const dt = last.t - prev.t || 1e-9;
    const f = (t - last.t) / dt;
    return {
      x: last.x + f * (last.x - prev.x),
      y: last.y + f * (last.y - prev.y),
    };
  }
  // Binary search for the bracketing segment.
  let lo = 0;
  let hi = traj.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (traj[mid]!.t <= t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const a = traj[lo]!;
  const b = traj[hi]!;
  const f = (t - a.t) / (b.t - a.t || 1e-9);
  return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
}

interface FitSample {
  /** Real-world time since the first used track point, s. */
  t: number;
  x: number;
  y: number;
}

/**
 * Track timestamps are media time; the physics simulator runs in real time.
 * `timeScale` (CameraModel.timeScale = fps / recordedFps) converts media
 * seconds to real seconds so slow-motion clips fit against the true time
 * base instead of one dilated by the frame-rate ratio.
 */
function collectSamples(track: BallTrack, timeScale: number): FitSample[] {
  const pts: TrackPoint[] = track.smoothedPath.filter(
    (p) => p.timestampMs >= track.impactTimestampMs,
  );
  const used = pts.slice(0, MAX_FIT_POINTS);
  if (used.length === 0) {
    return [];
  }
  const scale = timeScale > 0 && Number.isFinite(timeScale) ? timeScale : 1;
  const t0 = used[0]!.timestampMs;
  return used.map((p) => ({
    t: ((p.timestampMs - t0) / 1000) * scale,
    x: p.x,
    y: p.y,
  }));
}

/**
 * Fit launch conditions to a ball track. Never throws on poor data —
 * returns `converged: false` with the club prior as the launch estimate.
 */
export function fitLaunchFromTrack(
  track: BallTrack,
  model: CameraModel,
  club: ClubType,
): LaunchFitResult {
  const prior = CLUB_PRIORS[club];
  const fallbackLaunch: LaunchConditions = {
    ballSpeedMph: prior.ballSpeedMph.mean,
    launchAngleDeg: prior.launchAngleDeg.mean,
    backspinRpm: prior.spinRpm.mean,
  };

  const samples = collectSamples(track, model.timeScale);
  const rmsThreshold = Math.min(
    Math.max(0.005 * Math.hypot(track.frameWidth, track.frameHeight), 3),
    12,
  );

  if (samples.length < MIN_FIT_POINTS || track.quality === 'failed') {
    return {
      launch: fallbackLaunch,
      pixelRms: Number.POSITIVE_INFINITY,
      rmsThreshold,
      converged: false,
      usedPoints: samples.length,
      metersPerPixel: metersPerPixelAt(model, samples[0]),
    };
  }

  const origin = samples[0]!;
  const mpp = metersPerPixelAt(model, { x: origin.x, y: origin.y });
  const xWeight = X_WEIGHT[model.cameraAngle];
  // Downrange direction on screen: sign of net horizontal motion.
  const netDx = samples[samples.length - 1]!.x - origin.x;
  const dir = netDx >= 0 ? 1 : -1;

  const pixelRmsOf = (launch: LaunchConditions): number => {
    const flight = simulateFlight(launch);
    let sum = 0;
    for (const s of samples) {
      const sim = trajectoryAt(flight.trajectory, s.t);
      const px = origin.x + (dir * sim.x) / mpp;
      const py = origin.y - sim.y / mpp;
      const dx = px - s.x;
      const dy = py - s.y;
      sum += xWeight * dx * dx + dy * dy;
    }
    // Normalized so xWeight = 1 reproduces the plain point-distance RMS.
    return Math.sqrt((sum * 2) / (samples.length * (1 + xWeight)));
  };

  const objective = (params: number[]): number => {
    const p0 = params[0]!;
    const p1 = params[1]!;
    const p2 = params[2]!;
    const launch: LaunchConditions = {
      ballSpeedMph: clamp(p0, SPEED_BOUNDS),
      launchAngleDeg: clamp(p1, ANGLE_BOUNDS),
      backspinRpm: clamp(p2, SPIN_BOUNDS),
    };
    // Quadratic penalty for straying outside the physical bounds.
    const outOfBounds =
      Math.abs(p0 - launch.ballSpeedMph) +
      Math.abs(p1 - launch.launchAngleDeg) +
      Math.abs(p2 - launch.backspinRpm) / 100;
    return (
      pixelRmsOf(launch) +
      PRIOR_LAMBDA * -logPrior(club, launch) +
      outOfBounds * outOfBounds
    );
  };

  // Coarse grid: speed +-30% of prior, angle +-8 deg, spin at prior mean.
  let best: number[] = [
    prior.ballSpeedMph.mean,
    prior.launchAngleDeg.mean,
    prior.spinRpm.mean,
  ];
  let bestF = objective(best);
  const speedSteps = 9;
  const angleSteps = 9;
  for (let i = 0; i < speedSteps; i++) {
    const speed =
      prior.ballSpeedMph.mean * (0.7 + (0.6 * i) / (speedSteps - 1));
    for (let j = 0; j < angleSteps; j++) {
      const angle =
        prior.launchAngleDeg.mean - 8 + (16 * j) / (angleSteps - 1);
      const candidate = [speed, angle, prior.spinRpm.mean];
      const f = objective(candidate);
      if (f < bestF) {
        bestF = f;
        best = candidate;
      }
    }
  }

  // Nelder–Mead refinement over (speed, angle, spin).
  const refined = nelderMead(objective, best, {
    step: [3, 1, 300],
    maxIterations: 300,
    fTolerance: 1e-4,
    xTolerance: 1e-3,
  });

  const launch: LaunchConditions = {
    ballSpeedMph: clamp(refined.x[0]!, SPEED_BOUNDS),
    launchAngleDeg: clamp(refined.x[1]!, ANGLE_BOUNDS),
    backspinRpm: clamp(refined.x[2]!, SPIN_BOUNDS),
  };
  const pixelRms = pixelRmsOf(launch);

  return {
    launch,
    pixelRms,
    rmsThreshold,
    converged: pixelRms <= rmsThreshold,
    usedPoints: samples.length,
    metersPerPixel: mpp,
  };
}
