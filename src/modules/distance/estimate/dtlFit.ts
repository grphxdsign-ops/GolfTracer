/**
 * DTL (down-the-line / behind) 3D launch fitter — the measurement rung that
 * replaces the deprecated receding fit for these camera angles.
 *
 * A full 3D projectile → pinhole reprojection fit over p = (ball speed v,
 * launch angle α, azimuth ψ, camera pitch θ[, HFOV]) against BOTH pixel
 * axes of the post-impact track, anchored in absolute scale by the
 * ball-diameter tee anchor and in absolute time by the fused impact
 * timestamp. The camera height is NOT fitted — it is derived from the tee
 * ray and the pitch (soft prior N(1.55 m, 0.30 m) self-consistently pins
 * the pitch), and gravity's 9.81 m/s² clock inside simulateFlight breaks
 * the fast-far/slow-near ambiguity through image curvature.
 *
 * Multi-start Nelder–Mead (12 starts spanning speed, azimuth, and spin at
 * the club prior's ±σ) provides both the optimizer and the degeneracy
 * detector: the carry spread of the near-optimal ensemble. Declines are
 * honest (`converged: false` + reason) and never throw — the ladder falls
 * through to the club prior.
 */
import type { BallTrack, ClubType, TrackQuality } from '../../../types';

import { CLUB_PRIORS, logPrior } from '../physics/clubPriors';
import { degToRad, radToDeg } from '../physics/constants';
import {
  simulateFlight,
  type FlightResult,
  type LaunchConditions,
  type TrajectoryPoint,
} from '../physics/simulator';
import type { CameraModel } from '../calibration/calibrate';
import { nelderMead } from './neldermead';
import {
  cameraFromTeeRay,
  projectWorldPoint,
  solvePitchForHeight,
  teePointFromTrack,
  type CameraPose,
  type PixelPoint,
} from './projection';

/** Minimum post-impact samples for a meaningful DTL fit. */
export const DTL_MIN_POINTS = 8;
/** Hard cap on the confidence any DTL fit may report downstream. */
export const DTL_MAX_CONFIDENCE = 0.75;

export type DtlDeclineReason =
  | 'camera-angle'
  | 'no-anchor'
  | 'too-few-points'
  | 'poor-fit'
  | 'degenerate'
  | 'implausible';

export interface DtlFitOptions {
  /** User's ball tap at address, native px (tee pixel). */
  teePointPx?: { x: number; y: number };
}

export interface DtlFitResult {
  launch: LaunchConditions;
  /** Launch azimuth ψ, deg; positive = toward world-left (image-left). */
  azimuthDeg: number;
  /** Fitted camera pitch θ, deg; positive = optical axis tilted up. */
  cameraPitchDeg: number;
  /** Camera height derived from the tee ray + pitch, m. */
  cameraHeightM: number;
  /** Horizontal FOV in effect (fitted when focalSource = 'default'), deg. */
  hfovDeg: number;
  /** Focal length in effect, px. */
  focalPx: number;
  /** Tee pixel used for the scale/tee-ray anchor, native px. */
  teePointPx: { x: number; y: number };
  teeSource: 'tap' | 'extrapolated';
  /** Plain (unweighted) 2D pixel RMS of the best fit, px. */
  pixelRms: number;
  /** Pixel RMS threshold used for the convergence decision, px. */
  rmsThreshold: number;
  /** Number of post-impact track points used. */
  usedPoints: number;
  /** Full-flight carry of the best fit, yd. */
  carryYards: number;
  /** Max − min carry over the near-optimal ensemble, yd. */
  carrySpreadYards: number;
  /** Number of starts within the ensemble objective window. */
  ensembleSize: number;
  /** Number of multi-start optimizations run. */
  startsRun: number;
  converged: boolean;
  declineReason?: DtlDeclineReason;
}

