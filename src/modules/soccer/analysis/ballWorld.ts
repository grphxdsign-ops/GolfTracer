/**
 * Per-frame monocular 3D ball positioning in a goal-anchored metric world
 * frame (the measure_plan X/Y/Z + "ball distance to goal line" readouts).
 *
 * Two classic monocular cues are fused:
 *  1. Range: the ball's apparent pixel diameter (BALL PX 57 → 24 as it
 *     recedes) against the known ball size gives camera-to-ball range
 *     (W1 engine/monocular).
 *  2. Direction + world frame: the four detected goal corners against the
 *     SOCCER_GOAL anchor template give the image→goal-plane homography (W1
 *     engine/anchorHomography), which — with pinhole intrinsics — decomposes
 *     into the full camera pose relative to the goal (plane-based pose,
 *     H ∝ K [r1 r2 t] for the goal plane).
 *
 * World frame (the anchor template's plane coordinates extended off-plane):
 * origin at the bottom of the LEFT post, x across the goal mouth toward the
 * right post, y up, z pointing from the goal plane toward the field — so
 * the ball's distance to the goal line is its z.
 */
import type { BallObservation } from '../../../types/tracking';
import type { WorldAnchorTemplate } from '../../sports/engine/sportProfile';
import {
  solveAnchorHomography,
  type Point2,
} from '../../sports/engine/anchorHomography';
import { distanceFromApparentDiameterM } from '../../sports/engine/monocular';
import type { GoalDetection } from '../goal/GoalDetector';
import { cornersById } from '../goal/GoalDetector';

export interface CameraIntrinsics {
  focalPx: number;
  /** Principal point, image pixels. */
  cx: number;
  cy: number;
}

/** World→camera rigid transform: p_cam = R · p_world + t. */
export interface CameraPose {
  /** Row-major 3x3 rotation. */
  R: number[][];
  t: { x: number; y: number; z: number };
}

export interface BallWorldPoint {
  frameIndex: number;
  timestampMs: number;
  /** Across the goal mouth from the left post, m. */
  xM: number;
  /** Height above the ground, m. */
  yM: number;
  /** Out from the goal plane toward the field, m. */
  zM: number;
  /** z clamped at 0 once the ball is behind the goal line. */
  distanceToGoalLineM: number;
  /** Camera-to-ball range from the apparent diameter. */
  rangeM: number;
  /** Apparent ball diameter driving the range estimate. */
  ballDiameterPx: number;
}

type Vec3 = { x: number; y: number; z: number };

type Matrix3 = number[][];

