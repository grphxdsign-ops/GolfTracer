/**
 * Pinned down-the-line (DTL) camera geometry — the shared convention both
 * DTL workstreams implement independently and must agree on numerically.
 *
 * World frame: origin at the tee ground point, Z up (m), X = horizontal
 * projection of the camera optical axis (forward, m), Y = world-left (m).
 * Camera roll = 0 (portrait handheld); yaw is absorbed by the frame
 * definition; pitch θ (deg, positive = optical axis tilted up) is the only
 * rotation.
 *
 * Camera basis in world coords:
 *   forward f̂ = (cosθ, 0, sinθ);  right r̂ = (0, −1, 0);  down d̂ = (sinθ, 0, −cosθ)
 * Camera coords of a world displacement w (m) from the camera center:
 *   x_c = −w_Y;  y_c = w_X·sinθ − w_Z·cosθ;  z_c = w_X·cosθ + w_Z·sinθ
 * Pinhole projection (px): u = cx + f·x_c/z_c, v = cy + f·y_c/z_c with
 * (cx, cy) = image center and f the focal length in px.
 *
 * Sanity: higher ball ⇒ smaller v; world-left ⇒ smaller u; pitch-up drops
 * the horizon (its v increases).
 */
import { degToRad, radToDeg } from '../physics/constants';

/** World-frame point/vector, m. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Image point, native px. */
export interface PixelPoint {
  x: number;
  y: number;
}

/** Full camera pose + intrinsics needed to project a world point. */
export interface CameraPose {
  /** Camera center in world coordinates, m. */
  cameraCenter: Vec3;
  /** Pitch, deg; positive = optical axis tilted up. */
  pitchDeg: number;
  /** Focal length, px. */
  focalPx: number;
  /** Principal point (image center), px. */
  cx: number;
  cy: number;
}

export interface ProjectedPoint {
  /** Image column, px. */
  u: number;
  /** Image row, px (down positive). */
  v: number;
  /** Depth along the optical axis, m (<= 0 means behind the camera). */
  zc: number;
}

/**
 * Project a world point (m) through the pinned pinhole convention.
 * Callers must check `zc > 0` before trusting (u, v).
 */
export function projectWorldPoint(world: Vec3, pose: CameraPose): ProjectedPoint {
  const th = degToRad(pose.pitchDeg); // rad
  const sin = Math.sin(th);
  const cos = Math.cos(th);
  // World displacement from camera center to the point, m.
  const wX = world.x - pose.cameraCenter.x;
  const wY = world.y - pose.cameraCenter.y;
  const wZ = world.z - pose.cameraCenter.z;
  // Camera coordinates, m (x right, y down, z along the optical axis).
  const xc = -wY;
  const yc = wX * sin - wZ * cos;
  const zc = wX * cos + wZ * sin;
  const safeZc = Math.abs(zc) < 1e-12 ? 1e-12 : zc;
  return {
    u: pose.cx + (pose.focalPx * xc) / safeZc,
    v: pose.cy + (pose.focalPx * yc) / safeZc,
    zc,
  };
}

/**
 * The tee point in CAMERA coordinates, m: the unit ray through the tee
 * pixel scaled by the camera-to-tee distance. Pitch-independent.
 */
function teeCam(
  teePx: PixelPoint,
  focalPx: number,
  cx: number,
  cy: number,
  dTeeM: number,
): { x: number; y: number; z: number } {
  // Cam-frame direction of the tee pixel's ray (before normalization).
  const dx = (teePx.x - cx) / focalPx;
  const dy = (teePx.y - cy) / focalPx;
  const norm = Math.hypot(dx, dy, 1);
  return {
    x: (dTeeM * dx) / norm, // m
    y: (dTeeM * dy) / norm, // m
    z: dTeeM / norm, // m
  };
}

export interface TeeRayCamera {
  /** Camera center in world coordinates (tee at origin), m. */
  cameraCenter: Vec3;
  /** Derived camera height above the tee ground plane, m. */
  cameraHeightM: number;
}

/**
 * Place the camera from the tee ray: the tee pixel (native px) plus the
 * camera-to-tee distance dTeeM (m, from the ball-diameter anchor:
 * D_tee = f·0.04267/(2·ballRadiusAtAddressPx)) fixes the tee in camera
 * coordinates; rotating by the pitch and putting the tee at the world
 * origin yields the camera center C = −R⁻¹·tee_cam and the derived camera
 * height h_c = C_Z = tee_cam.y·cosθ − tee_cam.z·sinθ.
 */
export function cameraFromTeeRay(
  teePx: PixelPoint,
  pitchDeg: number,
  focalPx: number,
  cx: number,
  cy: number,
  dTeeM: number,
): TeeRayCamera {
  const tc = teeCam(teePx, focalPx, cx, cy, dTeeM);
  const th = degToRad(pitchDeg); // rad
  const sin = Math.sin(th);
  const cos = Math.cos(th);
  // Inverse rotation: world displacement (camera -> tee), m.
  //   w_X = y_c·sinθ + z_c·cosθ;  w_Y = −x_c;  w_Z = −y_c·cosθ + z_c·sinθ
  const wX = tc.y * sin + tc.z * cos;
  const wY = -tc.x;
  const wZ = -tc.y * cos + tc.z * sin;
  return {
    cameraCenter: { x: -wX, y: -wY, z: -wZ }, // tee at origin, m
    cameraHeightM: tc.y * cos - tc.z * sin, // = C_Z, m
  };
}