/** Post-impact track points used, capped. */
const MAX_FIT_POINTS = 40;
/** Prior regularization strength, px of objective per unit of −logPrior. */
const PRIOR_LAMBDA = 0.5; // tuned within [0.3, 0.8]
/** Soft camera-height prior (handheld phone), m. */
const HEIGHT_PRIOR_MEAN_M = 1.55;
const HEIGHT_PRIOR_SD_M = 0.3;
/** Weight of the squared camera-height z-score in the objective. */
const HEIGHT_LAMBDA = 0.75;
/** Soft HFOV prior when the FOV is fitted (iPhone portrait main lens), deg. */
const HFOV_PRIOR_MEAN_DEG = 44;
const HFOV_PRIOR_SD_DEG = 4;
/** Weight of the squared HFOV z-score in the objective (fitted FOV only). */
const HFOV_LAMBDA = 0.5;
/** Huber transition point for pixel residuals, px. */
const HUBER_DELTA_PX = 4;
/** Objective window (in J units) admitting a start into the ensemble. */
const ENSEMBLE_J_WINDOW = 1.0;

/** Hard parameter bounds. */
const SPEED_BOUNDS: [number, number] = [40, 220]; // mph
const ANGLE_BOUNDS: [number, number] = [2, 45]; // deg
const AZIMUTH_BOUNDS: [number, number] = [-30, 30]; // deg
const PITCH_BOUNDS: [number, number] = [-20, 25]; // deg
const HFOV_BOUNDS: [number, number] = [35, 55]; // deg

/** Hard gate on the derived camera height, m. */
const HEIGHT_GATE_M: [number, number] = [0.6, 2.6];
/** Ensemble camera-height range beyond which geometry is degenerate, m. */
const ENSEMBLE_HEIGHT_RANGE_M = 1.2;
/** Carry spread / carry ratio beyond which the fit is degenerate. */
const SPREAD_RATIO_MAX = 0.3;
/** Ball-speed deviation from the club prior mean deemed implausible, σ. */
const IMPLAUSIBLE_SPEED_SIGMA = 4;
/** Minimum confidence a surfaced DTL fit must beat (the prior caps at 0.3). */
const MIN_CONFIDENCE = 0.32;
/** Extra simulated flight beyond the last sample during fitting, s. */
const SIM_OVERHANG_S = 0.15;
/** Minimum depth of a projected sample along the optical axis, m. */
const MIN_DEPTH_M = 0.5;
/** Large objective value for geometrically invalid candidates. */
const INVALID_J = 1e6;
/** Tolerance for detecting a parameter pinned at a hard bound. */
const BOUND_EPS = 0.01;
/** Net horizontal image-motion deadband for the azimuth seed, px. */
const AZIMUTH_SEED_DEADBAND_PX = 5;

/** Mirrors estimateDistance's QUALITY_FACTOR (pinned confidence formula). */
const QUALITY_FACTOR: Record<TrackQuality, number> = {
  high: 1,
  medium: 0.85,
  low: 0.6,
  failed: 0.3,
};

function clamp(v: number, [lo, hi]: [number, number]): number {
  return Math.min(Math.max(v, lo), hi);
}

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

/** Huber loss of one residual r (px): r²/2 inside δ, linear outside. */
function huber(r: number): number {
  const a = Math.abs(r);
  return a <= HUBER_DELTA_PX
    ? 0.5 * r * r
    : HUBER_DELTA_PX * (a - 0.5 * HUBER_DELTA_PX);
}

/** Linear interpolation of a simulated trajectory at flight time t (s). */
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

/** One post-impact sample: flight time (s) + image position (px). */
interface DtlSample {
  t: number;
  u: number;
  v: number;
}

/**
 * Post-impact samples with flight times anchored at the fused impact
 * timestamp: t_i = ((timestampMs_i − impactTimestampMs)/1000)·timeScale.
 * The first observation is NOT treated as launch — the gap between impact
 * and first detection is modeled flight.
 */
function collectSamples(track: BallTrack, timeScale: number): DtlSample[] {
  const scale = timeScale > 0 && Number.isFinite(timeScale) ? timeScale : 1;
  return track.smoothedPath
    .filter((p) => p.timestampMs >= track.impactTimestampMs)
    .slice(0, MAX_FIT_POINTS)
    .map((p) => ({
      t: ((p.timestampMs - track.impactTimestampMs) / 1000) * scale, // s
      u: p.x, // px
      v: p.y, // px
    }));
}