function inverse3(m: Matrix3): Matrix3 {
  const a = m[0]![0]!,
    b = m[0]![1]!,
    c = m[0]![2]!;
  const d = m[1]![0]!,
    e = m[1]![1]!,
    f = m[1]![2]!;
  const g = m[2]![0]!,
    h = m[2]![1]!,
    i = m[2]![2]!;
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const det = a * A + d * B + g * C;
  if (Math.abs(det) < 1e-15) {
    throw new Error('Goal homography is not invertible');
  }
  return [
    [A / det, B / det, C / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

function normalize(v: Vec3): Vec3 {
  const n = Math.hypot(v.x, v.y, v.z);
  if (n < 1e-12) throw new Error('Cannot normalize zero vector');
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Detected goal-corner image points ordered to match the SOCCER_GOAL anchor
 * template's points: post-bottom-left, post-bottom-right, crossbar-right,
 * crossbar-left.
 */
export function goalImagePoints(detection: GoalDetection): Point2[] {
  const corners = cornersById(detection);
  return [
    { x: corners.bottomLeft.cx, y: corners.bottomLeft.cy },
    { x: corners.bottomRight.cx, y: corners.bottomRight.cy },
    { x: corners.topRight.cx, y: corners.topRight.cy },
    { x: corners.topLeft.cx, y: corners.topLeft.cy },
  ];
}

/**
 * Plane-based camera pose from the goal homography. With the goal plane as
 * world z = 0, the world→image homography factors as H_wi ∝ K [r1 r2 t];
 * K⁻¹·H_wi is normalized by the mean rotation-column length, the sign is
 * fixed so the goal sits in front of the camera, and r3 = r1 × r2 is
 * re-orthonormalized.
 */
export function solveCameraPoseFromGoal(
  detection: GoalDetection,
  template: WorldAnchorTemplate,
  intrinsics: CameraIntrinsics,
): CameraPose {
  const anchor = solveAnchorHomography(goalImagePoints(detection), template);
  const hWorldToImage = inverse3(anchor.H);
  const { focalPx: f, cx, cy } = intrinsics;

  // B = K^-1 * H_wi, columns b1 b2 b3.
  const col = (j: number): Vec3 => {
    const hx = hWorldToImage[0]![j]!;
    const hy = hWorldToImage[1]![j]!;
    const hw = hWorldToImage[2]![j]!;
    return {
      x: (hx - cx * hw) / f,
      y: (hy - cy * hw) / f,
      z: hw,
    };
  };
  const b1 = col(0);
  const b2 = col(1);
  const b3 = col(2);

  const n1 = Math.hypot(b1.x, b1.y, b1.z);
  const n2 = Math.hypot(b2.x, b2.y, b2.z);
  let lambda = 2 / (n1 + n2);
  // The world origin (left post) must be in front of the camera: t.z > 0.
  if (b3.z * lambda < 0) lambda = -lambda;

  const r1 = normalize({ x: b1.x * lambda, y: b1.y * lambda, z: b1.z * lambda });
  const r2raw = { x: b2.x * lambda, y: b2.y * lambda, z: b2.z * lambda };
  const r3 = normalize(cross(r1, r2raw));
  const r2 = cross(r3, r1);
  const t = { x: b3.x * lambda, y: b3.y * lambda, z: b3.z * lambda };

  return {
    R: [
      [r1.x, r2.x, r3.x],
      [r1.y, r2.y, r3.y],
      [r1.z, r2.z, r3.z],
    ],
    t,
  };
}

/** p_world = Rᵀ · (p_cam − t). */
function cameraToWorld(pose: CameraPose, p: Vec3): Vec3 {
  const dx = p.x - pose.t.x;
  const dy = p.y - pose.t.y;
  const dz = p.z - pose.t.z;
  const R = pose.R;
  return {
    x: R[0]![0]! * dx + R[1]![0]! * dy + R[2]![0]! * dz,
    y: R[0]![1]! * dx + R[1]![1]! * dy + R[2]![1]! * dz,
    z: R[0]![2]! * dx + R[1]![2]! * dy + R[2]![2]! * dz,
  };
}

/**
 * Per-frame 3D ball positions: apparent-diameter range along the pixel ray,
 * mapped into the goal world frame through the camera pose.
 */
export function ballWorldFromObservations(
  observations: BallObservation[],
  pose: CameraPose,
  intrinsics: CameraIntrinsics,
  ballDiameterM: number,
): BallWorldPoint[] {
  const { focalPx: f, cx, cy } = intrinsics;
  const out: BallWorldPoint[] = [];
  for (const o of observations) {
    if (o.radiusPx <= 0) continue;
    const diameterPx = 2 * o.radiusPx;
    const range = distanceFromApparentDiameterM(f, diameterPx, ballDiameterM);
    const ray = normalize({ x: (o.cx - cx) / f, y: (o.cy - cy) / f, z: 1 });
    const pCam: Vec3 = { x: ray.x * range, y: ray.y * range, z: ray.z * range };
    const pWorld = cameraToWorld(pose, pCam);
    out.push({
      frameIndex: o.frameIndex,
      timestampMs: o.timestampMs,
      xM: pWorld.x,
      yM: pWorld.y,
      zM: pWorld.z,
      distanceToGoalLineM: Math.max(0, pWorld.z),
      rangeM: range,
      ballDiameterPx: diameterPx,
    });
  }
  return out;
}