/**
 * 1D closed-form solve for the pitch θ (deg) that makes the derived camera
 * height equal `targetHeightM`:
 *   h_c(θ) = A·cosθ − B·sinθ = R·cos(θ + φ),  A = tee_cam.y, B = tee_cam.z,
 *   R = hypot(A, B), φ = atan2(B, A)  ⇒  θ = ±acos(h/R) − φ.
 * Returns the in-bounds root closest to 0, or undefined when no root lies
 * within `boundsDeg`.
 */
export function solvePitchForHeight(
  teePx: PixelPoint,
  focalPx: number,
  cx: number,
  cy: number,
  dTeeM: number,
  targetHeightM: number,
  boundsDeg: [number, number] = [-20, 25],
): number | undefined {
  const tc = teeCam(teePx, focalPx, cx, cy, dTeeM);
  const amplitude = Math.hypot(tc.y, tc.z); // m
  if (amplitude < 1e-12 || Math.abs(targetHeightM) > amplitude) {
    return undefined;
  }
  const base = Math.acos(targetHeightM / amplitude); // rad, in [0, π]
  const phase = Math.atan2(tc.z, tc.y); // rad
  const roots = [radToDeg(base - phase), radToDeg(-base - phase)];
  let bestRoot: number | undefined;
  for (const root of roots) {
    if (root >= boundsDeg[0] && root <= boundsDeg[1]) {
      if (bestRoot === undefined || Math.abs(root) < Math.abs(bestRoot)) {
        bestRoot = root;
      }
    }
  }
  return bestRoot;
}

/** One post-impact track sample: flight time (s) + image position (px). */
export interface TimedPixel {
  /** Flight time since impact, s. */
  t: number;
  /** Image column, px. */
  u: number;
  /** Image row, px. */
  v: number;
}

/** Solve a symmetric 3x3 linear system M·x = b by Gaussian elimination. */
function solve3(m: number[][], b: number[]): number[] | undefined {
  const a = m.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < 3; col++) {
    // Partial pivot.
    let pivot = col;
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) {
        pivot = row;
      }
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) {
      return undefined; // singular (e.g. duplicated sample times)
    }
    const tmp = a[col]!;
    a[col] = a[pivot]!;
    a[pivot] = tmp;
    for (let row = 0; row < 3; row++) {
      if (row === col) {
        continue;
      }
      const factor = a[row]![col]! / a[col]![col]!;
      for (let k = col; k < 4; k++) {
        a[row]![k] = a[row]![k]! - factor * a[col]![k]!;
      }
    }
  }
  return [0, 1, 2].map((i) => a[i]![3]! / a[i]![i]!);
}

/**
 * Quadratic-in-t back-extrapolation of the first ≤6 post-impact samples to
 * t = 0 — the launch (tee) pixel estimate used when the user supplied no
 * ball tap. Fits u(t) = a + b·t + c·t² (and likewise v) by least squares
 * and evaluates at t = 0; degrades to linear/first-point for tiny inputs.
 */
export function teePointFromTrack(samples: TimedPixel[]): PixelPoint {
  const used = samples.slice(0, 6);
  const n = used.length;
  if (n === 0) {
    return { x: 0, y: 0 };
  }
  const first = used[0]!;
  if (n === 1) {
    return { x: first.u, y: first.v };
  }
  const linear = (): PixelPoint => {
    const last = used[n - 1]!;
    const dt = last.t - first.t; // s
    if (Math.abs(dt) < 1e-9) {
      return { x: first.u, y: first.v };
    }
    return {
      x: first.u - ((last.u - first.u) / dt) * first.t,
      y: first.v - ((last.v - first.v) / dt) * first.t,
    };
  };
  if (n === 2) {
    return linear();
  }
  // Normal equations for the basis (1, t, t²).
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let bu0 = 0;
  let bu1 = 0;
  let bu2 = 0;
  let bv0 = 0;
  let bv1 = 0;
  let bv2 = 0;
  for (const s of used) {
    const t1 = s.t;
    const t2 = t1 * t1;
    s0 += 1;
    s1 += t1;
    s2 += t2;
    s3 += t2 * t1;
    s4 += t2 * t2;
    bu0 += s.u;
    bu1 += s.u * t1;
    bu2 += s.u * t2;
    bv0 += s.v;
    bv1 += s.v * t1;
    bv2 += s.v * t2;
  }
  const m = [
    [s0, s1, s2],
    [s1, s2, s3],
    [s2, s3, s4],
  ];
  const cu = solve3(m, [bu0, bu1, bu2]);
  const cv = solve3(
    [
      [s0, s1, s2],
      [s1, s2, s3],
      [s2, s3, s4],
    ],
    [bv0, bv1, bv2],
  );
  if (!cu || !cv) {
    return linear();
  }
  // u(0) / v(0) are the constant coefficients.
  return { x: cu[0]!, y: cv[0]! };
}
