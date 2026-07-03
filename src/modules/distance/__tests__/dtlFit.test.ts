/**
 * DTL 3D launch fitter tests.
 *
 * Synthetic tracks are generated ONLY by projecting the physics simulator's
 * own output through projection.ts (the pinned convention the fitter itself
 * uses) — never hand-drawn curves. The real-clip fixture is the canonical
 * measured evidence: the down-the-line driver clip whose old receding rung
 * fabricated a 2 yd carry at 0.50 confidence.
 */
import type { BallTrack, CalibrationInput, TrackPoint } from '../../../types';

import {
  fitDtlLaunch,
  DTL_MIN_POINTS,
  DTL_MAX_CONFIDENCE,
  DTL_SPEED_OBS_MIN_PX,
  type DtlFitResult,
} from '../estimate/dtlFit';
import {
  cameraFromTeeRay,
  projectWorldPoint,
  type CameraPose,
} from '../estimate/projection';
import { buildCalibration } from '../calibration/calibrate';
import { focalLengthPxFromFov } from '../calibration/pinhole';
import {
  simulateFlight,
  type LaunchConditions,
  type TrajectoryPoint,
} from '../physics/simulator';
import { BALL_DIAMETER_M, degToRad } from '../physics/constants';

/** 1080x1920 portrait frame (evidence clip after rotation). */
const FRAME = { width: 1080, height: 1920 };
const VIDEO_META = { ...FRAME, fps: 30 };

// ---------------------------------------------------------------------------
// Helpers
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

function trackFromPath(smoothedPath: TrackPoint[], impactMs: number): BallTrack {
  let apexPointIndex = 0;
  for (let i = 1; i < smoothedPath.length; i++) {
    if (smoothedPath[i]!.y < smoothedPath[apexPointIndex]!.y) {
      apexPointIndex = i;
    }
  }
  return {
    observations: [],
    smoothedPath,
    impactFrameIndex: 0,
    impactTimestampMs: impactMs,
    apexPointIndex,
    frameWidth: FRAME.width,
    frameHeight: FRAME.height,
    quality: 'high',
  };
}

interface SynthOpts {
  launch: LaunchConditions;
  /** Launch azimuth, deg; positive = world-left (image-left). */
  psiDeg: number;
  /** True camera pitch, deg. */
  thetaDeg: number;
  /** True horizontal FOV, deg. */
  hfovDeg: number;
  /** Tee pixel, native px. */
  tee: { x: number; y: number };
  /** Ball radius at address, px (the metric anchor). */
  ballRadiusPx: number;
  numPoints: number;
  /** Flight time of the first observation, s. */
  firstT: number;
  noisePx?: number;
  seed?: number;
}

/**
 * Synthetic DTL track: a simulateFlight trajectory rotated by ψ and
 * projected through projection.ts with the camera placed from the tee ray —
 * exactly the fitter's forward model.
 */
function synthTrack(o: SynthOpts): { track: BallTrack; trueCarry: number } {
  const focalPx = focalLengthPxFromFov(o.hfovDeg, FRAME.width);
  const dTeeM = (focalPx * BALL_DIAMETER_M) / (2 * o.ballRadiusPx);
  const { cameraCenter } = cameraFromTeeRay(
    o.tee,
    o.thetaDeg,
    focalPx,
    FRAME.width / 2,
    FRAME.height / 2,
    dTeeM,
  );
  const pose: CameraPose = {
    cameraCenter,
    pitchDeg: o.thetaDeg,
    focalPx,
    cx: FRAME.width / 2,
    cy: FRAME.height / 2,
  };
  const flight = simulateFlight(o.launch);
  const impactMs = 1000;
  const rng = makeRng(o.seed ?? 42);
  const noise = () => (o.noisePx ? (rng() * 2 - 1) * o.noisePx : 0);
  const cosPsi = Math.cos(degToRad(o.psiDeg));
  const sinPsi = Math.sin(degToRad(o.psiDeg));
  const path: TrackPoint[] = [];
  for (let i = 0; i < o.numPoints; i++) {
    const t = o.firstT + i / VIDEO_META.fps; // s
    const sim = trajectoryAt(flight.trajectory, t); // m, planar
    const proj = projectWorldPoint(
      { x: sim.x * cosPsi, y: sim.x * sinPsi, z: sim.y },
      pose,
    );
    path.push({
      timestampMs: impactMs + t * 1000,
      x: proj.u + noise(),
      y: proj.v + noise(),
      interpolated: false,
    });
  }
  return { track: trackFromPath(path, impactMs), trueCarry: flight.carryYards };
}

