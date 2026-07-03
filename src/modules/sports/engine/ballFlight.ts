/**
 * General 3D ball flight simulator, parameterized by a BallSpec.
 *
 * Structurally mirrors the golf module's RK4 integrator (2 ms steps,
 * F = F_drag + F_magnus + F_gravity, table-driven C_D plus a clamped
 * quadratic C_L(spin ratio)), but generalized to three dimensions with a
 * launch azimuth and a tiltable spin axis so sidespin curve (banana kicks,
 * slice serves) falls out of the same Magnus term. The golf simulator in
 * src/modules/distance/physics stays untouched; this one takes every
 * ball-specific number from the supplied BallSpec.
 *
 * World frame: x downrange, y up, z lateral (right-handed, z = x cross y).
 * The ground is the y = 0 plane; launches may start above it.
 */
import type { BallSpec } from './sportProfile';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BallLaunch {
  /** Launch speed, m/s. */
  speedMps: number;
  /** Elevation above horizontal, deg (may be negative, e.g. a flat serve). */
  launchAngleDeg: number;
  /** Horizontal aim, deg: 0 = straight downrange (+x), positive toward +z. */
  azimuthDeg?: number;
  /** Total spin magnitude, rpm (decays exponentially in flight). */
  spinRpm?: number;
  /**
   * Spin-axis tilt about the launch velocity, deg: 0 = pure backspin (lift
   * up), 180 = pure topspin (lift down), +/-90 = pure sidespin.
   */
  spinAxisDeg?: number;
  /** Launch position, m (default origin, on the ground). */
  positionM?: Vec3;
}

export interface FlightEnvironment {
  /** Air density override, kg/m^3 (default sea level 1.225). */
  airDensityKgM3?: number;
  /**
   * Disable aerodynamics entirely (C_D = C_L = 0). Used to validate the
   * integrator against the analytic vacuum parabola.
   */
  vacuum?: boolean;
}

export interface BallFlightSample {
  /** Time since launch, s. */
  t: number;
  positionM: Vec3;
  velocityMps: Vec3;
  speedMps: number;
}

export interface BallFlightResult {
  /** Sampled every ~10 ms, plus the exact landing sample. */
  trajectory: BallFlightSample[];
  /** Horizontal distance from launch to landing, m. */
  rangeM: number;
  /** Signed lateral offset (z) at landing relative to launch, m. */
  lateralM: number;
  /** Peak height above the ground, m. */
  apexM: number;
  flightTimeS: number;
  landingPositionM: Vec3;
  landingSpeedMps: number;
  /** Descent angle below horizontal at landing, deg (positive). */
  landingAngleDeg: number;
}

export const AIR_DENSITY_KG_M3 = 1.225;
export const GRAVITY_MS2 = 9.80665;
const RPM_TO_RAD_S = (2 * Math.PI) / 60;

/** Integration time step, s. */
const DT = 0.002;
/** Trajectory sampling interval in integration steps (10 ms). */
const SAMPLE_EVERY = 5;
/** Hard cap on simulated flight time, s. */
const MAX_FLIGHT_S = 20;

const degToRad = (deg: number): number => (deg * Math.PI) / 180;
const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Piecewise-linear interpolation of C_D from the spec's drag table. */
export function dragCoefficientFromTable(
  table: [number, number][],
  speedMps: number,
): number {
  const first = table[0]!;
  const last = table[table.length - 1]!;
  if (speedMps <= first[0]) {
    return first[1];
  }
  if (speedMps >= last[0]) {
    return last[1];
  }
  for (let i = 1; i < table.length; i++) {
    const [v1, c1] = table[i]!;
    if (speedMps <= v1) {
      const [v0, c0] = table[i - 1]!;
      const t = (speedMps - v0) / (v1 - v0);
      return c0 + t * (c1 - c0);
    }
  }
  return last[1];
}

/** Clamped quadratic Magnus lift coefficient from the spin ratio. */
export function liftCoefficientFromSpec(spec: BallSpec, spinRatio: number): number {
  const { maxSpinRatio, maxCl, clLinear, clQuad } = spec.magnus;
  const s = Math.min(Math.max(spinRatio, 0), maxSpinRatio);
  const cl = clLinear * s + clQuad * s * s;
  return Math.min(Math.max(cl, 0), maxCl);
}

interface State {
  p: Vec3;
  v: Vec3;
  /** Spin magnitude, rpm (decays over time). */
  spinRpm: number;
}

type Derivative = State;

