/**
 * Impact-frame detection via motion energy in a launch ROI.
 *
 * Before impact the launch area (ball on tee / grass) is essentially static,
 * so frame-to-frame difference energy inside the ROI stays at the sensor-noise
 * baseline. At impact the ball (and club head) move violently through the ROI
 * and the energy spikes.
 *
 * The baseline is GLOBAL and robust: median/MAD over the whole energy series.
 * The previous causal prefix mean/variance let a pre-shot waggle z-score
 * astronomically — its own early baseline sigma sat at the minSigma floor, so
 * the earliest weak spike won over a 40x-stronger real strike. Against the
 * global baseline the strike dominates: candidates are frames whose z exceeds
 * k AND whose energy clears an ROI-area-normalized floor, and the winner is
 * the ONSET of the contiguous candidate run containing the global argmax-z
 * frame (the strike smears energy over several frames — club sweep, ball
 * departure — and the first of them is contact). Waggles form separate,
 * weaker runs and lose.
 */
import type { VideoFrame } from '../../../types/media';
import { clampRoi, type Roi } from './imageOps';

export interface ImpactDetectionOptions {
  /** Sigma multiplier for the spike test. Default 5. */
  k?: number;
  /** Frames of baseline required before a spike can be declared. Default 5. */
  warmupFrames?: number;
  /**
   * Floor for the baseline σ so a perfectly static clip cannot divide by ~0.
   * Default 0.05 (grey levels/pixel); on noisy clips the 5%-of-median floor
   * dominates it anyway.
   */
  minSigma?: number;
  /**
   * Absolute mean-abs-diff floor (grey levels/pixel) for a valid spike. When
   * unset, defaults to 1500/(ROI area) clamped to [0.02, 0.5]: ~1500 grey·px
   * is a small ball's changed-pixel mass × contrast, so a ball-only crossing
   * still qualifies in a large high-resolution ROI while small-ROI behavior
   * keeps the old 0.5 floor.
   */
  minEnergy?: number;
}

export interface ImpactResult {
  /** Index into the `frames` array passed in (not `VideoFrame.index`). */
  frameIndex: number;
  /** 0..1; ≥0.5 means a statistically clear spike was found. */
  confidence: number;
  /** Per-frame motion energy (mean abs diff in ROI vs previous frame). */
  energies: number[];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Median of a non-empty array (mean of the middle two when even). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Mean absolute per-pixel difference between two frames inside an ROI. */
function roiEnergy(a: VideoFrame, b: VideoFrame, roi: Roi): number {
  let sum = 0;
  for (let y = roi.y; y < roi.y + roi.h; y++) {
    const row = y * a.width;
    for (let x = roi.x; x < roi.x + roi.w; x++) {
      sum += Math.abs(a.luma[row + x]! - b.luma[row + x]!);
    }
  }
  return sum / (roi.w * roi.h);
}

export function findImpactFrame(
  frames: VideoFrame[],
  launchRoi: Roi,
  options: ImpactDetectionOptions = {},
): ImpactResult {
  const k = options.k ?? 5;
  const warmup = options.warmupFrames ?? 5;
  const minSigmaOpt = options.minSigma ?? 0.05;

  if (frames.length < 2) {
    return { frameIndex: 0, confidence: 0, energies: [] };
  }

  const first = frames[0]!;
  const roi = clampRoi(launchRoi, first.width, first.height);

  // energies[i] = motion energy of frame i relative to frame i-1; energies[0]=0.
  const energies: number[] = [0];
  for (let i = 1; i < frames.length; i++) {
    energies.push(roiEnergy(frames[i]!, frames[i - 1]!, roi));
  }

  // Robust global baseline over energies[1..]: the strike occupies only a
  // handful of frames, so the median/MAD sit at the noise (or waggle) level
  // regardless of where in the clip the strike falls.
  const series = energies.slice(1);
  const baseline = median(series);
  const mad = median(series.map((e) => Math.abs(e - baseline)));
  const sigma = Math.max(1.4826 * mad, minSigmaOpt, 0.05 * baseline);

  // Energy floor: an explicit minEnergy wins verbatim; otherwise normalize a
  // fixed changed-pixel mass by the ROI area (see ImpactDetectionOptions).
  const floor =
    options.minEnergy ?? Math.min(0.5, Math.max(0.02, 1500 / (roi.w * roi.h)));

  const start = Math.max(2, warmup);
  const zOf = (i: number): number => (energies[i]! - baseline) / sigma;
  const qualifies = (i: number): boolean =>
    zOf(i) > k && energies[i]! > floor;

  // Global argmax-z over the eligible range. z is monotone in energy, so if
  // any frame qualifies, the argmax frame qualifies too.
  let bestZ = -Infinity;
  let bestIndex = 1;
  for (let i = start; i < frames.length; i++) {
    const z = zOf(i);
    if (z > bestZ) {
      bestZ = z;
      bestIndex = i;
    }
  }

  if (bestZ > -Infinity && qualifies(bestIndex)) {
    // Walk back to the onset of the contiguous qualifying run containing the
    // dominant spike — the first violent frame is the moment of contact.
    let onset = bestIndex;
    while (onset - 1 >= start && qualifies(onset - 1)) {
      onset--;
    }
    const zOnset = zOf(onset);
    // Confidence 0.5 at the detection threshold, saturating at z = 3k.
    return {
      frameIndex: onset,
      confidence: clamp01(0.5 + (zOnset - k) / (2 * k)),
      energies,
    };
  }

  // No clear spike: report the strongest candidate with low confidence.
  return {
    frameIndex: bestIndex,
    confidence: Math.min(0.45, clamp01((0.5 * Math.max(0, bestZ)) / k)),
    energies,
  };
}
