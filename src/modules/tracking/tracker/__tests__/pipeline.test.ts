import { gradeTrack, runTracking } from '../pipeline';
import {
  makeFlight,
  makeFrameSource,
} from '../../testutils/syntheticFrames';

jest.setTimeout(60000);

describe('runTracking (full pipeline on a synthetic 60-frame flight)', () => {
  const flight = makeFlight();
  const frameSource = makeFrameSource(flight.frames);
  const progress: number[] = [];
  let resultPromise: ReturnType<typeof runTracking> | null = null;

  const getResult = () => {
    resultPromise ??= runTracking(frameSource, {
      onProgress: (p) => progress.push(p),
    });
    return resultPromise;
  };

  it('recovers ≥90% of flight positions within 3px', async () => {
    const { track } = await getResult();
    expect(track.quality).toBe('high');

    const byTs = new Map(track.smoothedPath.map((p) => [Math.round(p.timestampMs), p]));
    let recovered = 0;
    for (const truth of flight.truth) {
      const p = byTs.get(Math.round(truth.timestampMs));
      if (p && Math.hypot(p.x - truth.x, p.y - truth.y) <= 3) {
        recovered++;
      }
    }
    expect(recovered / flight.truth.length).toBeGreaterThanOrEqual(0.9);
  });

  it('finds impact within ±1 frame and a plausible apex', async () => {
    const { track } = await getResult();
    expect(Math.abs(track.impactFrameIndex - flight.impactIndex)).toBeLessThanOrEqual(1);

    const truthApex = flight.truth.reduce((a, b) => (b.y < a.y ? b : a));
    const apex = track.smoothedPath[track.apexPointIndex]!;
    expect(Math.abs(apex.y - truthApex.y)).toBeLessThan(4);
    expect(Math.abs(apex.timestampMs - truthApex.timestampMs)).toBeLessThan(
      3 * (1000 / flight.spec.fps),
    );
  });

  it('detects landing on the descent near launch height', async () => {
    const { track } = await getResult();
    expect(track.landingPointIndex).toBeDefined();
    const landing = track.smoothedPath[track.landingPointIndex!]!;
    // Landing is anchored to the seed height (first detection, ~1-2 frames
    // after impact), so allow a launch-speed frame of slack below launch y.
    expect(landing.y).toBeGreaterThan(flight.spec.launch.y - 35);
    const apex = track.smoothedPath[track.apexPointIndex]!;
    expect(landing.timestampMs).toBeGreaterThan(apex.timestampMs);
  });

  it('builds a monotone tracer scaled to the native resolution', async () => {
    const { tracer, track } = await getResult();
    expect(tracer.points.length).toBeLessThanOrEqual(120);
    expect(tracer.points.length).toBeGreaterThan(30);
    for (let i = 1; i < tracer.points.length; i++) {
      expect(tracer.points[i]!.timestampMs).toBeGreaterThan(
        tracer.points[i - 1]!.timestampMs,
      );
    }
    // Synthetic asset is already at analysis resolution → scale 1.
    expect(track.frameWidth).toBe(flight.spec.width);
    const apex = tracer.points[tracer.apexIndex]!;
    for (const p of tracer.points) {
      expect(apex.y).toBeLessThanOrEqual(p.y);
    }
  });

  it('reports monotone progress ending at 1', async () => {
    await getResult();
    expect(progress.length).toBeGreaterThan(5);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]!).toBeGreaterThanOrEqual(progress[i - 1]!);
    }
    expect(progress[progress.length - 1]).toBe(1);
  });
});

describe('runTracking failure paths', () => {
  it('grades a track lost right after impact as failed', async () => {
    // Ball visible for only 8 flight steps, then gone for good.
    const occluded: number[] = [];
    for (let s = 9; s <= 40; s++) occluded.push(s);
    const flight = makeFlight({
      flightFrames: 40,
      occludedSteps: occluded,
      seed: 5,
    });
    const { track } = await runTracking(makeFrameSource(flight.frames));
    expect(track.quality).toBe('failed');
  });

  it('grades a static video (no ball flight) as failed', async () => {
    const still = makeFlight({ flightFrames: 0, preImpactFrames: 40, seed: 6 });
    const { track } = await runTracking(makeFrameSource(still.frames));
    expect(track.quality).toBe('failed');
    expect(track.observations.length).toBeLessThan(5);
  });

  it('throws on videos too short to analyze', async () => {
    const tiny = makeFlight({ preImpactFrames: 2, flightFrames: 2 });
    await expect(runTracking(makeFrameSource(tiny.frames))).rejects.toThrow(
      'too short',
    );
  });
});

describe('gradeTrack thresholds', () => {
  it('fails empty or barely-observed tracks', () => {
    expect(gradeTrack(0, 0, 'idle')).toBe('failed');
    expect(gradeTrack(4, 40, 'confirmed')).toBe('failed');
  });

  it('fails tracks lost <15 frames after impact', () => {
    expect(gradeTrack(10, 14, 'lost')).toBe('failed');
    expect(gradeTrack(9, 15, 'lost')).toBe('low');
  });

  it('grades by observed ratio: high >85%, medium >65%, else low', () => {
    expect(gradeTrack(86, 100, 'landed')).toBe('high');
    expect(gradeTrack(85, 100, 'landed')).toBe('medium');
    expect(gradeTrack(66, 100, 'landed')).toBe('medium');
    expect(gradeTrack(65, 100, 'landed')).toBe('low');
    expect(gradeTrack(20, 100, 'confirmed')).toBe('low');
  });
});
