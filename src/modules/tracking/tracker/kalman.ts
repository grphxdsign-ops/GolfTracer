/**
 * 6-state constant-acceleration Kalman filter for pixel-space ball tracking.
 *
 * State x = [x, y, vx, vy, ax, ay] (positions px, velocities px/s,
 * accelerations px/s²). Measurements are pixel positions [x, y]. Supports
 * variable frame intervals (dt in seconds), a white-noise-jerk process model
 * with tunable intensity, and exposes the innovation covariance so the
 * tracker can gate candidates by Mahalanobis distance and size its search
 * ROI. All 6×6 matrix ops are implemented inline — no external math library.
 */

type Mat = number[][];

const N = 6;

function zeros(rows: number, cols: number): Mat {
  const m: Mat = [];
  for (let i = 0; i < rows; i++) {
    m.push(new Array<number>(cols).fill(0));
  }
  return m;
}

function identity(n: number): Mat {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m[i]![i] = 1;
  return m;
}

function matMul(a: Mat, b: Mat): Mat {
  const rows = a.length;
  const inner = b.length;
  const cols = b[0]!.length;
  const out = zeros(rows, cols);
  for (let i = 0; i < rows; i++) {
    const ai = a[i]!;
    const oi = out[i]!;
    for (let k = 0; k < inner; k++) {
      const aik = ai[k]!;
      if (aik === 0) continue;
      const bk = b[k]!;
      for (let j = 0; j < cols; j++) {
        oi[j]! += aik * bk[j]!;
      }
    }
  }
  return out;
}

function matAdd(a: Mat, b: Mat): Mat {
  const out = zeros(a.length, a[0]!.length);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a[0]!.length; j++) {
      out[i]![j] = a[i]![j]! + b[i]![j]!;
    }
  }
  return out;
}

function transpose(a: Mat): Mat {
  const out = zeros(a[0]!.length, a.length);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a[0]!.length; j++) {
      out[j]![i] = a[i]![j]!;
    }
  }
  return out;
}

/** Inverse of a 2×2 matrix. */
function inv2(m: Mat): Mat {
  const a = m[0]![0]!;
  const b = m[0]![1]!;
  const c = m[1]![0]!;
  const d = m[1]![1]!;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) {
    throw new Error('kalman: singular innovation covariance');
  }
  const inv = 1 / det;
  return [
    [d * inv, -b * inv],
    [-c * inv, a * inv],
  ];
}

export interface KalmanInit {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  ax?: number;
  ay?: number;
}

export interface KalmanOptions {
  /** White-noise jerk intensity, px²/s⁵-ish. Higher = trusts motion model less. */
  processNoise?: number;
  /** Measurement noise std in px. */
  measurementNoise?: number;
  initialPositionVar?: number;
  initialVelocityVar?: number;
  initialAccelVar?: number;
}

export interface Innovation {
  /** Residual z - Hx. */
  yx: number;
  yy: number;
  /** 2×2 innovation covariance S = HPHᵀ + R. */
  s: Mat;
  /** Squared Mahalanobis distance yᵀ S⁻¹ y. */
  mahalanobis2: number;
}

export class ConstantAccelerationKF {
  /** State vector [x, y, vx, vy, ax, ay]. */
  state: number[];
  /** State covariance 6×6. */
  P: Mat;
  private readonly q: number;
  private readonly r2: number;

  constructor(init: KalmanInit, options: KalmanOptions = {}) {
    this.q = options.processNoise ?? 40;
    const r = options.measurementNoise ?? 2;
    this.r2 = r * r;
    this.state = [
      init.x,
      init.y,
      init.vx ?? 0,
      init.vy ?? 0,
      init.ax ?? 0,
      init.ay ?? 0,
    ];
    const pVar = options.initialPositionVar ?? this.r2 * 4;
    const vVar = options.initialVelocityVar ?? 4e6;
    const aVar = options.initialAccelVar ?? 4e8;
    this.P = zeros(N, N);
    this.P[0]![0] = pVar;
    this.P[1]![1] = pVar;
    this.P[2]![2] = vVar;
    this.P[3]![3] = vVar;
    this.P[4]![4] = aVar;
    this.P[5]![5] = aVar;
  }

