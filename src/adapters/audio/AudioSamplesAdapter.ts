/**
 * Audio samples adapter contract.
 *
 * The strike is an unmistakable transient in the sound track of every real
 * golf video, so audio is a free impact signal alongside the vision pipeline.
 * Implementations decode a video's audio track to mono float PCM: the native
 * adapter drives the platform decoder on-device, the fake synthesizes
 * deterministic PCM for tests. Consumers (audioImpactDetector) only need a
 * modest sample rate — transients survive heavy downsampling.
 */

export interface AudioSamples {
  sampleRate: number;
  channelCount: number;
  /** Mono PCM in [-1, 1]. */
  data: Float32Array;
  durationMs: number;
}

export interface AudioSamplesAdapter {
  getSamples(
    uri: string,
    options?: { startMs?: number; endMs?: number; targetSampleRate?: number },
  ): Promise<AudioSamples>;
}
