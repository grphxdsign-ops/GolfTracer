import { ClassicalBallDetector, detectorDefaultsForFps } from '../classicalDetector';
import { TfliteBallDetector } from '../tfliteDetector';
import { createDetector } from '../../../../adapters/detector';
import { makeFlight, mulberry32, renderFrame } from '../../testutils/syntheticFrames';
import type { VideoFrame } from '../../../../types/media';

describe('ClassicalBallDetector', () => {
  it('returns nothing until the background history is warm', async () => {
    const flight = makeFlight({ flightFrames: 10 });
    const detector = new ClassicalBallDetector();
    const first = await detector.detect(flight.frames[0]!);
    expect(first).toEqual([]);
  });

  it('detects a moving ball near ground truth on a gradient background', async () => {
    const flight = makeFlight({ flightFrames: 14 });
    const detector = new ClassicalBallDetector();
    const errors: number[] = [];
    for (const frame of flight.frames) {
      const obs = await detector.detect(frame);
      const truth = flight.truth.find((t) => t.frameIndex === frame.index);
      // Only judge frames a few steps after impact (ball clear of the tee
      // ghost and background fully warm).
      if (!truth || truth.frameIndex < flight.impactIndex + 2) continue;
      expect(obs.length).toBeGreaterThan(0);
      const best = obs[0]!;
      errors.push(Math.hypot(best.cx - truth.x, best.cy - truth.y));
      expect(best.radiusPx).toBeGreaterThan(2.5);
      expect(best.radiusPx).toBeLessThan(9);
      expect(best.confidence).toBeGreaterThan(0.3);
      expect(best.frameIndex).toBe(frame.index);
      expect(best.timestampMs).toBe(frame.timestampMs);
    }
    expect(errors.length).toBeGreaterThanOrEqual(10);
    for (const e of errors) expect(e).toBeLessThan(2);
  });

  it('does not fire on a static scene', async () => {
    const flight = makeFlight({ flightFrames: 0, preImpactFrames: 10 });
    const detector = new ClassicalBallDetector();
    for (const frame of flight.frames) {
      const obs = await detector.detect(frame);
      expect(obs).toEqual([]);
    }
  });

  it('rejects an elongated moving bar (low circularity)', async () => {
    const rng = mulberry32(42);
    const detector = new ClassicalBallDetector();
    for (let i = 0; i < 12; i++) {
      const frame = renderFrame({
        index: i,
        timestampMs: i * 10,
        width: 240,
        height: 160,
        rects: [{ x: 30 + i * 9, y: 60, w: 26, h: 3, luma: 235 }],
        noiseAmp: 2,
        rng,
      });
      const obs = await detector.detect(frame);
      expect(obs).toEqual([]);
    }
  });

  it('honors the ROI argument and offsets results back to frame coords', async () => {
    const flight = makeFlight({ flightFrames: 12 });
    const detector = new ClassicalBallDetector();
    const lastIdx = flight.frames.length - 1;
    for (let i = 0; i < lastIdx; i++) {
      await detector.detect(flight.frames[i]!);
    }
    const truth = flight.truth[flight.truth.length - 1]!;
    const roi = { x: truth.x - 30, y: truth.y - 30, w: 60, h: 60 };
    const obs = await detector.detect(flight.frames[lastIdx]!, roi);
    expect(obs.length).toBeGreaterThan(0);
    expect(Math.hypot(obs[0]!.cx - truth.x, obs[0]!.cy - truth.y)).toBeLessThan(2);

    // A far-away ROI must see nothing.
    detector.reset();
    for (let i = 0; i < lastIdx; i++) {
      await detector.detect(flight.frames[i]!);
    }
    const empty = await detector.detect(flight.frames[lastIdx]!, {
      x: 5,
      y: 5,
      w: 50,
      h: 50,
    });
    expect(empty).toEqual([]);
  });
});

