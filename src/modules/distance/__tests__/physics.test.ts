/**
 * Physics engine tests: RK4 integrator vs the analytic vacuum parabola,
 * carry sanity bounds per club, coefficient model continuity, roll model
 * monotonicity, and unit conversions.
 */
import {
  GRAVITY_MS2,
  dragCoefficient,
  liftCoefficient,
  metersToFeet,
  metersToYards,
  mphToMps,
  mpsToMph,
  spinRatio,
  yardsToMeters,
  DRAG_TABLE,
} from '../physics/constants';
import { simulateFlight } from '../physics/simulator';
import { CLUB_PRIORS, logPrior, priorLaunch } from '../physics/clubPriors';
import { rollFraction, totalFromCarry } from '../physics/rollModel';

describe('simulateFlight (vacuum)', () => {
  it('matches the analytic parabola to <0.1%', () => {
    const v0 = 50; // m/s
    const angleDeg = 30;
    const angle = (angleDeg * Math.PI) / 180;

    const result = simulateFlight(
      {
        ballSpeedMph: mpsToMph(v0),
        launchAngleDeg: angleDeg,
        backspinRpm: 3000, // must be ignored in vacuum
      },
      { vacuum: true },
    );

    const analyticRangeM = (v0 * v0 * Math.sin(2 * angle)) / GRAVITY_MS2;
    const analyticApexM = (v0 * v0 * Math.sin(angle) ** 2) / (2 * GRAVITY_MS2);
    const analyticTimeS = (2 * v0 * Math.sin(angle)) / GRAVITY_MS2;

    expect(result.carryYards).toBeCloseTo(metersToYards(analyticRangeM), -1);
    expect(
      Math.abs(result.carryYards - metersToYards(analyticRangeM)) /
        metersToYards(analyticRangeM),
    ).toBeLessThan(0.001);
    expect(
      Math.abs(result.apexFeet - metersToFeet(analyticApexM)) /
        metersToFeet(analyticApexM),
    ).toBeLessThan(0.001);
    expect(Math.abs(result.flightTimeS - analyticTimeS)).toBeLessThan(0.005);
    // Symmetric parabola: landing angle equals launch angle.
    expect(result.landingAngleDeg).toBeCloseTo(angleDeg, 1);
  });

  it('produces a monotonically increasing, time-ordered trajectory', () => {
    const result = simulateFlight(priorLaunch('driver'));
    for (let i = 1; i < result.trajectory.length; i++) {
      const prev = result.trajectory[i - 1]!;
      const curr = result.trajectory[i]!;
      expect(curr.t).toBeGreaterThan(prev.t);
      expect(curr.x).toBeGreaterThanOrEqual(prev.x);
    }
  });
});

describe('simulateFlight (club prior sanity bounds)', () => {
  it('driver prior carries 200-260 yards', () => {
    const result = simulateFlight(priorLaunch('driver'));
    expect(result.carryYards).toBeGreaterThanOrEqual(200);
    expect(result.carryYards).toBeLessThanOrEqual(260);
  });

  it('7-iron prior carries 140-170 yards', () => {
    const result = simulateFlight(priorLaunch('7-iron'));
    expect(result.carryYards).toBeGreaterThanOrEqual(140);
    expect(result.carryYards).toBeLessThanOrEqual(170);
  });

  it('pitching wedge prior carries 85-125 yards', () => {
    const result = simulateFlight(priorLaunch('pitching-wedge'));
    expect(result.carryYards).toBeGreaterThanOrEqual(85);
    expect(result.carryYards).toBeLessThanOrEqual(125);
  });

  it('carry decreases from driver through the wedges', () => {
    const order = [
      'driver',
      '5-iron',
      '7-iron',
      '9-iron',
      'pitching-wedge',
      'sand-wedge',
      'lob-wedge',
    ] as const;
    const carries = order.map((c) => simulateFlight(priorLaunch(c)).carryYards);
    for (let i = 1; i < carries.length; i++) {
      expect(carries[i]!).toBeLessThan(carries[i - 1]!);
    }
  });

  it('drag shortens a zero-spin flight relative to vacuum', () => {
    // Note: with backspin, Magnus lift can legitimately out-fly the vacuum
    // parabola at flat launch angles — so compare spinless flights.
    const launch = { ballSpeedMph: 150, launchAngleDeg: 12, backspinRpm: 0 };
    const air = simulateFlight(launch);
    const vac = simulateFlight(launch, { vacuum: true });
    expect(air.carryYards).toBeLessThan(vac.carryYards);
  });

  it('backspin lift extends carry over a spinless drive', () => {
    const noSpin = simulateFlight({
      ballSpeedMph: 150,
      launchAngleDeg: 12,
      backspinRpm: 0,
    });
    const withSpin = simulateFlight({
      ballSpeedMph: 150,
      launchAngleDeg: 12,
      backspinRpm: 2500,
    });
    expect(withSpin.carryYards).toBeGreaterThan(noSpin.carryYards);
    expect(withSpin.apexFeet).toBeGreaterThan(noSpin.apexFeet);
  });
});

