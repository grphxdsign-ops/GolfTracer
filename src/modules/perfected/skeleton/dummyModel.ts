/**
 * DummySkeleton — the pure-TS kinematic model behind the perfected-action
 * avatar. The dummy is a bone tree over the 33-landmark BlazePose topology
 * plus two virtual joints (pelvis = mid-hip root, chest = mid-shoulder),
 * with segment lengths calibrated ONCE from the user's own PoseFrame so the
 * avatar keeps the user's proportions no matter how far the motion is
 * morphed. Joint rotations are represented as unit bone directions blended
 * via quaternions in morph/morphMotion.ts; this file owns the structure,
 * calibration and forward-kinematics bookkeeping.
 *
 * The hip and shoulder girdles are modeled as symmetric axes about their
 * virtual center (left/right joints sit at ±halfWidth along one blended
 * axis direction), which keeps the re-derived virtual joints (mid-hip,
 * mid-shoulder) exactly on the kinematic root/chest — so bone lengths
 * re-measured from an emitted frame are invariant frame-to-frame.
 */
import type { Vec3 } from '../../sports/engine/ballFlight';
import {
  POSE_LANDMARKS,
  POSE_LANDMARK_COUNT,
  type Keypoint,
  type PoseFrame,
} from '../../sports/pose/PoseAdapter';

/** Virtual root joint: midpoint of the hips. */
export const PELVIS_JOINT = POSE_LANDMARK_COUNT;
/** Virtual chest joint: midpoint of the shoulders. */
export const CHEST_JOINT = POSE_LANDMARK_COUNT + 1;
/** Real landmarks + the two virtual joints. */
export const EXTENDED_JOINT_COUNT = POSE_LANDMARK_COUNT + 2;

/** Landmarks below this visibility are treated as absent. */
export const VISIBILITY_THRESHOLD = 0.5;

export interface DummyBone {
  name: string;
  /** Extended-joint index the bone hangs from. */
  parent: number;
  /** Extended-joint index the bone positions. */
  child: number;
}

const L = POSE_LANDMARKS;

/**
 * Serial chain bones in forward-kinematics order (every parent is either a
 * girdle joint or positioned by an earlier bone). The hip/shoulder girdles
 * and the spine are handled separately as symmetric axes.
 */
export const CHAIN_BONES: readonly DummyBone[] = [
  { name: 'left-thigh', parent: L.leftHip, child: L.leftKnee },
  { name: 'left-shank', parent: L.leftKnee, child: L.leftAnkle },
  { name: 'left-heel', parent: L.leftAnkle, child: L.leftHeel },
  { name: 'left-foot', parent: L.leftAnkle, child: L.leftFootIndex },
  { name: 'right-thigh', parent: L.rightHip, child: L.rightKnee },
  { name: 'right-shank', parent: L.rightKnee, child: L.rightAnkle },
  { name: 'right-heel', parent: L.rightAnkle, child: L.rightHeel },
  { name: 'right-foot', parent: L.rightAnkle, child: L.rightFootIndex },
  { name: 'left-upper-arm', parent: L.leftShoulder, child: L.leftElbow },
  { name: 'left-forearm', parent: L.leftElbow, child: L.leftWrist },
  { name: 'left-pinky', parent: L.leftWrist, child: L.leftPinky },
  { name: 'left-index', parent: L.leftWrist, child: L.leftIndex },
  { name: 'left-thumb', parent: L.leftWrist, child: L.leftThumb },
  { name: 'right-upper-arm', parent: L.rightShoulder, child: L.rightElbow },
  { name: 'right-forearm', parent: L.rightElbow, child: L.rightWrist },
  { name: 'right-pinky', parent: L.rightWrist, child: L.rightPinky },
  { name: 'right-index', parent: L.rightWrist, child: L.rightIndex },
  { name: 'right-thumb', parent: L.rightWrist, child: L.rightThumb },
  { name: 'neck', parent: CHEST_JOINT, child: L.nose },
  { name: 'left-eye-inner', parent: L.nose, child: L.leftEyeInner },
  { name: 'left-eye', parent: L.nose, child: L.leftEye },
  { name: 'left-eye-outer', parent: L.nose, child: L.leftEyeOuter },
  { name: 'right-eye-inner', parent: L.nose, child: L.rightEyeInner },
  { name: 'right-eye', parent: L.nose, child: L.rightEye },
  { name: 'right-eye-outer', parent: L.nose, child: L.rightEyeOuter },
  { name: 'left-ear', parent: L.nose, child: L.leftEar },
  { name: 'right-ear', parent: L.nose, child: L.rightEar },
  { name: 'mouth-left', parent: L.nose, child: L.mouthLeft },
  { name: 'mouth-right', parent: L.nose, child: L.mouthRight },
];

/**
 * The dummy's calibrated proportions: measured once from a real PoseFrame
 * and reused for every reconstructed frame (bone-length invariance).
 */
