/**
 * Distance estimation method ladder.
 *
 *   1. 'homography'  — a ground-plane homography exists AND the track saw
 *      the landing: measure the landing point directly (most robust).
 *   2. 'physics-fit' — the launch fit converged: simulate the fitted launch
 *      to carry, extrapolating partial/occluded tracks physically.
 *   2b. receding fit — behind/down-the-line views where the planar fit is
 *      geometrically hopeless: a perspective reprojection fit of simulator
 *      trajectories (see recedingFit.ts). Reported under the same
 *      'physics-fit' method label with a `recedingFit` diagnostic, and
 *      confidence capped at RECEDING_MAX_CONFIDENCE.
 *   3. 'club-prior'  — honest fallback to the club's average launch,
 *      confidence capped at 0.3 and flagged distinctly in the UI (never
 *      pretend a guessed arc is a measurement).
 *
 * Confidence blends track quality, fit residual, and calibration richness.
 */
import type {
  BallTrack,
  CalibrationInput,
  DistanceEstimate,
  TrackQuality,
} from '../../../types';

import { priorLaunch } from '../physics/clubPriors';
import { simulateFlight, type FlightResult } from '../physics/simulator';
import { totalFromCarry } from '../physics/rollModel';
import {
  buildCalibration,
  scaleSource,
  type CameraModel,
  type VideoMeta,
} from '../calibration/calibrate';
import { applyHomography } from '../calibration/homography';
import { fitLaunchFromTrack, type LaunchFitResult } from './launchFit';
import {
  fitRecedingLaunch,
  RECEDING_MAX_CONFIDENCE,
  type RecedingFitResult,
} from './recedingFit';

/** DistanceEstimate plus diagnostics the Results screen can surface. */
export interface DistanceEstimateResult extends DistanceEstimate {
  backspinRpm?: number;
  flightTimeS?: number;
  landingAngleDeg?: number;
  fit?: LaunchFitResult;
  /** Receding-ball depth fit, when the rung was attempted (see recedingFit). */
  recedingFit?: RecedingFitResult;
}

const QUALITY_FACTOR: Record<TrackQuality, number> = {
  high: 1,
  medium: 0.85,
  low: 0.6,
  failed: 0.3,
};

const SCALE_FACTOR: Record<ReturnType<typeof scaleSource>, number> = {
  'ball-anchor': 0.9,
  homography: 0.85,
  'assumed-depth': 0.55,
};

const CLUB_PRIOR_MAX_CONFIDENCE = 0.3;

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

function recedingConfidence(
  quality: TrackQuality,
  rfit: RecedingFitResult,
): number {
  const rmsFactor = clamp01(1.2 - rfit.pixelRms / rfit.rmsThreshold);
  const pointFactor = clamp01(rfit.usedPoints / 16 + 0.5);
  return Math.min(
    RECEDING_MAX_CONFIDENCE,
    0.5 * QUALITY_FACTOR[quality] * rmsFactor * pointFactor,
  );
}

function homographyConfidence(
  model: CameraModel,
  quality: TrackQuality,
): number {
  const rms = model.homography?.rmsError ?? Number.POSITIVE_INFINITY;
  // rmsError is in yards; a couple of yards of reference error is still a
  // decent calibration, beyond ~5 yd it degrades quickly.
  const rmsFactor = clamp01(1 - rms / 6);
  return clamp01(0.95 * QUALITY_FACTOR[quality] * (0.5 + 0.5 * rmsFactor));
}

function physicsFitConfidence(
  model: CameraModel,
  quality: TrackQuality,
  fit: LaunchFitResult,
): number {
  const rmsFactor = clamp01(1.2 - fit.pixelRms / fit.rmsThreshold);
  const pointFactor = clamp01(fit.usedPoints / 25);
  return clamp01(
    0.85 *
      QUALITY_FACTOR[quality] *
      SCALE_FACTOR[scaleSource(model)] *
      (0.4 + 0.6 * rmsFactor) *
      (0.5 + 0.5 * pointFactor),
  );
}

/**
 * Estimate carry/total distance for a tracked shot. Never throws on poor
 * data — degrades down the method ladder and reports honest confidence.
 */
