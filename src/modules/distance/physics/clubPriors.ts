/**
 * Per-club launch condition priors (amateur-typical), used as Bayesian
 * regularizers during launch fitting and as the last-resort fallback when
 * neither homography nor a physics fit is available.
 *
 * Values follow published amateur launch-monitor averages: e.g. driver
 * ~140–155 mph ball speed / 10–14 deg / 2000–2600 rpm carrying ~216 yd,
 * 7-iron ~15–19 deg / 6000–7000 rpm, PW ~25–30 deg / 7000–9000 rpm.
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
    ballSpeedMph: { mean: 150, sd: 10 },
    launchAngleDeg: { mean: 12, sd: 2.5 },
    spinRpm: { mean: 2500, sd: 500 },
  },
  '3-wood': {
    ballSpeedMph: { mean: 143, sd: 9 },
    launchAngleDeg: { mean: 12.5, sd: 2.5 },
    spinRpm: { mean: 3400, sd: 600 },
  },
  '5-wood': {
    ballSpeedMph: { mean: 137, sd: 9 },
    launchAngleDeg: { mean: 14, sd: 2.5 },
    spinRpm: { mean: 4300, sd: 700 },
  },
  '3-iron': {
    ballSpeedMph: { mean: 132, sd: 8 },
    launchAngleDeg: { mean: 13, sd: 2.5 },
    spinRpm: { mean: 4500, sd: 700 },
  },
  '5-iron': {
    ballSpeedMph: { mean: 127, sd: 8 },
    launchAngleDeg: { mean: 15, sd: 2.5 },
    spinRpm: { mean: 5400, sd: 800 },
  },
  '7-iron': {
    ballSpeedMph: { mean: 120, sd: 7 },
    launchAngleDeg: { mean: 17, sd: 2.5 },
    spinRpm: { mean: 6800, sd: 900 },
  },
  '9-iron': {
    ballSpeedMph: { mean: 110, sd: 7 },
    launchAngleDeg: { mean: 22, sd: 3 },
    spinRpm: { mean: 8000, sd: 1000 },
  },
  'pitching-wedge': {
    ballSpeedMph: { mean: 102, sd: 6 },
    launchAngleDeg: { mean: 27, sd: 3 },
    spinRpm: { mean: 9000, sd: 1000 },
  },
  'sand-wedge': {
    ballSpeedMph: { mean: 90, sd: 6 },
    launchAngleDeg: { mean: 30, sd: 3 },
    spinRpm: { mean: 9500, sd: 1100 },
  },
  'lob-wedge': {
    ballSpeedMph: { mean: 80, sd: 6 },
    launchAngleDeg: { mean: 33, sd: 3.5 },
    spinRpm: { mean: 10000, sd: 1200 },
  },
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