function calibration(extra?: Partial<CalibrationInput>): CalibrationInput {
  return {
    club: 'driver',
    cameraAngle: 'down-the-line',
    ballRadiusAtAddressPx: 7,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Canonical real-clip fixture (embedded verbatim per the shared contract)
// ---------------------------------------------------------------------------
const REAL_OBS: [number, number, number][] = [
  [597, 945, 367],
  [581, 850, 400],
  [569, 779, 433],
  [560, 723, 467],
  [548, 641, 533],
  [541, 614, 567],
  [536, 588, 600],
  [532, 566, 633],
  [529, 548, 667],
  [524, 518, 733],
  [522, 505, 767],
  [520, 495, 800],
];
const REAL_TEE = { x: 730, y: 1676 };
const REAL_IMPACT_MS = 267;

function realClipTrack(): BallTrack {
  return trackFromPath(
    REAL_OBS.map(([x, y, ms]) => ({
      timestampMs: ms,
      x,
      y,
      interpolated: false,
    })),
    REAL_IMPACT_MS,
  );
}

/** Real-clip calibration: default FOV (unknown), 7 px ball anchor. */
function realClipModel() {
  return buildCalibration(calibration(), VIDEO_META);
}

// ---------------------------------------------------------------------------
// Contract constants
// ---------------------------------------------------------------------------
describe('pinned contract', () => {
  it('exports the frozen constants', () => {
    expect(DTL_MIN_POINTS).toBe(8);
    expect(DTL_MAX_CONFIDENCE).toBe(0.75);
  });
});

// ---------------------------------------------------------------------------
// Simulator truncation (FlightEnvironment.maxFlightTimeS)
// ---------------------------------------------------------------------------
describe('simulateFlight maxFlightTimeS', () => {
  const launch: LaunchConditions = {
    ballSpeedMph: 150,
    launchAngleDeg: 12,
    backspinRpm: 2500,
  };

  it('omitted => identical to legacy full flight', () => {
    const a = simulateFlight(launch);
    const b = simulateFlight(launch, {});
    expect(b.carryYards).toBe(a.carryYards);
    expect(b.flightTimeS).toBe(a.flightTimeS);
    expect(b.trajectory.length).toBe(a.trajectory.length);
  });

  it('stops integration at the cap and covers it in the trajectory', () => {
    const full = simulateFlight(launch);
    const capS = 0.7;
    const truncated = simulateFlight(launch, { maxFlightTimeS: capS });
    const last = truncated.trajectory[truncated.trajectory.length - 1]!;
    expect(last.t).toBeGreaterThanOrEqual(capS - 1e-9);
    expect(last.t).toBeLessThan(capS + 0.01);
    expect(truncated.flightTimeS).toBeLessThan(full.flightTimeS);
    // The truncated trajectory matches the full flight over the shared span.
    const fullAtCap = trajectoryAt(full.trajectory, last.t);
    expect(last.x).toBeCloseTo(fullAtCap.x, 3);
    expect(last.y).toBeCloseTo(fullAtCap.y, 3);
  });

  it('a cap beyond landing changes nothing', () => {
    const a = simulateFlight(launch);
    const b = simulateFlight(launch, { maxFlightTimeS: 19 });
    expect(b.carryYards).toBe(a.carryYards);
    expect(b.trajectory.length).toBe(a.trajectory.length);
  });
});

// ---------------------------------------------------------------------------
// Synthetic recovery
// ---------------------------------------------------------------------------
const TRUE_LAUNCH: LaunchConditions = {
  ballSpeedMph: 150,
  launchAngleDeg: 12,
  backspinRpm: 2500,
};
const TRUE_PSI_DEG = 5;
const TRUE_THETA_DEG = 5;
const SYNTH_TEE = { x: 700, y: 1650 };

describe('fitDtlLaunch on synthetic DTL tracks', () => {
  jest.setTimeout(60000);

  it('recovers (v, α, ψ) and carry from a noiseless track', () => {
    const { track, trueCarry } = synthTrack({
      launch: TRUE_LAUNCH,
      psiDeg: TRUE_PSI_DEG,
      thetaDeg: TRUE_THETA_DEG,
      hfovDeg: 44,
      tee: SYNTH_TEE,
      ballRadiusPx: 7,
      numPoints: 14,
      firstT: 0.1,
    });
    const model = buildCalibration(calibration({ horizontalFovDeg: 44 }), VIDEO_META);
    const fit = fitDtlLaunch(track, model, 'driver', { teePointPx: SYNTH_TEE });

    expect(fit.converged).toBe(true);
    expect(fit.declineReason).toBeUndefined();
    // v within 5%, α within 1.5°, ψ within 3°, carry within 8%.
    expect(
      Math.abs(fit.launch.ballSpeedMph - TRUE_LAUNCH.ballSpeedMph) /
        TRUE_LAUNCH.ballSpeedMph,
    ).toBeLessThan(0.05);
    expect(
      Math.abs(fit.launch.launchAngleDeg - TRUE_LAUNCH.launchAngleDeg),
    ).toBeLessThan(1.5);
    expect(Math.abs(fit.azimuthDeg - TRUE_PSI_DEG)).toBeLessThan(3);
    expect(Math.abs(fit.carryYards - trueCarry) / trueCarry).toBeLessThan(0.08);
    // Geometry side-channel: the derived height stays physical and the
    // fitted pitch lands near the truth.
    expect(fit.cameraHeightM).toBeGreaterThan(0.6);
    expect(fit.cameraHeightM).toBeLessThan(2.6);
    expect(Math.abs(fit.cameraPitchDeg - TRUE_THETA_DEG)).toBeLessThan(2);
    expect(fit.teeSource).toBe('tap');
    expect(fit.usedPoints).toBe(14);
  });

  it('stays within 15% carry with 1.5 px noise, confidence inputs sane', () => {
    const { track, trueCarry } = synthTrack({
      launch: TRUE_LAUNCH,
      psiDeg: TRUE_PSI_DEG,
      thetaDeg: TRUE_THETA_DEG,
      hfovDeg: 44,
      tee: SYNTH_TEE,
      ballRadiusPx: 7,
      numPoints: 14,
      firstT: 0.1,
      noisePx: 1.5,
      seed: 42,
    });
    const model = buildCalibration(calibration({ horizontalFovDeg: 44 }), VIDEO_META);
    const fit = fitDtlLaunch(track, model, 'driver', { teePointPx: SYNTH_TEE });

    expect(fit.converged).toBe(true);
    expect(Math.abs(fit.carryYards - trueCarry) / trueCarry).toBeLessThan(0.15);
    // Confidence inputs: every quantity the downstream pinned formula
    // consumes must be finite and self-consistent.
    expect(fit.pixelRms).toBeGreaterThan(0);
    expect(fit.pixelRms).toBeLessThanOrEqual(fit.rmsThreshold);
    expect(fit.rmsThreshold).toBeCloseTo(
      Math.min(Math.max(0.005 * Math.hypot(FRAME.width, FRAME.height), 3), 12),
      9,
    );
    expect(fit.carrySpreadYards).toBeGreaterThanOrEqual(0);
    expect(fit.carrySpreadYards / fit.carryYards).toBeLessThanOrEqual(0.3);
    // Known FOV: the image evidence genuinely identifies the ball speed,
    // so the prior-domination probe reports a real pixel cost for moving
    // the speed a prior sigma.
    expect(Number.isFinite(fit.speedObsCostPx)).toBe(true);
    expect(fit.speedObsCostPx).toBeGreaterThanOrEqual(DTL_SPEED_OBS_MIN_PX);
    expect(fit.ensembleSize).toBeGreaterThanOrEqual(1);
    expect(fit.ensembleSize).toBeLessThanOrEqual(fit.startsRun);
    expect(fit.startsRun).toBe(12);
    expect(fit.teeSource).toBe('tap');
    expect(Number.isFinite(fit.cameraHeightM)).toBe(true);
    expect(Number.isFinite(fit.hfovDeg)).toBe(true);
    expect(Number.isFinite(fit.focalPx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Decline matrix
// ---------------------------------------------------------------------------
describe('fitDtlLaunch decline matrix', () => {
  jest.setTimeout(60000);

  const cleanSynth = () =>
    synthTrack({
      launch: TRUE_LAUNCH,
      psiDeg: TRUE_PSI_DEG,
      thetaDeg: TRUE_THETA_DEG,
      hfovDeg: 44,
      tee: SYNTH_TEE,
      ballRadiusPx: 7,
      numPoints: 14,
      firstT: 0.1,
    }).track;

  it("declines 'camera-angle' for face-on views", () => {
    const model = buildCalibration(
      calibration({ cameraAngle: 'face-on', horizontalFovDeg: 44 }),
      VIDEO_META,
    );
    const fit = fitDtlLaunch(cleanSynth(), model, 'driver');
    expect(fit.converged).toBe(false);
    expect(fit.declineReason).toBe('camera-angle');
  });

  it("declines 'no-anchor' without a ball-radius anchor", () => {
    const model = buildCalibration(
      { club: 'driver', cameraAngle: 'down-the-line', horizontalFovDeg: 44 },
      VIDEO_META,
    );
    const fit = fitDtlLaunch(cleanSynth(), model, 'driver', {
      teePointPx: SYNTH_TEE,
    });
    expect(fit.converged).toBe(false);
    expect(fit.declineReason).toBe('no-anchor');
  });

  it("declines 'too-few-points' with 7 post-impact samples", () => {
    const track = cleanSynth();
    const short: BallTrack = {
      ...track,
      smoothedPath: track.smoothedPath.slice(0, DTL_MIN_POINTS - 1),
    };
    const model = buildCalibration(calibration({ horizontalFovDeg: 44 }), VIDEO_META);
    const fit = fitDtlLaunch(short, model, 'driver', { teePointPx: SYNTH_TEE });
    expect(fit.converged).toBe(false);
    expect(fit.declineReason).toBe('too-few-points');
    expect(fit.usedPoints).toBe(DTL_MIN_POINTS - 1);
  });

  it("declines 'too-few-points' on failed track quality", () => {
    const track: BallTrack = { ...cleanSynth(), quality: 'failed' };
    const model = buildCalibration(calibration({ horizontalFovDeg: 44 }), VIDEO_META);
    const fit = fitDtlLaunch(track, model, 'driver', { teePointPx: SYNTH_TEE });
    expect(fit.converged).toBe(false);
    expect(fit.declineReason).toBe('too-few-points');
  });

  it('rejects a constant-velocity streak (a bird, not a golf ball)', () => {
    // Perfectly linear pixel motion has no gravity curvature to latch onto.
    const path: TrackPoint[] = [];
    for (let i = 0; i < 12; i++) {
      path.push({
        timestampMs: 1100 + (i * 1000) / 30,
        x: 600 - 8 * i,
        y: 1000 - 30 * i,
        interpolated: false,
      });
    }
    const model = realClipModel();
    const fit = fitDtlLaunch(trackFromPath(path, 1000), model, 'driver', {
      teePointPx: { x: 700, y: 1650 },
    });
    expect(fit.converged).toBe(false);
    expect(['poor-fit', 'degenerate']).toContain(fit.declineReason);
  });

  it("declines 'prior-dominated' when the speed is unobserved and parked at the prior mean", () => {
    // Unknown FOV opens the speed<->focal gauge direction, so the image
    // evidence cannot tell ball speeds a prior sigma apart (the speed-
    // observability probe reads ~0); with the truth AT the club prior's
    // mean the fitted speed parks there too. Pre-fix this surfaced as a
    // high-confidence 'measurement' whose carry merely restated the club
    // prior; now it must decline as prior-dominated.
    const prior = { ballSpeedMph: 150, launchAngleDeg: 12, backspinRpm: 2500 };
    const { track } = synthTrack({
      launch: prior,
      psiDeg: TRUE_PSI_DEG,
      thetaDeg: TRUE_THETA_DEG,
      hfovDeg: 44,
      tee: SYNTH_TEE,
      ballRadiusPx: 7,
      numPoints: 14,
      firstT: 0.1,
      noisePx: 1,
      seed: 7,
    });
    const model = buildCalibration(calibration(), VIDEO_META); // FOV withheld
    const fit = fitDtlLaunch(track, model, 'driver', { teePointPx: SYNTH_TEE });
    expect(fit.converged).toBe(false);
    expect(fit.declineReason).toBe('prior-dominated');
    expect(fit.speedObsCostPx).toBeLessThan(0.25);
  });

  it("declines 'degenerate' on a scale-ambiguous short recession", () => {
    // Pure recession (ψ = 0), few late samples: the classic bearing-only
    // ambiguity — near-optimal starts disagree wildly about carry.
    const { track } = synthTrack({
      launch: TRUE_LAUNCH,
      psiDeg: 0,
      thetaDeg: 6,
      hfovDeg: 44,
      tee: { x: 560, y: 1450 },
      ballRadiusPx: 5,
      numPoints: 8,
      firstT: 0.2,
      noisePx: 1.5,
      seed: 3,
    });
    const model = buildCalibration(
      calibration({ ballRadiusAtAddressPx: 5, horizontalFovDeg: 44 }),
      VIDEO_META,
    );
    const fit = fitDtlLaunch(track, model, 'driver', {
      teePointPx: { x: 560, y: 1450 },
    });
    expect(fit.converged).toBe(false);
    expect(fit.declineReason).toBe('degenerate');
    expect(fit.carrySpreadYards / fit.carryYards).toBeGreaterThan(0.3);
  });

  it('never throws on garbage input', () => {
    const empty = trackFromPath([], 1000);
    const model = realClipModel();
    expect(() => fitDtlLaunch(empty, model, 'driver')).not.toThrow();
    const fit = fitDtlLaunch(empty, model, 'driver');
    expect(fit.converged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The real clip: convergence and the slow-near regression
// ---------------------------------------------------------------------------
describe('fitDtlLaunch on the real DTL clip', () => {
  jest.setTimeout(60000);

  let tapFit: DtlFitResult;
  let extrapolatedFit: DtlFitResult;

  beforeAll(() => {
    tapFit = fitDtlLaunch(realClipTrack(), realClipModel(), 'driver', {
      teePointPx: REAL_TEE,
    });
    extrapolatedFit = fitDtlLaunch(realClipTrack(), realClipModel(), 'driver');
  });

  it('converges with a measured driver carry in [140, 300] yd', () => {
    expect(tapFit.converged).toBe(true);
    expect(tapFit.carryYards).toBeGreaterThanOrEqual(140);
    expect(tapFit.carryYards).toBeLessThanOrEqual(300);
    expect(tapFit.teeSource).toBe('tap');
    expect(tapFit.usedPoints).toBe(12);
    expect(tapFit.pixelRms).toBeLessThanOrEqual(tapFit.rmsThreshold);
    // Derived geometry stays physical.
    expect(tapFit.cameraHeightM).toBeGreaterThan(0.6);
    expect(tapFit.cameraHeightM).toBeLessThan(2.6);
    expect(tapFit.hfovDeg).toBeGreaterThanOrEqual(35);
    expect(tapFit.hfovDeg).toBeLessThanOrEqual(55);
  });

  it('slow-near regression: never converges onto a sub-100 yd driver carry', () => {
    // The old receding rung measured 2 yd at 0.50 confidence on exactly
    // this input. A converged DTL fit below 100 yd would mean the same
    // scale-free slow-near ridge — must be impossible by construction.
    for (const fit of [tapFit, extrapolatedFit]) {
      if (fit.converged) {
        expect(fit.carryYards).toBeGreaterThanOrEqual(100);
        // 100 yd for a driver would also be > 4σ off the prior — belt and
        // braces: a converged fit must be plausible for the club.
        expect(Math.abs(fit.launch.ballSpeedMph - 150)).toBeLessThanOrEqual(40);
      } else {
        expect(fit.declineReason).toBeDefined();
      }
    }
  });
});
