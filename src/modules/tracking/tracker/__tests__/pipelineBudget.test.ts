/**
 * Time-budget adaptation (DESIGN §12): runTracking must finish inside
 * `timeBudgetMs` by striding the pull past the 2 s prefix, stopping the
 * tracking loop at 92%, and skipping/shrinking the offline fallback — all
 * without inflating the quality grade. The clock is injected and advanced by
 * synthetic slow stages, so every scenario is deterministic on any machine.
 */
import { runTracking } from '../pipeline';
import { makeFlight, makeFrameSource } from '../../testutils/syntheticFrames';
import { createDetector } from '../../../../adapters/detector';
import type { FrameSource } from '../../../../types/media';
import type { BallDetector } from '../../../../types/tracking';

jest.setTimeout(120000);

interface FakeClock {
  now: () => number;
  advanceBy: (ms: number) => void;
}

function makeClock(): FakeClock {
  let now = 0;
  return {
    now: () => now,
    advanceBy: (ms: number) => {
      now += ms;
    },
  };
}

/** FrameSource whose pull advances the fake clock per frame yielded. */
function slowSource(
  source: FrameSource,
  clock: FakeClock,
  msPerFrame: number,
): FrameSource {
  return {
    asset: source.asset,
    frameAt: source.frameAt.bind(source),
    async *frames(options) {
      for await (const frame of source.frames(options)) {
        clock.advanceBy(msPerFrame);
        yield frame;
      }
    },
  };
}

/** BallDetector whose every detect advances the fake clock. */
function slowDetector(clock: FakeClock, msPerDetect: number): BallDetector {
  const inner = createDetector('classical', {});
  return {
    detect: (frame, roi) => {
      clock.advanceBy(msPerDetect);
      return inner.detect(frame, roi);
    },
  };
}

// 30 fps, 3.9 s clip whose ball stays airborne well past the 2 s un-strided
// prefix (apex y = 25 at t = 50, landing near t = 99), so striding visibly
// thins the tracked tail.
const LONG_SLOW_FLIGHT = {
  fps: 30,
  preImpactFrames: 12,
  flightFrames: 105,
  launch: { x: 130, y: 225 },
  velocity: { vx: 3, vy: 8 },
  gravity: 0.16,
  seed: 11,
};

describe('runTracking time budget: frame-pull striding', () => {
  it('strides beyond the 2 s prefix when the pull pace projects past budget', async () => {
    const flight = makeFlight(LONG_SLOW_FLIGHT);
    const frameMs = 1000 / flight.spec.fps;

    // 14 ms/frame × 117 frames projects ~1.6 s of pull — over 45% of a 3 s
    // budget, so striding must kick in at the first 24-frame check.
    const budgetedClock = makeClock();
    const budgeted = await runTracking(
      slowSource(makeFrameSource(flight.frames), budgetedClock, 14),
      { timeBudgetMs: 3000, clock: budgetedClock.now },
    );

    // Same slow source, generous budget: nothing projects over, no striding.
    const generousClock = makeClock();
    const generous = await runTracking(
      slowSource(makeFrameSource(flight.frames), generousClock, 14),
      { timeBudgetMs: 60000, clock: generousClock.now },
    );

    // Striding consumed fewer frames: the tracked path thins in the tail.
    expect(generous.track.quality).toBe('high');
    expect(budgeted.track.smoothedPath.length).toBeLessThan(
      generous.track.smoothedPath.length - 10,
    );

    // Kept frames ride their real timestamps: beyond the prefix consecutive
    // points sit ~2 frame intervals apart; the generous run never skips.
    const gapsAfterPrefix = (points: { timestampMs: number }[]) => {
      const gaps: number[] = [];
      for (let i = 1; i < points.length; i++) {
        if (points[i]!.timestampMs >= 2000) {
          gaps.push(points[i]!.timestampMs - points[i - 1]!.timestampMs);
        }
      }
      return gaps;
    };
    const budgetedGaps = gapsAfterPrefix(budgeted.track.smoothedPath);
    const generousGaps = gapsAfterPrefix(generous.track.smoothedPath);
    expect(Math.max(...budgetedGaps)).toBeGreaterThan(1.8 * frameMs);
    expect(Math.max(...generousGaps)).toBeLessThan(1.2 * frameMs);

    // The strided run still followed the flight deep into its tail and the
    // grade stays honest — every kept frame was actually observed.
    expect(budgeted.track.quality).toBe('high');
    const lastBudgeted =
      budgeted.track.smoothedPath[budgeted.track.smoothedPath.length - 1]!;
    expect(lastBudgeted.timestampMs).toBeGreaterThan(3000);
  });
});