describe('ClassicalBallDetector static background mode (field evidence #3)', () => {
  // 30 fps recreation of the measured failure: the ball recedes from the
  // camera, its image motion decaying from ~27 px/frame toward an asymptote
  // (hyperbolic-like deceleration, a couple px/frame late in flight). The
  // rolling 5-frame median forgets the empty scene and absorbs the slow ball;
  // a background frozen from 5 warmup frames of the empty scene keeps every
  // flight frame detectable.
  const WARMUP = 5;
  const speeds = [
    27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 8, 7, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1,
    1, 1,
  ];

  function decelClip(): { frames: VideoFrame[]; truth: { x: number; y: number }[] } {
    const rng = mulberry32(5);
    const dir = { x: 0.6, y: -0.8 };
    const start = { x: 95, y: 250 };
    const frames: VideoFrame[] = [];
    const truth: { x: number; y: number }[] = [];
    let cum = 0;
    for (let i = 0; i < WARMUP + speeds.length; i++) {
      const discs = [];
      if (i >= WARMUP) {
        cum += speeds[i - WARMUP]!;
        const p = { x: start.x + dir.x * cum, y: start.y + dir.y * cum };
        truth.push(p);
        discs.push({ cx: p.x, cy: p.y, r: 8, luma: 235 });
      }
      frames.push(
        renderFrame({
          index: i,
          timestampMs: i * 33.3,
          width: 480,
          height: 270,
          discs,
          noiseAmp: 2,
          rng,
        }),
      );
    }
    return { frames, truth };
  }

  const clip = decelClip();

  it('rolling background loses the decelerating ball late in flight', async () => {
    const detector = new ClassicalBallDetector();
    const lateErrors: number[] = [];
    for (let i = 0; i < clip.frames.length; i++) {
      const obs = await detector.detect(clip.frames[i]!);
      if (i < clip.frames.length - 5) continue;
      // Last 5 flight frames (2 then 1 px/frame): the ball overlaps its own
      // rolling history, the median absorbs its trailing half, and detections
      // first drift off the centroid, then vanish.
      const t = clip.truth[i - WARMUP]!;
      for (const o of obs) {
        lateErrors.push(Math.hypot(o.cx - t.x, o.cy - t.y));
      }
      if (i >= clip.frames.length - 3) {
        expect(obs).toEqual([]);
      }
    }
    for (const e of lateErrors) expect(e).toBeGreaterThan(2);
  });

  it('frozen static background detects every flight frame within 2px', async () => {
    const detector = new ClassicalBallDetector({ backgroundMode: 'static' });
    for (let i = 0; i < clip.frames.length; i++) {
      const obs = await detector.detect(clip.frames[i]!);
      if (i < WARMUP) {
        expect(obs).toEqual([]);
        continue;
      }
      expect(obs.length).toBeGreaterThan(0);
      const t = clip.truth[i - WARMUP]!;
      expect(Math.hypot(obs[0]!.cx - t.x, obs[0]!.cy - t.y)).toBeLessThan(2);
    }
  });

  it('staticRefreshAlpha > 0 absorbs a scene change; alpha 0 keeps flagging it', async () => {
    // A ball-like object appears at rest after the background is frozen (a
    // disc, not a rect, so it passes the shape gates and would be flagged).
    const rng = mulberry32(11);
    const frames: VideoFrame[] = [];
    for (let i = 0; i < 30; i++) {
      const discs = i >= 5 ? [{ cx: 300, cy: 100, r: 5, luma: 235 }] : [];
      frames.push(
        renderFrame({
          index: i,
          timestampMs: i * 33.3,
          width: 480,
          height: 270,
          discs,
          noiseAmp: 2,
          rng,
        }),
      );
    }
    const frozen = new ClassicalBallDetector({ backgroundMode: 'static' });
    const refreshing = new ClassicalBallDetector({
      backgroundMode: 'static',
      staticRefreshAlpha: 0.25,
    });
    for (let i = 0; i < frames.length; i++) {
      const flaggedFrozen = (await frozen.detect(frames[i]!)).length > 0;
      const flaggedRefreshing = (await refreshing.detect(frames[i]!)).length > 0;
      if (i < 5) continue;
      // Fully frozen: the new object contrasts with the model forever.
      expect(flaggedFrozen).toBe(true);
      // EWMA refresh: flagged at first, absorbed within ~10 frames.
      if (i === 5) expect(flaggedRefreshing).toBe(true);
      if (i >= 20) expect(flaggedRefreshing).toBe(false);
    }
  });

  it('reset() and frame-dimension changes discard the model and re-warm', async () => {
    const detector = new ClassicalBallDetector({
      backgroundMode: 'static',
      staticWarmupFrames: 3,
    });
    const rng = mulberry32(9);
    const small = (i: number, withBall: boolean) =>
      renderFrame({
        index: i,
        timestampMs: i * 33.3,
        width: 240,
        height: 160,
        discs: withBall ? [{ cx: 120, cy: 80, r: 5, luma: 235 }] : [],
        noiseAmp: 2,
        rng,
      });
    const big = (i: number, withBall: boolean) =>
      renderFrame({
        index: i,
        timestampMs: i * 33.3,
        width: 480,
        height: 270,
        discs: withBall ? [{ cx: 240, cy: 135, r: 5, luma: 235 }] : [],
        noiseAmp: 2,
        rng,
      });

    // Warm and freeze at 240x160, then detect.
    for (let i = 0; i < 3; i++) {
      expect(await detector.detect(small(i, false))).toEqual([]);
    }
    expect((await detector.detect(small(3, true))).length).toBeGreaterThan(0);

    // Dimension change: the frozen model is discarded and re-warmed, so the
    // ball is invisible until 3 new-size frames have been accumulated.
    expect(await detector.detect(big(4, true))).toEqual([]);
    expect(await detector.detect(big(5, false))).toEqual([]);
    expect(await detector.detect(big(6, false))).toEqual([]);
    expect((await detector.detect(big(7, true))).length).toBeGreaterThan(0);

    // reset(): same re-warm behavior at an unchanged size.
    detector.reset();
    expect(await detector.detect(big(8, false))).toEqual([]);
    expect(await detector.detect(big(9, false))).toEqual([]);
    expect(await detector.detect(big(10, false))).toEqual([]);
    expect((await detector.detect(big(11, true))).length).toBeGreaterThan(0);
  });
});

describe('detectorDefaultsForFps', () => {
  it('selects the static background at normal capture rates', () => {
    expect(detectorDefaultsForFps(30)).toEqual({ backgroundMode: 'static' });
    expect(detectorDefaultsForFps(60)).toEqual({ backgroundMode: 'static' });
  });

  it('keeps the rolling default for high-fps slow-mo', () => {
    expect(detectorDefaultsForFps(120)).toEqual({});
    expect(detectorDefaultsForFps(240)).toEqual({});
  });
});

describe('TfliteBallDetector stub', () => {
  it('rejects with a device-runtime error', async () => {
    const detector = new TfliteBallDetector();
    const frame = renderFrame({
      index: 0,
      timestampMs: 0,
      width: 8,
      height: 8,
    });
    await expect(detector.detect(frame)).rejects.toThrow('device runtime');
  });
});

describe('createDetector factory', () => {
  it('creates detectors by kind', () => {
    expect(createDetector()).toBeInstanceOf(ClassicalBallDetector);
    expect(createDetector('classical')).toBeInstanceOf(ClassicalBallDetector);
    expect(createDetector('tflite')).toBeInstanceOf(TfliteBallDetector);
  });
});
