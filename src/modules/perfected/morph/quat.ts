/**
 * Minimal quaternion helpers for motion morphing: build the rotation
 * carrying one unit vector onto another, slerp it toward identity by the
 * correction strength, and apply it. Kept tiny and dependency-free — the
 * only consumer is morphMotion's per-bone direction blend.
 */
import type { Vec3 } from '../../sports/engine/ballFlight';

export interface Quat {
  w: number;
  x: number;
  y: number;
  z: number;
}

export const QUAT_IDENTITY: Quat = { w: 1, x: 0, y: 0, z: 0 };

const normalize = (q: Quat): Quat => {
  const n = Math.hypot(q.w, q.x, q.y, q.z);
  if (n < 1e-12) {
    return { ...QUAT_IDENTITY };
  }
  return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
};

/**
 * The rotation taking unit vector `from` onto unit vector `to` along the
 * shorter great-circle arc. Antipodal inputs rotate 180° about a stable
 * axis perpendicular to `from`.
 */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  const dot = from.x * to.x + from.y * to.y + from.z * to.z;
  if (dot > 1 - 1e-12) {
    return { ...QUAT_IDENTITY };
  }
  if (dot < -1 + 1e-12) {
    // 180°: any axis perpendicular to `from` works; pick a stable one.
    const ref: Vec3 =
      Math.abs(from.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const ax = from.y * ref.z - from.z * ref.y;
    const ay = from.z * ref.x - from.x * ref.z;
    const az = from.x * ref.y - from.y * ref.x;
    const n = Math.hypot(ax, ay, az);
    return { w: 0, x: ax / n, y: ay / n, z: az / n };
  }
  const cx = from.y * to.z - from.z * to.y;
  const cy = from.z * to.x - from.x * to.z;
  const cz = from.x * to.y - from.y * to.x;
  return normalize({ w: 1 + dot, x: cx, y: cy, z: cz });
}

/** Spherical linear interpolation between two unit quaternions. */
export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let cos = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  let bw = b.w;
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  if (cos < 0) {
    cos = -cos;
    bw = -bw;
    bx = -bx;
    by = -by;
    bz = -bz;
  }
  if (cos > 1 - 1e-9) {
    // Nearly identical: normalized lerp avoids the 0/0 in the slerp weights.
    return normalize({
      w: a.w + (bw - a.w) * t,
      x: a.x + (bx - a.x) * t,
      y: a.y + (by - a.y) * t,
      z: a.z + (bz - a.z) * t,
    });
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, cos)));
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return {
    w: wa * a.w + wb * bw,
    x: wa * a.x + wb * bx,
    y: wa * a.y + wb * by,
    z: wa * a.z + wb * bz,
  };
}

/** Rotate a vector by a unit quaternion (q v q*). */
export function quatRotate(q: Quat, v: Vec3): Vec3 {
  // t = 2 q_vec x v; v' = v + w t + q_vec x t
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}
