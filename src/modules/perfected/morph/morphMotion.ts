/**
 * Motion morphing — turns the user's measured motion into the dummy's
 * perfected action:
 *
 *  1. DTW-align the user's joint-angle curves to the sport's curated expert
 *     reference track (so backswing matches backswing and contact matches
 *     contact regardless of tempo),
 *  2. per frame and per bone, blend the measured orientation toward the
 *     time-aligned expert one by a 0-1 correction strength — girdle axes
 *     and the spine slerp along the great circle (quaternion between the
 *     two world directions), while every serial-chain bone blends
 *     RELATIVE to its parent bone: the flexion angle interpolates
 *     linearly (so joint angles move monotonically measured -> target,
 *     even when the two bend to opposite sides) and the bend plane
 *     rotates about the parent by the slerped plane angle, and
 *  3. reconstruct joint positions by forward kinematics with the ONCE
 *     calibrated segment lengths — bone lengths are invariant by
 *     construction no matter the strength.
 *
 * At strength 0 every joint angle equals the measured one; at strength 1
 * the bone directions (hence all bone-to-bone angles) equal the expert's,
 * retargeted onto the user's own proportions.
 */
import type { Vec3 } from '../../sports/engine/ballFlight';
import {
  POSE_LANDMARKS,
  POSE_LANDMARK_COUNT,
  type Keypoint,
  type PoseFrame,
} from '../../sports/pose/PoseAdapter';
import {
  FakePoseEstimator,
  type PoseKeyframe,
} from '../../sports/pose/fakePoseEstimator';
import { computeJointAngleTable } from '../../sports/pose/jointAngles';
import {
  CHAIN_BONES,
  CHEST_JOINT,
  EXTENDED_JOINT_COUNT,
  PELVIS_JOINT,
  boneDirection,
  extendKeypoints,
  type DummySkeleton,
  type ExtendedPose,
} from '../skeleton/dummyModel';
import { QUAT_IDENTITY, quatFromUnitVectors, quatRotate, quatSlerp } from './quat';
import { dtwAlign, type DtwAlignment } from './dtw';

const L = POSE_LANDMARKS;

/** Reference samples used for the DTW alignment grid. */
const REFERENCE_SAMPLES = 64;

export interface MotionAlignment {
  /** The raw DTW alignment over the sampled reference grid. */
  dtw: DtwAlignment;
  /** Timestamps of the sampled reference grid, ms. */
  referenceTimestampsMs: number[];
  /** Per measured frame: the aligned expert-track timestamp, ms. */
  mappedReferenceMs: number[];
}

export interface MorphedMotion {
  /** Morphed dummy frames at the requested strength (measured timestamps). */
  frames: PoseFrame[];
  /** The strength-1 frames: the expert action on the user's skeleton. */
  targetFrames: PoseFrame[];
  alignment: MotionAlignment;
  /** The clamped correction strength actually applied. */
  strength: number;
}

/** Sample a keyframe track into uniform PoseFrames at `fps`. */
export function samplePoseFrames(
  track: PoseKeyframe[],
  fps: number,
): PoseFrame[] {
  if (track.length === 0) {
    throw new Error('samplePoseFrames needs a non-empty track');
  }
  if (fps <= 0) {
    throw new Error(`fps must be positive: ${fps}`);
  }
  const estimator = new FakePoseEstimator(track);
  const t0 = track[0]!.timestampMs;
  const t1 = track[track.length - 1]!.timestampMs;
  const stepMs = 1000 / fps;
  const frames: PoseFrame[] = [];
  for (let i = 0; ; i++) {
    const t = t0 + i * stepMs;
    const clamped = Math.min(t, t1);
    frames.push({
      frameIndex: i,
      timestampMs: clamped,
      keypoints: estimator.keypointsAt(clamped),
    });
    if (t >= t1) {
      break;
    }
  }
  return frames;
}

/** The six-angle feature vector the DTW alignment runs on. */
function angleFeature(frame: PoseFrame): number[] {
  const table = computeJointAngleTable(frame);
  return [
    table.left.shoulderHip,
    table.left.hipKnee,
    table.left.kneeAnkle,
    table.right.shoulderHip,
    table.right.hipKnee,
    table.right.kneeAnkle,
  ];
}

/** Great-circle blend of a measured world direction toward the expert's. */
function blendDirection(
  measured: Vec3 | null,
  expert: Vec3 | null,
  strength: number,
): Vec3 | null {
  if (measured === null) {
    return expert;
  }
  if (expert === null) {
    return measured;
  }
  const full = quatFromUnitVectors(measured, expert);
  const partial = quatSlerp(QUAT_IDENTITY, full, strength);
  return quatRotate(partial, measured);
}

const add = (p: Vec3, d: Vec3, len: number): Vec3 => ({
  x: p.x + d.x * len,
  y: p.y + d.y * len,
  z: p.z + d.z * len,
});

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const normalizeOrNull = (v: Vec3): Vec3 | null => {
  const n = Math.hypot(v.x, v.y, v.z);
  if (n < 1e-9) {
    return null;
  }
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};

