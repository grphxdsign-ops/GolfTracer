/**
 * General ball-flight simulator tests: the RK4 integrator against the
 * analytic vacuum parabola (now in 3D with an azimuth), plus published
 * range/arc envelopes per sport — soccer instep kick, basketball free-throw
 * release window, tennis serve (drag is what keeps a flat serve in the
 * box), topspin/sidespin Magnus signs, and spec-driven parameterization.
 */
import {
  AIR_DENSITY_KG_M3,
  GRAVITY_MS2,
  dragCoefficientFromTable,
  liftCoefficientFromSpec,
  simulateBallFlight,
  type BallFlightResult,
} from '../ballFlight';
import { getSportProfile } from '../sportProfile';

const SOCCER_BALL = getSportProfile('soccer').ball;
const BASKETBALL = getSportProfile('basketball').ball;
const TENNIS_BALL = getSportProfile('tennis').ball;
const PICKLEBALL = getSportProfile('pickleball').ball;

/**
 * Interpolated downrange x where the trajectory descends through `heightM`
 * (NaN when it never does).
 */
function descendingCrossingX(result: BallFlightResult, heightM: number): number {
  for (let i = 1; i < result.trajectory.length; i++) {
    const prev = result.trajectory[i - 1]!;
    const curr = result.trajectory[i]!;
    if (
      prev.positionM.y > heightM &&
      curr.positionM.y <= heightM &&
      curr.velocityMps.y < 0
    ) {
      const f = (prev.positionM.y - heightM) / (prev.positionM.y - curr.positionM.y);
      return prev.positionM.x + f * (curr.positionM.x - prev.positionM.x);
    }
  }
  return NaN;
}

/** Interpolated height where the trajectory passes downrange `xM`. */
function heightAtDownrange(result: BallFlightResult, xM: number): number {
  for (let i = 1; i < result.trajectory.length; i++) {
    const prev = result.trajectory[i - 1]!;
    const curr = result.trajectory[i]!;
    if (prev.positionM.x <= xM && curr.positionM.x > xM) {
      const f = (xM - prev.positionM.x) / (curr.positionM.x - prev.positionM.x);
      return prev.positionM.y + f * (curr.positionM.y - prev.positionM.y);
    }
  }
  return NaN;
}

describe('simulateBallFlight (vacuum, analytic parabola)', () => {
  it('matches the analytic 3D parabola to <0.1% including azimuth split', () => {
    const v0 = 20;
    const elevDeg = 35;
    const azDeg = 25;
    const elev = (elevDeg * Math.PI) / 180;
    const az = (azDeg * Math.PI) / 180;

    const result = simulateBallFlight(
      {
        speedMps: v0,
        launchAngleDeg: elevDeg,
        azimuthDeg: azDeg,
        spinRpm: 3000, // must be ignored in vacuum
        spinAxisDeg: 90,
      },
      SOCCER_BALL,
      { vacuum: true },
    );

    const analyticRange = (v0 * v0 * Math.sin(2 * elev)) / GRAVITY_MS2;
    const analyticApex = (v0 * v0 * Math.sin(elev) ** 2) / (2 * GRAVITY_MS2);
    const analyticTime = (2 * v0 * Math.sin(elev)) / GRAVITY_MS2;

    expect(Math.abs(result.rangeM - analyticRange) / analyticRange).toBeLessThan(
      0.001,
    );
    expect(Math.abs(result.apexM - analyticApex) / analyticApex).toBeLessThan(
      0.001,
    );
    expect(Math.abs(result.flightTimeS - analyticTime)).toBeLessThan(0.005);
    // The horizontal path is a straight line along the azimuth.
    expect(result.lateralM).toBeCloseTo(analyticRange * Math.sin(az), 3);
    expect(result.landingPositionM.x).toBeCloseTo(analyticRange * Math.cos(az), 3);
    // Symmetric parabola: lands at launch speed and angle.
    expect(result.landingSpeedMps).toBeCloseTo(v0, 2);
    expect(result.landingAngleDeg).toBeCloseTo(elevDeg, 1);
  });

  it('is identical for every BallSpec in vacuum (spec only enters via aero)', () => {
    const launch = { speedMps: 15, launchAngleDeg: 40 };
    const a = simulateBallFlight(launch, TENNIS_BALL, { vacuum: true });
    const b = simulateBallFlight(launch, BASKETBALL, { vacuum: true });
    expect(a.rangeM).toBeCloseTo(b.rangeM, 9);
    expect(a.apexM).toBeCloseTo(b.apexM, 9);
  });
});

