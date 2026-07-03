/**
 * FakePoseEstimator — a fully deterministic, pure-TS PoseEstimator that
 * plays back scripted keyframe skeletons, linearly interpolating between
 * keyframes at the requested frame timestamp (clamping outside the script).
 * This is the test workhorse for every pose-consuming analysis: soccer
 * pose-at-contact tables, joint-angle series, motion morphing.
 *
 * Ships a default "instep kick" script (address -> backswing -> contact ->
 * follow-through) so demos work out of the box; tests usually inject their
 * own keyframes.
 */
import type { VideoFrame } from '../../../types/media';
import {
  POSE_LANDMARKS,
  POSE_LANDMARK_COUNT,
  type Keypoint,
  type PoseEstimator,
  type PoseFrame,
} from './PoseAdapter';

export interface PoseKeyframe {
  timestampMs: number;
  /** Exactly 33 keypoints in BlazePose index order. */
  keypoints: Keypoint[];
}

export type LandmarkName = keyof typeof POSE_LANDMARKS;

export type NamedJointMap = Partial<
  Record<LandmarkName, { x: number; y: number; visibility?: number }>
>;

/**
 * Build a full 33-keypoint skeleton from a sparse named-joint map;
 * unspecified landmarks come out at (0, 0) with visibility 0, matching how
 * a COCO-style backend reports landmarks it does not produce.
 */
export function skeletonKeypoints(joints: NamedJointMap): Keypoint[] {
  const keypoints: Keypoint[] = Array.from(
    { length: POSE_LANDMARK_COUNT },
    () => ({ x: 0, y: 0, visibility: 0 }),
  );
  for (const [name, joint] of Object.entries(joints)) {
    const index = POSE_LANDMARKS[name as LandmarkName];
    keypoints[index] = {
      x: joint.x,
      y: joint.y,
      visibility: joint.visibility ?? 1,
    };
  }
  return keypoints;
}

/**
 * Default script: a right-footed instep kick in a 360x640-ish frame
 * (y grows downward, kicker faces +x). Four keyframes: address, backswing,
 * contact, follow-through.
 */
export function makeDefaultKickScript(): PoseKeyframe[] {
  const trunk = (hipX: number): NamedJointMap => ({
    nose: { x: hipX + 8, y: 120 },
    leftShoulder: { x: hipX - 20, y: 180 },
    rightShoulder: { x: hipX + 20, y: 180 },
    leftElbow: { x: hipX - 34, y: 240 },
    rightElbow: { x: hipX + 34, y: 240 },
    leftWrist: { x: hipX - 40, y: 295 },
    rightWrist: { x: hipX + 40, y: 295 },
    leftHip: { x: hipX - 16, y: 320 },
    rightHip: { x: hipX + 16, y: 320 },
  });

  return [
    {
      timestampMs: 0,
      keypoints: skeletonKeypoints({
        ...trunk(180),
        leftKnee: { x: 164, y: 420 },
        rightKnee: { x: 196, y: 420 },
        leftAnkle: { x: 164, y: 520 },
        rightAnkle: { x: 196, y: 520 },
        leftHeel: { x: 158, y: 528 },
        rightHeel: { x: 190, y: 528 },
        leftFootIndex: { x: 176, y: 532 },
        rightFootIndex: { x: 208, y: 532 },
      }),
    },
    {
      timestampMs: 400,
      keypoints: skeletonKeypoints({
        ...trunk(184),
        leftKnee: { x: 168, y: 420 },
        rightKnee: { x: 216, y: 430 },
        leftAnkle: { x: 168, y: 520 },
        rightAnkle: { x: 260, y: 500 },
        leftHeel: { x: 162, y: 528 },
        rightHeel: { x: 268, y: 505 },
        leftFootIndex: { x: 180, y: 532 },
        rightFootIndex: { x: 252, y: 512 },
      }),
    },
    {
      timestampMs: 520,
      keypoints: skeletonKeypoints({
        ...trunk(188),
        leftKnee: { x: 172, y: 420 },
        rightKnee: { x: 210, y: 410 },
        leftAnkle: { x: 172, y: 520 },
        rightAnkle: { x: 206, y: 505 },
        leftHeel: { x: 166, y: 528 },
        rightHeel: { x: 198, y: 512 },
        leftFootIndex: { x: 184, y: 532 },
        rightFootIndex: { x: 222, y: 500 },
      }),
    },
    {
      timestampMs: 800,
      keypoints: skeletonKeypoints({
        ...trunk(196),
        leftKnee: { x: 180, y: 420 },
        rightKnee: { x: 224, y: 360 },
        leftAnkle: { x: 180, y: 520 },
        rightAnkle: { x: 238, y: 430 },
        leftHeel: { x: 174, y: 528 },
        rightHeel: { x: 230, y: 438 },
        leftFootIndex: { x: 254, y: 424 },
        rightFootIndex: { x: 254, y: 424 },
      }),
    },
  ];
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function lerpKeypoint(a: Keypoint, b: Keypoint, t: number): Keypoint {
  const out: Keypoint = {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    visibility: lerp(a.visibility, b.visibility, t),
  };
  if (a.z !== undefined && b.z !== undefined) {
    out.z = lerp(a.z, b.z, t);
  }
  return out;
}

export class FakePoseEstimator implements PoseEstimator {
  private readonly keyframes: PoseKeyframe[];

  constructor(keyframes: PoseKeyframe[] = makeDefaultKickScript()) {
    if (keyframes.length === 0) {
      throw new Error('FakePoseEstimator needs at least one keyframe');
    }
    for (const kf of keyframes) {
      if (kf.keypoints.length !== POSE_LANDMARK_COUNT) {
        throw new Error(
          `Keyframe at ${kf.timestampMs}ms has ${kf.keypoints.length} ` +
            `keypoints, expected ${POSE_LANDMARK_COUNT}`,
        );
      }
    }
    this.keyframes = [...keyframes].sort(
      (a, b) => a.timestampMs - b.timestampMs,
    );
  }

  /** Deterministic scripted skeleton at the frame's media timestamp. */
  estimatePose(frame: VideoFrame): Promise<PoseFrame | null> {
    return Promise.resolve({
      frameIndex: frame.index,
      timestampMs: frame.timestampMs,
      keypoints: this.keypointsAt(frame.timestampMs),
    });
  }

  /** Interpolated keypoints at a timestamp (clamped to the script range). */
  keypointsAt(timestampMs: number): Keypoint[] {
    const frames = this.keyframes;
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    if (timestampMs <= first.timestampMs) {
      return first.keypoints.map((k) => ({ ...k }));
    }
    if (timestampMs >= last.timestampMs) {
      return last.keypoints.map((k) => ({ ...k }));
    }
    let hi = 1;
    while (frames[hi]!.timestampMs < timestampMs) {
      hi += 1;
    }
    const a = frames[hi - 1]!;
    const b = frames[hi]!;
    const span = b.timestampMs - a.timestampMs;
    const t = span > 1e-9 ? (timestampMs - a.timestampMs) / span : 0;
    return a.keypoints.map((k, i) => lerpKeypoint(k, b.keypoints[i]!, t));
  }
}
