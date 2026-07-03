/**
 * In-memory AudioSamplesAdapter used in tests (and demos). Synthesizes a
 * deterministic mono clip: uniform background noise from a seeded PRNG plus
 * exponentially decaying sine bursts ("transients") at configured times —
 * a waggle-scale bump or a strike-scale crack, depending on amplitude.
 * getSamples() honors the startMs/endMs window and linearly resamples to
 * targetSampleRate, so detector tests can exercise the full options surface.
 */
import type { AudioSamples, AudioSamplesAdapter } from './AudioSamplesAdapter';

/**
 * Deterministic PRNG (mulberry32). Local copy — adapters must not import
 * tracking test utilities.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FakeTransientSpec {
  /** Onset time of the burst. */
  atMs: number;
  /** Peak amplitude in [-1, 1] units (compare against noiseAmp). */
  amplitude: number;
  /** Exponential decay time constant. Default 8. */
  decayMs?: number;
}

export interface FakeAudioSamplesAdapterOptions {
  /** Default 16000. */
  sampleRate?: number;
  durationMs: number;
  /** Uniform noise amplitude. Default 0.02. */
  noiseAmp?: number;
  /** PRNG seed. Default 1. */
  seed?: number;
  transients?: FakeTransientSpec[];
}

/** Sine carrier for the bursts; well below Nyquist at the default rate. */
const BURST_CARRIER_HZ = 2000;

export class FakeAudioSamplesAdapter implements AudioSamplesAdapter {
  private readonly sampleRate: number;
  private readonly durationMs: number;
  private readonly noiseAmp: number;
  private readonly seed: number;
  private readonly transients: FakeTransientSpec[];
  private cached: Float32Array | null = null;

  constructor(options: FakeAudioSamplesAdapterOptions) {
    this.sampleRate = options.sampleRate ?? 16000;
    this.durationMs = options.durationMs;
    this.noiseAmp = options.noiseAmp ?? 0.02;
    this.seed = options.seed ?? 1;
    this.transients = options.transients ?? [];
  }

  /** Full clip at the adapter's native rate, synthesized once. */
  private synthesize(): Float32Array {
    if (this.cached) return this.cached;
    const total = Math.round((this.durationMs / 1000) * this.sampleRate);
    const rng = mulberry32(this.seed);
    const data = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      data[i] = (rng() * 2 - 1) * this.noiseAmp;
    }
    for (const transient of this.transients) {
      const decayMs = transient.decayMs ?? 8;
      const start = Math.max(0, Math.round((transient.atMs / 1000) * this.sampleRate));
      // Past 8 time constants the burst is <0.04% of its peak — inaudible.
      const span = Math.round(((8 * decayMs) / 1000) * this.sampleRate);
      const end = Math.min(total, start + span);
      for (let i = start; i < end; i++) {
        const tMs = ((i - start) / this.sampleRate) * 1000;
        data[i] =
          data[i]! +
          transient.amplitude *
            Math.exp(-tMs / decayMs) *
            Math.sin((2 * Math.PI * BURST_CARRIER_HZ * tMs) / 1000);
      }
    }
    this.cached = data;
    return data;
  }

  async getSamples(
    _uri: string,
    options?: { startMs?: number; endMs?: number; targetSampleRate?: number },
  ): Promise<AudioSamples> {
    const startMs = Math.max(0, options?.startMs ?? 0);
    const endMs = Math.min(this.durationMs, options?.endMs ?? this.durationMs);
    const windowMs = Math.max(0, endMs - startMs);
    const full = this.synthesize();
    const start = Math.min(
      full.length,
      Math.round((startMs / 1000) * this.sampleRate),
    );
    const end = Math.min(full.length, Math.round((endMs / 1000) * this.sampleRate));
    const window = full.subarray(start, Math.max(start, end));

    const targetRate = options?.targetSampleRate ?? this.sampleRate;
    let data: Float32Array;
    if (targetRate === this.sampleRate) {
      data = new Float32Array(window);
    } else {
      // Linear interpolation resample — fidelity is irrelevant for tests.
      const outLength = Math.max(1, Math.round((windowMs / 1000) * targetRate));
      data = new Float32Array(outLength);
      const step = this.sampleRate / targetRate;
      for (let i = 0; i < outLength; i++) {
        const pos = i * step;
        const lo = Math.min(window.length - 1, Math.floor(pos));
        const hi = Math.min(window.length - 1, lo + 1);
        const frac = pos - lo;
        data[i] = (window[lo] ?? 0) * (1 - frac) + (window[hi] ?? 0) * frac;
      }
    }

    return {
      sampleRate: targetRate,
      channelCount: 1,
      data,
      durationMs: windowMs,
    };
  }
}