  get x(): number {
    return this.state[0]!;
  }
  get y(): number {
    return this.state[1]!;
  }
  get vx(): number {
    return this.state[2]!;
  }
  get vy(): number {
    return this.state[3]!;
  }
  get ax(): number {
    return this.state[4]!;
  }
  get ay(): number {
    return this.state[5]!;
  }

  /** Propagate the state dt seconds forward. */
  predict(dtSeconds: number): void {
    const dt = dtSeconds;
    const dt2 = 0.5 * dt * dt;
    const F: Mat = [
      [1, 0, dt, 0, dt2, 0],
      [0, 1, 0, dt, 0, dt2],
      [0, 0, 1, 0, dt, 0],
      [0, 0, 0, 1, 0, dt],
      [0, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0, 1],
    ];
    // x = F x
    const s = this.state;
    this.state = [
      s[0]! + dt * s[2]! + dt2 * s[4]!,
      s[1]! + dt * s[3]! + dt2 * s[5]!,
      s[2]! + dt * s[4]!,
      s[3]! + dt * s[5]!,
      s[4]!,
      s[5]!,
    ];
    // Q from white-noise jerk: per-axis G = [dt³/6, dt²/2, dt]ᵀ, Q = q·GGᵀ.
    const g0 = (dt * dt * dt) / 6;
    const g1 = dt2;
    const g2 = dt;
    const g = [g0, g1, g2];
    const Q = zeros(N, N);
    for (let axis = 0; axis < 2; axis++) {
      // State indices for this axis: position, velocity, acceleration.
      const idx = [axis, axis + 2, axis + 4];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          Q[idx[i]!]![idx[j]!] = this.q * g[i]! * g[j]!;
        }
      }
    }
    this.P = matAdd(matMul(matMul(F, this.P), transpose(F)), Q);
  }

  /** Innovation statistics for a candidate measurement (after predict). */
  innovation(zx: number, zy: number): Innovation {
    const yx = zx - this.state[0]!;
    const yy = zy - this.state[1]!;
    const s: Mat = [
      [this.P[0]![0]! + this.r2, this.P[0]![1]!],
      [this.P[1]![0]!, this.P[1]![1]! + this.r2],
    ];
    const si = inv2(s);
    const mahalanobis2 =
      yx * (si[0]![0]! * yx + si[0]![1]! * yy) +
      yy * (si[1]![0]! * yx + si[1]![1]! * yy);
    return { yx, yy, s, mahalanobis2 };
  }

  /**
   * 1-sigma positional uncertainty of the innovation — used by the tracker to
   * scale its search ROI.
   */
  positionGateSigma(): number {
    return Math.sqrt(
      Math.max(this.P[0]![0]!, this.P[1]![1]!) + this.r2,
    );
  }

  /** Measurement update with a pixel position. */
  update(zx: number, zy: number): void {
    const { yx, yy, s } = this.innovation(zx, zy);
    const si = inv2(s);
    // K = P Hᵀ S⁻¹ where H picks rows 0,1 → P Hᵀ is the first two columns of P.
    const K = zeros(N, 2);
    for (let i = 0; i < N; i++) {
      const p0 = this.P[i]![0]!;
      const p1 = this.P[i]![1]!;
      K[i]![0] = p0 * si[0]![0]! + p1 * si[1]![0]!;
      K[i]![1] = p0 * si[0]![1]! + p1 * si[1]![1]!;
    }
    for (let i = 0; i < N; i++) {
      this.state[i] = this.state[i]! + K[i]![0]! * yx + K[i]![1]! * yy;
    }
    // P = (I - K H) P
    const KH = zeros(N, N);
    for (let i = 0; i < N; i++) {
      KH[i]![0] = K[i]![0]!;
      KH[i]![1] = K[i]![1]!;
    }
    const IKH = identity(N);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        IKH[i]![j] = IKH[i]![j]! - KH[i]![j]!;
      }
    }
    this.P = matMul(IKH, this.P);
    // Symmetrize for numerical stability.
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const v = 0.5 * (this.P[i]![j]! + this.P[j]![i]!);
        this.P[i]![j] = v;
        this.P[j]![i] = v;
      }
    }
  }
}
