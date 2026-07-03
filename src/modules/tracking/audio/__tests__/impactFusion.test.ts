import { fuseImpactCandidates } from '../impactFusion';

describe('fuseImpactCandidates', () => {
  it('fuses agreeing candidates: audio timestamp, boosted confidence', () => {
    const fused = fuseImpactCandidates(
      { timestampMs: 1810, confidence: 0.6 },
      [{ timestampMs: 1800, confidence: 0.9 }],
    );
    expect(fused.source).toBe('fused');
    expect(fused.timestampMs).toBe(1800);
    // 1 - (1 - 0.6)(1 - 0.9) = 0.96 — above both inputs.
    expect(fused.confidence).toBeCloseTo(0.96, 10);
    expect(fused.confidence).toBeGreaterThan(0.9);
  });

  it('prefers the most confident agreeing candidate within tolerance', () => {
    const fused = fuseImpactCandidates(
      { timestampMs: 1800, confidence: 0.6 },
      [
        { timestampMs: 1750, confidence: 0.4 },
        { timestampMs: 1820, confidence: 0.9 },
      ],
    );
    expect(fused.source).toBe('fused');
    expect(fused.timestampMs).toBe(1820);
  });

  it('resolves the waggle failure mode: weak visual loses to strong audio', () => {
    // Field evidence: visual locked onto a waggle at 500ms (confidence 0.3)
    // while the strike is a loud transient at 1800ms.
    const fused = fuseImpactCandidates(
      { timestampMs: 500, confidence: 0.3 },
      [{ timestampMs: 1800, confidence: 0.95 }],
    );
    expect(fused.source).toBe('audio');
    expect(fused.timestampMs).toBe(1800);
    expect(fused.confidence).toBe(0.95);
  });

  it('keeps a confident visual pick despite disagreeing audio', () => {
    const fused = fuseImpactCandidates(
      { timestampMs: 500, confidence: 0.8 },
      [{ timestampMs: 1800, confidence: 0.95 }],
    );
    expect(fused.source).toBe('visual');
    expect(fused.timestampMs).toBe(500);
    expect(fused.confidence).toBe(0.8);
  });

  it('keeps a weak visual pick when the disagreeing audio is also weak', () => {
    const fused = fuseImpactCandidates(
      { timestampMs: 500, confidence: 0.3 },
      [{ timestampMs: 1800, confidence: 0.55 }],
    );
    expect(fused.source).toBe('visual');
    expect(fused.timestampMs).toBe(500);
  });

  it('passes the visual candidate through when there is no audio', () => {
    const fused = fuseImpactCandidates(
      { timestampMs: 1234, confidence: 0.42 },
      [],
    );
    expect(fused).toEqual({
      timestampMs: 1234,
      confidence: 0.42,
      source: 'visual',
    });
  });

  it('honors a custom toleranceMs', () => {
    const wide = fuseImpactCandidates(
      { timestampMs: 1800, confidence: 0.6 },
      [{ timestampMs: 1950, confidence: 0.9 }],
      { toleranceMs: 200 },
    );
    expect(wide.source).toBe('fused');
    const narrow = fuseImpactCandidates(
      { timestampMs: 1800, confidence: 0.6 },
      [{ timestampMs: 1950, confidence: 0.9 }],
      { toleranceMs: 80 },
    );
    expect(narrow.source).toBe('visual');
  });
});
