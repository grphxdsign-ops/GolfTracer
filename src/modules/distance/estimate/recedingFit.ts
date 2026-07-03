/**
 * Receding-ball depth rung for behind / down-the-line camera views.
 *
 * The planar launch fit assumes image motion is fronto-parallel, so a ball
 * receding along the optical axis (a few metres of apparent rise for a
 * couple of hundred metres of carry) can never converge. This fit models
 * the true geometry instead: a pinhole camera on the target line, height
 * `hc` above the ground, `d0 = cameraDistanceM` behind the launch point.
 * A simulator trajectory (x downrange m, y up m) projects to image rows
 *
 *   v(t) = anchor + f * [ (hc - y(t))/(d0 + x(t)) - (hc - y(0))/(d0 + x(0)) ]
 *
 * anchored at the first sample's pixel row so only relative geometry
 * matters; horizontal residuals get weight 0 (lateral motion ~ 0 near the
 * optical axis). Depth is observable through the hyperbolic-like image
 * deceleration towards the vanishing point, so the fit demands that
 * signature up front and declines honestly (converged: false + reason)
 * whenever the view, the point count, or the motion pattern rules it out.
 *
 * Search mirrors launchFit: coarse grid around the club prior (speed +-30%,
 * angle +-8 deg, hc over [0.3, 3] m, seeded from CameraModel.cameraHeightM
 * when present), then Nelder–Mead over (speed, angle, hc) with spin fixed
 * at the prior mean and logPrior regularization. Confidence downstream is
 * capped at RECEDING_MAX_CONFIDENCE — depth-from-recession is honest but
 * never as sharp as a fronto-parallel measurement.
 */
import type { BallTrack, ClubType, TrackPoint } from '../../../types';

import { logPrior, CLUB_PRIORS } from '../physics/clubPriors';
import {
  simulateFlight,
  type FlightResult,
  type LaunchConditions,
  type TrajectoryPoint,
} from '../physics/simulator';
import type { CameraModel } from '../calibration/calibrate';
import { nelderMead } from './neldermead';

/** Minimum track points for a meaningful depth-from-recession fit. */
export const RECEDING_MIN_POINTS = 8;
/** Hard cap on the confidence any receding fit may report downstream. */
export const RECEDING_MAX_CONFIDENCE = 0.5;

export interface RecedingFitResult {
  launch: LaunchConditions;
  /** Fitted (or assumed, on decline) camera height above the ground, m. */
  cameraHeightM: number;
  /** Vertical-only pixel RMS of the best fit. */
  pixelRms: number;
  /** Pixel RMS threshold used for the convergence decision. */
  rmsThreshold: number;
  /** Number of track points used in the fit. */
  usedPoints: number;
  converged: boolean;
  declineReason?: 'camera-angle' | 'too-few-points' | 'not-receding' | 'poor-fit';
}

/** Track points used from the start of flight. */
const MAX_FIT_POINTS = 40;
/** Regularization strength: px of RMS penalty per unit of -logPrior. */
const PRIOR_LAMBDA = 0.35;
/**
 * Recession signature: mean |vertical step| of the first half must exceed
 * this multiple of the second half's (hyperbolic-like deceleration).
 */
const DECEL_RATIO = 1.15;
/** Camera height assumed when the user supplied none, m (chest-high phone). */
const DEFAULT_CAMERA_HEIGHT_M = 1.6;
/** Camera-height grid resolution when no user height is available. */
const HC_GRID_STEPS = 7;

const SPEED_BOUNDS: [number, number] = [20, 230];
const ANGLE_BOUNDS: [number, number] = [0.5, 55];
const HC_BOUNDS: [number, number] = [0.3, 3];

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
 * seconds to real seconds, exactly as in launchFit.
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
 * Recession signature check on the raw pixel rows: the ball must rise in
 * the image (dy < 0) on all but at most one step, and the rise must
 * decelerate hyperbolically — mean |step| of the first half strictly more
 * than DECEL_RATIO times the second half's. A constant-rate rise (planar
 * motion, a bird, a thrown tee) fails the ratio; oscillation fails dy.
 */
function isReceding(samples: FitSample[]): boolean {
  const steps: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    steps.push(samples[i]!.y - samples[i - 1]!.y);
  }
  let nonUpward = 0;
  for (const s of steps) {
    if (s >= 0) {
      nonUpward += 1;
    }
  }
  if (nonUpward > 1) {
    return false;
  }
  const half = Math.floor(steps.length / 2);
  const meanAbs = (arr: number[]): number =>
    arr.reduce((sum, v) => sum + Math.abs(v), 0) / (arr.length || 1);
  return meanAbs(steps.slice(0, half)) > DECEL_RATIO * meanAbs(steps.slice(half));
}

/**
 * Fit launch conditions plus camera height to a receding-ball track.
 * Never throws on poor data — returns `converged: false` with a decline
 * reason and the club prior as the launch estimate.
 */