/** Unit component of `d` perpendicular to unit `ref` (the bend plane). */
const perpComponent = (d: Vec3, ref: Vec3): Vec3 | null => {
  const along = dot(d, ref);
  return normalizeOrNull({
    x: d.x - along * ref.x,
    y: d.y - along * ref.y,
    z: d.z - along * ref.z,
  });
};

/** Any unit vector perpendicular to unit `axis`. */
const anyPerp = (axis: Vec3): Vec3 => {
  const ref: Vec3 =
    Math.abs(axis.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  return normalizeOrNull(cross(axis, ref)) ?? { x: 0, y: 0, z: 1 };
};

/** Rodrigues rotation of `v` about unit `axis` by `angle` radians. */
const rotateAboutAxis = (v: Vec3, axis: Vec3, angle: number): Vec3 => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const c = cross(axis, v);
  const d = dot(axis, v) * (1 - cos);
  return {
    x: v.x * cos + c.x * sin + axis.x * d,
    y: v.y * cos + c.y * sin + axis.y * d,
    z: v.z * cos + c.z * sin + axis.z * d,
  };
};

/**
 * Signed angle from `u` to `v` about unit `axis` (both perpendicular to
 * the axis), in (-pi, pi] — antipodal vectors resolve to +pi.
 */
const signedAngleAbout = (axis: Vec3, u: Vec3, v: Vec3): number => {
  const angle = Math.atan2(dot(axis, cross(u, v)), dot(u, v));
  return angle <= -Math.PI + 1e-12 ? Math.PI : angle;
};

const angleBetween = (a: Vec3, b: Vec3): number =>
  Math.acos(Math.min(1, Math.max(-1, dot(a, b))));

/**
 * A bone direction in its three incarnations: measured, expert, blended.
 * Chain bones blend relative to their parent bone's triple.
 */
interface DirTriple {
  m: Vec3 | null;
  e: Vec3 | null;
  b: Vec3 | null;
}

/**
 * Blend a serial-chain bone RELATIVE to its parent bone: the flexion angle
 * against the parent interpolates linearly (monotone joint angles by
 * construction) while the bend plane rotates about the blended parent by
 * the slerped plane angle. Falls back to the world great-circle blend when
 * the parent context is unavailable.
 */
function blendChainDirection(
  ref: DirTriple,
  measured: Vec3 | null,
  expert: Vec3 | null,
  strength: number,
): Vec3 | null {
  if (measured === null || expert === null) {
    return measured ?? expert;
  }
  if (ref.m === null || ref.e === null || ref.b === null) {
    return blendDirection(measured, expert, strength);
  }
  const thetaM = angleBetween(ref.m, measured);
  const thetaE = angleBetween(ref.e, expert);
  const theta = thetaM + (thetaE - thetaM) * strength;

  // Bend-plane directions, transported into the blended parent frame.
  const pM = perpComponent(measured, ref.m);
  const pE = perpComponent(expert, ref.e);
  const pMt =
    pM === null ? null : quatRotate(quatFromUnitVectors(ref.m, ref.b), pM);
  const pEt =
    pE === null ? null : quatRotate(quatFromUnitVectors(ref.e, ref.b), pE);
  let plane: Vec3;
  if (pMt !== null && pEt !== null) {
    const phi = signedAngleAbout(ref.b, pMt, pEt);
    plane = rotateAboutAxis(pMt, ref.b, strength * phi);
  } else {
    plane = pMt ?? pEt ?? anyPerp(ref.b);
  }

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return {
    x: cosT * ref.b.x + sinT * plane.x,
    y: cosT * ref.b.y + sinT * plane.y,
    z: cosT * ref.b.z + sinT * plane.z,
  };
}

/**
 * Forward-kinematics reconstruction of one frame: measured root, blended
 * bone directions, calibrated segment lengths.
 */
