/**
 * Monocular pinhole tests: focal length from FOV, distance from apparent
 * ball diameter, scene scale at the ball, and exact round-trips between
 * distance and pixel diameter (the "BALL PX 57 -> 24" depth cue).
 */
import {
  apparentDiameterPxAtDistance,
  distanceFromApparentDiameterM,
  focalPxFromFov,
  metersPerPixelAtBall,
} from '../monocular';
import { getSportProfile } from '../sportProfile';

const SOCCER_DIAMETER_M = getSportProfile('soccer').ball.diameterM;

describe('focalPxFromFov', () => {
  it('gives f = w/2 for a 90 degree FOV', () => {
    expect(focalPxFromFov(90, 1920)).toBeCloseTo(960, 6);
  });

  it('narrower FOV means longer focal length', () => {
    expect(focalPxFromFov(60, 1920)).toBeGreaterThan(focalPxFromFov(90, 1920));
  });

  it('rejects out-of-range inputs', () => {
    expect(() => focalPxFromFov(0, 1920)).toThrow();
    expect(() => focalPxFromFov(180, 1920)).toThrow();
    expect(() => focalPxFromFov(60, 0)).toThrow();
  });
});

describe('distance <-> apparent diameter round-trip', () => {
  const focalPx = focalPxFromFov(66, 1920);

  it('recovers the distance exactly from the projected diameter', () => {
    for (const distanceM of [2, 5, 11.9, 30]) {
      const dPx = apparentDiameterPxAtDistance(focalPx, distanceM, SOCCER_DIAMETER_M);
      expect(
        distanceFromApparentDiameterM(focalPx, dPx, SOCCER_DIAMETER_M),
      ).toBeCloseTo(distanceM, 9);
    }
  });

  it('a receding ball shrinks: 57 px is much closer than 24 px', () => {
    const near = distanceFromApparentDiameterM(focalPx, 57, SOCCER_DIAMETER_M);
    const far = distanceFromApparentDiameterM(focalPx, 24, SOCCER_DIAMETER_M);
    expect(near).toBeLessThan(far);
    expect(far / near).toBeCloseTo(57 / 24, 6);
  });

  it('rejects non-positive inputs', () => {
    expect(() => distanceFromApparentDiameterM(0, 57, SOCCER_DIAMETER_M)).toThrow();
    expect(() => distanceFromApparentDiameterM(1000, 0, SOCCER_DIAMETER_M)).toThrow();
    expect(() => distanceFromApparentDiameterM(1000, 57, 0)).toThrow();
    expect(() => apparentDiameterPxAtDistance(1000, 0, SOCCER_DIAMETER_M)).toThrow();
  });
});

describe('metersPerPixelAtBall', () => {
  it('is the real diameter divided by the pixel diameter', () => {
    expect(metersPerPixelAtBall(57, SOCCER_DIAMETER_M)).toBeCloseTo(0.22 / 57, 9);
  });

  it('scales linearly with the ball diameter (sport-agnostic)', () => {
    const tennis = getSportProfile('tennis').ball.diameterM;
    expect(metersPerPixelAtBall(30, tennis) / metersPerPixelAtBall(30, SOCCER_DIAMETER_M)).toBeCloseTo(
      tennis / SOCCER_DIAMETER_M,
      9,
    );
  });

  it('rejects a non-positive pixel diameter', () => {
    expect(() => metersPerPixelAtBall(0, SOCCER_DIAMETER_M)).toThrow();
  });
});
