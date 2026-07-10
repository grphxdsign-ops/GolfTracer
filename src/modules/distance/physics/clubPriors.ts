/**
 * Per-club launch condition priors for a MID-TEENS-HANDICAP male amateur
 * (TrackMan Combine "Average Golfer, 14.5 HCP" population), used as Bayesian
 * regularizers during launch fitting and as the last-resort fallback when
 * neither homography nor a physics fit is available.
 *
 * Research-verified (DESIGN.md §12). Anchor points with direct sources:
 * driver ball speed 133 mph / spin 3,275 rpm / launch 12.6° (TrackMan
 * Combine averages — amateurs spin the DRIVER ~29% more than Tour, not
 * less); PW ball 85.6 mph / launch 26.7° / spin 8,408 rpm (TrackMan
 * "average male amateur"). Clubs without direct amateur data are derived
 * from the cross-validated ~0.78 × Tour-ball-speed ratio (equals the
 * published amateur/Tour clubhead-speed ratio × smash-factor discount, and
 * lands exactly on the measured values where both exist: 7i 123×0.78 = 96).
 * Wood/long-iron spin means keep the Tour-shaped figures with widened sds —
 * the amateur/Tour spin gap flips sign between driver (+29%) and short
 * irons (−4…−10%) and the crossover club is genuinely uncertain. SW/LW ball
 * speeds are directional extrapolations (no published amateur data) and
 * carry the widest relative sds.
 */
import type { ClubType } from '../../../types';

import type { LaunchConditions } from './simulator';

export interface GaussianPrior {
  mean: number;
  sd: number;
}

export interface ClubPrior {
  ballSpeedMph: GaussianPrior;
  launchAngleDeg: GaussianPrior;
  spinRpm: GaussianPrior;
}

export const CLUB_PRIORS: Record<ClubType, ClubPrior> = {
  driver: {
    ballSpeedMph: { mean: 133, sd: 11 },
    launchAngleDeg: { mean: 12.5, sd: 2.3 },
    spinRpm: { mean: 3275, sd: 450 },
  },
  '3-wood': {
    ballSpeedMph: { mean: 125, sd: 9 },
    launchAngleDeg: { mean: 12.5, sd: 2.5 },
    spinRpm: { mean: 3400, sd: 800 },
  },
  '5-wood': {
    ballSpeedMph: { mean: 119, sd: 8 },
    launchAngleDeg: { mean: 14, sd: 2.5 },
    spinRpm: { mean: 4300, sd: 900 },
  },
  '3-iron': {
    ballSpeedMph: { mean: 113, sd: 8 },
    launchAngleDeg: { mean: 13, sd: 2.5 },
    spinRpm: { mean: 4500, sd: 900 },
  },
  '5-iron': {
    ballSpeedMph: { mean: 104, sd: 7 },
    launchAngleDeg: { mean: 15, sd: 2.5 },
    spinRpm: { mean: 5400, sd: 900 },
  },
  '7-iron': {
    ballSpeedMph: { mean: 96, sd: 7 },
    launchAngleDeg: { mean: 17, sd: 2.5 },
    spinRpm: { mean: 6800, sd: 900 },
  },
  '9-iron': {
    ballSpeedMph: { mean: 87, sd: 6 },
    launchAngleDeg: { mean: 22, sd: 3 },
    spinRpm: { mean: 8000, sd: 1000 },
  },
  'pitching-wedge': {
    ballSpeedMph: { mean: 85, sd: 6 },
    launchAngleDeg: { mean: 27, sd: 3 },
    spinRpm: { mean: 8400, sd: 1000 },
  },
  'sand-wedge': {
    ballSpeedMph: { mean: 74, sd: 7 },
    launchAngleDeg: { mean: 30, sd: 3 },
    spinRpm: { mean: 9000, sd: 1200 },
  },
  'lob-wedge': {
    ballSpeedMph: { mean: 64, sd: 7 },
    launchAngleDeg: { mean: 33, sd: 3.5 },
    spinRpm: { mean: 9500, sd: 1300 },
  },
};

/**
 * Published mid-teens-handicap amateur CARRY per club, yards — what the
 * club-prior fallback quotes as "a typical distance for your club"
 * (DESIGN.md §12). Deliberately decoupled from simulateFlight(priorLaunch):
 * the flight model's drag/lift is tuned against tracer geometry and
 * under-flies high-spin mid irons, so quoting its output as "your club's
 * average" would misinform. Anchors: driver ≈200 (conservative middle of
 * the 190–225 research band), 7-iron 140 (TrackMan "average golfer"; Shot
 * Scope's 154 is flagged as carry/total-ambiguous), PW 113 (between
 * TrackMan ~110 and Shot Scope 118); remaining clubs follow standard
 * 10–15 yd amateur gapping between those anchors.
 */
export const CLUB_AVG_CARRY_YD: Record<ClubType, number> = {
  driver: 200,
  '3-wood': 183,
  '5-wood': 170,
  '3-iron': 158,
  '5-iron': 148,
  '7-iron': 140,
  '9-iron': 123,
  'pitching-wedge': 113,
  'sand-wedge': 90,
  'lob-wedge': 70,
};

/** Prior-mean launch conditions for a club. */
export function priorLaunch(club: ClubType): LaunchConditions {
  const p = CLUB_PRIORS[club];
  return {
    ballSpeedMph: p.ballSpeedMph.mean,
    launchAngleDeg: p.launchAngleDeg.mean,
    backspinRpm: p.spinRpm.mean,
  };
}

function gaussianLogDensity(x: number, prior: GaussianPrior): number {
  const z = (x - prior.mean) / prior.sd;
  return -0.5 * z * z;
}

/**
 * Un-normalized Gaussian log prior of a launch candidate under a club's
 * prior (sum of per-dimension log densities, constants dropped). Zero at the
 * prior mean, increasingly negative away from it.
 */
export function logPrior(club: ClubType, launch: LaunchConditions): number {
  const p = CLUB_PRIORS[club];
  return (
    gaussianLogDensity(launch.ballSpeedMph, p.ballSpeedMph) +
    gaussianLogDensity(launch.launchAngleDeg, p.launchAngleDeg) +
    gaussianLogDensity(launch.backspinRpm, p.spinRpm)
  );
}