function reconstructFrame(
  measured: PoseFrame,
  expertKeypoints: Keypoint[],
  skeleton: DummySkeleton,
  strength: number,
): PoseFrame {
  const em: ExtendedPose = extendKeypoints(measured.keypoints);
  const ee: ExtendedPose = extendKeypoints(expertKeypoints);
  const worldDir = (parent: number, child: number): Vec3 | null =>
    blendDirection(
      boneDirection(em, parent, child),
      boneDirection(ee, parent, child),
      strength,
    );

  const out = new Array<Vec3>(EXTENDED_JOINT_COUNT);
  // Root: the dummy stands where the user stood.
  const pelvis = em.positions[PELVIS_JOINT]!;
  out[PELVIS_JOINT] = { ...pelvis };

  // Hip girdle: one blended axis, hips symmetric about the pelvis so the
  // re-derived mid-hip stays exactly on the kinematic root.
  const hipAxis = worldDir(L.leftHip, L.rightHip) ?? { x: 1, y: 0, z: 0 };
  out[L.leftHip] = add(pelvis, hipAxis, -skeleton.hipHalfWidthPx);
  out[L.rightHip] = add(pelvis, hipAxis, skeleton.hipHalfWidthPx);

  // Spine and shoulder girdle.
  const spine: DirTriple = {
    m: boneDirection(em, PELVIS_JOINT, CHEST_JOINT),
    e: boneDirection(ee, PELVIS_JOINT, CHEST_JOINT),
    b: null,
  };
  spine.b = blendDirection(spine.m, spine.e, strength) ?? { x: 0, y: -1, z: 0 };
  const chest = add(pelvis, spine.b, skeleton.spineLengthPx);
  out[CHEST_JOINT] = chest;
  const shoulderAxis = worldDir(L.leftShoulder, L.rightShoulder) ?? hipAxis;
  out[L.leftShoulder] = add(chest, shoulderAxis, -skeleton.shoulderHalfWidthPx);
  out[L.rightShoulder] = add(chest, shoulderAxis, skeleton.shoulderHalfWidthPx);

  // Serial chains (legs, arms, head) in FK order, each bone blended
  // relative to the bone that positioned its parent joint (chain roots —
  // thighs, upper arms, neck — hang off the spine).
  const parentContext = new Array<DirTriple | undefined>(EXTENDED_JOINT_COUNT);
  for (const joint of [
    L.leftHip,
    L.rightHip,
    L.leftShoulder,
    L.rightShoulder,
    CHEST_JOINT,
  ]) {
    parentContext[joint] = spine;
  }
  for (let b = 0; b < CHAIN_BONES.length; b++) {
    const bone = CHAIN_BONES[b]!;
    const parentPos = out[bone.parent]!;
    const len = skeleton.chainLengthsPx[b]!;
    const triple: DirTriple = {
      m: boneDirection(em, bone.parent, bone.child),
      e: boneDirection(ee, bone.parent, bone.child),
      b: null,
    };
    if (len > 0) {
      const ref = parentContext[bone.parent];
      triple.b =
        ref !== undefined
          ? blendChainDirection(ref, triple.m, triple.e, strength)
          : blendDirection(triple.m, triple.e, strength);
    }
    out[bone.child] =
      triple.b === null ? { ...parentPos } : add(parentPos, triple.b, len);
    parentContext[bone.child] = triple;
  }

  const keypoints: Keypoint[] = new Array(POSE_LANDMARK_COUNT);
  for (let i = 0; i < POSE_LANDMARK_COUNT; i++) {
    const p = out[i]!;
    keypoints[i] = {
      x: p.x,
      y: p.y,
      z: p.z,
      visibility: measured.keypoints[i]!.visibility,
    };
  }
  return {
    frameIndex: measured.frameIndex,
    timestampMs: measured.timestampMs,
    keypoints,
  };
}

/**
 * Morph the measured motion toward the expert reference track at the given
 * correction strength (clamped to 0-1).
 */
export function morphMotion(
  measured: PoseFrame[],
  referenceTrack: PoseKeyframe[],
  skeleton: DummySkeleton,
  strength: number,
): MorphedMotion {
  if (measured.length === 0) {
    throw new Error('morphMotion needs at least one measured frame');
  }
  const s = Math.min(1, Math.max(0, strength));

  // 1. DTW-align the user's angle curves to the sampled expert track.
  const estimator = new FakePoseEstimator(referenceTrack);
  const sorted = [...referenceTrack].sort(
    (a, b) => a.timestampMs - b.timestampMs,
  );
  const t0 = sorted[0]!.timestampMs;
  const t1 = sorted[sorted.length - 1]!.timestampMs;
  const gridSize = Math.max(2, Math.min(REFERENCE_SAMPLES, 4 * sorted.length + 4));
  const referenceTimestampsMs: number[] = [];
  const referenceFeatures: number[][] = [];
  for (let i = 0; i < gridSize; i++) {
    const t = t0 + ((t1 - t0) * i) / (gridSize - 1);
    referenceTimestampsMs.push(t);
    referenceFeatures.push(
      angleFeature({
        frameIndex: i,
        timestampMs: t,
        keypoints: estimator.keypointsAt(t),
      }),
    );
  }
  const dtw = dtwAlign(measured.map(angleFeature), referenceFeatures);
  const mappedReferenceMs = dtw.map.map((j) => referenceTimestampsMs[j]!);

  // 2 + 3. Blend directions and rebuild the skeleton per frame.
  const frames: PoseFrame[] = [];
  const targetFrames: PoseFrame[] = [];
  for (let i = 0; i < measured.length; i++) {
    const expertKeypoints = estimator.keypointsAt(mappedReferenceMs[i]!);
    frames.push(reconstructFrame(measured[i]!, expertKeypoints, skeleton, s));
    targetFrames.push(reconstructFrame(measured[i]!, expertKeypoints, skeleton, 1));
  }

  return {
    frames,
    targetFrames,
    alignment: { dtw, referenceTimestampsMs, mappedReferenceMs },
    strength: s,
  };
}

/**
 * The measured frame the alignment maps closest to the expert track's key
 * event (contact/release) timestamp.
 */
export function contactFrameIndex(
  motion: MorphedMotion,
  contactTimestampMs: number,
): number {
  let best = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < motion.alignment.mappedReferenceMs.length; i++) {
    const delta = Math.abs(
      motion.alignment.mappedReferenceMs[i]! - contactTimestampMs,
    );
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return best;
}
