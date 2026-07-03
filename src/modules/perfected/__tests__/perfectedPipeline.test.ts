/**
 * Pipeline tests: the full measured-motion -> morph -> perfected-flight
 * assembly of a PerfectedResult, including the strength-blended launch.
 */
import { simulateBallFlight } from '../../sports/engine/ballFlight';
import { getSportProfile } from '../../sports/engine/sportProfile';
import { BIOMECH_TARGETS } from '../morph/targets';
import {
  blendLaunch,
  buildPerfectedResult,
  demoMeasuredFrames,
} from '../perfectedPipeline';

describe('blendLaunch', () => {
  const baseline = BIOMECH_TARGETS.soccer.baselineLaunch;
  const perfected = BIOMECH_TARGETS.soccer.perfectedLaunch;

  it('returns the endpoints at strengths 0 and 1', () => {
    expect(blendLaunch(baseline, perfected, 0).speedMps).toBe(baseline.speedMps);
    expect(blendLaunch(baseline, perfected, 1).speedMps).toBe(perfected.speedMps);
  });

  it('interpolates linearly in between', () => {
    const mid = blendLaunch(baseline, perfected, 0.5);
    expect(mid.speedMps).toBeCloseTo(
      (baseline.speedMps + perfected.speedMps) / 2,
      9,
    );
    expect(mid.launchAngleDeg).toBeCloseTo(
      (baseline.launchAngleDeg + perfected.launchAngleDeg) / 2,
      9,
    );
    expect(mid.spinRpm).toBeCloseTo(
      ((baseline.spinRpm ?? 0) + (perfected.spinRpm ?? 0)) / 2,
      9,
    );
  });
});

describe('buildPerfectedResult', () => {
  it('simulates the fully perfected launch at strength 1', () => {
    const result = buildPerfectedResult({
      sport: 'soccer',
      measuredFrames: demoMeasuredFrames(),
      strength: 1,
    });
    const expected = simulateBallFlight(
      BIOMECH_TARGETS.soccer.perfectedLaunch,
      getSportProfile('soccer').ball,
    );
    expect(result.sport).toBe('soccer');
    expect(result.flight.rangeM).toBeCloseTo(expected.rangeM, 9);
    expect(result.flight.flightTimeS).toBeCloseTo(expected.flightTimeS, 9);
  });

  it('seeds the baseline launch with the measured take speed', () => {
    const measured = demoMeasuredFrames();
    const result = buildPerfectedResult({
      sport: 'soccer',
      measuredFrames: measured,
      strength: 0,
      measuredSpeedMps: 20.8,
    });
    const expected = simulateBallFlight(
      { ...BIOMECH_TARGETS.soccer.baselineLaunch, speedMps: 20.8 },
      getSportProfile('soccer').ball,
    );
    expect(result.flight.rangeM).toBeCloseTo(expected.rangeM, 9);
    expect(result.notes[0]).toContain('Correction strength 0%');
    expect(result.notes.join('\n')).toContain('20.8 m/s');
  });

  it('emits one morphed frame per measured frame with sane target angles', () => {
    const measured = demoMeasuredFrames();
    const result = buildPerfectedResult({
      sport: 'soccer',
      measuredFrames: measured,
      strength: 0.5,
    });
    expect(result.morphedFrames).toHaveLength(measured.length);
    for (let i = 1; i < result.morphedFrames.length; i++) {
      expect(result.morphedFrames[i]!.timestampMs).toBeGreaterThan(
        result.morphedFrames[i - 1]!.timestampMs,
      );
    }
    for (const side of ['left', 'right'] as const) {
      for (const angle of Object.values(result.targetAngles[side])) {
        expect(Number.isFinite(angle)).toBe(true);
        expect(angle).toBeGreaterThan(0);
        expect(angle).toBeLessThanOrEqual(180);
      }
    }
    // The perfected knee target honors the cited contact window (the
    // expert contact pose encodes 158 deg; retargeting preserves it).
    expect(result.targetAngles.right.hipKnee).toBeGreaterThanOrEqual(140);
    expect(result.targetAngles.right.hipKnee).toBeLessThanOrEqual(165);
    // Citations surface in the coaching notes.
    expect(result.notes.join('\n')).toMatch(/Nunome/);
  });
});
