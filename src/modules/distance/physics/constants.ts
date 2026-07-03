/**
 * Physical constants and aerodynamic coefficient models for golf ball flight.
 *
 * Research notes: a constant drag coefficient is a poor model for a golf ball
 * because typical ball speeds straddle the drag crisis (Re ~ 1.8e5 for a
 * dimpled ball). We therefore use a table-driven C_D(v) with linear
 * interpolation, and a Magnus lift coefficient C_L derived from the spin
 * ratio S = omega*r / v via a clamped Bearman–Harvey-style quadratic fit.
 */

/** Golf ball mass, kg (USGA maximum 45.93 g). */
export const BALL_MASS_KG = 0.04593;

/** Golf ball diameter, m (USGA minimum 42.67 mm). */
export const BALL_DIAMETER_M = 0.04267;

/** Golf ball radius, m. */
export const BALL_RADIUS_M = BALL_DIAMETER_M / 2;

/** Ball cross-sectional (frontal) area, m^2. */
export const BALL_AREA_M2 = Math.PI * BALL_RADIUS_M * BALL_RADIUS_M;

/** Sea-level standard air density, kg/m^3. */
export const AIR_DENSITY_KG_M3 = 1.225;

/** Gravitational acceleration, m/s^2. */
export const GRAVITY_MS2 = 9.80665;

/**
 * Spin decay rate, fraction per second (~4%/s): d(omega)/dt = -k * omega.
 */
export const SPIN_DECAY_PER_S = 0.04;

// ---------------------------------------------------------------------------
// Unit conversions
// ---------------------------------------------------------------------------

export const MPH_TO_MPS = 0.44704;
export const MPS_TO_MPH = 1 / MPH_TO_MPS;
export const M_TO_YARDS = 1 / 0.9144;
export const YARDS_TO_M = 0.9144;
export const M_TO_FEET = 3.280839895;
export const RPM_TO_RAD_S = (2 * Math.PI) / 60;

export function mphToMps(mph: number): number {
  return mph * MPH_TO_MPS;
}

export function mpsToMph(mps: number): number {
  return mps * MPS_TO_MPH;
}

export function metersToYards(m: number): number {
  return m * M_TO_YARDS;
}

export function yardsToMeters(yd: number): number {
  return yd * YARDS_TO_M;
}

export function metersToFeet(m: number): number {
  return m * M_TO_FEET;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Drag coefficient C_D(v)
// ---------------------------------------------------------------------------

/**
 * Table of (speed m/s, C_D) pairs spanning the post-drag-crisis regime of a
 * dimpled golf ball. The 0.21–0.25 band brackets the drag crisis near
 * Re ~ 1.8e5. Values outside the table are clamped to the end points.
 */
export const DRAG_TABLE: ReadonlyArray<readonly [number, number]> = [
  [0, 0.5], // sub-critical creep — never really reached in flight
  [10, 0.31],
  [20, 0.25],
  [30, 0.235],
  [40, 0.225],
  [55, 0.215],
  [70, 0.21],
  [90, 0.21],
];

/**
 * Spin-induced drag terms: C_D += SPIN_DRAG_LINEAR*S + SPIN_DRAG_QUAD*S^2.
 * Spinning golf balls carry a substantial drag penalty on top of the
 * speed-dependent base (Bearman & Harvey observed C_D rising strongly with
 * spin ratio); without it, high-spin wedge shots simulate 40%+ long. The
 * superlinear shape barely touches a low-spin driver (S ~ 0.08) while
 * checking wedges (S ~ 0.3+), keeping all clubs inside published amateur
 * carry bands.
 */
export const SPIN_DRAG_LINEAR = 0.25;
export const SPIN_DRAG_QUAD = 1.2;

/**
 * Piecewise-linear interpolation of the base C_D from the drag table, plus
 * an optional spin-ratio drag penalty.
 */
export function dragCoefficient(speedMs: number, spinRatioS = 0): number {
  const table = DRAG_TABLE;
  const first = table[0]!;
  const last = table[table.length - 1]!;
  let base: number;
  if (speedMs <= first[0]) {
    base = first[1];
  } else if (speedMs >= last[0]) {
    base = last[1];
  } else {
    base = last[1];
    for (let i = 1; i < table.length; i++) {
      const [v1, c1] = table[i]!;
      if (speedMs <= v1) {
        const [v0, c0] = table[i - 1]!;
        const t = (speedMs - v0) / (v1 - v0);
        base = c0 + t * (c1 - c0);
        break;
      }
    }
  }
  const s = Math.min(Math.max(spinRatioS, 0), MAX_SPIN_RATIO);
  return base + SPIN_DRAG_LINEAR * s + SPIN_DRAG_QUAD * s * s;
}

// ---------------------------------------------------------------------------
// Lift coefficient C_L(S)
// ---------------------------------------------------------------------------

/** Maximum spin ratio fed into the lift model (saturation). */
export const MAX_SPIN_RATIO = 0.35;

/** Maximum lift coefficient (saturation of the Magnus effect). */
export const MAX_LIFT_COEFFICIENT = 0.38;

/**
 * Magnus lift coefficient from spin ratio S = omega*r / v, using a clamped
 * Bearman–Harvey-style quadratic fit: C_L ~= 1.7*S - 1.9*S^2 for small S,
 * saturating near 0.38 at high spin ratios.
 */
export function liftCoefficient(spinRatio: number): number {
  const s = Math.min(Math.max(spinRatio, 0), MAX_SPIN_RATIO);
  const cl = 1.7 * s - 1.9 * s * s;
  return Math.min(Math.max(cl, 0), MAX_LIFT_COEFFICIENT);
}

/** Spin ratio S = omega * r / v from spin (rpm) and speed (m/s). */
export function spinRatio(spinRpm: number, speedMs: number): number {
  if (speedMs <= 1e-9) {
    return 0;
  }
  return (spinRpm * RPM_TO_RAD_S * BALL_RADIUS_M) / speedMs;
}