describe('runTracking time budget: offline fallback gating', () => {
  // Online seeding is sabotaged (impossible seed confidence), so only the
  // offline fallback can rescue the track — making its skip observable.
  const noSeed = { tracker: { minSeedConfidence: 5 } };

  it('runs the fallback rescue when budget remains', async () => {
    const flight = makeFlight({ fps: 30, seed: 21 });
    const { track } = await runTracking(makeFrameSource(flight.frames), {
      ...noSeed,
      clock: () => 0,
    });
    expect(track.quality).not.toBe('failed');
    expect(track.observations.length).toBeGreaterThanOrEqual(6);
  });

  it('skips the fallback and reports failed when the budget is spent', async () => {
    const flight = makeFlight({ fps: 30, seed: 21 });
    // 40 ms/frame × 72 frames = 2.88 s of pull: past the 92% tracking stop
    // and leaving under 25% of budget, so the rescue must not run.
    const clock = makeClock();
    const { track } = await runTracking(
      slowSource(makeFrameSource(flight.frames), clock, 40),
      { ...noSeed, timeBudgetMs: 3000, clock: clock.now },
    );
    expect(track.quality).toBe('failed');
    expect(track.observations.length).toBe(0);
  });
});

describe('runTracking time budget: generous budget is a no-op', () => {
  it('returns results identical to an unbudgeted run', async () => {
    const flight = makeFlight({ seed: 31 });

    const unbudgeted = await runTracking(makeFrameSource(flight.frames), {
      clock: () => 0,
    });

    const clock = makeClock();
    const budgeted = await runTracking(
      slowSource(makeFrameSource(flight.frames), clock, 25),
      { timeBudgetMs: 600000, clock: clock.now },
    );

    expect(budgeted.track).toEqual(unbudgeted.track);
    expect(budgeted.tracer).toEqual(unbudgeted.tracer);
  });
});

describe('runTracking time budget: early tracking stop grades honestly', () => {
  it('grades a cleanly-observed partial track high but truncated', async () => {
    const flight = makeFlight({ seed: 41 });
    // 100 ms per detect: warm-up spends 600 ms, then ~22 steps fit before
    // the 92% stop — the flight is cut mid-air.
    const clock = makeClock();
    const { track } = await runTracking(makeFrameSource(flight.frames), {
      detector: slowDetector(clock, 100),
      timeBudgetMs: 3000,
      clock: clock.now,
    });

    expect(track.quality).toBe('high');
    expect(track.smoothedPath.length).toBeGreaterThanOrEqual(5);
    expect(track.smoothedPath.length).toBeLessThanOrEqual(30);
    // Truncated, not padded: the path ends far before the flight does, and
    // no landing is fabricated for frames never analyzed.
    const lastTruth = flight.truth[flight.truth.length - 1]!;
    const last = track.smoothedPath[track.smoothedPath.length - 1]!;
    expect(last.timestampMs).toBeLessThan(lastTruth.timestampMs - 100);
    expect(track.landingPointIndex).toBeUndefined();
  });

  it('grades a stop with almost nothing tracked as failed, never inflated', async () => {
    const flight = makeFlight({ seed: 41 });
    // 300 ms per detect: warm-up spends 1.8 s and only ~4 steps fit.
    const clock = makeClock();
    const { track } = await runTracking(makeFrameSource(flight.frames), {
      detector: slowDetector(clock, 300),
      timeBudgetMs: 3000,
      clock: clock.now,
    });

    expect(track.observations.length).toBeLessThan(5);
    expect(track.quality).toBe('failed');
  });
});