describe('dragCoefficient', () => {
  it('is continuous across every table breakpoint', () => {
    const eps = 1e-6;
    for (const [v] of DRAG_TABLE) {
      if (v === 0) {
        continue;
      }
      const below = dragCoefficient(v - eps);
      const above = dragCoefficient(v + eps);
      expect(Math.abs(above - below)).toBeLessThan(1e-3);
    }
  });

  it('stays in the 0.21-0.25 band across flight speeds (zero spin)', () => {
    for (let v = 20; v <= 90; v += 1) {
      const cd = dragCoefficient(v);
      expect(cd).toBeGreaterThanOrEqual(0.21);
      expect(cd).toBeLessThanOrEqual(0.25);
    }
  });

  it('clamps outside the table and interpolates linearly inside', () => {
    expect(dragCoefficient(-5)).toBe(DRAG_TABLE[0]![1]);
    expect(dragCoefficient(500)).toBe(DRAG_TABLE[DRAG_TABLE.length - 1]![1]);
    // Midpoint of the [55, 70] segment.
    expect(dragCoefficient(62.5)).toBeCloseTo((0.215 + 0.21) / 2, 10);
  });

  it('increases with spin ratio', () => {
    expect(dragCoefficient(60, 0.3)).toBeGreaterThan(dragCoefficient(60, 0.1));
    expect(dragCoefficient(60, 0.1)).toBeGreaterThan(dragCoefficient(60, 0));
  });
});

describe('liftCoefficient', () => {
  it('is zero without spin and grows with spin ratio before saturating', () => {
    expect(liftCoefficient(0)).toBe(0);
    expect(liftCoefficient(0.1)).toBeGreaterThan(0);
    expect(liftCoefficient(0.2)).toBeGreaterThan(liftCoefficient(0.1));
    // Saturation: enormous spin ratios do not produce unbounded lift.
    expect(liftCoefficient(5)).toBeLessThanOrEqual(0.38);
    expect(liftCoefficient(-1)).toBe(0);
  });

  it('spinRatio computes omega*r/v', () => {
    // 3000 rpm = 314.16 rad/s, r = 0.021335 m, v = 60 m/s -> S ~ 0.1117
    expect(spinRatio(3000, 60)).toBeCloseTo(0.1117, 3);
    expect(spinRatio(3000, 0)).toBe(0);
  });
});

describe('club priors', () => {
  it('priorLaunch returns the prior means', () => {
    const launch = priorLaunch('7-iron');
    expect(launch.ballSpeedMph).toBe(CLUB_PRIORS['7-iron'].ballSpeedMph.mean);
    expect(launch.launchAngleDeg).toBe(
      CLUB_PRIORS['7-iron'].launchAngleDeg.mean,
    );
    expect(launch.backspinRpm).toBe(CLUB_PRIORS['7-iron'].spinRpm.mean);
  });

  it('logPrior peaks at the prior mean and decreases away from it', () => {
    const mean = priorLaunch('driver');
    expect(logPrior('driver', mean)).toBeCloseTo(0, 12);
    const off = { ...mean, ballSpeedMph: mean.ballSpeedMph + 20 };
    expect(logPrior('driver', off)).toBeLessThan(0);
    const farther = { ...mean, ballSpeedMph: mean.ballSpeedMph + 40 };
    expect(logPrior('driver', farther)).toBeLessThan(logPrior('driver', off));
  });
});

describe('rollModel', () => {
  it('roll fraction decreases monotonically with landing angle', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let angle = 20; angle <= 60; angle += 5) {
      const f = rollFraction(angle, 'driver');
      expect(f).toBeLessThanOrEqual(prev);
      prev = f;
    }
  });

  it('driver rolls ~8-12% at a typical shallow landing', () => {
    const f = rollFraction(34, 'driver');
    expect(f).toBeGreaterThanOrEqual(0.08);
    expect(f).toBeLessThanOrEqual(0.12);
  });

  it('wedges add only ~1-3%', () => {
    const f = rollFraction(53, 'pitching-wedge');
    expect(f).toBeGreaterThanOrEqual(0.005);
    expect(f).toBeLessThanOrEqual(0.03);
  });

  it('high spin reduces roll relative to low spin at the same landing angle', () => {
    expect(rollFraction(45, 'pitching-wedge')).toBeLessThan(
      rollFraction(45, 'driver'),
    );
  });

  it('firm surfaces roll more than soft', () => {
    expect(rollFraction(40, 'driver', 'firm')).toBeGreaterThan(
      rollFraction(40, 'driver', 'soft'),
    );
  });

  it('totalFromCarry adds the roll fraction to carry', () => {
    const total = totalFromCarry(220, 34, 'driver');
    expect(total).toBeGreaterThan(220 * 1.08);
    expect(total).toBeLessThan(220 * 1.12);
  });
});

describe('unit conversions', () => {
  it('mph <-> m/s round trip', () => {
    expect(mphToMps(100)).toBeCloseTo(44.704, 4);
    expect(mpsToMph(mphToMps(123.4))).toBeCloseTo(123.4, 10);
  });

  it('yards <-> meters round trip', () => {
    expect(yardsToMeters(100)).toBeCloseTo(91.44, 6);
    expect(metersToYards(yardsToMeters(250))).toBeCloseTo(250, 10);
  });

  it('meters -> feet', () => {
    expect(metersToFeet(1)).toBeCloseTo(3.28084, 5);
  });
});