describe('simulateBallFlight (soccer instep kick)', () => {
  // A strong instep kick leaves the boot near 30 m/s (~108 km/h) at a
  // moderate launch angle; published trajectory studies (Goff & Carre)
  // put the carry around 45-55 m with a sub-8 m apex.
  const launch = {
    speedMps: 30,
    launchAngleDeg: 18,
    spinRpm: 200,
    positionM: { x: 0, y: 0.11, z: 0 },
  };

  it('carries 40-60 m with a 4-8 m apex and slows down in flight', () => {
    const result = simulateBallFlight(launch, SOCCER_BALL);
    expect(result.rangeM).toBeGreaterThan(40);
    expect(result.rangeM).toBeLessThan(60);
    expect(result.apexM).toBeGreaterThan(4);
    expect(result.apexM).toBeLessThan(8);
    expect(result.landingSpeedMps).toBeLessThan(0.75 * launch.speedMps);
  });

  it('drag shortens the kick versus vacuum', () => {
    const aero = simulateBallFlight({ ...launch, spinRpm: 0 }, SOCCER_BALL);
    const vacuum = simulateBallFlight(launch, SOCCER_BALL, { vacuum: true });
    expect(aero.rangeM).toBeLessThan(vacuum.rangeM);
  });

  it('sidespin curves the ball toward the spin-axis sign (banana kick)', () => {
    const curler = {
      speedMps: 25,
      launchAngleDeg: 12,
      spinRpm: 480,
      positionM: { x: 0, y: 0.11, z: 0 },
    };
    const right = simulateBallFlight(
      { ...curler, spinAxisDeg: 90 },
      SOCCER_BALL,
    );
    const left = simulateBallFlight(
      { ...curler, spinAxisDeg: -90 },
      SOCCER_BALL,
    );
    expect(right.lateralM).toBeGreaterThan(1.5);
    expect(left.lateralM).toBeLessThan(-1.5);
    expect(right.lateralM).toBeCloseTo(-left.lateralM, 6);
  });
});

describe('simulateBallFlight (basketball free throw)', () => {
  // Free-throw studies (Brancazio; Okubo & Hubbard) put the optimal
  // release in the 45-52 deg window at ~7.3-7.6 m/s from a ~2 m release
  // height, dropping through the rim plane 4.19 m from the line.
  const rimHeight = 3.048;
  const rimDistance = 4.19;

  it('a 7.55 m/s, 51 deg release drops through the rim plane at ~4.19 m', () => {
    const result = simulateBallFlight(
      {
        speedMps: 7.55,
        launchAngleDeg: 51,
        spinRpm: 120, // gentle backspin
        positionM: { x: 0, y: 2.0, z: 0 },
      },
      BASKETBALL,
    );
    const crossX = descendingCrossingX(result, rimHeight);
    expect(Math.abs(crossX - rimDistance)).toBeLessThan(0.2);
    expect(result.apexM).toBeGreaterThan(rimHeight + 0.3);
    expect(result.apexM).toBeLessThan(4.2);
  });

  it('the whole 45-52 deg release window reaches the rim descending steeply', () => {
    // Speed compensates angle across the published window.
    const cases: Array<[number, number]> = [
      [7.65, 45],
      [7.6, 48],
      [7.55, 51],
      [7.5, 52],
    ];
    for (const [speedMps, launchAngleDeg] of cases) {
      const result = simulateBallFlight(
        { speedMps, launchAngleDeg, spinRpm: 120, positionM: { x: 0, y: 2.0, z: 0 } },
        BASKETBALL,
      );
      const crossX = descendingCrossingX(result, rimHeight);
      expect(Math.abs(crossX - rimDistance)).toBeLessThan(0.45);
      // Entry angle at the rim must exceed ~30 deg for a clean swish window.
      const atRim = result.trajectory.find(
        (s) => s.positionM.x >= crossX && s.velocityMps.y < 0,
      )!;
      const entryDeg =
        (Math.atan2(-atRim.velocityMps.y, atRim.velocityMps.x) * 180) / Math.PI;
      expect(entryDeg).toBeGreaterThan(30);
    }
  });
});

