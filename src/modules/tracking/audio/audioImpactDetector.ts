/**
 * Audio impact detection via short-time RMS onset analysis.
 *
 * The club strike is a sharp broadband transient: the RMS envelope jumps by
 * an order of magnitude within one window and decays in a few tens of
 * milliseconds. Detection: short-time RMS envelope → onset novelty
 * max(0, e[i] - e[i-1]) → z-score against the envelope's median/MAD (both
 * robust to the transient itself, unlike a mean/σ baseline that a waggle can
 * game) → peak-pick above k with minGapMs suppression of side-lobes.
 * Candidates come back sorted by confidence so fusion can trust index 0.
 */
import type { AudioSamples } from '../../../adapters/audio/AudioSamplesAdapter';

export interface AudioImpactCandidate {
  timestampMs: number;
  /** 0..1; ≥0.5 means the onset cleared the detection threshold. */
  confidence: number;
}

export interface AudioImpactOptions {
  /** RMS window length. Default 10. */
  windowMs?: number;
  /** Hop between windows. Default 5. */
  hopMs?: number;
  /** Robust z-score threshold for a valid onset. Default 6. */
  k?: number;
  /** Maximum candidates returned. Default 3. */
  maxCandidates?: number;
  /** Minimum spacing between candidates (suppresses side-lobes). Default 250. */
  minGapMs?: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function findAudioImpactCandidates(
  samples: AudioSamples,
  options: AudioImpactOptions = {},
): AudioImpactCandidate[] {
  const windowMs = options.windowMs ?? 10;
  const hopMs = options.hopMs ?? 5;
  const k = options.k ?? 6;
  const maxCandidates = options.maxCandidates ?? 3;
  const minGapMs = options.minGapMs ?? 250;

  const { data, sampleRate } = samples;
  const window = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
  const hop = Math.max(1, Math.round((hopMs / 1000) * sampleRate));
  if (data.length < window * 2) return [];

  // Short-time RMS envelope; envelope[i] covers samples [i·hop, i·hop+window).
  const frameCount = Math.floor((data.length - window) / hop) + 1;
  const envelope: number[] = new Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const start = i * hop;
    let sum = 0;
    for (let j = start; j < start + window; j++) {
      const s = data[j]!;
      sum += s * s;
    }
    envelope[i] = Math.sqrt(sum / window);
  }

  // Onset novelty: positive envelope rise only — decays are not onsets.
  const novelty: number[] = new Array(frameCount).fill(0);
  for (let i = 1; i < frameCount; i++) {
    novelty[i] = Math.max(0, envelope[i]! - envelope[i - 1]!);
  }

  // Robust scale from the envelope: median/MAD ignore the short transient,
  // so the strike cannot inflate its own baseline (the visual detector's
  // waggle failure mode). Floor the scale so silence cannot divide by ~0.
  const med = median(envelope);
  const mad = median(envelope.map((e) => Math.abs(e - med)));
  const sigma = Math.max(1.4826 * mad, 0.05 * med, 1e-6);

  // Local novelty maxima above the threshold, strongest first.
  const peaks: { index: number; z: number }[] = [];
  for (let i = 1; i < frameCount; i++) {
    const z = (novelty[i]! - med) / sigma;
    if (z <= k) continue;
    if (novelty[i]! < (novelty[i - 1] ?? 0)) continue;
    if (novelty[i]! < (novelty[i + 1] ?? 0)) continue;
    peaks.push({ index: i, z });
  }
  peaks.sort((a, b) => b.z - a.z);

  const toTimestampMs = (index: number): number =>
    ((index * hop + window / 2) / sampleRate) * 1000;

  const accepted: AudioImpactCandidate[] = [];
  for (const peak of peaks) {
    if (accepted.length >= maxCandidates) break;
    const timestampMs = toTimestampMs(peak.index);
    const clash = accepted.some(
      (c) => Math.abs(c.timestampMs - timestampMs) < minGapMs,
    );
    if (clash) continue;
    // Monotone in z: 0.5 at the threshold, saturating toward 1 so a strike
    // (z in the hundreds) always outranks a waggle (z barely above k).
    accepted.push({ timestampMs, confidence: peak.z / (peak.z + k) });
  }
  return accepted;
}