export function estimateDistance(
  track: BallTrack,
  calibration: CalibrationInput,
  videoMeta: VideoMeta,
): DistanceEstimateResult {
  const model = buildCalibration(calibration, videoMeta);
  const club = calibration.club;

  const fit = fitLaunchFromTrack(track, model, club);
  const fittedFlight: FlightResult | null = fit.converged
    ? simulateFlight(fit.launch)
    : null;

  // Rung 1: homography + tracked landing point -> direct measurement.
  if (model.homography && track.landingPointIndex !== undefined) {
    const landingPt = track.smoothedPath[track.landingPointIndex];
    if (landingPt) {
      try {
        const world = applyHomography(model.homography.H, {
          x: landingPt.x,
          y: landingPt.y,
        });
        const carryYards = Math.hypot(world.x, world.y);
        if (Number.isFinite(carryYards) && carryYards > 0) {
          const flight = fittedFlight ?? simulateFlight(priorLaunch(club));
          return {
            carryYards,
            totalYards: totalFromCarry(
              carryYards,
              flight.landingAngleDeg,
              club,
            ),
            apexFeet: fittedFlight?.apexFeet,
            ballSpeedMph: fittedFlight ? fit.launch.ballSpeedMph : undefined,
            launchAngleDeg: fittedFlight
              ? fit.launch.launchAngleDeg
              : undefined,
            backspinRpm: fittedFlight ? fit.launch.backspinRpm : undefined,
            flightTimeS: fittedFlight?.flightTimeS,
            landingAngleDeg: flight.landingAngleDeg,
            confidence: homographyConfidence(model, track.quality),
            method: 'homography',
            fit,
          };
        }
      } catch (_err) {
        // Landing point maps to infinity — fall through the ladder.
      }
    }
  }

  // Rung 2: converged physics fit -> simulate the fitted launch.
  if (fittedFlight) {
    return {
      carryYards: fittedFlight.carryYards,
      totalYards: totalFromCarry(
        fittedFlight.carryYards,
        fittedFlight.landingAngleDeg,
        club,
      ),
      apexFeet: fittedFlight.apexFeet,
      ballSpeedMph: fit.launch.ballSpeedMph,
      launchAngleDeg: fit.launch.launchAngleDeg,
      backspinRpm: fit.launch.backspinRpm,
      flightTimeS: fittedFlight.flightTimeS,
      landingAngleDeg: fittedFlight.landingAngleDeg,
      confidence: physicsFitConfidence(model, track.quality, fit),
      method: 'physics-fit',
      fit,
    };
  }

  // Rung 2b: perspective (receding-ball) fit for behind/down-the-line views
  // where the planar fit is geometrically unable to converge.
  let recedingFit: RecedingFitResult | undefined;
  if (
    !fittedFlight &&
    (model.cameraAngle === 'behind' || model.cameraAngle === 'down-the-line')
  ) {
    recedingFit = fitRecedingLaunch(track, model, club);
    if (recedingFit.converged) {
      const flight = simulateFlight(recedingFit.launch);
      return {
        carryYards: flight.carryYards,
        totalYards: totalFromCarry(
          flight.carryYards,
          flight.landingAngleDeg,
          club,
        ),
        apexFeet: flight.apexFeet,
        ballSpeedMph: recedingFit.launch.ballSpeedMph,
        launchAngleDeg: recedingFit.launch.launchAngleDeg,
        backspinRpm: recedingFit.launch.backspinRpm,
        flightTimeS: flight.flightTimeS,
        landingAngleDeg: flight.landingAngleDeg,
        confidence: recedingConfidence(track.quality, recedingFit),
        method: 'physics-fit',
        fit,
        recedingFit,
      };
    }
  }

  // Rung 3: honest fallback to the club prior.
  const launch = priorLaunch(club);
  const flight = simulateFlight(launch);
  return {
    carryYards: flight.carryYards,
    totalYards: totalFromCarry(flight.carryYards, flight.landingAngleDeg, club),
    apexFeet: flight.apexFeet,
    ballSpeedMph: launch.ballSpeedMph,
    launchAngleDeg: launch.launchAngleDeg,
    backspinRpm: launch.backspinRpm,
    flightTimeS: flight.flightTimeS,
    landingAngleDeg: flight.landingAngleDeg,
    confidence: Math.min(
      CLUB_PRIOR_MAX_CONFIDENCE,
      CLUB_PRIOR_MAX_CONFIDENCE * QUALITY_FACTOR[track.quality],
    ),
    method: 'club-prior',
    fit,
    recedingFit,
  };
}