export function fitRecedingLaunch(
  track: BallTrack,
  model: CameraModel,
  club: ClubType,
): RecedingFitResult {
  const prior = CLUB_PRIORS[club];
  const fallbackLaunch: LaunchConditions = {
    ballSpeedMph: prior.ballSpeedMph.mean,
    launchAngleDeg: prior.launchAngleDeg.mean,
    backspinRpm: prior.spinRpm.mean,
  };
  const rmsThreshold = Math.min(
    Math.max(0.005 * Math.hypot(track.frameWidth, track.frameHeight), 3),
    12,
  );
  const hcInit =
    model.cameraHeightM !== undefined && model.cameraHeightM > 0
      ? clamp(model.cameraHeightM, HC_BOUNDS)
      : DEFAULT_CAMERA_HEIGHT_M;

  const decline = (
    reason: NonNullable<RecedingFitResult['declineReason']>,
    usedPoints: number,
  ): RecedingFitResult => ({
    launch: fallbackLaunch,
    cameraHeightM: hcInit,
    pixelRms: Number.POSITIVE_INFINITY,
    rmsThreshold,
    usedPoints,
    converged: false,
    declineReason: reason,
  });

  // The recession signature only exists when the camera looks downrange.
  if (model.cameraAngle === 'face-on') {
    return decline('camera-angle', 0);
  }

  const samples = collectSamples(track, model.timeScale);
  if (samples.length < RECEDING_MIN_POINTS || track.quality === 'failed') {
    return decline('too-few-points', samples.length);
  }
  if (!isReceding(samples)) {
    return decline('not-receding', samples.length);
  }

  const f = model.focalLengthPx;
  const d0 = model.cameraDistanceM;
  const anchorV = samples[0]!.y;
  const anchorT = samples[0]!.t;

  // The flight only depends on (speed, angle) — spin is fixed at the prior
  // mean — so cache simulations across the hc dimension and NM re-visits.
  const flightCache = new Map<string, FlightResult>();
  const flightFor = (speedMph: number, angleDeg: number): FlightResult => {
    const key = `${speedMph.toFixed(3)}:${angleDeg.toFixed(3)}`;
    let flight = flightCache.get(key);
    if (!flight) {
      flight = simulateFlight({
        ballSpeedMph: speedMph,
        launchAngleDeg: angleDeg,
        backspinRpm: prior.spinRpm.mean,
      });
      flightCache.set(key, flight);
    }
    return flight;
  };

  // Vertical-only pixel RMS of the projected trajectory against the track;
  // horizontal residuals get weight 0 (lateral ~ 0 near the optical axis).
  const pixelRmsOf = (speedMph: number, angleDeg: number, hc: number): number => {
    const flight = flightFor(speedMph, angleDeg);
    const origin = trajectoryAt(flight.trajectory, anchorT);
    const originTerm = (hc - origin.y) / (d0 + origin.x);
    let sum = 0;
    for (const s of samples) {
      const sim = trajectoryAt(flight.trajectory, s.t);
      const pv = anchorV + f * ((hc - sim.y) / (d0 + sim.x) - originTerm);
      const dv = pv - s.y;
      sum += dv * dv;
    }
    return Math.sqrt(sum / samples.length);
  };

  const objective = (params: number[]): number => {
    const p0 = params[0]!;
    const p1 = params[1]!;
    const p2 = params[2]!;
    const speed = clamp(p0, SPEED_BOUNDS);
    const angle = clamp(p1, ANGLE_BOUNDS);
    const hc = clamp(p2, HC_BOUNDS);
    const launch: LaunchConditions = {
      ballSpeedMph: speed,
      launchAngleDeg: angle,
      backspinRpm: prior.spinRpm.mean,
    };
    // Quadratic penalty for straying outside the physical bounds; camera
    // height is scaled to make metres comparable to mph/deg.
    const outOfBounds =
      Math.abs(p0 - speed) + Math.abs(p1 - angle) + 10 * Math.abs(p2 - hc);
    return (
      pixelRmsOf(speed, angle, hc) +
      PRIOR_LAMBDA * -logPrior(club, launch) +
      outOfBounds * outOfBounds
    );
  };

  // Coarse grid: speed +-30% of prior, angle +-8 deg, hc over [0.3, 3] m
  // (the user-reported camera height, when present, joins the grid and
  // seeds the initial best).
  const hcValues: number[] = [];
  for (let k = 0; k < HC_GRID_STEPS; k++) {
    hcValues.push(
      HC_BOUNDS[0] + ((HC_BOUNDS[1] - HC_BOUNDS[0]) * k) / (HC_GRID_STEPS - 1),
    );
  }
  if (model.cameraHeightM !== undefined && model.cameraHeightM > 0) {
    hcValues.push(hcInit);
  }

  let best: number[] = [
    prior.ballSpeedMph.mean,
    prior.launchAngleDeg.mean,
    hcInit,
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
      for (const hc of hcValues) {
        const candidate = [speed, angle, hc];
        const fx = objective(candidate);
        if (fx < bestF) {
          bestF = fx;
          best = candidate;
        }
      }
    }
  }

  // Nelder–Mead refinement over (speed, angle, hc).
  const refined = nelderMead(objective, best, {
    step: [3, 1, 0.25],
    maxIterations: 300,
    fTolerance: 1e-4,
    xTolerance: 1e-3,
  });

  const launch: LaunchConditions = {
    ballSpeedMph: clamp(refined.x[0]!, SPEED_BOUNDS),
    launchAngleDeg: clamp(refined.x[1]!, ANGLE_BOUNDS),
    backspinRpm: prior.spinRpm.mean,
  };
  const cameraHeightM = clamp(refined.x[2]!, HC_BOUNDS);
  const pixelRms = pixelRmsOf(
    launch.ballSpeedMph,
    launch.launchAngleDeg,
    cameraHeightM,
  );

  if (pixelRms > rmsThreshold) {
    return {
      launch: fallbackLaunch,
      cameraHeightM,
      pixelRms,
      rmsThreshold,
      usedPoints: samples.length,
      converged: false,
      declineReason: 'poor-fit',
    };
  }

  return {
    launch,
    cameraHeightM,
    pixelRms,
    rmsThreshold,
    usedPoints: samples.length,
    converged: true,
  };
}