describe('simulateBallFlight (tennis serve arc)', () => {
  // 50 m/s (180 km/h) flat serve from a 2.8 m strike height. Net is
  // 0.914 m at 11.89 m; the service line is 18.29 m from the baseline.
  // The classic result: in vacuum the serve sails long, drag brings it in.
  const serve = {
    speedMps: 50,
    launchAngleDeg: -5,
    spinRpm: 1200,
    spinAxisDeg: 180, // slight topspin
    positionM: { x: 0, y: 2.8, z: 0 },
  };

  it('clears the net and lands inside the service box with aero on', () => {
    const result = simulateBallFlight(serve, TENNIS_BALL);
    const netClearance = heightAtDownrange(result, 11.89);
    expect(netClearance).toBeGreaterThan(0.914);
    expect(result.rangeM).toBeGreaterThan(11.89);
    expect(result.rangeM).toBeLessThan(18.29);
    // The fuzzy ball sheds a lot of speed before the bounce.
    expect(result.landingSpeedMps).toBeLessThan(0.8 * serve.speedMps);
  });

  it('the same serve sails past the service line in vacuum', () => {
    const result = simulateBallFlight(serve, TENNIS_BALL, { vacuum: true });
    expect(result.rangeM).toBeGreaterThan(18.29);
  });

  it('topspin shortens a groundstroke versus a flat hit', () => {
    const base = {
      speedMps: 25,
      launchAngleDeg: 8,
      positionM: { x: 0, y: 1, z: 0 },
    };
    const topspin = simulateBallFlight(
      { ...base, spinRpm: 2400, spinAxisDeg: 180 },
      TENNIS_BALL,
    );
    const flat = simulateBallFlight(base, TENNIS_BALL);
    expect(topspin.rangeM).toBeLessThan(flat.rangeM);
    expect(topspin.flightTimeS).toBeLessThan(flat.flightTimeS);
  });
});

describe('simulateBallFlight (pickleball drive)', () => {
  it('a 18 m/s drive stays inside the 13.41 m court, well short of vacuum', () => {
    const launch = {
      speedMps: 18,
      launchAngleDeg: 6,
      positionM: { x: 0, y: 0.8, z: 0 },
    };
    const aero = simulateBallFlight(launch, PICKLEBALL);
    const vacuum = simulateBallFlight(launch, PICKLEBALL, { vacuum: true });
    expect(aero.rangeM).toBeLessThan(13.41);
    expect(aero.rangeM).toBeLessThan(0.9 * vacuum.rangeM);
    // The light perforated ball sheds speed fast.
    expect(aero.landingSpeedMps).toBeLessThan(0.75 * launch.speedMps);
  });
});

describe('simulateBallFlight (mechanics)', () => {
  it('produces a time-ordered trajectory ending exactly at the landing', () => {
    const result = simulateBallFlight(
      { speedMps: 30, launchAngleDeg: 18, spinRpm: 200 },
      SOCCER_BALL,
    );
    for (let i = 1; i < result.trajectory.length; i++) {
      expect(result.trajectory[i]!.t).toBeGreaterThan(result.trajectory[i - 1]!.t);
    }
    const lastSample = result.trajectory[result.trajectory.length - 1]!;
    expect(lastSample.t).toBeCloseTo(result.flightTimeS, 9);
    expect(lastSample.positionM.y).toBeCloseTo(0, 9);
  });

  it('handles a degenerate zero-speed launch without landing', () => {
    const result = simulateBallFlight(
      { speedMps: 0, launchAngleDeg: 45 },
      SOCCER_BALL,
    );
    expect(result.rangeM).toBeCloseTo(0, 6);
    expect(Number.isFinite(result.flightTimeS)).toBe(true);
  });
});

describe('coefficient models', () => {
  it('interpolates and clamps the drag table', () => {
    const table: [number, number][] = [
      [0, 0.5],
      [10, 0.3],
      [20, 0.2],
    ];
    expect(dragCoefficientFromTable(table, -5)).toBe(0.5);
    expect(dragCoefficientFromTable(table, 0)).toBe(0.5);
    expect(dragCoefficientFromTable(table, 5)).toBeCloseTo(0.4, 9);
    expect(dragCoefficientFromTable(table, 15)).toBeCloseTo(0.25, 9);
    expect(dragCoefficientFromTable(table, 50)).toBe(0.2);
  });

  it('lift saturates at the spec maximum and never goes negative', () => {
    expect(liftCoefficientFromSpec(SOCCER_BALL, 0)).toBe(0);
    expect(liftCoefficientFromSpec(SOCCER_BALL, -1)).toBe(0);
    const nearMax = liftCoefficientFromSpec(SOCCER_BALL, 10);
    expect(nearMax).toBeLessThanOrEqual(SOCCER_BALL.magnus.maxCl);
    expect(nearMax).toBeGreaterThan(0);
    // Monotone non-decreasing over the clamped range.
    let prev = 0;
    for (let s = 0; s <= SOCCER_BALL.magnus.maxSpinRatio; s += 0.05) {
      const cl = liftCoefficientFromSpec(SOCCER_BALL, s);
      expect(cl).toBeGreaterThanOrEqual(prev);
      prev = cl;
    }
  });

  it('exports the standard sea-level density', () => {
    expect(AIR_DENSITY_KG_M3).toBeCloseTo(1.225, 6);
  });
});
