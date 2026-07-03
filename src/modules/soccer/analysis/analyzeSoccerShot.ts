/**
 * Soccer take analysis orchestration — the measure_plan soccer evaluation on
 * our stack: runTracking (frozen pipeline, detector-agnostic) supplies the
 * per-frame BallObservations with radiusPx; the detected goal corners anchor
 * the metric world frame; then per-frame 3D ball position, current/peak
 * shot speed, the goal-plane cross verdict, and the pose-at-contact
 * joint-angle table are computed in order and packed into the store's
 * SoccerTakeResult shape.
 */
import type { FrameSource } from '../../../types/media';
import {
  runTracking,
  type RunTrackingOptions,
} from '../../tracking/tracker/pipeline';
import { getSportProfile } from '../../sports/engine/sportProfile';
import { focalPxFromFov } from '../../sports/engine/monocular';
import {
  createPoseEstimator,
  type PoseEstimator,
} from '../../sports/pose/PoseAdapter';
import type {
  BallPositionSample,
  SoccerTakeResult,
} from '../../sports/sportsSessionStore';
import { createGoalDetector, type GoalDetector } from '../goal/GoalDetector';
import {
  ballWorldFromObservations,
  solveCameraPoseFromGoal,
  type CameraIntrinsics,
} from './ballWorld';
import { computeSpeed } from './speed';
import { detectGoalCross } from './goalCross';
import { poseAtContact } from './poseAtContact';

export interface SoccerAnalysisOptions {
  /** User-facing take label ('fast take', 'Take 2', …). */
  label?: string;
  /** Options forwarded to the frozen tracking pipeline. */
  tracking?: RunTrackingOptions;
  /** Injectable adapters (fakes in tests; native detectors on device). */
  goalDetector?: GoalDetector;
  poseEstimator?: PoseEstimator;
  /** Assumed horizontal FOV when the camera is uncalibrated. Default 66°. */
  hFovDeg?: number;
  onProgress?: (fraction: number) => void;
}

/** Default smartphone main-camera horizontal FOV (deg, landscape). */
export const DEFAULT_HFOV_DEG = 66;

export async function analyzeSoccerTake(
  frameSource: FrameSource,
  options: SoccerAnalysisOptions = {},
): Promise<SoccerTakeResult> {
  const profile = getSportProfile('soccer');
  const goalTemplate = profile.anchors[0]!;
  const onProgress = options.onProgress ?? (() => undefined);

  // 1. Ball tracking (0 → 0.8 of progress).
  const { track } = await runTracking(frameSource, {
    ...options.tracking,
    onProgress: (f) => onProgress(0.8 * f),
  });
  if (track.observations.length < 2) {
    throw new Error(
      'Could not track the ball after the kick — film from behind the kicker ' +
        'with the goal fully in frame and try again',
    );
  }

  // 2. Goal anchor: detect the four goal corners on the contact frame (the
  //    goal is static, so one clean frame is enough).
  const goalDetector = options.goalDetector ?? createGoalDetector('tflite');
  const contactFrame = await frameSource.frameAt(track.impactTimestampMs);
  const detection = await goalDetector.detect(contactFrame);
  if (!detection) {
    throw new Error(
      'Could not find the goal in the video — keep all four goal corners visible',
    );
  }
  onProgress(0.85);

  // 3. Metric world frame: pinhole intrinsics (asset width + FOV assumption)
  //    plus the goal-corner homography give the camera pose; the ball's
  //    apparent diameter gives per-frame range.
  const width = track.frameWidth;
  const height = track.frameHeight;
  const intrinsics: CameraIntrinsics = {
    focalPx: focalPxFromFov(options.hFovDeg ?? DEFAULT_HFOV_DEG, width),
    cx: width / 2,
    cy: height / 2,
  };
  const pose = solveCameraPoseFromGoal(detection, goalTemplate, intrinsics);
  const world = ballWorldFromObservations(
    track.observations,
    pose,
    intrinsics,
    profile.ball.diameterM,
  );
  onProgress(0.9);

  // 4. Per-frame CURRENT SPEED + peak SHOT SPEED (slow-motion aware).
  const asset = frameSource.asset;
  const timeScale =
    asset.recordedFps && asset.fps > 0 ? asset.fps / asset.recordedFps : 1;
  const speed = computeSpeed(world, { timeScale });
  const samples: BallPositionSample[] = world.map((p, i) => ({
    timestampMs: p.timestampMs,
    positionM: { x: p.xM, y: p.yM, z: p.zM },
    speedMps: speed.series[i]?.speedMps ?? 0,
    apparentDiameterPx: p.ballDiameterPx,
  }));

  // 5. Goal-plane cross + verdict.
  const crossing = detectGoalCross(world, goalTemplate);
  onProgress(0.95);

  // 6. Pose at contact (degrades to null without a native pose backend).
  const estimator = options.poseEstimator ?? createPoseEstimator('native');
  const contact = await poseAtContact(frameSource, track, estimator);
  onProgress(1);

  return {
    label: options.label ?? 'Take 1',
    samples,
    peakSpeedMps: speed.shotSpeedMps,
    peakSpeedKmh: speed.shotSpeedKmh,
    distanceToGoalM: world.length > 0 ? world[0]!.distanceToGoalLineM : null,
    crossing: {
      crossed: crossing.crossed,
      isGoal: crossing.isGoal,
      ...(crossing.xM !== undefined ? { xM: crossing.xM } : {}),
      ...(crossing.yM !== undefined ? { yM: crossing.yM } : {}),
      ...(crossing.timestampMs !== undefined
        ? { timestampMs: crossing.timestampMs }
        : {}),
    },
    contactTimestampMs: track.impactTimestampMs,
    poseAtContact: contact.pose,
    jointAnglesAtContact: contact.jointAngles,
  };
}