interface SimParams {
  spec: BallSpec;
  rho: number;
  vacuum: boolean;
  /** Fixed world-frame spin axis unit vector (zero when spinless). */
  spinAxis: Vec3;
}

function derivative(s: State, params: SimParams): Derivative {
  const { spec, rho, vacuum, spinAxis } = params;
  const v = Math.hypot(s.v.x, s.v.y, s.v.z);
  let ax = 0;
  let ay = -GRAVITY_MS2;
  let az = 0;

  if (!vacuum && v > 1e-9) {
    const q = 0.5 * rho * spec.areaM2 * v * v; // dynamic pressure * area
    const ux = s.v.x / v;
    const uy = s.v.y / v;
    const uz = s.v.z / v;

    const omega = Math.max(s.spinRpm, 0) * RPM_TO_RAD_S;
    const spinRatio = (omega * spec.diameterM) / 2 / v;

    // Drag opposes velocity.
    const cd = dragCoefficientFromTable(spec.dragTable, v);
    const fd = q * cd;
    ax -= (fd * ux) / spec.massKg;
    ay -= (fd * uy) / spec.massKg;
    az -= (fd * uz) / spec.massKg;

    // Magnus force along s_hat x v_hat (up for backspin, lateral for
    // sidespin). The axis is fixed at launch; only the magnitude decays.
    const cl = liftCoefficientFromSpec(spec, spinRatio);
    if (cl > 0) {
      const fl = q * cl;
      const lx = spinAxis.y * uz - spinAxis.z * uy;
      const ly = spinAxis.z * ux - spinAxis.x * uz;
      const lz = spinAxis.x * uy - spinAxis.y * ux;
      ax += (fl * lx) / spec.massKg;
      ay += (fl * ly) / spec.massKg;
      az += (fl * lz) / spec.massKg;
    }
  }

  return {
    p: { x: s.v.x, y: s.v.y, z: s.v.z },
    v: { x: ax, y: ay, z: az },
    spinRpm: vacuum ? 0 : -spec.magnus.spinDecayPerS * s.spinRpm,
  };
}

function advance(s: State, d: Derivative, dt: number): State {
  return {
    p: { x: s.p.x + d.p.x * dt, y: s.p.y + d.p.y * dt, z: s.p.z + d.p.z * dt },
    v: { x: s.v.x + d.v.x * dt, y: s.v.y + d.v.y * dt, z: s.v.z + d.v.z * dt },
    spinRpm: s.spinRpm + d.spinRpm * dt,
  };
}

function rk4Step(s: State, dt: number, params: SimParams): State {
  const k1 = derivative(s, params);
  const k2 = derivative(advance(s, k1, dt / 2), params);
  const k3 = derivative(advance(s, k2, dt / 2), params);
  const k4 = derivative(advance(s, k3, dt), params);
  const mix = (a: number, b: number, c: number, d: number): number =>
    (dt / 6) * (a + 2 * b + 2 * c + d);
  return {
    p: {
      x: s.p.x + mix(k1.p.x, k2.p.x, k3.p.x, k4.p.x),
      y: s.p.y + mix(k1.p.y, k2.p.y, k3.p.y, k4.p.y),
      z: s.p.z + mix(k1.p.z, k2.p.z, k3.p.z, k4.p.z),
    },
    v: {
      x: s.v.x + mix(k1.v.x, k2.v.x, k3.v.x, k4.v.x),
      y: s.v.y + mix(k1.v.y, k2.v.y, k3.v.y, k4.v.y),
      z: s.v.z + mix(k1.v.z, k2.v.z, k3.v.z, k4.v.z),
    },
    spinRpm: s.spinRpm + mix(k1.spinRpm, k2.spinRpm, k3.spinRpm, k4.spinRpm),
  };
}

/**
 * World-frame spin axis at launch: the pure-backspin axis (horizontal,
 * perpendicular to the travel direction, lift up) rotated by spinAxisDeg
 * about the launch velocity via the Rodrigues formula.
 */
