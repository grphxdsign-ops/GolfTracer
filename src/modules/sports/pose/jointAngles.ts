/**
 * Joint-angle utilities — pure geometry over pose keypoints, powering the
 * "Pose at Contact" joint-angle table (shoulder-to-hip, hip-to-knee,
 * knee-to-ankle, both sides) and angular-velocity coaching stats.
 */
import {
  POSE_LANDMARKS,
  type Keypoint,
  type PoseFrame,
} from './PoseAdapter';

/** A point with optional depth; z defaults to 0 when absent. */
export interface AnglePoint {
  x: number;
  y: number;
  z?: number;
}

/**
 * Interior angle at vertex `b` of the triangle a-b-c, in degrees [0, 180].
 * Uses z when supplied (BlazePose world landmarks); returns 0 when either
 * segment is degenerate (zero length).
 */
export function jointAngleDeg(
  a: AnglePoint,
  b: AnglePoint,
  c: AnglePoint,
): number {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const baz = (a.z ?? 0) - (b.z ?? 0);
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const bcz = (c.z ?? 0) - (b.z ?? 0);

  const na = Math.hypot(bax, bay, baz);
  const nc = Math.hypot(bcx, bcy, bcz);
  if (na < 1e-9 || nc < 1e-9) {
    return 0;
  }
  const cos = (bax * bcx + bay * bcy + baz * bcz) / (na * nc);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

export interface SideJointAngles {
  /** Trunk-thigh angle at the hip (shoulder-hip-knee), deg. */
  shoulderHip: number;
  /** Knee flexion angle (hip-knee-ankle), deg — 180 = straight leg. */
  hipKnee: number;
  /** Ankle angle (knee-ankle-foot index), deg. */
  kneeAnkle: number;
}

export interface JointAngleTable {
  left: SideJointAngles;
  right: SideJointAngles;
}

/**
 * The freeze-frame joint-angle table for a pose: shoulder-to-hip,
 * hip-to-knee and knee-to-ankle chain angles on both sides.
 */
export function computeJointAngleTable(pose: PoseFrame): JointAngleTable {
  const kp = (index: number): Keypoint => {
    const point = pose.keypoints[index];
    if (point === undefined) {
      throw new Error(`Pose frame is missing keypoint ${index}`);
    }
    return point;
  };
  const L = POSE_LANDMARKS;
  const side = (
    shoulder: number,
    hip: number,
    knee: number,
    ankle: number,
    foot: number,
  ): SideJointAngles => ({
    shoulderHip: jointAngleDeg(kp(shoulder), kp(hip), kp(knee)),
    hipKnee: jointAngleDeg(kp(hip), kp(knee), kp(ankle)),
    kneeAnkle: jointAngleDeg(kp(knee), kp(ankle), kp(foot)),
  });
  return {
    left: side(
      L.leftShoulder,
      L.leftHip,
      L.leftKnee,
      L.leftAnkle,
      L.leftFootIndex,
    ),
    right: side(
      L.rightShoulder,
      L.rightHip,
      L.rightKnee,
      L.rightAnkle,
      L.rightFootIndex,
    ),
  };
}

export interface AngleSample {
  timestampMs: number;
  angleDeg: number;
}

/**
 * Per-sample angular velocity (deg/s) of an angle series by finite
 * differences: central differences at interior samples, one-sided at the
 * ends. Returns one value per input sample ([0] for a single sample).
 * Samples must be strictly increasing in time.
 */
export function angularVelocityDegPerS(series: AngleSample[]): number[] {
  const n = series.length;
  if (n === 0) {
    return [];
  }
  if (n === 1) {
    return [0];
  }
  const slope = (a: AngleSample, b: AngleSample): number => {
    const dtMs = b.timestampMs - a.timestampMs;
    if (dtMs <= 0) {
      throw new Error('angularVelocityDegPerS needs strictly increasing timestamps');
    }
    return ((b.angleDeg - a.angleDeg) / dtMs) * 1000;
  };
  const out = new Array<number>(n);
  out[0] = slope(series[0]!, series[1]!);
  out[n - 1] = slope(series[n - 2]!, series[n - 1]!);
  for (let i = 1; i < n - 1; i++) {
    out[i] = slope(series[i - 1]!, series[i + 1]!);
  }
  return out;
}
