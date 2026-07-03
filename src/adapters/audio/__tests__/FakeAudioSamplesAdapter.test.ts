import type { AudioSamples } from '../AudioSamplesAdapter';
import { FakeAudioSamplesAdapter } from '../FakeAudioSamplesAdapter';

/** RMS of the samples inside [startMs, endMs). */
function rmsWindow(samples: AudioSamples, startMs: number, endMs: number): number {
  const start = Math.round((startMs / 1000) * samples.sampleRate);
  const end = Math.min(
    samples.data.length,
    Math.round((endMs / 1000) * samples.sampleRate),
  );
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples.data[i]! * samples.data[i]!;
  return Math.sqrt(sum / Math.max(1, end - start));
}

describe('FakeAudioSamplesAdapter', () => {
  it('emits the configured length, rate, and mono channel', async () => {
    const adapter = new FakeAudioSamplesAdapter({ durationMs: 2000, seed: 7 });
    const samples = await adapter.getSamples('memory://clip');
    expect(samples.sampleRate).toBe(16000);
    expect(samples.channelCount).toBe(1);
    expect(samples.durationMs).toBe(2000);
    expect(samples.data).toHaveLength(32000);
  });

  it('is deterministic: same seed and spec produce identical PCM', async () => {
    const spec = {
      durationMs: 500,
      seed: 42,
      transients: [{ atMs: 200, amplitude: 0.5 }],
    };
    const a = await new FakeAudioSamplesAdapter(spec).getSamples('memory://a');
    const b = await new FakeAudioSamplesAdapter(spec).getSamples('memory://b');
    expect(a.data).toEqual(b.data);
  });

  it('keeps noise-only samples in the noiseAmp range', async () => {
    const adapter = new FakeAudioSamplesAdapter({
      durationMs: 300,
      noiseAmp: 0.02,
      seed: 3,
    });
    const samples = await adapter.getSamples('memory://noise');
    for (const s of samples.data) {
      // Tiny epsilon for float32 rounding of values just below the bound.
      expect(Math.abs(s)).toBeLessThanOrEqual(0.02 + 1e-6);
    }
  });

  it('places a decaying burst at the configured transient time', async () => {
    const adapter = new FakeAudioSamplesAdapter({
      durationMs: 1000,
      noiseAmp: 0.02,
      seed: 11,
      transients: [{ atMs: 600, amplitude: 0.6, decayMs: 8 }],
    });
    const samples = await adapter.getSamples('memory://burst');
    const before = rmsWindow(samples, 500, 590);
    const attack = rmsWindow(samples, 600, 615);
    const tail = rmsWindow(samples, 640, 700);
    // Order-of-magnitude jump at onset, decayed well down 40ms later.
    expect(attack).toBeGreaterThan(10 * before);
    expect(tail).toBeLessThan(attack / 4);
  });

  it('honors the startMs/endMs window', async () => {
    const adapter = new FakeAudioSamplesAdapter({
      durationMs: 1000,
      seed: 5,
      transients: [{ atMs: 500, amplitude: 0.5 }],
    });
    const full = await adapter.getSamples('memory://clip');
    const windowed = await adapter.getSamples('memory://clip', {
      startMs: 400,
      endMs: 700,
    });
    expect(windowed.durationMs).toBe(300);
    expect(windowed.data).toHaveLength(4800);
    const offset = Math.round(0.4 * 16000);
    expect(Array.from(windowed.data)).toEqual(
      Array.from(full.data.slice(offset, offset + 4800)),
    );
  });

  it('resamples to targetSampleRate', async () => {
    const adapter = new FakeAudioSamplesAdapter({
      durationMs: 1000,
      seed: 9,
      transients: [{ atMs: 500, amplitude: 0.6 }],
    });
    const samples = await adapter.getSamples('memory://clip', {
      targetSampleRate: 8000,
    });
    expect(samples.sampleRate).toBe(8000);
    expect(samples.data).toHaveLength(8000);
    // The burst survives resampling at its original position.
    expect(rmsWindow(samples, 500, 515)).toBeGreaterThan(
      5 * rmsWindow(samples, 400, 490),
    );
  });
});