function launchSpinAxis(velocity: Vec3, spinAxisDeg: number): Vec3 {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  const hMag = Math.hypot(velocity.x, velocity.z);
  if (speed < 1e-9) {
    return { x: 0, y: 0, z: 0 };
  }
  // Horizontal travel direction (fall back to +x for a vertical launch).
  const hx = hMag > 1e-9 ? velocity.x / hMag : 1;
  const hz = hMag > 1e-9 ? velocity.z / hMag : 0;
  // Backspin axis = h_hat x y_hat: for travel along +x this is +z, giving
  // Magnus lift s_hat x v_hat = +y.
  const base: Vec3 = { x: -hz, y: 0, z: hx };

  const angle = degToRad(spinAxisDeg);
  if (Math.abs(angle) < 1e-12) {
    return base;
  }
  const k: Vec3 = {
    x: velocity.x / speed,
    y: velocity.y / speed,
    z: velocity.z / speed,
  };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cross: Vec3 = {
    x: k.y * base.z - k.z * base.y,
    y: k.z * base.x - k.x * base.z,
    z: k.x * base.y - k.y * base.x,
  };
  const dot = k.x * base.x + k.y * base.y + k.z * base.z;
  return {
    x: base.x * cos + cross.x * sin + k.x * dot * (1 - cos),
    y: base.y * cos + cross.y * sin + k.y * dot * (1 - cos),
    z: base.z * cos + cross.z * sin + k.z * dot * (1 - cos),
  };
}

const toSample = (t: number, s: State): BallFlightSample => ({
  t,
  positionM: { ...s.p },
  velocityMps: { ...s.v },
  speedMps: Math.hypot(s.v.x, s.v.y, s.v.z),
});

/**
 * Simulate a full ball flight from launch until the ball hits the ground
 * (y = 0), with the landing state linearly interpolated between the last
 * two integration steps for sub-step accuracy.
 */
export function simulateBallFlight(
  launch: BallLaunch,
  spec: BallSpec,
  env?: FlightEnvironment,
): BallFlightResult {
  const rho = env?.airDensityKgM3 ?? AIR_DENSITY_KG_M3;
  const vacuum = env?.vacuum ?? false;

  const elevation = degToRad(launch.launchAngleDeg);
  const azimuth = degToRad(launch.azimuthDeg ?? 0);
  const v0 = Math.max(launch.speedMps, 0);
  const velocity: Vec3 = {
    x: v0 * Math.cos(elevation) * Math.cos(azimuth),
    y: v0 * Math.sin(elevation),
    z: v0 * Math.cos(elevation) * Math.sin(azimuth),
  };
  const start: Vec3 = launch.positionM
    ? { ...launch.positionM }
    : { x: 0, y: 0, z: 0 };

  const params: SimParams = {
    spec,
    rho,
    vacuum,
    spinAxis: launchSpinAxis(velocity, launch.spinAxisDeg ?? 0),
  };

  let state: State = {
    p: start,
    v: velocity,
    spinRpm: Math.max(launch.spinRpm ?? 0, 0),
  };

  const trajectory: BallFlightSample[] = [toSample(0, state)];
  let apexM = start.y;
  let t = 0;
  let step = 0;
  let landed = false;
  let landing: State = state;
  let flightTime = 0;

  while (t < MAX_FLIGHT_S) {
    const prev = state;
    state = rk4Step(state, DT, params);
    t += DT;
    step += 1;

    if (state.p.y > apexM) {
      apexM = state.p.y;
    }

    // Landing: crossed y = 0 while descending (skip the initial instant).
    if (state.p.y <= 0 && prev.p.y > 0) {
      const frac = prev.p.y / (prev.p.y - state.p.y);
      const lerp = (a: number, b: number): number => a + frac * (b - a);
      landing = {
        p: {
          x: lerp(prev.p.x, state.p.x),
          y: 0,
          z: lerp(prev.p.z, state.p.z),
        },
        v: {
          x: lerp(prev.v.x, state.v.x),
          y: lerp(prev.v.y, state.v.y),
          z: lerp(prev.v.z, state.v.z),
        },
        spinRpm: lerp(prev.spinRpm, state.spinRpm),
      };
      flightTime = t - DT + frac * DT;
      trajectory.push(toSample(flightTime, landing));
      landed = true;
      break;
    }

    if (step % SAMPLE_EVERY === 0) {
      trajectory.push(toSample(t, state));
    }
  }

  if (!landed) {
    // Degenerate launch (zero speed, subterranean start): report as-is.
    landing = state;
    flightTime = t;
  }

  const landingSpeed = Math.hypot(landing.v.x, landing.v.y, landing.v.z);
  const horizontalSpeed = Math.hypot(landing.v.x, landing.v.z);
  return {
    trajectory,
    rangeM: Math.hypot(landing.p.x - start.x, landing.p.z - start.z),
    lateralM: landing.p.z - start.z,
    apexM,
    flightTimeS: flightTime,
    landingPositionM: landing.p,
    landingSpeedMps: landingSpeed,
    landingAngleDeg: radToDeg(
      Math.atan2(-landing.v.y, Math.max(horizontalSpeed, 1e-9)),
    ),
  };
}
