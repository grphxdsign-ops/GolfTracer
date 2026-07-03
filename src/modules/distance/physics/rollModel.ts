/**
 * Empirical roll-out model: total distance from carry.
 *
 * Roll fraction decreases with landing (descent) angle and with the club's
 * typical spin: a driver landing shallow (~35–40 deg) on a fairway rolls out
 * ~8–12% of carry, while a high-spin wedge dropping steeply adds only
 * ~1–3%.
 */
import type { ClubType } from '../../../types';

import { CLUB_PRIORS } from './clubPriors';

export type Surface = 'fairway' | 'firm' | 'soft';

const SURFACE_MULTIPLIER: Record<Surface, number> = {
  fairway: 1,
  firm: 1.5,
  soft: 0.5,
};

/** Reference spin (rpm) at which the spin adjustment is neutral. */
const NEUTRAL_SPIN_RPM = 2500;
/** Roll reduction per 1000 rpm above neutral spin. */
const SPIN_ROLL_PENALTY_PER_KRPM = 0.006;

/**
 * Fraction of carry added as roll for a given landing angle, club, and
 * surface. Monotonically non-increasing in landing angle and in club spin.
 */
export function rollFraction(
  landingAngleDeg: number,
  club: ClubType,
  surface: Surface = 'fairway',
): number {
  // Base fraction: ~12% at a 33 deg landing, tapering to 0 near 53 deg.
  const base = (53 - landingAngleDeg) / 165;
  // Higher-spin clubs check up faster on landing.
  const spin = CLUB_PRIORS[club].spinRpm.mean;
  const spinPenalty =
    Math.max(spin - NEUTRAL_SPIN_RPM, 0) * (SPIN_ROLL_PENALTY_PER_KRPM / 1000);
  const fraction = (base - spinPenalty) * SURFACE_MULTIPLIER[surface];
  return Math.min(Math.max(fraction, 0.005), 0.2);
}

/**
 * Total distance (yards) from carry distance, landing angle, club, and
 * surface firmness.
 */
export function totalFromCarry(
  carryYards: number,
  landingAngleDeg: number,
  club: ClubType,
  surface: Surface = 'fairway',
): number {
  return carryYards * (1 + rollFraction(landingAngleDeg, club, surface));
}
