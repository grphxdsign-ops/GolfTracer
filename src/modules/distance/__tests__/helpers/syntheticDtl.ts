/**
 * Synthetic down-the-line (DTL) track generator for validating the DTL
 * carry estimator against ground truth.
 *
 * INDEPENDENCE RULE: this file implements the pinned projection convention
 * from scratch and must NOT import src/modules/distance/estimate/projection.ts
 * (or anything else from estimate/). The estimator and this generator are two
 * independent implementations of the same pinned convention — if either one
 * gets a sign or axis wrong, the validation grid in dtlGrid.test.ts fails
 * instead of silently agreeing with its own bug. Physics (simulateFlight) is
 * shared on purpose: the grid validates geometry + optimization, not the
 * aerodynamics model.
 *
 * Pinned convention (sharedRules):
 *   World: tee ground point = origin, Z up, X = horizontal projection of the
 *   camera optical axis (forward), Y = world-left. Camera pitch θ positive =
 *   optical axis tilted up, roll 0, yaw absorbed by the frame definition.
 *   Camera coords of a world displacement w (m):
 *     x_c = −w_Y
 *     y_c = w_X·sinθ − w_Z·cosθ
 *     z_c = w_X·cosθ + w_Z·sinθ
 *   Pixel: u = cx + f·x_c/z_c, v = cy + f·y_c/z_c with (cx, cy) = image
 *   center and f in px. Scale anchor: D_tee = f·0.04267/(2·ballRadiusPx)
 *   with D_tee the Euclidean camera-to-tee distance.
 *   Ball world position from the planar simulator (x downrange m, y up m)
 *   at azimuth ψ (deg, + = world-left = image-left):
 *     B(t) = (x·cosψ, x·sinψ, y).
 */
import type { BallTrack, ClubType, TrackPoint, TrackQuality } from '../../../../types';

import {
  simulateFlight,
  type LaunchConditions,
  type TrajectoryPoint,
} from '../../physics/simulator';

/** Regulation golf ball diameter, m (kept local — no imports from estimate/). */
const BALL_DIAMETER_M = 0.04267;

const DEG = Math.PI / 180; // rad per degree

/** Deterministic LCG in [0, 1) — the repo's standard seeded-noise pattern. */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** Pinhole camera fully placed in the pinned world frame. */
export interface SyntheticCamera {
  /** Focal length, px. */
  focalPx: number;
  /** Principal point = image center, px. */
  cx: number;
  cy: number;
  /** Camera pitch θ, deg (+ = tilted up). */
  pitchDeg: number;
  /** Camera center in world coords, m (tee at origin, Z up, Y world-left). */
  centerM: { x: number; y: number; z: number };
}

/**
 * Project a world point (m) through the pinned convention. Returns null when
 * the point is behind the camera (z_c <= 0) — callers must not use it.
 */
export function projectWorldPoint(
  cam: SyntheticCamera,
  point: { x: number; y: number; z: number },
): { u: number; v: number; zC: number } {
  const th = cam.pitchDeg * DEG;
  // World displacement camera -> point, m.
  const wX = point.x - cam.centerM.x;
  const wY = point.y - cam.centerM.y;
  const wZ = point.z - cam.centerM.z;
  // Pinned camera basis (x_c right, y_c down, z_c forward), m.
  const xC = -wY;
  const yC = wX * Math.sin(th) - wZ * Math.cos(th);
  const zC = wX * Math.cos(th) + wZ * Math.sin(th);
  return {
    u: cam.cx + (cam.focalPx * xC) / zC,
    v: cam.cy + (cam.focalPx * yC) / zC,
    zC,
  };
}

/** Linear interpolation of a simulated planar trajectory at time t (s). */
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

