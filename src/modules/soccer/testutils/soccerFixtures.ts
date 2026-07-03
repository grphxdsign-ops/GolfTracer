/** Shared canned fixtures for soccer analysis and screen tests. */
import type { PoseFrame } from '../../sports/pose/PoseAdapter';
import { skeletonKeypoints } from '../../sports/pose/fakePoseEstimator';
import { computeJointAngleTable } from '../../sports/pose/jointAngles';
import type {
  SoccerAnalysisResult,
  SoccerTakeResult,
} from '../../sports/sportsSessionStore';

/**
 * A scripted kicker skeleton with hand-checkable joint angles:
 *  - right side (straight support leg): shoulder-hip 180°, hip-knee 180°,
 *    knee-ankle 90°;
 *  - left side: shoulder-hip 135°, hip-knee 180°, knee-ankle 135°.
 * With `bendRightKnee` the right ankle moves so hip-knee drops to 90°
 * (a visibly different contact posture for take comparison).
 */
export function scriptedContactPose(
  frameIndex: number,
  timestampMs: number,
  bendRightKnee = false,
): PoseFrame {
  const d = Math.SQRT1_2 * 50; // 45° leg step, 50 px segments
  const rightAnkle = bendRightKnee ? { x: 150, y: 150 } : { x: 100, y: 200 };
  return {
    frameIndex,
    timestampMs,
    keypoints: skeletonKeypoints({
      rightShoulder: { x: 100, y: 50 },
      rightHip: { x: 100, y: 100 },
      rightKnee: { x: 100, y: 150 },
      rightAnkle,
      rightFootIndex: { x: rightAnkle.x + 30, y: rightAnkle.y },
      leftShoulder: { x: 140, y: 50 },
      leftHip: { x: 140, y: 100 },
      leftKnee: { x: 140 + d, y: 100 + d },
      leftAnkle: { x: 140 + 2 * d, y: 100 + 2 * d },
      leftFootIndex: { x: 140 + 2 * d + 30, y: 100 + 2 * d },
    }),
  };
}

export function cannedTake(
  overrides: Partial<SoccerTakeResult> = {},
): SoccerTakeResult {
  const pose = scriptedContactPose(18, 150);
  return {
    label: 'Take 1',
    samples: [
      {
        timestampMs: 150,
        positionM: { x: 3.96, y: 0.11, z: 11.9 },
        speedMps: 20.6,
        apparentDiameterPx: 11.4,
      },
      {
        timestampMs: 250,
        positionM: { x: 3.96, y: 0.6, z: 9.8 },
        speedMps: 20.4,
        apparentDiameterPx: 9.7,
      },
    ],
    peakSpeedMps: 75 / 3.6,
    peakSpeedKmh: 75,
    distanceToGoalM: 11.9,
    crossing: {
      crossed: true,
      isGoal: true,
      xM: 3.97,
      yM: 1.02,
      timestampMs: 700,
    },
    contactTimestampMs: 150,
    poseAtContact: pose,
    jointAnglesAtContact: computeJointAngleTable(pose),
    ...overrides,
  };
}

export function cannedSoccerResult(
  overrides: Partial<SoccerAnalysisResult> = {},
): SoccerAnalysisResult {
  return {
    takes: [cannedTake()],
    bestTakeIndex: 0,
    insights: [],
    ...overrides,
  };
}
