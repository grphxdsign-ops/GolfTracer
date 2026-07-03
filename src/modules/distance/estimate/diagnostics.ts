/**
 * Pure, JSON-serializable summary of a DistanceEstimateResult for the
 * Results screen's "Fit details" section and for offline validation reports
 * (the dtlGrid suite prints its aggregate table through this exact shape, so
 * what the user sees and what the grid validates are the same numbers).
 */
import type { EstimationMethod } from '../../../types';

import type { DistanceEstimateResult } from './estimateDistance';

export interface EstimateDiagnostics {
  method: EstimationMethod;
  carryYards: number;
  confidence: number;
  ballSpeedMph?: number;
  launchAngleDeg?: number;
  /** DTL fit: launch azimuth ψ, deg (+ = image-left). */
  azimuthDeg?: number;
  backspinRpm?: number;
  /** DTL fit: fitted camera pitch θ, deg (+ = tilted up). */
  cameraPitchDeg?: number;
  /** DTL fit: camera height derived from the tee ray + pitch, m. */
  cameraHeightM?: number;
  /** DTL fit: horizontal FOV used (user-fixed or fitted), deg. */
  hfovDeg?: number;
  /** Pixel RMS of whichever fit produced the estimate. */
  pixelRms?: number;
  rmsThreshold?: number;
  usedPoints?: number;
  /** DTL fit: max − min carry across the multi-start ensemble, yd. */
  carrySpreadYards?: number;
  ensembleSize?: number;
  teeSource?: 'tap' | 'extrapolated';
  /** Why the DTL fit declined (when it did). */
  declineReason?: string;
  /** Scale ladder rung of the camera model. */
  scaleSource?: string;
}

/**
 * Summarize an estimate into a flat diagnostic record. Pure — no I/O, no
 * mutation — and safe to JSON.stringify (Infinity RMS on declined fits is
 * mapped to undefined rather than serializing to null).
 */
export function summarizeEstimate(
  result: DistanceEstimateResult,
): EstimateDiagnostics {
  const dtl = result.dtlFit;
  const finiteOr = (v: number | undefined): number | undefined =>
    v !== undefined && Number.isFinite(v) ? v : undefined;

  const diagnostics: EstimateDiagnostics = {
    method: result.method,
    carryYards: result.carryYards,
    confidence: result.confidence,
    ballSpeedMph: result.ballSpeedMph,
    launchAngleDeg: result.launchAngleDeg,
    backspinRpm: result.backspinRpm,
    scaleSource: result.scaleSource,
  };

  if (dtl) {
    diagnostics.azimuthDeg = dtl.azimuthDeg;
    diagnostics.cameraPitchDeg = dtl.cameraPitchDeg;
    diagnostics.cameraHeightM = dtl.cameraHeightM;
    diagnostics.hfovDeg = dtl.hfovDeg;
    diagnostics.pixelRms = finiteOr(dtl.pixelRms);
    diagnostics.rmsThreshold = dtl.rmsThreshold;
    diagnostics.usedPoints = dtl.usedPoints;
    diagnostics.carrySpreadYards = dtl.carrySpreadYards;
    diagnostics.ensembleSize = dtl.ensembleSize;
    diagnostics.teeSource = dtl.teeSource;
    diagnostics.declineReason = dtl.declineReason;
  } else if (result.fit) {
    diagnostics.pixelRms = finiteOr(result.fit.pixelRms);
    diagnostics.rmsThreshold = result.fit.rmsThreshold;
    diagnostics.usedPoints = result.fit.usedPoints;
  }

  return diagnostics;
}