export interface DummySkeleton {
  /** Half the hip width (pelvis to either hip), px. */
  hipHalfWidthPx: number;
  /** Half the shoulder width (chest to either shoulder), px. */
  shoulderHalfWidthPx: number;
  /** Pelvis-to-chest length, px. */
  spineLengthPx: number;
  /** Lengths for CHAIN_BONES (same order); 0 = endpoint not visible. */
  chainLengthsPx: number[];
  /** Extended-joint visibility at calibration time. */
  jointVisibility: number[];
}

export interface ExtendedPose {
  /** EXTENDED_JOINT_COUNT positions (z = 0 when the landmark has none). */
  positions: Vec3[];
  /** EXTENDED_JOINT_COUNT visibilities (virtuals = min of constituents). */
  visibility: number[];
}

const toVec = (k: Keypoint): Vec3 => ({ x: k.x, y: k.y, z: k.z ?? 0 });

const midpoint = (a: Vec3, b: Vec3): Vec3 => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
});

export const vecDistance = (a: Vec3, b: Vec3): number =>
  Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

/**
 * Extend 33 keypoints with the virtual pelvis (mid-hip) and chest
 * (mid-shoulder) joints used as the kinematic root and shoulder anchor.
 */
export function extendKeypoints(keypoints: Keypoint[]): ExtendedPose {
  if (keypoints.length !== POSE_LANDMARK_COUNT) {
    throw new Error(
      `extendKeypoints needs ${POSE_LANDMARK_COUNT} keypoints, got ${keypoints.length}`,
    );
  }
  const positions: Vec3[] = new Array<Vec3>(EXTENDED_JOINT_COUNT);
  const visibility: number[] = new Array<number>(EXTENDED_JOINT_COUNT);
  for (let i = 0; i < POSE_LANDMARK_COUNT; i++) {
    const k = keypoints[i]!;
    positions[i] = toVec(k);
    visibility[i] = k.visibility;
  }
  const lh = positions[L.leftHip]!;
  const rh = positions[L.rightHip]!;
  const ls = positions[L.leftShoulder]!;
  const rs = positions[L.rightShoulder]!;
  positions[PELVIS_JOINT] = midpoint(lh, rh);
  positions[CHEST_JOINT] = midpoint(ls, rs);
  visibility[PELVIS_JOINT] = Math.min(
    visibility[L.leftHip]!,
    visibility[L.rightHip]!,
  );
  visibility[CHEST_JOINT] = Math.min(
    visibility[L.leftShoulder]!,
    visibility[L.rightShoulder]!,
  );
  return { positions, visibility };
}

const visible = (pose: ExtendedPose, joint: number): boolean =>
  pose.visibility[joint]! >= VISIBILITY_THRESHOLD;

/**
 * Bone-length calibration: measure every segment of the dummy from one of
 * the user's own pose frames. Bones with an invisible endpoint calibrate
 * to length 0 and collapse onto their parent during reconstruction.
 */
export function calibrateSkeleton(pose: PoseFrame): DummySkeleton {
  const ext = extendKeypoints(pose.keypoints);
  const p = ext.positions;
  const between = (a: number, b: number): number =>
    visible(ext, a) && visible(ext, b) ? vecDistance(p[a]!, p[b]!) : 0;

  return {
    hipHalfWidthPx: between(L.leftHip, L.rightHip) / 2,
    shoulderHalfWidthPx: between(L.leftShoulder, L.rightShoulder) / 2,
    spineLengthPx: between(PELVIS_JOINT, CHEST_JOINT),
    chainLengthsPx: CHAIN_BONES.map((bone) =>
      between(bone.parent, bone.child),
    ),
    jointVisibility: [...ext.visibility],
  };
}

/**
 * Pick the frame that sees the skeleton best (greatest summed visibility)
 * as the calibration frame.
 */
export function pickCalibrationFrame(frames: PoseFrame[]): PoseFrame {
  if (frames.length === 0) {
    throw new Error('pickCalibrationFrame needs at least one frame');
  }
  let best = frames[0]!;
  let bestScore = -1;
  for (const frame of frames) {
    let score = 0;
    for (const k of frame.keypoints) {
      score += k.visibility;
    }
    if (score > bestScore) {
      bestScore = score;
      best = frame;
    }
  }
  return best;
}

/**
 * Unit direction of the bone parent→child in an extended pose, or null
 * when either endpoint is invisible or the segment is degenerate.
 */
export function boneDirection(
  pose: ExtendedPose,
  parent: number,
  child: number,
): Vec3 | null {
  if (!visible(pose, parent) || !visible(pose, child)) {
    return null;
  }
  const a = pose.positions[parent]!;
  const b = pose.positions[child]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const n = Math.hypot(dx, dy, dz);
  if (n < 1e-9) {
    return null;
  }
  return { x: dx / n, y: dy / n, z: dz / n };
}
