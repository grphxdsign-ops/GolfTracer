/**
 * Impact-frame detection via motion energy in a launch ROI.
 *
 * Before impact the launch area (ball on tee / grass) is essentially static,
 * so frame-to-frame difference energy inside the ROI stays at the sensor-noise
 * baseline. At impact the ball (and club head) move violently through the ROI
 * and the energy spikes. Impact = the first frame whose energy exceeds
 * mean + k·σ of the preceding baseline.
 */
import type { VideoFrame } from '../../../types/media';
import { clampRoi, type Roi } from './imageOps';

export interface ImpactDetectionOptions {
  /** Sigma multiplier for the spike test. Default 5. */
  k?: number;
  /** Frames of baseline required before a spike can be declared. Default 5. */
  warmupFrames?: number;
  /** Floor for the baseline σ so a perfectly static clip cannot divide by ~0. */
  minSigma?: number;
  /** Absolute mean-abs-diff floor (grey levels/pixel) for a valid spike. */
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
  const minSigmaOpt = options.minSigma ?? 0.15;
  const minEnergy = options.minEnergy ?? 0.5;

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

  let bestZ = -Infinity;
  let bestIndex = 1;
  for (let i = Math.max(2, warmup); i < frames.length; i++) {
    // Baseline: energies of frames 1..i-1.
    let mean = 0;
    const n = i - 1;
    for (let j = 1; j < i; j++) mean += energies[j]!;
    mean /= n;
    let variance = 0;
    for (let j = 1; j < i; j++) {
      const d = energies[j]! - mean;
      variance += d * d;
    }
    const sigma = Math.max(Math.sqrt(variance / n), minSigmaOpt, 0.05 * mean);
    const z = (energies[i]! - mean) / sigma;
    if (z > bestZ) {
      bestZ = z;
      bestIndex = i;
    }
    if (z > k && energies[i]! > minEnergy) {
      // Confidence 0.5 at the detection threshold, saturating at z = 3k.
      const confidence = clamp01(0.5 + (z - k) / (2 * k));
      return { frameIndex: i, confidence, energies };
    }
  }

  // No clear spike: report the strongest candidate with low confidence.
  return {
    frameIndex: bestIndex,
    confidence: Math.min(0.45, clamp01((0.5 * Math.max(0, bestZ)) / k)),
    energies,
  };
}