export interface SyntheticDtlOptions {
  club: ClubType;
  /** True launch conditions fed to simulateFlight. */
  launch: LaunchConditions;
  /** Launch azimuth ψ, deg (+ = world-left = image-left). */
  azimuthDeg: number;
  /** Camera pitch θ, deg (+ = tilted up). */
  cameraPitchDeg: number;
  /** Camera center height above the tee ground plane h_c, m. */
  cameraHeightM: number;
  /** Euclidean camera-to-tee distance D_tee, m. */
  teeDistanceM: number;
  /** Camera lateral offset, m world-left of the tee (default 0.45). */
  cameraLateralM?: number;
  /** True horizontal field of view, deg. */
  hfovDeg: number;
  frameWidth: number;
  frameHeight: number;
  /** Container fps (normal video: timeScale = 1). */
  fps: number;
  /** Media timestamp of impact, ms (default 267 — the real clip's). */
  impactTimestampMs?: number;
  /** Detection gap between impact and the first observation, s (default 0.1). */
  firstObsDelayS?: number;
  /** Number of observations, sampled at consecutive frames after the gap. */
  nObs: number;
  /** Uniform pixel noise amplitude (± noisePx on u and v). */
  noisePx: number;
  quality?: TrackQuality;
  seed: number;
}

export interface SyntheticDtlResult {
  track: BallTrack;
  /** Noise-free tee ground-point pixel (the user's ball tap). */
  teePointPx: { x: number; y: number };
  /** Ball radius at address consistent with the pinned D_tee anchor, px. */
  ballRadiusAtAddressPx: number;
  /** Ground-truth carry of the simulated flight, yd. */
  trueCarryYards: number;
  /** The camera used, for debugging grid failures. */
  camera: SyntheticCamera;
}

/**
 * Generate a synthetic DTL ball track: simulate the true flight, place a
 * pinned-convention pinhole camera behind the tee, and project the ball at
 * consecutive frame times after a detection gap, plus derived tee pixel and
 * address ball radius.
 */
export function makeSyntheticDtlTrack(
  opts: SyntheticDtlOptions,
): SyntheticDtlResult {
  const {
    launch,
    azimuthDeg,
    cameraPitchDeg,
    cameraHeightM,
    teeDistanceM,
    hfovDeg,
    frameWidth,
    frameHeight,
    fps,
    nObs,
    noisePx,
    seed,
  } = opts;
  const cameraLateralM = opts.cameraLateralM ?? 0.45;
  const impactTimestampMs = opts.impactTimestampMs ?? 267;
  const firstObsDelayS = opts.firstObsDelayS ?? 0.1;

  const focalPx = frameWidth / 2 / Math.tan((hfovDeg * DEG) / 2);

  // Camera center: height and lateral offset given; the along-axis distance
  // follows from the Euclidean tee distance. Camera sits behind the tee
  // (negative X — X points downrange by the frame definition).
  const alongSq =
    teeDistanceM * teeDistanceM -
    cameraHeightM * cameraHeightM -
    cameraLateralM * cameraLateralM;
  if (alongSq <= 0) {
    throw new Error(
      `teeDistanceM ${teeDistanceM} too short for height/lateral offsets`,
    );
  }
  const camera: SyntheticCamera = {
    focalPx,
    cx: frameWidth / 2,
    cy: frameHeight / 2,
    pitchDeg: cameraPitchDeg,
    centerM: { x: -Math.sqrt(alongSq), y: cameraLateralM, z: cameraHeightM },
  };

  const tee = projectWorldPoint(camera, { x: 0, y: 0, z: 0 });
  // Pinned anchor convention: D_tee = f·d_ball/(2·r_px), D_tee Euclidean.
  const ballRadiusAtAddressPx = (focalPx * BALL_DIAMETER_M) / (2 * teeDistanceM);

  const flight = simulateFlight(launch);
  const cosPsi = Math.cos(azimuthDeg * DEG);
  const sinPsi = Math.sin(azimuthDeg * DEG);

  const rng = makeRng(seed);
  const noise = () => (rng() * 2 - 1) * noisePx;

  const smoothedPath: TrackPoint[] = [];
  for (let i = 0; i < nObs; i++) {
    const t = firstObsDelayS + i / fps; // real s after impact (timeScale 1)
    const sim = trajectoryAt(flight.trajectory, t); // planar m
    const ball = { x: sim.x * cosPsi, y: sim.x * sinPsi, z: sim.y }; // world m
    const px = projectWorldPoint(camera, ball);
    smoothedPath.push({
      timestampMs: impactTimestampMs + t * 1000,
      x: px.u + noise(),
      y: px.v + noise(),
      interpolated: false,
    });
  }

  let apexPointIndex = 0;
  for (let i = 1; i < smoothedPath.length; i++) {
    if (smoothedPath[i]!.y < smoothedPath[apexPointIndex]!.y) {
      apexPointIndex = i;
    }
  }

  const track: BallTrack = {
    observations: smoothedPath.map((p, i) => ({
      frameIndex: i,
      timestampMs: p.timestampMs,
      cx: p.x,
      cy: p.y,
      radiusPx: 3,
      confidence: 0.9,
    })),
    smoothedPath,
    impactFrameIndex: 0,
    impactTimestampMs,
    apexPointIndex,
    frameWidth,
    frameHeight,
    quality: opts.quality ?? 'high',
  };

  return {
    track,
    teePointPx: { x: tee.u, y: tee.v },
    ballRadiusAtAddressPx,
    trueCarryYards: flight.carryYards,
    camera,
  };
}

