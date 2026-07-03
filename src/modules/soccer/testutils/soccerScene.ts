/**
 * Synthetic soccer scenes with known ground truth: a W1-simulated kick
 * (spec-parameterized drag flight) is projected through an exactly-known
 * pinhole camera into a SyntheticFrameSource disc path, plus a scripted
 * exact-observation BallDetector and a scripted FakeGoalDetector whose
 * corner boxes match the same camera. Every quantity the analysis recovers
 * (world XYZ, distance to goal line, speeds, crossing coords) has an exact
 * truth value here.
 *
 * World frame (matches analysis/ballWorld.ts and the SOCCER_GOAL template):
 * origin at the bottom of the left post, x across the goal mouth, y up,
 * z from the goal plane toward the field. The camera sits behind the kicker
 * at +z looking straight down -z. The W1 flight simulator runs in its own
 * x-downrange frame and is rotated into this one (sim +x → world -z,
 * sim +z → world +x).
 */
import {
  SyntheticFrameSource,
  type DiscState,
} from '../../../adapters/frames/SyntheticFrameSource';
import type { VideoFrame } from '../../../types/media';
import type { BallDetector, BallObservation } from '../../../types/tracking';
import type { Roi } from '../../tracking/vision/imageOps';
import { getSportProfile } from '../../sports/engine/sportProfile';
import {
  simulateBallFlight,
  type BallFlightResult,
  type Vec3,
} from '../../sports/engine/ballFlight';
import { focalPxFromFov } from '../../sports/engine/monocular';
import type { WorldAnchorTemplate } from '../../sports/engine/sportProfile';
import type { GoalDetection } from '../goal/GoalDetector';
import { FakeGoalDetector } from '../goal/GoalDetector';
import type { BallWorldPoint, CameraIntrinsics } from '../analysis/ballWorld';

export interface SoccerSceneOptions {
  /** Kick launch speed. */
  speedKmh: number;
  /** Launch elevation above the ground, degrees. */
  elevationDeg: number;
  /** Horizontal aim: 0 = straight at the goal plane, + = camera-right. */
  azimuthDeg?: number;
  /** Kick position (x from the left post, z out from the goal plane). */
  kickFrom?: { xM: number; zM: number };
  /** Camera position in world meters. Default behind the kicker. */
  camera?: Vec3;
  width?: number;
  height?: number;
  fps?: number;
  hFovDeg?: number;
  /** Static ball lead-in before the kick. */
  preRollMs?: number;
}

export interface SceneTruthFrame {
  frameIndex: number;
  timestampMs: number;
  positionM: Vec3;
  speedMps: number;
}

export interface SoccerScene {
  frameSource: SyntheticFrameSource;
  /** Scripted detector returning the exact projected ball each frame. */
  detector: BallDetector;
  goalDetector: FakeGoalDetector;
  goalDetection: GoalDetection;
  goal: WorldAnchorTemplate;
  intrinsics: CameraIntrinsics;
  hFovDeg: number;
  /** ROIs around the kick point for the tracking pipeline. */
  impactRoi: Roi;
  seedRoi: Roi;
  truth: {
    launchSpeedMps: number;
    launchSpeedKmh: number;
    kickTimestampMs: number;
    flight: BallFlightResult;
    /** Per-source-frame truth while the ball is in flight. */
    frames: SceneTruthFrame[];
    /** Truth mapped into the analysis BallWorldPoint shape (exact values). */
    worldPoints: BallWorldPoint[];
    /** Exact projected per-frame observations (what a perfect detector sees). */
    observations: BallObservation[];
  };
}

const KMH_TO_MPS = 1 / 3.6;

