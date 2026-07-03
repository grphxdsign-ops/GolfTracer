import { ConstantAccelerationKF } from '../kalman';
import { mulberry32 } from '../../testutils/syntheticFrames';

/** Deterministic standard-normal via Box-Muller over mulberry32. */
function gaussian(rng: () => number): () => number {
  return () => {
    const u = Math.max(rng(), 1e-12);
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

interface TruthPoint {
  x: number;
  y: number;
}

/** Constant-acceleration truth: gravity pulls screen-down (+y). */
function parabola(t: number): TruthPoint {
  return {
    x: 50 + 300 * t,
    y: 200 - 400 * t + 0.5 * 500 * t * t,
  };
}

describe('ConstantAccelerationKF', () => {
  it('converges on a noisy parabola (RMS < 2px after 10 frames)', () => {
    const rng = gaussian(mulberry32(7));
    const dt = 1 / 60;
    const first = parabola(0);
    const kf = new ConstantAccelerationKF(
      { x: first.x + rng(), y: first.y + rng() },
      { measurementNoise: 1.5, processNoise: 20 },
    );
    let sumSq = 0;
    let count = 0;
    for (let i = 1; i <= 60; i++) {
      const t = i * dt;
      const truth = parabola(t);
      kf.predict(dt);
      kf.update(truth.x + rng(), truth.y + rng());
      if (i >= 10) {
        const err = Math.hypot(kf.x - truth.x, kf.y - truth.y);
        sumSq += err * err;
        count++;
      }
    }
    const rms = Math.sqrt(sumSq / count);
    expect(rms).toBeLessThan(2);
  });

  it('predicts through a 5-frame occlusion', () => {
    const rng = gaussian(mulberry32(21));
    const dt = 1 / 60;
    const first = parabola(0);
    const kf = new ConstantAccelerationKF(
      { x: first.x, y: first.y },
      { measurementNoise: 1, processNoise: 20 },
    );
    // 25 clean updates so velocity and acceleration are learned.
    for (let i = 1; i <= 25; i++) {
      const truth = parabola(i * dt);
      kf.predict(dt);
      kf.update(truth.x + 0.5 * rng(), truth.y + 0.5 * rng());
    }
    // 5 frames coasting on the model only.
    for (let i = 26; i <= 30; i++) {
      kf.predict(dt);
    }
    const truth = parabola(30 * dt);
    expect(Math.hypot(kf.x - truth.x, kf.y - truth.y)).toBeLessThan(6);
    // Uncertainty must have grown while coasting.
    expect(kf.positionGateSigma()).toBeGreaterThan(1);
  });

  it('handles variable frame intervals', () => {
    const dtPattern = [1 / 60, 1 / 30, 1 / 60, 1 / 120];
    const kf = new ConstantAccelerationKF(parabola(0), {
      measurementNoise: 1,
      processNoise: 20,
    });
    let t = 0;
    let lastErr = Infinity;
    for (let i = 0; i < 48; i++) {
      const dt = dtPattern[i % dtPattern.length]!;
      t += dt;
      const truth = parabola(t);
      kf.predict(dt);
      kf.update(truth.x, truth.y);
      lastErr = Math.hypot(kf.x - truth.x, kf.y - truth.y);
    }
    expect(lastErr).toBeLessThan(1);
    // With noiseless measurements the estimated kinematics approach truth.
    expect(kf.vx).toBeCloseTo(300, -1.5);
    expect(kf.ay).toBeGreaterThan(0);
  });

  it('gates via Mahalanobis distance', () => {
    const dt = 1 / 60;
    const kf = new ConstantAccelerationKF(parabola(0), {
      measurementNoise: 1.5,
      processNoise: 20,
    });
    for (let i = 1; i <= 30; i++) {
      const truth = parabola(i * dt);
      kf.predict(dt);
      kf.update(truth.x, truth.y);
    }
    const truth = parabola(31 * dt);
    kf.predict(dt);
    const near = kf.innovation(truth.x + 1, truth.y - 1);
    const far = kf.innovation(truth.x + 40, truth.y - 30);
    expect(near.mahalanobis2).toBeLessThan(9.21);
    expect(far.mahalanobis2).toBeGreaterThan(9.21);
    expect(far.mahalanobis2).toBeGreaterThan(near.mahalanobis2);
  });

  it('rejects a singular innovation covariance', () => {
    const kf = new ConstantAccelerationKF(
      { x: 0, y: 0 },
      { measurementNoise: 0, initialPositionVar: 0 },
    );
    expect(() => kf.innovation(1, 1)).toThrow('singular');
  });
});
