import { findImpactFrame } from '../impactDetector';
import { makeFlight } from '../../testutils/syntheticFrames';
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
