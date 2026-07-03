/**
 * 2D golf ball flight simulator (vertical plane: x downrange, y up).
 *
 * Integrates F = F_drag + F_lift + F_gravity with a classic RK4 scheme at
 * 2 ms steps. Drag and lift coefficients are speed/spin dependent (see
 * constants.ts), so no closed-form trajectory exists — numeric integration
 * is required. Sidespin/curvature is out of scope for v1.
 */
import {
  AIR_DENSITY_KG_M3,
  BALL_AREA_M2,
  BALL_MASS_KG,
  GRAVITY_MS2,
  SPIN_DECAY_PER_S,
  degToRad,
  dragCoefficient,
  liftCoefficient,
  metersToFeet,
  metersToYards,
  mphToMps,
  radToDeg,
  spinRatio,
} from './constants';

export interface LaunchConditions {
  ballSpeedMph: number;
  launchAngleDeg: number;
  backspinRpm: number;
}

export interface FlightEnvironment {
  /** Air density override, kg/m^3 (default sea level 1.225). */
  airDensityKgM3?: number;
  /**
   * Disable aerodynamics entirely (C_D = C_L = 0). Used to validate the
   * integrator against the analytic vacuum parabola.
   */
  vacuum?: boolean;
  /**
   * Stop integrating after this many seconds of flight (trajectory-only
   * use by reprojection fitters that never need the full arc). When the
   * flight is truncated before landing, `carryYards` / `apexFeet` /
   * `flightTimeS` / `landingAngleDeg` reflect the truncated state — only
   * `.trajectory` (valid up to this time) should be consumed. Omitted =>
   * behavior is byte-identical to before this option existed.
   */
  maxFlightTimeS?: number;
}

export interface TrajectoryPoint {
  /** Time since launch, s. */
  t: number;
  /** Downrange position, m. */
  x: number;
  /** Height above launch, m. */
  y: number;
}

export interface FlightResult {
  carryYards: number;
  apexFeet: number;
  flightTimeS: number;
  /** Descent angle below horizontal at landing, deg (positive). */
  landingAngleDeg: number;
  /** Trajectory in metric plane coordinates, sampled every ~10 ms. */
  trajectory: TrajectoryPoint[];
}

/** Integration time step, s. */
const DT = 0.002;
/** Trajectory sampling interval in integration steps (10 ms). */
const SAMPLE_EVERY = 5;
/** Hard cap on simulated flight time, s. */
const MAX_FLIGHT_S = 20;

interface State {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Backspin, rpm (decays over time). */
  spin: number;
}

type Derivative = State;

function derivative(s: State, rho: number, vacuum: boolean): Derivative {
  const v = Math.hypot(s.vx, s.vy);
  let ax = 0;
  let ay = -GRAVITY_MS2;

  if (!vacuum && v > 1e-9) {
    const q = 0.5 * rho * BALL_AREA_M2 * v * v; // dynamic pressure * area
    const ux = s.vx / v;
    const uy = s.vy / v;

    const sr = spinRatio(s.spin, v);

    // Drag opposes velocity.
    const cd = dragCoefficient(v, sr);
    const fd = q * cd;
    ax -= (fd * ux) / BALL_MASS_KG;
    ay -= (fd * uy) / BALL_MASS_KG;

    // Magnus lift: backspin axis points out of the x/y plane, so the lift
    // direction is s_hat x v_hat = (-uy, ux) — perpendicular to velocity,
    // upward for a ball moving downrange.
    const cl = liftCoefficient(sr);
    const fl = q * cl;
    ax += (fl * -uy) / BALL_MASS_KG;
    ay += (fl * ux) / BALL_MASS_KG;
  }

  return {
    x: s.vx,
    y: s.vy,
    vx: ax,
    vy: ay,
    spin: vacuum ? 0 : -SPIN_DECAY_PER_S * s.spin,
  };
}