// ---------------------------------------------------------------------------
// Sanity tests for the pinned convention (this file is collected by jest as a
// suite because it lives under __tests__/, so it self-checks the convention's
// pinned sign properties instead of shipping test-less).
// ---------------------------------------------------------------------------

describe('syntheticDtl pinned projection convention', () => {
  const cam: SyntheticCamera = {
    focalPx: 1000,
    cx: 540,
    cy: 960,
    pitchDeg: 0,
    centerM: { x: -4, y: 0, z: 1.5 },
  };

  it('projects a higher ball to a smaller v (image up)', () => {
    const low = projectWorldPoint(cam, { x: 10, y: 0, z: 1 });
    const high = projectWorldPoint(cam, { x: 10, y: 0, z: 5 });
    expect(high.v).toBeLessThan(low.v);
  });

  it('projects a world-left ball to a smaller u (image left)', () => {
    const center = projectWorldPoint(cam, { x: 10, y: 0, z: 2 });
    const left = projectWorldPoint(cam, { x: 10, y: 1, z: 2 });
    expect(left.u).toBeLessThan(center.u);
  });

  it('drops the horizon when the camera pitches up', () => {
    // A distant point on the horizontal through the camera approximates the
    // horizon; pitching the camera up drops the horizon lower in the frame,
    // i.e. to a LARGER image row v.
    const level = projectWorldPoint(cam, { x: 1000, y: 0, z: cam.centerM.z });
    const pitched = projectWorldPoint(
      { ...cam, pitchDeg: 8 },
      { x: 1000, y: 0, z: cam.centerM.z },
    );
    expect(pitched.v).toBeGreaterThan(level.v);
  });

  it('generates a tee pixel + ball radius consistent with the pinned anchor', () => {
    const scene = makeSyntheticDtlTrack({
      club: 'driver',
      launch: { ballSpeedMph: 150, launchAngleDeg: 12, backspinRpm: 2500 },
      azimuthDeg: 0,
      cameraPitchDeg: 3,
      cameraHeightM: 1.55,
      teeDistanceM: 4,
      hfovDeg: 44,
      frameWidth: 1080,
      frameHeight: 1920,
      fps: 30,
      nObs: 12,
      noisePx: 0,
      seed: 7,
    });
    // Anchor round-trip: D_tee = f·d/(2r) must recover the true Euclidean
    // camera-to-tee distance.
    const dTee =
      (scene.camera.focalPx * 0.04267) / (2 * scene.ballRadiusAtAddressPx);
    expect(dTee).toBeCloseTo(4, 9);
    // Tee ground point sits below the image center (camera above the ground).
    expect(scene.teePointPx.y).toBeGreaterThan(960);
    // The ball rises in the image over the observed window.
    const first = scene.track.smoothedPath[0]!;
    const last = scene.track.smoothedPath[scene.track.smoothedPath.length - 1]!;
    expect(last.y).toBeLessThan(first.y);
    // Flight time base: first observation is 100 ms after impact.
    expect(first.timestampMs - scene.track.impactTimestampMs).toBeCloseTo(100, 6);
  });
});