export function makeSoccerScene(options: SoccerSceneOptions): SoccerScene {
  const profile = getSportProfile('soccer');
  const goal = profile.anchors[0]!;
  const width = options.width ?? 480;
  const height = options.height ?? 270;
  const fps = options.fps ?? 120;
  const hFovDeg = options.hFovDeg ?? 66;
  const preRollMs = options.preRollMs ?? 150;
  // Defaults: kick from just right of the goal-mouth centre, 11 m out
  // (penalty-spot-ish), camera 7 m behind the kicker at chest height.
  const kick = options.kickFrom ?? { xM: goal.widthM / 2 + 0.3, zM: 11 };
  const cameraPos = options.camera ?? { x: goal.widthM / 2, y: 1.4, z: 18 };
  const ballRadiusM = profile.ball.diameterM / 2;

  const intrinsics: CameraIntrinsics = {
    focalPx: focalPxFromFov(hFovDeg, width),
    cx: width / 2,
    cy: height / 2,
  };

  // Fixed camera orientation: looking straight down -z (world x = image
  // right, world y = image up).
  const toCamera = (p: Vec3): Vec3 => ({
    x: p.x - cameraPos.x,
    y: cameraPos.y - p.y,
    z: cameraPos.z - p.z,
  });
  const project = (p: Vec3): { u: number; v: number; rangeM: number } => {
    const c = toCamera(p);
    if (c.z <= 0.1) {
      throw new Error('Scene point is behind the camera');
    }
    return {
      u: intrinsics.cx + (intrinsics.focalPx * c.x) / c.z,
      v: intrinsics.cy + (intrinsics.focalPx * c.y) / c.z,
      rangeM: Math.hypot(c.x, c.y, c.z),
    };
  };
  const projectBall = (p: Vec3): DiscState & { rangeM: number } => {
    const { u, v, rangeM } = project(p);
    return { x: u, y: v, r: (intrinsics.focalPx * ballRadiusM) / rangeM, rangeM };
  };

  // Simulated kick in W1's x-downrange sim frame, rotated into the goal
  // frame: sim +x → world -z (toward the goal), sim +z → world +x, so a
  // positive sim azimuth curves toward the camera's right.
  const speedMps = options.speedKmh * KMH_TO_MPS;
  const launchPos: Vec3 = { x: kick.xM, y: ballRadiusM, z: kick.zM };
  const flight = simulateBallFlight(
    {
      speedMps,
      launchAngleDeg: options.elevationDeg,
      azimuthDeg: options.azimuthDeg ?? 0,
      positionM: { x: 0, y: ballRadiusM, z: 0 },
    },
    profile.ball,
  );
  const simToWorld = (p: Vec3): Vec3 => ({
    x: kick.xM + p.z,
    y: p.y,
    z: kick.zM - p.x,
  });

  const flightStateAt = (tS: number): { p: Vec3; speedMps: number } | null => {
    if (tS < 0 || tS > flight.flightTimeS) return null;
    const samples = flight.trajectory;
    let hi = 1;
    while (hi < samples.length && samples[hi]!.t < tS) hi++;
    if (hi >= samples.length) hi = samples.length - 1;
    const a = samples[hi - 1]!;
    const b = samples[hi]!;
    const span = b.t - a.t;
    const f = span > 1e-9 ? Math.min(1, Math.max(0, (tS - a.t) / span)) : 0;
    const lerp = (x: number, y: number): number => x + f * (y - x);
    return {
      p: simToWorld({
        x: lerp(a.positionM.x, b.positionM.x),
        y: lerp(a.positionM.y, b.positionM.y),
        z: lerp(a.positionM.z, b.positionM.z),
      }),
      speedMps: lerp(a.speedMps, b.speedMps),
    };
  };

  const worldAt = (timestampMs: number): { p: Vec3; speedMps: number } | null => {
    if (timestampMs < preRollMs) {
      return { p: launchPos, speedMps: 0 };
    }
    return flightStateAt((timestampMs - preRollMs) / 1000);
  };

  const durationMs = preRollMs + flight.flightTimeS * 1000;
  const frameSource = new SyntheticFrameSource({
    width,
    height,
    fps,
    durationMs,
    discPath: (timestampMs) => {
      const state = worldAt(timestampMs);
      return state ? projectBall(state.p) : null;
    },
    asset: { fps, recordedFps: fps },
  });

  // Scripted exact-observation detector (bypasses pixel-level detection so
  // fixtures isolate the geometry/speed math; honors the tracker's ROI).
  const detector: BallDetector = {
    detect(frame: VideoFrame, roi?: { x: number; y: number; w: number; h: number }) {
      const state = worldAt(frame.timestampMs);
      if (!state) return Promise.resolve([]);
      const disc = projectBall(state.p);
      if (
        roi &&
        (disc.x < roi.x || disc.x > roi.x + roi.w || disc.y < roi.y || disc.y > roi.y + roi.h)
      ) {
        return Promise.resolve([]);
      }
      const obs: BallObservation = {
        frameIndex: frame.index,
        timestampMs: frame.timestampMs,
        cx: disc.x,
        cy: disc.y,
        radiusPx: disc.r,
        confidence: 0.9,
      };
      return Promise.resolve([obs]);
    },
  };

  // Scripted goal-corner boxes from the same camera, ids mapped to the
  // template corners (post-bottom-left = image bottomLeft, etc.).
  const cornerWorld: ReadonlyArray<
    readonly [GoalDetection['corners'][number]['corner'], Vec3]
  > = [
    ['bottomLeft', { x: 0, y: 0, z: 0 }],
    ['bottomRight', { x: goal.widthM, y: 0, z: 0 }],
    ['topLeft', { x: 0, y: goal.heightM, z: 0 }],
    ['topRight', { x: goal.widthM, y: goal.heightM, z: 0 }],
  ];
  const goalDetection: GoalDetection = {
    corners: cornerWorld.map(([corner, p]) => {
      const { u, v } = project(p);
      return { corner, cx: u, cy: v, halfSizePx: 6, confidence: 0.95 };
    }),
  };
  const goalDetector = new FakeGoalDetector(goalDetection);

  // Impact box tight around the kick point; seed box covers the kick point
  // and the corridor above it (the kicked ball rises in the image).
  const kickImage = projectBall(launchPos);
  const impactRoi: Roi = {
    x: Math.round(kickImage.x - 30),
    y: Math.round(kickImage.y - 30),
    w: 60,
    h: 60,
  };
  const seedRoi: Roi = {
    x: Math.round(kickImage.x - 70),
    y: Math.round(kickImage.y - 150),
    w: 140,
    h: 165,
  };

  // Per-frame truth over the flight.
  const frames: SceneTruthFrame[] = [];
  const worldPoints: BallWorldPoint[] = [];
  const observations: BallObservation[] = [];
  for (let i = 0; i < frameSource.frameCount; i++) {
    const timestampMs = frameSource.timestampOf(i);
    if (timestampMs < preRollMs) continue;
    const state = worldAt(timestampMs);
    if (!state) break;
    frames.push({
      frameIndex: i,
      timestampMs,
      positionM: state.p,
      speedMps: state.speedMps,
    });
    const disc = projectBall(state.p);
    worldPoints.push({
      frameIndex: i,
      timestampMs,
      xM: state.p.x,
      yM: state.p.y,
      zM: state.p.z,
      distanceToGoalLineM: Math.max(0, state.p.z),
      rangeM: disc.rangeM,
      ballDiameterPx: 2 * disc.r,
    });
    observations.push({
      frameIndex: i,
      timestampMs,
      cx: disc.x,
      cy: disc.y,
      radiusPx: disc.r,
      confidence: 1,
    });
  }

  return {
    frameSource,
    detector,
    goalDetector,
    goalDetection,
    goal,
    intrinsics,
    hFovDeg,
    impactRoi,
    seedRoi,
    truth: {
      launchSpeedMps: speedMps,
      launchSpeedKmh: options.speedKmh,
      kickTimestampMs: preRollMs,
      flight,
      frames,
      worldPoints,
      observations,
    },
  };
}