function rk4Step(s: State, dt: number, rho: number, vacuum: boolean): State {
  const k1 = derivative(s, rho, vacuum);
  const k2 = derivative(advance(s, k1, dt / 2), rho, vacuum);
  const k3 = derivative(advance(s, k2, dt / 2), rho, vacuum);
  const k4 = derivative(advance(s, k3, dt), rho, vacuum);
  return {
    x: s.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: s.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    vx: s.vx + (dt / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx),
    vy: s.vy + (dt / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy),
    spin: s.spin + (dt / 6) * (k1.spin + 2 * k2.spin + 2 * k3.spin + k4.spin),
  };
}

function advance(s: State, d: Derivative, dt: number): State {
  return {
    x: s.x + d.x * dt,
    y: s.y + d.y * dt,
    vx: s.vx + d.vx * dt,
    vy: s.vy + d.vy * dt,
    spin: s.spin + d.spin * dt,
  };
}

/**
 * Simulate a full ball flight from launch conditions until the ball returns
 * to launch height (y = 0). Landing position is linearly interpolated
 * between the last two integration steps for sub-step accuracy.
 */
export function simulateFlight(
  launch: LaunchConditions,
  env?: FlightEnvironment,
): FlightResult {
  const rho = env?.airDensityKgM3 ?? AIR_DENSITY_KG_M3;
  const vacuum = env?.vacuum ?? false;
  // Integration horizon, s: the optional truncation cap, never beyond the
  // global hard cap. Omitted => exactly MAX_FLIGHT_S (legacy behavior).
  const horizonS =
    env?.maxFlightTimeS !== undefined
      ? Math.min(Math.max(env.maxFlightTimeS, 0), MAX_FLIGHT_S)
      : MAX_FLIGHT_S;

  const v0 = mphToMps(launch.ballSpeedMph);
  const angle = degToRad(launch.launchAngleDeg);

  let state: State = {
    x: 0,
    y: 0,
    vx: v0 * Math.cos(angle),
    vy: v0 * Math.sin(angle),
    spin: Math.max(launch.backspinRpm, 0),
  };

  const trajectory: TrajectoryPoint[] = [{ t: 0, x: 0, y: 0 }];
  let apexM = 0;
  let t = 0;
  let step = 0;
  let landed = false;
  let carryM = state.x;
  let flightTime = 0;
  let landingAngleDeg = 0;

  while (t < horizonS) {
    const prev = state;
    state = rk4Step(state, DT, rho, vacuum);
    t += DT;
    step += 1;

    if (state.y > apexM) {
      apexM = state.y;
    }

    // Landing: crossed y = 0 while descending (skip the initial instant).
    if (state.y <= 0 && prev.y > 0) {
      const frac = prev.y / (prev.y - state.y);
      carryM = prev.x + frac * (state.x - prev.x);
      flightTime = t - DT + frac * DT;
      const vxL = prev.vx + frac * (state.vx - prev.vx);
      const vyL = prev.vy + frac * (state.vy - prev.vy);
      landingAngleDeg = radToDeg(Math.atan2(-vyL, Math.max(vxL, 1e-9)));
      trajectory.push({ t: flightTime, x: carryM, y: 0 });
      landed = true;
      break;
    }

    if (step % SAMPLE_EVERY === 0) {
      trajectory.push({ t, x: state.x, y: state.y });
    }
  }

  if (!landed) {
    // Degenerate launch (e.g. zero speed) or truncated flight: report
    // whatever we have.
    carryM = state.x;
    flightTime = t;
    landingAngleDeg = radToDeg(Math.atan2(-state.vy, Math.max(state.vx, 1e-9)));
    // Truncated flights get a final trajectory sample at the stop time so
    // interpolating consumers cover the full requested horizon. Only when
    // the cap was requested — legacy output stays byte-identical.
    if (env?.maxFlightTimeS !== undefined) {
      const lastPt = trajectory[trajectory.length - 1];
      if (!lastPt || lastPt.t < t) {
        trajectory.push({ t, x: state.x, y: state.y });
      }
    }
  }

  return {
    carryYards: metersToYards(carryM),
    apexFeet: metersToFeet(apexM),
    flightTimeS: flightTime,
    landingAngleDeg,
    trajectory,
  };
}
