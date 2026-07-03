import { findImpactFrame } from '../impactDetector';
import { makeFlight, mulberry32, renderFrame } from '../../testutils/syntheticFrames';
import type { VideoFrame } from '../../../../types/media';
import type { Roi } from '../imageOps';

function launchRoiFor(launch: { x: number; y: number }): Roi {
  return { x: launch.x - 60, y: launch.y - 70, w: 130, h: 100 };
}

// Rendering synthetic video is the expensive part — share one flight.
const flight = makeFlight();
const result = findImpactFrame(flight.frames, launchRoiFor(flight.spec.launch));

describe('findImpactFrame', () => {
  it('finds the impact frame within ±1 on a synthetic flight', () => {
    expect(Math.abs(result.frameIndex - flight.impactIndex)).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('finds impact for a later tee-off too', () => {
    const late = makeFlight({ preImpactFrames: 25, flightFrames: 20, seed: 77 });
    const r = findImpactFrame(late.frames, launchRoiFor(late.spec.launch));
    expect(Math.abs(r.frameIndex - late.impactIndex)).toBeLessThanOrEqual(1);
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('reports low confidence when nothing ever moves', () => {
    const still = makeFlight({ flightFrames: 0, preImpactFrames: 30, seed: 9 });
    const r = findImpactFrame(still.frames, launchRoiFor(still.spec.launch));
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('handles degenerate inputs', () => {
    const tiny = makeFlight({ preImpactFrames: 1, flightFrames: 0 });
    const r = findImpactFrame(tiny.frames, launchRoiFor(tiny.spec.launch));
    expect(r.frameIndex).toBe(0);
    expect(r.confidence).toBe(0);
  });

  it('exposes the per-frame energy series with a spike at impact', () => {
    expect(result.energies.length).toBe(flight.frames.length);
    expect(result.energies[0]).toBe(0);
    // Energy at impact clearly exceeds the static (noise-only) baseline.
    const baseline = result.energies[Math.floor(flight.impactIndex / 2)]!;
    expect(result.energies[result.frameIndex]!).toBeGreaterThan(baseline * 1.5);
  });
});

describe('findImpactFrame waggle rejection (field evidence #1)', () => {
  // 30 fps-scale recreation of the measured failure: the golfer waggles the
  // club well before the strike. Frames 0..50: static scene with the ball on
  // the tee, a dark clubhead oscillating ±5px during frames 5..40 (per-frame
  // energies ~0.5-1.2), then a strike at frame 46 (ball + clubhead leaving
  // the tee, energy ~20-40x the waggle level).
  const WAGGLE_START = 5;
  const WAGGLE_END = 40;
  const STRIKE = 46;
  const roi: Roi = { x: 190, y: 150, w: 130, h: 100 };

  function waggleClip(): VideoFrame[] {
    const rng = mulberry32(21);
    const frames: VideoFrame[] = [];
    const club = { x: 250, y: 205 };
    const ball = { x: 250, y: 228 };
    for (let i = 0; i <= 50; i++) {
      const discs = [];
      const rects = [];
      if (i < STRIKE) {
        discs.push({ cx: ball.x, cy: ball.y, r: 4, luma: 235 });
        const phase =
          i >= WAGGLE_START && i <= WAGGLE_END
            ? Math.sin(0.9 * (i - WAGGLE_START))
            : 0;
        discs.push({ cx: club.x + 5 * phase, cy: club.y, r: 9, luma: 20 });
      } else {
        // Strike: the ball departs fast and the clubhead sweeps through.
        const t = i - STRIKE + 1;
        discs.push({ cx: ball.x + 12 * t, cy: ball.y - 22 * t, r: 4, luma: 235 });
        rects.push({ x: 210 + 35 * t, y: 195, w: 30, h: 30, luma: 230 });
      }
      frames.push(
        renderFrame({
          index: i,
          timestampMs: i * 33.3,
          width: 480,
          height: 270,
          discs,
          rects,
          noiseAmp: 0.6,
          rng,
        }),
      );
    }
    return frames;
  }

  const clip = waggleClip();
  const r = findImpactFrame(clip, roi);

  it('picks the strike, not the earlier waggle', () => {
    expect(Math.abs(r.frameIndex - STRIKE)).toBeLessThanOrEqual(1);
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('recreates the old-code failure: the waggle passed the old floor', () => {
    // Most waggle frames exceed the old absolute minEnergy floor (0.5), so
    // the old detector's energy gate would not have saved it...
    const waggleEnergies = r.energies.slice(WAGGLE_START + 1, WAGGLE_END + 1);
    expect(waggleEnergies.filter((e) => e > 0.5).length).toBeGreaterThan(15);
    // ...and under the old causal prefix mean/σ rule (σ floored at 0.15) the
    // waggle onset z-scored past k=5 against its own quiet early baseline,
    // so the old code declared impact ~1.3s early. Replicate that rule:
    let oldPick = -1;
    for (let i = 5; i < clip.length && oldPick < 0; i++) {
      const prefix = r.energies.slice(1, i);
      const mean = prefix.reduce((a, b) => a + b, 0) / prefix.length;
      const variance =
        prefix.reduce((a, b) => a + (b - mean) * (b - mean), 0) / prefix.length;
      const sigma = Math.max(Math.sqrt(variance), 0.15, 0.05 * mean);
      if ((r.energies[i]! - mean) / sigma > 5 && r.energies[i]! > 0.5) {
        oldPick = i;
      }
    }
    expect(oldPick).toBeGreaterThanOrEqual(WAGGLE_START);
    expect(oldPick).toBeLessThan(WAGGLE_END);

    // The strike really is the dominant spike the waggle should lose to.
    const maxWaggle = Math.max(...waggleEnergies);
    expect(maxWaggle).toBeLessThan(1.5);
    expect(r.energies[STRIKE + 1]!).toBeGreaterThan(10 * maxWaggle);
  });
});

describe('findImpactFrame ROI-area-normalized energy floor (field evidence #1b)', () => {
  // A 3px ball crossing a 400x300 ROI changes ~55 px of ~120000 (per-pixel
  // energy ~0.05-0.08): the old absolute 0.5 floor could never qualify it.
  // minSigma is pinned low in both calls so the comparison isolates the floor.
  function crossingClip(): VideoFrame[] {
    const rng = mulberry32(3);
    const frames: VideoFrame[] = [];
    for (let i = 0; i < 30; i++) {
      const discs =
        i >= 18 && i <= 24
          ? [{ cx: 60 + 15 * (i - 18), cy: 180, r: 3, luma: 235 }]
          : [];
      frames.push(
        renderFrame({
          index: i,
          timestampMs: i * 33.3,
          width: 480,
          height: 360,
          discs,
          noiseAmp: 0,
          rng,
        }),
      );
    }
    return frames;
  }

  const clip = crossingClip();
  const roi: Roi = { x: 40, y: 30, w: 400, h: 300 };

  it('detects the crossing when minEnergy is unset (floor scales with ROI area)', () => {
    const r = findImpactFrame(clip, roi, { minSigma: 0.005 });
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(Math.abs(r.frameIndex - 18)).toBeLessThanOrEqual(1);
  });

  it('does not detect it when the old absolute floor is passed explicitly', () => {
    const r = findImpactFrame(clip, roi, { minSigma: 0.005, minEnergy: 0.5 });
    expect(r.confidence).toBeLessThan(0.5);
  });
});
