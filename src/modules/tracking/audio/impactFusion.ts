/**
 * Audio/visual impact fusion.
 *
 * The visual impact detector can lock onto a pre-shot waggle (its baseline
 * z-score is gameable); the audio transient detector cannot, but audio alone
 * has no notion of where the ball is. Fusion policy:
 *  - agreement within tolerance → 'fused': trust the audio timestamp (sample
 *    clocks beat frame clocks) and combine confidences as independent
 *    detectors: 1 - (1-cv)·(1-ca);
 *  - weak visual vs strong audio → 'audio': the field failure mode where the
 *    waggle wins visually while the real strike is loud and unambiguous;
 *  - otherwise → 'visual' passthrough.
 */
import type { AudioImpactCandidate } from './audioImpactDetector';

export interface FusedImpact {
  timestampMs: number;
  confidence: number;
  source: 'visual' | 'audio' | 'fused';
}

export interface ImpactFusionOptions {
  /** Max audio/visual disagreement still counted as agreement. Default 80. */
  toleranceMs?: number;
}

const WEAK_VISUAL_CONFIDENCE = 0.5;
const STRONG_AUDIO_CONFIDENCE = 0.6;

export function fuseImpactCandidates(
  visual: { timestampMs: number; confidence: number },
  audio: AudioImpactCandidate[],
  options: ImpactFusionOptions = {},
): FusedImpact {
  const toleranceMs = options.toleranceMs ?? 80;

  // Agreement: the most confident audio candidate near the visual estimate.
  let agreeing: AudioImpactCandidate | null = null;
  for (const candidate of audio) {
    if (Math.abs(candidate.timestampMs - visual.timestampMs) > toleranceMs) {
      continue;
    }
    if (agreeing === null || candidate.confidence > agreeing.confidence) {
      agreeing = candidate;
    }
  }
  if (agreeing !== null) {
    return {
      timestampMs: agreeing.timestampMs,
      confidence: 1 - (1 - visual.confidence) * (1 - agreeing.confidence),
      source: 'fused',
    };
  }

  // Disagreement: a strong strike sound overrides a shaky visual pick.
  if (visual.confidence < WEAK_VISUAL_CONFIDENCE) {
    let strongest: AudioImpactCandidate | null = null;
    for (const candidate of audio) {
      if (strongest === null || candidate.confidence > strongest.confidence) {
        strongest = candidate;
      }
    }
    if (strongest !== null && strongest.confidence >= STRONG_AUDIO_CONFIDENCE) {
      return {
        timestampMs: strongest.timestampMs,
        confidence: strongest.confidence,
        source: 'audio',
      };
    }
  }

  return {
    timestampMs: visual.timestampMs,
    confidence: visual.confidence,
    source: 'visual',
  };
}