/** Fitted parameter vector (clamped into bounds). */
interface FitParams {
  vMph: number;
  alphaDeg: number;
  psiDeg: number;
  thetaDeg: number;
  hfovDeg: number;
  focalPx: number;
}

interface StartResult extends FitParams {
  spinRpm: number;
  j: number;
}

/**
 * Fit launch conditions + camera geometry to a DTL/behind ball track.
 * Never throws on poor data — returns `converged: false` with a decline
 * reason instead.
 */
export function fitDtlLaunch(
  track: BallTrack,
  model: CameraModel,
  club: ClubType,
  opts?: DtlFitOptions,
): DtlFitResult {
  const prior = CLUB_PRIORS[club];
  const fallbackLaunch: LaunchConditions = {
    ballSpeedMph: prior.ballSpeedMph.mean,
    launchAngleDeg: prior.launchAngleDeg.mean,
    backspinRpm: prior.spinRpm.mean,
  };
  // Existing formula: rmsThreshold = clamp(0.005·hypot(frameW, frameH), 3, 12) px.
  const rmsThreshold = Math.min(
    Math.max(0.005 * Math.hypot(track.frameWidth, track.frameHeight), 3),
    12,
  );
  const cx = model.imageWidth / 2; // px
  const cy = model.imageHeight / 2; // px
  // HFOV is a fitted parameter only when no calibration pinned the focal.
  const fitFov = model.focalSource === 'default';
  const focalOf = (hfovDeg: number): number =>
    model.imageWidth / 2 / Math.tan(degToRad(hfovDeg) / 2); // px
  const hfovOf = (focalPx: number): number =>
    radToDeg(2 * Math.atan(model.imageWidth / (2 * focalPx))); // deg

  const samples = collectSamples(track, model.timeScale);

  const fallbackTee: PixelPoint = opts?.teePointPx ??
    (track.smoothedPath.length > 0
      ? { x: track.smoothedPath[0]!.x, y: track.smoothedPath[0]!.y }
      : { x: cx, y: cy });
  const fallbackTeeSource: 'tap' | 'extrapolated' = opts?.teePointPx
    ? 'tap'
    : 'extrapolated';

  const decline = (
    reason: DtlDeclineReason,
    extra?: Partial<DtlFitResult>,
  ): DtlFitResult => ({
    launch: fallbackLaunch,
    azimuthDeg: 0,
    cameraPitchDeg: 0,
    cameraHeightM: HEIGHT_PRIOR_MEAN_M,
    hfovDeg: hfovOf(model.focalLengthPx),
    focalPx: model.focalLengthPx,
    teePointPx: fallbackTee,
    teeSource: fallbackTeeSource,
    pixelRms: Number.POSITIVE_INFINITY,
    rmsThreshold,
    usedPoints: samples.length,
    carryYards: 0,
    carrySpreadYards: 0,
    ensembleSize: 0,
    startsRun: 0,
    converged: false,
    declineReason: reason,
    ...extra,
  });

  // --- Decline gates that need no optimization -----------------------------
  if (model.cameraAngle !== 'down-the-line' && model.cameraAngle !== 'behind') {
    return decline('camera-angle');
  }
  // Metric anchor: m/px at tee depth = 0.04267/(2·ballRadiusAtAddressPx),
  // focal-independent. Without it there is no absolute scale.
  const teeMetersPerPixel = model.ballAnchorMetersPerPixel;
  if (teeMetersPerPixel === undefined || !(teeMetersPerPixel > 0)) {
    return decline('no-anchor');
  }
  if (samples.length < DTL_MIN_POINTS || track.quality === 'failed') {
    return decline('too-few-points');
  }

  // --- Tee pixel ------------------------------------------------------------
  let teePointPx: PixelPoint;
  let teeSource: 'tap' | 'extrapolated';
  if (opts?.teePointPx) {
    teePointPx = opts.teePointPx;
    teeSource = 'tap';
  } else {
    teePointPx = teePointFromTrack(samples);
    teeSource = 'extrapolated';
  }

  // --- Objective ------------------------------------------------------------
  const lastSample = samples[samples.length - 1]!;
  const simCapS = lastSample.t + SIM_OVERHANG_S; // s

  // Partial-flight cache keyed by (v rounded 0.25 mph, α rounded 0.1°, spin).
  const flightCache = new Map<string, FlightResult>();
  const flightFor = (vMph: number, alphaDeg: number, spinRpm: number): FlightResult => {
    const vq = Math.round(vMph * 4) / 4; // mph, 0.25 grid
    const aq = Math.round(alphaDeg * 10) / 10; // deg, 0.1 grid
    const key = `${vq}:${aq}:${spinRpm}`;
    let flight = flightCache.get(key);
    if (!flight) {
      flight = simulateFlight(
        { ballSpeedMph: vq, launchAngleDeg: aq, backspinRpm: spinRpm },
        { maxFlightTimeS: simCapS },
      );
      flightCache.set(key, flight);
    }
    return flight;
  };

  // Camera-to-tee distance co-varies with the focal (correct pinhole
  // behavior): D_tee = f·(m/px at tee depth), m.
  const geometryFor = (thetaDeg: number, focalPx: number) =>
    cameraFromTeeRay(teePointPx, thetaDeg, focalPx, cx, cy, focalPx * teeMetersPerPixel);

  interface ResidualStats {
    /** Huber-robust RMS over both pixel axes, px (= plain RMS when small). */
    huberRms: number;
    /** Plain unweighted 2D point-distance RMS, px. */
    pixelRms: number;
    /** True when any sample projected at/behind the camera. */
    invalid: boolean;
  }

  const residualStats = (p: FitParams, spinRpm: number): ResidualStats => {
    const { cameraCenter } = geometryFor(p.thetaDeg, p.focalPx);
    const pose: CameraPose = {
      cameraCenter,
      pitchDeg: p.thetaDeg,
      focalPx: p.focalPx,
      cx,
      cy,
    };
    const flight = flightFor(p.vMph, p.alphaDeg, spinRpm);
    const psi = degToRad(p.psiDeg);
    const cosPsi = Math.cos(psi);
    const sinPsi = Math.sin(psi);
    let huberSum = 0; // px²-equivalent
    let sqSum = 0; // px²
    for (const s of samples) {
      const sim = trajectoryAt(flight.trajectory, s.t); // m (planar)
      // World ball position: (x·cosψ, x·sinψ, y), tee height ≈ 0.
      const proj = projectWorldPoint(
        { x: sim.x * cosPsi, y: sim.x * sinPsi, z: sim.y },
        pose,
      );
      if (proj.zc < MIN_DEPTH_M) {
        return { huberRms: Number.POSITIVE_INFINITY, pixelRms: Number.POSITIVE_INFINITY, invalid: true };
      }
      const du = proj.u - s.u; // px
      const dv = proj.v - s.v; // px
      huberSum += huber(du) + huber(dv);
      sqSum += du * du + dv * dv;
    }
    return {
      // Normalized so that in the small-residual regime the Huber RMS
      // equals the plain point-distance RMS.
      huberRms: Math.sqrt((2 * huberSum) / samples.length),
      pixelRms: Math.sqrt(sqSum / samples.length),
      invalid: false,
    };
  };

  const paramsFromRaw = (raw: number[]): FitParams => {
    const hfovDeg = fitFov ? clamp(raw[4]!, HFOV_BOUNDS) : hfovOf(model.focalLengthPx);
    return {
      vMph: clamp(raw[0]!, SPEED_BOUNDS),
      alphaDeg: clamp(raw[1]!, ANGLE_BOUNDS),
      psiDeg: clamp(raw[2]!, AZIMUTH_BOUNDS),
      thetaDeg: clamp(raw[3]!, PITCH_BOUNDS),
      hfovDeg,
      focalPx: fitFov ? focalOf(hfovDeg) : model.focalLengthPx,
    };
  };

  const objectiveFor =
    (spinRpm: number) =>
    (raw: number[]): number => {
      const p = paramsFromRaw(raw);
      // Quadratic penalty for straying outside the hard bounds.
      let oob =
        Math.abs(raw[0]! - p.vMph) +
        Math.abs(raw[1]! - p.alphaDeg) +
        Math.abs(raw[2]! - p.psiDeg) +
        Math.abs(raw[3]! - p.thetaDeg);
      if (fitFov) {
        oob += Math.abs(raw[4]! - p.hfovDeg);
      }
      const stats = residualStats(p, spinRpm);
      if (stats.invalid) {
        return INVALID_J + oob * oob;
      }
      const launch: LaunchConditions = {
        ballSpeedMph: p.vMph,
        launchAngleDeg: p.alphaDeg,
        backspinRpm: spinRpm,
      };
      const heightZ =
        (geometryFor(p.thetaDeg, p.focalPx).cameraHeightM - HEIGHT_PRIOR_MEAN_M) /
        HEIGHT_PRIOR_SD_M;
      let j =
        stats.huberRms +
        PRIOR_LAMBDA * -logPrior(club, launch) +
        HEIGHT_LAMBDA * heightZ * heightZ +
        oob * oob;
      if (fitFov) {
        const fovZ = (p.hfovDeg - HFOV_PRIOR_MEAN_DEG) / HFOV_PRIOR_SD_DEG;
        j += HFOV_LAMBDA * fovZ * fovZ;
      }
      return j;
    };

  // --- Multi-start Nelder–Mead ----------------------------------------------
  // Azimuth seed from the sign of the net horizontal image motion:
  // image-left (u decreasing) means world-left, i.e. ψ > 0.
  const netDu = lastSample.u - samples[0]!.u; // px
  const psiSeed =
    netDu < -AZIMUTH_SEED_DEADBAND_PX ? 8 : netDu > AZIMUTH_SEED_DEADBAND_PX ? -8 : 0;
  // Pitch seed: the θ putting the derived camera height at the prior mean.
  const seedFocalPx = fitFov ? focalOf(HFOV_PRIOR_MEAN_DEG) : model.focalLengthPx;
  const thetaSeed =
    solvePitchForHeight(
      teePointPx,
      seedFocalPx,
      cx,
      cy,
      seedFocalPx * teeMetersPerPixel,
      HEIGHT_PRIOR_MEAN_M,
      PITCH_BOUNDS,
    ) ?? 0;

  const speedSeeds = [-1.5, 0, 1.5].map(
    (k) => prior.ballSpeedMph.mean + k * prior.ballSpeedMph.sd,
  );
  const psiSeeds = [psiSeed - 6, psiSeed + 6];
  const spinSeeds = [
    prior.spinRpm.mean - prior.spinRpm.sd,
    prior.spinRpm.mean + prior.spinRpm.sd,
  ];

  const nmStep = fitFov ? [4, 1.5, 2, 2, 2] : [4, 1.5, 2, 2];
  const results: StartResult[] = [];
  for (const v0 of speedSeeds) {
    for (const psi0 of psiSeeds) {
      for (const spin of spinSeeds) {
        const x0 = [
          clamp(v0, SPEED_BOUNDS),
          clamp(prior.launchAngleDeg.mean, ANGLE_BOUNDS),
          clamp(psi0, AZIMUTH_BOUNDS),
          clamp(thetaSeed, PITCH_BOUNDS),
        ];
        if (fitFov) {
          x0.push(HFOV_PRIOR_MEAN_DEG);
        }
        const objective = objectiveFor(spin);
        const nm = nelderMead(objective, x0, {
          step: nmStep,
          maxIterations: 250,
          fTolerance: 1e-3,
          xTolerance: 1e-3,
        });
        results.push({ ...paramsFromRaw(nm.x), spinRpm: spin, j: nm.fx });
      }
    }
  }

  const startsRun = results.length;
  results.sort((a, b) => a.j - b.j);
  const best = results[0]!;
  const bestStats = residualStats(best, best.spinRpm);
  if (!Number.isFinite(best.j) || bestStats.invalid || best.j >= INVALID_J) {
    return decline('poor-fit', { startsRun });
  }
  const ensemble = results.filter((r) => r.j <= best.j + ENSEMBLE_J_WINDOW);

  // Full (untruncated) flight for every ensemble member — the carry spread
  // is the degeneracy detector; the best member's carry is the estimate.
  const fullCarryCache = new Map<string, number>();
  const fullCarryOf = (r: StartResult): number => {
    const key = `${r.vMph}:${r.alphaDeg}:${r.spinRpm}`;
    let carry = fullCarryCache.get(key);
    if (carry === undefined) {
      carry = simulateFlight({
        ballSpeedMph: r.vMph,
        launchAngleDeg: r.alphaDeg,
        backspinRpm: r.spinRpm,
      }).carryYards;
      fullCarryCache.set(key, carry);
    }
    return carry;
  };
  const carries = ensemble.map(fullCarryOf); // yd
  const carryYards = fullCarryOf(best); // yd
  const carrySpreadYards = Math.max(...carries) - Math.min(...carries); // yd
  const heights = ensemble.map(
    (r) => geometryFor(r.thetaDeg, r.focalPx).cameraHeightM,
  ); // m
  const bestHeightM = geometryFor(best.thetaDeg, best.focalPx).cameraHeightM;

  const base: DtlFitResult = {
    launch: {
      ballSpeedMph: best.vMph,
      launchAngleDeg: best.alphaDeg,
      backspinRpm: best.spinRpm,
    },
    azimuthDeg: best.psiDeg,
    cameraPitchDeg: best.thetaDeg,
    cameraHeightM: bestHeightM,
    hfovDeg: best.hfovDeg,
    focalPx: best.focalPx,
    teePointPx,
    teeSource,
    pixelRms: bestStats.pixelRms,
    rmsThreshold,
    usedPoints: samples.length,
    carryYards,
    carrySpreadYards,
    ensembleSize: ensemble.length,
    startsRun,
    converged: false,
  };

  // --- Decline gates on the optimized fit ------------------------------------
  if (bestStats.pixelRms > rmsThreshold) {
    return { ...base, declineReason: 'poor-fit' };
  }
  const spreadRatio =
    carryYards > 1e-9 ? carrySpreadYards / carryYards : Number.POSITIVE_INFINITY;
  const pinnedAtBound =
    best.vMph <= SPEED_BOUNDS[0] + BOUND_EPS ||
    best.vMph >= SPEED_BOUNDS[1] - BOUND_EPS ||
    best.alphaDeg <= ANGLE_BOUNDS[0] + BOUND_EPS ||
    best.alphaDeg >= ANGLE_BOUNDS[1] - BOUND_EPS ||
    best.psiDeg <= AZIMUTH_BOUNDS[0] + BOUND_EPS ||
    best.psiDeg >= AZIMUTH_BOUNDS[1] - BOUND_EPS;
  const heightRangeM = Math.max(...heights) - Math.min(...heights);
  if (
    spreadRatio > SPREAD_RATIO_MAX ||
    bestHeightM < HEIGHT_GATE_M[0] ||
    bestHeightM > HEIGHT_GATE_M[1] ||
    heightRangeM > ENSEMBLE_HEIGHT_RANGE_M ||
    pinnedAtBound
  ) {
    return { ...base, declineReason: 'degenerate' };
  }
  if (
    Math.abs(best.vMph - prior.ballSpeedMph.mean) >
    IMPLAUSIBLE_SPEED_SIGMA * prior.ballSpeedMph.sd
  ) {
    return { ...base, declineReason: 'implausible' };
  }

  // Pinned confidence formula (mapped downstream in estimateDistance.ts):
  // a fit that cannot beat the club prior's 0.3 cap must decline.
  const scoreRms = clamp01(1 - bestStats.pixelRms / rmsThreshold);
  const scoreSpread = clamp01(1 - spreadRatio / SPREAD_RATIO_MAX);
  const scoreGeom = teeSource === 'tap' ? (fitFov ? 0.85 : 1.0) : 0.7;
  const confidence =
    0.3 +
    0.45 *
      clamp01(0.45 * scoreRms + 0.35 * scoreSpread + 0.2 * scoreGeom) *
      QUALITY_FACTOR[track.quality];
  if (confidence < MIN_CONFIDENCE) {
    return { ...base, declineReason: 'degenerate' };
  }

  return { ...base, converged: true };
}
