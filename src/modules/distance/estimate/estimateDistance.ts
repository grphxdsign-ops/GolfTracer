/**
 * Distance estimation method ladder.
 *
 *   1. 'homography'  — a ground-plane homography exists AND the track saw
 *      the landing: measure the landing point directly (most robust).
 *   2. 'physics-fit' — the launch fit converged: simulate the fitted launch
 *      to carry, extrapolating partial/occluded tracks physically.
 *   2b. DTL 3D fit — behind/down-the-line views where the planar fit is
 *      geometrically hopeless: a full 3D projectile -> pinhole reprojection
 *      fit over (speed, angle, azimuth, camera pitch[, HFOV]) anchored by
 *      the ball-radius scale at the tee (see dtlFit.ts). Reported under the
 *      same 'physics-fit' method label with a `dtlFit` diagnostic; its
 *      confidence maps residual + ensemble spread + geometry provenance into
 *      (0.3, DTL_MAX_CONFIDENCE]. This rung replaced the old receding fit,
 *      which was measured to fabricate tiny carries at 0.50 confidence on
 *      real DTL clips (vertical-only, relative-anchored, first-observation-
 *      as-launch); `recedingFit?` stays declared for API back-compat but is
 *      never populated anymore.
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
  type ScaleSource,
  type VideoMeta,
} from '../calibration/calibrate';
import { applyHomography } from '../calibration/homography';
import { fitLaunchFromTrack, type LaunchFitResult } from './launchFit';
import type { RecedingFitResult } from './recedingFit';
import {
  DTL_MAX_CONFIDENCE,
  fitDtlLaunch,
  type DtlFitResult,
} from './dtlFit';

/** Optional per-shot inputs that ride alongside the calibration. */
export interface EstimateOptions {
  /**
   * The user's ball tap at address (native video px, from ballPointStore).
   * Anchors the DTL fit's tee ray; without it the tee pixel is extrapolated
   * from the track with a geometry-score penalty.
   */
  teePointPx?: { x: number; y: number };
}

/** DistanceEstimate plus diagnostics the Results screen can surface. */
export interface DistanceEstimateResult extends DistanceEstimate {
  backspinRpm?: number;
  flightTimeS?: number;
  landingAngleDeg?: number;
  fit?: LaunchFitResult;
  /**
   * @deprecated The receding rung was replaced by the DTL 3D fit (`dtlFit`).
   * Declared for API back-compat only — never populated anymore.
   */
  recedingFit?: RecedingFitResult;
  /** DTL 3D reprojection fit, when the rung was attempted (see dtlFit). */
  dtlFit?: DtlFitResult;
  /** Scale ladder rung the camera model resolved to (diagnostics). */
  scaleSource?: ScaleSource;
}

const QUALITY_FACTOR: Record<TrackQuality, number> = {
  high: 1,
  medium: 0.85,
  low: 0.6,
  failed: 0.3,
};

const SCALE_FACTOR: Record<ScaleSource, number> = {
  'ball-anchor': 0.9,
  homography: 0.85,
  'assumed-depth': 0.55,
};

const CLUB_PRIOR_MAX_CONFIDENCE = 0.3;
/**
 * A converged DTL fit below this confidence cannot meaningfully beat the
 * club prior's 0.3 cap — decline it as degenerate instead of surfacing it.
 */
const DTL_MIN_CONFIDENCE = 0.32;

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

/**
 * Pinned DTL confidence formula, mapping into (0.3, DTL_MAX_CONFIDENCE]:
 *   score_rms    = 1 − pixelRms/rmsThreshold
 *   score_spread = 1 − (carrySpread/carry)/0.30
 *   score_geom   = 1.0 (tap tee + user FOV/focal) | 0.85 (tap tee + fitted
 *                  FOV) | 0.70 (extrapolated tee)
 *   confidence   = 0.30 + 0.45·clamp01(0.45·rms + 0.35·spread + 0.20·geom)
 *                  ·QUALITY_FACTOR[quality]
 */
function dtlConfidence(
  model: CameraModel,
  quality: TrackQuality,
  dtl: DtlFitResult,
): number {
  const scoreRms = clamp01(1 - dtl.pixelRms / dtl.rmsThreshold);
  const scoreSpread = clamp01(
    1 - dtl.carrySpreadYards / Math.max(dtl.carryYards, 1e-9) / 0.3,
  );
  const fovKnown =
    model.focalSource === 'explicit' || model.focalSource === 'fov';
  const scoreGeom =
    dtl.teeSource === 'tap' ? (fovKnown ? 1.0 : 0.85) : 0.7;
  const confidence =
    0.3 +
    0.45 *
      clamp01(0.45 * scoreRms + 0.35 * scoreSpread + 0.2 * scoreGeom) *
      QUALITY_FACTOR[quality];
  return Math.min(confidence, DTL_MAX_CONFIDENCE);
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
 * All existing 3-arg call sites behave unchanged; `options` adds per-shot
 * extras (the ball-tap tee pixel) consumed by the DTL rung.
 */
export function estimateDistance(
  track: BallTrack,
  calibration: CalibrationInput,
  videoMeta: VideoMeta,
  options?: EstimateOptions,
): DistanceEstimateResult {
  const model = buildCalibration(calibration, videoMeta);
  const club = calibration.club;
  const modelScaleSource = scaleSource(model);

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
            scaleSource: modelScaleSource,
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
      scaleSource: modelScaleSource,
    };
  }

  // Rung 2b: DTL 3D reprojection fit for behind/down-the-line views where
  // the planar fit is geometrically unable to converge.
  let dtlFit: DtlFitResult | undefined;
  if (
    model.cameraAngle === 'behind' ||
    model.cameraAngle === 'down-the-line'
  ) {
    dtlFit = fitDtlLaunch(track, model, club, {
      teePointPx: options?.teePointPx,
    });
    if (dtlFit.converged) {
      const confidence = dtlConfidence(model, track.quality, dtlFit);
      if (confidence < DTL_MIN_CONFIDENCE) {
        // Never surface a fit that doesn't beat the prior's 0.3 cap.
        dtlFit = { ...dtlFit, converged: false, declineReason: 'degenerate' };
      } else {
        const flight = simulateFlight(dtlFit.launch);
        return {
          carryYards: dtlFit.carryYards,
          totalYards: totalFromCarry(
            dtlFit.carryYards,
            flight.landingAngleDeg,
            club,
          ),
          apexFeet: flight.apexFeet,
          ballSpeedMph: dtlFit.launch.ballSpeedMph,
          launchAngleDeg: dtlFit.launch.launchAngleDeg,
          backspinRpm: dtlFit.launch.backspinRpm,
          flightTimeS: flight.flightTimeS,
          landingAngleDeg: flight.landingAngleDeg,
          confidence,
          method: 'physics-fit',
          fit,
          dtlFit,
          scaleSource: modelScaleSource,
        };
      }
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
    dtlFit,
    scaleSource: modelScaleSource,
  };
}
