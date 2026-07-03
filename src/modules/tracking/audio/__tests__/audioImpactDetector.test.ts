/**
 * Field-evidence recreation: on a real 30fps clip the golfer waggled ~1.3s
 * before the strike and the visual impact detector picked the waggle. The
 * audio track is unambiguous — a soft waggle-scale bump must never outrank
 * the strike transient, and pure noise must produce no candidates.
 */
import type { AudioSamples } from '../../../../adapters/audio/AudioSamplesAdapter';
import { FakeAudioSamplesAdapter } from '../../../../adapters/audio/FakeAudioSamplesAdapter';
import { findAudioImpactCandidates } from '../audioImpactDetector';

async function synth(
  durationMs: number,
  transients: { atMs: number; amplitude: number; decayMs?: number }[],
  seed = 1234,
): Promise<AudioSamples> {
  const adapter = new FakeAudioSamplesAdapter({
    durationMs,
    noiseAmp: 0.02,
    seed,
    transients,
  });
  return adapter.getSamples('memory://clip');
}

describe('findAudioImpactCandidates', () => {
  it('ranks the strike above a waggle-scale bump 1.3s earlier', async () => {
    // Waggle: soft, ~3x noise. Strike: sharp, ~30x noise.
    const samples = await synth(2500, [
      { atMs: 500, amplitude: 0.06, decayMs: 25 },
      { atMs: 1800, amplitude: 0.6, decayMs: 8 },
    ]);
    const candidates = findAudioImpactCandidates(samples);

    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const top = candidates[0]!;
    expect(Math.abs(top.timestampMs - 1800)).toBeLessThanOrEqual(15);
    expect(top.confidence).toBeGreaterThan(0.7);

    // The waggle is either absent or strictly below the strike.
    for (const candidate of candidates.slice(1)) {
      expect(candidate.confidence).toBeLessThan(top.confidence);
    }
    const nearWaggle = candidates.filter(
      (c) => Math.abs(c.timestampMs - 500) <= 50,
    );
    for (const candidate of nearWaggle) {
      expect(candidate).not.toBe(top);
    }
  });

  it('finds nothing in pure noise', async () => {
    const samples = await synth(2000, []);
    const candidates = findAudioImpactCandidates(samples);
    for (const candidate of candidates) {
      expect(candidate.confidence).toBeLessThan(0.5);
    }
    expect(candidates).toHaveLength(0);
  });

  it('returns both strikes 2s apart and suppresses side-lobes within minGapMs', async () => {
    const samples = await synth(4000, [
      { atMs: 1000, amplitude: 0.6, decayMs: 8 },
      { atMs: 3000, amplitude: 0.55, decayMs: 8 },
    ]);
    const candidates = findAudioImpactCandidates(samples);

    const near = (t: number) =>
      candidates.filter((c) => Math.abs(c.timestampMs - t) <= 15);
    expect(near(1000)).toHaveLength(1);
    expect(near(3000)).toHaveLength(1);

    // minGapMs: no two accepted candidates closer than 250ms.
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        expect(
          Math.abs(candidates[i]!.timestampMs - candidates[j]!.timestampMs),
        ).toBeGreaterThanOrEqual(250);
      }
    }
  });

  it('caps the list at maxCandidates, strongest first', async () => {
    const samples = await synth(4000, [
      { atMs: 500, amplitude: 0.3, decayMs: 8 },
      { atMs: 1500, amplitude: 0.6, decayMs: 8 },
      { atMs: 2500, amplitude: 0.45, decayMs: 8 },
      { atMs: 3500, amplitude: 0.5, decayMs: 8 },
    ]);
    const candidates = findAudioImpactCandidates(samples, { maxCandidates: 2 });
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.confidence).toBeGreaterThanOrEqual(
      candidates[1]!.confidence,
    );
    expect(Math.abs(candidates[0]!.timestampMs - 1500)).toBeLessThanOrEqual(15);
  });

  it('returns an empty list for clips shorter than two windows', () => {
    const samples: AudioSamples = {
      sampleRate: 16000,
      channelCount: 1,
      data: new Float32Array(100),
      durationMs: 6.25,
    };
    expect(findAudioImpactCandidates(samples)).toEqual([]);
  });
});
